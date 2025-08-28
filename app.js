// Data structure
let projects = [];
let tasks = [];
let backlogItems = [];
let activeTimer = null;
let quotes = [];
let currentQuoteIndex = 0;
let quoteInterval = null;

// Load data from localStorage
function loadData() {
    const savedProjects = localStorage.getItem('projects');
    const savedTasks = localStorage.getItem('tasks');
    const savedBacklogItems = localStorage.getItem('backlogItems');
    
    projects = savedProjects ? JSON.parse(savedProjects) : [];
    tasks = savedTasks ? JSON.parse(savedTasks) : [];
    backlogItems = savedBacklogItems ? JSON.parse(savedBacklogItems) : [];
    
    // Clean old Done tasks before rendering
    cleanOldDoneTasks();
    
    renderProjects();
    renderTasks();
    renderBacklogItems();
}

// Save data to localStorage
function saveData() {
    localStorage.setItem('projects', JSON.stringify(projects));
    localStorage.setItem('tasks', JSON.stringify(tasks));
    localStorage.setItem('backlogItems', JSON.stringify(backlogItems));
}

// Clean old Done tasks (older than 5 days)
function cleanOldDoneTasks() {
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    
    const initialCount = tasks.length;
    
    // Filter out Done tasks older than 5 days
    tasks = tasks.filter(task => {
        if (task.status === 'Done') {
            // Check if task was moved to Done more than 5 days ago
            // We'll use the last time entry or createdAt as reference
            let lastActivity = new Date(task.createdAt);
            
            // If there are time entries, use the last one
            if (task.timeEntries && task.timeEntries.length > 0) {
                const lastEntry = task.timeEntries[task.timeEntries.length - 1];
                if (lastEntry.endTime) {
                    lastActivity = new Date(lastEntry.endTime);
                }
            }
            
            // Keep task if it's newer than 5 days ago
            return lastActivity > fiveDaysAgo;
        }
        return true; // Keep all non-Done tasks
    });
    
    const deletedCount = initialCount - tasks.length;
    
    if (deletedCount > 0) {
        // Save the cleaned data
        localStorage.setItem('tasks', JSON.stringify(tasks));
        
        // Show toast notification
        showToast(`${deletedCount} old completed task${deletedCount > 1 ? 's' : ''} cleaned up`, 'info', 4000);
        
        // Re-render tasks to reflect changes
        renderTasks();
    }
}

// Load quotes from JSON file
async function loadQuotes() {
    try {
        const response = await fetch('quotes.json');
        if (!response.ok) {
            throw new Error('Failed to load quotes');
        }
        quotes = await response.json();
        if (quotes.length > 0) {
            startQuoteRotation();
        }
    } catch (error) {
        console.error('Error loading quotes:', error);
        // Fallback quotes if JSON loading fails
        quotes = [
            { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
            { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" }
        ];
        startQuoteRotation();
    }
}

// Start quote rotation every 30 seconds
function startQuoteRotation() {
    if (quoteInterval) {
        clearInterval(quoteInterval);
    }
    
    // Show first quote immediately
    displayQuote();
    
    // Set interval for quote rotation
    quoteInterval = setInterval(() => {
        displayQuote();
    }, 30000);
}

// Display a quote with animation
function displayQuote() {
    if (quotes.length === 0) return;
    
    const quoteText = document.getElementById('quoteText');
    const quoteAuthor = document.getElementById('quoteAuthor');
    
    if (!quoteText || !quoteAuthor) return;
    
    // Add fade-out animation
    quoteText.classList.add('fade-out');
    quoteAuthor.classList.add('fade-out');
    
    // Wait for fade-out to complete, then change quote
    setTimeout(() => {
        // Get next quote
        currentQuoteIndex = (currentQuoteIndex + 1) % quotes.length;
        const quote = quotes[currentQuoteIndex];
        
        // Update content
        quoteText.textContent = quote.text;
        quoteAuthor.textContent = `— ${quote.author}`;
        
        // Remove fade-out class and trigger fade-in animation
        quoteText.classList.remove('fade-out');
        quoteAuthor.classList.remove('fade-out');
        
        // Reset animation by re-adding elements
        quoteText.style.animation = 'none';
        quoteAuthor.style.animation = 'none';
        
        // Trigger reflow
        quoteText.offsetHeight;
        quoteAuthor.offsetHeight;
        
        // Re-enable animation
        quoteText.style.animation = '';
        quoteAuthor.style.animation = '';
    }, 400); // Wait for fade-out animation
}

// Project Management
function addProject(name, emoji = '🎯') {
    const project = {
        id: Date.now(),
        name: name,
        emoji: emoji,
        position: projects.length * 1000 // Add position for ordering
    };
    projects.push(project);
    saveData();
    renderProjects();
    
    // Show toast message
    showToast(`Project created: ${emoji} ${name}`, 'success', 4000);
}

function renderProjects() {
    const projectsList = document.getElementById('projectsList');
    projectsList.innerHTML = '';
    
    // Add "All Tasks" option
    const allTasksLi = document.createElement('li');
    allTasksLi.className = !currentProject ? 'active' : '';
    allTasksLi.draggable = false;
    allTasksLi.innerHTML = `
        <span class="project-name">All Tasks</span>
    `;
    allTasksLi.onclick = () => selectProject(null);
    projectsList.appendChild(allTasksLi);
    
    // Sort projects by position
    const sortedProjects = [...projects].sort((a, b) => (a.position || 0) - (b.position || 0));
    
    sortedProjects.forEach((project, index) => {
        const li = document.createElement('li');
        li.className = currentProject && currentProject.id === project.id ? 'active' : '';
        li.dataset.projectId = project.id;
        li.dataset.position = project.position;
        li.draggable = true;
        
        li.innerHTML = `
            <span class="project-emoji">${project.emoji || '🎯'}</span>
            <span class="project-name">${project.name}</span>
        `;
        
        // Add click handler for project selection
        li.querySelector('.project-name').onclick = () => selectProject(project.id);
        
        // Add drag and drop event listeners
        li.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', project.id);
            li.classList.add('dragging');
        });
        
        li.addEventListener('dragend', () => {
            li.classList.remove('dragging');
        });
        
        projectsList.appendChild(li);
    });
    
    // Add the "New Project" item at the end
    const addProjectLi = document.createElement('li');
    addProjectLi.id = 'addProjectBtn';
    addProjectLi.className = 'add-project-item';
    addProjectLi.draggable = false;
    addProjectLi.onclick = openAddProjectModal;
    addProjectLi.innerHTML = `
        <i class="fas fa-plus"></i>
        <span>New Project</span>
    `;
    projectsList.appendChild(addProjectLi);
    
    // Add drag and drop event listeners to the projects list
    setupProjectDragAndDrop();
}

// Project drag and drop setup
function setupProjectDragAndDrop() {
    const projectsList = document.getElementById('projectsList');
    
    projectsList.addEventListener('dragover', (e) => {
        e.preventDefault();
        const draggingElement = document.querySelector('.dragging');
        if (!draggingElement) return;
        
        const afterElement = getDragAfterElement(projectsList, e.clientY);
        if (afterElement) {
            projectsList.insertBefore(draggingElement, afterElement);
        } else {
            projectsList.appendChild(draggingElement);
        }
    });
    
    projectsList.addEventListener('drop', (e) => {
        e.preventDefault();
        const draggedProjectId = parseInt(e.dataTransfer.getData('text/plain'));
        const draggedElement = document.querySelector('.dragging');
        
        if (draggedElement && draggedProjectId) {
            // Get the new position of the dragged project
            const newIndex = Array.from(projectsList.children).findIndex(child => 
                child.dataset.projectId === draggedProjectId.toString()
            );
            
            // Update project positions
            updateProjectPositions(newIndex, draggedProjectId);
        }
    });
}

// Helper function to determine where to place the dragged element
function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('li:not(.dragging):not(#addProjectBtn):not([draggable="false"])')];
    
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// Update project positions after drag and drop
function updateProjectPositions(newIndex, draggedProjectId) {
    // Get all projects except the dragged one
    const otherProjects = projects.filter(p => p.id !== draggedProjectId);
    
    // Sort by current position
    otherProjects.sort((a, b) => (a.position || 0) - (b.position || 0));
    
    // Insert the dragged project at the new position
    otherProjects.splice(newIndex, 0, projects.find(p => p.id === draggedProjectId));
    
    // Update positions for all projects (excluding "All Tasks" and "New Project")
    otherProjects.forEach((project, index) => {
        project.position = (index + 1) * 1000;
    });
    
    saveData();
    renderProjects();
}

let currentProject = null;

function selectProject(projectId) {
    currentProject = projectId ? projects.find(p => p.id === projectId) : null;
    document.getElementById('currentProjectName').textContent = currentProject ? currentProject.name : 'All Tasks';
    renderProjects();
    renderTasks();
    renderBacklogItems(); // Refresh backlog items when switching projects
    
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
    
    // Show toast message
    showToast(`Task created: ${title}`, 'success', 3000);
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
                <span class="due-date ${isOverdue(task.dueDate) ? 'overdue' : ''}">
                    Due: ${formatDueDate(task.dueDate)}
                </span>
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
    
    // Setup emoji picker
    setupEmojiPicker();
    
    form.onsubmit = (e) => {
        e.preventDefault();
        const name = document.getElementById('projectName').value;
        const emoji = document.getElementById('projectEmoji').value || '🎯';
        addProject(name, emoji);
        modal.style.display = 'none';
    };
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    
    // Load and start quote rotation
    loadQuotes();
    
    // Setup sidebar toggle
    setupSidebarToggle();
    
    // Setup cancel button for task modal
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
        document.getElementById('boardView').style.display = 'flex';
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
    
    // Add keyboard support for backlog inputs
    document.querySelectorAll('.backlog-input').forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const status = input.dataset.status;
                addBacklogItem(status);
            }
        });
    });
    
    // Initial render of backlog items
    renderBacklogItems();
    
    // Cleanup quote interval on page unload
    window.addEventListener('beforeunload', () => {
        if (quoteInterval) {
            clearInterval(quoteInterval);
        }
    });
    
    // Change quote when tab becomes visible
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && quotes.length > 0) {
            // Change quote immediately when tab becomes visible
            displayQuote();
        }
    });
});

// Render backlog items
function renderBacklogItems() {
    const backlogContainer = document.getElementById('backlogItems');
    if (!backlogContainer) return;
    
    backlogContainer.innerHTML = '';
    
    // Update backlog input placeholder based on current project
    updateBacklogInputPlaceholder();
    
    // Filter backlog items for current project
    let filteredBacklogItems = [];
    
    if (currentProject) {
        // Show only backlog items for the selected project
        filteredBacklogItems = backlogItems.filter(item => item.projectId === currentProject.id);
    } else {
        // If no project is selected (All Tasks), show backlog items from all projects
        filteredBacklogItems = backlogItems;
    }
    
    filteredBacklogItems.forEach(item => {
        const backlogItemElement = document.createElement('div');
        backlogItemElement.className = 'backlog-item';
        backlogItemElement.dataset.itemId = item.id;
        
        // Get project name for display when showing all projects
        let displayText = item.text;
        if (!currentProject && item.projectId) {
            const project = projects.find(p => p.id === item.projectId);
            if (project) {
                displayText = `${project.emoji || '🎯'} ${item.text}`;
            }
        }
        
        backlogItemElement.innerHTML = `
            <div class="backlog-text">${displayText}</div>
            <div class="backlog-actions">
                <button class="backlog-action-btn convert-btn" onclick="convertBacklogToTask(${item.id})" title="Convert to Task">
                    <i class="fas fa-arrow-right"></i>
                </button>
                <button class="backlog-action-btn delete-btn" onclick="deleteBacklogItem(${item.id})" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        
        backlogContainer.appendChild(backlogItemElement);
    });
}

// Update backlog input placeholder based on current project
function updateBacklogInputPlaceholder() {
    const backlogInput = document.getElementById('backlogInput');
    if (backlogInput) {
        if (currentProject) {
            backlogInput.placeholder = `Add backlog item to ${currentProject.name}...`;
        } else {
            backlogInput.placeholder = 'Add backlog item to All Tasks...';
        }
    }
}

// Convert backlog item to task
function convertBacklogToTask(backlogItemId) {
    const backlogItem = backlogItems.find(item => item.id === backlogItemId);
    if (backlogItem) {
        // Create a new task from the backlog item
        const newTask = {
            id: Date.now(),
            title: backlogItem.text,
            status: 'To Do', // Default status when converting
            projectId: backlogItem.projectId,
            createdAt: new Date().toISOString(),
            timeSpent: 0,
            timeEntries: [],
            isTimerRunning: false,
            timerStart: null,
            dueDate: null
        };
        
        // Add the task
        tasks.push(newTask);
        
        // Remove the backlog item
        deleteBacklogItem(backlogItemId);
        
        // Save data and re-render
        saveData();
        renderTasks();
        
        // Show success feedback
        showToast('Backlog item converted to task successfully!', 'success', 3000);
    }
}

// Delete backlog item
function deleteBacklogItem(backlogItemId) {
    const index = backlogItems.findIndex(item => item.id === backlogItemId);
    if (index !== -1) {
        backlogItems.splice(index, 1);
        saveData();
        renderBacklogItems();
        
        // Show success feedback
        showToast('Backlog item deleted successfully!', 'success', 3000);
    }
}

// Show toast notification function
function showToast(message, type = 'info', duration = 4000) {
    // Remove existing toasts to prevent overlap
    const existingToasts = document.querySelectorAll('.toast-notification');
    existingToasts.forEach(toast => {
        if (toast.dataset.message === message) {
            document.body.removeChild(toast);
        }
    });
    
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    toast.dataset.message = message;
    
    // Add icon based on type
    let icon = '';
    switch (type) {
        case 'success':
            icon = '<i class="fas fa-check-circle"></i>';
            break;
        case 'error':
            icon = '<i class="fas fa-exclamation-circle"></i>';
            break;
        case 'warning':
            icon = '<i class="fas fa-exclamation-triangle"></i>';
            break;
        case 'info':
        default:
            icon = '<i class="fas fa-info-circle"></i>';
            break;
    }
    
    toast.innerHTML = `
        <div class="toast-content">
            <div class="toast-icon">${icon}</div>
            <div class="toast-message">${message}</div>
            <button class="toast-close" onclick="this.parentElement.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="toast-progress"></div>
    `;
    
    // Add to page
    document.body.appendChild(toast);
    
    // Animate in
    setTimeout(() => {
        toast.classList.add('show');
    }, 100);
    
    // Auto remove after duration
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (document.body.contains(toast)) {
                document.body.removeChild(toast);
            }
        }, 300);
    }, duration);
    
    // Progress bar animation
    const progressBar = toast.querySelector('.toast-progress');
    progressBar.style.transition = `width ${duration}ms linear`;
    setTimeout(() => {
        progressBar.style.width = '0%';
    }, 100);
}

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
        
        // Show toast message
        showToast(`Timer started for: ${task.title}`, 'success', 3000);
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

    // Get all time entries for the selected date
    const allTimeEntries = [];
    tasks.forEach(task => {
        if (task.timeEntries && task.timeEntries.length > 0) {
            task.timeEntries.forEach(entry => {
                const entryDate = new Date(entry.date);
                if (entryDate >= startDate && entryDate <= endDate) {
                    allTimeEntries.push({
                        date: entryDate,
                        duration: entry.duration,
                        taskTitle: task.title,
                        projectName: task.projectId ? projects.find(p => p.id === task.projectId)?.name : 'No Project'
                    });
                }
            });
        }
    });

    // Sort time entries by date (chronological order)
    allTimeEntries.sort((a, b) => a.date - b.date);

    // Display clock-in and clock-out summary
    const timesheetView = document.querySelector('.timesheet-view');
    let clockSummary = timesheetView.querySelector('.clock-summary');
    
    if (!clockSummary) {
        clockSummary = document.createElement('div');
        clockSummary.className = 'clock-summary';
        timesheetView.insertBefore(clockSummary, timesheetView.firstChild);
    }

    if (allTimeEntries.length > 0) {
        const firstEntry = allTimeEntries[0];
        const lastEntry = allTimeEntries[allTimeEntries.length - 1];
        

        
        clockSummary.innerHTML = `
            <div class="clock-summary-content">
                <div class="clock-time">
                    <div class="clock-in">
                        <i class="fas fa-sign-in-alt"></i>
                        <span class="label">Clock In:</span>
                        <span class="time">${firstEntry.date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                    </div>
                    <div class="clock-out">
                        <i class="fas fa-sign-out-alt"></i>
                        <span class="label">Clock Out:</span>
                        <span class="time">${lastEntry.date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                    </div>
                </div>

            </div>
        `;
    } else {
        clockSummary.innerHTML = `
            <div class="clock-summary-content">
                <div class="no-entries">
                    <i class="fas fa-calendar-times"></i>
                    <span>No time entries for ${selectedDate.toLocaleDateString()}</span>
                </div>
            </div>
        `;
    }

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
            dueDate: task.dueDate,
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
            <td>${task.dueDate ? formatDueDate(task.dueDate) : '-'}</td>
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
        <td colspan="6">
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
    const savedReviews = JSON.parse(localStorage.getItem('timesheetReviews') || '[]');
    const currentProjectId = currentProject ? currentProject.id : null;
    
    return savedReviews.find(review => {
        const reviewDate = new Date(review.date);
        const selectedDateOnly = new Date(selectedDate);
        reviewDate.setHours(0, 0, 0, 0);
        selectedDateOnly.setHours(0, 0, 0, 0);
        return reviewDate.getTime() === selectedDateOnly.getTime() && 
               review.projectId === currentProjectId;
    });
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
        
        // Check if a review already exists for this date and project
        const existingReviewIndex = savedReviews.findIndex(r => {
            const reviewDate = new Date(r.date);
            const selectedDateOnly = new Date(selectedDate);
            reviewDate.setHours(0, 0, 0, 0);
            selectedDateOnly.setHours(0, 0, 0, 0);
            return reviewDate.getTime() === selectedDateOnly.getTime() && 
                   r.projectId === review.projectId;
        });
        
        if (existingReviewIndex !== -1) {
            // Update existing review
            savedReviews[existingReviewIndex] = review;
        } else {
            // Add new review
            savedReviews.push(review);
        }
        
        localStorage.setItem('timesheetReviews', JSON.stringify(savedReviews));
        
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

// Add backlog item function
function addBacklogItem(status) {
    const input = document.querySelector(`.backlog-input[data-status="${status}"]`);
    const itemText = input.value.trim();
    
    if (itemText) {
        const backlogItem = {
            id: Date.now(),
            text: itemText,
            projectId: currentProject ? currentProject.id : null,
            createdAt: new Date().toISOString(),
            status: status
        };
        
        backlogItems.push(backlogItem);
        saveData();
        renderBacklogItems();
        
        // Show toast message with project context
        const projectName = currentProject ? currentProject.name : 'All Tasks';
        showToast(`Backlog item added to ${projectName}: ${itemText}`, 'success', 3000);
        
        // Clear the input field
        input.value = '';
        
        // Focus back to the input for quick adding
        input.focus();
    }
}

// Due date helper functions
function formatDueDate(dueDate) {
    const date = new Date(dueDate);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Reset time for comparison
    today.setHours(0, 0, 0, 0);
    tomorrow.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    
    if (date.getTime() === today.getTime()) {
        return 'Today';
    } else if (date.getTime() === tomorrow.getTime()) {
        return 'Tomorrow';
    } else {
        return date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric',
            year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
        });
    }
}

function isOverdue(dueDate) {
    const due = new Date(dueDate);
    const today = new Date();
    
    // Reset time for comparison
    due.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    
    return due < today;
}

// Sidebar toggle functionality
function setupSidebarToggle() {
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.querySelector('.sidebar');
    
    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            
            // Update button icon
            const icon = sidebarToggle.querySelector('i');
            if (sidebar.classList.contains('collapsed')) {
                icon.className = 'fas fa-chevron-right';
                sidebarToggle.title = 'Show Sidebar';
            } else {
                icon.className = 'fas fa-bars';
                sidebarToggle.title = 'Hide Sidebar';
            }
        });
    }
}
