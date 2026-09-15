#!/usr/bin/env node
/**
 * Optional auto-start daemon for FlowBoard agents (TASK-514).
 *
 * The MCP server itself never starts an agent's work — `startNow`/`agentNextTaskId`
 * are just response flags a *live* Claude Code session is expected to notice and
 * act on (see README "The honest limit on 'starts automatically'"). This process
 * is the thing that actually watches for that transition and reacts, so tasks get
 * worked even when nobody has a session open.
 *
 * It polls the same Firebase collections the MCP tools use, and for every agent
 * whose active task just changed (idle -> claimed, or one task swapped for the
 * next queued one), spawns a background `claude` session running `/start-agent
 * <slug>` in the repo root. That skill does the rest: reads the task, adopts the
 * agent's systemPrompt, does the work, reports back, and advances the queue.
 *
 * Run it with `npm run daemon` from mcp-server/. It is a separate, long-lived
 * process — start it once (under `nohup`, `pm2`, `launchd`, tmux, …) and leave it
 * running; nothing here makes it survive a reboot on its own.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { read } from './store.js';
import { hydrateAgent, hydrateTask, agentStatus } from './domain.js';

const POLL_MS = Number(process.env.FLOWBOARD_DAEMON_POLL_MS) || 15000;
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// agentId -> id of the task we last spawned a session for. Seeded (not acted
// on) from whatever's already active on startup, so a restart never re-fires
// work that was claimed before the daemon was watching — only genuine
// transitions after that (idle -> claimed, or one task finishing and the next
// one starting) trigger a spawn./bg/
const dispatched = new Map();
let seeded = false;

function log(...args) {
    console.log(`[${new Date().toISOString()}]`, ...args);
}

async function pollOnce() {
    const [rawAgents, rawTasks] = await Promise.all([read('agents'), read('tasks')]);
    const tasks = rawTasks.map(hydrateTask);
    const agents = rawAgents.map(hydrateAgent).filter(a => a.enabled);

    for (const agent of agents) {
        const status = agentStatus(agent, tasks);
        const activeTaskId = status.working ? status.currentTask.id : null;

        if (!seeded) {
            if (activeTaskId != null) dispatched.set(agent.id, activeTaskId);
            continue;
        }

        if (activeTaskId == null) {
            dispatched.delete(agent.id);
            continue;
        }

        if (dispatched.get(agent.id) === activeTaskId) continue; // already dispatched

        dispatched.set(agent.id, activeTaskId);
        startAgent(agent, status.currentTask);
    }

    seeded = true;
}

function startAgent(agent, task) {
    log(`starting "${agent.name}" (${agent.slug}) on ${task.taskKey}: ${task.title}`);

    const child = spawn(
        'claude',
        ['--background', '--permission-mode', 'auto', '-n', `flowboard:${agent.slug}`, `/start-agent ${agent.slug}`],
        { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
    );

    child.stdout.on('data', d => log(`[${agent.slug}] ${d.toString().trim()}`));
    child.stderr.on('data', d => log(`[${agent.slug}] stderr: ${d.toString().trim()}`));
    child.on('error', err => log(`[${agent.slug}] failed to launch claude: ${err.message}`));
    child.on('exit', (code) => {
        if (code !== 0) log(`[${agent.slug}] "claude --background" launcher exited with code ${code}`);
    });
}

async function loop() {
    try {
        await pollOnce();
    } catch (err) {
        log('poll failed:', err.message);
    }
    setTimeout(loop, POLL_MS);
}

log(`flowboard auto-start daemon watching every ${POLL_MS}ms, launching sessions in ${REPO_ROOT}`);
loop();
