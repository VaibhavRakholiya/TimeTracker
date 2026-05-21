/**
 * FlowBoard — Project Tasks (list) Module
 * Renders the project task list with filters and status grouping.
 */

const Board = (() => {
    let _currentProjectId = null;
    let _filterDue        = false;
    let _filterStatus     = null; // null => first column (To Do); 'all' => show all statuses
    let _listDragTaskId   = null;
    let _listDragFromHandle = false;

    function getFirstColumnId(columns) {
        const sorted = [...columns].sort((a, b) => a.position - b.position);
        return sorted[0]?.id || 'all';
    }

    function getEffectiveFilterStatus(columns) {
        if (_filterStatus === 'all') return 'all';
        if (_filterStatus && columns.some(c => c.id === _filterStatus)) return _filterStatus;
        return getFirstColumnId(columns);
    }

    function escHtml(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function applyTaskFilters(tasks, columns) {
        if (_filterDue) {
            const now = Date.now();
            tasks = tasks.filter(t => {
                if (!t.dueDate) return false;
                const diff = (new Date(t.dueDate + 'T00:00:00') - now) / 86400000;
                return diff <= 7;
            });
        }
        const effectiveStatus = getEffectiveFilterStatus(columns);
        if (effectiveStatus !== 'all') {
            const defaultColId = getFirstColumnId(columns);
            tasks = tasks.filter(t => (t.columnId || defaultColId) === effectiveStatus);
        }
        return tasks;
    }

    function syncStatusFilterUI(proj) {
        const wrap    = document.getElementById('boardStatusFilterWrap');
        const toolbar = document.getElementById('boardViewToolbar');
        const group   = document.getElementById('boardStatusFilterGroup');
        if (!wrap || !group) return;

        const show = !!proj;
        wrap.hidden = !show;
        toolbar?.classList.toggle('has-status-filter', show);
        if (!show) return;

        const columns = [...proj.columns].sort((a, b) => a.position - b.position);
        const effectiveStatus = getEffectiveFilterStatus(columns);

        const chips = [
            `<button type="button" class="filter-chip${_filterStatus === 'all' ? ' active' : ''}" data-status="all">All</button>`,
            ...columns.map(c => `<button type="button" class="filter-chip${effectiveStatus === c.id && _filterStatus !== 'all' ? ' active' : ''}" data-status="${escHtml(c.id)}">
                <span class="status-dot" style="background:${escHtml(c.color)};"></span>${escHtml(c.name)}
            </button>`),
        ];
        group.innerHTML = chips.join('');
    }

    function render(projectId) {
        _currentProjectId = projectId;

        const container = document.getElementById('boardContainer');
        if (!container) return;

        const proj = projectId ? State.Projects.get(projectId) : null;
        const titleEl = document.getElementById('boardViewTitle');
        const subtitleEl = document.getElementById('boardViewSubtitle');
        if (titleEl) titleEl.textContent = proj ? proj.name : 'Tasks';
        if (subtitleEl) subtitleEl.textContent = proj ? 'Task list' : 'Select a project';

        container.classList.add('board-list-mode');

        if (!projectId || !proj) {
            syncStatusFilterUI(null);
            container.innerHTML = `<div class="empty-state" style="flex:1;">
                <div class="empty-state-icon"><i class="fa-solid fa-list"></i></div>
                <div class="empty-state-title">No project selected</div>
                <div class="empty-state-desc">Choose a project from the sidebar to view its tasks.</div>
                <button class="btn btn-primary" onclick="Projects.openModal()">
                    <i class="fa-solid fa-plus"></i> New Project
                </button>
            </div>`;
            return;
        }

        syncStatusFilterUI(proj);
        renderList(projectId, proj, container);
    }

    function renderList(projectId, proj, container) {
        const columns = [...proj.columns].sort((a, b) => a.position - b.position);
        let tasks = applyTaskFilters(State.Tasks.byProject(projectId), columns);

        const tasksByCol = {};
        columns.forEach(c => { tasksByCol[c.id] = []; });
        tasks.forEach(t => {
            const colId = t.columnId || columns[0]?.id;
            if (tasksByCol[colId] !== undefined) tasksByCol[colId].push(t);
            else if (columns[0]) tasksByCol[columns[0].id].push(t);
        });
        Object.values(tasksByCol).forEach(arr => arr.sort((a, b) => a.position - b.position));

        if (!tasks.length) {
            container.innerHTML = `<div class="empty-state" style="flex:1;">
                <div class="empty-state-icon"><i class="fa-solid fa-list"></i></div>
                <div class="empty-state-title">No tasks</div>
                <div class="empty-state-desc">No tasks match the current filters, or the project is empty.</div>
                <button class="btn btn-primary" onclick="Tasks.openModal(null, { projectId: ${projectId} })">
                    <i class="fa-solid fa-plus"></i> Add task
                </button>
            </div>`;
            return;
        }

        let body = '';
        columns.forEach(col => {
            const colTasks = tasksByCol[col.id] || [];
            if (!colTasks.length) return;

            body += `<tr class="board-list-group"><td colspan="7">
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="width:8px;height:8px;border-radius:50%;background:${escHtml(col.color)};flex-shrink:0;"></span>
                    <span style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-tertiary);">${escHtml(col.name)}</span>
                    <span style="font-size:13px;color:var(--text-disabled);">${colTasks.length}</span>
                </div>
            </td></tr>`;

            colTasks.forEach(t => {
                const due = Tasks.formatDueDate(t.dueDate);
                const done = Tasks.isDoneColumn(t);
                const running = t.isTimerRunning;
                const labelHtml = (t.labels || []).length
                    ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">${(t.labels || []).map(lid => {
                        const lbl = State.Labels.getAll().find(l => l.id === lid)
                            || (proj.labels || []).find(l => l.id === lid);
                        return lbl ? `<span class="label-chip" style="background:${lbl.bg || 'rgba(99,102,241,0.1)'};color:${lbl.color};">${escHtml(lbl.name)}</span>` : '';
                    }).join('')}`
                    : '';

                body += `<tr class="list-task-row" data-task-id="${t.id}" data-column-id="${escHtml(col.id)}" draggable="true">
                    <td class="list-drag-cell">
                        <span class="list-task-drag-handle" title="Drag to reorder">
                            <i class="fa-solid fa-grip-vertical"></i>
                        </span>
                    </td>
                    <td>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <span style="font-weight:500;${done ? 'text-decoration:line-through;color:var(--text-tertiary);' : ''}">${escHtml(t.title)}</span>
                        </div>
                        ${labelHtml}
                    </td>
                    <td>
                        <select class="form-control list-col-select" data-task-id="${t.id}"
                            style="min-width:140px;padding:4px 28px 4px 8px;font-size:14px;"
                            onclick="event.stopPropagation()">
                            ${columns.map(c =>
                                `<option value="${escHtml(c.id)}"${c.id === t.columnId ? ' selected' : ''}>${escHtml(c.name)}</option>`
                            ).join('')}
                        </select>
                    </td>
                    <td>${t.assignee ? `<div style="display:flex;align-items:center;gap:6px;"><div class="task-card-assignee" style="width:22px;height:22px;font-size:12px;">${(t.assignee || '?')[0].toUpperCase()}</div><span style="font-size:14px;color:var(--text-secondary);">${escHtml(t.assignee)}</span></div>` : '<span class="text-muted">—</span>'}</td>
                    <td>${due ? `<span class="due-date-chip ${due.cls}">${due.text}</span>` : '<span class="text-muted">—</span>'}</td>
                    <td style="font-size:14px;color:var(--text-secondary);">${t.timeSpent > 0 ? Tasks.formatHours(t.timeSpent) : '—'}</td>
                    <td>
                        <button type="button" class="task-card-timer${running ? ' running' : ''}" data-timer-task="${t.id}"
                            title="${running ? 'Stop timer' : 'Start timer'}"
                            onclick="event.stopPropagation(); State.Timer.toggle(${t.id});">
                            <i class="fa-solid ${running ? 'fa-stop' : 'fa-play'}"></i>
                        </button>
                    </td>
                </tr>`;
            });
        });

        container.innerHTML = `
            <table class="board-list-table">
                <thead><tr>
                    <th class="list-drag-cell" aria-label="Reorder"></th>
                    <th>Task</th>
                    <th>Status</th>
                    <th>Assignee</th>
                    <th>Due</th>
                    <th>Time</th>
                    <th style="width:44px;"></th>
                </tr></thead>
                <tbody>${body}</tbody>
            </table>
            <div style="margin-top:var(--sp-3);display:flex;gap:var(--sp-2);flex-wrap:wrap;">
                <button type="button" class="add-task-inline" id="listViewAddTask" style="width:auto;">
                    <i class="fa-solid fa-plus"></i> Add task
                </button>
                <button type="button" class="btn btn-secondary btn-sm" id="listViewEditColumns">
                    <i class="fa-solid fa-sliders"></i> Columns
                </button>
            </div>`;

        attachListDragEvents(container.querySelectorAll('.list-task-row'), projectId, proj);

        container.querySelectorAll('.list-task-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('.list-col-select') || e.target.closest('[data-timer-task]')
                    || e.target.closest('.list-task-drag-handle')) return;
                UI.openTaskPanel(parseInt(row.dataset.taskId, 10));
            });
        });

        container.querySelectorAll('.list-col-select').forEach(sel => {
            sel.addEventListener('change', (e) => {
                e.stopPropagation();
                const taskId = parseInt(sel.dataset.taskId, 10);
                const newCol = sel.value;
                const task = State.Tasks.get(taskId);
                if (!task || task.columnId === newCol) return;

                const col = proj.columns.find(c => c.id === newCol);
                if (col && col.wipLimit) {
                    const count = State.Tasks.byProject(projectId)
                        .filter(t => t.columnId === newCol && t.id !== taskId).length;
                    if (count >= col.wipLimit) {
                        UI.toast(`WIP limit (${col.wipLimit}) reached for "${col.name}"`, 'warning');
                        sel.value = task.columnId;
                        return;
                    }
                }
                State.Tasks.update(taskId, { columnId: newCol });
                render(projectId);
                if (UI.isTaskPanelOpen(taskId)) UI.openTaskPanel(taskId);
            });
        });

        document.getElementById('listViewAddTask')?.addEventListener('click', () => {
            Tasks.openModal(null, { projectId });
        });
        document.getElementById('listViewEditColumns')?.addEventListener('click', () => {
            Projects.openModal(projectId);
        });
    }

    function attachListDragEvents(rows, projectId, proj) {
        rows.forEach(row => {
            const handle = row.querySelector('.list-task-drag-handle');
            handle?.addEventListener('mousedown', () => { _listDragFromHandle = true; });
            handle?.addEventListener('mouseup', () => {
                if (!row.classList.contains('list-task-dragging')) _listDragFromHandle = false;
            });

            row.addEventListener('dragstart', (e) => {
                if (!_listDragFromHandle) {
                    e.preventDefault();
                    return;
                }
                _listDragTaskId = parseInt(row.dataset.taskId, 10);
                row.classList.add('list-task-dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(_listDragTaskId));
            });

            row.addEventListener('dragend', () => {
                _listDragFromHandle = false;
                _listDragTaskId = null;
                row.classList.remove('list-task-dragging');
                document.querySelectorAll('.list-task-row').forEach(r => {
                    r.classList.remove('list-drag-over-top', 'list-drag-over-bottom');
                });
            });

            row.addEventListener('dragover', (e) => {
                if (!_listDragTaskId) return;
                const targetId = parseInt(row.dataset.taskId, 10);
                if (_listDragTaskId === targetId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const rect  = row.getBoundingClientRect();
                const isTop = e.clientY < rect.top + rect.height / 2;
                row.classList.toggle('list-drag-over-top', isTop);
                row.classList.toggle('list-drag-over-bottom', !isTop);
            });

            row.addEventListener('dragleave', () => {
                row.classList.remove('list-drag-over-top', 'list-drag-over-bottom');
            });

            row.addEventListener('drop', (e) => {
                e.preventDefault();
                row.classList.remove('list-drag-over-top', 'list-drag-over-bottom');
                const targetId = parseInt(row.dataset.taskId, 10);
                if (!_listDragTaskId || _listDragTaskId === targetId) return;

                const dragTask   = State.Tasks.get(_listDragTaskId);
                const targetTask = State.Tasks.get(targetId);
                if (!dragTask || !targetTask) return;

                const rect  = row.getBoundingClientRect();
                const isTop = e.clientY < rect.top + rect.height / 2;
                const newPos = isTop ? targetTask.position - 0.5 : targetTask.position + 0.5;
                const updates = { position: newPos };

                const newColId = targetTask.columnId;
                if (newColId && dragTask.columnId !== newColId) {
                    const col = proj.columns.find(c => c.id === newColId);
                    if (col?.wipLimit) {
                        const count = State.Tasks.byProject(projectId)
                            .filter(t => t.columnId === newColId && t.id !== _listDragTaskId).length;
                        if (count >= col.wipLimit) {
                            UI.toast(`WIP limit (${col.wipLimit}) reached for "${col.name}"`, 'warning');
                            return;
                        }
                    }
                    updates.columnId = newColId;
                }

                State.Tasks.update(_listDragTaskId, updates);
                render(projectId);
            });
        });
    }

    function initFilters() {
        document.getElementById('boardFilterDue')?.addEventListener('click', (e) => {
            _filterDue = !_filterDue;
            e.currentTarget.classList.toggle('active', _filterDue);
            if (_currentProjectId) render(_currentProjectId);
        });

        document.getElementById('boardStatusFilterGroup')?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-status]');
            if (!btn) return;
            _filterStatus = btn.dataset.status;
            document.querySelectorAll('#boardStatusFilterGroup .filter-chip').forEach(b => {
                b.classList.toggle('active', b === btn);
            });
            if (_currentProjectId) render(_currentProjectId);
        });
    }

    function init() {
        initFilters();

        State.on('tasks:changed', () => {
            const { view, projectId } = Router.getCurrent();
            if (view === 'board') render(projectId);
        });

        State.on('projects:changed', () => {
            const { view, projectId } = Router.getCurrent();
            if (view === 'board') render(projectId);
        });

        State.on('timer:tick', ({ taskId }) => {
            const btns = document.querySelectorAll(`[data-timer-task="${taskId}"]`);
            btns.forEach(btn => {
                btn.classList.add('running');
                const icon = btn.querySelector('i');
                if (icon) icon.className = 'fa-solid fa-stop';
            });
        });

        State.on('timer:stopped', (taskId) => {
            const btns = document.querySelectorAll(`[data-timer-task="${taskId}"]`);
            btns.forEach(btn => {
                btn.classList.remove('running');
                const icon = btn.querySelector('i');
                if (icon) icon.className = 'fa-solid fa-play';
            });
        });
    }

    return { init, render };
})();

window.Board = Board;
