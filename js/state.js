/**
 * FlowBoard — State Management
 * Central in-memory store with localStorage persistence and Firebase sync.
 */

const State = (() => {
    const STORAGE_KEY = 'flowboard_data';
    const ACTIVITY_KEY = 'flowboard_activity';
    const MAX_ACTIVITY = 50;

    const defaultColumns = [
        { id: 'col-todo',       name: 'To Do',       color: '#6b7280', position: 0, wipLimit: null },
        { id: 'col-inprogress', name: 'In Progress',  color: '#3b82f6', position: 1, wipLimit: null },
        { id: 'col-inreview',   name: 'In Review',    color: '#f59e0b', position: 2, wipLimit: null },
        { id: 'col-done',       name: 'Done',         color: '#22c55e', position: 3, wipLimit: null },
    ];

    const defaultLabels = [
        { id: 'lbl-bug',      name: 'Bug',      color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
        { id: 'lbl-feature',  name: 'Feature',  color: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
        { id: 'lbl-design',   name: 'Design',   color: '#ec4899', bg: 'rgba(236,72,153,0.12)' },
        { id: 'lbl-docs',     name: 'Docs',     color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
        { id: 'lbl-backend',  name: 'Release',  color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
        { id: 'lbl-frontend', name: 'Frontend', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
    ];

    function getDefaults() {
        return {
            projects: [],
            tasks:    [],
            sprints:  [],
            labels:   defaultLabels,
            activity: [],
        };
    }

    /** Fix imported / legacy tasks so timer stop and UI stay consistent. Mutates in place. */
    function normalizeImportedTask(task) {
        if (!task || typeof task !== 'object') return;
        if (!Array.isArray(task.timeEntries)) task.timeEntries = [];
        const r = task.isTimerRunning;
        task.isTimerRunning = r === true || r === 1 ||
            (typeof r === 'string' && ['true', '1', 'yes'].includes(r.trim().toLowerCase()));
        if (task.timerStart != null && task.timerStart !== '') {
            const n = Number(task.timerStart);
            task.timerStart = Number.isFinite(n) ? n : null;
        } else {
            task.timerStart = null;
        }
        if (task.isTimerRunning && task.timerStart == null) {
            task.isTimerRunning = false;
        }
        if (!Array.isArray(task.subtasks)) task.subtasks = [];
        normalizeSubtasksList(task.subtasks);
    }

    function normalizeSubtasksList(list) {
        if (!Array.isArray(list)) return;
        list.forEach((s) => {
            if (!s || typeof s !== 'object') return;
            if (!Array.isArray(s.subtasks)) s.subtasks = [];
            normalizeSubtasksList(s.subtasks);
        });
    }

    function findSubtaskEntry(list, subtaskId) {
        if (!Array.isArray(list)) return null;
        for (let i = 0; i < list.length; i++) {
            const s = list[i];
            if (s.id == subtaskId) return { list, index: i, sub: s };
            const nested = findSubtaskEntry(s.subtasks, subtaskId);
            if (nested) return nested;
        }
        return null;
    }

    function cloneSubtasksTree(subs, nextId) {
        return (subs || []).map((s) => ({
            id:        nextId(),
            text:      s.text || '',
            completed: !!s.completed,
            subtasks:  cloneSubtasksTree(s.subtasks, nextId),
        }));
    }

    function countSubtasksTree(subs) {
        let done = 0;
        let total = 0;
        (subs || []).forEach((s) => {
            total++;
            if (s.completed) done++;
            const nested = countSubtasksTree(s.subtasks);
            done += nested.done;
            total += nested.total;
        });
        return { done, total };
    }

    function normalizeAllTasks() {
        (_data.tasks || []).forEach(normalizeImportedTask);
    }

    let _data = getDefaults();
    let _listeners = {};
    let _syncDebounce = null;
    let _taskCounter = 0;

    // ── Event Emitter ────────────────────────────────────
    function on(event, fn) {
        if (!_listeners[event]) _listeners[event] = [];
        _listeners[event].push(fn);
    }

    function off(event, fn) {
        if (!_listeners[event]) return;
        _listeners[event] = _listeners[event].filter(f => f !== fn);
    }

    function emit(event, data) {
        (_listeners[event] || []).forEach(fn => { try { fn(data); } catch(e) { console.error(e); } });
        (_listeners['*'] || []).forEach(fn => { try { fn(event, data); } catch(e) { console.error(e); } });
    }

    // ── Persistence ──────────────────────────────────────
    function save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(_data));
        } catch (e) {
            console.warn('State: localStorage save failed', e);
        }
        scheduleSyncToFirebase();
    }

    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                _data = Object.assign(getDefaults(), parsed);
                if (!_data.labels || !_data.labels.length) _data.labels = defaultLabels;
                if (!_data.sprints) _data.sprints = [];
                if (!_data.activity) _data.activity = [];
                normalizeAllTasks();
            }
        } catch (e) {
            console.warn('State: load failed, using defaults', e);
            _data = getDefaults();
        }

        // Determine task counter from existing task IDs
        _taskCounter = _data.tasks.reduce((max, t) => {
            const num = parseInt(String(t.taskKey || '0').replace('TASK-', ''), 10) || 0;
            return Math.max(max, num);
        }, 0);
    }

    function scheduleSyncToFirebase() {
        if (_syncDebounce) clearTimeout(_syncDebounce);
        _syncDebounce = setTimeout(syncToFirebase, 2000);
    }

    async function syncToFirebase() {
        if (!window.firebaseRESTIntegration) return;
        try {
            await window.firebaseRESTIntegration.saveData('flowboard_projects', _data.projects);
            await window.firebaseRESTIntegration.saveData('flowboard_tasks',    _data.tasks);
            await window.firebaseRESTIntegration.saveData('flowboard_sprints',  _data.sprints);
        } catch (e) {
            console.warn('State: Firebase sync failed', e);
        }
    }

    async function loadFromFirebase() {
        if (!window.firebaseRESTIntegration) return false;
        try {
            const [projects, tasks, sprints] = await Promise.all([
                window.firebaseRESTIntegration.loadData('flowboard_projects'),
                window.firebaseRESTIntegration.loadData('flowboard_tasks'),
                window.firebaseRESTIntegration.loadData('flowboard_sprints'),
            ]);
            if (projects && Array.isArray(projects)) _data.projects = projects;
            if (tasks    && Array.isArray(tasks))    _data.tasks    = tasks;
            if (sprints  && Array.isArray(sprints))  _data.sprints  = sprints;
            normalizeAllTasks();
            save();
            return true;
        } catch (e) {
            console.warn('State: Firebase load failed', e);
            return false;
        }
    }

    // ── Activity log ─────────────────────────────────────
    function addActivity(action, taskTitle, extra) {
        const item = {
            id:        Date.now(),
            action,
            taskTitle: taskTitle || '',
            extra:     extra || '',
            user:      localStorage.getItem('username') || 'admin',
            at:        new Date().toISOString(),
        };
        _data.activity.unshift(item);
        if (_data.activity.length > MAX_ACTIVITY) _data.activity.length = MAX_ACTIVITY;
        save();
        emit('activity:changed');
    }

    // ── Task key generator ────────────────────────────────
    function nextTaskKey() {
        _taskCounter++;
        return `TASK-${_taskCounter}`;
    }

    // ── Project accessors ─────────────────────────────────
    const Projects = {
        getAll() { return _data.projects; },
        get(id)  { return _data.projects.find(p => p.id === id); },

        create(fields) {
            const proj = {
                id:          Date.now(),
                name:        fields.name   || 'Untitled Project',
                description: fields.description || '',
                emoji:       '',
                color:       fields.color  || '#6366f1',
                position:    (_data.projects.length + 1) * 1000,
                columns:     fields.columns || defaultColumns.map(c => ({ ...c })),
                labels:      fields.labels  || [],
                createdAt:   new Date().toISOString(),
            };
            _data.projects.push(proj);
            save();
            addActivity('project_created', proj.name);
            emit('projects:changed', proj);
            return proj;
        },

        update(id, fields) {
            const idx = _data.projects.findIndex(p => p.id === id);
            if (idx === -1) return null;
            Object.assign(_data.projects[idx], fields);
            save();
            emit('projects:changed', _data.projects[idx]);
            return _data.projects[idx];
        },

        delete(id) {
            const proj = this.get(id);
            if (!proj) return;
            _data.projects = _data.projects.filter(p => p.id !== id);
            // Orphan tasks (remove projectId)
            _data.tasks.forEach(t => { if (t.projectId === id) t.projectId = null; });
            save();
            addActivity('project_deleted', proj.name);
            emit('projects:changed');
        },

        /**
         * Reassign `position` on projects to match sidebar order (first id = top).
         * Unknown ids are ignored; any project missing from the list is appended in current order.
         */
        setOrder(orderedIds) {
            if (!Array.isArray(orderedIds) || !orderedIds.length) return;
            const sorted = _data.projects.slice().sort((a, b) => (a.position || 0) - (b.position || 0));
            const allIds = sorted.map(p => p.id);
            const seen = new Set();
            const result = [];
            orderedIds.forEach((id) => {
                if (allIds.includes(id) && !seen.has(id)) {
                    result.push(id);
                    seen.add(id);
                }
            });
            allIds.forEach((id) => {
                if (!seen.has(id)) result.push(id);
            });
            result.forEach((id, i) => {
                const p = _data.projects.find(x => x.id === id);
                if (p) p.position = (i + 1) * 1000;
            });
            save();
            emit('projects:changed');
        },

        /**
         * Clone a project (columns, labels, description, color) and all of its tasks.
         * Column / project-label IDs are remapped; sprint membership is not copied.
         */
        duplicate(sourceId) {
            const src = this.get(sourceId);
            if (!src) return null;

            let nid = Date.now();
            const nextId = () => ++nid;

            const sortedCols = [...(src.columns || [])].sort((a, b) => (a.position || 0) - (b.position || 0));
            const colMap = {};
            const newColumns = sortedCols.map((c, i) => {
                const newColId = `col-${nextId()}`;
                colMap[c.id] = newColId;
                return { ...c, id: newColId, position: i };
            });
            if (!newColumns.length) return null;

            const labelMap = {};
            const newLabels = (src.labels || []).map((l) => {
                const newLid = `lbl-${nextId()}`;
                labelMap[l.id] = newLid;
                return { ...l, id: newLid };
            });

            const prefix = 'Copy of ';
            const maxName = 60;
            const room = Math.max(0, maxName - prefix.length);
            const trimmed = String(src.name || 'Untitled').slice(0, room);
            const newName = (prefix + trimmed).slice(0, maxName);

            const newProj = {
                id:          nextId(),
                name:        newName,
                description: src.description || '',
                emoji:       src.emoji || '',
                color:       src.color || '#6366f1',
                position:    (_data.projects.length + 1) * 1000,
                columns:     newColumns,
                labels:      newLabels,
                createdAt:   new Date().toISOString(),
            };
            _data.projects.push(newProj);

            const firstColId = newColumns[0].id;
            const sourceTasks = _data.tasks.filter(t => t.projectId === sourceId);

            sourceTasks.forEach((t) => {
                const mappedCol = t.columnId && colMap[t.columnId] ? colMap[t.columnId] : firstColId;
                const newLabelIds = (t.labels || []).map((lid) =>
                    (labelMap[lid] !== undefined ? labelMap[lid] : lid)
                );
                const newTask = {
                    id:            nextId(),
                    taskKey:       nextTaskKey(),
                    projectId:     newProj.id,
                    sprintId:      null,
                    columnId:      mappedCol,
                    title:         t.title,
                    description:   t.description || '',
                    priority:      t.priority || 'medium',
                    labels:        newLabelIds,
                    assignee:      t.assignee || (localStorage.getItem('username') || 'admin'),
                    startDate:     t.startDate || null,
                    dueDate:       t.dueDate || null,
                    timeEstimate:  t.timeEstimate != null ? t.timeEstimate : null,
                    position:      t.position != null ? t.position : (_data.tasks.length + 1) * 1000,
                    timeSpent:     t.timeSpent || 0,
                    timeEntries:   (t.timeEntries || []).map((e) => ({ ...e })),
                    subtasks:      cloneSubtasksTree(t.subtasks, nextId),
                    comments:      (t.comments || []).map((c) => ({ ...c, id: nextId() })),
                    isTimerRunning: false,
                    timerStart:    null,
                    createdAt:     new Date().toISOString(),
                };
                _data.tasks.push(newTask);
            });

            save();
            addActivity('project_duplicated', newProj.name, src.name);
            emit('projects:changed', newProj);
            emit('tasks:changed', { type: 'duplicate', projectId: newProj.id });
            return newProj;
        },
    };

    // ── Task accessors ────────────────────────────────────
    const Tasks = {
        getAll()             { return _data.tasks; },
        /** Loose id match so string ids from DOM / Firebase still resolve. */
        get(id)              { return _data.tasks.find(t => t.id == id); },
        byProject(projectId) { return _data.tasks.filter(t => t.projectId === projectId); },
        bySprint(sprintId)   { return _data.tasks.filter(t => t.sprintId  === sprintId); },
        backlog(projectId)   {
            return _data.tasks.filter(t =>
                !t.sprintId && (projectId == null || t.projectId === projectId)
            );
        },

        create(fields) {
            const task = {
                id:            Date.now(),
                taskKey:       nextTaskKey(),
                projectId:     fields.projectId   || null,
                sprintId:      fields.sprintId    || null,
                columnId:      fields.columnId    || null,
                title:         fields.title       || 'Untitled Task',
                description:   fields.description || '',
                priority:      fields.priority    || 'medium',
                labels:        fields.labels      || [],
                assignee:      fields.assignee    || (localStorage.getItem('username') || 'admin'),
                startDate:     fields.startDate   || null,
                dueDate:       fields.dueDate     || null,
                timeEstimate:  fields.timeEstimate|| null,
                position:      fields.position    != null ? fields.position : (_data.tasks.length + 1) * 1000,
                timeSpent:     0,
                timeEntries:   [],
                subtasks:      fields.subtasks    || [],
                comments:      fields.comments    || [],
                isTimerRunning:false,
                timerStart:    null,
                createdAt:     new Date().toISOString(),
            };
            _data.tasks.push(task);
            save();
            addActivity('task_created', task.title);
            emit('tasks:changed', { type: 'create', task });
            return task;
        },

        update(id, fields) {
            const idx = _data.tasks.findIndex(t => t.id == id);
            if (idx === -1) return null;
            const oldTask = { ..._data.tasks[idx] };
            Object.assign(_data.tasks[idx], fields);
            save();
            if (fields.columnId && fields.columnId !== oldTask.columnId) {
                addActivity('task_moved', _data.tasks[idx].title, `→ column`);
            }
            emit('tasks:changed', { type: 'update', task: _data.tasks[idx], oldTask });
            return _data.tasks[idx];
        },

        delete(id) {
            const task = this.get(id);
            if (!task) return;
            // Stop timer if running
            if (task.isTimerRunning) Timer.stop(id);
            _data.tasks = _data.tasks.filter(t => !(t.id == id));
            save();
            addActivity('task_deleted', task.title);
            emit('tasks:changed', { type: 'delete', task });
        },

        addSubtask(taskId, text, parentSubtaskId = null) {
            const task = this.get(taskId);
            if (!task) return;
            const sub = { id: Date.now(), text, completed: false, subtasks: [] };
            if (parentSubtaskId) {
                const parent = findSubtaskEntry(task.subtasks, parentSubtaskId);
                if (!parent) return;
                if (!Array.isArray(parent.sub.subtasks)) parent.sub.subtasks = [];
                parent.sub.subtasks.push(sub);
            } else {
                task.subtasks.push(sub);
            }
            save();
            emit('tasks:changed', { type: 'update', task });
            return sub;
        },

        toggleSubtask(taskId, subtaskId) {
            const task = this.get(taskId);
            if (!task) return;
            const entry = findSubtaskEntry(task.subtasks, subtaskId);
            if (entry) {
                entry.sub.completed = !entry.sub.completed;
                save();
                emit('tasks:changed', { type: 'update', task });
            }
        },

        updateSubtaskText(taskId, subtaskId, text) {
            const task = this.get(taskId);
            if (!task) return;
            const entry = findSubtaskEntry(task.subtasks, subtaskId);
            if (entry && text) {
                entry.sub.text = text;
                save();
                emit('tasks:changed', { type: 'update', task });
            }
        },

        deleteSubtask(taskId, subtaskId) {
            const task = this.get(taskId);
            if (!task) return;
            const entry = findSubtaskEntry(task.subtasks, subtaskId);
            if (!entry) return;
            entry.list.splice(entry.index, 1);
            save();
            emit('tasks:changed', { type: 'update', task });
        },

        reorderSubtask(taskId, dragSubId, targetSubId, insertBefore) {
            const task = this.get(taskId);
            if (!task) return;
            const dragEntry = findSubtaskEntry(task.subtasks, dragSubId);
            const targetEntry = findSubtaskEntry(task.subtasks, targetSubId);
            if (!dragEntry || !targetEntry || dragEntry.list !== targetEntry.list) return;

            const subs = dragEntry.list;
            const fromIdx = dragEntry.index;
            let toIdx = targetEntry.index;
            if (fromIdx === toIdx) return;

            const [moved] = subs.splice(fromIdx, 1);
            if (fromIdx < toIdx) toIdx--;
            if (!insertBefore) toIdx++;
            subs.splice(toIdx, 0, moved);
            save();
            emit('tasks:changed', { type: 'update', task });
        },

        subtaskStats(task) {
            return countSubtasksTree(task?.subtasks || []);
        },

        /**
         * Clone a task in the same project/column/sprint (new id, key, subtasks, comments).
         * Timer and logged time are not copied.
         */
        duplicate(id) {
            const src = this.get(id);
            if (!src) return null;

            let nid = Date.now();
            const nextId = () => ++nid;

            const prefix = 'Copy of ';
            const maxTitle = 120;
            const room = Math.max(0, maxTitle - prefix.length);
            const trimmed = String(src.title || 'Untitled').slice(0, room);
            const newTitle = (prefix + trimmed).slice(0, maxTitle);

            const newTask = {
                id:            nextId(),
                taskKey:       nextTaskKey(),
                projectId:     src.projectId ?? null,
                sprintId:      src.sprintId ?? null,
                columnId:      src.columnId ?? null,
                title:         newTitle,
                description:   src.description || '',
                priority:      src.priority || 'medium',
                labels:        [...(src.labels || [])],
                assignee:      src.assignee || (localStorage.getItem('username') || 'admin'),
                startDate:     src.startDate || null,
                dueDate:       src.dueDate || null,
                timeEstimate:  src.timeEstimate != null ? src.timeEstimate : null,
                position:      (src.position != null ? src.position : 0) + 0.5,
                timeSpent:     0,
                timeEntries:   [],
                subtasks:      cloneSubtasksTree(src.subtasks, nextId),
                comments:      (src.comments || []).map((c) => ({ ...c, id: nextId() })),
                isTimerRunning: false,
                timerStart:    null,
                createdAt:     new Date().toISOString(),
            };
            _data.tasks.push(newTask);
            save();
            addActivity('task_duplicated', newTask.title, src.title);
            emit('tasks:changed', { type: 'duplicate', task: newTask, sourceTask: src });
            return newTask;
        },

        addComment(taskId, text) {
            const task = this.get(taskId);
            if (!task) return;
            const comment = {
                id:        Date.now(),
                text,
                author:    localStorage.getItem('username') || 'admin',
                createdAt: new Date().toISOString(),
            };
            task.comments.push(comment);
            save();
            addActivity('comment_added', task.title);
            emit('tasks:changed', { type: 'update', task });
            return comment;
        },
    };

    // ── Sprint accessors ──────────────────────────────────
    const Sprints = {
        getAll()           { return _data.sprints; },
        get(id)            { return _data.sprints.find(s => s.id === id); },
        active()           { return _data.sprints.find(s => s.status === 'active'); },
        byProject(pid)     { return _data.sprints.filter(s => !pid || s.projectId === pid || s.projectId == null); },

        create(fields) {
            const sprint = {
                id:        Date.now(),
                projectId: fields.projectId || null,
                name:      fields.name      || 'Sprint',
                goal:      fields.goal      || '',
                startDate: fields.startDate || null,
                endDate:   fields.endDate   || null,
                status:    'planned',
                createdAt: new Date().toISOString(),
            };
            _data.sprints.push(sprint);
            save();
            addActivity('sprint_created', sprint.name);
            emit('sprints:changed', sprint);
            return sprint;
        },

        update(id, fields) {
            const idx = _data.sprints.findIndex(s => s.id === id);
            if (idx === -1) return null;
            Object.assign(_data.sprints[idx], fields);
            save();
            emit('sprints:changed', _data.sprints[idx]);
            return _data.sprints[idx];
        },

        start(id) {
            // Only one active sprint at a time
            _data.sprints.forEach(s => {
                if (s.status === 'active') s.status = 'planned';
            });
            return this.update(id, { status: 'active', startDate: _data.sprints.find(s=>s.id===id)?.startDate || new Date().toISOString().split('T')[0] });
        },

        complete(id) {
            const sprint = this.get(id);
            if (!sprint) return;
            // Move incomplete tasks to backlog
            _data.tasks.forEach(t => {
                if (t.sprintId === id) {
                    const col = getColumnById(t.projectId, t.columnId);
                    const isDone = col && col.name.toLowerCase().includes('done');
                    if (!isDone) t.sprintId = null;
                }
            });
            addActivity('sprint_completed', sprint.name);
            return this.update(id, { status: 'completed' });
        },

        delete(id) {
            const sprint = this.get(id);
            if (!sprint) return;
            _data.tasks.forEach(t => { if (t.sprintId === id) t.sprintId = null; });
            _data.sprints = _data.sprints.filter(s => s.id !== id);
            save();
            emit('sprints:changed');
        },
    };

    // ── Timer ─────────────────────────────────────────────
    const Timer = {
        _interval: null,
        _activetaskId: null,

        start(taskId) {
            // Stop any running timer first
            const running = _data.tasks.find(t => t.isTimerRunning);
            if (running) this.stop(running.id);

            Tasks.update(taskId, { isTimerRunning: true, timerStart: Date.now() });
            this._activetaskId = taskId;
            this._tick();
            emit('timer:started', taskId);
        },

        stop(taskId) {
            const task = Tasks.get(taskId);
            if (!task || !task.isTimerRunning) return;
            if (!Array.isArray(task.timeEntries)) task.timeEntries = [];
            const start = task.timerStart != null ? Number(task.timerStart) : null;
            const elapsedMs = start != null && Number.isFinite(start)
                ? Math.max(0, Date.now() - start)
                : 0;
            const seconds = Math.max(0, Math.round(elapsedMs / 1000));
            task.timeEntries.push({
                date:     new Date().toISOString(),
                duration: seconds,
            });
            task.timeSpent = (task.timeSpent || 0) + seconds / 3600;
            task.isTimerRunning = false;
            task.timerStart = null;
            save();
            if (this._interval) { clearInterval(this._interval); this._interval = null; }
            this._activetaskId = null;
            emit('timer:stopped', taskId);
            emit('tasks:changed', { type: 'update', task });
        },

        toggle(taskId) {
            const task = Tasks.get(taskId);
            if (!task) return;
            task.isTimerRunning ? this.stop(taskId) : this.start(taskId);
        },

        _tick() {
            if (this._interval) clearInterval(this._interval);
            this._interval = setInterval(() => {
                const task = Tasks.get(this._activetaskId);
                if (!task || !task.isTimerRunning) {
                    clearInterval(this._interval);
                    return;
                }
                emit('timer:tick', { taskId: this._activetaskId, elapsed: Date.now() - task.timerStart });
            }, 1000);
        },

        getElapsed(taskId) {
            const task = Tasks.get(taskId);
            if (!task || !task.isTimerRunning) return 0;
            return Date.now() - task.timerStart;
        },

        getRunning() {
            return _data.tasks.find(t => t.isTimerRunning) || null;
        },
    };

    // ── Labels ────────────────────────────────────────────
    const Labels = {
        getAll() { return _data.labels; },
        get(id)  { return _data.labels.find(l => l.id === id); },
    };

    // ── Activity ──────────────────────────────────────────
    const Activity = {
        getAll()  { return _data.activity; },
        add: addActivity,
    };

    // ── Helpers ───────────────────────────────────────────
    function getColumnById(projectId, columnId) {
        const proj = Projects.get(projectId);
        if (!proj) return null;
        return proj.columns.find(c => c.id === columnId) || null;
    }

    function getFirstColumn(projectId) {
        const proj = Projects.get(projectId);
        if (!proj || !proj.columns.length) return null;
        return [...proj.columns].sort((a, b) => a.position - b.position)[0];
    }

    // ── Data export / clear ───────────────────────────────
    function exportData() {
        const blob = new Blob([JSON.stringify(_data, null, 2)], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `flowboard-export-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    function clearAll() {
        _data = getDefaults();
        _taskCounter = 0;
        save();
        emit('state:reset');
    }

    // ── Init ──────────────────────────────────────────────
    function init() {
        load();
        // Resume timer if app was closed while timer was running
        const running = _data.tasks.find(t => t.isTimerRunning);
        if (running) {
            Timer._activetaskId = running.id;
            Timer._tick();
        }
    }

    return {
        on, off, emit,
        Projects, Tasks, Sprints, Labels, Activity, Timer,
        getColumnById, getFirstColumn,
        load, save, init, exportData, clearAll, loadFromFirebase,
        get data() { return _data; },
    };
})();

window.State = State;
