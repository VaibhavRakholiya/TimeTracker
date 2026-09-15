/**
 * FlowBoard MCP tool handlers.
 *
 * Every handler is a plain exported async function taking a validated args
 * object, so smoke.js can exercise the exact code the MCP client calls with no
 * JSON-RPC in the loop. index.js only registers them.
 *
 * Writes go through store.mutate(), which is compare-and-set: the mutation
 * callback may run more than once, so it must stay side-effect free.
 */

import * as store from './store.js';
import * as D from './domain.js';

const REFRESH_HINT = 'Reload FlowBoard, or use Settings → Data → Refresh from Cloud, to see this on the board.';

// ── Read tools ─────────────────────────────────────────────

export async function list_projects() {
    const [projects, tasks] = await Promise.all([store.read('projects'), store.read('tasks')]);
    return projects.map(p => ({
        id:          p.id,
        name:        p.name,
        description: p.description || '',
        color:       p.color,
        columns:     (p.columns || []).slice()
                        .sort((a, b) => (a.position || 0) - (b.position || 0))
                        .map(c => ({ id: c.id, name: c.name, position: c.position })),
        taskCount:   tasks.filter(t => t.projectId == p.id).length,
    }));
}

export async function list_agents({ includeDisabled = false } = {}) {
    const [agents, tasks] = await Promise.all([store.read('agents'), store.read('tasks')]);
    return agents.map(D.hydrateAgent)
        .filter(a => includeDisabled || a.enabled)
        .map(a => ({
            id: a.id, slug: a.slug, name: a.name, emoji: a.emoji, color: a.color,
            role: a.role, model: a.model, enabled: a.enabled,
            // Included so Claude can adopt the profile without a second call.
            systemPrompt: a.systemPrompt,
            assignedTaskCount: tasks.filter(t => t.agentId == a.id).length,
        }));
}

export async function list_sprints({ projectId } = {}) {
    const [sprints, tasks] = await Promise.all([store.read('sprints'), store.read('tasks')]);
    return sprints
        .filter(s => projectId == null || s.projectId == projectId || s.projectId == null)
        .map(s => ({
            id: s.id, name: s.name, projectId: s.projectId, goal: s.goal || '',
            status: s.status, startDate: s.startDate, endDate: s.endDate,
            taskCount: tasks.filter(t => t.sprintId == s.id).length,
        }));
}

export async function list_tasks(args = {}) {
    const { projectId, sprintId, column, assignee, agent, priority,
            unassignedAgent, query, limit = 50 } = args;

    const [rawTasks, projects, agents] = await Promise.all([
        store.read('tasks'), store.read('projects'), store.read('agents'),
    ]);
    const tasks = rawTasks.map(D.hydrateTask);

    let agentId = null;
    if (agent != null && agent !== '') {
        const a = D.resolveAgent(agents.map(D.hydrateAgent), agent);
        if (!a) throw new Error(`No agent matches "${agent}". Use list_agents to see available agents.`);
        agentId = a.id;
    }

    const out = tasks.filter(t => {
        if (projectId != null && t.projectId != projectId) return false;
        if (sprintId  != null && t.sprintId  != sprintId)  return false;
        if (priority  != null && t.priority  !== priority) return false;
        if (assignee  != null && t.assignee  !== assignee) return false;
        if (agentId   != null && t.agentId   != agentId)   return false;
        if (unassignedAgent && t.agentId != null) return false;
        if (column != null && column !== '') {
            const proj = projects.find(p => p.id == t.projectId);
            const col  = D.resolveColumn(proj, column);
            if (!col || t.columnId !== col.id) return false;
        }
        if (query) {
            const q = String(query).toLowerCase();
            const hay = `${t.title} ${t.description} ${t.taskKey}`.toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });

    return out.slice(0, limit).map(t => summarize(t, projects, agents));
}

export async function get_task({ task }) {
    const [rawTasks, projects, agents, sprints] = await Promise.all([
        store.read('tasks'), store.read('projects'), store.read('agents'), store.read('sprints'),
    ]);
    const found = D.resolveTask(rawTasks, task);
    if (!found) throw new Error(`No task matches "${task}". Pass a numeric id or a key like TASK-12.`);

    const t = D.hydrateTask(found);
    const proj = projects.find(p => p.id == t.projectId);
    const agent = t.agentId != null ? D.resolveAgent(agents.map(D.hydrateAgent), t.agentId) : null;
    const labelIds = new Set(t.labels);

    return {
        ...t,
        projectName: proj?.name || null,
        columnName:  D.resolveColumn(proj, t.columnId)?.name || null,
        sprintName:  sprints.find(s => s.id == t.sprintId)?.name || null,
        labelNames:  (proj?.labels || []).filter(l => labelIds.has(l.id)).map(l => l.name),
        agent:       agent ? { id: agent.id, slug: agent.slug, name: agent.name, role: agent.role } : null,
        subtaskStats: countSubtasks(t.subtasks),
    };
}

// ── Write tools ────────────────────────────────────────────

export async function create_task(args) {
    const { projectId, title } = args;
    if (!title || !String(title).trim()) throw new Error('title is required.');

    const [projects, agents] = await Promise.all([store.read('projects'), store.read('agents')]);
    const project = projects.find(p => p.id == projectId);
    // Mirrors js/state.js Tasks.create — a task with no live project is refused.
    if (!project) throw new Error(`No project with id ${projectId}. Use list_projects first.`);

    const column = args.column ? D.resolveColumn(project, args.column) : D.getFirstColumn(project);
    if (args.column && !column) {
        throw new Error(`No column "${args.column}" in project "${project.name}". ` +
            `Available: ${(project.columns || []).map(c => c.name).join(', ')}.`);
    }

    const owner = resolveOwner(agents, args);

    return store.mutate('tasks', (tasks) => {
        const task = {
            id:             D.uniqueId(tasks),
            taskKey:        D.nextTaskKey(tasks),
            projectId:      project.id,
            sprintId:       args.sprintId ?? null,
            columnId:       column?.id ?? null,
            title:          String(title).trim(),
            description:    args.description || '',
            priority:       D.PRIORITIES.includes(args.priority) ? args.priority : 'medium',
            labels:         Array.isArray(args.labels) ? args.labels : [],
            assignee:       owner.assignee,
            agentId:        owner.agentId,
            startDate:      args.startDate || null,
            dueDate:        args.dueDate || null,
            timeEstimate:   args.timeEstimate ?? null,
            position:       D.nextPosition(tasks),
            timeSpent:      0,
            timeEntries:    [],
            subtasks:       [],
            comments:       [],
            isTimerRunning: false,
            timerStart:     null,
            timerNote:      '',
            createdAt:      new Date().toISOString(),
        };
        return { next: [...tasks, task], result: { task, hint: REFRESH_HINT } };
    });
}

const UPDATABLE = ['title', 'description', 'priority', 'dueDate', 'startDate',
                   'timeEstimate', 'sprintId', 'labels'];

export async function update_task(args) {
    const { task: ref } = args;
    const projects = await store.read('projects');

    return store.mutate('tasks', (tasks) => {
        const idx = tasks.findIndex(t => t === D.resolveTask(tasks, ref));
        if (idx === -1) throw new Error(`No task matches "${ref}".`);

        const merged = { ...D.hydrateTask(tasks[idx]) };
        let changed = false;
        for (const k of UPDATABLE) {
            if (args[k] !== undefined) { merged[k] = args[k]; changed = true; }
        }
        if (args.priority !== undefined && !D.PRIORITIES.includes(args.priority)) {
            throw new Error(`priority must be one of: ${D.PRIORITIES.join(', ')}.`);
        }
        if (!changed) return { next: undefined, result: { task: merged, hint: 'No fields to update.' } };

        // Mirrors js/state.js Tasks.update — never let an edit orphan the task.
        if (!D.taskHasValidProject(merged, projects)) {
            throw new Error('That change would leave the task without a valid project; nothing was written.');
        }

        const next = tasks.slice();
        next[idx] = merged;
        return { next, result: { task: merged, hint: REFRESH_HINT } };
    });
}

export async function move_task({ task: ref, column }) {
    const projects = await store.read('projects');

    return store.mutate('tasks', (tasks) => {
        const found = D.resolveTask(tasks, ref);
        if (!found) throw new Error(`No task matches "${ref}".`);
        const idx = tasks.indexOf(found);

        const project = projects.find(p => p.id == found.projectId);
        const col = D.resolveColumn(project, column);
        if (!col) {
            throw new Error(`No column "${column}" in project "${project?.name || found.projectId}". ` +
                `Available: ${(project?.columns || []).map(c => c.name).join(', ')}.`);
        }

        const updated = { ...D.hydrateTask(found), columnId: col.id };
        const next = tasks.slice();
        next[idx] = updated;
        return {
            next,
            result: { taskKey: updated.taskKey, columnId: col.id, columnName: col.name, hint: REFRESH_HINT },
        };
    });
}

export async function assign_task({ task: ref, agent, assignee }) {
    if ((agent == null || agent === '') && (assignee == null || assignee === '')) {
        throw new Error('Pass either `agent` (id or slug) or `assignee` (a person\'s name).');
    }
    const agents = await store.read('agents');
    const owner = resolveOwner(agents, { agent, assignee });

    return store.mutate('tasks', (tasks) => {
        const found = D.resolveTask(tasks, ref);
        if (!found) throw new Error(`No task matches "${ref}".`);
        const idx = tasks.indexOf(found);

        const updated = { ...D.hydrateTask(found), agentId: owner.agentId, assignee: owner.assignee };
        const next = tasks.slice();
        next[idx] = updated;
        return {
            next,
            result: {
                taskKey: updated.taskKey, assignee: updated.assignee,
                agentId: updated.agentId, agentSlug: owner.agentSlug, hint: REFRESH_HINT,
            },
        };
    });
}

export async function add_comment({ task: ref, text, author }) {
    if (!text || !String(text).trim()) throw new Error('text is required.');
    const agents = await store.read('agents');

    return store.mutate('tasks', (tasks) => {
        const found = D.resolveTask(tasks, ref);
        if (!found) throw new Error(`No task matches "${ref}".`);
        const idx = tasks.indexOf(found);
        const t = D.hydrateTask(found);

        // Default the author to the agent that owns the task, so the board
        // shows who actually did the work.
        const owning = t.agentId != null ? D.resolveAgent(agents.map(D.hydrateAgent), t.agentId) : null;
        const comment = {
            id:        D.uniqueId(t.comments),
            text:      String(text).trim(),
            author:    author || owning?.slug || 'claude',
            createdAt: new Date().toISOString(),
        };

        const updated = { ...t, comments: [...t.comments, comment] };
        const next = tasks.slice();
        next[idx] = updated;
        return { next, result: { taskKey: t.taskKey, comment, hint: REFRESH_HINT } };
    });
}

export async function log_time({ task: ref, hours, seconds, date, note }) {
    const dur = seconds != null ? Number(seconds)
              : hours   != null ? Number(hours) * 3600
              : null;
    if (dur == null || !Number.isFinite(dur) || dur <= 0) {
        throw new Error('Pass a positive `hours` or `seconds`.');
    }

    return store.mutate('tasks', (tasks) => {
        const found = D.resolveTask(tasks, ref);
        if (!found) throw new Error(`No task matches "${ref}".`);
        const idx = tasks.indexOf(found);
        const t = D.hydrateTask(found);

        const at = date ? new Date(date) : new Date();
        if (Number.isNaN(at.getTime())) throw new Error(`"${date}" is not a valid date.`);

        const entry = {
            id:        D.uniqueId(t.timeEntries),
            date:      at.toISOString(),
            startedAt: new Date(at.getTime() - dur * 1000).toISOString(),
            duration:  Math.round(dur),
            note:      note || '',
            source:    'agent',
        };
        const timeEntries = [...t.timeEntries, entry];
        // timeSpent is always derived, never accumulated.
        const updated = { ...t, timeEntries, timeSpent: D.computeTimeSpent(timeEntries) };

        const next = tasks.slice();
        next[idx] = updated;
        return { next, result: { taskKey: t.taskKey, entry, timeSpent: updated.timeSpent, hint: REFRESH_HINT } };
    });
}

export async function create_agent(args) {
    const { name } = args;
    if (!name || !String(name).trim()) throw new Error('name is required.');

    return store.mutate('agents', (agents) => {
        const taken = new Set(agents.map(a => a.slug).filter(Boolean));
        const agent = D.hydrateAgent({
            id:           D.uniqueId(agents),
            slug:         D.slugifyAgent(args.slug || name, taken),
            name:         String(name).trim().slice(0, 40),
            emoji:        args.emoji || '',
            color:        args.color || '#6366f1',
            role:         args.role || '',
            systemPrompt: args.systemPrompt || '',
            model:        args.model || 'default',
            enabled:      args.enabled !== false,
            createdAt:    new Date().toISOString(),
        });
        return { next: [...agents, agent], result: { agent, hint: REFRESH_HINT } };
    });
}

const AGENT_UPDATABLE = ['name', 'emoji', 'color', 'role', 'systemPrompt', 'model', 'enabled'];

export async function update_agent(args) {
    const { agent: ref } = args;

    const updated = await store.mutate('agents', (agents) => {
        const found = D.resolveAgent(agents.map(D.hydrateAgent), ref);
        if (!found) throw new Error(`No agent matches "${ref}". Use list_agents to see available agents.`);
        const idx = agents.findIndex(a => a.id == found.id);

        const merged = { ...found };
        let changed = false;
        for (const k of AGENT_UPDATABLE) {
            if (args[k] !== undefined) { merged[k] = args[k]; changed = true; }
        }
        if (!changed) return { next: undefined, result: { agent: found, renamed: false } };

        const next = agents.slice();
        next[idx] = D.hydrateAgent(merged);
        return {
            next,
            result: { agent: next[idx], renamed: args.name !== undefined && args.name !== found.name },
        };
    });

    // `assignee` is a denormalized copy of the agent name, so a rename has to
    // rewrite it on that agent's tasks — same invariant as State.Agents.update.
    let tasksTouched = 0;
    if (updated.renamed) {
        tasksTouched = await store.mutate('tasks', (tasks) => {
            const hits = tasks.filter(t => t.agentId == updated.agent.id);
            if (!hits.length) return { next: undefined, result: 0 };
            const next = tasks.map(t =>
                t.agentId == updated.agent.id ? { ...t, assignee: updated.agent.name } : t);
            return { next, result: hits.length };
        });
    }

    return { agent: updated.agent, tasksRenamed: tasksTouched, hint: REFRESH_HINT };
}

// ── Helpers ────────────────────────────────────────────────

function resolveOwner(rawAgents, args) {
    if (args.agent != null && args.agent !== '') {
        const a = D.resolveAgent(rawAgents.map(D.hydrateAgent), args.agent);
        if (!a) throw new Error(`No agent matches "${args.agent}". Use list_agents to see available agents.`);
        // assignee mirrors the agent name so the board's string-based views
        // (My Tasks, CSV export, command palette) keep working.
        return { agentId: a.id, assignee: a.name, agentSlug: a.slug };
    }
    return { agentId: null, assignee: args.assignee || 'admin', agentSlug: null };
}

function summarize(t, projects, agents) {
    const proj = projects.find(p => p.id == t.projectId);
    const agent = t.agentId != null ? agents.find(a => a.id == t.agentId) : null;
    return {
        id: t.id, taskKey: t.taskKey, title: t.title,
        projectId: t.projectId, projectName: proj?.name || null,
        columnId: t.columnId, columnName: D.resolveColumn(proj, t.columnId)?.name || null,
        priority: t.priority, assignee: t.assignee,
        agentId: t.agentId, agentSlug: agent?.slug || null,
        dueDate: t.dueDate, timeSpent: Number(t.timeSpent.toFixed(3)),
        subtasks: countSubtasks(t.subtasks),
    };
}

function countSubtasks(subs) {
    let done = 0, total = 0;
    (subs || []).forEach(s => {
        total++;
        if (s.completed) done++;
        const n = countSubtasks(s.subtasks);
        done += n.done; total += n.total;
    });
    return { done, total };
}
