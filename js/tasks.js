/**
 * FlowBoard — Tasks Module
 * Task modal (create/edit), My Tasks view, task list rendering helpers,
 * and shared task card/row builder functions used by Board and Backlog.
 */

const Tasks = (() => {
    let _editingTaskId = null;
    let _defaultColumn = null;
    let _defaultProject = null;
    let _myTasksFilter  = 'all';
    let _myTasksGroupBy = 'dueDate';

    const MY_TASKS_DUE_GROUPS = [
        { id: 'overdue',   label: 'Overdue' },
        { id: 'today',     label: 'Today' },
        { id: 'tomorrow',  label: 'Tomorrow' },
        { id: 'week',      label: 'This week' },
        { id: 'later',     label: 'Later' },
    ];

    // ── Public helpers ────────────────────────────────────
    function formatDueDate(dateStr) {
        if (!dateStr) return null;
        const due  = new Date(dateStr + 'T00:00:00');
        const now  = new Date();
        const today= new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const dueD = new Date(due.getFullYear(), due.getMonth(), due.getDate());
        const diff = Math.round((dueD - today) / 86400000);

        if (diff < 0)  return { text: `${Math.abs(diff)}d overdue`, cls: 'overdue' };
        if (diff === 0) return { text: 'Today',                     cls: 'today'   };
        if (diff <= 7)  return { text: `${diff}d`,                  cls: 'soon'    };
        return { text: due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), cls: '' };
    }

    function formatTime(seconds) {
        if (!seconds || seconds < 0) return '0h 0m';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
    }

    function formatHours(hours) {
        if (!hours) return '0h';
        const h = Math.floor(hours);
        const m = Math.round((hours - h) * 60);
        if (m > 0) return `${h}h ${m}m`;
        return `${h}h`;
    }

    function formatElapsed(ms) {
        const s = Math.floor(ms / 1000);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    }

    function escHtml(str) {
        return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    const DESC_ALLOWED_TAGS = new Set([
        'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE',
        'UL', 'OL', 'LI', 'P', 'BR', 'A', 'DIV',
    ]);

    function normalizeDescription(text) {
        if (!text) return '';
        return String(text).replace(/^\s+/, '').replace(/\s+$/, '');
    }

    function sanitizeDescriptionHtml(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');

        function walk(node) {
            const children = [...node.childNodes];
            for (const child of children) {
                if (child.nodeType === Node.TEXT_NODE) continue;
                if (child.nodeType !== Node.ELEMENT_NODE) {
                    node.removeChild(child);
                    continue;
                }
                if (!DESC_ALLOWED_TAGS.has(child.tagName)) {
                    while (child.firstChild) node.insertBefore(child.firstChild, child);
                    node.removeChild(child);
                    walk(node);
                    return;
                }
                [...child.attributes].forEach(attr => {
                    if (child.tagName === 'A' && attr.name === 'href') {
                        const href = attr.value.trim();
                        if (!/^https?:\/\//i.test(href)) child.removeAttribute('href');
                    } else {
                        child.removeAttribute(attr.name);
                    }
                });
                walk(child);
            }
        }

        walk(doc.body);
        return doc.body.innerHTML.trim();
    }

    function descriptionHasFormatting(html) {
        const probe = document.createElement('div');
        probe.innerHTML = html;
        return !!probe.querySelector('b, strong, i, em, u, s, strike, ul, ol, a');
    }

    function setDescriptionElement(el, stored) {
        if (!el) return;
        if (!stored) {
            el.innerHTML = '';
            return;
        }
        if (/<[a-z][\s\S]*>/i.test(stored)) {
            el.innerHTML = sanitizeDescriptionHtml(stored);
        } else {
            el.textContent = stored;
        }
    }

    function getDescriptionFromElement(el) {
        if (!el) return '';
        const raw = el.innerHTML.trim();
        if (!raw || raw === '<br>') return '';

        const sanitized = sanitizeDescriptionHtml(raw);
        if (!descriptionHasFormatting(sanitized)) {
            return normalizeDescription((el.innerText || '').replace(/\r\n/g, '\n'));
        }
        return normalizeDescription(sanitized);
    }

    function labelChip(labelId, labels) {
        const allLabels = labels || State.Labels.getAll();
        const label = allLabels.find(l => l.id === labelId);
        if (!label) return '';
        return `<span class="label-chip" style="background:${label.bg || 'var(--primary-subtle)'};color:${label.color};">${escHtml(label.name)}</span>`;
    }

    function getTaskLabels(task, projectLabels) {
        return (task.labels || [])
            .map(id => labelChip(id, [...(projectLabels || []), ...(State.Labels.getAll() || [])]))
            .join('');
    }

    function subtaskProgress(task) {
        const stats = State.Tasks.subtaskStats(task);
        if (!stats.total) return null;
        return {
            done:  stats.done,
            total: stats.total,
            pct:   Math.round((stats.done / stats.total) * 100),
        };
    }

    function userInitials(name) {
        return (name || 'U')[0].toUpperCase();
    }

    function columnForTask(task) {
        if (!task.projectId) return null;
        return State.getColumnById(task.projectId, task.columnId);
    }

    function isDoneColumn(task) {
        const col = columnForTask(task);
        return col && col.name.toLowerCase().includes('done');
    }

    // ── Task card HTML (used by board) ──────────────────────
    function buildTaskCard(task) {
        const proj = task.projectId ? State.Projects.get(task.projectId) : null;
        const projectLabels = proj ? (proj.labels || []) : [];
        const allLabels = [...projectLabels, ...State.Labels.getAll()];

        const due      = formatDueDate(task.dueDate);
        const subs     = subtaskProgress(task);
        const running  = task.isTimerRunning;
        const done     = isDoneColumn(task);

        const labelHtml = (task.labels || []).length
            ? `<div class="task-card-labels">${getTaskLabels(task, allLabels)}</div>`
            : '';

        const subHtml = subs
            ? `<div class="task-card-subtasks">
                   <div class="subtask-mini-bar">
                       <div class="subtask-mini-fill" style="width:${subs.pct}%;"></div>
                   </div>
                   <span class="subtask-mini-text">${subs.done}/${subs.total}</span>
               </div>`
            : '';

        const dueHtml = due
            ? `<span class="task-meta-item${due.cls ? ' ' + due.cls : ''}">
                   <i class="fa-regular fa-calendar"></i> ${due.text}
               </span>`
            : '';

        const timeHtml = task.timeSpent > 0
            ? `<span class="task-meta-item"><i class="fa-regular fa-clock"></i> ${formatHours(task.timeSpent)}</span>`
            : '';

        return `<div class="task-card${done ? ' done' : ''}"
                     data-task-id="${task.id}"
                     draggable="true">
            <div class="task-card-header">
                <div class="task-card-title${done ? ' completed' : ''}">${escHtml(task.title)}</div>
            </div>
            ${labelHtml}
            <div class="task-card-footer">
                <div class="task-card-meta">
                    ${dueHtml}
                    ${timeHtml}
                    ${subs ? subHtml : ''}
                </div>
                ${task.assignee ? `<div class="task-card-assignee" title="${escHtml(task.assignee)}">${userInitials(task.assignee)}</div>` : ''}
                <button class="task-card-timer${running ? ' running' : ''}"
                        data-timer-task="${task.id}"
                        title="${running ? 'Stop timer' : 'Start timer'}"
                        onclick="event.stopPropagation(); State.Timer.toggle(${task.id});">
                    <i class="fa-solid ${running ? 'fa-stop' : 'fa-play'}"></i>
                </button>
            </div>
        </div>`;
    }

    // ── Task row HTML (used by backlog/list) ───────────────
    function buildTaskRow(task) {
        const done = isDoneColumn(task);
        const due  = formatDueDate(task.dueDate);
        const proj = task.projectId ? State.Projects.get(task.projectId) : null;
        const col  = columnForTask(task);

        return `<div class="backlog-task" data-task-id="${task.id}" draggable="true">
            <i class="fa-solid fa-grip-vertical backlog-task-drag-handle"></i>
            <span class="backlog-task-title${done ? ' completed' : ''}">${escHtml(task.title)}</span>
            <div class="backlog-task-meta">
                ${col ? `<span class="badge" style="background:${hexToRgba(col.color,0.15)};color:${col.color};">${escHtml(col.name)}</span>` : ''}
                ${proj ? `<span class="text-muted text-sm">${escHtml(proj.name)}</span>` : ''}
                ${due  ? `<span class="due-date-chip ${due.cls}"><i class="fa-regular fa-calendar"></i> ${due.text}</span>` : ''}
                ${task.assignee ? `<div class="task-card-assignee" title="${escHtml(task.assignee)}" style="width:20px;height:20px;font-size:11px;">${userInitials(task.assignee)}</div>` : ''}
            </div>
        </div>`;
    }

    function getDueDateGroup(task) {
        if (!task.dueDate) return 'none';
        const due  = new Date(task.dueDate + 'T00:00:00');
        const now  = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const dueD = new Date(due.getFullYear(), due.getMonth(), due.getDate());
        const diff = Math.round((dueD - today) / 86400000);
        if (diff < 0) return 'overdue';
        if (diff === 0) return 'today';
        if (diff === 1) return 'tomorrow';
        if (diff <= 7) return 'week';
        return 'later';
    }

    function dueDateGroupOrder(id) {
        return MY_TASKS_DUE_GROUPS.findIndex(g => g.id === id);
    }

    function buildMyTaskProjectHeader(task, nested = false) {
        const proj = task.projectId ? State.Projects.get(task.projectId) : null;
        const label = proj
            ? escHtml(proj.name)
            : (task.projectId ? 'Unknown project' : 'No project');
        const dot = proj
            ? `<span class="project-dot" style="background:${escHtml(proj.color || '#6366f1')};flex-shrink:0;"></span>`
            : '';
        const cls = nested
            ? 'my-tasks-project-header my-tasks-project-header-nested'
            : 'my-tasks-project-header';
        return `<div class="${cls}">${dot}<span>${label}</span></div>`;
    }

    function buildMyTaskRowHtml(t, opts = {}) {
        const done = isDoneColumn(t);
        const due  = formatDueDate(t.dueDate);
        const proj = t.projectId ? State.Projects.get(t.projectId) : null;
        const col  = columnForTask(t);
        const hideProject = !!opts.hideProject;
        const running = t.isTimerRunning;
        return `<div class="task-list-row" data-task-id="${t.id}">
            <div class="task-list-checkbox${done ? ' done' : ''}" data-check="${t.id}">
                ${done ? '<i class="fa-solid fa-check" style="font-size:11px;color:#fff;"></i>' : ''}
            </div>
            <span class="task-list-title${done ? ' done' : ''}">${escHtml(t.title)}</span>
            <div class="task-list-meta">
                ${col  ? `<span class="badge" style="background:${hexToRgba(col.color,0.15)};color:${col.color};">${escHtml(col.name)}</span>` : ''}
                ${proj && !hideProject ? `<span class="text-muted text-sm">${escHtml(proj.name)}</span>` : ''}
                ${due  ? `<span class="due-date-chip ${due.cls}">${due.text}</span>` : ''}
            </div>
            <button type="button" class="task-card-timer${running ? ' running' : ''}" data-timer-task="${t.id}"
                title="${running ? 'Stop timer' : 'Start timer'}"
                onclick="event.stopPropagation(); State.Timer.toggle(${t.id});">
                <i class="fa-solid ${running ? 'fa-stop' : 'fa-play'}"></i>
            </button>
        </div>`;
    }

    function syncMyTasksTimerButton(taskId, running) {
        document.querySelectorAll(`#myTasksList [data-timer-task="${taskId}"]`).forEach(btn => {
            btn.classList.toggle('running', running);
            btn.title = running ? 'Stop timer' : 'Start timer';
            const icon = btn.querySelector('i');
            if (icon) icon.className = `fa-solid ${running ? 'fa-stop' : 'fa-play'}`;
        });
    }

    function attachMyTasksRowEvents(container) {
        container.querySelectorAll('.task-list-row').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.closest('[data-check]') || e.target.closest('[data-timer-task]')) return;
                UI.openTaskPanel(parseInt(el.dataset.taskId, 10));
            });
        });

        container.querySelectorAll('[data-check]').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const taskId = parseInt(el.dataset.check, 10);
                const task   = State.Tasks.get(taskId);
                if (!task) return;
                const proj   = task.projectId ? State.Projects.get(task.projectId) : null;
                if (proj) {
                    const sortedCols = [...proj.columns].sort((a, b) => b.position - a.position);
                    const doneCol    = sortedCols[0];
                    if (doneCol && task.columnId !== doneCol.id) {
                        State.Tasks.update(taskId, { columnId: doneCol.id });
                        UI.toast(`"${task.title}" marked done`, 'success');
                    }
                }
                renderMyTasks();
            });
        });
    }

    // ── My Tasks view ─────────────────────────────────────
    function renderMyTasks() {
        const container = document.getElementById('myTasksList');
        if (!container) return;

        const username = localStorage.getItem('username') || 'admin';

        function projectSortKey(task) {
            if (!task.projectId) return '\uffff'; // no project: last
            const p = State.Projects.get(task.projectId);
            return (p ? p.name : '\ufffe').toLowerCase();
        }

        function withinProjectSort(a, b) {
            if (a.dueDate && b.dueDate) return new Date(a.dueDate) - new Date(b.dueDate);
            if (a.dueDate) return -1;
            if (b.dueDate) return 1;
            return (a.position || 0) - (b.position || 0);
        }

        let tasks = State.Tasks.getAll().filter(t => t.assignee === username);

        if (_myTasksFilter === 'active') tasks = tasks.filter(t => !isDoneColumn(t));
        if (_myTasksFilter === 'done')   tasks = tasks.filter(t =>  isDoneColumn(t));

        if (_myTasksGroupBy === 'dueDate') {
            tasks = tasks.filter(t => t.dueDate);
            tasks.sort((a, b) => {
                const ga = getDueDateGroup(a);
                const gb = getDueDateGroup(b);
                const go = dueDateGroupOrder(ga) - dueDateGroupOrder(gb);
                if (go !== 0) return go;
                const pa = projectSortKey(a);
                const pb = projectSortKey(b);
                if (pa !== pb) return pa.localeCompare(pb);
                return withinProjectSort(a, b);
            });
        } else {
            tasks.sort((a, b) => {
                const pa = projectSortKey(a);
                const pb = projectSortKey(b);
                if (pa !== pb) return pa.localeCompare(pb);
                return withinProjectSort(a, b);
            });
        }

        // Update my tasks badge
        const activeMy = State.Tasks.getAll().filter(t => t.assignee === username && !isDoneColumn(t)).length;
        const badge = document.getElementById('myTasksBadge');
        if (badge) {
            badge.textContent = activeMy;
            badge.style.display = activeMy > 0 ? 'inline-flex' : 'none';
        }

        if (!tasks.length) {
            container.innerHTML = `<div class="empty-state">
                <div class="empty-state-icon"><i class="fa-solid fa-check-circle"></i></div>
                <div class="empty-state-title">All clear!</div>
                <div class="empty-state-desc">No tasks assigned to you${_myTasksFilter !== 'all' ? ' in this filter' : ''}.</div>
            </div>`;
            return;
        }

        let html = '';
        if (_myTasksGroupBy === 'dueDate') {
            let lastGroup = null;
            let lastProjectKey = null;
            tasks.forEach(t => {
                const groupId = getDueDateGroup(t);
                const projKey = t.projectId != null ? String(t.projectId) : '__none__';

                if (groupId !== lastGroup) {
                    lastGroup = groupId;
                    lastProjectKey = null;
                    const meta = MY_TASKS_DUE_GROUPS.find(g => g.id === groupId);
                    const overdue = groupId === 'overdue';
                    html += `<div class="my-tasks-group-header${overdue ? ' my-tasks-group-overdue' : ''}">
                        <span>${escHtml(meta?.label || groupId)}</span>
                    </div>`;
                }
                if (projKey !== lastProjectKey) {
                    lastProjectKey = projKey;
                    html += buildMyTaskProjectHeader(t, true);
                }
                html += buildMyTaskRowHtml(t, { hideProject: true });
            });
        } else {
            let lastProjectKey = null;
            tasks.forEach(t => {
                const projKey = t.projectId != null ? String(t.projectId) : '__none__';
                if (projKey !== lastProjectKey) {
                    lastProjectKey = projKey;
                    html += buildMyTaskProjectHeader(t, false);
                }
                html += buildMyTaskRowHtml(t);
            });
        }

        container.innerHTML = html;
        attachMyTasksRowEvents(container);
    }

    // ── Task Modal ─────────────────────────────────────────
    function openModal(taskId, defaults) {
        _editingTaskId  = taskId || null;
        const modal     = document.getElementById('taskModalScrim');
        const titleEl   = document.getElementById('taskModalTitle');
        const saveBtn   = document.getElementById('taskModalSave');
        const projSel   = document.getElementById('taskModalProject');
        const colSel    = document.getElementById('taskModalColumn');
        const sprintSel = document.getElementById('taskModalSprint');
        const labelsWrap= document.getElementById('taskModalLabels');

        Projects.populateProjectSelect(projSel);
        Projects.populateColumnSelect(colSel, '');

        if (_editingTaskId) {
            const task     = State.Tasks.get(_editingTaskId);
            titleEl.textContent = 'Edit Task';
            saveBtn.textContent = 'Save Changes';
            document.getElementById('taskModalId').value          = _editingTaskId;
            document.getElementById('taskModalTitleInput').value  = task.title;
            document.getElementById('taskModalDesc').value        = task.description || '';
            document.getElementById('taskModalDueDate').value     = task.dueDate   || '';
            document.getElementById('taskModalStartDate').value   = task.startDate || '';
            document.getElementById('taskModalEstimate').value    = task.timeEstimate || '';
            if (task.projectId) {
                projSel.value = task.projectId;
                Projects.populateColumnSelect(colSel, task.projectId);
                colSel.value = task.columnId || '';
                populateSprintSelect(sprintSel, task.projectId, task.sprintId);
            }
            renderLabelSelect(labelsWrap, task.labels || [], task.projectId);
        } else {
            titleEl.textContent = 'New Task';
            saveBtn.textContent = 'Create Task';
            document.getElementById('taskModalId').value          = '';
            document.getElementById('taskModalTitleInput').value  = defaults?.title || '';
            document.getElementById('taskModalDesc').value        = '';
            document.getElementById('taskModalDueDate').value     = '';
            document.getElementById('taskModalStartDate').value   = '';
            document.getElementById('taskModalEstimate').value    = '';

            const defaultProjId = defaults?.projectId || Router.getCurrentProjectId();
            if (defaultProjId) {
                projSel.value = defaultProjId;
                Projects.populateColumnSelect(colSel, defaultProjId);
                if (defaults?.columnId) colSel.value = defaults.columnId;
                populateSprintSelect(sprintSel, defaultProjId, defaults?.sprintId);
            } else {
                sprintSel.innerHTML = '<option value="">No sprint (Backlog)</option>';
            }
            renderLabelSelect(labelsWrap, [], defaultProjId);
        }

        // When project changes, update column and sprint selects
        projSel.onchange = () => {
            const pid = parseInt(projSel.value, 10) || null;
            Projects.populateColumnSelect(colSel, pid);
            populateSprintSelect(sprintSel, pid, null);
            renderLabelSelect(labelsWrap, [], pid);
        };

        modal.classList.add('open');
        setTimeout(() => document.getElementById('taskModalTitleInput').focus(), 100);
    }

    function closeModal() {
        document.getElementById('taskModalScrim').classList.remove('open');
    }

    function populateSprintSelect(selectEl, projectId, selectedId) {
        if (!selectEl) return;
        const sprints = projectId
            ? State.Sprints.byProject(projectId)
            : State.Sprints.getAll();
        selectEl.innerHTML = '<option value="">No sprint (Backlog)</option>' +
            sprints.map(s => `<option value="${s.id}"${s.id === selectedId ? ' selected' : ''}>${escHtml(s.name)}</option>`).join('');
    }

    function renderLabelSelect(container, selected, projectId) {
        if (!container) return;
        const proj   = projectId ? State.Projects.get(parseInt(projectId, 10)) : null;
        const labels = [...State.Labels.getAll(), ...(proj?.labels || [])];
        const sel    = new Set(selected || []);

        container.innerHTML = labels.map(l => `
            <div class="label-select-item${sel.has(l.id) ? ' selected' : ''}"
                 data-label-id="${l.id}"
                 style="background:${l.bg || 'rgba(99,102,241,0.1)'};color:${l.color};">
                ${escHtml(l.name)}
            </div>
        `).join('');

        container.querySelectorAll('.label-select-item').forEach(el => {
            el.addEventListener('click', () => el.classList.toggle('selected'));
        });
    }

    function getSelectedLabels() {
        return Array.from(document.querySelectorAll('#taskModalLabels .label-select-item.selected'))
            .map(el => el.dataset.labelId);
    }

    function saveTask() {
        const titleInput = document.getElementById('taskModalTitleInput');
        const title      = titleInput.value.trim();
        if (!title) {
            UI.toast('Task title is required', 'error');
            titleInput.focus();
            return;
        }

        const projId   = parseInt(document.getElementById('taskModalProject').value, 10) || null;
        const colId    = document.getElementById('taskModalColumn').value || null;
        const sprintId = parseInt(document.getElementById('taskModalSprint').value, 10) || null;
        const estimate = parseFloat(document.getElementById('taskModalEstimate').value) || null;

        if (!projId || !State.Projects.get(projId)) {
            UI.toast('A project is required', 'error');
            document.getElementById('taskModalProject').focus();
            return;
        }

        const fields = {
            title,
            description:   normalizeDescription(document.getElementById('taskModalDesc').value),
            dueDate:       document.getElementById('taskModalDueDate').value   || null,
            startDate:     document.getElementById('taskModalStartDate').value || null,
            timeEstimate:  estimate,
            projectId:     projId,
            columnId:      colId || (projId ? State.getFirstColumn(projId)?.id : null),
            sprintId,
            labels:        getSelectedLabels(),
        };

        if (_editingTaskId) {
            const updated = State.Tasks.update(_editingTaskId, fields);
            if (updated) {
                UI.toast('Task updated', 'success');
            } else {
                UI.toast('Task removed — a project is required', 'info');
            }
        } else {
            const created = State.Tasks.create(fields);
            if (!created) {
                UI.toast('A project is required', 'error');
                return;
            }
            UI.toast('Task created', 'success');
        }

        closeModal();
        // Re-render current view
        const { view, projectId } = Router.getCurrent();
        Router.renderView(view, projectId);
    }

    // ── Helpers ────────────────────────────────────────────
    function hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1,3),16);
        const g = parseInt(hex.slice(3,5),16);
        const b = parseInt(hex.slice(5,7),16);
        return `rgba(${r},${g},${b},${alpha})`;
    }

    function init() {
        // New task button (header)
        document.getElementById('createTaskBtn')?.addEventListener('click', () => openModal());

        // Board "Add Task" button
        document.getElementById('boardAddTaskBtn')?.addEventListener('click', () => {
            const pid = Router.getCurrentProjectId();
            openModal(null, { projectId: pid });
        });

        // Backlog "Add Task" button
        document.getElementById('backlogAddTaskBtn')?.addEventListener('click', () => {
            const pid = Router.getCurrentProjectId();
            openModal(null, { projectId: pid });
        });

        // Modal close
        document.getElementById('taskModalClose')?.addEventListener('click', closeModal);
        document.getElementById('taskModalCancel')?.addEventListener('click', closeModal);
        document.getElementById('taskModalScrim')?.addEventListener('click', e => {
            if (e.target === document.getElementById('taskModalScrim')) closeModal();
        });

        // Save
        document.getElementById('taskModalSave')?.addEventListener('click', saveTask);
        document.getElementById('taskModalTitleInput')?.addEventListener('keydown', e => {
            if (e.key === 'Enter') saveTask();
        });

        // My Tasks filter chips
        document.querySelectorAll('[data-myfilter]').forEach(btn => {
            btn.addEventListener('click', () => {
                _myTasksFilter = btn.dataset.myfilter;
                document.querySelectorAll('[data-myfilter]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderMyTasks();
            });
        });

        document.querySelectorAll('[data-mygroup]').forEach(btn => {
            btn.addEventListener('click', () => {
                _myTasksGroupBy = btn.dataset.mygroup;
                document.querySelectorAll('[data-mygroup]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderMyTasks();
            });
        });

        // Timer header display
        State.on('timer:tick', ({ elapsed, taskId }) => {
            const indicator = document.getElementById('timerIndicator');
            const display   = document.getElementById('timerDisplay');
            if (indicator && display) {
                indicator.classList.add('active');
                display.textContent = formatElapsed(elapsed);
            }
            if (taskId) syncMyTasksTimerButton(taskId, true);
        });

        State.on('timer:started', (taskId) => {
            document.querySelectorAll('#myTasksList [data-timer-task]').forEach(btn => {
                const id = parseInt(btn.dataset.timerTask, 10);
                syncMyTasksTimerButton(id, id === taskId);
            });
        });

        State.on('timer:stopped', (taskId) => {
            const indicator = document.getElementById('timerIndicator');
            if (indicator) indicator.classList.remove('active');
            const still = State.Timer.getRunning();
            if (still) {
                document.getElementById('timerIndicator')?.classList.add('active');
            }
            if (taskId) syncMyTasksTimerButton(taskId, false);
        });

        // Resume timer display on load
        const running = State.Timer.getRunning();
        if (running) {
            document.getElementById('timerIndicator')?.classList.add('active');
        }

        // Timer indicator click → open task panel
        document.getElementById('timerIndicator')?.addEventListener('click', () => {
            const t = State.Timer.getRunning();
            if (t) UI.openTaskPanel(t.id);
        });

        // State changes refresh My Tasks badge
        State.on('tasks:changed', () => {
            if (Router.getCurrent().view === 'mytasks') renderMyTasks();
            updateMyTasksBadge();
        });

        updateMyTasksBadge();
    }

    function updateMyTasksBadge() {
        const username = localStorage.getItem('username') || 'admin';
        const count = State.Tasks.getAll().filter(t => t.assignee === username && !isDoneColumn(t)).length;
        const badge = document.getElementById('myTasksBadge');
        if (badge) {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'inline-flex' : 'none';
        }
    }

    return {
        init, openModal, closeModal,
        buildTaskCard, buildTaskRow,
        renderMyTasks, formatDueDate, formatTime, formatHours, formatElapsed,
        escHtml, hexToRgba, isDoneColumn, subtaskProgress,
        normalizeDescription, setDescriptionElement, getDescriptionFromElement,
        sanitizeDescriptionHtml,
    };
})();

window.Tasks = Tasks;
