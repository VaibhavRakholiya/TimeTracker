/**
 * FlowBoard — Backlog Module
 * Renders backlog view with sprint sections.
 * Drag to reorder within section; Sprint start/complete lifecycle actions.
 */

const Backlog = (() => {
    let _currentProjectId = null;
    let _dragTaskId  = null;
    let _dragOverEl  = null;

    // ── Render ─────────────────────────────────────────────
    function render(projectId) {
        _currentProjectId = projectId;
        const container   = document.getElementById('backlogContainer');
        if (!container) return;

        const proj = projectId ? State.Projects.get(projectId) : null;
        document.getElementById('backlogViewTitle').textContent = proj
            ? `${proj.name} — Backlog`
            : 'Backlog';

        const sprints = State.Sprints.byProject(projectId)
            .sort((a, b) => {
                const order = { active: 0, planned: 1, completed: 2 };
                return (order[a.status] ?? 3) - (order[b.status] ?? 3);
            });

        container.innerHTML = '';

        // ── Sprint sections ────────────────────────────────
        sprints.forEach(sprint => {
            const tasks = State.Tasks.bySprint(sprint.id)
                .filter(t => !projectId || t.projectId === projectId)
                .sort((a, b) => a.position - b.position);

            const section = buildSprintSection(sprint, tasks);
            container.appendChild(section);
        });

        // ── Unassigned backlog section ─────────────────────
        const backlogTasks = State.Tasks.backlog(projectId)
            .sort((a, b) => a.position - b.position);

        const backlogSection = buildBacklogSection(backlogTasks, projectId);
        container.appendChild(backlogSection);
    }

    function buildSprintSection(sprint, tasks) {
        const section = document.createElement('div');
        section.className = 'sprint-section';
        section.dataset.sprintId = sprint.id;

        const done  = tasks.filter(t => Tasks.isDoneColumn(t)).length;
        const total = tasks.length;
        const pct   = total > 0 ? Math.round((done / total) * 100) : 0;

        const dateStr = [sprint.startDate, sprint.endDate]
            .filter(Boolean)
            .map(d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
            .join(' → ');

        section.innerHTML = `
            <div class="sprint-section-header" data-sprint-toggle="${sprint.id}">
                <i class="fa-solid fa-chevron-down sprint-chevron"></i>
                <div class="sprint-title">${escHtml(sprint.name)}</div>
                <span class="sprint-status-chip sprint-status-${sprint.status}">${capitalize(sprint.status)}</span>
                <span class="sprint-dates">${dateStr}</span>
                <span class="text-muted text-sm">${done}/${total} done</span>
                <div style="display:flex;gap:4px;margin-left:8px;">
                    ${sprint.status === 'planned' ? `
                        <button class="btn btn-success btn-sm" data-sprint-start="${sprint.id}">
                            <i class="fa-solid fa-bolt"></i> Start
                        </button>` : ''}
                    ${sprint.status === 'active' ? `
                        <button class="btn btn-secondary btn-sm" data-sprint-complete="${sprint.id}">
                            <i class="fa-solid fa-flag-checkered"></i> Complete
                        </button>` : ''}
                    <button class="btn btn-ghost btn-icon btn-sm" data-sprint-edit="${sprint.id}" title="Edit sprint">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn btn-ghost btn-icon btn-sm" data-sprint-delete="${sprint.id}" title="Delete sprint">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="sprint-section-body" data-sprint-body="${sprint.id}">
                ${tasks.length ? tasks.map(t => Tasks.buildTaskRow(t)).join('') : buildEmptySprintBody()}
                <div class="inline-add" data-sprint-add="${sprint.id}">
                    <button class="add-task-inline" style="width:100%;">
                        <i class="fa-solid fa-plus"></i> Add task to sprint
                    </button>
                </div>
            </div>
        `;

        // Toggle collapse
        section.querySelector(`[data-sprint-toggle]`).addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            section.classList.toggle('collapsed');
        });

        // Sprint lifecycle
        section.querySelector(`[data-sprint-start]`)?.addEventListener('click', (e) => {
            e.stopPropagation();
            const active = State.Sprints.active();
            if (active && active.id !== sprint.id) {
                UI.confirm(`There is already an active sprint ("${active.name}"). Starting this sprint will pause that one. Continue?`, () => {
                    State.Sprints.start(sprint.id);
                    render(_currentProjectId);
                    UI.toast(`Sprint "${sprint.name}" started`, 'success');
                });
            } else {
                State.Sprints.start(sprint.id);
                render(_currentProjectId);
                UI.toast(`Sprint "${sprint.name}" started`, 'success');
            }
        });

        section.querySelector(`[data-sprint-complete]`)?.addEventListener('click', (e) => {
            e.stopPropagation();
            const incomplete = tasks.filter(t => !Tasks.isDoneColumn(t)).length;
            const msg = incomplete > 0
                ? `Complete sprint "${sprint.name}"? ${incomplete} incomplete task(s) will return to the backlog.`
                : `Complete sprint "${sprint.name}"?`;
            UI.confirm(msg, () => {
                State.Sprints.complete(sprint.id);
                render(_currentProjectId);
                UI.toast(`Sprint "${sprint.name}" completed`, 'success');
                Dashboard.render();
            }, 'Complete', 'btn-success');
        });

        section.querySelector(`[data-sprint-edit]`)?.addEventListener('click', (e) => {
            e.stopPropagation();
            Sprints.openModal(sprint.id);
        });

        section.querySelector(`[data-sprint-delete]`)?.addEventListener('click', (e) => {
            e.stopPropagation();
            UI.confirm(`Delete sprint "${sprint.name}"? All tasks will return to the backlog.`, () => {
                State.Sprints.delete(sprint.id);
                render(_currentProjectId);
                UI.toast('Sprint deleted', 'success');
            });
        });

        // Add task to sprint
        section.querySelector(`[data-sprint-add] .add-task-inline`)?.addEventListener('click', () => {
            Tasks.openModal(null, { projectId: _currentProjectId, sprintId: sprint.id });
        });

        // Task row clicks → panel
        section.querySelectorAll('.backlog-task').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.closest('.backlog-task-drag-handle')) return;
                UI.openTaskPanel(parseInt(el.dataset.taskId, 10));
            });
        });

        // Drag within section
        attachRowDragEvents(section.querySelectorAll('.backlog-task'), sprint.id, null);

        return section;
    }

    function buildBacklogSection(tasks, projectId) {
        const section = document.createElement('div');
        section.className = 'sprint-section';
        section.dataset.backlogSection = 'true';

        section.innerHTML = `
            <div class="sprint-section-header" data-backlog-toggle="true">
                <i class="fa-solid fa-chevron-down sprint-chevron"></i>
                <div class="sprint-title">Backlog</div>
                <span class="sprint-status-chip" style="background:rgba(107,114,128,0.12);color:#9ca3af;">Unassigned</span>
                <span class="text-muted text-sm">${tasks.length} task${tasks.length !== 1 ? 's' : ''}</span>
            </div>
            <div class="sprint-section-body" data-backlog-body="true">
                ${tasks.length ? tasks.map(t => Tasks.buildTaskRow(t)).join('') : buildEmptySprintBody()}
                <div class="inline-add">
                    <button class="add-task-inline" id="backlogAddTaskInline" style="width:100%;">
                        <i class="fa-solid fa-plus"></i> Add task
                    </button>
                </div>
            </div>
        `;

        section.querySelector('[data-backlog-toggle]').addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            section.classList.toggle('collapsed');
        });

        section.querySelector('#backlogAddTaskInline')?.addEventListener('click', () => {
            Tasks.openModal(null, { projectId });
        });

        section.querySelectorAll('.backlog-task').forEach(el => {
            el.addEventListener('click', () => {
                UI.openTaskPanel(parseInt(el.dataset.taskId, 10));
            });
        });

        attachRowDragEvents(section.querySelectorAll('.backlog-task'), null, null);

        return section;
    }

    function buildEmptySprintBody() {
        return `<div class="empty-backlog">
            <i class="fa-solid fa-inbox"></i>
            <p>No tasks here yet. Add some tasks to get started.</p>
        </div>`;
    }

    // ── Row drag & drop ────────────────────────────────────
    function attachRowDragEvents(rows, sprintId, projectId) {
        rows.forEach(row => {
            row.draggable = true;

            row.addEventListener('dragstart', (e) => {
                _dragTaskId = parseInt(row.dataset.taskId, 10);
                row.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', _dragTaskId);
            });

            row.addEventListener('dragend', () => {
                row.classList.remove('dragging');
                document.querySelectorAll('.backlog-task').forEach(r => {
                    r.classList.remove('drag-over-top', 'drag-over-bottom');
                });
            });

            row.addEventListener('dragover', (e) => {
                e.preventDefault();
                _dragOverEl = row;
                const rect   = row.getBoundingClientRect();
                const isTop  = e.clientY < rect.top + rect.height / 2;
                row.classList.toggle('drag-over-top',    isTop);
                row.classList.toggle('drag-over-bottom', !isTop);
            });

            row.addEventListener('drop', (e) => {
                e.preventDefault();
                row.classList.remove('drag-over-top', 'drag-over-bottom');
                const targetId = parseInt(row.dataset.taskId, 10);
                if (!_dragTaskId || _dragTaskId === targetId) return;

                const targetTask = State.Tasks.get(targetId);
                const dragTask   = State.Tasks.get(_dragTaskId);
                if (!targetTask || !dragTask) return;

                const rect   = row.getBoundingClientRect();
                const isTop  = e.clientY < rect.top + rect.height / 2;
                const newPos = isTop ? targetTask.position - 0.5 : targetTask.position + 0.5;

                // Also move to same sprint as target
                State.Tasks.update(_dragTaskId, {
                    position: newPos,
                    sprintId: targetTask.sprintId,
                    projectId: targetTask.projectId || dragTask.projectId,
                });

                render(_currentProjectId);
            });
        });
    }

    function escHtml(str) {
        return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function capitalize(str) {
        return str ? str[0].toUpperCase() + str.slice(1) : '';
    }

    function init() {
        State.on('tasks:changed', () => {
            const { view, projectId } = Router.getCurrent();
            if (view === 'backlog') render(projectId);
        });

        State.on('sprints:changed', () => {
            const { view, projectId } = Router.getCurrent();
            if (view === 'backlog') render(projectId);
        });
    }

    return { init, render };
})();

window.Backlog = Backlog;
