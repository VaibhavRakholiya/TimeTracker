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

// Seed a project — there is deliberately no create_project tool.
const projectId = Date.now();
await store.mutate('projects', () => ({
    next: [{
        id: projectId, name: 'Smoke Project', description: '', emoji: '', color: '#6366f1',
        position: 1000, labels: [],
        columns: [
            { id: 'col-todo',   name: 'To Do',     color: '#6b7280', position: 0, wipLimit: null },
            { id: 'col-review', name: 'In Review', color: '#f59e0b', position: 1, wipLimit: null },
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
    assert.equal(p.columns.length, 2);
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
        /Available: To Do, In Review/);
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
    const todo = await T.list_tasks({ projectId, column: 'To Do' });
    assert.ok(todo.some(t => t.taskKey === task.taskKey));
    assert.equal((await T.list_tasks({ projectId, column: 'In Review' })).length, 0);
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

// ── Cleanup ────────────────────────────────────────────────
section('cleanup');
await check('scratch namespace removed', async () => {
    const res = await fetch(`${store.config.base}/${store.config.namespace}.json`, { method: 'DELETE' });
    assert.ok(res.ok, `DELETE returned ${res.status}`);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
