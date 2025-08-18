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
    // Refresh timesheet if it's visible
    if (document.getElementById('timesheetView').style.display === 'block') {
        renderTimesheet();
    }
}

// Task Management
function addTask(title, status) {
    // Get the highest position number for the given status
    const maxPosition = Math.max(0, ...tasks
        .filter(t => t.status === status)
        .map(t => t.position || 0));
    
    const task = {
        id: Date.now(),
        projectId: currentProject ? currentProject.id : null,
        title,
        status,
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
    reviewRow.innerHTML = `
        <td colspan="5">
            <div class="review-section">
                <label for="timesheetReview">Review:</label>
                <textarea id="timesheetReview" placeholder="Add your review, notes, or observations about today's work..."></textarea>
                <button id="saveReviewBtn" class="btn-save-review">Save Review</button>
            </div>
        </td>
    `;
    timesheetBody.appendChild(reviewRow);
    
    // Add event listener for save review button
    const saveReviewBtn = reviewRow.querySelector('#saveReviewBtn');
    saveReviewBtn.addEventListener('click', saveTimesheetReview);
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
            createdAt: new Date().toISOString()
        };
        
        // Save to localStorage
        const savedReviews = JSON.parse(localStorage.getItem('timesheetReviews') || '[]');
        savedReviews.push(review);
        localStorage.setItem('timesheetReviews', JSON.stringify(savedReviews));
        
        // Show success message
        alert('Review saved successfully!');
        
        // Clear the textarea
        document.getElementById('timesheetReview').value = '';
    } else {
        alert('Please enter a review before saving.');
    }
}
