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

/**
 * Keep one agent's busy/queue state consistent with a task that just finished,
 * moved away, or needs claiming — the one thing that makes assignment mean
 * "start now or wait your turn" instead of just a label on a card.
 *
 * `justFinishedTaskId`: clear this from the agent's active slot if it's there,
 * and promote whatever's next in its queue.
 * `claimTaskId`: take this task if the agent is free after that; otherwise
 * report where it landed in the queue.
 *
 * This is a second, separate compare-and-set write on the 'agents' collection
 * — not part of the same transaction as whatever wrote 'tasks' just before it.
 * If the process dies between the two, the task record can end up pointing at
 * an agent that never claimed it. Nothing here trusts that ever synced
 * correctly: every call recomputes from what's actually in Firebase right now,
 * so the next assign_task / finish_task call self-heals rather than compounds
 * the drift.
 */
async function releaseAndClaim(agentId, { justFinishedTaskId, claimTaskId } = {}) {
    return store.mutate('agents', async (agentsList) => {
        const idx = agentsList.findIndex(a => a.id == agentId);
        if (idx === -1) {
            return { next: undefined, result: { agentStatus: 'unassigned', startNow: false, queuePosition: null, currentTaskId: null } };
        }

        const agent = D.hydrateAgent(agentsList[idx]);
        // Freshly read on every attempt (including CAS retries) — cheap, and
        // it's what lets a promoted task reflect a task write that landed
        // between our own retries.
        const tasks = await store.read('tasks');

        let changed = false;
        if (justFinishedTaskId != null && agent.currentTaskId == justFinishedTaskId) {
            const next = D.queueForAgent(tasks, agent.id, agent.currentTaskId)[0] || null;
            agent.currentTaskId = next ? next.id : null;
            changed = true;
        }

        let result;
        if (claimTaskId != null) {
            if (agent.currentTaskId == null) {
                agent.currentTaskId = claimTaskId;
                changed = true;
                result = { agentStatus: 'active', startNow: true, queuePosition: 0 };
            } else if (agent.currentTaskId == claimTaskId) {
                result = { agentStatus: 'active', startNow: false, queuePosition: 0 };
            } else {
                const queue = D.queueForAgent(tasks, agent.id, agent.currentTaskId);
                const pos = queue.findIndex(t => t.id == claimTaskId);
                result = { agentStatus: 'queued', startNow: false, queuePosition: pos === -1 ? queue.length : pos + 1 };
            }
        } else {
            result = { agentStatus: agent.currentTaskId != null ? 'active' : 'unassigned', startNow: false, queuePosition: null };
        }
        result.currentTaskId = agent.currentTaskId;

        if (!changed) return { next: undefined, result };
        const next = agentsList.slice();
        next[idx] = agent;
        return { next, result };
    });
}

/**
 * Best-effort: once a task is confirmed active (currentTaskId), move it into
 * the project's "In Progress" column so the board shows what's actually being
 * worked without a human touching it — mirrors js/state.js moveToInProgressColumn.
 * Silent no-op if the project has no column with that exact name. This is a
 * third, independent CAS write in the same non-atomic chain documented for
 * releaseAndClaim — if it fails or is skipped, the task is still correctly
 * assigned and active, just visually still in its old column.
 */
async function moveToInProgressIfActive(taskId) {
    if (taskId == null) return { moved: false };
    const projects = await store.read('projects');

    return store.mutate('tasks', (tasksList) => {
        const idx = tasksList.findIndex(t => t.id == taskId);
        if (idx === -1) return { next: undefined, result: { moved: false } };

        const found = D.hydrateTask(tasksList[idx]);
        const project = projects.find(p => p.id == found.projectId);
        const col = project ? D.resolveColumn(project, 'In Progress') : null;
        if (!col || found.columnId === col.id) return { next: undefined, result: { moved: false } };

        const next = tasksList.slice();
        next[idx] = { ...found, columnId: col.id };
        return { next, result: { moved: true, columnId: col.id, columnName: col.name } };
    });
}

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
    const [rawAgents, rawTasks] = await Promise.all([store.read('agents'), store.read('tasks')]);
    const tasks = rawTasks.map(D.hydrateTask);
    return rawAgents.map(D.hydrateAgent)
        .filter(a => includeDisabled || a.enabled)
        .map(a => {
            const s = D.agentStatus(a, tasks);
            return {
                id: a.id, slug: a.slug, name: a.name, emoji: a.emoji, color: a.color,
                role: a.role, model: a.model, enabled: a.enabled,
                // Included so Claude can adopt the profile without a second call.
                systemPrompt: a.systemPrompt,
                // 'idle' means assign_task will start work immediately; 'working'
                // means a new assignment queues behind currentTaskKey.
                status: s.working ? 'working' : 'idle',
                currentTaskKey: s.currentTask?.taskKey || null,
                queueLength: s.queueLength,
                assignedTaskCount: tasks.filter(t => t.agentId == a.id).length,
            };
        });
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

    let agentId = null, agentRecord = null;
    if (agent != null && agent !== '') {
        agentRecord = D.resolveAgent(agents.map(D.hydrateAgent), agent);
        if (!agentRecord) throw new Error(`No agent matches "${agent}". Use list_agents to see available agents.`);
        agentId = agentRecord.id;
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

    return out.slice(0, limit).map(t => {
        const summary = summarize(t, projects, agents);
        // 0 = the agent's active task right now; 1+ = position in its queue;
        // null = unrelated to this agent, or already finished (see agentDone).
        if (agentId != null) {
            if (summary.agentDone) {
                summary.queuePosition = null;
            } else if (t.id == agentRecord.currentTaskId) {
                summary.queuePosition = 0;
            } else {
                const q = D.queueForAgent(tasks, agentId, agentRecord.currentTaskId);
                const i = q.findIndex(x => x.id === t.id);
                summary.queuePosition = i === -1 ? null : i + 1;
            }
        }
        return summary;
    });
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
        // True when this is the agent's current active task (start now); false
        // when it's queued behind something else, or the agent already
        // finished it (see agentDoneAt above).
        isActiveForAgent: agent != null && agent.currentTaskId == t.id,
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

    const created = await store.mutate('tasks', (tasks) => {
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
            assignedAt:     owner.agentId != null ? new Date().toISOString() : null,
            agentDoneAt:    null,
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
        return { next: [...tasks, task], result: task };
    });

    // A task created already pointed at an agent joins its queue the same way
    // assign_task does — claimed immediately if the agent is free.
    let queue = { agentStatus: 'unassigned', startNow: false, queuePosition: null, currentTaskId: null };
    if (owner.agentId != null) queue = await releaseAndClaim(owner.agentId, { claimTaskId: created.id });
    const moved = queue.startNow ? await moveToInProgressIfActive(created.id) : { moved: false };
    // The response should reflect where the card actually ended up, not the
    // column it was created in a moment before being claimed and moved.
    if (moved.moved) created.columnId = moved.columnId;

    return {
        task: created, agentSlug: owner.agentSlug,
        agentStatus: queue.agentStatus, startNow: queue.startNow, queuePosition: queue.queuePosition,
        hint: queue.startNow
            ? `${owner.agentSlug} is free — begin this task now.` +
              (moved.moved ? ` The card moved to "${moved.columnName}".` : '')
            : queue.agentStatus === 'queued'
                ? `${owner.agentSlug} is already working something else. This is #${queue.queuePosition} in its queue.`
                : REFRESH_HINT,
    };
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

    const moveResult = await store.mutate('tasks', (tasks) => {
        const found = D.resolveTask(tasks, ref);
        if (!found) throw new Error(`No task matches "${ref}".`);
        const idx = tasks.indexOf(found);

        const project = projects.find(p => p.id == found.projectId);
        const col = D.resolveColumn(project, column);
        if (!col) {
            throw new Error(`No column "${column}" in project "${project?.name || found.projectId}". ` +
                `Available: ${(project?.columns || []).map(c => c.name).join(', ')}.`);
        }

        // Moving an agent's own task into a column literally named "Done" is
        // treated as finishing it — a convenience on top of the explicit
        // finish_task tool, not a substitute for it (a "Shipped" or "QA"
        // column still needs an explicit finish_task call).
        const isDoneColumn = String(col.name).trim().toLowerCase() === 'done';
        const autoFinish = isDoneColumn && found.agentId != null && found.agentDoneAt == null;

        const updated = {
            ...D.hydrateTask(found),
            columnId: col.id,
            agentDoneAt: autoFinish ? new Date().toISOString() : (found.agentDoneAt ?? null),
        };
        const next = tasks.slice();
        next[idx] = updated;
        return { next, result: { task: updated, columnName: col.name, autoFinish } };
    });

    let queue = null;
    let moved = { moved: false };
    if (moveResult.autoFinish) {
        queue = await releaseAndClaim(moveResult.task.agentId, { justFinishedTaskId: moveResult.task.id });
        if (queue.currentTaskId != null) moved = await moveToInProgressIfActive(queue.currentTaskId);
    }

    return {
        taskKey: moveResult.task.taskKey, columnId: moveResult.task.columnId, columnName: moveResult.columnName,
        agentFreed: moveResult.autoFinish,
        agentNextTaskId: queue?.currentTaskId ?? null,
        hint: moveResult.autoFinish
            ? `Moving to "${moveResult.columnName}" freed the agent.` +
              (queue?.currentTaskId
                  ? ` It is now on task id ${queue.currentTaskId}` + (moved.moved ? ` (moved to "${moved.columnName}")` : '') + ` — call get_task to see it.`
                  : ' Its queue is empty.') +
              ` ${REFRESH_HINT}`
            : REFRESH_HINT,
    };
}

export async function assign_task({ task: ref, agent, assignee }) {
    if ((agent == null || agent === '') && (assignee == null || assignee === '')) {
        throw new Error('Pass either `agent` (id or slug) or `assignee` (a person\'s name).');
    }
    const agentsList = await store.read('agents');
    const owner = resolveOwner(agentsList, { agent, assignee });

    // Step 1: update the task record.
    const { task, oldAgentId } = await store.mutate('tasks', (tasks) => {
        const found = D.resolveTask(tasks, ref);
        if (!found) throw new Error(`No task matches "${ref}".`);
        const idx = tasks.indexOf(found);
        const previousAgentId = found.agentId ?? null;

        const updated = {
            ...D.hydrateTask(found),
            agentId:     owner.agentId,
            assignee:    owner.assignee,
            assignedAt:  owner.agentId != null ? new Date().toISOString() : null,
            // Reassigning always re-enters the pool — a task can't be both
            // "done for the old agent" and freshly handed to a new one.
            agentDoneAt: null,
        };
        const next = tasks.slice();
        next[idx] = updated;
        return { next, result: { task: updated, oldAgentId: previousAgentId } };
    });

    // Step 2: keep the agent busy/queue state honest. Two separate CAS writes
    // (see releaseAndClaim) — not one transaction with step 1.
    if (oldAgentId != null && oldAgentId != owner.agentId) {
        const freed = await releaseAndClaim(oldAgentId, { justFinishedTaskId: task.id });
        // Pulling this task off its old agent may have promoted a different
        // one there — that one just became active too.
        if (freed.currentTaskId != null) await moveToInProgressIfActive(freed.currentTaskId);
    }

    let queue = { agentStatus: 'unassigned', startNow: false, queuePosition: null, currentTaskId: null };
    if (owner.agentId != null) queue = await releaseAndClaim(owner.agentId, { claimTaskId: task.id });
    const moved = queue.startNow ? await moveToInProgressIfActive(task.id) : { moved: false };

    return {
        taskKey: task.taskKey, assignee: task.assignee,
        agentId: task.agentId, agentSlug: owner.agentSlug,
        agentStatus: queue.agentStatus, startNow: queue.startNow, queuePosition: queue.queuePosition,
        movedToColumn: moved.moved ? moved.columnName : null,
        hint: queue.startNow
            ? `${owner.agentSlug} is free — begin this task now.` +
              (moved.moved ? ` The card moved to "${moved.columnName}".` : '')
            : queue.agentStatus === 'queued'
                ? `${owner.agentSlug} is already working something else. This is #${queue.queuePosition} in its queue — it will not start on its own; call finish_task on the active one to advance the queue.`
                : REFRESH_HINT,
    };
}

/**
 * Signal that an agent is done with a task. Frees it and, if anything is
 * queued behind it, immediately hands over the next one — this is the "when
 * an agent finishes, the next queued task starts" half of the workflow.
 *
 * This does not touch comments or the column — call add_comment / move_task
 * first if you want those recorded, then call this to advance the queue.
 * (Moving a task into a column literally named "Done" does this step
 * automatically; call this explicitly for any other completion signal.)
 */
export async function finish_task({ task: ref }) {
    const task = await store.mutate('tasks', (tasks) => {
        const found = D.resolveTask(tasks, ref);
        if (!found) throw new Error(`No task matches "${ref}".`);
        const idx = tasks.indexOf(found);
        if (found.agentId == null) {
            return { next: undefined, result: D.hydrateTask(found) };
        }
        const updated = { ...D.hydrateTask(found), agentDoneAt: new Date().toISOString() };
        const next = tasks.slice();
        next[idx] = updated;
        return { next, result: updated };
    });

    if (task.agentId == null) {
        return { taskKey: task.taskKey, freed: false, hint: 'This task has no agent assigned — nothing to free.' };
    }

    const queue = await releaseAndClaim(task.agentId, { justFinishedTaskId: task.id });
    const moved = queue.currentTaskId != null
        ? await moveToInProgressIfActive(queue.currentTaskId)
        : { moved: false };

    return {
        taskKey: task.taskKey,
        freed: true,
        agentNextTaskId: queue.currentTaskId,
        hint: queue.currentTaskId
            ? `The agent is now on task id ${queue.currentTaskId}` +
              (moved.moved ? ` (moved to "${moved.columnName}")` : '') +
              ` — call get_task to see it, then begin work now.`
            : `The agent's queue is empty; it is idle. ${REFRESH_HINT}`,
    };
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
        // Whether the currently-assigned agent already finished this one —
        // set by finish_task, not by moving columns (except into "Done").
        agentDone: t.agentDoneAt != null,
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
