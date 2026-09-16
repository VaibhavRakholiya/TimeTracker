#!/usr/bin/env node
/**
 * Prints "<slug>\t<name>\t<role>\t<status>" for every enabled FlowBoard
 * agent, one per line. Used by open-agent-terminal.sh to build the picker —
 * kept as a separate script so the shell script has no Firebase logic of
 * its own.
 */
import { read } from '../src/store.js';
import { hydrateAgent, agentStatus } from '../src/domain.js';

const [rawAgents, tasks] = await Promise.all([read('agents'), read('tasks')]);
const agents = rawAgents.map(hydrateAgent).filter(a => a.enabled !== false);

for (const a of agents) {
    const status = agentStatus(a, tasks).working ? 'working' : 'idle';
    console.log(`${a.slug}\t${a.name}\t${a.role || ''}\t${status}`);
}
