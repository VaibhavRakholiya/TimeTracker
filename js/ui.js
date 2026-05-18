/**
 * FlowBoard — UI Module
 * Task detail slide-in panel, toast notifications, confirm dialog,
 * command palette (Cmd+K), sidebar toggle (Cmd/Ctrl+B), theme toggle, logout, settings wiring.
 */

const UI = (() => {
    let _openTaskId     = null;
    let _confirmCb      = null;
    let _timerInterval  = null;

    // ══════════════════════════════════════════════════════
    // TOAST NOTIFICATIONS
    // ══════════════════════════════════════════════════════
    function toast(message, type = 'info', title) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const icons = {
            success: 'fa-circle-check',
            error:   'fa-circle-xmark',
            warning: 'fa-triangle-exclamation',
            info:    'fa-circle-info',
        };

        const el = document.createElement('div');
        el.className = `toast toast-${type}`;
        el.innerHTML = `
            <div class="toast-icon"><i class="fa-solid ${icons[type] || icons.info}"></i></div>
            <div class="toast-content">
                ${title ? `<div class="toast-title">${escHtml(title)}</div>` : ''}
                <div class="toast-message">${escHtml(message)}</div>
            </div>
            <div class="toast-close"><i class="fa-solid fa-xmark"></i></div>
        `;

        container.appendChild(el);
        el.querySelector('.toast-close').addEventListener('click', () => dismissToast(el));
        setTimeout(() => dismissToast(el), 4000);
    }

    function dismissToast(el) {
        if (!el.parentNode) return;
        el.classList.add('removing');
        setTimeout(() => el.parentNode && el.parentNode.removeChild(el), 260);
    }

    // ══════════════════════════════════════════════════════
    // CONFIRM DIALOG
    // ══════════════════════════════════════════════════════
    function confirm(message, callback, okLabel = 'Delete', okClass = 'btn-danger') {
        _confirmCb = callback;
        document.getElementById('confirmMessage').textContent = message;
        const okBtn = document.getElementById('confirmOk');
        if (okBtn) {
            okBtn.textContent = okLabel;
            okBtn.className   = `btn ${okClass}`;
        }
        document.getElementById('confirmModalScrim').classList.add('open');
    }

    function closeConfirm() {
        document.getElementById('confirmModalScrim').classList.remove('open');
        _confirmCb = null;
    }

    // ══════════════════════════════════════════════════════
    // TASK DETAIL PANEL
    // ══════════════════════════════════════════════════════
    function openTaskPanel(taskId) {
        const task = State.Tasks.get(taskId);
        if (!task) return;
        _openTaskId = taskId;

        const panel = document.getElementById('task-detail-panel');
        if (!panel) return;

        renderPanel(task);
        panel.classList.add('open');
    }

    function closeTaskPanel() {
        _openTaskId = null;
        document.getElementById('task-detail-panel')?.classList.remove('open');
        if (_timerInterval) { clearInterval(_timerInterval); _timerInterval = null; }
    }

    function getOpenTaskId() { return _openTaskId; }

    function renderPanel(task) {
        const proj    = task.projectId ? State.Projects.get(task.projectId) : null;
        const col     = State.getColumnById(task.projectId, task.columnId);
        const columns = proj ? [...proj.columns].sort((a, b) => a.position - b.position) : [];
        const allLabels= [...State.Labels.getAll(), ...(proj?.labels || [])];
        const running = task.isTimerRunning;
        const elapsed = running ? State.Timer.getElapsed(task.id) : 0;

        // Panel ID
        document.getElementById('panelTaskId').textContent = task.taskKey || `TASK-${task.id}`;

        // Timer button
        const timerBtn = document.getElementById('panelTimerBtn');
        if (timerBtn) {
            timerBtn.innerHTML = `<i class="fa-solid ${running ? 'fa-stop' : 'fa-play'}"></i>`;
            timerBtn.title = running ? 'Stop timer' : 'Start timer';
            timerBtn.style.color = running ? '#22c55e' : '';
        }

        // Options button
        const optBtn = document.getElementById('panelOptionsBtn');
        if (optBtn) {
            optBtn.onclick = (e) => {
                e.stopPropagation();
                showPanelOptionsMenu(e, task);
            };
        }

        const body = document.getElementById('panelBody');
        if (!body) return;

        body.innerHTML = `
            <!-- Title -->
            <div class="panel-title"
                 id="panelTitleEl"
                 contenteditable="true"
                 spellcheck="false"
                 data-task-id="${task.id}">${escHtml(task.title)}</div>

            <!-- Meta grid -->
            <div class="panel-meta-grid">
                <div class="panel-meta-item">
                    <div class="panel-meta-label">Status</div>
                    <div class="panel-meta-value">
                        <select class="form-control" id="panelStatusSel" style="padding:4px 28px 4px 8px;font-size:12px;">
                            ${columns.map(c => `<option value="${c.id}"${c.id === task.columnId ? ' selected' : ''}
                                style="color:${c.color};">${escHtml(c.name)}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="panel-meta-item">
                    <div class="panel-meta-label">Priority</div>
                    <div class="panel-meta-value">
                        <select class="form-control" id="panelPrioritySel" style="padding:4px 28px 4px 8px;font-size:12px;">
                            <option value="critical"${task.priority==='critical'?' selected':''}>🔴 Critical</option>
                            <option value="high"${task.priority==='high'?' selected':''}>🟠 High</option>
                            <option value="medium"${task.priority==='medium'?' selected':''}>🔵 Medium</option>
                            <option value="low"${task.priority==='low'?' selected':''}>⚪ Low</option>
                        </select>
                    </div>
                </div>
                <div class="panel-meta-item">
                    <div class="panel-meta-label">Due Date</div>
                    <div class="panel-meta-value">
                        <input type="date" class="form-control" id="panelDueDate"
                               value="${task.dueDate || ''}"
                               style="padding:4px 8px;font-size:12px;" />
                    </div>
                </div>
                <div class="panel-meta-item">
                    <div class="panel-meta-label">Assignee</div>
                    <div class="panel-meta-value" style="gap:6px;">
                        <div class="task-card-assignee" style="width:22px;height:22px;font-size:10px;flex-shrink:0;">${(task.assignee||'?')[0].toUpperCase()}</div>
                        <span style="font-size:12.5px;">${escHtml(task.assignee || '—')}</span>
                    </div>
                </div>
                <div class="panel-meta-item">
                    <div class="panel-meta-label">Project</div>
                    <div class="panel-meta-value">
                        <span style="font-size:12.5px;">${proj ? escHtml(proj.name) : '—'}</span>
                    </div>
                </div>
                <div class="panel-meta-item">
                    <div class="panel-meta-label">Start Date</div>
                    <div class="panel-meta-value">
                        <input type="date" class="form-control" id="panelStartDate"
                               value="${task.startDate || ''}"
                               style="padding:4px 8px;font-size:12px;" />
                    </div>
                </div>
            </div>

            <!-- Labels -->
            <div class="panel-section">
                <div class="panel-section-title">Labels</div>
                <div class="labels-wrap" id="panelLabels">
                    ${allLabels.map(l => {
                        const sel = (task.labels||[]).includes(l.id);
                        return `<div class="label-select-item${sel ? ' selected' : ''}"
                                     data-label-id="${l.id}"
                                     style="background:${l.bg||'rgba(99,102,241,0.1)'};color:${l.color};">
                            ${escHtml(l.name)}
                        </div>`;
                    }).join('')}
                </div>
            </div>

            <!-- Description -->
            <div class="panel-section">
                <div class="panel-section-title">Description</div>
                <div class="description-toolbar" id="panelDescToolbar">
                    <button type="button" class="desc-tool-btn" data-cmd="bold" title="Bold"><i class="fa-solid fa-bold"></i></button>
                    <button type="button" class="desc-tool-btn" data-cmd="italic" title="Italic"><i class="fa-solid fa-italic"></i></button>
                    <button type="button" class="desc-tool-btn" data-cmd="underline" title="Underline"><i class="fa-solid fa-underline"></i></button>
                    <button type="button" class="desc-tool-btn" data-cmd="strikeThrough" title="Strikethrough"><i class="fa-solid fa-strikethrough"></i></button>
                    <span class="desc-tool-sep"></span>
                    <button type="button" class="desc-tool-btn" data-cmd="insertUnorderedList" title="Bullet list"><i class="fa-solid fa-list-ul"></i></button>
                    <button type="button" class="desc-tool-btn" data-cmd="insertOrderedList" title="Numbered list"><i class="fa-solid fa-list-ol"></i></button>
                </div>
                <div class="panel-description"
                     id="panelDesc"
                     contenteditable="true"
                     spellcheck="true"
                     data-placeholder="Add a description…"></div>
            </div>

            <!-- Subtasks -->
            <div class="panel-section">
                <div class="panel-section-title">
                    Subtasks
                    ${buildSubtaskProgress(task)}
                </div>
                <div class="subtask-list" id="panelSubtasks">
                    ${(task.subtasks||[]).map(sub => buildSubtaskItem(sub)).join('')}
                </div>
                <div class="add-subtask-row" id="addSubtaskRow">
                    <i class="fa-solid fa-plus"></i> Add subtask
                </div>
            </div>

            <!-- Time Tracking -->
            <div class="panel-section">
                <div class="panel-section-title">Time Tracking</div>
                <div style="display:flex;gap:var(--sp-2);flex-wrap:wrap;margin-bottom:var(--sp-3);">
                    <button type="button" class="btn btn-primary btn-sm" id="panelBodyStartTimer"
                        style="display:${running ? 'none' : 'inline-flex'};align-items:center;gap:6px;">
                        <i class="fa-solid fa-play"></i> Start timer
                    </button>
                    <button type="button" class="btn btn-secondary btn-sm" id="panelBodyStopTimer"
                        style="display:${running ? 'inline-flex' : 'none'};align-items:center;gap:6px;border-color:rgba(34,197,94,0.35);color:#22c55e;">
                        <i class="fa-solid fa-stop"></i> Stop timer
                    </button>
                </div>
                <div class="time-tracking-row">
                    <div>
                        <div class="time-display" id="panelTimeDisplay">
                            ${Tasks.formatHours(task.timeSpent)}
                        </div>
                        <div class="time-sub">${running ? 'Running…' : 'Total spent'}</div>
                    </div>
                    ${task.timeEstimate ? `
                    <div class="time-progress-wrap">
                        <div class="time-progress-labels">
                            <span>0</span>
                            <span>${Tasks.formatHours(task.timeEstimate)} est.</span>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill${task.timeSpent >= task.timeEstimate ? ' danger' : ''}"
                                 style="width:${Math.min(100, ((task.timeSpent||0)/task.timeEstimate)*100).toFixed(1)}%;">
                            </div>
                        </div>
                    </div>` : ''}
                </div>
                ${running ? `<div id="panelLiveTimer" style="font-size:20px;font-weight:700;font-family:var(--font-mono);color:#22c55e;letter-spacing:-0.5px;">
                    ${Tasks.formatElapsed(elapsed)}
                </div>` : ''}
            </div>

            <!-- Comments -->
            <div class="panel-section">
                <div class="panel-section-title">Comments (${(task.comments||[]).length})</div>
                <div class="comment-list" id="panelComments">
                    ${(task.comments||[]).map(c => buildCommentItem(c)).join('')}
                </div>
                <div class="comment-input-row">
                    <div class="task-card-assignee" style="flex-shrink:0;">${(localStorage.getItem('username')||'A')[0].toUpperCase()}</div>
                    <textarea class="comment-input" id="panelCommentInput" placeholder="Add a comment… (Enter to send)" rows="1"></textarea>
                    <button class="btn btn-primary btn-sm" id="panelCommentSend">Send</button>
                </div>
            </div>

            <!-- Activity log -->
            <div class="panel-section">
                <div class="panel-section-title">Activity</div>
                <div class="activity-log" id="panelActivityLog">
                    <div class="log-item">
                        <div class="log-dot"></div>
                        <div style="flex:1;">Task created</div>
                        <div class="log-item-time">${new Date(task.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</div>
                    </div>
                    ${(State.Activity.getAll())
                        .filter(a => a.taskTitle === task.title)
                        .slice(0,5)
                        .map(a => `<div class="log-item">
                            <div class="log-dot"></div>
                            <div style="flex:1;">${escHtml(a.action.replace(/_/g,' '))}${a.extra ? ' ' + escHtml(a.extra) : ''}</div>
                            <div class="log-item-time">${timeAgo(new Date(a.at))}</div>
                        </div>`).join('')}
                </div>
            </div>
        `;

        // ── Inline event handlers ──────────────────────────

        // Title blur → save
        const titleEl = document.getElementById('panelTitleEl');
        if (titleEl) {
            titleEl.addEventListener('blur', () => {
                const newTitle = titleEl.textContent.trim();
                if (newTitle && newTitle !== task.title) {
                    State.Tasks.update(task.id, { title: newTitle });
                }
            });
            titleEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); } });
        }

        // Status change
        document.getElementById('panelStatusSel')?.addEventListener('change', (e) => {
            State.Tasks.update(task.id, { columnId: e.target.value });
            const { view, projectId } = Router.getCurrent();
            Router.renderView(view, projectId);
        });

        // Priority change
        document.getElementById('panelPrioritySel')?.addEventListener('change', (e) => {
            State.Tasks.update(task.id, { priority: e.target.value });
            const { view, projectId } = Router.getCurrent();
            Router.renderView(view, projectId);
        });

        // Due date
        document.getElementById('panelDueDate')?.addEventListener('change', (e) => {
            State.Tasks.update(task.id, { dueDate: e.target.value || null });
        });

        // Start date
        document.getElementById('panelStartDate')?.addEventListener('change', (e) => {
            State.Tasks.update(task.id, { startDate: e.target.value || null });
        });

        // Description — load, format toolbar, save
        const descEl = document.getElementById('panelDesc');
        if (descEl) {
            Tasks.setDescriptionElement(descEl, task.description || '');

            document.getElementById('panelDescToolbar')?.querySelectorAll('.desc-tool-btn').forEach(btn => {
                btn.addEventListener('mousedown', e => {
                    e.preventDefault();
                    descEl.focus();
                    document.execCommand(btn.dataset.cmd, false, null);
                });
            });

            descEl.addEventListener('paste', e => {
                e.preventDefault();
                const text = (e.clipboardData || window.clipboardData).getData('text/plain');
                document.execCommand('insertText', false, text);
            });

            descEl.addEventListener('blur', () => {
                const next = Tasks.getDescriptionFromElement(descEl);
                if (next !== (task.description || '')) {
                    State.Tasks.update(task.id, { description: next });
                }
            });
        }

        // Labels toggle
        document.querySelectorAll('#panelLabels .label-select-item').forEach(el => {
            el.addEventListener('click', () => {
                el.classList.toggle('selected');
                const selected = Array.from(document.querySelectorAll('#panelLabels .label-select-item.selected'))
                    .map(x => x.dataset.labelId);
                State.Tasks.update(task.id, { labels: selected });
            });
        });

        // Subtasks
        document.querySelectorAll('#panelSubtasks .subtask-checkbox').forEach(el => {
            el.addEventListener('click', () => {
                State.Tasks.toggleSubtask(task.id, parseInt(el.dataset.subId, 10));
                openTaskPanel(task.id);
            });
        });

        document.querySelectorAll('#panelSubtasks .subtask-delete').forEach(el => {
            el.addEventListener('click', () => {
                State.Tasks.deleteSubtask(task.id, parseInt(el.dataset.subDel, 10));
                openTaskPanel(task.id);
            });
        });

        document.querySelectorAll('#panelSubtasks .subtask-text').forEach(el => {
            el.contentEditable = true;
            el.addEventListener('blur', () => {
                const newText = el.textContent.trim();
                const subId   = parseInt(el.dataset.subId, 10);
                if (newText) {
                    const t = State.Tasks.get(task.id);
                    if (t) {
                        const sub = t.subtasks.find(s => s.id === subId);
                        if (sub) { sub.text = newText; State.save(); }
                    }
                }
            });
        });

        document.getElementById('addSubtaskRow')?.addEventListener('click', () => {
            const text = prompt('Subtask text:');
            if (text && text.trim()) {
                State.Tasks.addSubtask(task.id, text.trim());
                openTaskPanel(task.id);
            }
        });

        // Comment
        const commentInput = document.getElementById('panelCommentInput');
        commentInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendComment(); }
        });
        document.getElementById('panelCommentSend')?.addEventListener('click', sendComment);

        function sendComment() {
            const text = commentInput?.value.trim();
            if (!text) return;
            State.Tasks.addComment(task.id, text);
            commentInput.value = '';
            const updated = State.Tasks.get(task.id);
            const commentList = document.getElementById('panelComments');
            if (commentList && updated) {
                commentList.innerHTML = (updated.comments||[]).map(c => buildCommentItem(c)).join('');
            }
        }

        function onPanelTimerToggle(e) {
            e.preventDefault();
            e.stopPropagation();
            State.Timer.toggle(task.id);
            openTaskPanel(task.id);
        }

        document.getElementById('panelBodyStartTimer')?.addEventListener('click', onPanelTimerToggle);
        document.getElementById('panelBodyStopTimer')?.addEventListener('click', onPanelTimerToggle);

        // Live timer
        if (running) startPanelTimer(task.id);
    }

    function buildSubtaskProgress(task) {
        const subs  = task.subtasks || [];
        if (!subs.length) return '';
        const done  = subs.filter(s => s.completed).length;
        const pct   = Math.round((done / subs.length) * 100);
        return `<span class="text-muted text-sm" style="font-weight:400;margin-left:6px;">${done}/${subs.length}</span>
                <div class="progress-bar" style="width:60px;display:inline-block;vertical-align:middle;margin-left:6px;">
                    <div class="progress-fill${pct===100?' success':''}" style="width:${pct}%;"></div>
                </div>`;
    }

    function buildSubtaskItem(sub) {
        return `<div class="subtask-item">
            <div class="subtask-checkbox${sub.completed ? ' checked' : ''}" data-sub-id="${sub.id}"></div>
            <span class="subtask-text${sub.completed ? ' completed' : ''}" data-sub-id="${sub.id}">${escHtml(sub.text)}</span>
            <i class="fa-solid fa-xmark subtask-delete" data-sub-del="${sub.id}" title="Remove subtask"></i>
        </div>`;
    }

    function buildCommentItem(comment) {
        const init = (comment.author || 'A')[0].toUpperCase();
        return `<div class="comment-item">
            <div class="comment-avatar">${init}</div>
            <div class="comment-content">
                <div class="comment-header">
                    <span class="comment-author">${escHtml(comment.author)}</span>
                    <span class="comment-time">${timeAgo(new Date(comment.createdAt))}</span>
                </div>
                <div class="comment-text">${escHtml(comment.text)}</div>
            </div>
        </div>`;
    }

    function startPanelTimer(taskId) {
        if (_timerInterval) clearInterval(_timerInterval);
        _timerInterval = setInterval(() => {
            const liveEl = document.getElementById('panelLiveTimer');
            if (!liveEl) { clearInterval(_timerInterval); return; }
            const elapsed = State.Timer.getElapsed(taskId);
            liveEl.textContent = Tasks.formatElapsed(elapsed);
        }, 1000);
    }

    function showPanelOptionsMenu(event, task) {
        document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
        const menu = document.createElement('div');
        menu.className = 'dropdown-menu open';
        menu.style.cssText = `position:fixed;top:${event.clientY+4}px;right:calc(100vw - ${event.clientX}px);z-index:600;`;
        menu.innerHTML = `
            <div class="dropdown-item" id="pmEdit"><i class="fa-solid fa-pen"></i> Edit Task</div>
            <div class="dropdown-separator"></div>
            <div class="dropdown-item danger" id="pmDelete"><i class="fa-solid fa-trash"></i> Delete Task</div>
        `;
        document.body.appendChild(menu);

        menu.querySelector('#pmEdit').addEventListener('click', () => {
            cleanup(); Tasks.openModal(task.id);
        });
        menu.querySelector('#pmDelete').addEventListener('click', () => {
            cleanup();
            confirm(`Delete task "${task.title}"?`, () => {
                State.Tasks.delete(task.id);
                closeTaskPanel();
                const { view, projectId } = Router.getCurrent();
                Router.renderView(view, projectId);
                toast(`Task deleted`, 'success');
            });
        });

        function cleanup() { if (menu.parentNode) menu.parentNode.removeChild(menu); }
        setTimeout(() => {
            document.addEventListener('click', function h(e) {
                if (!menu.contains(e.target)) { cleanup(); document.removeEventListener('click', h); }
            });
        }, 0);
    }

    // ══════════════════════════════════════════════════════
    // COMMAND PALETTE
    // ══════════════════════════════════════════════════════
    let _cmdSelectedIdx = 0;

    function openCommandPalette() {
        const scrim = document.getElementById('command-palette-scrim');
        if (!scrim) return;
        scrim.classList.add('open');
        const input = document.getElementById('cmdPaletteInput');
        if (input) {
            input.value = '';
            input.focus();
            renderCmdResults('');
        }
    }

    function closeCommandPalette() {
        document.getElementById('command-palette-scrim')?.classList.remove('open');
    }

    function renderCmdResults(query) {
        const container = document.getElementById('cmdPaletteResults');
        if (!container) return;

        const q = query.toLowerCase().trim();
        let html = '';

        // ── Navigation commands ────────────────────────────
        const navCmds = [
            { icon: 'fa-house',          label: 'Go to Dashboard',  action: () => { closeCommandPalette(); Router.navigate('dashboard'); } },
            { icon: 'fa-check-circle',   label: 'My Tasks',         action: () => { closeCommandPalette(); Router.navigate('mytasks'); } },
            { icon: 'fa-chart-gantt',    label: 'Timeline',         action: () => { closeCommandPalette(); Router.navigate('timeline'); } },
            { icon: 'fa-chart-bar',      label: 'Reports',          action: () => { closeCommandPalette(); Router.navigate('reports'); } },
            { icon: 'fa-plus',           label: 'New Task',         action: () => { closeCommandPalette(); Tasks.openModal(); }, kbd: ['N'] },
            { icon: 'fa-diagram-project',label: 'New Project',      action: () => { closeCommandPalette(); Projects.openModal(); } },
            { icon: 'fa-bolt',           label: 'New Sprint',       action: () => { closeCommandPalette(); Sprints.openModal(); } },
        ];

        const filteredCmds = q ? navCmds.filter(c => c.label.toLowerCase().includes(q)) : navCmds;

        if (filteredCmds.length) {
            html += `<div class="command-group-title">Actions</div>`;
            html += filteredCmds.map((cmd, i) => `
                <div class="command-item" data-cmd-idx="${i}">
                    <i class="fa-solid ${cmd.icon}"></i>
                    <span class="command-item-label">${cmd.label}</span>
                    ${cmd.kbd ? `<div class="command-item-kbd">${cmd.kbd.map(k=>`<kbd>${k}</kbd>`).join('')}</div>` : ''}
                </div>
            `).join('');
        }

        // ── Projects ───────────────────────────────────────
        const projects = State.Projects.getAll().filter(p => !q || p.name.toLowerCase().includes(q));
        if (projects.length) {
            html += `<div class="command-group-title">Projects</div>`;
            html += projects.map((p, i) => `
                <div class="command-item" data-proj-id="${p.id}">
                    <i class="fa-solid fa-folder" style="width:18px;text-align:center;color:var(--text-tertiary);font-size:12px;"></i>
                    <span class="command-item-label">${escHtml(p.name)}</span>
                    <span class="command-item-sub">Board</span>
                </div>
            `).join('');
        }

        // ── Tasks search ───────────────────────────────────
        if (q && q.length > 1) {
            const tasks = State.Tasks.getAll()
                .filter(t => t.title.toLowerCase().includes(q))
                .slice(0, 8);
            if (tasks.length) {
                html += `<div class="command-group-title">Tasks</div>`;
                html += tasks.map(t => {
                    const proj = t.projectId ? State.Projects.get(t.projectId) : null;
                    return `<div class="command-item" data-task-cmd="${t.id}">
                        <i class="fa-solid fa-list-check"></i>
                        <span class="command-item-label">${escHtml(t.title)}</span>
                        <span class="command-item-sub">${proj ? escHtml(proj.name) : ''}</span>
                    </div>`;
                }).join('');
            }
        }

        if (!html) {
            html = `<div class="command-palette-empty">No results for "${escHtml(query)}"</div>`;
        }

        container.innerHTML = html;

        // Bind actions
        container.querySelectorAll('[data-cmd-idx]').forEach((el, i) => {
            el.addEventListener('click', () => filteredCmds[i]?.action());
        });
        container.querySelectorAll('[data-proj-id]').forEach(el => {
            el.addEventListener('click', () => {
                closeCommandPalette();
                Router.navigate('backlog', parseInt(el.dataset.projId, 10));
            });
        });
        container.querySelectorAll('[data-task-cmd]').forEach(el => {
            el.addEventListener('click', () => {
                closeCommandPalette();
                openTaskPanel(parseInt(el.dataset.taskCmd, 10));
            });
        });
    }

    // ══════════════════════════════════════════════════════
    // THEME TOGGLE
    // ══════════════════════════════════════════════════════
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('flowboard-theme', theme);
        const icon = document.getElementById('headerThemeIcon');
        if (icon) icon.className = `fa-solid ${theme === 'dark' ? 'fa-sun' : 'fa-moon'}`;

        // Sync settings chips
        document.querySelectorAll('[data-theme-pick]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.themePick === theme);
        });

        // Redraw donut (theme affects canvas fill)
        if (Router.getCurrent().view === 'dashboard') Dashboard.render();
    }

    function toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        applyTheme(current === 'dark' ? 'light' : 'dark');
    }

    function isTypingShortcutTarget(el) {
        if (!el || !el.tagName) return false;
        const tag = el.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
        return !!el.isContentEditable;
    }

    /** Toggle left nav: mobile drawer vs desktop collapsed rail (same as header button). */
    function toggleAppSidebar() {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) return;
        if (window.innerWidth <= 680) {
            sidebar.classList.toggle('mobile-open');
            document.getElementById('mobileSidebarOverlay')?.classList.toggle('visible');
        } else {
            sidebar.classList.toggle('collapsed');
        }
    }

    // ══════════════════════════════════════════════════════
    // INIT
    // ══════════════════════════════════════════════════════
    function init() {
        // ── Panel close ────────────────────────────────────
        document.getElementById('panelClose')?.addEventListener('click', closeTaskPanel);

        // Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (document.getElementById('command-palette-scrim').classList.contains('open')) {
                    closeCommandPalette();
                } else if (document.getElementById('task-detail-panel').classList.contains('open')) {
                    closeTaskPanel();
                }
            }
            // Cmd/Ctrl + K → command palette
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                openCommandPalette();
            }
            // Cmd/Ctrl + B → toggle left sidebar
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
                if (isTypingShortcutTarget(e.target)) return;
                e.preventDefault();
                toggleAppSidebar();
            }
        });

        // Timer toggle in panel header (same behavior as body controls)
        document.getElementById('panelTimerBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (_openTaskId) {
                State.Timer.toggle(_openTaskId);
                openTaskPanel(_openTaskId);
            }
        });

        // Keep panel in sync when timer is started from board / list / elsewhere
        State.on('timer:started', (taskId) => {
            if (_openTaskId === taskId) openTaskPanel(taskId);
        });

        // Timer stopped → refresh panel
        State.on('timer:stopped', (taskId) => {
            if (_timerInterval) { clearInterval(_timerInterval); _timerInterval = null; }
            if (_openTaskId === taskId) openTaskPanel(taskId);
        });

        // Tasks changed → refresh panel if open
        State.on('tasks:changed', ({ type, task }) => {
            if (_openTaskId && task && task.id === _openTaskId && type === 'update') {
                // Lightweight refresh: update title/status without re-rendering
            }
        });

        // ── Command Palette ────────────────────────────────
        document.getElementById('cmdPaletteTrigger')?.addEventListener('click', openCommandPalette);
        document.getElementById('command-palette-scrim')?.addEventListener('click', (e) => {
            if (e.target === document.getElementById('command-palette-scrim')) closeCommandPalette();
        });
        document.getElementById('cmdPaletteInput')?.addEventListener('input', (e) => {
            renderCmdResults(e.target.value);
        });

        // ── Confirm dialog ─────────────────────────────────
        document.getElementById('confirmOk')?.addEventListener('click', () => {
            if (_confirmCb) _confirmCb();
            closeConfirm();
        });
        document.getElementById('confirmCancel')?.addEventListener('click', closeConfirm);
        document.getElementById('confirmModalClose')?.addEventListener('click', closeConfirm);
        document.getElementById('confirmModalScrim')?.addEventListener('click', e => {
            if (e.target === document.getElementById('confirmModalScrim')) closeConfirm();
        });

        // ── Theme toggle ───────────────────────────────────
        document.getElementById('themeToggleBtn')?.addEventListener('click', toggleTheme);

        // Initial theme icon
        const theme = document.documentElement.getAttribute('data-theme') || 'dark';
        const icon  = document.getElementById('headerThemeIcon');
        if (icon) icon.className = `fa-solid ${theme === 'dark' ? 'fa-sun' : 'fa-moon'}`;

        // Settings theme pickers
        document.querySelectorAll('[data-theme-pick]').forEach(btn => {
            btn.addEventListener('click', () => applyTheme(btn.dataset.themePick));
        });

        // ── Logout ─────────────────────────────────────────
        function doLogout() {
            localStorage.removeItem('isLoggedIn');
            localStorage.removeItem('loginTime');
            window.location.href = 'login.html';
        }
        document.getElementById('logoutBtn')?.addEventListener('click', doLogout);
        document.getElementById('settingsLogoutBtn')?.addEventListener('click', doLogout);

        // Sidebar user menu
        document.getElementById('sidebarUser')?.addEventListener('click', (e) => {
            if (e.target.closest('#logoutBtn')) return;
            Router.navigate('settings');
        });

        // ── Export / Clear Data ────────────────────────────
        document.getElementById('exportDataBtn')?.addEventListener('click', () => {
            State.exportData();
            toast('Data exported', 'success');
        });

        document.getElementById('clearDataBtn')?.addEventListener('click', () => {
            confirm('Clear ALL data? This cannot be undone.', () => {
                State.clearAll();
                Projects.renderSidebar();
                Router.navigate('dashboard');
                toast('All data cleared', 'warning');
            });
        });

        // ── Sidebar toggle ─────────────────────────────────
        const sidebar = document.getElementById('sidebar');
        document.getElementById('sidebarToggle')?.addEventListener('click', toggleAppSidebar);

        document.getElementById('mobileSidebarOverlay')?.addEventListener('click', () => {
            sidebar.classList.remove('mobile-open');
            document.getElementById('mobileSidebarOverlay')?.classList.remove('visible');
        });

        // ── User display ───────────────────────────────────
        const username  = localStorage.getItem('username') || 'Admin';
        const initial   = username[0].toUpperCase();
        const avatarEl  = document.getElementById('sidebarUserAvatar');
        const nameEl    = document.getElementById('sidebarUserName');
        if (avatarEl) avatarEl.textContent = initial;
        if (nameEl)   nameEl.textContent   = username;
    }

    // ── Helpers ────────────────────────────────────────────
    function escHtml(str) {
        return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function timeAgo(date) {
        const diff = (Date.now() - date.getTime()) / 1000;
        if (diff < 60)    return 'just now';
        if (diff < 3600)  return `${Math.floor(diff/60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
        return `${Math.floor(diff/86400)}d ago`;
    }

    return {
        init, toast, confirm,
        openTaskPanel, closeTaskPanel, getOpenTaskId,
        openCommandPalette, closeCommandPalette,
        applyTheme, toggleTheme,
    };
})();

window.UI = UI;

// ── App bootstrap ──────────────────────────────────────────
const App = (() => {
    function init() {
        // Init state first
        State.init();

        // Init all modules
        UI.init();
        Projects.init();
        Tasks.init();
        Board.init();
        Backlog.init();
        Sprints.init();
        Dashboard.init();
        Timeline.init();
        Router.init();

        // Try to sync from Firebase in background
        State.loadFromFirebase().then(loaded => {
            if (loaded) {
                Projects.renderSidebar();
                const { view, projectId } = Router.getCurrent();
                Router.renderView(view, projectId);
            }
        });
    }

    return { init };
})();

window.App = App;
