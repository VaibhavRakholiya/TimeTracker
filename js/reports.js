/**
 * FlowBoard — Reports Module
 * Renders the Reports view with bar charts and time breakdown tables.
 */

const Reports = (() => {

    function render() {
        const container = document.getElementById('reportsGrid');
        if (!container) return;

        // Set default date range (last 30 days)
        const endDate   = document.getElementById('reportEndDate');
        const startDate = document.getElementById('reportStartDate');
        if (endDate && !endDate.value)   endDate.value   = new Date().toISOString().split('T')[0];
        if (startDate && !startDate.value) {
            const d = new Date();
            d.setDate(d.getDate() - 30);
            startDate.value = d.toISOString().split('T')[0];
        }

        const start = startDate?.value ? new Date(startDate.value + 'T00:00:00') : null;
        const end   = endDate?.value   ? new Date(endDate.value   + 'T23:59:59') : null;

        container.innerHTML = '';

        // ── Time per project ─────────────────────────────
        const timeByProject = {};
        State.Tasks.getAll().forEach(t => {
            const projName = t.projectId
                ? (State.Projects.get(t.projectId)?.name || 'Unknown')
                : 'No Project';
            const secs = (t.timeEntries || []).reduce((sum, e) => {
                if (!start && !end) return sum + (e.duration || 0);
                const at = new Date(e.date);
                if (start && at < start) return sum;
                if (end   && at > end)   return sum;
                return sum + (e.duration || 0);
            }, 0);
            timeByProject[projName] = (timeByProject[projName] || 0) + secs;
        });

        const timeEntries = Object.entries(timeByProject)
            .filter(([, v]) => v > 0)
            .sort((a, b) => b[1] - a[1]);

        const maxSecs = Math.max(...timeEntries.map(([, v]) => v), 1);

        container.innerHTML += `
            <div class="chart-container">
                <div class="chart-header">
                    <div class="chart-title">Time Tracked by Project</div>
                </div>
                <div class="bar-chart">
                    ${timeEntries.length ? timeEntries.map(([name, secs]) => `
                        <div class="bar-chart-row">
                            <div class="bar-chart-label" title="${escHtml(name)}">${escHtml(name)}</div>
                            <div class="bar-chart-bar-wrap">
                                <div class="bar-chart-bar-fill" style="width:${(secs/maxSecs*100).toFixed(1)}%;"></div>
                            </div>
                            <div class="bar-chart-value">${Tasks.formatTime(secs)}</div>
                        </div>
                    `).join('') : '<div class="text-muted text-sm" style="padding:16px;">No time data for this range.</div>'}
                </div>
            </div>
        `;

        // ── Time breakdown table ─────────────────────────
        const tasksWithTime = State.Tasks.getAll()
            .filter(t => t.timeSpent > 0)
            .sort((a, b) => b.timeSpent - a.timeSpent)
            .slice(0, 20);

        container.innerHTML += `
            <div class="chart-container" style="grid-column:1/-1;">
                <div class="chart-header">
                    <div class="chart-title">Time Breakdown</div>
                </div>
                <div style="overflow-x:auto;">
                    <table class="time-table">
                        <thead>
                            <tr>
                                <th>Task</th>
                                <th>Project</th>
                                <th>Status</th>
                                <th>Time Spent</th>
                                <th>Estimate</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tasksWithTime.length ? tasksWithTime.map(t => {
                                const proj = t.projectId ? State.Projects.get(t.projectId) : null;
                                const col  = State.getColumnById(t.projectId, t.columnId);
                                return `<tr style="cursor:pointer;" data-task-row="${t.id}">
                                    <td style="font-weight:500;color:var(--text);">${escHtml(t.title)}</td>
                                    <td>${proj ? escHtml(proj.name) : '—'}</td>
                                    <td>${col ? `<span class="badge" style="background:${Tasks.hexToRgba(col.color,0.15)};color:${col.color};">${escHtml(col.name)}</span>` : '—'}</td>
                                    <td style="font-weight:600;">${Tasks.formatHours(t.timeSpent)}</td>
                                    <td>${t.timeEstimate ? Tasks.formatHours(t.timeEstimate) : '—'}</td>
                                </tr>`;
                            }).join('') : '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-tertiary);">No time data yet. Start a timer to track time.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        container.querySelectorAll('[data-task-row]').forEach(el => {
            el.addEventListener('click', () => UI.openTaskPanel(parseInt(el.dataset.taskRow, 10)));
        });
    }

    // Delegates to the shared helper in ui.js (loaded last, so resolve at call time).
    function escHtml(str) { return UI.escHtml(str); }

    // ── CSV export ────────────────────────────────────────
    function csvCell(value) {
        const s = String(value ?? '');
        // Quote anything containing a delimiter, quote or newline; double inner quotes.
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }

    /** One row per time entry in the selected range — the useful shape for invoicing. */
    function exportCsv() {
        const startEl = document.getElementById('reportStartDate');
        const endEl   = document.getElementById('reportEndDate');
        const start = startEl?.value ? new Date(startEl.value + 'T00:00:00') : null;
        const end   = endEl?.value   ? new Date(endEl.value   + 'T23:59:59') : null;

        const rows = [['Date', 'Project', 'Task Key', 'Task', 'Priority', 'Assignee', 'Agent', 'Hours', 'Note', 'Source']];

        State.Tasks.getAll().forEach(task => {
            const projName = task.projectId
                ? (State.Projects.get(task.projectId)?.name || 'Unknown')
                : 'No Project';

            (task.timeEntries || []).forEach(e => {
                const at = new Date(e.startedAt || e.date);
                if (start && at < start) return;
                if (end   && at > end)   return;
                rows.push([
                    at.toISOString().slice(0, 10),
                    projName,
                    task.taskKey || '',
                    task.title,
                    task.priority || 'medium',
                    task.assignee || '',
                    task.agentId != null ? (State.Agents.get(task.agentId)?.slug || '') : '',
                    ((e.duration || 0) / 3600).toFixed(2),
                    e.note || '',
                    e.source || 'timer',
                ]);
            });
        });

        if (rows.length === 1) {
            UI.toast('No time entries in the selected range', 'info');
            return;
        }

        const csv = rows.map(r => r.map(csvCell).join(',')).join('\r\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `flowboard-time-${startEl?.value || 'all'}-to-${endEl?.value || 'now'}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        UI.toast(`Exported ${rows.length - 1} time entries`, 'success');
    }

    function init() {
        document.getElementById('applyReportRange')?.addEventListener('click', render);
        document.getElementById('exportReportCsv')?.addEventListener('click', exportCsv);
    }

    return { init, render, exportCsv };
})();

window.Reports = Reports;
