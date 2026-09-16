#!/usr/bin/env bash
#
# Opens a new Terminal.app tab running `claude` and immediately feeding it
# `/start-agent <slug>`, so the chosen FlowBoard agent starts working its
# queue. If the agent has pending work across multiple projects (e.g. Igris
# assigned to both "Crush Test" and "Big Font"), one tab is opened per
# project, each cd'd into that project's repo (mcp-server/scripts/repo-paths.json).
# Falls back to this repo if none of the agent's projects resolve to a path.
#
# Usage: mcp-server/scripts/open-agent-terminal.sh [slug]
#   With no argument, lists enabled agents and prompts for one.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ "$(uname)" != "Darwin" ]]; then
    echo "This script drives Terminal.app via osascript and only works on macOS." >&2
    exit 1
fi

AGENTS_TSV="$(node "$REPO_DIR/mcp-server/scripts/list-agents.js")"

if [[ -z "$AGENTS_TSV" ]]; then
    echo "No enabled FlowBoard agents found." >&2
    exit 1
fi

SLUG="${1:-}"

if [[ -z "$SLUG" ]]; then
    echo "Enabled agents:"
    echo
    i=0
    declare -a SLUGS
    while IFS=$'\t' read -r slug name role status; do
        i=$((i + 1))
        SLUGS[$i]="$slug"
        printf '  %d) %-14s %-20s %-16s [%s]\n' "$i" "$slug" "$name" "$role" "$status"
    done <<< "$AGENTS_TSV"
    echo
    read -rp "Pick an agent [1-$i]: " choice

    if ! [[ "$choice" =~ ^[0-9]+$ ]] || (( choice < 1 || choice > i )); then
        echo "Invalid choice." >&2
        exit 1
    fi
    SLUG="${SLUGS[$choice]}"
fi

if ! grep -q "^${SLUG}"$'\t' <<< "$AGENTS_TSV"; then
    echo "No enabled agent with slug \"$SLUG\"." >&2
    exit 1
fi

PROJECTS_TSV="$(node "$REPO_DIR/mcp-server/scripts/list-agent-projects.js" "$SLUG")"

declare -a REPO_PATHS
if [[ -n "$PROJECTS_TSV" ]]; then
    while IFS=$'\t' read -r project_name repo_path; do
        REPO_PATHS+=("$repo_path")
    done <<< "$PROJECTS_TSV"
fi

if [[ ${#REPO_PATHS[@]} -eq 0 ]]; then
    REPO_PATHS=("$REPO_DIR")
fi

for dir in "${REPO_PATHS[@]}"; do
    osascript <<EOF
tell application "Terminal"
    activate
    set newTab to do script "cd $(printf '%q' "$dir")"
    delay 3
    do script "claude" in newTab
    # do script "/start-agent $(printf '%q' "$SLUG")" in newTab
end tell
EOF
done
