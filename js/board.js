/**
 * FlowBoard — Board (Kanban) Module
 * Renders columns and cards, handles drag-and-drop between columns,
 * WIP limit enforcement, and inline task creation.
 */

const Board = (() => {
    let _currentProjectId = null;
    let _filterPriority   = 'all';
    let _filterDue        = false;
    let _dragTaskId       = null;
    let _dragSourceColId  = null;

    // ── Render (dispatcher) ────────────────────────────────
    function render(projectId) {
        _currentProjectId = projectId;

        const container = document.getElementById('boardContainer');
        if (!container) return;

        const proj = projectId ? State.Projects.get(projectId) : null;
        document.getElementById('boardViewTitle').textContent    = proj ? proj.name : 'All Boards';
        document.getElementById('boardViewSubtitle').textContent = proj ? 'Kanban workflow' : 'Select a project to view its board';

        if (!projectId || !proj) {
            container.innerHTML = `<div class="empty-state" style="flex:1;">
                <div class="empty-state-icon"><i class="fa-solid fa-table-columns"></i></div>
                <div class="empty-state-title">No project selected</div>
                <div class="empty-state-desc">Choose a project from the sidebar to view its Kanban board.</div>
                <button class="btn btn-primary" onclick="Projects.openModal()">
                    <i class="fa-solid fa-plus"></i> New Project
                </button>
            </div>`;
            return;
        }

        const columns = [...proj.columns].sort((a, b) => a.position - b.position);
        let tasks     = State.Tasks.byProject(projectId);

        // Apply filters
        if (_filterPriority !== 'all') tasks = tasks.filter(t => t.priority === _filterPriority);
        if (_filterDue) {
            const now = Date.now();
            tasks = tasks.filter(t => {
                if (!t.dueDate) return false;
                const diff = (new Date(t.dueDate + 'T00:00:00') - now) / 86400000;
                return diff <= 7;
            });
        }

        const tasksByCol = {};
        columns.forEach(c => { tasksByCol[c.id] = []; });
        tasks.forEach(t => {
            const colId = t.columnId || columns[0]?.id;
            if (tasksByCol[colId] !== undefined) {
                tasksByCol[colId].push(t);
            } else if (columns[0]) {
                tasksByCol[columns[0].id].push(t);
            }
        });

        // Sort by position
        Object.values(tasksByCol).forEach(arr => arr.sort((a, b) => a.position - b.position));

        container.innerHTML = '';

        columns.forEach(col => {
            const colTasks = tasksByCol[col.id] || [];
            const wip      = col.wipLimit;
            const exceeded = wip && colTasks.length > wip;

            const colEl = document.createElement('div');
            colEl.className = 'board-column';
            colEl.dataset.colId = col.id;
            colEl.innerHTML = `
                <div class="column-header">
                    <div class="column-color-dot" style="background:${col.color};"></div>
                    <div class="column-name">${Tasks.escHtml(col.name)}</div>
                    <div class="column-count${exceeded ? ' wip-exceeded' : ''}" title="${wip ? `WIP limit: ${wip}` : 'No WIP limit'}">
                        ${colTasks.length}${wip ? `<span style="font-weight:400;opacity:0.6;">/${wip}</span>` : ''}
                    </div>
                    <div class="column-actions">
                        <button class="btn btn-ghost btn-icon btn-sm" data-col-menu="${col.id}" title="Column options">
                            <i class="fa-solid fa-ellipsis"></i>
                        </button>
                    </div>
                </div>
                <div class="column-body" data-drop-col="${col.id}">
                    ${colTasks.map(t => Tasks.buildTaskCard(t)).join('')}
                </div>
                <div class="column-footer">
                    <button class="add-task-inline" data-add-col="${col.id}">
                        <i class="fa-solid fa-plus"></i> Add task
                    </button>
                </div>
            `;

            container.appendChild(colEl);

            // Task card click → detail panel
            colEl.querySelectorAll('.task-card').forEach(card => {
                card.addEventListener('click', (e) => {
                    if (e.target.closest('.task-card-timer')) return;
                    UI.openTaskPanel(parseInt(card.dataset.taskId, 10));
                });
            });

            // Drag events on cards
            attachCardDragEvents(colEl.querySelectorAll('.task-card'));

            // Drop zone events on column body
            attachColumnDropEvents(colEl.querySelector('.column-body'));

            // Inline "Add task"
            colEl.querySelector(`[data-add-col]`).addEventListener('click', () => {
                Tasks.openModal(null, { projectId, columnId: col.id });
            });

            // Column menu
            colEl.querySelector(`[data-col-menu]`)?.addEventListener('click', (e) => {
                e.stopPropagation();
                showColumnMenu(e, col);
            });
        });

        // "Add Column" button
        const addColBtn = document.createElement('button');
        addColBtn.className = 'add-column-btn';
        addColBtn.innerHTML = '<i class="fa-solid fa-plus"></i>';
        addColBtn.title = 'Add column';
        addColBtn.addEventListener('click', () => Projects.openModal(projectId));
        container.appendChild(addColBtn);
    }

    // ── Drag & Drop ────────────────────────────────────────
    function attachCardDragEvents(cards) {
        cards.forEach(card => {
            card.addEventListener('dragstart', (e) => {
                _dragTaskId     = parseInt(card.dataset.taskId, 10);
                _dragSourceColId= card.closest('[data-col-id]')?.dataset.colId;
                card.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', _dragTaskId);
            });

            card.addEventListener('dragend', () => {
                card.classList.remove('dragging');
                document.querySelectorAll('.board-column').forEach(c => c.classList.remove('drag-over'));
            });
        });
    }

    function attachColumnDropEvents(dropZone) {
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            dropZone.closest('.board-column').classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', (e) => {
            if (!dropZone.contains(e.relatedTarget)) {
                dropZone.closest('.board-column').classList.remove('drag-over');
            }
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            const colId   = dropZone.dataset.dropCol;
            const taskId  = parseInt(e.dataTransfer.getData('text/plain'), 10) || _dragTaskId;
            dropZone.closest('.board-column').classList.remove('drag-over');

            if (!taskId || !colId) return;

            const task = State.Tasks.get(taskId);
            if (!task) return;

            // WIP limit check
            const proj = State.Projects.get(_currentProjectId);
            if (proj) {
                const col = proj.columns.find(c => c.id === colId);
                if (col && col.wipLimit) {
                    const count = State.Tasks.byProject(_currentProjectId)
                        .filter(t => t.columnId === colId && t.id !== taskId).length;
                    if (count >= col.wipLimit) {
                        UI.toast(`WIP limit (${col.wipLimit}) reached for "${col.name}"`, 'warning');
                        render(_currentProjectId);
                        return;
                    }
                }
            }

            // Determine position relative to card under cursor
            const newPosition = getDropPosition(dropZone, e.clientY, taskId);
            State.Tasks.update(taskId, { columnId: colId, position: newPosition });
            render(_currentProjectId);

            // Re-render task panel if open
            if (UI.getOpenTaskId() === taskId) UI.openTaskPanel(taskId);
        });
    }

    function getDropPosition(dropZone, clientY, excludeTaskId) {
        const cards = [...dropZone.querySelectorAll('.task-card:not(.dragging)')]
            .filter(c => parseInt(c.dataset.taskId, 10) !== excludeTaskId);

        if (!cards.length) return 1000;

        for (let i = 0; i < cards.length; i++) {
            const rect    = cards[i].getBoundingClientRect();
            const midY    = rect.top + rect.height / 2;
            if (clientY < midY) {
                const beforeTask = State.Tasks.get(parseInt(cards[i].dataset.taskId, 10));
                const pos        = beforeTask ? beforeTask.position - 1 : i * 1000;
                return Math.max(0, pos);
            }
        }

        const lastTask = State.Tasks.get(parseInt(cards[cards.length - 1].dataset.taskId, 10));
        return (lastTask ? lastTask.position : (cards.length - 1) * 1000) + 1;
    }

    // ── Column context menu ────────────────────────────────
    function showColumnMenu(event, col) {
        const menu = document.createElement('div');
        menu.className = 'dropdown-menu open';
        menu.style.cssText = `position:fixed;top:${event.clientY + 4}px;left:${event.clientX - 120}px;z-index:400;`;
        menu.innerHTML = `
            <div class="dropdown-item" id="cmEdit"><i class="fa-solid fa-pen"></i> Rename</div>
            <div class="dropdown-separator"></div>
            <div class="dropdown-item danger" id="cmDelete"><i class="fa-solid fa-trash"></i> Delete Column</div>
        `;
        document.body.appendChild(menu);

        menu.querySelector('#cmEdit').addEventListener('click', () => {
            cleanup();
            const name = prompt('Rename column:', col.name);
            if (name && name.trim()) {
                const proj = State.Projects.get(_currentProjectId);
                if (proj) {
                    const c = proj.columns.find(x => x.id === col.id);
                    if (c) {
                        c.name = name.trim();
                        State.Projects.update(_currentProjectId, { columns: proj.columns });
                        render(_currentProjectId);
                    }
                }
            }
        });

        menu.querySelector('#cmDelete').addEventListener('click', () => {
            cleanup();
            const count = State.Tasks.byProject(_currentProjectId).filter(t => t.columnId === col.id).length;
            const msg   = count > 0
                ? `Delete column "${col.name}"? ${count} task(s) will move to the first column.`
                : `Delete column "${col.name}"?`;
            UI.confirm(msg, () => {
                const proj = State.Projects.get(_currentProjectId);
                if (!proj) return;
                if (proj.columns.length <= 1) {
                    UI.toast('Cannot delete the last column', 'error');
                    return;
                }
                const firstCol = [...proj.columns].sort((a,b) => a.position - b.position).find(c => c.id !== col.id);
                State.Tasks.byProject(_currentProjectId)
                    .filter(t => t.columnId === col.id)
                    .forEach(t => State.Tasks.update(t.id, { columnId: firstCol?.id || null }));
                proj.columns = proj.columns.filter(c => c.id !== col.id);
                State.Projects.update(_currentProjectId, { columns: proj.columns });
                render(_currentProjectId);
            });
        });

        function cleanup() {
            if (menu.parentNode) menu.parentNode.removeChild(menu);
        }

        setTimeout(() => {
            document.addEventListener('click', function h(e) {
                if (!menu.contains(e.target)) { cleanup(); document.removeEventListener('click', h); }
            });
        }, 0);
    }

    // ── Filter controls ────────────────────────────────────
    function initFilters() {
        document.querySelectorAll('#boardFilterGroup .filter-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                _filterPriority = btn.dataset.filter;
                document.querySelectorAll('#boardFilterGroup .filter-chip').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                if (_currentProjectId) render(_currentProjectId);
            });
        });

        document.getElementById('boardFilterDue')?.addEventListener('click', (e) => {
            _filterDue = !_filterDue;
            e.currentTarget.classList.toggle('active', _filterDue);
            if (_currentProjectId) render(_currentProjectId);
        });
    }

    // ── Init ──────────────────────────────────────────────
    function init() {
        initFilters();

        // Re-render board when tasks change
        State.on('tasks:changed', () => {
            const { view, projectId } = Router.getCurrent();
            if (view === 'board') render(projectId);
        });

        State.on('projects:changed', () => {
            const { view, projectId } = Router.getCurrent();
            if (view === 'board') render(projectId);
        });

        // Timer tick: refresh card timer buttons
        State.on('timer:tick', ({ taskId }) => {
            const btns = document.querySelectorAll(`[data-timer-task="${taskId}"]`);
            btns.forEach(btn => {
                btn.classList.add('running');
                btn.querySelector('i').className = 'fa-solid fa-stop';
            });
        });

        State.on('timer:stopped', (taskId) => {
            const btns = document.querySelectorAll(`[data-timer-task="${taskId}"]`);
            btns.forEach(btn => {
                btn.classList.remove('running');
                btn.querySelector('i').className = 'fa-solid fa-play';
            });
        });
    }

    return { init, render };
})();

window.Board = Board;
