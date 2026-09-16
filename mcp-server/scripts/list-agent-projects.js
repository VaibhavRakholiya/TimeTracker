#!/usr/bin/env node
/**
 * Prints "<projectName>\t<repoPath>" for every project a given agent has
 * ever been assigned a task in (regardless of done status), one per line,
 * ordered by that project's earliest assignment. Used by
 * open-agent-terminal.sh to open one terminal per project instead of always
 * assuming the current repo.
 *
 * Usage: list-agent-projects.js <agent-slug>
 *
 * Repo paths come from repo-paths.json (project name -> absolute path).
 * A project with no entry there is skipped, with a warning on stderr —
 * open-agent-terminal.sh falls back to the current repo when nothing
 * resolves at all.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { read } from '../src/store.js';
import { hydrateAgent, hydrateTask } from '../src/domain.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const slug = process.argv[2];
if (!slug) {
    console.error('Usage: list-agent-projects.js <agent-slug>');
    process.exit(1);
}

const repoPaths = JSON.parse(readFileSync(path.join(__dirname, 'repo-paths.json'), 'utf8'));

const [rawAgents, rawTasks, projects] = await Promise.all([
    read('agents'), read('tasks'), read('projects'),
]);

const agent = rawAgents.map(hydrateAgent).find(a => a.slug === slug);
if (!agent) {
    console.error(`No agent with slug "${slug}".`);
    process.exit(1);
}

const assigned = rawTasks
    .map(hydrateTask)
    .filter(t => t.agentId == agent.id)
    .sort((a, b) => new Date(a.assignedAt || a.createdAt) - new Date(b.assignedAt || b.createdAt));

const seen = new Set();
for (const t of assigned) {
    if (seen.has(t.projectId)) continue;
    seen.add(t.projectId);

    const project = projects.find(p => p.id == t.projectId);
    if (!project) continue;

    const repoPath = repoPaths[project.name];
    if (!repoPath) {
        console.error(`No repo path configured for project "${project.name}" — skipping. Add it to repo-paths.json.`);
        continue;
    }

    console.log(`${project.name}\t${repoPath}`);
}
