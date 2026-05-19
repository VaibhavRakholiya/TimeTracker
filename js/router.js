/**
 * FlowBoard — Router
 * Hash-based SPA routing. Routes:
 *   #dashboard
 *   #board/:projectId   (project task list; no bare #board)
 *   #backlog/:projectId
 *   #timeline
 *   #reports
 *   #mytasks
 *   #settings
 */

const Router = (() => {
    const VIEWS = {
        dashboard: 'view-dashboard',
        board:     'view-board',
        backlog:   'view-backlog',
        timeline:  'view-timeline',
        reports:   'view-reports',
        mytasks:   'view-mytasks',
        settings:  'view-settings',
    };

    let _currentRoute = null;
    let _currentProjectId = null;

    function parseHash(hash) {
        const raw = (hash || window.location.hash).replace(/^#/, '').replace(/\/$/, '');
        const parts = raw.split('/').filter(p => p !== '');
        const view = parts[0] || 'dashboard';
        let projectId = null;
        if (parts.length > 1) {
            const n = parseInt(parts[1], 10);
            projectId = Number.isNaN(n) ? null : n;
        }
        return { view, projectId };
    }

    /**
     * Project tasks view is only reachable with #board/:projectId (e.g. from the Projects list).
     * Other sections use a single-segment hash so a project id never "sticks" to them.
     */
    function navigate(view, projectId) {
        const v = VIEWS[view] ? view : 'dashboard';

        if (v !== 'board' && v !== 'backlog') {
            window.location.hash = `#${v}`;
            return;
        }

        const idNum = projectId != null ? Number(projectId) : NaN;
        if (v === 'board') {
            if (!Number.isFinite(idNum)) {
                window.location.hash = '#dashboard';
                return;
            }
            window.location.hash = `#board/${Math.floor(idNum)}`;
            return;
        }

        // backlog — optional project id
        if (Number.isFinite(idNum)) window.location.hash = `#backlog/${Math.floor(idNum)}`;
        else window.location.hash = '#backlog';
    }

    function activate({ view, projectId }) {
        // Never show board without a concrete project (invalid or bookmarked #board)
        if (view === 'board' && (projectId == null || !Number.isFinite(Number(projectId)))) {
            window.location.hash = '#dashboard';
            return;
        }

        const viewName = VIEWS[view] ? view : 'dashboard';
        _currentRoute    = viewName;
        _currentProjectId = projectId;

        // Swap active view
        Object.values(VIEWS).forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.remove('active');
        });

        const target = document.getElementById(VIEWS[viewName]);
        if (target) target.classList.add('active');

        // Highlight sidebar nav
        document.querySelectorAll('.nav-item[data-route]').forEach(el => {
            el.classList.toggle('active', el.dataset.route === viewName);
        });

        // Highlight project items
        document.querySelectorAll('.project-item[data-project-id]').forEach(el => {
            const pid = parseInt(el.dataset.projectId, 10);
            el.classList.toggle('active',
                (viewName === 'board' || viewName === 'backlog') && pid === projectId
            );
        });

        // Update breadcrumb
        updateBreadcrumb(viewName, projectId);

        // Trigger view-specific render
        renderView(viewName, projectId);
    }

    function renderView(view, projectId) {
        switch (view) {
            case 'dashboard':
                window.Dashboard  && Dashboard.render();
                break;
            case 'board':
                window.Board      && Board.render(projectId);
                break;
            case 'backlog':
                window.Backlog    && Backlog.render(projectId);
                break;
            case 'timeline':
                window.Timeline   && Timeline.render();
                break;
            case 'reports':
                window.Dashboard  && Dashboard.renderReports();
                break;
            case 'mytasks':
                window.Tasks      && Tasks.renderMyTasks();
                break;
            case 'settings':
                renderSettings();
                break;
        }
    }

    function updateBreadcrumb(view, projectId) {
        const bc = document.getElementById('headerBreadcrumb');
        if (!bc) return;

        const labels = {
            dashboard: 'Dashboard',
            board:     'Tasks',
            backlog:   'Backlog',
            timeline:  'Timeline',
            reports:   'Reports',
            mytasks:   'My Tasks',
            settings:  'Settings',
        };

        let html = '';
        if (projectId) {
            const proj = State.Projects.get(projectId);
            if (proj) {
                html = `<strong>${proj.name}</strong>
                        <span style="margin:0 4px;color:var(--text-tertiary);">/</span>
                        <span>${labels[view] || view}</span>`;
            } else {
                html = `<strong>${labels[view] || view}</strong>`;
            }
        } else {
            html = `<strong>${labels[view] || view}</strong>`;
        }
        bc.innerHTML = html;
    }

    function renderSettings() {
        const username = localStorage.getItem('username') || 'admin';
        const initial  = username[0].toUpperCase();
        const theme    = document.documentElement.getAttribute('data-theme') || 'dark';

        const av = document.getElementById('settingsAvatar');
        const un = document.getElementById('settingsUsername');
        if (av) av.textContent = initial;
        if (un) un.textContent = username;

        // Highlight active theme
        document.querySelectorAll('[data-theme-pick]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.themePick === theme);
        });
    }

    function getCurrent()   { return { view: _currentRoute, projectId: _currentProjectId }; }
    function getCurrentProjectId() { return _currentProjectId; }

    function init() {
        // Navigation click handlers
        document.querySelectorAll('.nav-item[data-route]').forEach(el => {
            el.addEventListener('click', () => navigate(el.dataset.route));
        });

        // Hash change
        window.addEventListener('hashchange', () => {
            const parsed = parseHash();
            activate(parsed);
        });

        // Initial load
        const parsed = parseHash();
        if (!parsed.view || !VIEWS[parsed.view]) {
            navigate('dashboard');
        } else {
            activate(parsed);
        }
    }

    return { init, navigate, getCurrent, getCurrentProjectId, renderView };
})();

window.Router = Router;
