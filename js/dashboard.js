/**
 * FlowBoard — Dashboard
 * The landing view: what's running now, what's logged today, what's due,
 * and a week-at-a-glance of tracked time.
 */

const Dashboard = (() => {
    const DAY_MS = 86400000;

    function esc(s) { return UI.escHtml(s); }

    // ── Date helpers ──────────────────────────────────────
    function startOfDay(d) {
        const x = new Date(d);
        x.setHours(0, 0, 0, 0);
        return x;
    }

    /** Seconds logged on `day`, using each entry's start time. */
    function secondsOn(day) {
        const from = startOfDay(day).getTime();
        const to   = from + DAY_MS;

        return State.Tasks.getAll().reduce((total, task) => {
            return total + (task.timeEntries || []).reduce((sum, e) => {
                const at = Date.parse(e.startedAt || e.date);
                return (at >= from && at < to) ? sum + (Number(e.duration) || 0) : sum;
            }, 0);
        }, 0);
    }

    function lastNDays(n) {
        const today = startOfDay(new Date());
        return Array.from({ length: n }, (_, i) => {
            const day = new Date(today.getTime() - (n - 1 - i) * DAY_MS);
            return { day, seconds: secondsOn(day) };
        });
    }

    // ── Sections ──────────────────────────────────────────
    function renderNowCard() {
        const running = State.Timer.getRunning();

        if (!running) {
            return `
                <div class="dash-card dash-card--now is-idle">
                    <p class="dash-card-label">Currently tracking</p>
                    <p class="dash-now-empty">Nothing running</p>
                    <p class="dash-card-sub">Start a timer from any task, or press <kbd>T</kbd> on a focused row.</p>
                </div>`;
        }

        const proj = running.projectId ? State.Projects.get(running.projectId) : null;
        return `
            <div class="dash-card dash-card--now">
                <p class="dash-card-label">Currently tracking</p>
                <p class="dash-now-timer" id="dashNowTimer">${Tasks.formatElapsed(State.Timer.getElapsed(running.id))}</p>
                <button type="button" class="dash-now-task" data-open-task="${running.id}">
                    ${Tasks.priorityDot(running.priority)}
                    <span>${esc(running.title)}</span>
                </button>
                <p class="dash-card-sub">${proj ? esc(proj.name) : 'No project'}</p>
                <button type="button" class="btn btn-success btn-sm mt-2" id="dashStopTimer">
                    <i class="fa-solid fa-stop" aria-hidden="true"></i> Stop timer
                </button>
            </div>`;
    }

    function renderStats() {
        const todaySec = secondsOn(new Date());
        const week = lastNDays(7);
        const weekSec = week.reduce((s, d) => s + d.seconds, 0);

        const all = State.Tasks.getAll();
        const openTasks = all.filter(t => !Tasks.isDoneColumn(t));
        const overdue = openTasks.filter(t => {
            const due = Tasks.formatDueDate(t.dueDate);
            return due && due.cls === 'overdue';
        });

        const cards = [
            { label: 'Tracked today', value: State.formatDuration(todaySec) || '0m', icon: 'fa-stopwatch' },
            { label: 'This week',     value: State.formatDuration(weekSec) || '0m',  icon: 'fa-calendar-week' },
            { label: 'Open tasks',    value: String(openTasks.length),                icon: 'fa-list-check' },
            { label: 'Overdue',       value: String(overdue.length),                  icon: 'fa-triangle-exclamation',
              tone: overdue.length ? 'danger' : '' },
        ];

        return cards.map(c => `
            <div class="dash-stat${c.tone ? ` dash-stat--${c.tone}` : ''}">
                <span class="dash-stat-icon"><i class="fa-solid ${c.icon}" aria-hidden="true"></i></span>
                <span class="dash-stat-value">${esc(c.value)}</span>
                <span class="dash-stat-label">${esc(c.label)}</span>
            </div>`).join('');
    }

    function renderWeekChart() {
        const week = lastNDays(7);
        const max = Math.max(1, ...week.map(d => d.seconds));

        const bars = week.map(({ day, seconds }) => {
            const pct = (seconds / max) * 100;
            const isToday = startOfDay(day).getTime() === startOfDay(new Date()).getTime();
            const label = day.toLocaleDateString(undefined, { weekday: 'short' });
            const title = `${label}: ${State.formatDuration(seconds) || '0m'}`;
            return `
                <div class="dash-bar-col${isToday ? ' is-today' : ''}" title="${esc(title)}">
                    <div class="dash-bar-track">
                        <div class="dash-bar-fill" style="height:${seconds ? Math.max(pct, 3) : 0}%"></div>
                    </div>
                    <span class="dash-bar-label">${esc(label)}</span>
                </div>`;
        }).join('');

        return `
            <div class="dash-card">
                <div class="dash-card-head">
                    <p class="dash-card-label">Last 7 days</p>
                    <span class="dash-card-total">${State.formatDuration(week.reduce((s, d) => s + d.seconds, 0)) || '0m'}</span>
                </div>
                <div class="dash-bars">${bars}</div>
            </div>`;
    }

    function renderFocusList() {
        const all = State.Tasks.getAll().filter(t => !Tasks.isDoneColumn(t));

        // Overdue first, then due today, then the soonest — the order you'd
        // actually work in.
        const scored = all
            .map(t => {
                const due = Tasks.formatDueDate(t.dueDate);
                if (!due) return null;
                const rank = due.cls === 'overdue' ? 0 : due.cls === 'today' ? 1 : due.cls === 'soon' ? 2 : 3;
                return rank <= 2 ? { task: t, due, rank } : null;
            })
            .filter(Boolean)
            .sort((a, b) => a.rank - b.rank || String(a.task.dueDate).localeCompare(String(b.task.dueDate)))
            .slice(0, 6);

        if (!scored.length) {
            return `
                <div class="dash-card">
                    <p class="dash-card-label">Needs attention</p>
                    ${UI.emptyState({ icon: 'fa-mug-hot', title: 'Nothing due', body: 'No overdue or upcoming tasks.' })}
                </div>`;
        }

        return `
            <div class="dash-card">
                <p class="dash-card-label">Needs attention</p>
                <div class="dash-task-list">
                    ${scored.map(({ task, due }) => {
                        const proj = task.projectId ? State.Projects.get(task.projectId) : null;
                        return `
                        <button type="button" class="dash-task-row" data-open-task="${task.id}" data-task-id="${task.id}">
                            ${Tasks.priorityDot(task.priority)}
                            <span class="dash-task-title">${esc(task.title)}</span>
                            <span class="dash-task-proj">${proj ? esc(proj.name) : ''}</span>
                            <span class="due-date-chip ${due.cls}">${esc(due.text)}</span>
                        </button>`;
                    }).join('')}
                </div>
            </div>`;
    }

    function renderActivity() {
        const items = (State.Activity.getAll() || []).slice(-8).reverse();
        if (!items.length) {
            return `
                <div class="dash-card">
                    <p class="dash-card-label">Recent activity</p>
                    <p class="activity-empty">Nothing yet — activity shows up here as you work.</p>
                </div>`;
        }

        return `
            <div class="dash-card">
                <p class="dash-card-label">Recent activity</p>
                <div class="activity-feed">
                    ${items.map(a => `
                        <div class="activity-item">
                            <span class="activity-avatar" aria-hidden="true">${esc((a.user || 'U')[0].toUpperCase())}</span>
                            <div class="activity-body">
                                <span class="activity-text">
                                    <strong>${esc(a.user || 'Someone')}</strong>
                                    ${esc(String(a.action || '').replace(/_/g, ' '))}
                                    ${a.taskTitle ? `<span class="activity-extra">${esc(a.taskTitle)}</span>` : ''}
                                </span>
                                <time class="activity-time">${esc(UI.timeAgo(a.at))}</time>
                            </div>
                        </div>`).join('')}
                </div>
            </div>`;
    }

    // ── Render ────────────────────────────────────────────
    function render() {
        const container = document.getElementById('dashboardGrid');
        if (!container) return;

        const projects = State.Projects.getAll();
        if (!projects.length) {
            container.innerHTML = UI.emptyState({
                icon: 'fa-rocket',
                title: 'Welcome to FlowBoard',
                body: 'Create your first project to start tracking tasks and time.',
                action: { id: 'dashFirstProject', label: 'Create a project', icon: 'fa-plus' },
            });
            container.querySelector('#dashFirstProject')
                ?.addEventListener('click', () => Projects.openModal());
            return;
        }

        container.innerHTML = `
            <div class="dash-stats">${renderStats()}</div>
            <div class="dash-row">
                ${renderNowCard()}
                ${renderWeekChart()}
            </div>
            <div class="dash-row">
                ${renderFocusList()}
                ${renderActivity()}
            </div>`;

        container.querySelectorAll('[data-open-task]').forEach(el => {
            el.addEventListener('click', () => UI.openTaskPanel(parseInt(el.dataset.openTask, 10)));
        });

        container.querySelector('#dashStopTimer')?.addEventListener('click', () => {
            const running = State.Timer.getRunning();
            if (running) State.Timer.stop(running.id);
        });

        updateGreeting();
    }

    function updateGreeting() {
        const el = document.getElementById('dashGreeting');
        if (!el) return;
        const h = new Date().getHours();
        const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
        const name = (localStorage.getItem('username') || '').split(' ')[0];
        el.textContent = name ? `${part}, ${name}` : part;
    }

    function init() {
        // Keep the live timer readout ticking without re-rendering the view.
        State.on('timer:tick', ({ elapsed }) => {
            const el = document.getElementById('dashNowTimer');
            if (el) el.textContent = Tasks.formatElapsed(elapsed);
        });

        ['timer:started', 'timer:stopped', 'tasks:changed', 'projects:changed', 'state:reset']
            .forEach(evt => State.on(evt, () => {
                if (document.getElementById('view-dashboard')?.classList.contains('active')) render();
            }));
    }

    return { init, render };
})();

window.Dashboard = Dashboard;
