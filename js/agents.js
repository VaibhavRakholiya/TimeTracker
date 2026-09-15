/**
 * FlowBoard — Agents Module
 * Agent profiles: the Settings list, the create/edit modal, and the
 * assignee picker shared by the task modal.
 *
 * An agent is a profile Claude adopts when it works a task. Profiles are
 * plain FlowBoard data, so the MCP server in mcp-server/ reads and writes
 * exactly the same records through Firebase.
 */

const Agents = (() => {
    const AGENT_COLORS = ['#6366f1','#3b82f6','#22c55e','#f59e0b','#ef4444','#ec4899','#8b5cf6','#06b6d4','#f97316','#10b981'];
    const MODELS = [
        { value: 'default', label: 'Default' },
        { value: 'opus',    label: 'Opus — deepest reasoning' },
        { value: 'sonnet',  label: 'Sonnet — balanced' },
        { value: 'haiku',   label: 'Haiku — fastest' },
    ];

    let _editingAgentId = null;
    let _selectedColor  = '#6366f1';

    const escHtml = (s) => UI.escHtml(s);

    // ── Identity helpers (shared with tasks.js / board.js / ui.js) ──
    /**
     * Who is shown on a card. An agent wins over the plain assignee string —
     * the string is kept in sync with the agent name so every legacy read site
     * (My Tasks, CSV export, command palette) still works untouched.
     */
    function assigneeFor(task) {
        if (!task) return null;
        const agent = task.agentId != null ? State.Agents.get(task.agentId) : null;
        if (agent) {
            return {
                name:    agent.name,
                badge:   agent.emoji || agent.name.charAt(0).toUpperCase(),
                color:   agent.color,
                title:   agent.role ? `${agent.name} — ${agent.role}` : agent.name,
                isAgent: true,
            };
        }
        if (!task.assignee) return null;
        return {
            name:    task.assignee,
            badge:   String(task.assignee).charAt(0).toUpperCase(),
            color:   null,
            title:   task.assignee,
            isAgent: false,
        };
    }

    function hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r},${g},${b},${alpha})`;
    }

    /** Avatar markup for a task's owner. sizeMod is '', '--xs' or '--sm'. */
    function assigneeChip(task, sizeMod) {
        const a = assigneeFor(task);
        if (!a) return '';
        const cls = `task-card-assignee${sizeMod ? ' task-card-assignee' + sizeMod : ''}` +
                    (a.isAgent ? ' task-card-assignee--agent' : '');
        const style = a.isAgent
            ? ` style="background:${hexToRgba(a.color, 0.15)};color:${a.color};border-color:${hexToRgba(a.color, 0.4)};"`
            : '';
        return `<div class="${cls}"${style} title="${escHtml(a.title)}">${escHtml(a.badge)}</div>`;
    }

    // ── Assignee picker (task modal) ───────────────────────
    /**
     * People and agents in one select. Values are namespaced `user:<name>` /
     * `agent:<id>` so a person and an agent sharing a name stay distinct.
     */
    function populateAssigneeSelect(sel, task) {
        if (!sel) return;
        const me = localStorage.getItem('username') || 'admin';

        // Every human name already in use, so editing a task assigned to a
        // legacy name doesn't silently reassign it.
        const people = new Set([me]);
        State.Tasks.getAll().forEach(t => {
            if (!t.agentId && t.assignee) people.add(t.assignee);
        });

        const agents = State.Agents.enabled();
        // A disabled agent still shows while it holds this task.
        if (task && task.agentId != null && !agents.some(a => a.id == task.agentId)) {
            const current = State.Agents.get(task.agentId);
            if (current) agents.push(current);
        }

        const peopleOpts = [...people].sort().map(n =>
            `<option value="user:${escHtml(n)}">${escHtml(n)}</option>`).join('');
        const agentOpts = agents.map(a =>
            `<option value="agent:${a.id}">${escHtml((a.emoji ? a.emoji + ' ' : '') + a.name)}</option>`).join('');

        sel.innerHTML =
            `<optgroup label="People">${peopleOpts}</optgroup>` +
            (agentOpts ? `<optgroup label="Agents">${agentOpts}</optgroup>` : '');

        sel.value = (task && task.agentId != null)
            ? `agent:${task.agentId}`
            : `user:${(task && task.assignee) || me}`;
        // A stale value (agent since deleted) leaves the select blank — fall back.
        if (!sel.value) sel.value = `user:${me}`;
    }

    /** Turn the select's value back into task fields. */
    function parseAssigneeValue(raw) {
        raw = String(raw || '');
        if (raw.startsWith('agent:')) {
            const agent = State.Agents.get(Number(raw.slice(6)));
            // assignee mirrors the agent name so string-based views keep working.
            if (agent) return { agentId: agent.id, assignee: agent.name };
            return { agentId: null, assignee: localStorage.getItem('username') || 'admin' };
        }
        return { agentId: null, assignee: raw.slice(5) };
    }

    // ── Settings list ──────────────────────────────────────
    function renderSettingsList() {
        const box = document.getElementById('settingsAgentsList');
        if (!box) return;

        const agents = State.Agents.getAll();
        if (!agents.length) {
            box.innerHTML = UI.emptyState({
                icon:  'fa-robot',
                title: 'No agents yet',
                body:  'Create an agent, then assign it a task and ask Claude to work its queue.',
            });
            return;
        }

        box.innerHTML = agents.map(a => {
            const count  = State.Agents.taskCount(a.id);
            const badge  = escHtml(a.emoji || a.name.charAt(0).toUpperCase());
            const status = State.Agents.statusFor(a.id);
            const statusHtml = status.working
                ? `<span class="agent-row-pill agent-row-pill--working" title="${escHtml(status.currentTask?.title || '')}">
                       Working on ${escHtml(status.currentTask?.taskKey || 'a task')}
                   </span>${status.queueLength ? `<span class="agent-row-pill">+${status.queueLength} queued</span>` : ''}`
                : '<span class="agent-row-pill agent-row-pill--idle">Idle</span>';
            return `
            <div class="agent-row" data-agent-id="${a.id}">
                <div class="task-card-assignee task-card-assignee--agent agent-row-avatar"
                     style="background:${hexToRgba(a.color, 0.15)};color:${a.color};border-color:${hexToRgba(a.color, 0.4)};"
                     aria-hidden="true">${badge}</div>
                <div class="agent-row-main">
                    <div class="agent-row-name">
                        ${escHtml(a.name)}
                        ${a.enabled === false ? '<span class="agent-row-pill">Disabled</span>' : ''}
                        ${statusHtml}
                    </div>
                    <div class="agent-row-meta">
                        <code class="agent-row-slug">${escHtml(a.slug)}</code>
                        ${a.role ? ' · ' + escHtml(a.role) : ''}
                    </div>
                </div>
                <div class="agent-row-count text-muted text-sm">${count} task${count === 1 ? '' : 's'}</div>
                <button class="btn btn-ghost btn-sm" data-agent-edit="${a.id}">
                    <i class="fa-solid fa-pen" aria-hidden="true"></i> Edit
                </button>
                <button class="btn btn-ghost btn-sm" data-agent-delete="${a.id}" aria-label="Delete ${escHtml(a.name)}">
                    <i class="fa-solid fa-trash" aria-hidden="true"></i>
                </button>
            </div>`;
        }).join('');

        box.querySelectorAll('[data-agent-edit]').forEach(btn => {
            btn.addEventListener('click', () => openModal(Number(btn.dataset.agentEdit)));
        });
        box.querySelectorAll('[data-agent-delete]').forEach(btn => {
            btn.addEventListener('click', () => confirmDelete(Number(btn.dataset.agentDelete)));
        });
    }

    function confirmDelete(id) {
        const agent = State.Agents.get(id);
        if (!agent) return;
        const count = State.Agents.taskCount(id);
        // Say plainly that nothing is lost — only the link.
        const message = count
            ? `${count} task${count === 1 ? '' : 's'} will keep the name "${agent.name}" but will no longer be linked to this agent. No tasks are deleted.`
            : 'This agent is not assigned to any tasks.';

        UI.confirm(message, () => {
            State.Agents.delete(id);
            renderSettingsList();
            UI.toast('Agent deleted', 'success');
        }, 'Delete Agent', 'btn-danger', { title: `Delete "${agent.name}"?` });
    }

    // ── Modal ──────────────────────────────────────────────
    function openModal(agentId) {
        _editingAgentId = agentId || null;
        const agent = _editingAgentId ? State.Agents.get(_editingAgentId) : null;

        document.getElementById('agentModalTitle').textContent = agent ? 'Edit Agent' : 'New Agent';
        document.getElementById('agentModalSave').textContent  = agent ? 'Save Changes' : 'Create Agent';

        document.getElementById('agentModalName').value    = agent ? agent.name : '';
        document.getElementById('agentModalEmoji').value    = agent ? agent.emoji : '';
        document.getElementById('agentModalRole').value     = agent ? agent.role : '';
        document.getElementById('agentModalPrompt').value   = agent ? agent.systemPrompt : '';
        document.getElementById('agentModalEnabled').checked = agent ? agent.enabled !== false : true;

        const modelSel = document.getElementById('agentModalModel');
        modelSel.innerHTML = MODELS.map(m =>
            `<option value="${m.value}">${escHtml(m.label)}</option>`).join('');
        modelSel.value = agent ? agent.model : 'default';

        _selectedColor = agent ? agent.color : AGENT_COLORS[0];
        renderColors();
        updateSlugHint();

        document.getElementById('agentModalScrim').classList.add('open');
        setTimeout(() => document.getElementById('agentModalName').focus(), 100);
    }

    function closeModal() {
        document.getElementById('agentModalScrim').classList.remove('open');
        _editingAgentId = null;
    }

    function renderColors() {
        const box = document.getElementById('agentModalColors');
        if (!box) return;
        box.innerHTML = AGENT_COLORS.map(c => `
            <button type="button" class="color-swatch${c === _selectedColor ? ' selected' : ''}"
                    style="background:${c}" data-color="${c}" aria-label="Color ${c}"></button>`).join('');
        box.querySelectorAll('[data-color]').forEach(btn => {
            btn.addEventListener('click', () => {
                _selectedColor = btn.dataset.color;
                renderColors();
            });
        });
    }

    /** Show the handle Claude will use, live, so it is never a surprise. */
    function updateSlugHint() {
        const hint = document.getElementById('agentModalSlugHint');
        if (!hint) return;
        const name = document.getElementById('agentModalName').value.trim();
        const existing = _editingAgentId ? State.Agents.get(_editingAgentId) : null;
        // Editing keeps the established slug — renaming must not break the
        // handle Claude may already be using.
        const slug = existing ? existing.slug : slugPreview(name);
        hint.innerHTML = name || existing
            ? `Claude refers to this agent as <code>${escHtml(slug)}</code>`
            : 'Claude refers to agents by a short handle derived from the name.';
    }

    function slugPreview(name) {
        return String(name || 'agent').toLowerCase()
            .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'agent';
    }

    function save() {
        const name = document.getElementById('agentModalName').value.trim();
        if (!name) {
            UI.toast('Agent name is required', 'error');
            document.getElementById('agentModalName').focus();
            return;
        }

        const fields = {
            name,
            emoji:        document.getElementById('agentModalEmoji').value.trim(),
            color:        _selectedColor,
            role:         document.getElementById('agentModalRole').value.trim(),
            systemPrompt: document.getElementById('agentModalPrompt').value.trim(),
            model:        document.getElementById('agentModalModel').value,
            enabled:      document.getElementById('agentModalEnabled').checked,
        };

        if (_editingAgentId) {
            State.Agents.update(_editingAgentId, fields);
            UI.toast('Agent updated', 'success');
        } else {
            const created = State.Agents.create(fields);
            UI.toast(`Agent "${created.name}" created`, 'success');
        }

        closeModal();
        renderSettingsList();
        // Cards may show a renamed agent.
        const { view, projectId } = Router.getCurrent();
        Router.renderView(view, projectId);
    }

    // ── Init ───────────────────────────────────────────────
    function init() {
        document.getElementById('addAgentBtn')?.addEventListener('click', () => openModal());
        document.getElementById('agentModalClose')?.addEventListener('click', closeModal);
        document.getElementById('agentModalCancel')?.addEventListener('click', closeModal);
        document.getElementById('agentModalSave')?.addEventListener('click', save);
        document.getElementById('agentModalName')?.addEventListener('input', updateSlugHint);
        document.getElementById('agentModalScrim')?.addEventListener('click', e => {
            if (e.target === document.getElementById('agentModalScrim')) closeModal();
        });

        State.on('agents:changed', () => renderSettingsList());
    }

    return {
        init, openModal, closeModal, renderSettingsList,
        assigneeFor, assigneeChip, populateAssigneeSelect, parseAssigneeValue,
        COLORS: AGENT_COLORS,
    };
})();

window.Agents = Agents;
