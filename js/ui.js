/**
 * FlowBoard — UI Module
 * Task detail slide-in panel, toast notifications, confirm dialog,
 * command palette (Cmd+K), sidebar toggle (Cmd/Ctrl+B), theme toggle, logout, settings wiring.
 */

const UI = (() => {
    const MAX_TASK_PANELS = 2;
    let _openTaskIds      = [];
    let _fullscreenTaskId = null;
    let _confirmCb        = null;
    const _timerIntervals = new Map();
    let _dragSubtaskId     = null;
    let _dragSubtaskTaskId = null;
    let _subtaskDragAllowed = false;

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
    // TASK DETAIL PANELS (up to 2)
    // ══════════════════════════════════════════════════════
    function maxTaskPanels() {
        return window.innerWidth <= 680 ? 1 : MAX_TASK_PANELS;
    }

    function isTaskPanelOpen(taskId) {
        return _openTaskIds.includes(taskId);
    }

    function getOpenTaskId() {
        return _openTaskIds[0] ?? null;
    }

    function getPanelElement(taskId) {
        return document.getElementById(`task-detail-panel-${taskId}`);
    }

    function ensurePanelShell(taskId) {
        if (getPanelElement(taskId)) return;
        const container = document.getElementById('task-detail-panels');
        if (!container) return;

        const panel = document.createElement('div');
        panel.className = 'task-detail-panel';
        panel.id = `task-detail-panel-${taskId}`;
        panel.dataset.taskId = String(taskId);
        panel.innerHTML = `
            <div class="panel-header">
                <button class="panel-close" type="button" title="Close">
                    <i class="fa-solid fa-xmark"></i>
                </button>
                <button class="panel-expand-btn" type="button" title="Open in full window">
                    <i class="fa-solid fa-expand"></i>
                </button>
                <div class="panel-task-id" id="panelTaskId-${taskId}"></div>
                <div class="panel-actions">
                    <button class="btn btn-ghost btn-icon btn-sm" id="panelTimerBtn-${taskId}" title="Start/Stop timer">
                        <i class="fa-solid fa-play"></i>
                    </button>
                    <button class="btn btn-ghost btn-icon btn-sm" id="panelOptionsBtn-${taskId}" title="Options">
                        <i class="fa-solid fa-ellipsis-vertical"></i>
                    </button>
                </div>
            </div>
            <div class="panel-body" id="panelBody-${taskId}"></div>
        `;

        panel.querySelector('.panel-close')?.addEventListener('click', () => closeTaskPanel(taskId));
        panel.querySelector('.panel-expand-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleTaskPanelFullscreen(taskId);
        });
        panel.querySelector(`#panelTimerBtn-${taskId}`)?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            State.Timer.toggle(taskId);
            openTaskPanel(taskId);
        });
        panel.addEventListener('mousedown', () => focusTaskPanel(taskId));

        container.appendChild(panel);
    }

    function removePanelShell(taskId) {
        getPanelElement(taskId)?.remove();
    }

    function focusTaskPanel(taskId) {
        document.querySelectorAll('.task-detail-panel').forEach(el => {
            el.classList.toggle('focused', parseInt(el.dataset.taskId, 10) === taskId);
        });
    }

    function exitTaskPanelFullscreen() {
        _fullscreenTaskId = null;
        syncFullscreenState();
    }

    function toggleTaskPanelFullscreen(taskId) {
        if (_fullscreenTaskId === taskId) {
            exitTaskPanelFullscreen();
            return;
        }
        if (!isTaskPanelOpen(taskId)) openTaskPanel(taskId);
        _fullscreenTaskId = taskId;
        focusTaskPanel(taskId);
        syncFullscreenState();
    }

    function syncFullscreenState() {
        const container = document.getElementById('task-detail-panels');
        if (!container) return;

        if (_fullscreenTaskId != null && !_openTaskIds.includes(_fullscreenTaskId)) {
            _fullscreenTaskId = null;
        }

        const isFullscreen = _fullscreenTaskId != null;
        container.classList.toggle('fullscreen', isFullscreen);
        document.body.classList.toggle('task-panel-fullscreen', isFullscreen);

        document.querySelectorAll('.task-detail-panel').forEach(el => {
            const id = parseInt(el.dataset.taskId, 10);
            const isActive = isFullscreen && id === _fullscreenTaskId;
            el.classList.toggle('fullscreen-active', isActive);
            el.classList.toggle('fullscreen-hidden', isFullscreen && !isActive);
        });

        document.querySelectorAll('.panel-expand-btn').forEach(btn => {
            const panel = btn.closest('.task-detail-panel');
            const id = parseInt(panel?.dataset.taskId, 10);
            const expanded = _fullscreenTaskId === id;
            btn.title = expanded ? 'Exit full window' : 'Open in full window';
            btn.innerHTML = `<i class="fa-solid ${expanded ? 'fa-compress' : 'fa-expand'}"></i>`;
            btn.setAttribute('aria-pressed', expanded ? 'true' : 'false');
        });
    }

    function syncPanelsContainer() {
        const container = document.getElementById('task-detail-panels');
        if (!container) return;

        _openTaskIds.forEach(taskId => {
            const el = getPanelElement(taskId);
            if (el) container.appendChild(el);
        });

        container.classList.toggle('open', _openTaskIds.length > 0);
        container.classList.toggle('dual-open', _openTaskIds.length > 1 && _fullscreenTaskId == null);
        if (_openTaskIds.length) focusTaskPanel(_openTaskIds[0]);
        syncFullscreenState();
    }

    function stopPanelTimer(taskId) {
        const interval = _timerIntervals.get(taskId);
        if (interval) {
            clearInterval(interval);
            _timerIntervals.delete(taskId);
        }
    }

    function openTaskPanel(taskId) {
        const task = State.Tasks.get(taskId);
        if (!task) return;

        const limit = maxTaskPanels();
        const existingIdx = _openTaskIds.indexOf(taskId);
        const wasAlreadyOpen = existingIdx !== -1;
        if (existingIdx !== -1) {
            _openTaskIds.splice(existingIdx, 1);
        }
        _openTaskIds.unshift(taskId);

        if (!wasAlreadyOpen) {
            _fullscreenTaskId = taskId;
        }

        while (_openTaskIds.length > limit) {
            const removedId = _openTaskIds.pop();
            stopPanelTimer(removedId);
            removePanelShell(removedId);
        }

        ensurePanelShell(taskId);
        const panelEl = getPanelElement(taskId);
        if (!panelEl) return;

        renderPanel(task, panelEl);
        syncPanelsContainer();
    }

    function closeTaskPanel(taskId) {
        if (_openTaskIds.length === 0) return;

        const id = taskId != null ? taskId : _openTaskIds[0];
        const idx = _openTaskIds.indexOf(id);
        if (idx === -1) return;

        _openTaskIds.splice(idx, 1);
        if (_fullscreenTaskId === id) exitTaskPanelFullscreen();
        stopPanelTimer(id);
        removePanelShell(id);
        syncPanelsContainer();
    }

    function renderPanel(task, panelEl) {
        const tid = task.id;
        const q = (suffix) => panelEl.querySelector(`#${suffix}-${tid}`);
        const proj    = task.projectId ? State.Projects.get(task.projectId) : null;
        const col     = State.getColumnById(task.projectId, task.columnId);
        const columns = proj ? [...proj.columns].sort((a, b) => a.position - b.position) : [];
        const allLabels= [...State.Labels.getAll(), ...(proj?.labels || [])];
        const running = task.isTimerRunning;
        const elapsed = running ? State.Timer.getElapsed(task.id) : 0;

        // Panel ID
        const taskIdEl = q('panelTaskId');
        if (taskIdEl) taskIdEl.textContent = task.taskKey || `TASK-${task.id}`;

        // Timer button
        const timerBtn = q('panelTimerBtn');
        if (timerBtn) {
            timerBtn.innerHTML = `<i class="fa-solid ${running ? 'fa-stop' : 'fa-play'}"></i>`;
            timerBtn.title = running ? 'Stop timer' : 'Start timer';
            timerBtn.style.color = running ? '#22c55e' : '';
        }

        // Options button
        const optBtn = q('panelOptionsBtn');
        if (optBtn) {
            optBtn.onclick = (e) => {
                e.stopPropagation();
                showPanelOptionsMenu(e, task);
            };
        }

        const body = q('panelBody');
        if (!body) return;

        body.innerHTML = `
            <!-- Title -->
            <div class="panel-title"
                 id="panelTitleEl-${tid}"
                 contenteditable="true"
                 spellcheck="false"
                 data-task-id="${task.id}">${escHtml(task.title)}</div>

            <!-- Subtasks -->
            <div class="panel-section panel-section-subtasks">
                <div class="panel-section-title">
                    Subtasks
                    ${buildSubtaskProgress(task)}
                </div>
                <div class="subtask-list" id="panelSubtasks-${tid}">
                    ${buildSubtaskTree(task.subtasks || [])}
                </div>
                <div class="add-subtask-row" id="addSubtaskRow-${tid}">
                    <i class="fa-solid fa-plus"></i> Add subtask
                </div>
            </div>


            <!-- Meta grid -->
            <div class="panel-meta-grid">
                <div class="panel-meta-item">
                    <div class="panel-meta-label">Status</div>
                    <div class="panel-meta-value">
                        <select class="form-control" id="panelStatusSel-${tid}" style="padding:4px 28px 4px 8px;font-size:14px;">
                            ${columns.map(c => `<option value="${c.id}"${c.id === task.columnId ? ' selected' : ''}
                                style="color:${c.color};">${escHtml(c.name)}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="panel-meta-item">
                    <div class="panel-meta-label">Due Date</div>
                    <div class="panel-meta-value">
                        <input type="date" class="form-control" id="panelDueDate-${tid}"
                               value="${task.dueDate || ''}"
                               style="padding:4px 8px;font-size:14px;" />
                    </div>
                </div>
                <div class="panel-meta-item">
                    <div class="panel-meta-label">Assignee</div>
                    <div class="panel-meta-value" style="gap:6px;">
                        <div class="task-card-assignee" style="width:22px;height:22px;font-size:12px;flex-shrink:0;">${(task.assignee||'?')[0].toUpperCase()}</div>
                        <span style="font-size:15px;">${escHtml(task.assignee || '—')}</span>
                    </div>
                </div>
            </motion>

            <!-- Labels -->
            <div class="panel-section">
                <div class="panel-section-title">Labels</div>
                <div class="labels-wrap" id="panelLabels-${tid}">
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
                <div class="description-toolbar" id="panelDescToolbar-${tid}">
                    <button type="button" class="desc-tool-btn" data-cmd="bold" title="Bold"><i class="fa-solid fa-bold"></i></button>
                    <button type="button" class="desc-tool-btn" data-cmd="italic" title="Italic"><i class="fa-solid fa-italic"></i></button>
                    <button type="button" class="desc-tool-btn" data-cmd="underline" title="Underline"><i class="fa-solid fa-underline"></i></button>
                    <button type="button" class="desc-tool-btn" data-cmd="strikeThrough" title="Strikethrough"><i class="fa-solid fa-strikethrough"></i></button>
                    <span class="desc-tool-sep"></span>
                    <button type="button" class="desc-tool-btn" data-cmd="insertUnorderedList" title="Bullet list"><i class="fa-solid fa-list-ul"></i></button>
                    <button type="button" class="desc-tool-btn" data-cmd="insertOrderedList" title="Numbered list"><i class="fa-solid fa-list-ol"></i></button>
                    <span class="desc-tool-sep"></span>
                    <button type="button" class="desc-tool-btn" id="panelDescCopy-${tid}" title="Copy description">
                        <i class="fa-solid fa-copy"></i>
                    </button>
                </div>
                <div class="panel-description"
                     id="panelDesc-${tid}"
                     contenteditable="true"
                     spellcheck="true"
                     data-placeholder="Add a description…"></div>
            </div>

            <!-- Time Tracking -->
            <div class="panel-section">
                <div class="panel-section-title">Time Tracking</div>
                <div style="display:flex;gap:var(--sp-2);flex-wrap:wrap;margin-bottom:var(--sp-3);">
                    <button type="button" class="btn btn-primary btn-sm" id="panelBodyStartTimer-${tid}"
                        style="display:${running ? 'none' : 'inline-flex'};align-items:center;gap:6px;">
                        <i class="fa-solid fa-play"></i> Start timer
                    </button>
                    <button type="button" class="btn btn-secondary btn-sm" id="panelBodyStopTimer-${tid}"
                        style="display:${running ? 'inline-flex' : 'none'};align-items:center;gap:6px;border-color:rgba(34,197,94,0.35);color:#22c55e;">
                        <i class="fa-solid fa-stop"></i> Stop timer
                    </button>
                </div>
                <div class="time-tracking-row">
                    <div>
                        <div class="time-display" id="panelTimeDisplay-${tid}">
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
                ${running ? `<div id="panelLiveTimer-${tid}" style="font-size:23px;font-weight:700;font-family:var(--font-mono);color:#22c55e;letter-spacing:-0.5px;">
                    ${Tasks.formatElapsed(elapsed)}
                </div>` : ''}
            </div>

        `;

        // ── Inline event handlers ──────────────────────────

        // Title blur → save
        const titleEl = q('panelTitleEl');
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
        q('panelStatusSel')?.addEventListener('change', (e) => {
            State.Tasks.update(task.id, { columnId: e.target.value });
            const { view, projectId } = Router.getCurrent();
            Router.renderView(view, projectId);
        });

        // Due date
        q('panelDueDate')?.addEventListener('change', (e) => {
            State.Tasks.update(task.id, { dueDate: e.target.value || null });
        });

        // Description — load, format toolbar, save
        const descEl = q('panelDesc');
        if (descEl) {
            Tasks.setDescriptionElement(descEl, task.description || '');

            q('panelDescToolbar')?.querySelectorAll('.desc-tool-btn').forEach(btn => {
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

            q('panelDescCopy')?.addEventListener('click', () => {
                copyDescriptionToClipboard(descEl);
            });
        }

        // Labels toggle
        panelEl.querySelectorAll(`#panelLabels-${tid} .label-select-item`).forEach(el => {
            el.addEventListener('click', () => {
                el.classList.toggle('selected');
                const selected = Array.from(panelEl.querySelectorAll(`#panelLabels-${tid} .label-select-item.selected`))
                    .map(x => x.dataset.labelId);
                State.Tasks.update(task.id, { labels: selected });
            });
        });

        // Subtasks (delegated — supports nested subtasks)
        const subtasksRoot = panelEl.querySelector(`#panelSubtasks-${tid}`);
        subtasksRoot?.addEventListener('click', (e) => {
            const addChildBtn = e.target.closest('.subtask-add-child');
            if (addChildBtn) {
                e.stopPropagation();
                const parentId = parseInt(addChildBtn.dataset.parentSub, 10);
                const text = prompt('Subtask text:');
                if (text?.trim()) {
                    State.Tasks.addSubtask(task.id, text.trim(), parentId);
                    openTaskPanel(task.id);
                }
                return;
            }
            const checkbox = e.target.closest('.subtask-checkbox');
            if (checkbox) {
                State.Tasks.toggleSubtask(task.id, parseInt(checkbox.dataset.subId, 10));
                openTaskPanel(task.id);
                return;
            }
            const delBtn = e.target.closest('.subtask-delete');
            if (delBtn) {
                e.stopPropagation();
                State.Tasks.deleteSubtask(task.id, parseInt(delBtn.dataset.subDel, 10));
                openTaskPanel(task.id);
            }
        });

        subtasksRoot?.querySelectorAll('.subtask-text').forEach(el => {
            el.contentEditable = true;
            el.addEventListener('blur', () => {
                const newText = el.textContent.trim();
                const subId   = parseInt(el.dataset.subId, 10);
                if (newText) State.Tasks.updateSubtaskText(task.id, subId, newText);
            });
        });

        q('addSubtaskRow')?.addEventListener('click', () => {
            const text = prompt('Subtask text:');
            if (text?.trim()) {
                State.Tasks.addSubtask(task.id, text.trim());
                openTaskPanel(task.id);
            }
        });

        attachSubtaskDragEvents(task.id, panelEl);

        function onPanelTimerToggle(e) {
            e.preventDefault();
            e.stopPropagation();
            State.Timer.toggle(task.id);
            openTaskPanel(task.id);
        }

        q('panelBodyStartTimer')?.addEventListener('click', onPanelTimerToggle);
        q('panelBodyStopTimer')?.addEventListener('click', onPanelTimerToggle);

        // Live timer
        if (running) startPanelTimer(task.id);
    }

    async function copyDescriptionToClipboard(descEl) {
        const text = (descEl.innerText || '').trim();
        if (!text) {
            toast('No description to copy', 'warning');
            return;
        }
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.setAttribute('readonly', '');
                ta.style.position = 'fixed';
                ta.style.left = '-9999px';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }
            toast('Description copied to clipboard', 'success');
        } catch {
            toast('Could not copy description', 'error');
        }
    }

    function attachSubtaskDragEvents(taskId, panelEl) {
        const root = panelEl.querySelector(`#panelSubtasks-${taskId}`);
        if (!root) return;

        const lists = [root, ...root.querySelectorAll('.subtask-children')];
        lists.forEach((list) => {
        list.querySelectorAll(':scope > .subtask-group > .subtask-item').forEach(item => {
            const subId = parseInt(item.dataset.subId, 10);
            item.draggable = true;

            const handle = item.querySelector('.subtask-drag-handle');
            handle?.addEventListener('mousedown', () => { _subtaskDragAllowed = true; });
            handle?.addEventListener('mouseup', () => { _subtaskDragAllowed = false; });
            handle?.addEventListener('mouseleave', () => { _subtaskDragAllowed = false; });

            item.addEventListener('dragstart', (e) => {
                if (!_subtaskDragAllowed) {
                    e.preventDefault();
                    return;
                }
                _dragSubtaskId = subId;
                _dragSubtaskTaskId = taskId;
                item.classList.add('subtask-dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(subId));
            });

            item.addEventListener('dragend', () => {
                _subtaskDragAllowed = false;
                _dragSubtaskId = null;
                _dragSubtaskTaskId = null;
                item.classList.remove('subtask-dragging');
                list.querySelectorAll('.subtask-item').forEach(el => {
                    el.classList.remove('subtask-drag-over-top', 'subtask-drag-over-bottom');
                });
            });

            item.addEventListener('dragover', (e) => {
                if (_dragSubtaskTaskId !== taskId || _dragSubtaskId === subId) return;
                e.preventDefault();
                const rect = item.getBoundingClientRect();
                const isTop = e.clientY < rect.top + rect.height / 2;
                item.classList.toggle('subtask-drag-over-top', isTop);
                item.classList.toggle('subtask-drag-over-bottom', !isTop);
            });

            item.addEventListener('dragleave', () => {
                item.classList.remove('subtask-drag-over-top', 'subtask-drag-over-bottom');
            });

            item.addEventListener('drop', (e) => {
                e.preventDefault();
                item.classList.remove('subtask-drag-over-top', 'subtask-drag-over-bottom');
                const dragId = _dragSubtaskId || parseInt(e.dataTransfer.getData('text/plain'), 10);
                const targetId = parseInt(item.dataset.subId, 10);
                if (!dragId || dragId === targetId || _dragSubtaskTaskId !== taskId) return;

                const rect = item.getBoundingClientRect();
                const insertBefore = e.clientY < rect.top + rect.height / 2;
                State.Tasks.reorderSubtask(taskId, dragId, targetId, insertBefore);
                openTaskPanel(taskId);
            });
        });
        });
    }

    function buildSubtaskProgress(task) {
        const stats = State.Tasks.subtaskStats(task);
        if (!stats.total) return '';
        const pct = Math.round((stats.done / stats.total) * 100);
        return `<span class="text-muted text-sm" style="font-weight:400;margin-left:6px;">${stats.done}/${stats.total}</span>
                <div class="progress-bar" style="width:60px;display:inline-block;vertical-align:middle;margin-left:6px;">
                    <div class="progress-fill${pct === 100 ? ' success' : ''}" style="width:${pct}%;"></div>
                </div>`;
    }

    function buildSubtaskTree(subs, depth = 0) {
        return (subs || []).map((sub) => buildSubtaskGroup(sub, depth)).join('');
    }

    function buildSubtaskGroup(sub, depth) {
        const kids = sub.subtasks || [];
        const childList = kids.length
            ? `<div class="subtask-list subtask-children">${buildSubtaskTree(kids, depth + 1)}</div>`
            : '';
        return `<div class="subtask-group">
            <div class="subtask-item" data-sub-id="${sub.id}" style="--subtask-depth:${depth}">
                <i class="fa-solid fa-grip-vertical subtask-drag-handle" title="Drag to reorder"></i>
                <div class="subtask-checkbox${sub.completed ? ' checked' : ''}" data-sub-id="${sub.id}"></div>
                <span class="subtask-text${sub.completed ? ' completed' : ''}" data-sub-id="${sub.id}">${escHtml(sub.text)}</span>
                <i class="fa-solid fa-plus subtask-add-child" data-parent-sub="${sub.id}" title="Add subtask"></i>
                <i class="fa-solid fa-xmark subtask-delete" data-sub-del="${sub.id}" title="Remove subtask"></i>
            </div>
            ${childList}
        </div>`;
    }

    function startPanelTimer(taskId) {
        stopPanelTimer(taskId);
        const interval = setInterval(() => {
            const liveEl = document.getElementById(`panelLiveTimer-${taskId}`);
            if (!liveEl) { stopPanelTimer(taskId); return; }
            liveEl.textContent = Tasks.formatElapsed(State.Timer.getElapsed(taskId));
        }, 1000);
        _timerIntervals.set(taskId, interval);
    }

    function showPanelOptionsMenu(event, task) {
        document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
        const menu = document.createElement('div');
        menu.className = 'dropdown-menu open';
        menu.style.cssText = `position:fixed;top:${event.clientY+4}px;right:calc(100vw - ${event.clientX}px);z-index:600;`;
        const fsLabel = _fullscreenTaskId === task.id ? 'Exit full window' : 'Open in full window';
        const fsIcon  = _fullscreenTaskId === task.id ? 'fa-compress' : 'fa-expand';
        menu.innerHTML = `
            <div class="dropdown-item" id="pmFullscreen"><i class="fa-solid ${fsIcon}"></i> ${fsLabel}</div>
            <div class="dropdown-item" id="pmEdit"><i class="fa-solid fa-pen"></i> Edit Task</div>
            <div class="dropdown-item" id="pmDuplicate"><i class="fa-solid fa-copy"></i> Duplicate Task</div>
            <div class="dropdown-separator"></div>
            <div class="dropdown-item danger" id="pmDelete"><i class="fa-solid fa-trash"></i> Delete Task</div>
        `;
        document.body.appendChild(menu);

        menu.querySelector('#pmFullscreen').addEventListener('click', () => {
            cleanup();
            toggleTaskPanelFullscreen(task.id);
        });
        menu.querySelector('#pmEdit').addEventListener('click', () => {
            cleanup(); Tasks.openModal(task.id);
        });
        menu.querySelector('#pmDuplicate').addEventListener('click', () => {
            cleanup();
            const copy = State.Tasks.duplicate(task.id);
            if (!copy) {
                toast('Could not duplicate task', 'error');
                return;
            }
            const { view, projectId } = Router.getCurrent();
            Router.renderView(view, projectId);
            openTaskPanel(copy.id);
            toast(`Duplicated "${task.title}"`, 'success');
        });
        menu.querySelector('#pmDelete').addEventListener('click', () => {
            cleanup();
            confirm(`Delete task "${task.title}"?`, () => {
                State.Tasks.delete(task.id);
                closeTaskPanel(task.id);
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
                    <i class="fa-solid fa-folder" style="width:18px;text-align:center;color:var(--text-tertiary);font-size:14px;"></i>
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
        // Escape key — close most recent task panel
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (document.getElementById('command-palette-scrim').classList.contains('open')) {
                    closeCommandPalette();
                } else if (_fullscreenTaskId != null) {
                    exitTaskPanelFullscreen();
                } else if (document.getElementById('task-detail-panels')?.classList.contains('open')) {
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

        // Keep panels in sync when timer is started from board / list / elsewhere
        State.on('timer:started', (taskId) => {
            if (isTaskPanelOpen(taskId)) openTaskPanel(taskId);
        });

        // Timer stopped → refresh panel
        State.on('timer:stopped', (taskId) => {
            stopPanelTimer(taskId);
            if (isTaskPanelOpen(taskId)) openTaskPanel(taskId);
        });

        // Tasks changed → refresh panel if open
        State.on('tasks:changed', ({ type, task }) => {
            if (task && isTaskPanelOpen(task.id) && type === 'update') {
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
        openTaskPanel, closeTaskPanel, getOpenTaskId, isTaskPanelOpen,
        toggleTaskPanelFullscreen, exitTaskPanelFullscreen,
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
