/**
 * FlowBoard — Dashboard & Reports Module
 * Renders stat cards, donut chart, sprint progress, due-soon list,
 * activity feed, and the Reports view with bar charts.
 */

const Dashboard = (() => {

    // ── Dashboard render ───────────────────────────────────
    function render() {
        renderStats();
        renderDonutChart();
        renderSprintWidget();
        renderDueSoon();
        renderActivity();
        updateGreeting();
    }

    function updateGreeting() {
        const hour = new Date().getHours();
        let greeting = 'Good morning';
        if (hour >= 12 && hour < 17) greeting = 'Good afternoon';
        if (hour >= 17) greeting = 'Good evening';
        const el = document.getElementById('dashboardGreeting');
        if (el) el.textContent = `${greeting}, ${localStorage.getItem('username') || 'there'}!`;
    }

    function renderStats() {
        const tasks    = State.Tasks.getAll();
        const total    = tasks.length;
        const done     = tasks.filter(t => Tasks.isDoneColumn(t)).length;
        const inProg   = tasks.filter(t => {
            const col = State.getColumnById(t.projectId, t.columnId);
            return col && col.name.toLowerCase().includes('progress');
        }).length;

        setStatEl('stat-total-tasks', total);
        setStatEl('stat-in-progress', inProg);
        setStatEl('stat-completed',   done);
    }

    function setStatEl(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    // ── Donut chart (Canvas API) ───────────────────────────
    function renderDonutChart() {
        const canvas = document.getElementById('donutChart');
        const legend = document.getElementById('donutLegend');
        if (!canvas || !legend) return;

        const tasks = State.Tasks.getAll();

        // Collect column names across all projects
        const colMap = {};
        State.Projects.getAll().forEach(proj => {
            proj.columns.forEach(col => {
                if (!colMap[col.name]) colMap[col.name] = { count: 0, color: col.color };
            });
        });
        tasks.forEach(t => {
            const col = State.getColumnById(t.projectId, t.columnId);
            const name = col?.name || 'Unassigned';
            if (!colMap[name]) colMap[name] = { count: 0, color: '#6b7280' };
            colMap[name].count++;
        });

        const entries = Object.entries(colMap).filter(([, v]) => v.count > 0);
        const total   = entries.reduce((s, [, v]) => s + v.count, 0);

        const ctx    = canvas.getContext('2d');
        const cx     = canvas.width  / 2;
        const cy     = canvas.height / 2;
        const radius = 45;
        const inner  = 28;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!total) {
            // Empty state circle
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.strokeStyle = getComputedStyle(document.documentElement)
                .getPropertyValue('--border') || 'rgba(255,255,255,0.08)';
            ctx.lineWidth = radius - inner;
            ctx.stroke();
            legend.innerHTML = '<span class="text-muted text-sm">No tasks yet</span>';
            return;
        }

        let startAngle = -Math.PI / 2;
        entries.forEach(([name, { count, color }]) => {
            const sweep = (count / total) * (Math.PI * 2);
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, radius, startAngle, startAngle + sweep);
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();
            startAngle += sweep;
        });

        // Inner hole
        ctx.beginPath();
        ctx.arc(cx, cy, inner, 0, Math.PI * 2);
        ctx.fillStyle = getComputedStyle(document.documentElement)
            .getPropertyValue('--surface') || '#1e1e24';
        ctx.fill();

        // Center label
        ctx.fillStyle = getComputedStyle(document.documentElement)
            .getPropertyValue('--text') || '#f1f1f3';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(total, cx, cy);

        // Legend
        legend.innerHTML = entries.map(([name, { count, color }]) => `
            <div class="donut-legend-item">
                <div class="legend-dot" style="background:${color};"></div>
                <span>${escHtml(name)}</span>
                <span class="legend-count">${count}</span>
            </div>
        `).join('');
    }

    // ── Sprint widget ──────────────────────────────────────
    function renderSprintWidget() {
        const sprint = State.Sprints.active();
        const nameEl  = document.getElementById('sprintWidgetName');
        const pctEl   = document.getElementById('sprintWidgetPercent');
        const fillEl  = document.getElementById('sprintProgressFill');
        const doneEl  = document.getElementById('sprintWidgetDone');
        const totalEl = document.getElementById('sprintWidgetTotal');

        if (!sprint) {
            if (nameEl)  nameEl.textContent  = 'No active sprint';
            if (pctEl)   pctEl.textContent   = '—';
            if (fillEl)  fillEl.style.width  = '0%';
            if (doneEl)  doneEl.textContent  = '0 done';
            if (totalEl) totalEl.textContent = '0 total';
            return;
        }

        const tasks = State.Tasks.bySprint(sprint.id);
        const done  = tasks.filter(t => Tasks.isDoneColumn(t)).length;
        const total = tasks.length;
        const pct   = total > 0 ? Math.round((done / total) * 100) : 0;

        if (nameEl)  nameEl.textContent  = sprint.name;
        if (pctEl)   pctEl.textContent   = `${pct}%`;
        if (fillEl)  { fillEl.style.width = `${pct}%`; fillEl.className = `progress-fill${pct === 100 ? ' success' : ''}`; }
        if (doneEl)  doneEl.textContent  = `${done} done`;
        if (totalEl) totalEl.textContent = `${total} total`;
    }

    // ── Due soon ───────────────────────────────────────────
    function renderDueSoon() {
        const container = document.getElementById('dueSoonList');
        if (!container) return;

        const now    = new Date();
        const week   = new Date(now.getTime() + 7 * 86400000);
        const tasks  = State.Tasks.getAll()
            .filter(t => t.dueDate && !Tasks.isDoneColumn(t))
            .filter(t => new Date(t.dueDate + 'T00:00:00') <= week)
            .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
            .slice(0, 8);

        if (!tasks.length) {
            container.innerHTML = `<div class="empty-state" style="padding:var(--sp-6) 0;">
                <i class="fa-solid fa-calendar-check" style="font-size:32px;opacity:0.3;"></i>
                <span class="text-sm text-muted">No tasks due soon</span>
            </div>`;
            return;
        }

        container.innerHTML = tasks.map(t => {
            const proj = t.projectId ? State.Projects.get(t.projectId) : null;
            const due  = Tasks.formatDueDate(t.dueDate);
            return `<div class="due-item" data-task-id="${t.id}">
<div class="due-item-info">
                    <div class="due-item-title">${escHtml(t.title)}</div>
                    <div class="due-item-project">${proj ? escHtml(proj.name) : 'No project'}</div>
                </div>
                ${due ? `<span class="due-date-chip ${due.cls}">${due.text}</span>` : ''}
            </div>`;
        }).join('');

        container.querySelectorAll('.due-item').forEach(el => {
            el.addEventListener('click', () => UI.openTaskPanel(parseInt(el.dataset.taskId, 10)));
        });
    }

    // ── Activity feed ──────────────────────────────────────
    function renderActivity() {
        const container = document.getElementById('activityFeed');
        if (!container) return;

        const items = State.Activity.getAll().slice(0, 10);

        if (!items.length) {
            container.innerHTML = `<div class="empty-state" style="padding:var(--sp-6) 0;">
                <i class="fa-solid fa-bolt" style="font-size:32px;opacity:0.3;"></i>
                <span class="text-sm text-muted">No recent activity</span>
            </div>`;
            return;
        }

        const actionLabels = {
            task_created:    'created task',
            task_moved:      'moved task',
            task_deleted:    'deleted task',
            task_duplicated: 'duplicated task',
            project_created: 'created project',
            project_duplicated: 'duplicated project',
            project_deleted: 'deleted project',
            sprint_created:  'created sprint',
            sprint_completed:'completed sprint',
            comment_added:   'commented on',
        };

        container.innerHTML = items.map(item => {
            const label = actionLabels[item.action] || item.action;
            const time  = timeAgo(new Date(item.at));
            const init  = (item.user || 'A')[0].toUpperCase();

            return `<div class="activity-item">
                <div class="activity-avatar">${init}</div>
                <div class="activity-content">
                    <div class="activity-text">
                        <strong>${escHtml(item.user)}</strong> ${label}
                        ${item.taskTitle ? `<strong>"${escHtml(item.taskTitle)}"</strong>` : ''}
                    </div>
                    <div class="activity-time">${time}</div>
                </div>
            </div>`;
        }).join('');
    }

    // ── Reports view ───────────────────────────────────────
    function renderReports() {
        const container = document.getElementById('reportsGrid');
        if (!container) return;

        // Set default date range (last 30 days)
        const endDate   = document.getElementById('reportEndDate');
        const startDate = document.getElementById('reportStartDate');
        if (endDate && !endDate.value)   endDate.value   = new Date().toISOString().split('T')[0];
        if (startDate && !startDate.value) {
            const d = new Date();
            d.setDate(d.getDate() - 30);
            startDate.value = d.toISOString().split('T')[0];
        }

        const start = startDate?.value ? new Date(startDate.value + 'T00:00:00') : null;
        const end   = endDate?.value   ? new Date(endDate.value   + 'T23:59:59') : null;

        container.innerHTML = '';

        // ── Time per project ─────────────────────────────
        const projects = State.Projects.getAll();
        const timeByProject = {};
        State.Tasks.getAll().forEach(t => {
            const projName = t.projectId
                ? (State.Projects.get(t.projectId)?.name || 'Unknown')
                : 'No Project';
            const secs = (t.timeEntries || []).reduce((sum, e) => {
                if (!start && !end) return sum + (e.duration || 0);
                const at = new Date(e.date);
                if (start && at < start) return sum;
                if (end   && at > end)   return sum;
                return sum + (e.duration || 0);
            }, 0);
            timeByProject[projName] = (timeByProject[projName] || 0) + secs;
        });

        const timeEntries = Object.entries(timeByProject)
            .filter(([, v]) => v > 0)
            .sort((a, b) => b[1] - a[1]);

        const maxSecs = Math.max(...timeEntries.map(([, v]) => v), 1);

        container.innerHTML += `
            <div class="chart-container">
                <div class="chart-header">
                    <div class="chart-title">Time Tracked by Project</div>
                </div>
                <div class="bar-chart">
                    ${timeEntries.length ? timeEntries.map(([name, secs]) => `
                        <div class="bar-chart-row">
                            <div class="bar-chart-label" title="${escHtml(name)}">${escHtml(name)}</div>
                            <div class="bar-chart-bar-wrap">
                                <div class="bar-chart-bar-fill" style="width:${(secs/maxSecs*100).toFixed(1)}%;"></div>
                            </div>
                            <div class="bar-chart-value">${Tasks.formatTime(secs)}</div>
                        </div>
                    `).join('') : '<div class="text-muted text-sm" style="padding:16px;">No time data for this range.</div>'}
                </div>
            </div>
        `;

        // ── Time breakdown table ─────────────────────────
        const tasksWithTime = State.Tasks.getAll()
            .filter(t => t.timeSpent > 0)
            .sort((a, b) => b.timeSpent - a.timeSpent)
            .slice(0, 20);

        container.innerHTML += `
            <div class="chart-container" style="grid-column:1/-1;">
                <div class="chart-header">
                    <div class="chart-title">Time Breakdown</div>
                </div>
                <div style="overflow-x:auto;">
                    <table class="time-table">
                        <thead>
                            <tr>
                                <th>Task</th>
                                <th>Project</th>
                                <th>Status</th>
                                <th>Time Spent</th>
                                <th>Estimate</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tasksWithTime.length ? tasksWithTime.map(t => {
                                const proj = t.projectId ? State.Projects.get(t.projectId) : null;
                                const col  = State.getColumnById(t.projectId, t.columnId);
                                return `<tr style="cursor:pointer;" data-task-row="${t.id}">
                                    <td style="font-weight:500;color:var(--text);">${escHtml(t.title)}</td>
                                    <td>${proj ? escHtml(proj.name) : '—'}</td>
                                    <td>${col ? `<span class="badge" style="background:${Tasks.hexToRgba(col.color,0.15)};color:${col.color};">${escHtml(col.name)}</span>` : '—'}</td>
                                    <td style="font-weight:600;">${Tasks.formatHours(t.timeSpent)}</td>
                                    <td>${t.timeEstimate ? Tasks.formatHours(t.timeEstimate) : '—'}</td>
                                </tr>`;
                            }).join('') : '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-tertiary);">No time data yet. Start a timer to track time.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        // Task row click
        container.querySelectorAll('[data-task-row]').forEach(el => {
            el.addEventListener('click', () => UI.openTaskPanel(parseInt(el.dataset.taskRow, 10)));
        });
    }

    // ── Utilities ──────────────────────────────────────────
    function timeAgo(date) {
        const diff = (Date.now() - date.getTime()) / 1000;
        if (diff < 60)    return 'just now';
        if (diff < 3600)  return `${Math.floor(diff/60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
        return `${Math.floor(diff/86400)}d ago`;
    }

    function escHtml(str) {
        return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function init() {
        // Refresh dashboard button
        document.getElementById('refreshDashboard')?.addEventListener('click', () => {
            render();
            State.loadFromFirebase().then(loaded => {
                if (loaded) { render(); UI.toast('Data synced from cloud', 'success'); }
            });
        });

        // Reports date range apply
        document.getElementById('applyReportRange')?.addEventListener('click', renderReports);

        // Listen for state changes
        State.on('tasks:changed',    () => { if (Router.getCurrent().view === 'dashboard') render(); });
        State.on('activity:changed', () => { if (Router.getCurrent().view === 'dashboard') renderActivity(); });
        State.on('sprints:changed',  () => { if (Router.getCurrent().view === 'dashboard') renderSprintWidget(); });
    }

    return { init, render, renderReports };
})();

window.Dashboard = Dashboard;
