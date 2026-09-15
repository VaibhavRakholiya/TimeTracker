#!/usr/bin/env node
/**
 * Smoke test for the FlowBoard MCP tools.
 *
 * Calls the same handler functions the MCP client calls, with no JSON-RPC in
 * the loop, against a scratch Firebase namespace so live data is never touched.
 *
 *   npm run smoke
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Must be set before ./src/store.js is imported — it reads env at module load.
process.env.FLOWBOARD_NAMESPACE = process.env.FLOWBOARD_NAMESPACE || 'timetracker_smoke';

const T     = await import('./src/tools.js');
const D     = await import('./src/domain.js');
const store = await import('./src/store.js');

const HERE = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;

async function check(label, fn) {
    try { await fn(); console.log(`  ok    ${label}`); pass++; }
    catch (err) { console.log(`  FAIL  ${label}\n          ${err.message}`); fail++; }
}

function section(t) { console.log(`\n${t}`); }

// ── Guard: never run against the live namespace ────────────
if (store.config.namespace === 'timetracker') {
    console.error('Refusing to run: FLOWBOARD_NAMESPACE is the live namespace.');
    process.exit(1);
}
console.log(`FlowBoard MCP smoke test\n  ${store.config.base}/${store.config.namespace}`);

// ── Unit checks that need no network ───────────────────────
section('domain invariants');

await check('coerceArray handles arrays, numeric-keyed objects, null', () => {
    assert.deepEqual(store.coerceArray(null), []);
    assert.deepEqual(store.coerceArray([1, null, 2]), [1, 2]);
    // RTDB returns this shape when an array is not contiguous from zero.
    assert.deepEqual(store.coerceArray({ '1': 'b', '0': 'a', '10': 'c' }), ['a', 'b', 'c']);
});

await check('nextTaskKey continues from the highest existing key', () => {
    assert.equal(D.nextTaskKey([]), 'TASK-1');
    assert.equal(D.nextTaskKey([{ taskKey: 'TASK-3' }, { taskKey: 'TASK-11' }]), 'TASK-12');
    assert.equal(D.nextTaskKey([{ taskKey: null }]), 'TASK-1');
});

await check('uniqueId never collides inside one millisecond', () => {
    const seen = new Set();
    const recs = [];
    for (let i = 0; i < 50; i++) { const id = D.uniqueId(recs); recs.push({ id }); seen.add(id); }
    assert.equal(seen.size, 50);
});

await check('hydrateTask restores every key RTDB strips', () => {
    // A task as it actually comes back from Firebase: no empty arrays, no nulls.
    const t = D.hydrateTask({ id: 1, taskKey: 'TASK-1', title: 'x', projectId: 9 });
    assert.deepEqual(t.labels, []);
    assert.deepEqual(t.comments, []);
    assert.deepEqual(t.timeEntries, []);
    assert.deepEqual(t.subtasks, []);
    assert.equal(t.dueDate, null);
    assert.equal(t.agentId, null);
    assert.equal(t.isTimerRunning, false);
    assert.equal(t.timeSpent, 0);
});

await check('timeSpent is hours derived from entry seconds', () => {
    assert.equal(D.computeTimeSpent([{ duration: 1800 }, { duration: 1800 }]), 1);
});

await check('slugifyAgent is stable and collision-free', () => {
    assert.equal(D.slugifyAgent('Bug Triager!'), 'bug-triager');
    assert.equal(D.slugifyAgent('Bug Triager', new Set(['bug-triager'])), 'bug-triager-2');
});

// ── Drift guard: the duplicated task shape must match js/state.js ──
section('schema drift vs js/state.js');

await check('task fields match Tasks.create in js/state.js', () => {
    // Structural diff of the two task literals. hydrateTask() is not the right
    // comparison — id/taskKey/projectId come from the caller, not from defaults.
    const fieldsOf = (src, marker) => {
        const start = src.indexOf(marker);
        assert.ok(start !== -1, `could not find ${marker}`);
        const body = src.slice(start, src.indexOf('};', start));
        return new Set([...body.matchAll(/^\s+(\w+):/gm)].map(m => m[1]));
    };

    const appFields = fieldsOf(
        readFileSync(join(HERE, '..', 'js', 'state.js'), 'utf8'), 'const task = {');
    const mcpFields = fieldsOf(
        readFileSync(join(HERE, 'src', 'tools.js'), 'utf8'), 'const task = {');

    assert.ok(appFields.size > 15, `parsed only ${appFields.size} fields from js/state.js`);

    const missing = [...appFields].filter(f => !mcpFields.has(f));
    const extra   = [...mcpFields].filter(f => !appFields.has(f));
    assert.deepEqual(missing, [], `in js/state.js Tasks.create but not in create_task: ${missing}`);
    assert.deepEqual(extra,   [], `in create_task but not in js/state.js Tasks.create: ${extra}`);
});

// ── Network round trip ─────────────────────────────────────
section('tool round trip');

// Seed a project — there is deliberately no create_project tool. Columns
// mirror the real workspace's "Big Fonts" project (To Do / In Progress /
// In Review / Done) so the auto-move-on-claim and auto-finish-on-Done
// behaviors both have a real column to land in.
const projectId = Date.now();
await store.mutate('projects', () => ({
    next: [{
        id: projectId, name: 'Smoke Project', description: '', emoji: '', color: '#6366f1',
        position: 1000, labels: [],
        columns: [
            { id: 'col-todo',   name: 'To Do',       color: '#6b7280', position: 0, wipLimit: null },
            { id: 'col-ip',     name: 'In Progress', color: '#3b82f6', position: 1, wipLimit: null },
            { id: 'col-review', name: 'In Review',   color: '#f59e0b', position: 2, wipLimit: null },
            { id: 'col-done',   name: 'Done',        color: '#22c55e', position: 3, wipLimit: null },
        ],
        createdAt: new Date().toISOString(),
    }],
    result: null,
}));

// A second project mirroring most of the real workspace: no "In Progress"
// column at all — claiming a task here must be a silent no-op, not a throw.
const bareProjectId = Date.now() + 1;
await store.mutate('projects', (projects) => ({
    next: [...projects, {
        id: bareProjectId, name: 'Bare Project', description: '', emoji: '', color: '#94a3b8',
        position: 2000, labels: [],
        columns: [
            { id: 'bare-todo', name: 'To Do', color: '#6b7280', position: 0, wipLimit: null },
            { id: 'bare-done', name: 'Done',  color: '#22c55e', position: 1, wipLimit: null },
        ],
        createdAt: new Date().toISOString(),
    }],
    result: null,
}));

let agent, task;

await check('list_projects returns the seeded project with columns', async () => {
    const projects = await T.list_projects();
    const p = projects.find(x => x.id === projectId);
    assert.ok(p, 'seeded project not found');
    assert.equal(p.columns.length, 4);
    assert.equal(p.columns[0].name, 'To Do');
});

await check('create_agent produces a slug', async () => {
    const r = await T.create_agent({
        name: 'Bug Triager', emoji: '🐞', role: 'Triages bugs',
        systemPrompt: 'Reproduce first, then diagnose.', color: '#f59e0b',
    });
    agent = r.agent;
    assert.equal(agent.slug, 'bug-triager');
    assert.equal(agent.enabled, true);
});

await check('list_agents exposes systemPrompt for profile adoption', async () => {
    const agents = await T.list_agents({});
    const a = agents.find(x => x.id === agent.id);
    assert.equal(a.systemPrompt, 'Reproduce first, then diagnose.');
});

await check('create_task defaults to the first column', async () => {
    const r = await T.create_task({ projectId, title: 'Crash on save', priority: 'high' });
    task = r.task;
    assert.equal(task.columnId, 'col-todo');
    assert.match(task.taskKey, /^TASK-\d+$/);
    assert.equal(task.agentId, null);
});

await check('create_task refuses an invalid project', async () => {
    await assert.rejects(() => T.create_task({ projectId: 1, title: 'orphan' }), /No project with id/);
});

await check('create_task refuses an unknown column, naming the valid ones', async () => {
    await assert.rejects(
        () => T.create_task({ projectId, title: 'x', column: 'Nowhere' }),
        /Available: To Do, In Progress, In Review, Done/);
});

await check('assign_task by slug sets agentId and mirrors the name', async () => {
    const r = await T.assign_task({ task: task.taskKey, agent: 'bug-triager' });
    assert.equal(r.agentId, agent.id);
    assert.equal(r.assignee, 'Bug Triager');   // denormalized for the board's string views
    assert.equal(r.agentSlug, 'bug-triager');
});

await check('list_tasks filters by agent', async () => {
    const mine = await T.list_tasks({ agent: 'bug-triager' });
    assert.equal(mine.length, 1);
    assert.equal(mine[0].taskKey, task.taskKey);
    assert.equal(mine[0].agentSlug, 'bug-triager');
});

await check('list_tasks resolves a column by name', async () => {
    // The prior check assigned `task` to a free agent, which — per the
    // claim-moves-to-In-Progress behavior — already relocated it there.
    const inProgress = await T.list_tasks({ projectId, column: 'In Progress' });
    assert.ok(inProgress.some(t => t.taskKey === task.taskKey));
    assert.equal(
        (await T.list_tasks({ projectId, column: 'To Do' })).some(t => t.taskKey === task.taskKey),
        false, 'it should no longer be listed under To Do after being claimed');
});

await check('add_comment attributes to the owning agent by default', async () => {
    const r = await T.add_comment({ task: task.taskKey, text: 'Repro confirmed on Safari.' });
    assert.equal(r.comment.author, 'bug-triager');
});

await check('log_time derives timeSpent in hours', async () => {
    const r = await T.log_time({ task: task.taskKey, hours: 0.5, note: 'triage' });
    assert.equal(r.entry.duration, 1800);
    assert.equal(r.entry.source, 'agent');
    assert.equal(r.timeSpent, 0.5);
});

await check('move_task accepts a column name', async () => {
    const r = await T.move_task({ task: task.taskKey, column: 'In Review' });
    assert.equal(r.columnId, 'col-review');
});

await check('update_task rejects an invalid priority', async () => {
    await assert.rejects(() => T.update_task({ task: task.taskKey, priority: 'nope' }), /priority must be/);
});

await check('get_task resolves names, agent and counts', async () => {
    const full = await T.get_task({ task: task.taskKey });
    assert.equal(full.projectName, 'Smoke Project');
    assert.equal(full.columnName, 'In Review');
    assert.equal(full.agent.slug, 'bug-triager');
    assert.equal(full.comments.length, 1);
    assert.equal(full.timeSpent, 0.5);
});

await check('renaming an agent rewrites assignee on its tasks', async () => {
    const r = await T.update_agent({ agent: 'bug-triager', name: 'Triage Bot' });
    assert.equal(r.tasksRenamed, 1);
    const full = await T.get_task({ task: task.taskKey });
    assert.equal(full.assignee, 'Triage Bot');
    assert.equal(full.agent.slug, 'bug-triager', 'slug must survive a rename — Claude may already use it');
});

await check('unknown agent fails with a usable message', async () => {
    await assert.rejects(() => T.assign_task({ task: task.taskKey, agent: 'ghost' }), /No agent matches/);
});

await check('tasks round-trip through Firebase as a dense array', async () => {
    const raw = await store.read('tasks');
    assert.ok(Array.isArray(raw));
    assert.ok(raw.every(t => t != null));
});

// ── Queue: start-if-free, queue-if-busy, promote-on-finish ──
section('agent queue behavior');

let busyAgent, taskA, taskB, taskC;

await check('a task assigned to a free agent starts now and moves to In Progress', async () => {
    busyAgent = (await T.create_agent({ name: 'Queue Tester' })).agent;
    const r = await T.create_task({ projectId, title: 'Queue A', agent: busyAgent.slug });
    taskA = r.task;
    assert.equal(r.startNow, true);
    assert.equal(r.agentStatus, 'active');
    assert.equal(taskA.columnId, 'col-ip', 'a freshly claimed task should land in In Progress');
    const agents = await T.list_agents({});
    const a = agents.find(x => x.id === busyAgent.id);
    assert.equal(a.status, 'working');
    assert.equal(a.currentTaskKey, taskA.taskKey);
    assert.equal(a.queueLength, 0);
});

await check('a second task queues behind the busy agent, staying in To Do', async () => {
    const r = await T.create_task({ projectId, title: 'Queue B', agent: busyAgent.slug });
    taskB = r.task;
    assert.equal(r.startNow, false);
    assert.equal(r.agentStatus, 'queued');
    assert.equal(r.queuePosition, 1);
    assert.equal(taskB.columnId, 'col-todo', 'a queued task must not jump the board');
    const agents = await T.list_agents({});
    assert.equal(agents.find(x => x.id === busyAgent.id).queueLength, 1);
});

await check('a third task extends the queue in order', async () => {
    const r = await T.assign_task({ task: (await T.create_task({ projectId, title: 'Queue C' })).task.taskKey, agent: busyAgent.slug });
    taskC = { taskKey: r.taskKey };
    assert.equal(r.queuePosition, 2);
});

await check('list_tasks reports queuePosition per task for this agent', async () => {
    const mine = await T.list_tasks({ agent: busyAgent.slug });
    const byKey = Object.fromEntries(mine.map(t => [t.taskKey, t.queuePosition]));
    assert.equal(byKey[taskA.taskKey], 0);
    assert.equal(byKey[taskB.taskKey], 1);
    assert.equal(byKey[taskC.taskKey], 2);
});

await check('finish_task frees the agent and promotes the oldest queued task (FIFO)', async () => {
    const r = await T.finish_task({ task: taskA.taskKey });
    assert.equal(r.freed, true);
    const next = await T.get_task({ task: r.agentNextTaskId });
    assert.equal(next.taskKey, taskB.taskKey, 'should promote B before C — B was queued first');
    assert.equal(next.isActiveForAgent, true);
    assert.equal(next.columnId, 'col-ip', 'the newly-promoted task should move to In Progress');
    assert.equal(next.columnName, 'In Progress');
});

await check('a finished task does not reappear in its own queue listing', async () => {
    const mine = await T.list_tasks({ agent: busyAgent.slug });
    const a = mine.find(t => t.taskKey === taskA.taskKey);
    assert.equal(a.agentDone, true);
    assert.equal(a.queuePosition, null);
});

await check('moving the active task to a column named Done auto-finishes and promotes', async () => {
    const r = await T.move_task({ task: taskB.taskKey, column: 'Done' });
    assert.equal(r.agentFreed, true);
    assert.ok(r.agentNextTaskId, 'should have promoted taskC');
    const c = await T.get_task({ task: r.agentNextTaskId });
    assert.equal(c.taskKey, taskC.taskKey);
    assert.equal(c.isActiveForAgent, true);
    assert.equal(c.columnId, 'col-ip', 'promotion via the Done-move path should also move to In Progress');
});

await check('a project with no In Progress column: claiming does not throw and leaves the column alone', async () => {
    const bareAgent = (await T.create_agent({ name: 'Bare Tester' })).agent;
    const r = await T.create_task({ projectId: bareProjectId, title: 'Bare Task', agent: bareAgent.slug });
    assert.equal(r.startNow, true);
    assert.equal(r.task.columnId, 'bare-todo', 'no In Progress column exists — task should stay where it was created');
});

await check('finishing the last task leaves the agent idle', async () => {
    const r = await T.finish_task({ task: taskC.taskKey });
    assert.equal(r.agentNextTaskId, null);
    const agents = await T.list_agents({});
    const a = agents.find(x => x.id === busyAgent.id);
    assert.equal(a.status, 'idle');
    assert.equal(a.queueLength, 0);
});

await check('reassigning an agent\'s active task away promotes its queue', async () => {
    const t1 = (await T.create_task({ projectId, title: 'Reassign 1', agent: busyAgent.slug })).task;
    const t2 = (await T.create_task({ projectId, title: 'Reassign 2', agent: busyAgent.slug })).task;
    const r = await T.assign_task({ task: t1.taskKey, assignee: 'someone' }); // pull it off the agent
    assert.equal(r.agentId, null);
    const agents = await T.list_agents({});
    const a = agents.find(x => x.id === busyAgent.id);
    assert.equal(a.currentTaskKey, t2.taskKey, 'promoting away from the active task should surface the queued one');
    // clean up: finish what's left so the agent doesn't leak into other checks
    await T.finish_task({ task: t2.taskKey });
});

// ── Cleanup ────────────────────────────────────────────────
section('cleanup');
await check('scratch namespace removed', async () => {
    const res = await fetch(`${store.config.base}/${store.config.namespace}.json`, { method: 'DELETE' });
    assert.ok(res.ok, `DELETE returned ${res.status}`);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
