// Data structure
let projects = [];
let tasks = [];
let backlogItems = [];
let activeTimer = null;
let quotes = [];
let currentQuoteIndex = 0;
let quoteInterval = null;

// Load data from Firebase REST API or localStorage
async function loadData() {
    console.log('📥 Loading data from Firebase...');
    try {
        if (window.firebaseRESTIntegration) {
            console.log('🔄 Using Firebase REST API integration');
            // Load from Firebase via REST API
            projects = await window.firebaseRESTIntegration.loadData('projects');
            tasks = await window.firebaseRESTIntegration.loadData('tasks');
            backlogItems = await window.firebaseRESTIntegration.loadData('backlogItems');
            timeEntries = await window.firebaseRESTIntegration.loadData('timeEntries');
            timesheetReviews = await window.firebaseRESTIntegration.loadData('timesheetReviews');
            
            console.log(`📊 Loaded data:`, {
                projects: projects.length,
                tasks: tasks.length,
                backlogItems: backlogItems.length,
                timeEntries: timeEntries.length,
                timesheetReviews: timesheetReviews.length
            });
        } else {
            console.log('📱 Firebase integration not available, using localStorage');
            // Fallback to localStorage
            const savedProjects = localStorage.getItem('projects');
            const savedTasks = localStorage.getItem('tasks');
            const savedBacklogItems = localStorage.getItem('backlogItems');
            const savedTimeEntries = localStorage.getItem('timeEntries');
            const savedTimesheetReviews = localStorage.getItem('timesheetReviews');
            
            projects = savedProjects ? JSON.parse(savedProjects) : [];
            tasks = savedTasks ? JSON.parse(savedTasks) : [];
            backlogItems = savedBacklogItems ? JSON.parse(savedBacklogItems) : [];
            timeEntries = savedTimeEntries ? JSON.parse(savedTimeEntries) : [];
            timesheetReviews = savedTimesheetReviews ? JSON.parse(savedTimesheetReviews) : [];
        }
        
        // Clean old Done tasks before rendering
        cleanOldDoneTasks();
        
        renderProjects();
        renderTasks();
        renderBacklogItems();
    } catch (error) {
        console.error('❌ Error loading data:', error);
        // Fallback to localStorage
        const savedProjects = localStorage.getItem('projects');
        const savedTasks = localStorage.getItem('tasks');
        const savedBacklogItems = localStorage.getItem('backlogItems');
        const savedTimeEntries = localStorage.getItem('timeEntries');
        const savedTimesheetReviews = localStorage.getItem('timesheetReviews');
        
        projects = savedProjects ? JSON.parse(savedProjects) : [];
        tasks = savedTasks ? JSON.parse(savedTasks) : [];
        backlogItems = savedBacklogItems ? JSON.parse(savedBacklogItems) : [];
        timeEntries = savedTimeEntries ? JSON.parse(savedTimeEntries) : [];
        timesheetReviews = savedTimesheetReviews ? JSON.parse(savedTimesheetReviews) : [];
        
        renderProjects();
        renderTasks();
        renderBacklogItems();
    }
}

// Save data to Firebase REST API or localStorage
async function saveData() {
    console.log('💾 Saving data to Firebase...');
    try {
        if (window.firebaseRESTIntegration) {
            console.log('🔄 Using Firebase REST API integration for saving');
            // Save to Firebase via REST API
            await window.firebaseRESTIntegration.saveData('projects', projects);
            await window.firebaseRESTIntegration.saveData('tasks', tasks);
            await window.firebaseRESTIntegration.saveData('backlogItems', backlogItems);
            await window.firebaseRESTIntegration.saveData('timeEntries', timeEntries);
            await window.firebaseRESTIntegration.saveData('timesheetReviews', timesheetReviews);
            console.log('✅ All data saved to Firebase successfully');
        } else {
            console.log('📱 Firebase integration not available, saving to localStorage');
            // Fallback to localStorage
            localStorage.setItem('projects', JSON.stringify(projects));
            localStorage.setItem('tasks', JSON.stringify(tasks));
            localStorage.setItem('backlogItems', JSON.stringify(backlogItems));
            localStorage.setItem('timeEntries', JSON.stringify(timeEntries));
            localStorage.setItem('timesheetReviews', JSON.stringify(timesheetReviews));
        }
    } catch (error) {
        console.error('❌ Error saving data:', error);
        // Fallback to localStorage
        localStorage.setItem('projects', JSON.stringify(projects));
        localStorage.setItem('tasks', JSON.stringify(tasks));
        localStorage.setItem('backlogItems', JSON.stringify(backlogItems));
        localStorage.setItem('timeEntries', JSON.stringify(timeEntries));
        localStorage.setItem('timesheetReviews', JSON.stringify(timesheetReviews));
    }
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

// Display a specific quote by index
function displayQuoteByIndex(index, direction = 'next') {
    if (quotes.length === 0 || index < 0 || index >= quotes.length) return;
    
    const quoteText = document.getElementById('quoteText');
    const quoteAuthor = document.getElementById('quoteAuthor');
    
    if (!quoteText || !quoteAuthor) return;
    
    // Add fade-out animation
    quoteText.classList.add('fade-out');
    quoteAuthor.classList.add('fade-out');
    
    // Wait for fade-out to complete, then change quote
    setTimeout(() => {
        currentQuoteIndex = index;
        const quote = quotes[currentQuoteIndex];
        
        // Update content
        quoteText.textContent = quote.text;
        quoteAuthor.textContent = `— ${quote.author}`;
        
        // Remove fade-out class and trigger fade-in animation
        quoteText.classList.remove('fade-out');
        quoteAuthor.classList.remove('fade-out');
        quoteText.classList.add('fade-in');
        quoteAuthor.classList.add('fade-in');
        
        // Remove fade-in classes after animation completes
        setTimeout(() => {
            quoteText.classList.remove('fade-in');
            quoteAuthor.classList.remove('fade-in');
        }, 400);
    }, 300); // Wait for fade-out animation
}

// Setup swipe functionality for quotes
function setupQuoteSwipe() {
    const quoteContainer = document.querySelector('.quote-container');
    if (!quoteContainer) return;
    
    let startX = 0;
    let startY = 0;
    let endX = 0;
    let endY = 0;
    let isSwiping = false;
    
    // Touch events for mobile
    quoteContainer.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        isSwiping = true;
    });
    
    quoteContainer.addEventListener('touchmove', (e) => {
        if (!isSwiping) return;
        endX = e.touches[0].clientX;
        endY = e.touches[0].clientY;
    });
    
    quoteContainer.addEventListener('touchend', (e) => {
        if (!isSwiping) return;
        isSwiping = false;
        
        const deltaX = endX - startX;
        const deltaY = endY - startY;
        
        // Check if it's a horizontal swipe (minimum 50px distance)
        if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
            if (deltaX > 0) {
                // Swipe right - go to previous quote
                const prevIndex = currentQuoteIndex === 0 ? quotes.length - 1 : currentQuoteIndex - 1;
                displayQuoteByIndex(prevIndex, 'prev');
            } else {
                // Swipe left - go to next quote
                const nextIndex = (currentQuoteIndex + 1) % quotes.length;
                displayQuoteByIndex(nextIndex, 'next');
            }
        }
    });
    
    // Mouse events for desktop (drag)
    quoteContainer.addEventListener('mousedown', (e) => {
        startX = e.clientX;
        startY = e.clientY;
        isSwiping = true;
    });
    
    quoteContainer.addEventListener('mousemove', (e) => {
        if (!isSwiping) return;
        endX = e.clientX;
        endY = e.clientY;
    });
    
    quoteContainer.addEventListener('mouseup', (e) => {
        if (!isSwiping) return;
        isSwiping = false;
        
        const deltaX = endX - startX;
        const deltaY = endY - startY;
        
        // Check if it's a horizontal drag (minimum 50px distance)
        if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
            if (deltaX > 0) {
                // Drag right - go to previous quote
                const prevIndex = currentQuoteIndex === 0 ? quotes.length - 1 : currentQuoteIndex - 1;
                displayQuoteByIndex(prevIndex, 'prev');
            } else {
                // Drag left - go to next quote
                const nextIndex = (currentQuoteIndex + 1) % quotes.length;
                displayQuoteByIndex(nextIndex, 'next');
            }
        }
    });
    
    // Prevent text selection during drag
    quoteContainer.addEventListener('selectstart', (e) => {
        if (isSwiping) e.preventDefault();
    });
}

// Project Management
async function addProject(name, emoji = '🎯') {
    console.log(`🆕 Creating new project: ${emoji} ${name}`);
    
    // Get current projects from database
    const existingProjects = await window.firebaseRESTIntegration.loadData('projects');
    
    const project = {
        id: Date.now(),
        name: name,
        emoji: emoji,
        position: existingProjects.length * 1000 // Add position for ordering
    };
    
    console.log(`📝 Project object created:`, project);
    
    // Add project directly to database
    const updatedProjects = [...existingProjects, project];
    console.log(`💾 Saving project directly to Firebase...`);
    await window.firebaseRESTIntegration.saveData('projects', updatedProjects);
    console.log(`✅ Project saved to database successfully`);
    
    // Update local array and render
    projects = updatedProjects;
    renderProjects();
    
    // Show toast message
    showToast(`Project created: ${emoji} ${name}`, 'success', 4000);
}

async function updateProject(projectId, name, emoji) {
    console.log(`🔄 Updating project ${projectId} with: ${emoji} ${name}`);
    
    // Get current projects from database
    const existingProjects = await window.firebaseRESTIntegration.loadData('projects');
    const projectIndex = existingProjects.findIndex(p => p.id === projectId);
    
    if (projectIndex !== -1) {
        const oldName = existingProjects[projectIndex].name;
        
        // Update project in the array
        const updatedProjects = [...existingProjects];
        updatedProjects[projectIndex] = {
            ...updatedProjects[projectIndex],
            name: name,
            emoji: emoji
        };
        
        // Save updated projects directly to database
        console.log(`💾 Saving updated project to Firebase...`);
        await window.firebaseRESTIntegration.saveData('projects', updatedProjects);
        console.log(`✅ Project updated in database successfully`);
        
        // Update local array and render
        projects = updatedProjects;
        renderProjects();
        
        // Update current project if it's the one being edited
        if (currentProject && currentProject.id === projectId) {
            currentProject = projects[projectIndex];
            document.getElementById('currentProjectName').textContent = name;
        }
        
        // Show toast message
        showToast(`Project updated: ${emoji} ${name}`, 'success', 4000);
    } else {
        console.error(`❌ Project with ID ${projectId} not found`);
    }
}

async function deleteProject(projectId) {
    console.log(`🗑️ Deleting project ${projectId}`);
    
    // Get current data from database
    const existingProjects = await window.firebaseRESTIntegration.loadData('projects');
    const existingTasks = await window.firebaseRESTIntegration.loadData('tasks');
    const existingBacklogItems = await window.firebaseRESTIntegration.loadData('backlogItems');
    
    const projectIndex = existingProjects.findIndex(p => p.id === projectId);
    if (projectIndex !== -1) {
        const projectName = existingProjects[projectIndex].name;
        
        // Remove all tasks associated with this project
        const updatedTasks = existingTasks.filter(task => task.projectId !== projectId);
        
        // Remove all backlog items associated with this project
        const updatedBacklogItems = existingBacklogItems.filter(item => item.projectId !== projectId);
        
        // Remove the project
        const updatedProjects = existingProjects.filter(p => p.id !== projectId);
        
        // Save all updated data directly to database
        console.log(`💾 Saving updated data to Firebase after project deletion...`);
        await window.firebaseRESTIntegration.saveData('projects', updatedProjects);
        await window.firebaseRESTIntegration.saveData('tasks', updatedTasks);
        await window.firebaseRESTIntegration.saveData('backlogItems', updatedBacklogItems);
        console.log(`✅ Project and associated data deleted from database successfully`);
        
        // Update local arrays
        projects = updatedProjects;
        tasks = updatedTasks;
        backlogItems = updatedBacklogItems;
        
        // If the deleted project was selected, switch to "All Tasks"
        if (currentProject && currentProject.id === projectId) {
            currentProject = null;
            document.getElementById('currentProjectName').textContent = 'All Tasks';
        }
        
        renderProjects();
        renderTasks();
        renderBacklogItems();
        
        // Show toast message
        showToast(`Project deleted: ${projectName}`, 'info', 4000);
    } else {
        console.error(`❌ Project with ID ${projectId} not found`);
    }
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
            <div class="project-actions">
                <button class="project-edit-btn" title="Project Settings">
                    <i class="fas fa-cog"></i>
                </button>
            </div>
        `;
        
        // Add click handler for project selection
        li.querySelector('.project-name').onclick = () => selectProject(project.id);
        
        // Add click handler for edit button
        li.querySelector('.project-edit-btn').onclick = (e) => {
            e.stopPropagation();
            openEditProjectModal(project);
        };
        
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
async function updateProjectPositions(newIndex, draggedProjectId) {
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
    
    await saveData();
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
async function addTask(title, status, dueDate) {
    console.log(`🆕 Creating new task: ${title} (${status})`);
    
    // Check if Firebase integration is available
    if (!window.firebaseRESTIntegration) {
        console.error('❌ Firebase integration not available');
        throw new Error('Firebase integration not available. Please refresh the page.');
    }
    
    try {
        // Get the highest position number for the given status from database
        console.log('📥 Loading existing tasks from database...');
        const existingTasks = await window.firebaseRESTIntegration.loadData('tasks');
        console.log(`📊 Found ${existingTasks.length} existing tasks`);
        
        const maxPosition = Math.max(0, ...existingTasks
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
        
        console.log(`📝 Task object created:`, task);
        
        // Add task directly to database
        const updatedTasks = [...existingTasks, task];
        console.log(`💾 Saving task directly to Firebase...`);
        await window.firebaseRESTIntegration.saveData('tasks', updatedTasks);
        console.log(`✅ Task saved to database successfully`);
        
        // Update local array and render
        tasks = updatedTasks;
        renderTasks();
        
        // Show toast message
        showToast(`Task created: ${title}`, 'success', 3000);
    } catch (error) {
        console.error('❌ Error in addTask:', error);
        throw error; // Re-throw to be caught by the form handler
    }
}

async function updateTask(taskId, updates) {
    console.log(`🔄 Updating task ${taskId} with:`, updates);
    
    // Get current tasks from database
    const existingTasks = await window.firebaseRESTIntegration.loadData('tasks');
    const taskIndex = existingTasks.findIndex(t => t.id === taskId);
    
    if (taskIndex !== -1) {
        // Update task in the array
        const updatedTasks = [...existingTasks];
        updatedTasks[taskIndex] = { ...updatedTasks[taskIndex], ...updates };
        
        // Save updated tasks directly to database
        console.log(`💾 Saving updated task to Firebase...`);
        await window.firebaseRESTIntegration.saveData('tasks', updatedTasks);
        console.log(`✅ Task updated in database successfully`);
        
        // Update local array and render
        tasks = updatedTasks;
        renderTasks();
    } else {
        console.error(`❌ Task with ID ${taskId} not found`);
    }
}

// Handle menu visibility
async function deleteTask(taskId) {
    // Show confirmation dialog
    if (confirm('Are you sure you want to delete this task? This action cannot be undone.')) {
        console.log(`🗑️ Deleting task ${taskId}`);
        
        // If timer is running for this task, stop it
        if (activeTimer === taskId) {
            await stopTimer(taskId);
        }
        
        // Get current tasks from database
        const existingTasks = await window.firebaseRESTIntegration.loadData('tasks');
        
        // Remove task from the array
        const updatedTasks = existingTasks.filter(t => t.id !== taskId);
        
        // Save updated tasks directly to database
        console.log(`💾 Saving updated tasks to Firebase after deletion...`);
        await window.firebaseRESTIntegration.saveData('tasks', updatedTasks);
        console.log(`✅ Task deleted from database successfully`);
        
        // Update local array and render
        tasks = updatedTasks;
        renderTasks();
        
        // Close any open menus
        document.querySelectorAll('.menu-dropdown.show').forEach(menu => {
            menu.classList.remove('show');
        });
        
        // Show toast message
        showToast('Task deleted', 'success', 3000);
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
    
    // Group tasks by status and sort by position or deadline
    const groupedTasks = {};
    Object.keys(containers).forEach(status => {
        let statusTasks = filteredTasks.filter(task => task.status === status);
        
        if (isSortedByDeadline) {
            // Sort by deadline (tasks with due dates first, then by date, then by position)
            statusTasks.sort((a, b) => {
                // Tasks without due dates go to the end
                if (!a.dueDate && !b.dueDate) {
                    return (a.position || 0) - (b.position || 0);
                }
                if (!a.dueDate) return 1;
                if (!b.dueDate) return -1;
                
                // Sort by due date
                const dateA = new Date(a.dueDate);
                const dateB = new Date(b.dueDate);
                if (dateA.getTime() !== dateB.getTime()) {
                    return dateA - dateB;
                }
                
                // If same date, sort by position
                return (a.position || 0) - (b.position || 0);
            });
        } else {
            // Default sort by position
            statusTasks.sort((a, b) => (a.position || 0) - (b.position || 0));
        }
        
        groupedTasks[status] = statusTasks;
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
    timerBtn.onclick = async (e) => {
        e.stopPropagation();
        const taskId = parseInt(e.target.closest('button').dataset.taskId);
        
        console.log(`🔄 Timer button clicked for task ${taskId}`);
        console.log(`🔍 Firebase integration available:`, !!window.firebaseRESTIntegration);
        
        try {
            // Check current timer state from the database
            if (window.firebaseRESTIntegration) {
                console.log(`📡 Loading current tasks from database...`);
                const currentTasks = await window.firebaseRESTIntegration.loadData('tasks');
                console.log(`📋 Loaded ${currentTasks.length} tasks from database`);
                
                const currentTask = currentTasks.find(t => t.id === taskId);
                console.log(`🎯 Found task:`, {
                    id: currentTask?.id,
                    title: currentTask?.title,
                    isTimerRunning: currentTask?.isTimerRunning
                });
                
                if (currentTask && currentTask.isTimerRunning) {
                    console.log(`🛑 Stopping timer for task ${taskId}`);
                    await stopTimer(taskId);
                } else {
                    console.log(`▶️ Starting timer for task ${taskId}`);
                    await startTimer(taskId);
                }
            } else {
                console.log(`⚠️ Firebase not available, using local state`);
                // Fallback to local state if Firebase not available
                if (task.isTimerRunning) {
                    console.log(`🛑 Stopping timer (local) for task ${taskId}`);
                    await stopTimer(taskId);
                } else {
                    console.log(`▶️ Starting timer (local) for task ${taskId}`);
                    await startTimer(taskId);
                }
            }
        } catch (error) {
            console.error('❌ Error handling timer button click:', error);
            console.error('❌ Error details:', {
                message: error.message,
                stack: error.stack,
                taskId: taskId,
                firebaseAvailable: !!window.firebaseRESTIntegration
            });
            showToast(`Error with timer operation: ${error.message}`, 'error', 5000);
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
    
    form.onsubmit = async (e) => {
        e.preventDefault();
        console.log('📝 Task form submitted');
        
        const title = document.getElementById('taskTitle').value;
        const status = document.getElementById('taskStatus').value;
        const dueDate = document.getElementById('taskDueDate').value;
        
        console.log('📋 Form data:', { title, status, dueDate });
        
        if (!title.trim()) {
            console.error('❌ Task title is required');
            showToast('Task title is required', 'error');
            return;
        }
        
        try {
            console.log('🚀 Calling addTask function...');
            await addTask(title, status, dueDate);
            console.log('✅ Task creation completed, closing modal');
            modal.style.display = 'none';
        } catch (error) {
            console.error('❌ Error creating task:', error);
            showToast('Error creating task: ' + error.message, 'error');
        }
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
    deleteBtn.onclick = async () => {
        await deleteTask(task.id);
        modal.style.display = 'none';
    };
    
    modal.style.display = 'block';
    
    form.onsubmit = async (e) => {
        e.preventDefault();
        const updates = {
            title: document.getElementById('taskTitle').value,
            status: document.getElementById('taskStatus').value,
            dueDate: document.getElementById('taskDueDate').value || null
        };
        
        await updateTask(task.id, updates);
        modal.style.display = 'none';
    };
}

function openAddProjectModal() {
    const modal = document.getElementById('projectModal');
    const modalTitle = document.getElementById('projectModalTitle');
    const form = document.getElementById('projectForm');
    const saveBtn = document.getElementById('saveProjectBtn');
    const deleteBtn = document.getElementById('deleteProjectBtn');
    
    // Set modal to add mode
    modalTitle.textContent = 'Add Project';
    saveBtn.textContent = 'Save';
    deleteBtn.style.display = 'none';
    
    // Clear form and show modal
    form.reset();
    modal.style.display = 'block';
    
    // Setup emoji picker with default emoji
    setupEmojiPicker('🎯');
    
    // Set form submission for adding
    form.onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById('projectName').value;
        const emoji = document.getElementById('selectedEmoji').textContent || '🎯';
        await addProject(name, emoji);
        modal.style.display = 'none';
    };
}

function openEditProjectModal(project) {
    const modal = document.getElementById('projectModal');
    const modalTitle = document.getElementById('projectModalTitle');
    const form = document.getElementById('projectForm');
    const nameInput = document.getElementById('projectName');
    const saveBtn = document.getElementById('saveProjectBtn');
    const deleteBtn = document.getElementById('deleteProjectBtn');
    
    // Set modal to edit mode
    modalTitle.textContent = 'Edit Project';
    saveBtn.textContent = 'Update';
    deleteBtn.style.display = 'block';
    
    // Populate form with existing project data
    nameInput.value = project.name;
    
    // Setup emoji picker with current project emoji
    setupEmojiPicker(project.emoji || '🎯');
    
    // Set form submission for editing
    form.onsubmit = async (e) => {
        e.preventDefault();
        const name = nameInput.value;
        const emoji = document.getElementById('selectedEmoji').textContent || '🎯';
        await updateProject(project.id, name, emoji);
        modal.style.display = 'none';
    };
    
    // Set delete button functionality
    deleteBtn.onclick = async () => {
        if (confirm(`Are you sure you want to delete the project "${project.name}"? This will also delete all associated tasks and backlog items.`)) {
            await deleteProject(project.id);
            modal.style.display = 'none';
        }
    };
    
    // Show modal
    modal.style.display = 'block';
}

// Setup emoji picker functionality
function setupEmojiPicker(initialEmoji = '🎯') {
    const emojiOptions = document.querySelectorAll('.emoji-option');
    const selectedEmojiDisplay = document.getElementById('selectedEmoji');
    
    // Remove previous selections
    emojiOptions.forEach(option => option.classList.remove('selected'));
    
    // Set initial emoji
    selectedEmojiDisplay.textContent = initialEmoji;
    
    // Select the initial emoji in the grid
    const initialOption = Array.from(emojiOptions).find(option => option.dataset.emoji === initialEmoji);
    if (initialOption) {
        initialOption.classList.add('selected');
    }
    
    // Add click event to each emoji option
    emojiOptions.forEach(option => {
        option.addEventListener('click', () => {
            const emoji = option.dataset.emoji;
            
            // Remove selection from all options
            emojiOptions.forEach(opt => opt.classList.remove('selected'));
            
            // Add selection to clicked option
            option.classList.add('selected');
            
            // Update display
            selectedEmojiDisplay.textContent = emoji;
        });
    });
}

// Event Listeners
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 DOM Content Loaded - Initializing TimeTracker...');
    
    // Wait for Firebase integration to be available
    let attempts = 0;
    const maxAttempts = 50; // Wait up to 5 seconds (50 * 100ms)
    
    while (!window.firebaseRESTIntegration && attempts < maxAttempts) {
        console.log(`⏳ Waiting for Firebase integration... (attempt ${attempts + 1}/${maxAttempts})`);
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }
    
    // Check if Firebase integration is available
    if (window.firebaseRESTIntegration) {
        console.log('✅ Firebase REST integration is available');
    } else {
        console.error('❌ Firebase REST integration is NOT available after waiting');
        console.log('Available window objects:', Object.keys(window).filter(key => key.includes('firebase')));
    }
    
    await loadData();
    
    // Load and start quote rotation
    loadQuotes();
    
    // Setup quote swipe functionality
    setupQuoteSwipe();
    
    // Setup sidebar toggle
    setupSidebarToggle();
    
    // Setup sort button
    setupSortButton();
    
    // Add global test functions for debugging
    window.testTaskCreation = async () => {
        console.log('🧪 Testing task creation...');
        try {
            await addTask('Test Task', 'To Do', null);
            console.log('✅ Test task creation successful');
        } catch (error) {
            console.error('❌ Test task creation failed:', error);
        }
    };
    
    window.testTimer = async (taskId) => {
        console.log('🧪 Testing timer operations...');
        try {
            if (!taskId) {
                // Find the first task
                const firstTask = tasks[0];
                if (firstTask) {
                    taskId = firstTask.id;
                    console.log(`Using first task: ${firstTask.title} (ID: ${taskId})`);
                } else {
                    console.error('❌ No tasks available for timer test');
                    return;
                }
            }
            
            console.log(`Starting timer for task ${taskId}...`);
            await startTimer(taskId);
            
            setTimeout(async () => {
                console.log(`Stopping timer for task ${taskId}...`);
                await stopTimer(taskId);
                console.log('✅ Timer test completed');
            }, 3000); // Stop after 3 seconds
            
        } catch (error) {
            console.error('❌ Timer test failed:', error);
        }
    };
    
    window.debugTimer = async (taskId) => {
        console.log('🔍 Debugging timer state...');
        try {
            if (!taskId) {
                const firstTask = tasks[0];
                if (firstTask) {
                    taskId = firstTask.id;
                } else {
                    console.error('❌ No tasks available');
                    return;
                }
            }
            
            // Check local state
            const localTask = tasks.find(t => t.id === taskId);
            console.log('📱 Local task state:', {
                id: localTask?.id,
                title: localTask?.title,
                isTimerRunning: localTask?.isTimerRunning,
                timerStart: localTask?.timerStart
            });
            
            // Check database state
            if (window.firebaseRESTIntegration) {
                const dbTasks = await window.firebaseRESTIntegration.loadData('tasks');
                const dbTask = dbTasks.find(t => t.id === taskId);
                console.log('🗄️ Database task state:', {
                    id: dbTask?.id,
                    title: dbTask?.title,
                    isTimerRunning: dbTask?.isTimerRunning,
                    timerStart: dbTask?.timerStart
                });
            }
            
            console.log('⏰ Active timer:', activeTimer);
            
        } catch (error) {
            console.error('❌ Debug failed:', error);
        }
    };
    
    window.testTimerButton = async (taskId) => {
        console.log('🧪 Testing timer button functionality...');
        try {
            if (!taskId) {
                const firstTask = tasks[0];
                if (firstTask) {
                    taskId = firstTask.id;
                    console.log(`Using first task: ${firstTask.title} (ID: ${taskId})`);
                } else {
                    console.error('❌ No tasks available for timer test');
                    return;
                }
            }
            
            console.log(`🔄 Simulating timer button click for task ${taskId}`);
            
            // Simulate the timer button click logic
            if (window.firebaseRESTIntegration) {
                console.log(`📡 Loading current tasks from database...`);
                const currentTasks = await window.firebaseRESTIntegration.loadData('tasks');
                console.log(`📋 Loaded ${currentTasks.length} tasks from database`);
                
                const currentTask = currentTasks.find(t => t.id === taskId);
                console.log(`🎯 Found task:`, {
                    id: currentTask?.id,
                    title: currentTask?.title,
                    isTimerRunning: currentTask?.isTimerRunning
                });
                
                if (currentTask && currentTask.isTimerRunning) {
                    console.log(`🛑 Would stop timer for task ${taskId}`);
                    // await stopTimer(taskId);
                } else {
                    console.log(`▶️ Would start timer for task ${taskId}`);
                    // await startTimer(taskId);
                }
            } else {
                console.error('❌ Firebase integration not available');
            }
            
        } catch (error) {
            console.error('❌ Timer button test failed:', error);
        }
    };
    
    window.fixTaskProperties = async () => {
        console.log('🔧 Fixing task properties...');
        try {
            if (!window.firebaseRESTIntegration) {
                console.error('❌ Firebase integration not available');
                return;
            }
            
            const existingTasks = await window.firebaseRESTIntegration.loadData('tasks');
            let needsUpdate = false;
            
            const fixedTasks = existingTasks.map(task => {
                const fixedTask = { ...task };
                
                // Initialize missing properties
                if (!fixedTask.timeEntries) {
                    fixedTask.timeEntries = [];
                    needsUpdate = true;
                    console.log(`📝 Fixed timeEntries for task: ${fixedTask.title}`);
                }
                
                if (fixedTask.timeSpent === undefined) {
                    fixedTask.timeSpent = 0;
                    needsUpdate = true;
                    console.log(`📝 Fixed timeSpent for task: ${fixedTask.title}`);
                }
                
                if (fixedTask.isTimerRunning === undefined) {
                    fixedTask.isTimerRunning = false;
                    needsUpdate = true;
                    console.log(`📝 Fixed isTimerRunning for task: ${fixedTask.title}`);
                }
                
                if (fixedTask.timerStart === undefined) {
                    fixedTask.timerStart = null;
                    needsUpdate = true;
                    console.log(`📝 Fixed timerStart for task: ${fixedTask.title}`);
                }
                
                return fixedTask;
            });
            
            if (needsUpdate) {
                console.log('💾 Saving fixed tasks to database...');
                await window.firebaseRESTIntegration.saveData('tasks', fixedTasks);
                tasks = fixedTasks;
                console.log('✅ Task properties fixed and saved');
            } else {
                console.log('✅ All tasks already have correct properties');
            }
            
        } catch (error) {
            console.error('❌ Error fixing task properties:', error);
        }
    };
    
    window.testBacklogOperations = async () => {
        console.log('🧪 Testing backlog operations...');
        try {
            if (!window.firebaseRESTIntegration) {
                console.error('❌ Firebase integration not available');
                return;
            }
            
            // Test adding a backlog item
            console.log('📝 Testing backlog item creation...');
            const testBacklogItem = {
                id: Date.now(),
                text: 'Test Backlog Item',
                projectId: currentProject ? currentProject.id : null,
                createdAt: new Date().toISOString(),
                status: 'Backlog'
            };
            
            const existingBacklogItems = await window.firebaseRESTIntegration.loadData('backlogItems');
            const updatedBacklogItems = [...existingBacklogItems, testBacklogItem];
            
            await window.firebaseRESTIntegration.saveData('backlogItems', updatedBacklogItems);
            console.log('✅ Test backlog item created');
            
            // Test converting to task
            console.log('🔄 Testing backlog to task conversion...');
            await convertBacklogToTask(testBacklogItem.id);
            console.log('✅ Test backlog item converted to task');
            
        } catch (error) {
            console.error('❌ Backlog operations test failed:', error);
        }
    };
    
    window.debugBacklogButtons = () => {
        console.log('🔍 Debugging backlog buttons...');
        const backlogItems = document.querySelectorAll('.backlog-item');
        console.log(`📋 Found ${backlogItems.length} backlog items in DOM`);
        
        backlogItems.forEach((item, index) => {
            const itemId = item.dataset.itemId;
            const convertBtn = item.querySelector('.convert-btn');
            const deleteBtn = item.querySelector('.delete-btn');
            
            console.log(`📝 Backlog item ${index + 1}:`, {
                itemId: itemId,
                hasConvertBtn: !!convertBtn,
                hasDeleteBtn: !!deleteBtn,
                convertBtnDataId: convertBtn?.dataset.itemId,
                deleteBtnDataId: deleteBtn?.dataset.itemId
            });
        });
        
        // Check if event listeners are attached
        const allConvertBtns = document.querySelectorAll('.backlog-action-btn.convert-btn');
        const allDeleteBtns = document.querySelectorAll('.backlog-action-btn.delete-btn');
        
        console.log(`🔘 Convert buttons found: ${allConvertBtns.length}`);
        console.log(`🔘 Delete buttons found: ${allDeleteBtns.length}`);
    };
    
    window.debugSidebar = () => {
        console.log('🔍 Debugging sidebar...');
        const sidebar = document.querySelector('.sidebar');
        const sidebarToggle = document.getElementById('sidebarToggle');
        
        console.log('📱 Sidebar elements:', {
            sidebar: !!sidebar,
            sidebarToggle: !!sidebarToggle,
            sidebarCollapsed: sidebar?.classList.contains('collapsed')
        });
        
        if (sidebar) {
            console.log('📏 Sidebar styles:', {
                width: getComputedStyle(sidebar).width,
                display: getComputedStyle(sidebar).display,
                visibility: getComputedStyle(sidebar).visibility
            });
        }
        
        if (sidebarToggle) {
            const icon = sidebarToggle.querySelector('i');
            console.log('🔘 Toggle button:', {
                icon: icon?.className,
                title: sidebarToggle.title
            });
        }
        
        // Test toggle functionality
        if (sidebar && sidebarToggle) {
            console.log('🧪 Testing sidebar toggle...');
            const wasCollapsed = sidebar.classList.contains('collapsed');
            sidebarToggle.click();
            setTimeout(() => {
                const isCollapsed = sidebar.classList.contains('collapsed');
                console.log(`✅ Toggle test: ${wasCollapsed ? 'collapsed' : 'expanded'} → ${isCollapsed ? 'collapsed' : 'expanded'}`);
            }, 100);
        }
    };
    
    window.debugTimesheetReview = async () => {
        console.log('🔍 Debugging timesheet review...');
        
        // Check Firebase integration availability
        console.log('📋 Firebase integration available:', !!window.firebaseRESTIntegration);
        
        if (!window.firebaseRESTIntegration) {
            console.error('❌ Firebase integration not available!');
            return;
        }
        
        // Test Firebase connection
        try {
            console.log('📋 Testing Firebase connection...');
            const reviews = await window.firebaseRESTIntegration.loadData('timesheetReviews');
            console.log('📋 All reviews from Firebase:', reviews);
        } catch (error) {
            console.error('❌ Error loading reviews from Firebase:', error);
        }
        
        // Test current project context
        console.log('📋 Current project:', currentProject);
        
        // Test date handling
        const today = new Date();
        console.log('📋 Today\'s date:', today);
        
        // Test loading existing review
        try {
            const existingReview = await loadExistingReview(today);
            console.log('📋 Existing review for today:', existingReview);
        } catch (error) {
            console.error('❌ Error loading existing review:', error);
        }
        
        // Test saving a review
        try {
            console.log('📋 Testing review save...');
            const testReview = {
                id: Date.now(),
                text: 'Test review from debug function',
                date: today.toISOString(),
                projectId: currentProject ? currentProject.id : null,
                createdAt: new Date().toISOString()
            };
            
            const savedReviews = await window.firebaseRESTIntegration.loadData('timesheetReviews') || [];
            savedReviews.push(testReview);
            await window.firebaseRESTIntegration.saveData('timesheetReviews', savedReviews);
            console.log('✅ Test review saved successfully');
        } catch (error) {
            console.error('❌ Error saving test review:', error);
        }
    };
    
    window.debugFirebaseConnection = async () => {
        console.log('🔍 Debugging Firebase connection...');
        
        if (!window.firebaseRESTIntegration) {
            console.error('❌ Firebase integration not available!');
            return;
        }
        
        try {
            console.log('📋 Testing Firebase connection...');
            const result = await window.firebaseRESTIntegration.testConnection();
            console.log('📋 Firebase connection test result:', result);
        } catch (error) {
            console.error('❌ Firebase connection test failed:', error);
        }
        
        try {
            console.log('📋 Testing data save...');
            const testData = { test: 'data', timestamp: Date.now() };
            await window.firebaseRESTIntegration.saveData('test', [testData]);
            console.log('✅ Test data saved successfully');
            
            console.log('📋 Testing data load...');
            const loadedData = await window.firebaseRESTIntegration.loadData('test');
            console.log('📋 Test data loaded:', loadedData);
        } catch (error) {
            console.error('❌ Firebase data operations failed:', error);
        }
    };
    
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
        document.getElementById('reviewsView').style.display = 'none';
        document.getElementById('boardViewBtn').classList.add('active');
        document.getElementById('timesheetViewBtn').classList.remove('active');
        document.getElementById('reviewsViewBtn').classList.remove('active');
    };

    document.getElementById('timesheetViewBtn').onclick = () => {
        document.getElementById('boardView').style.display = 'none';
        document.getElementById('timesheetView').style.display = 'block';
        document.getElementById('reviewsView').style.display = 'none';
        document.getElementById('boardViewBtn').classList.remove('active');
        document.getElementById('timesheetViewBtn').classList.add('active');
        document.getElementById('reviewsViewBtn').classList.remove('active');
        renderTimesheet();
    };

    document.getElementById('reviewsViewBtn').onclick = () => {
        document.getElementById('boardView').style.display = 'none';
        document.getElementById('timesheetView').style.display = 'none';
        document.getElementById('reviewsView').style.display = 'block';
        document.getElementById('boardViewBtn').classList.remove('active');
        document.getElementById('timesheetViewBtn').classList.remove('active');
        document.getElementById('reviewsViewBtn').classList.add('active');
        renderReviewsView();
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
                <button class="backlog-action-btn convert-btn" data-item-id="${item.id}" title="Convert to Task">
                    <i class="fas fa-arrow-right"></i>
                </button>
                <button class="backlog-action-btn delete-btn" data-item-id="${item.id}" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        
        // Add event listeners for the buttons
        const convertBtn = backlogItemElement.querySelector('.convert-btn');
        const deleteBtn = backlogItemElement.querySelector('.delete-btn');
        
        convertBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const itemId = parseInt(e.target.closest('button').dataset.itemId);
            console.log(`🔄 Convert button clicked for backlog item ${itemId}`);
            try {
                await convertBacklogToTask(itemId);
            } catch (error) {
                console.error('❌ Error converting backlog item:', error);
                showToast('Error converting backlog item', 'error', 3000);
            }
        });
        
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const itemId = parseInt(e.target.closest('button').dataset.itemId);
            console.log(`🗑️ Delete button clicked for backlog item ${itemId}`);
            try {
                await deleteBacklogItem(itemId);
            } catch (error) {
                console.error('❌ Error deleting backlog item:', error);
                showToast('Error deleting backlog item', 'error', 3000);
            }
        });
        
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
async function convertBacklogToTask(backlogItemId) {
    console.log(`🔄 Converting backlog item ${backlogItemId} to task`);
    
    // Check if Firebase integration is available
    if (!window.firebaseRESTIntegration) {
        console.error('❌ Firebase integration not available');
        throw new Error('Firebase integration not available. Please refresh the page.');
    }
    
    try {
        // Get current data from database
        const [existingTasks, existingBacklogItems] = await Promise.all([
            window.firebaseRESTIntegration.loadData('tasks'),
            window.firebaseRESTIntegration.loadData('backlogItems')
        ]);
        
        const backlogItem = existingBacklogItems.find(item => item.id === backlogItemId);
        if (backlogItem) {
            console.log(`📝 Converting backlog item: ${backlogItem.text}`);
            
            // Get the highest position number for "To Do" status
            const maxPosition = Math.max(0, ...existingTasks
                .filter(t => t.status === 'To Do')
                .map(t => t.position || 0));
            
            // Create a new task from the backlog item
            const newTask = {
                id: Date.now(),
                title: backlogItem.text,
                status: 'To Do', // Default status when converting
                projectId: backlogItem.projectId,
                position: maxPosition + 1000,
                createdAt: new Date().toISOString(),
                timeSpent: 0,
                timeEntries: [],
                isTimerRunning: false,
                timerStart: null,
                dueDate: null
            };
            
            // Add the task to the tasks array
            const updatedTasks = [...existingTasks, newTask];
            
            // Remove the backlog item
            const updatedBacklogItems = existingBacklogItems.filter(item => item.id !== backlogItemId);
            
            // Save both updated arrays to database
            console.log(`💾 Saving updated tasks and backlog items to Firebase...`);
            await Promise.all([
                window.firebaseRESTIntegration.saveData('tasks', updatedTasks),
                window.firebaseRESTIntegration.saveData('backlogItems', updatedBacklogItems)
            ]);
            
            // Update local arrays and re-render
            tasks = updatedTasks;
            backlogItems = updatedBacklogItems;
            renderTasks();
            renderBacklogItems();
            
            console.log(`✅ Backlog item converted to task successfully`);
            showToast('Backlog item converted to task successfully!', 'success', 3000);
        } else {
            console.error(`❌ Backlog item with ID ${backlogItemId} not found`);
        }
    } catch (error) {
        console.error('❌ Error converting backlog item to task:', error);
        throw error;
    }
}

// Delete backlog item
async function deleteBacklogItem(backlogItemId) {
    console.log(`🗑️ Deleting backlog item ${backlogItemId}`);
    
    // Check if Firebase integration is available
    if (!window.firebaseRESTIntegration) {
        console.error('❌ Firebase integration not available');
        throw new Error('Firebase integration not available. Please refresh the page.');
    }
    
    try {
        // Get current backlog items from database
        const existingBacklogItems = await window.firebaseRESTIntegration.loadData('backlogItems');
        const backlogItem = existingBacklogItems.find(item => item.id === backlogItemId);
        
        if (backlogItem) {
            console.log(`📝 Deleting backlog item: ${backlogItem.text}`);
            
            // Remove the backlog item
            const updatedBacklogItems = existingBacklogItems.filter(item => item.id !== backlogItemId);
            
            // Save updated array to database
            console.log(`💾 Saving updated backlog items to Firebase...`);
            await window.firebaseRESTIntegration.saveData('backlogItems', updatedBacklogItems);
            
            // Update local array and re-render
            backlogItems = updatedBacklogItems;
            renderBacklogItems();
            
            console.log(`✅ Backlog item deleted successfully`);
            showToast('Backlog item deleted successfully!', 'success', 3000);
        } else {
            console.error(`❌ Backlog item with ID ${backlogItemId} not found`);
        }
    } catch (error) {
        console.error('❌ Error deleting backlog item:', error);
        throw error;
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
async function startTimer(taskId) {
    console.log(`▶️ Starting timer for task ${taskId}`);
    
    // Check if Firebase integration is available
    if (!window.firebaseRESTIntegration) {
        console.error('❌ Firebase integration not available');
        throw new Error('Firebase integration not available. Please refresh the page.');
    }
    
    try {
        // Stop any running timer first
        if (activeTimer) {
            console.log(`⏹️ Stopping previous timer for task ${activeTimer}`);
            await stopTimer(activeTimer);
        }

        // Get current tasks from database
        const existingTasks = await window.firebaseRESTIntegration.loadData('tasks');
        const taskIndex = existingTasks.findIndex(t => t.id === taskId);
        
        if (taskIndex !== -1) {
            const task = existingTasks[taskIndex];
            
            // Initialize missing properties if they don't exist
            if (!task.timeEntries) {
                task.timeEntries = [];
                console.log(`📝 Initialized timeEntries array for task ${taskId}`);
            }
            if (task.timeSpent === undefined) {
                task.timeSpent = 0;
                console.log(`📝 Initialized timeSpent for task ${taskId}`);
            }
            
            // Update task with timer state
            task.isTimerRunning = true;
            task.timerStart = new Date().getTime();
            task.warningShown = false; // Reset warning flag for new timer session
            activeTimer = taskId;
            
            // Update the task in the array
            const updatedTasks = [...existingTasks];
            updatedTasks[taskIndex] = task;
            
            // Save updated tasks directly to database
            console.log(`💾 Saving updated task with timer state to Firebase...`);
            await window.firebaseRESTIntegration.saveData('tasks', updatedTasks);
            console.log(`✅ Timer started and data saved to database successfully`);
            
            // Update local array and render
            tasks = updatedTasks;
            updateTimerDisplay(taskId);
            renderTasks();
            
            // Show toast message
            showToast(`Timer started for: ${task.title}`, 'success', 3000);
        } else {
            console.error(`❌ Task with ID ${taskId} not found`);
        }
    } catch (error) {
        console.error('❌ Error starting timer:', error);
        throw error;
    }
}

async function stopTimer(taskId) {
    console.log(`⏹️ Stopping timer for task ${taskId}`);
    
    // Check if Firebase integration is available
    if (!window.firebaseRESTIntegration) {
        console.error('❌ Firebase integration not available');
        throw new Error('Firebase integration not available. Please refresh the page.');
    }
    
    try {
        // Get current tasks from database
        const existingTasks = await window.firebaseRESTIntegration.loadData('tasks');
        const taskIndex = existingTasks.findIndex(t => t.id === taskId);
        
        if (taskIndex !== -1 && existingTasks[taskIndex].isTimerRunning) {
            const task = existingTasks[taskIndex];
            const endTime = new Date().getTime();
            const duration = (endTime - task.timerStart) / 1000; // Convert to seconds
            
            console.log(`⏱️ Timer duration: ${duration} seconds`);
            
            // Initialize timeEntries if it doesn't exist
            if (!task.timeEntries) {
                task.timeEntries = [];
                console.log(`📝 Initialized timeEntries array for task ${taskId}`);
            }
            
            // Add time entry
            const timeEntry = {
                date: new Date().toISOString(),
                duration: duration
            };
            task.timeEntries.push(timeEntry);

            // Update total time spent
            task.timeSpent += duration / 3600; // Convert seconds to hours
            
            // Reset timer
            task.isTimerRunning = false;
            task.timerStart = null;
            task.warningShown = false; // Reset warning flag
            activeTimer = null;
            
            // Update the task in the array
            const updatedTasks = [...existingTasks];
            updatedTasks[taskIndex] = task;
            
            // Save updated tasks directly to database
            console.log(`💾 Saving updated task with timer data to Firebase...`);
            await window.firebaseRESTIntegration.saveData('tasks', updatedTasks);
            console.log(`✅ Timer stopped and data saved to database successfully`);
            
            // Update local array and render
            tasks = updatedTasks;
            renderTasks();
            
            // Show toast message
            showToast(`Timer stopped: ${formatTime(duration)}`, 'success', 3000);
        } else {
            console.log(`ℹ️ Task ${taskId} not found or timer not running`);
        }
    } catch (error) {
        console.error('❌ Error stopping timer:', error);
        throw error;
    }
}

function updateTimerDisplay(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (task && task.isTimerRunning) {
        const currentTime = new Date().getTime();
        const elapsedSeconds = Math.floor((currentTime - task.timerStart) / 1000);
        
        // Auto-stop timer if it's been running for more than 3 hours (10800 seconds)
        if (elapsedSeconds > 10800) {
            showToast(`Timer auto-stopped for: ${task.title} (3+ hours)`, 'warning', 5000);
            stopTimer(taskId);
            return;
        }
        
        // Show warning when approaching 3-hour limit (at 2.5 hours)
        if (elapsedSeconds > 9000 && elapsedSeconds <= 10800) {
            // Only show this warning once per timer session
            if (!task.warningShown) {
                showToast(`Warning: Timer for "${task.title}" has been running for over 2.5 hours`, 'warning', 4000);
                task.warningShown = true;
            }
        }
        
        const timerDisplay = document.getElementById(`timer-${taskId}`);
        if (timerDisplay) {
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
let isUserTypingReview = false;
let isSortedByDeadline = false;

// Make isUserTypingReview globally accessible for Firebase integration
window.isUserTypingReview = isUserTypingReview;

// Reviews View Functions
let currentWeekStart = null;

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

    // Check if review section already exists and user is typing
    const existingReviewRow = timesheetBody.querySelector('.review-row');
    const existingTextarea = document.getElementById('timesheetReview');
    
    if (existingReviewRow && existingTextarea && (isUserTypingReview || existingTextarea.value.trim())) {
        // User is typing or has content, preserve the existing review section
        console.log('📝 Preserving existing review section (user is typing or has content)');
        
        // Re-attach event listeners to the existing textarea
        existingTextarea.addEventListener('input', () => {
            isUserTypingReview = true;
            window.isUserTypingReview = true;
            console.log('📝 User is typing in existing review field');
        });
        
        existingTextarea.addEventListener('blur', () => {
            setTimeout(() => {
                isUserTypingReview = false;
                window.isUserTypingReview = false;
                console.log('📝 User stopped typing in existing review field');
            }, 1000);
        });
        
        timesheetBody.appendChild(existingReviewRow);
    } else {
        // Create new review section
        const reviewRow = document.createElement('tr');
        reviewRow.className = 'review-row';
        
        // Create review section immediately with loading state
        reviewRow.innerHTML = `
            <td colspan="6">
                <div class="review-section">
                    <label for="timesheetReview">Review:</label>
                    <textarea id="timesheetReview" placeholder="Loading existing review..."></textarea>
                    <button id="saveReviewBtn" class="btn-save-review">Save Review</button>
                </div>
            </td>
        `;
        
        // Add event listener for save review button immediately
        const saveReviewBtn = reviewRow.querySelector('#saveReviewBtn');
        if (saveReviewBtn) {
            saveReviewBtn.addEventListener('click', saveTimesheetReview);
        }
        
        // Add event listeners to track user typing
        const textarea = reviewRow.querySelector('#timesheetReview');
        if (textarea) {
            textarea.addEventListener('input', () => {
                isUserTypingReview = true;
                window.isUserTypingReview = true;
                console.log('📝 User is typing in review field');
            });
            
            textarea.addEventListener('blur', () => {
                // Reset flag after a short delay to allow for async operations
                setTimeout(() => {
                    isUserTypingReview = false;
                    window.isUserTypingReview = false;
                    console.log('📝 User stopped typing in review field');
                }, 1000);
            });
        }
        
        timesheetBody.appendChild(reviewRow);
        
        // Load existing review for the selected date (async) and update without recreating elements
        loadExistingReview(selectedDate).then(existingReview => {
            const textarea = document.getElementById('timesheetReview');
            const button = document.getElementById('saveReviewBtn');
            
            if (textarea && button) {
                // Only update if textarea is empty (user hasn't started typing)
                if (!textarea.value.trim()) {
                    textarea.value = existingReview ? existingReview.text : '';
                    textarea.placeholder = "Add your review, notes, or observations about today's work...";
                    button.textContent = existingReview ? 'Update Review' : 'Save Review';
                }
            }
        }).catch(error => {
            console.error('❌ Error loading existing review:', error);
            const textarea = document.getElementById('timesheetReview');
            const button = document.getElementById('saveReviewBtn');
            
            if (textarea && button) {
                textarea.placeholder = "Add your review, notes, or observations about today's work...";
                button.textContent = 'Save Review';
            }
        });
    }
}

// Load existing review function
async function loadExistingReview(selectedDate) {
    try {
        // Check if Firebase integration is available
        if (!window.firebaseRESTIntegration) {
            console.error('❌ Firebase integration not available');
            return null;
        }
        
        console.log('📋 Loading existing review for date:', selectedDate);
        const savedReviews = await window.firebaseRESTIntegration.loadData('timesheetReviews') || [];
        const currentProjectId = currentProject ? currentProject.id : null;
        
        console.log('📋 All saved reviews:', savedReviews);
        console.log('📋 Current project ID:', currentProjectId);
        
        const foundReview = savedReviews.find(review => {
            const reviewDate = new Date(review.date);
            const selectedDateOnly = new Date(selectedDate);
            reviewDate.setHours(0, 0, 0, 0);
            selectedDateOnly.setHours(0, 0, 0, 0);
            const dateMatch = reviewDate.getTime() === selectedDateOnly.getTime();
            const projectMatch = review.projectId === currentProjectId;
            
            console.log('📋 Checking review:', {
                reviewDate: reviewDate.toDateString(),
                selectedDate: selectedDateOnly.toDateString(),
                dateMatch,
                projectMatch,
                reviewProjectId: review.projectId
            });
            
            return dateMatch && projectMatch;
        });
        
        console.log('📋 Found review:', foundReview);
        return foundReview;
    } catch (error) {
        console.error('❌ Error loading existing review:', error);
        return null;
    }
}

// Save timesheet review function
async function saveTimesheetReview() {
    try {
        console.log('💾 Starting to save timesheet review...');
        
        // Check if Firebase integration is available
        if (!window.firebaseRESTIntegration) {
            console.error('❌ Firebase integration not available');
            showToast('Firebase integration not available. Please refresh the page.', 'error');
            return;
        }
        
        const reviewText = document.getElementById('timesheetReview').value;
        const selectedDate = document.getElementById('timesheetDate').valueAsDate;
        
        console.log('💾 Saving timesheet review:', { 
            reviewText: reviewText?.substring(0, 50) + '...', 
            selectedDate,
            currentProject: currentProject?.name || 'All Tasks'
        });
        
        if (reviewText.trim()) {
            // Create review object
            const review = {
                id: Date.now(),
                text: reviewText,
                date: selectedDate.toISOString(),
                projectId: currentProject ? currentProject.id : null,
                createdAt: new Date().toISOString()
            };
            
            console.log('💾 Review object created:', review);
            
            // Load existing reviews from Firebase
            console.log('💾 Loading existing reviews from Firebase...');
            const savedReviews = await window.firebaseRESTIntegration.loadData('timesheetReviews') || [];
            console.log('💾 Existing reviews loaded:', savedReviews.length, 'reviews');
            
            // Check if a review already exists for this date and project
            const existingReviewIndex = savedReviews.findIndex(r => {
                const reviewDate = new Date(r.date);
                const selectedDateOnly = new Date(selectedDate);
                reviewDate.setHours(0, 0, 0, 0);
                selectedDateOnly.setHours(0, 0, 0, 0);
                return reviewDate.getTime() === selectedDateOnly.getTime() && 
                       r.projectId === review.projectId;
            });
            
            console.log('💾 Existing review index:', existingReviewIndex);
            
            if (existingReviewIndex !== -1) {
                // Update existing review
                savedReviews[existingReviewIndex] = review;
                console.log('💾 Updating existing review');
            } else {
                // Add new review
                savedReviews.push(review);
                console.log('💾 Adding new review');
            }
            
            // Save to Firebase
            console.log('💾 Saving to Firebase...');
            await window.firebaseRESTIntegration.saveData('timesheetReviews', savedReviews);
            console.log('💾 Review saved to Firebase successfully');
            
            // Update button text to show it was saved
            const saveBtn = document.getElementById('saveReviewBtn');
            if (saveBtn) {
                saveBtn.textContent = 'Review Saved!';
                saveBtn.style.backgroundColor = '#28a745';
                setTimeout(() => {
                    saveBtn.textContent = 'Update Review';
                    saveBtn.style.backgroundColor = '';
                }, 2000);
            }
            
            showToast('Review saved successfully!', 'success');
        } else {
            // Show error message only if no text entered
            showToast('Please enter a review before saving.', 'error');
        }
    } catch (error) {
        console.error('❌ Error saving timesheet review:', error);
        console.error('❌ Error details:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        showToast(`Failed to save review: ${error.message}`, 'error');
    }
}

// Add backlog item function
async function addBacklogItem(status) {
    console.log(`📝 Adding backlog item to ${status}`);
    
    const input = document.querySelector(`.backlog-input[data-status="${status}"]`);
    const itemText = input.value.trim();
    
    if (itemText) {
        // Check if Firebase integration is available
        if (!window.firebaseRESTIntegration) {
            console.error('❌ Firebase integration not available');
            throw new Error('Firebase integration not available. Please refresh the page.');
        }
        
        try {
            // Get current backlog items from database
            const existingBacklogItems = await window.firebaseRESTIntegration.loadData('backlogItems');
            
            const backlogItem = {
                id: Date.now(),
                text: itemText,
                projectId: currentProject ? currentProject.id : null,
                createdAt: new Date().toISOString(),
                status: status
            };
            
            console.log(`📝 Creating backlog item: ${itemText}`);
            
            // Add the new backlog item to the array
            const updatedBacklogItems = [...existingBacklogItems, backlogItem];
            
            // Save updated array to database
            console.log(`💾 Saving updated backlog items to Firebase...`);
            await window.firebaseRESTIntegration.saveData('backlogItems', updatedBacklogItems);
            
            // Update local array and re-render
            backlogItems = updatedBacklogItems;
            renderBacklogItems();
            
            // Show toast message with project context
            const projectName = currentProject ? currentProject.name : 'All Tasks';
            showToast(`Backlog item added to ${projectName}: ${itemText}`, 'success', 3000);
            
            // Clear the input field
            input.value = '';
            
            // Focus back to the input for quick adding
            input.focus();
            
            console.log(`✅ Backlog item added successfully`);
        } catch (error) {
            console.error('❌ Error adding backlog item:', error);
            throw error;
        }
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
    
    console.log('🔧 Setting up sidebar toggle...');
    console.log('📱 Toggle button:', !!sidebarToggle);
    console.log('📱 Sidebar element:', !!sidebar);
    
    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log('🖱️ Sidebar toggle clicked');
            
            sidebar.classList.toggle('collapsed');
            const isCollapsed = sidebar.classList.contains('collapsed');
            console.log('🔄 Sidebar toggled, collapsed:', isCollapsed);
            
            // Update button icon
            const icon = sidebarToggle.querySelector('i');
            if (icon) {
                icon.className = isCollapsed ? 'fas fa-bars' : 'fas fa-chevron-left';
                sidebarToggle.title = isCollapsed ? 'Show Sidebar' : 'Hide Sidebar';
            }
        });
        
        // Initial icon update
        const icon = sidebarToggle.querySelector('i');
        if (icon) {
            icon.className = 'fas fa-chevron-left';
            sidebarToggle.title = 'Hide Sidebar';
        }
    }
}

function setupSortButton() {
    const sortBtn = document.getElementById('sortByDeadlineBtn');
    
    if (sortBtn) {
        sortBtn.addEventListener('click', () => {
            console.log('🔄 Toggling sort by deadline...');
            isSortedByDeadline = !isSortedByDeadline;
            
            // Update button appearance
            if (isSortedByDeadline) {
                sortBtn.classList.add('active');
                sortBtn.querySelector('i').className = 'fas fa-sort-amount-up';
                sortBtn.querySelector('span').textContent = 'Sort by Position';
                sortBtn.title = 'Sort tasks by position (default)';
                showToast('Tasks sorted by deadline', 'info', 2000);
            } else {
                sortBtn.classList.remove('active');
                sortBtn.querySelector('i').className = 'fas fa-sort-amount-down';
                sortBtn.querySelector('span').textContent = 'Sort by Deadline';
                sortBtn.title = 'Sort tasks by deadline';
                showToast('Tasks sorted by position', 'info', 2000);
            }
            
            // Re-render tasks with new sorting
            renderTasks();
        });
        
        console.log('✅ Sort button setup complete');
    } else {
        console.error('❌ Sort button not found');
    }
}

// Reviews View Functions
function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    const weekStart = new Date(d.setDate(diff));
    weekStart.setHours(0, 0, 0, 0);
    return weekStart;
}

function getWeekEnd(weekStart) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    return weekEnd;
}

function formatWeekDisplay(weekStart) {
    const weekEnd = getWeekEnd(weekStart);
    const startStr = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endStr = weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `Week of ${startStr} - ${endStr}`;
}

async function renderReviewsView() {
    console.log('📋 Rendering reviews view...');
    
    // Initialize current week if not set
    if (!currentWeekStart) {
        currentWeekStart = getWeekStart(new Date());
    }
    
    // Update week display
    document.getElementById('currentWeekDisplay').textContent = formatWeekDisplay(currentWeekStart);
    
    // Load and display weekly review
    await renderWeeklyReview();
    
    // Load and display daily reviews
    await renderDailyReviews();
    
    // Setup navigation buttons
    setupWeekNavigation();
    
    // Setup weekly review button
    setupWeeklyReviewButton();
}

async function renderWeeklyReview() {
    const container = document.getElementById('weeklyReviewContainer');
    const weekEnd = getWeekEnd(currentWeekStart);
    
    try {
        // Load weekly reviews from Firebase
        const weeklyReviews = await firebaseIntegration.loadData('weeklyReviews') || [];
        
        // Find weekly review for current week and project
        const currentProjectId = currentProject ? currentProject.id : null;
        const weeklyReview = weeklyReviews.find(review => {
            const reviewDate = new Date(review.weekStart);
            const isSameWeek = reviewDate.getTime() === currentWeekStart.getTime();
            const isSameProject = review.projectId === currentProjectId;
            return isSameWeek && isSameProject;
        });
        
        if (weeklyReview) {
            container.innerHTML = `
                <div class="review-content">
                    <div class="review-text">${weeklyReview.text}</div>
                    <div class="review-meta">
                        <span>Created: ${new Date(weeklyReview.createdAt).toLocaleDateString()}</span>
                        <div class="review-actions">
                            <button onclick="editWeeklyReview('${weeklyReview.id}')">Edit</button>
                            <button onclick="deleteWeeklyReview('${weeklyReview.id}')">Delete</button>
                        </div>
                    </div>
                </div>
            `;
            container.classList.add('has-content');
        } else {
            container.innerHTML = '<div class="no-reviews">No weekly review for this week yet. Click "Add Weekly Review" to create one.</div>';
            container.classList.remove('has-content');
        }
    } catch (error) {
        console.error('❌ Error loading weekly review:', error);
        container.innerHTML = '<div class="no-reviews">Error loading weekly review.</div>';
        container.classList.remove('has-content');
    }
}

async function renderDailyReviews() {
    const container = document.getElementById('dailyReviewsContainer');
    const weekEnd = getWeekEnd(currentWeekStart);
    
    try {
        // Load daily reviews from Firebase
        const dailyReviews = await firebaseIntegration.loadData('timesheetReviews') || [];
        const currentProjectId = currentProject ? currentProject.id : null;
        
        // Filter reviews for current week and project
        const weekReviews = dailyReviews.filter(review => {
            const reviewDate = new Date(review.date);
            const isInWeek = reviewDate >= currentWeekStart && reviewDate <= weekEnd;
            const isSameProject = review.projectId === currentProjectId;
            return isInWeek && isSameProject;
        });
        
        if (weekReviews.length > 0) {
            // Sort by date (newest first)
            weekReviews.sort((a, b) => new Date(b.date) - new Date(a.date));
            
            container.innerHTML = weekReviews.map(review => {
                const reviewDate = new Date(review.date);
                const projectName = review.projectId ? projects.find(p => p.id === review.projectId)?.name : 'No Project';
                
                return `
                    <div class="daily-review-card">
                        <div class="daily-review-date">${reviewDate.toLocaleDateString('en-US', { 
                            weekday: 'long', 
                            year: 'numeric', 
                            month: 'long', 
                            day: 'numeric' 
                        })}</div>
                        <div class="daily-review-text">${review.text}</div>
                        <div class="daily-review-project">Project: ${projectName}</div>
                    </div>
                `;
            }).join('');
        } else {
            container.innerHTML = '<div class="no-reviews">No daily reviews for this week yet.</div>';
        }
    } catch (error) {
        console.error('❌ Error loading daily reviews:', error);
        container.innerHTML = '<div class="no-reviews">Error loading daily reviews.</div>';
    }
}

function setupWeekNavigation() {
    const prevBtn = document.getElementById('prevWeekBtn');
    const nextBtn = document.getElementById('nextWeekBtn');
    
    prevBtn.onclick = () => {
        currentWeekStart.setDate(currentWeekStart.getDate() - 7);
        renderReviewsView();
    };
    
    nextBtn.onclick = () => {
        currentWeekStart.setDate(currentWeekStart.getDate() + 7);
        renderReviewsView();
    };
}

function setupWeeklyReviewButton() {
    const addBtn = document.getElementById('addWeeklyReviewBtn');
    
    addBtn.onclick = () => {
        openWeeklyReviewModal();
    };
}

function openWeeklyReviewModal() {
    // Create modal for weekly review
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    
    const weekEnd = getWeekEnd(currentWeekStart);
    const weekDisplay = formatWeekDisplay(currentWeekStart);
    
    modal.innerHTML = `
        <div class="modal-content">
            <h2>Weekly Review - ${weekDisplay}</h2>
            <form id="weeklyReviewForm">
                <div class="form-group">
                    <label for="weeklyReviewText">Weekly Review:</label>
                    <textarea id="weeklyReviewText" placeholder="Reflect on this week's accomplishments, challenges, and goals for next week..." rows="8"></textarea>
                </div>
                <div class="form-actions">
                    <button type="button" id="cancelWeeklyReviewBtn" class="btn-secondary">Cancel</button>
                    <button type="submit" class="btn-primary">Save Weekly Review</button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Setup form submission
    document.getElementById('weeklyReviewForm').onsubmit = async (e) => {
        e.preventDefault();
        const text = document.getElementById('weeklyReviewText').value.trim();
        
        if (text) {
            await saveWeeklyReview(text);
            document.body.removeChild(modal);
            renderReviewsView();
        } else {
            showToast('Please enter a weekly review before saving.', 'error');
        }
    };
    
    // Setup cancel button
    document.getElementById('cancelWeeklyReviewBtn').onclick = () => {
        document.body.removeChild(modal);
    };
}

async function saveWeeklyReview(text) {
    try {
        console.log('💾 Starting to save weekly review...');
        
        // Check if Firebase integration is available
        if (!window.firebaseRESTIntegration) {
            console.error('❌ Firebase integration not available');
            showToast('Firebase integration not available. Please refresh the page.', 'error');
            return;
        }
        
        const weeklyReview = {
            id: Date.now(),
            text: text,
            weekStart: currentWeekStart.toISOString(),
            projectId: currentProject ? currentProject.id : null,
            createdAt: new Date().toISOString()
        };
        
        console.log('💾 Weekly review object created:', weeklyReview);
        
        // Load existing weekly reviews
        console.log('💾 Loading existing weekly reviews from Firebase...');
        const existingReviews = await window.firebaseRESTIntegration.loadData('weeklyReviews') || [];
        console.log('💾 Existing weekly reviews loaded:', existingReviews.length, 'reviews');
        
        // Check if review already exists for this week and project
        const existingIndex = existingReviews.findIndex(r => {
            const reviewDate = new Date(r.weekStart);
            return reviewDate.getTime() === currentWeekStart.getTime() && 
                   r.projectId === weeklyReview.projectId;
        });
        
        console.log('💾 Existing weekly review index:', existingIndex);
        
        if (existingIndex !== -1) {
            // Update existing review
            existingReviews[existingIndex] = weeklyReview;
            console.log('💾 Updating existing weekly review');
        } else {
            // Add new review
            existingReviews.push(weeklyReview);
            console.log('💾 Adding new weekly review');
        }
        
        // Save to Firebase
        console.log('💾 Saving weekly review to Firebase...');
        await window.firebaseRESTIntegration.saveData('weeklyReviews', existingReviews);
        
        showToast('Weekly review saved successfully!', 'success');
        console.log('✅ Weekly review saved to Firebase');
    } catch (error) {
        console.error('❌ Error saving weekly review:', error);
        console.error('❌ Error details:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        showToast(`Failed to save weekly review: ${error.message}`, 'error');
    }
}
