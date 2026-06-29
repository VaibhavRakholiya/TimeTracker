/**
 * FlowBoard — Sprints Module
 * Sprint modal (create/edit), sprint lifecycle actions.
 */

const Sprints = (() => {
    let _editingSprintId = null;

    // ── Modal ──────────────────────────────────────────────
    function openModal(sprintId, defaults) {
        _editingSprintId = sprintId || null;
        const modal   = document.getElementById('sprintModalScrim');
        const titleEl = document.getElementById('sprintModalTitle');
        const saveBtn = document.getElementById('sprintModalSave');
        const projSel = document.getElementById('sprintModalProject');

        Projects.populateProjectSelect(projSel, false);
        projSel.innerHTML = '<option value="">All Projects</option>' + projSel.innerHTML;

        if (_editingSprintId) {
            const sprint = State.Sprints.get(_editingSprintId);
            titleEl.textContent  = 'Edit Sprint';
            saveBtn.textContent  = 'Save Changes';
            document.getElementById('sprintModalId').value    = _editingSprintId;
            document.getElementById('sprintModalName').value  = sprint.name;
            document.getElementById('sprintModalGoal').value  = sprint.goal || '';
            document.getElementById('sprintModalStart').value = sprint.startDate || '';
            document.getElementById('sprintModalEnd').value   = sprint.endDate   || '';
            if (sprint.projectId) projSel.value = sprint.projectId;
        } else {
            titleEl.textContent = 'New Sprint';
            saveBtn.textContent = 'Create Sprint';
            document.getElementById('sprintModalId').value    = '';
            document.getElementById('sprintModalName').value  = suggestSprintName();
            document.getElementById('sprintModalGoal').value  = '';
            document.getElementById('sprintModalStart').value = defaults?.startDate || todayStr();
            document.getElementById('sprintModalEnd').value   = defaults?.endDate   || twoWeeksStr();
            if (defaults?.projectId) projSel.value = defaults.projectId;
        }

        modal.classList.add('open');
        setTimeout(() => document.getElementById('sprintModalName').focus(), 100);
    }

    function closeModal() {
        document.getElementById('sprintModalScrim').classList.remove('open');
    }

    function save() {
        const name = document.getElementById('sprintModalName').value.trim();
        if (!name) {
            UI.toast('Sprint name is required', 'error');
            return;
        }

        const projId = parseInt(document.getElementById('sprintModalProject').value, 10) || null;
        const fields = {
            name,
            goal:      document.getElementById('sprintModalGoal').value.trim(),
            startDate: document.getElementById('sprintModalStart').value || null,
            endDate:   document.getElementById('sprintModalEnd').value   || null,
            projectId: projId,
        };

        if (_editingSprintId) {
            State.Sprints.update(_editingSprintId, fields);
            UI.toast('Sprint updated', 'success');
        } else {
            State.Sprints.create(fields);
            UI.toast(`Sprint "${fields.name}" created`, 'success');
        }

        closeModal();
        const { view, projectId } = Router.getCurrent();
        if (view === 'backlog') Backlog.render(projectId);
    }

    function suggestSprintName() {
        const sprints = State.Sprints.getAll();
        return `Sprint ${sprints.length + 1}`;
    }

    function todayStr() {
        return new Date().toISOString().split('T')[0];
    }

    function twoWeeksStr() {
        const d = new Date();
        d.setDate(d.getDate() + 14);
        return d.toISOString().split('T')[0];
    }

    function init() {
        // New sprint button
        document.getElementById('createSprintBtn')?.addEventListener('click', () => {
            const pid = Router.getCurrentProjectId();
            openModal(null, { projectId: pid });
        });

        // Modal controls
        document.getElementById('sprintModalClose')?.addEventListener('click', closeModal);
        document.getElementById('sprintModalCancel')?.addEventListener('click', closeModal);
        document.getElementById('sprintModalScrim')?.addEventListener('click', e => {
            if (e.target === document.getElementById('sprintModalScrim')) closeModal();
        });
        document.getElementById('sprintModalSave')?.addEventListener('click', save);
    }

    return { init, openModal, closeModal };
})();

window.Sprints = Sprints;
