/**
 * FlowBoard — Timeline (Gantt/Roadmap) Module
 * Renders horizontal Gantt bars for tasks with start/due dates.
 * Supports week and month zoom levels.
 */

const Timeline = (() => {
    const DAY_W_WEEK  = 48;  // px per day in week zoom
    const DAY_W_MONTH = 24;  // px per day in month zoom

    let _zoom       = 'week';   // 'week' | 'month'
    let _projectFilter = 'all';
    let _viewStart  = null;     // Date (Monday of current week or start of month)

    // ── Render ─────────────────────────────────────────────
    function render() {
        const container = document.getElementById('timelineContainer');
        if (!container) return;

        // Default view start: beginning of current week
        if (!_viewStart) _viewStart = getWeekStart(new Date());

        const dayW   = _zoom === 'week' ? DAY_W_WEEK : DAY_W_MONTH;
        const days   = _zoom === 'week' ? 28 : 60;
        const end    = new Date(_viewStart.getTime() + days * 86400000);

        // Filter tasks
        let tasks = State.Tasks.getAll().filter(t => t.startDate || t.dueDate);
        if (_projectFilter !== 'all') {
            tasks = tasks.filter(t => String(t.projectId) === _projectFilter);
        }

        // Sort by start date
        tasks.sort((a, b) => {
            const aD = a.startDate || a.dueDate;
            const bD = b.startDate || b.dueDate;
            return new Date(aD) - new Date(bD);
        });

        if (!tasks.length) {
            container.innerHTML = `<div class="empty-state" style="flex:1;padding:80px;">
                <div class="empty-state-icon"><i class="fa-solid fa-chart-gantt"></i></div>
                <div class="empty-state-title">No tasks with dates</div>
                <div class="empty-state-desc">Set start or due dates on tasks to see them here.</div>
            </div>`;
            return;
        }

        // Update project filter dropdown
        updateProjectFilter();

        const today        = new Date();
        today.setHours(0,0,0,0);
        const todayOffset  = Math.round((today - _viewStart) / 86400000);
        const totalWidth   = days * dayW + 220;

        // Build header dates
        let headerDates = '';
        for (let i = 0; i < days; i++) {
            const d = new Date(_viewStart.getTime() + i * 86400000);
            const isToday = d.toDateString() === today.toDateString();
            const label   = _zoom === 'week'
                ? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                : d.getDate() === 1 || i === 0
                    ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : String(d.getDate());
            const showFull = _zoom === 'week' || d.getDate() === 1 || i === 0 || i % 7 === 0;
            headerDates += `<div class="timeline-day-header${isToday ? ' today' : ''}"
                style="width:${dayW}px;min-width:${dayW}px;">
                ${showFull ? label : (d.getDay() === 1 ? d.getDate() : '')}
            </div>`;
        }

        // Navigation row
        const navHtml = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <button class="btn btn-secondary btn-sm" id="tlPrev"><i class="fa-solid fa-chevron-left"></i></button>
            <button class="btn btn-secondary btn-sm" id="tlToday">Today</button>
            <button class="btn btn-secondary btn-sm" id="tlNext"><i class="fa-solid fa-chevron-right"></i></button>
            <span class="text-muted text-sm" style="margin-left:8px;">
                ${_viewStart.toLocaleDateString('en-US',{month:'long',year:'numeric'})}
                ${_zoom === 'week' ? '– '+end.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : ''}
            </span>
        </div>`;

        // Build rows
        const rowsHtml = tasks.map(task => {
            const proj     = task.projectId ? State.Projects.get(task.projectId) : null;
            const barColor = proj?.color || 'var(--primary)';
            const startD   = task.startDate ? new Date(task.startDate + 'T00:00:00') : new Date(task.dueDate + 'T00:00:00');
            const endD     = task.dueDate   ? new Date(task.dueDate   + 'T00:00:00') : startD;

            const startOffset = Math.round((startD - _viewStart) / 86400000);
            const barDays     = Math.max(1, Math.round((endD - startD) / 86400000) + 1);
            const barLeft     = startOffset * dayW;
            const barWidth    = barDays * dayW - 4;

            // Only show bar if it intersects visible range
            const visible = startOffset < days && (startOffset + barDays) > 0;
            const clampedLeft  = Math.max(0, barLeft);
            const clampedWidth = Math.min(barWidth, (days * dayW) - clampedLeft);

            const isDone   = Tasks.isDoneColumn(task);
            const due      = Tasks.formatDueDate(task.dueDate);

            return `<div class="timeline-row">
                <div class="timeline-task-label" data-task-id="${task.id}" title="${escHtml(task.title)}">
                    <span style="margin-right:6px;">${Tasks.priorityDot(task.priority)}</span>
                    ${escHtml(task.title)}
                </div>
                <div class="timeline-bars-area" style="width:${days * dayW}px;">
                    ${todayOffset >= 0 && todayOffset < days ? `
                        <div class="timeline-today-line" style="left:${todayOffset * dayW}px;"></div>` : ''}
                    ${visible ? `
                        <div class="timeline-bar"
                             data-task-id="${task.id}"
                             title="${escHtml(task.title)}${task.dueDate ? '\nDue: '+task.dueDate : ''}"
                             style="left:${clampedLeft}px;width:${clampedWidth}px;background:${barColor};${isDone ? 'opacity:0.45;' : ''}">
                            <span class="timeline-bar-text">${escHtml(task.title)}</span>
                        </div>` : ''}
                </div>
            </div>`;
        }).join('');

        container.innerHTML = navHtml + `
            <div class="timeline-grid" style="min-width:${totalWidth}px;">
                <div class="timeline-header-row">
                    <div class="timeline-task-label-col">Task</div>
                    <div class="timeline-dates-header">${headerDates}</div>
                </div>
                ${rowsHtml}
            </div>`;

        // Nav buttons
        container.querySelector('#tlPrev')?.addEventListener('click', () => {
            _viewStart = new Date(_viewStart.getTime() - (_zoom === 'week' ? 14 : 30) * 86400000);
            render();
        });
        container.querySelector('#tlNext')?.addEventListener('click', () => {
            _viewStart = new Date(_viewStart.getTime() + (_zoom === 'week' ? 14 : 30) * 86400000);
            render();
        });
        container.querySelector('#tlToday')?.addEventListener('click', () => {
            _viewStart = getWeekStart(new Date());
            render();
        });

        // Click task to open panel
        container.querySelectorAll('[data-task-id]').forEach(el => {
            el.addEventListener('click', () => UI.openTaskPanel(parseInt(el.dataset.taskId, 10)));
        });
    }

    function updateProjectFilter() {
        const sel = document.getElementById('timelineProjectFilter');
        if (!sel) return;
        const projects = State.Projects.getAll();
        sel.innerHTML = '<option value="all">All Projects</option>' +
            projects.map(p => `<option value="${p.id}"${String(p.id) === _projectFilter ? ' selected' : ''}>${escHtml(p.name)}</option>`).join('');
    }

    function getWeekStart(date) {
        const d    = new Date(date);
        const day  = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        d.setDate(diff);
        d.setHours(0,0,0,0);
        return d;
    }

    function escHtml(str) {
        return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function init() {
        // Zoom toggles
        document.getElementById('timelineZoomWeek')?.addEventListener('click', () => {
            _zoom = 'week';
            _viewStart = getWeekStart(new Date());
            document.getElementById('timelineZoomWeek')?.classList.add('active');
            document.getElementById('timelineZoomMonth')?.classList.remove('active');
            if (Router.getCurrent().view === 'timeline') render();
        });

        document.getElementById('timelineZoomMonth')?.addEventListener('click', () => {
            _zoom = 'month';
            const d = new Date();
            d.setDate(1); d.setHours(0,0,0,0);
            _viewStart = d;
            document.getElementById('timelineZoomMonth')?.classList.add('active');
            document.getElementById('timelineZoomWeek')?.classList.remove('active');
            if (Router.getCurrent().view === 'timeline') render();
        });

        // Project filter
        document.getElementById('timelineProjectFilter')?.addEventListener('change', (e) => {
            _projectFilter = e.target.value;
            if (Router.getCurrent().view === 'timeline') render();
        });

        State.on('tasks:changed', () => {
            if (Router.getCurrent().view === 'timeline') render();
        });
    }

    return { init, render };
})();

window.Timeline = Timeline;
