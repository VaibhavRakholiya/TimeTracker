// Data structure
let projects = [];
let tasks = [];
let activeTimer = null;
let currentUser = 'default'; // Default user identifier

// Load data from central database (data.json) and localStorage
async function loadData() {
    try {
        // Always try to load from central database first
        let response = await fetch('data.json');
        let databaseData = null;
        
        if (response.ok) {
            databaseData = await response.json();
            console.log('Loaded data from central database');
            
            // Check if this is still a template
            if (databaseData.isTemplate) {
                console.log('Database is still template, initializing with empty data');
                projects = [];
                tasks = [];
            } else {
                // Load all data from database
                projects = databaseData.projects || [];
                tasks = databaseData.tasks || [];
            }
        } else {
            console.log('No database file found, starting with empty data');
            projects = [];
            tasks = [];
        }
        
        // Check if we have localStorage data that's newer
        const localData = localStorage.getItem('timetracker_local_data');
        if (localData) {
            const localParsed = JSON.parse(localData);
            const localTimestamp = new Date(localParsed.lastUpdated || 0);
            const dbTimestamp = new Date(databaseData?.lastUpdated || 0);
            
            if (localTimestamp > dbTimestamp) {
                console.log('Local data is newer, merging with database data');
                // Merge local data with database data
                const mergedData = mergeData(databaseData, localParsed);
                projects = mergedData.projects;
                tasks = mergedData.tasks;
                
                // Save merged data back to localStorage
                await saveDataToLocal(mergedData);
            }
        }
        
        renderProjects();
        renderTasks();
    } catch (error) {
        console.log('Error loading data, starting with empty data:', error);
        projects = [];
        tasks = [];
        renderProjects();
        renderTasks();
    }
}

// Save data to localStorage (for internal use)
async function saveDataToLocal(data) {
    try {
        // Store data in localStorage for persistence
        localStorage.setItem('timetracker_local_data', JSON.stringify(data));
        console.log('Local data updated successfully');
        return true;
    } catch (error) {
        console.error('Error saving local data:', error);
        return false;
    }
}

// Get current data for database update
function getCurrentDataForRepo() {
    const currentData = {
        projects: projects,
        tasks: tasks,
        lastUpdated: new Date().toISOString(),
        version: "1.0",
        isTemplate: false
    };
    return JSON.stringify(currentData, null, 2);
}

// Merge local data with database data
function mergeData(databaseData, localData) {
    const merged = {
        projects: [...(databaseData?.projects || [])],
        tasks: [...(databaseData?.tasks || [])],
        lastUpdated: new Date().toISOString(),
        version: "1.0",
        isTemplate: false
    };
    
    // Merge projects (local takes precedence for conflicts)
    localData.projects?.forEach(localProject => {
        const existingIndex = merged.projects.findIndex(p => p.id === localProject.id);
        if (existingIndex !== -1) {
            merged.projects[existingIndex] = localProject;
        } else {
            merged.projects.push(localProject);
        }
    });
    
    // Merge tasks (local takes precedence for conflicts)
    localData.tasks?.forEach(localTask => {
        const existingIndex = merged.tasks.findIndex(t => t.id === localTask.id);
        if (existingIndex !== -1) {
            merged.tasks[existingIndex] = localTask;
        } else {
            merged.tasks.push(localTask);
        }
    });
    
    return merged;
}

// Save data to localStorage and prepare for database sync
async function saveData() {
    try {
        const data = {
            projects: projects,
            tasks: tasks,
            lastUpdated: new Date().toISOString(),
            version: '1.0',
            isTemplate: false
        };
        
        // Save to localStorage
        await saveDataToLocal(data);
        
        console.log('Data saved to localStorage successfully');
        
        // Show notification that data needs to be synced to database
        showSyncNotification();
    } catch (error) {
        console.error('Error saving data:', error);
        alert('Error saving data. Please try again.');
    }
}

// Project Management
function addProject(name) {
    const project = {
        id: Date.now(),
        name: name,
        userId: currentUser,
        createdAt: new Date().toISOString()
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
    
    // Add the "New Project" item at the end
    const addProjectLi = document.createElement('li');
    addProjectLi.id = 'addProjectBtn';
    addProjectLi.className = 'add-project-item';
    addProjectLi.onclick = openAddProjectModal;
    addProjectLi.innerHTML = `
        <i class="fas fa-plus"></i>
        <span>New Project</span>
    `;
    projectsList.appendChild(addProjectLi);
    

}

let currentProject = null;

function selectProject(projectId) {
    currentProject = projectId ? projects.find(p => p.id === projectId) : null;
    document.getElementById('currentProjectName').textContent = currentProject ? currentProject.name : 'All Tasks';
    renderProjects();
    renderTasks();
    
    // Restart timer display update if there's an active timer
    if (activeTimer) {
        updateTimerDisplay(activeTimer);
    }
    
    // Refresh timesheet if it's visible
    if (document.getElementById('timesheetView').style.display === 'block') {
        renderTimesheet();
    }
}

// Task Management
function addTask(title, status, dueDate) {
    // Get the highest position number for the given status
    const maxPosition = Math.max(0, ...tasks
        .filter(t => t.status === status)
        .map(t => t.position || 0));
    
    const task = {
        id: Date.now(),
        projectId: currentProject ? currentProject.id : null,
        title,
        status,
        dueDate: dueDate || null,
        userId: currentUser,
        position: maxPosition + 1000, // Use increments of 1000 to allow space for reordering
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
    
    // Clear all containers and set up drag and drop
    Object.entries(containers).forEach(([status, container]) => {
        container.innerHTML = '';
        
        // Add drop zone event listeners
        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            container.classList.add('drag-over');
            
            // Find the closest task card
            const taskCard = e.target.closest('.task-card');
            if (taskCard) {
                const rect = taskCard.getBoundingClientRect();
                const midpoint = rect.top + rect.height / 2;
                
                // Remove existing placeholder
                const existingPlaceholder = container.querySelector('.task-placeholder');
                if (existingPlaceholder) {
                    existingPlaceholder.remove();
                }
                
                // Create and insert placeholder
                const placeholder = document.createElement('div');
                placeholder.className = 'task-placeholder';
                
                if (e.clientY < midpoint) {
                    taskCard.parentNode.insertBefore(placeholder, taskCard);
                } else {
                    taskCard.parentNode.insertBefore(placeholder, taskCard.nextSibling);
                }
            }
        });

        container.addEventListener('dragleave', (e) => {
            // Only remove drag-over if we're leaving the container, not entering a child
            if (!e.relatedTarget || !container.contains(e.relatedTarget)) {
                container.classList.remove('drag-over');
                // Remove placeholder when leaving container
                const placeholder = container.querySelector('.task-placeholder');
                if (placeholder) {
                    placeholder.remove();
                }
            }
        });

        container.addEventListener('drop', (e) => {
            e.preventDefault();
            container.classList.remove('drag-over');
            
            const taskId = parseInt(e.dataTransfer.getData('text/plain'));
            if (taskId) {
                const task = tasks.find(t => t.id === taskId);
                const oldStatus = task.status;
                const statusOrder = ['To Do', 'In Progress', 'To be Tested', 'Done'];
                
                // Get the task cards in the container
                const taskCards = Array.from(container.querySelectorAll('.task-card'));
                const placeholder = container.querySelector('.task-placeholder');
                
                // Calculate new position
                let newPosition;
                if (placeholder) {
                    const placeholderIndex = Array.from(container.children).indexOf(placeholder);
                    const prevTask = taskCards[placeholderIndex - 1];
                    const nextTask = taskCards[placeholderIndex];
                    
                    if (!prevTask) {
                        // If at start, use position before first task
                        newPosition = (nextTask ? tasks.find(t => t.id === parseInt(nextTask.dataset.taskId)).position : 1000) / 2;
                    } else if (!nextTask) {
                        // If at end, use position after last task
                        newPosition = tasks.find(t => t.id === parseInt(prevTask.dataset.taskId)).position + 1000;
                    } else {
                        // If between tasks, use middle position
                        const prevPosition = tasks.find(t => t.id === parseInt(prevTask.dataset.taskId)).position;
                        const nextPosition = tasks.find(t => t.id === parseInt(nextTask.dataset.taskId)).position;
                        newPosition = (prevPosition + nextPosition) / 2;
                    }
                    
                    placeholder.remove();
                } else {
                    // If no placeholder, add to end
                    const lastTask = taskCards[taskCards.length - 1];
                    newPosition = lastTask ? 
                        tasks.find(t => t.id === parseInt(lastTask.dataset.taskId)).position + 1000 : 
                        1000;
                }
                
                // Update task
                updateTask(taskId, { 
                    status, 
                    position: newPosition 
                });
                
                // Show confetti for next column moves
                const oldIndex = statusOrder.indexOf(oldStatus);
                const newIndex = statusOrder.indexOf(status);
                
                if (newIndex === oldIndex + 1) {
                    const rect = container.getBoundingClientRect();
                    const x = (rect.left + rect.right) / 2;
                    const y = (rect.top + rect.bottom) / 2;
                    
                    confetti({
                        particleCount: 100,
                        spread: 70,
                        origin: { 
                            x: x / window.innerWidth, 
                            y: y / window.innerHeight 
                        },
                        colors: ['#4361ee', '#7209b7', '#f72585', '#2ec4b6'],
                        ticks: 200,
                        gravity: 1.2,
                        scalar: 1.2,
                        shapes: ['circle', 'square'],
                        zIndex: 9999
                    });
                }
            }
        });
    });
    
    // Filter tasks based on current project and sort by position
    const filteredTasks = currentProject
        ? tasks.filter(task => task.projectId === currentProject.id)
        : tasks;
    
    // Group tasks by status and sort by position
    const groupedTasks = {};
    Object.keys(containers).forEach(status => {
        groupedTasks[status] = filteredTasks
            .filter(task => task.status === status)
            .sort((a, b) => (a.position || 0) - (b.position || 0));
    });
    
    // Render tasks in their respective columns
    Object.entries(groupedTasks).forEach(([status, statusTasks]) => {
        const container = containers[status];
        statusTasks.forEach(task => {
            const taskCard = createTaskCard(task);
            container.appendChild(taskCard);
        });
    });
}

function createTaskCard(task) {
    const card = document.createElement('div');
    card.className = 'task-card';
    card.draggable = true;
    card.dataset.taskId = task.id;

    // Add drag event listeners
    card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', task.id);
        card.style.opacity = '0.5';
    });

    card.addEventListener('dragend', () => {
        card.style.opacity = '1';
    });
    
    // Calculate the correct time display
    let timeDisplay;
    if (task.isTimerRunning) {
        // If timer is running, calculate current elapsed time
        const currentTime = new Date().getTime();
        const elapsedSeconds = Math.floor((currentTime - task.timerStart) / 1000);
        timeDisplay = formatTime(elapsedSeconds);
    } else {
        // If timer is not running, show total time spent
        timeDisplay = formatTime(task.timeSpent * 3600); // Convert hours to seconds
    }
    
    const projectName = task.projectId ? projects.find(p => p.id === task.projectId)?.name : 'No Project';
    
    card.innerHTML = `
        ${!currentProject ? `
        <div class="task-header">
            <div class="project-tag">${projectName}</div>
        </div>
        ` : ''}
        <div class="task-content">
            <h4>${task.title}</h4>
            ${task.dueDate ? `
            <div class="due-date-section">
                <i class="fas fa-calendar-alt"></i>
                <span class="due-date ${isOverdue(task.dueDate) ? 'overdue' : ''}">${formatDueDate(task.dueDate)}</span>
            </div>
            ` : ''}
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
        const dueDate = document.getElementById('taskDueDate').value;
        
        addTask(title, status, dueDate);
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
    document.getElementById('taskDueDate').value = task.dueDate || '';
    
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
            status: document.getElementById('taskStatus').value,
            dueDate: document.getElementById('taskDueDate').value || null
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

    // Set default date for timesheet
    const today = new Date();
    document.getElementById('timesheetDate').valueAsDate = today;

    // Add event listener for date filter
    document.getElementById('timesheetDate').addEventListener('change', renderTimesheet);
    
    // Add event listeners for user management
    document.getElementById('loadUserBtn').addEventListener('click', loadUserData);
    document.getElementById('saveDataBtn').addEventListener('click', showDataForCopy);
    document.getElementById('userInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            loadUserData();
        }
    });
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
        } else {
            // If timer display element is not found, try to find it after a short delay
            // This handles cases where the DOM was re-rendered (e.g., project switch)
            setTimeout(() => updateTimerDisplay(taskId), 100);
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
    const selectedDate = document.getElementById('timesheetDate').valueAsDate;
    const startDate = new Date(selectedDate);
    const endDate = new Date(selectedDate);
    startDate.setHours(0, 0, 0, 0); // Start of the day
    endDate.setHours(23, 59, 59, 999); // End of the day

    const timesheetBody = document.getElementById('timesheetBody');
    timesheetBody.innerHTML = '';

    // Filter tasks based on current project
    const filteredTasks = currentProject 
        ? tasks.filter(task => task.projectId === currentProject.id)
        : tasks;

    // Create task summary entries (one per task)
    const taskSummaries = [];

    filteredTasks.forEach(task => {
        const projectName = task.projectId 
            ? projects.find(p => p.id === task.projectId)?.name 
            : 'No Project';

        // Check if task has time entries for the selected date
        let taskTimeForDate = 0;
        if (task.timeEntries && task.timeEntries.length > 0) {
            task.timeEntries.forEach(entry => {
                const entryDate = new Date(entry.date);
                if (entryDate >= startDate && entryDate <= endDate) {
                    taskTimeForDate += entry.duration;
                }
            });
        }

        // Only include tasks that have time spent on the selected date
        if (taskTimeForDate > 0) {
            taskSummaries.push({
                date: selectedDate,
                project: projectName,
                task: task.title,
                status: task.status,
                duration: taskTimeForDate,
                taskId: task.id,
                isRunning: task.isTimerRunning
            });
        }
    });

    // Sort tasks by date (newest first)
    taskSummaries.sort((a, b) => b.date - a.date);

    // Render task summaries
    taskSummaries.forEach(task => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${task.date.toLocaleDateString()}</td>
            <td>${task.project}</td>
            <td>${task.task}</td>
            <td>${task.status}</td>
            <td>${formatTime(task.duration)}</td>
        `;
        timesheetBody.appendChild(row);
    });

    // Add total row if there are tasks
    if (taskSummaries.length > 0) {
        const totalDuration = taskSummaries.reduce((total, task) => total + task.duration, 0);
        const totalRow = document.createElement('tr');
        totalRow.className = 'total-row';
        totalRow.innerHTML = `
            <td><strong>Total</strong></td>
            <td></td>
            <td></td>
            <td></td>
            <td><strong>${formatTime(totalDuration)}</strong></td>
        `;
        timesheetBody.appendChild(totalRow);
    }

    // Add review input field
    const reviewRow = document.createElement('tr');
    reviewRow.className = 'review-row';
    
    // Load existing review for the selected date
    const existingReview = loadExistingReview(selectedDate);
    const reviewText = existingReview ? existingReview.text : '';
    const buttonText = existingReview ? 'Update Review' : 'Save Review';
    
    reviewRow.innerHTML = `
        <td colspan="5">
            <div class="review-section">
                <label for="timesheetReview">Review:</label>
                <textarea id="timesheetReview" placeholder="Add your review, notes, or observations about today's work...">${reviewText}</textarea>
                <button id="saveReviewBtn" class="btn-save-review">${buttonText}</button>
            </div>
        </td>
    `;
    timesheetBody.appendChild(reviewRow);
    
    // Add event listener for save review button
    const saveReviewBtn = reviewRow.querySelector('#saveReviewBtn');
    saveReviewBtn.addEventListener('click', saveTimesheetReview);
}

// Load existing review function
function loadExistingReview(selectedDate) {
    const currentProjectId = currentProject ? currentProject.id : null;
    
    // Find task with reviews for the current project and user
    const taskWithReviews = tasks.find(t => 
        t.projectId === currentProjectId && 
        t.userId === currentUser &&
        t.reviews && t.reviews.length > 0
    );
    
    if (taskWithReviews) {
        return taskWithReviews.reviews.find(review => {
            const reviewDate = new Date(review.date);
            const selectedDateOnly = new Date(selectedDate);
            reviewDate.setHours(0, 0, 0, 0);
            selectedDateOnly.setHours(0, 0, 0, 0);
            return reviewDate.getTime() === selectedDateOnly.getTime();
        });
    }
    
    return null;
}

// Load user data function
async function loadUserData() {
    const userInput = document.getElementById('userInput').value.trim();
    if (!userInput) {
        alert('Please enter a username');
        return;
    }
    
    currentUser = userInput;
    
    try {
        // Load all data from database and localStorage
        await loadData();
        
        // Filter data for the current user
        projects = projects.filter(p => p.userId === currentUser);
        tasks = tasks.filter(t => t.userId === currentUser);
        
        // Reset current project when switching users
        currentProject = null;
        
        renderProjects();
        renderTasks();
        
        // Update timesheet if visible
        if (document.getElementById('timesheetView').style.display === 'block') {
            renderTimesheet();
        }
        
        console.log(`Loaded data for user: ${currentUser}`);
    } catch (error) {
        console.log(`Error loading data for user: ${currentUser}`, error);
        projects = [];
        tasks = [];
        currentProject = null;
        renderProjects();
        renderTasks();
    }
}

// Save timesheet review function
function saveTimesheetReview() {
    const reviewText = document.getElementById('timesheetReview').value;
    const selectedDate = document.getElementById('timesheetDate').valueAsDate;
    
    if (reviewText.trim()) {
        // Create review object
        const review = {
            id: Date.now(),
            text: reviewText,
            date: selectedDate.toISOString(),
            projectId: currentProject ? currentProject.id : null,
            userId: currentUser,
            createdAt: new Date().toISOString()
        };
        
        // Add review to tasks data structure instead of localStorage
        const taskWithReview = tasks.find(t => 
            t.projectId === review.projectId && 
            t.userId === currentUser
        );
        
        if (taskWithReview) {
            if (!taskWithReview.reviews) {
                taskWithReview.reviews = [];
            }
            
            // Check if review already exists for this date
            const existingReviewIndex = taskWithReview.reviews.findIndex(r => {
                const reviewDate = new Date(r.date);
                const selectedDateOnly = new Date(selectedDate);
                reviewDate.setHours(0, 0, 0, 0);
                selectedDateOnly.setHours(0, 0, 0, 0);
                return reviewDate.getTime() === selectedDateOnly.getTime();
            });
            
            if (existingReviewIndex !== -1) {
                // Update existing review
                taskWithReview.reviews[existingReviewIndex] = review;
            } else {
                // Add new review
                taskWithReview.reviews.push(review);
            }
            
            saveData(); // Save the updated data
        }
        
        // Update button text to show it was saved
        const saveBtn = document.getElementById('saveReviewBtn');
        if (saveBtn) {
            saveBtn.textContent = 'Review Saved!';
            setTimeout(() => {
                saveBtn.textContent = 'Update Review';
            }, 2000);
        }
    } else {
        // Show error message only if no text entered
        alert('Please enter a review before saving.');
    }
}

// Show data to user for manual copy to database
function showDataForCopy() {
    const dataString = getCurrentDataForRepo();
    
    // Create a modal to show the data
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 800px; max-height: 80vh;">
            <div class="modal-header">
                <h2>Update Central Database</h2>
                <span class="close" onclick="this.parentElement.parentElement.parentElement.remove()">&times;</span>
            </div>
            <div class="modal-body">
                <p><strong>Copy the data below and paste it into your data.json file to update the central database:</strong></p>
                <p style="color: #666; font-size: 14px;">This will sync all user data across the system.</p>
                <textarea id="dataTextarea" style="width: 100%; height: 400px; font-family: monospace; font-size: 12px; border: 1px solid #ccc; padding: 10px;" readonly>${dataString}</textarea>
                <div style="margin-top: 15px;">
                    <button onclick="copyDataToClipboard()" class="btn btn-primary">Copy to Clipboard</button>
                    <button onclick="this.parentElement.parentElement.parentElement.remove()" class="btn btn-secondary">Close</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// Show sync notification
function showSyncNotification() {
    // Create a small notification
    const notification = document.createElement('div');
    notification.className = 'sync-notification';
    notification.innerHTML = `
        <i class="fas fa-sync-alt"></i>
        <span>Data saved locally. Use "Copy Data to Repo" to sync with database.</span>
    `;
    
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 3000);
}

// Copy data to clipboard
function copyDataToClipboard() {
    const textarea = document.getElementById('dataTextarea');
    textarea.select();
    document.execCommand('copy');
    
    // Show feedback
    const copyBtn = textarea.nextElementSibling;
    const originalText = copyBtn.textContent;
    copyBtn.textContent = 'Copied!';
    setTimeout(() => {
        copyBtn.textContent = originalText;
    }, 2000);
}
