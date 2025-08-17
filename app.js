// Data structure
let projects = [];
let tasks = [];
let activeTimer = null;

// Load data from localStorage
function loadData() {
    const savedProjects = localStorage.getItem('projects');
    const savedTasks = localStorage.getItem('tasks');
    
    projects = savedProjects ? JSON.parse(savedProjects) : [];
    tasks = savedTasks ? JSON.parse(savedTasks) : [];
    
    renderProjects();
    renderTasks();
}

// Save data to localStorage
function saveData() {
    localStorage.setItem('projects', JSON.stringify(projects));
    localStorage.setItem('tasks', JSON.stringify(tasks));
}

// Project Management
function addProject(name) {
    const project = {
        id: Date.now(),
        name: name
    };
    projects.push(project);
    saveData();
    renderProjects();
}

function renderProjects() {
    const projectsList = document.getElementById('projectsList');
    projectsList.innerHTML = '';
    
    // Add "All Tasks" option
    const allTasksLi = document.createElement('li');
    allTasksLi.textContent = 'All Tasks';
    allTasksLi.onclick = () => selectProject(null);
    allTasksLi.className = !currentProject ? 'active' : '';
    projectsList.appendChild(allTasksLi);
    
    projects.forEach(project => {
        const li = document.createElement('li');
        li.textContent = project.name;
        li.onclick = () => selectProject(project.id);
        li.className = currentProject && currentProject.id === project.id ? 'active' : '';
        projectsList.appendChild(li);
    });
}

let currentProject = null;

function selectProject(projectId) {
    currentProject = projectId ? projects.find(p => p.id === projectId) : null;
    document.getElementById('currentProjectName').textContent = currentProject ? currentProject.name : 'All Tasks';
    renderProjects();
    renderTasks();
    // Refresh timesheet if it's visible
    if (document.getElementById('timesheetView').style.display === 'block') {
        renderTimesheet();
    }
}

// Task Management
function addTask(title, status) {
    const task = {
        id: Date.now(),
        projectId: currentProject ? currentProject.id : null,
        title,
        status,
        timeSpent: 0,
        createdAt: new Date().toISOString(),
        timeEntries: [],
        isTimerRunning: false,
        timerStart: null
    };
    tasks.push(task);
    saveData();
    renderTasks();
}

function updateTask(taskId, updates) {
    const taskIndex = tasks.findIndex(t => t.id === taskId);
    if (taskIndex !== -1) {
        tasks[taskIndex] = { ...tasks[taskIndex], ...updates };
        saveData();
        renderTasks();
    }
}

// Handle menu visibility
function deleteTask(taskId) {
    // Show confirmation dialog
    if (confirm('Are you sure you want to delete this task? This action cannot be undone.')) {
        // If timer is running for this task, stop it
        if (activeTimer === taskId) {
            stopTimer(taskId);
        }
        
        // Remove task from array
        tasks = tasks.filter(t => t.id !== taskId);
        saveData();
        renderTasks();
        
        // Close any open menus
        document.querySelectorAll('.menu-dropdown.show').forEach(menu => {
            menu.classList.remove('show');
        });
    }
}

function renderTasks() {
    const containers = {
        'To Do': document.getElementById('todoTasks'),
        'In Progress': document.getElementById('inProgressTasks'),
        'To be Tested': document.getElementById('toBeTestedTasks'),
        'Done': document.getElementById('doneTasks')
    };
    
    // Clear all containers
    Object.values(containers).forEach(container => container.innerHTML = '');
    
    // Filter tasks based on current project
    const filteredTasks = currentProject
        ? tasks.filter(task => task.projectId === currentProject.id)
        : tasks;
    
    // Render tasks in their respective columns
    filteredTasks.forEach(task => {
        const container = containers[task.status];
        if (container) {
            const taskCard = createTaskCard(task);
            container.appendChild(taskCard);
        }
    });
}

function createTaskCard(task) {
    const card = document.createElement('div');
    card.className = 'task-card';
    
    const timeDisplay = formatTime(task.timeSpent * 3600); // Convert hours to seconds
    const projectName = task.projectId ? projects.find(p => p.id === task.projectId)?.name : 'No Project';
    
    card.innerHTML = `
        ${!currentProject ? `
        <div class="task-header">
            <div class="project-tag">${projectName}</div>
        </div>
        ` : ''}
        <div class="task-content">
            <h4>${task.title}</h4>
            <div class="timer-section">
                <div class="timer-display ${task.isTimerRunning ? 'running' : ''}" id="timer-${task.id}">
                    <i class="${task.isTimerRunning ? 'fas fa-circle-notch fa-spin' : 'far fa-clock'}"></i>
                    <span>${timeDisplay}</span>
                </div>
                ${task.isTimerRunning ? 
                    `<button class="btn-stop-timer" data-task-id="${task.id}">
                        <i class="fas fa-stop"></i>
                    </button>` :
                    `<button class="btn-start-timer" data-task-id="${task.id}">
                        <i class="fas fa-play"></i>
                    </button>`
                }
            </div>
        </div>
    `;
    
    // Add click event for edit modal
    card.querySelector('h4').onclick = () => openEditTaskModal(task);
    
    // Add timer button events
    const timerBtn = card.querySelector('.btn-start-timer, .btn-stop-timer');
    timerBtn.onclick = (e) => {
        e.stopPropagation();
        const taskId = parseInt(e.target.closest('button').dataset.taskId);
        if (task.isTimerRunning) {
            stopTimer(taskId);
        } else {
            startTimer(taskId);
        }
    };
    
    return card;
}

// Modal Management
function openAddTaskModal() {
    const modal = document.getElementById('taskModal');
    const form = document.getElementById('taskForm');
    const deleteBtn = document.getElementById('deleteTaskBtn');
    document.getElementById('modalTitle').textContent = 'Add Task';
    form.reset();
    modal.style.display = 'block';
    
    // Hide delete button for new tasks
    deleteBtn.style.display = 'none';
    
    form.onsubmit = (e) => {
        e.preventDefault();
        const title = document.getElementById('taskTitle').value;
        const status = document.getElementById('taskStatus').value;
        
        addTask(title, status);
        modal.style.display = 'none';
    };
}

function openEditTaskModal(task) {
    const modal = document.getElementById('taskModal');
    const form = document.getElementById('taskForm');
    const deleteBtn = document.getElementById('deleteTaskBtn');
    document.getElementById('modalTitle').textContent = 'Edit Task';
    
    document.getElementById('taskTitle').value = task.title;
    document.getElementById('taskStatus').value = task.status;
    
    // Show and setup delete button
    deleteBtn.style.display = 'flex';
    deleteBtn.onclick = () => {
        if (confirm('Are you sure you want to delete this task? This action cannot be undone.')) {
            deleteTask(task.id);
            modal.style.display = 'none';
        }
    };
    
    modal.style.display = 'block';
    
    form.onsubmit = (e) => {
        e.preventDefault();
        const updates = {
            title: document.getElementById('taskTitle').value,
            status: document.getElementById('taskStatus').value
        };
        
        updateTask(task.id, updates);
        modal.style.display = 'none';
    };
}

function openAddProjectModal() {
    const modal = document.getElementById('projectModal');
    const form = document.getElementById('projectForm');
    form.reset();
    modal.style.display = 'block';
    
    form.onsubmit = (e) => {
        e.preventDefault();
        const name = document.getElementById('projectName').value;
        addProject(name);
        modal.style.display = 'none';
    };
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    
    document.getElementById('addTaskBtn').onclick = openAddTaskModal;
    document.getElementById('addProjectBtn').onclick = openAddProjectModal;
    
    document.getElementById('cancelTaskBtn').onclick = () => {
        document.getElementById('taskModal').style.display = 'none';
    };
    
    document.getElementById('cancelProjectBtn').onclick = () => {
        document.getElementById('projectModal').style.display = 'none';
    };
    
    // Close modals when clicking outside
    window.onclick = (event) => {
        const modals = document.getElementsByClassName('modal');
        for (const modal of modals) {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        }
    };

    // View switching
    document.getElementById('boardViewBtn').onclick = () => {
        document.getElementById('boardView').style.display = 'grid';
        document.getElementById('timesheetView').style.display = 'none';
        document.getElementById('boardViewBtn').classList.add('active');
        document.getElementById('timesheetViewBtn').classList.remove('active');
    };

    document.getElementById('timesheetViewBtn').onclick = () => {
        document.getElementById('boardView').style.display = 'none';
        document.getElementById('timesheetView').style.display = 'block';
        document.getElementById('boardViewBtn').classList.remove('active');
        document.getElementById('timesheetViewBtn').classList.add('active');
        renderTimesheet();
    };

    // Set default dates for timesheet
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    
    document.getElementById('startDate').valueAsDate = thirtyDaysAgo;
    document.getElementById('endDate').valueAsDate = today;

    // Add event listeners for date filters
    document.getElementById('startDate').addEventListener('change', renderTimesheet);
    document.getElementById('endDate').addEventListener('change', renderTimesheet);
});

// Timer Functions
function startTimer(taskId) {
    // Stop any running timer first
    if (activeTimer) {
        stopTimer(activeTimer);
    }

    const task = tasks.find(t => t.id === taskId);
    if (task) {
        task.isTimerRunning = true;
        task.timerStart = new Date().getTime();
        activeTimer = taskId;
        updateTimerDisplay(taskId);
        saveData();
        renderTasks();
    }
}

function stopTimer(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (task && task.isTimerRunning) {
        const endTime = new Date().getTime();
        const duration = (endTime - task.timerStart) / 1000; // Convert to seconds
        
        // Add time entry
        task.timeEntries.push({
            date: new Date().toISOString(),
            duration: duration
        });

        // Update total time spent
        task.timeSpent += duration / 3600; // Convert seconds to hours
        
        // Reset timer
        task.isTimerRunning = false;
        task.timerStart = null;
        activeTimer = null;
        
        saveData();
        renderTasks();
    }
}

function updateTimerDisplay(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (task && task.isTimerRunning) {
        const timerDisplay = document.getElementById(`timer-${taskId}`);
        if (timerDisplay) {
            const currentTime = new Date().getTime();
            const elapsedSeconds = Math.floor((currentTime - task.timerStart) / 1000);
            timerDisplay.textContent = formatTime(elapsedSeconds);
            
            requestAnimationFrame(() => updateTimerDisplay(taskId));
        }
    }
}

function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    
    return `${padNumber(hours)}:${padNumber(minutes)}:${padNumber(remainingSeconds)}`;
}

function padNumber(num) {
    return num.toString().padStart(2, '0');
}

// Timesheet Functions
function renderTimesheet() {
    const startDate = document.getElementById('startDate').valueAsDate;
    const endDate = document.getElementById('endDate').valueAsDate;
    endDate.setHours(23, 59, 59, 999); // Include the entire end date

    const timesheetBody = document.getElementById('timesheetBody');
    timesheetBody.innerHTML = '';

    // Create entries array to hold both time entries and tasks
    const entries = [];

    // Filter tasks based on current project
    const filteredTasks = currentProject 
        ? tasks.filter(task => task.projectId === currentProject.id)
        : tasks;

    // Add all tasks, even if they don't have time entries
    filteredTasks.forEach(task => {
        const projectName = task.projectId 
            ? projects.find(p => p.id === task.projectId)?.name 
            : 'No Project';

        // Add base task entry
        entries.push({
            date: new Date(task.createdAt),
            project: projectName,
            task: task.title,
            status: task.status,
            duration: task.timeSpent * 3600, // Convert hours to seconds
            taskId: task.id,
            isRunning: task.isTimerRunning
        });

        // Add individual time entries if they exist
        if (task.timeEntries && task.timeEntries.length > 0) {
            task.timeEntries.forEach(entry => {
                const entryDate = new Date(entry.date);
                if (entryDate >= startDate && entryDate <= endDate) {
                    entries.push({
                        date: entryDate,
                        project: projectName,
                        task: task.title,
                        status: task.status,
                        duration: entry.duration,
                        taskId: task.id,
                        isRunning: task.isTimerRunning
                    });
                }
            });
        }
    });

    // Sort entries by date (newest first)
    entries.sort((a, b) => b.date - a.date);

    // Render entries
    entries.forEach(entry => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${entry.date.toLocaleDateString()}</td>
            <td>${entry.project}</td>
            <td>${entry.task}</td>
            <td>${entry.status}</td>
            <td>${formatTime(entry.duration)}</td>
        `;
        timesheetBody.appendChild(row);
    });
}
