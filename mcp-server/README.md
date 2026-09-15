# FlowBoard MCP Server

Lets Claude Code read and drive your FlowBoard board — list projects and tasks,
create and update them, move them across columns, comment on them, and assign
them to **agent profiles** you define in the app.

It runs as a local Node process over stdio. There is no hosting and **no
Anthropic API key** — Claude Code is the client.

```
Claude Code ──stdio── mcp-server ──HTTPS REST── Firebase RTDB ──── FlowBoard (browser)
```

## Setup

```bash
cd mcp-server && npm install
```

Then start Claude Code in the repo root. `.mcp.json` is project-scoped and
committed, so Claude Code will ask you to approve the `flowboard` server on first
use. Approve it, then `/mcp` should show it connected with 13 tools.

Configuration (both optional, both have working defaults):

| Variable | Default | Purpose |
|---|---|---|
| `FLOWBOARD_FIREBASE_URL` | the app's live database | Which RTDB to talk to |
| `FLOWBOARD_NAMESPACE` | `timetracker` | Which subtree within it |

## Assigning work to an agent

1. **Define the agent** — FlowBoard → Settings → Agents → New Agent. Give it a
   name, a role, and a system prompt describing how it should work. The row
   shows a derived slug such as `bug-triager`; that is the handle Claude uses.
   (Claude can also create agents itself with `create_agent`.)

2. **Ask Claude** — *"Have the bug triager work through the open bugs in the
   Website project."*

3. **Claude works the queue** — it calls `list_agents` to read that agent's
   `systemPrompt`, `list_tasks` with `agent: "bug-triager"` to get its queue, and
   `get_task` for detail. It then adopts the profile: either following the system
   prompt directly, or spawning a subagent seeded with it, so several agents can
   work different tasks in one session with their own context.

4. **Results land on the board** — `add_comment` (authored as the agent),
   `log_time`, `move_task` to push the card to *In Review*.

5. **You pull it in** — Settings → Data → **Refresh from Cloud**, or reload.
   The board shows the moved card, the agent's chip on it, and the write-up in
   the comment thread. Agent work stays out of **My Tasks**, which remains your
   own queue.

## Tools

**Read:** `list_projects`, `list_agents`, `list_sprints`, `list_tasks`, `get_task`
**Write:** `create_task`, `update_task`, `move_task`, `assign_task`, `add_comment`,
`log_time`, `create_agent`, `update_agent`

Tasks are addressed by numeric id or by key (`TASK-12`); agents by id or slug;
columns by id or name (`"In Progress"`).

Deleting tasks and agents is deliberately **not** exposed. The database has no
auth and no undo, so destruction stays a human action in the UI.

## Two limitations, stated plainly

**1. The board does not update live.** FlowBoard reads from Firebase only at
startup — `setupRealtimeListener` in `firebase-rest-integration.js` is a
deliberate no-op. Nothing Claude does appears until you hit **Refresh from
Cloud** or reload. Every write tool's response repeats this.

**2. An open, actively-edited tab can still overwrite Claude's work.**
This server uses compare-and-set on every write: it reads the ETag, and Firebase
rejects the write with `412` if the data changed underneath, so it re-reads and
re-applies instead of clobbering. That protects it against anything it can
observe.

The browser side has no such guard. FlowBoard PUTs its entire in-memory task list
two seconds after any local edit, from a snapshot it took at page load — so an
edit you make in a stale tab can overwrite a task Claude created after that tab
loaded. This is not solved, only bounded:

- A tab you are not editing in never PUTs, so it is harmless.
- **Don't drive the MCP server while actively editing the same board in a
  browser tab.** Close or idle the tab, let Claude work, then refresh.

Closing this properly means making `syncToFirebase()` in `js/state.js` ETag-aware
and reload-and-merge on 412. That is a follow-up, not something this server can
do from outside.

## Security

The Firebase database is **public and unauthenticated** — the URL is hardcoded in
`firebase-rest-integration.js` and served to every browser that loads the app.
Anyone with it can read every task, comment and time entry, and can wipe the
database. This is true today and the MCP server does not change it; it uses the
same open endpoint from your own machine.

One new consideration: **agent system prompts are stored there too**, so keep
secrets, credentials and private context out of them.

## Tests

```bash
npm run smoke
```

Calls the tool handlers directly against a scratch namespace
(`timetracker_smoke`) and deletes it afterwards, so live data is never touched —
the script refuses to run against the live namespace. It also diffs the task
shape in `src/domain.js` / `src/tools.js` against `js/state.js` and fails on
drift, since those invariants are deliberately duplicated (see `.cursorrules`).
