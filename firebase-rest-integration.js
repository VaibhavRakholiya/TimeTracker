// Firebase REST API Integration for TimeTracker - Database URL Only
// This approach uses direct HTTP requests to Firebase Realtime Database REST API
// No Firebase SDK required - only the database URL

class FirebaseRESTIntegration {
    constructor() {
        this.databaseURL = "https://tictac-405e5-default-rtdb.firebaseio.com";
        this.isOnline = navigator.onLine;
        this.isConnected = false;
        
        // Initialize network listeners
        this.initNetworkListeners();
        
        // Test connection
        this.testConnection();
    }

    // Test Firebase connection
    async testConnection() {
        try {
            console.log(`🔍 Testing connection to: ${this.databaseURL}/.json`);
            const response = await fetch(`${this.databaseURL}/.json`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            console.log(`📡 Response status: ${response.status}`);
            
            if (response.ok) {
                this.isConnected = true;
                console.log('🟢 Connected to Firebase via REST API');
                this.showToast('Connected to cloud sync', 'success');
            } else {
                this.isConnected = false;
                console.log('🔴 Failed to connect to Firebase');
                this.showToast('Firebase connection failed', 'error');
            }
        } catch (error) {
            this.isConnected = false;
            console.log('🔴 Firebase connection error:', error);
            this.showToast('Working offline', 'warning');
        }
    }

    // Authentication Methods
    async createUser(email, password, displayName) {
        try {
            console.log(`👤 Creating user: ${email}`);
            
            // Check if user already exists
            const existingUsers = await this.loadData('users');
            const userExists = existingUsers.find(user => user.email === email);
            
            if (userExists) {
                return { success: false, error: 'User already exists with this email' };
            }
            
            // Create new user
            const userId = this.generateUserId();
            const newUser = {
                id: userId,
                email: email,
                password: this.hashPassword(password), // Simple hash for demo
                displayName: displayName,
                createdAt: new Date().toISOString(),
                lastLogin: new Date().toISOString()
            };
            
            // Save user to database
            const users = existingUsers || [];
            users.push(newUser);
            await this.saveData('users', users);
            
            console.log(`✅ User created successfully: ${userId}`);
            return { success: true, user: { id: userId, email, displayName } };
            
        } catch (error) {
            console.error('❌ Error creating user:', error);
            return { success: false, error: error.message };
        }
    }
    
    async authenticateUser(email, password) {
        try {
            console.log(`🔑 Authenticating user: ${email}`);
            
            const users = await this.loadData('users');
            const user = users.find(u => u.email === email && u.password === this.hashPassword(password));
            
            if (user) {
                // Update last login
                user.lastLogin = new Date().toISOString();
                const updatedUsers = users.map(u => u.id === user.id ? user : u);
                await this.saveData('users', updatedUsers);
                
                console.log(`✅ User authenticated successfully: ${user.id}`);
                return { success: true, user: { id: user.id, email: user.email, displayName: user.displayName } };
            } else {
                return { success: false, error: 'Invalid email or password' };
            }
            
        } catch (error) {
            console.error('❌ Error authenticating user:', error);
            return { success: false, error: error.message };
        }
    }
    
    async getUserById(userId) {
        try {
            const users = await this.loadData('users');
            const user = users.find(u => u.id === userId);
            
            if (user) {
                return { success: true, user: { id: user.id, email: user.email, displayName: user.displayName } };
            } else {
                return { success: false, error: 'User not found' };
            }
        } catch (error) {
            console.error('❌ Error getting user:', error);
            return { success: false, error: error.message };
        }
    }
    
    generateUserId() {
        return 'user_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    }
    
    hashPassword(password) {
        // Simple hash function for demo purposes
        // In production, use a proper hashing library
        let hash = 0;
        for (let i = 0; i < password.length; i++) {
            const char = password.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString();
    }

    // Database Methods using REST API
    async saveData(dataType, data) {
        try {
            const url = `${this.databaseURL}/timetracker/${dataType}.json`;
            console.log(`💾 Saving ${dataType} to: ${url}`);
            console.log(`📦 Data to save:`, data);
            
            const response = await fetch(url, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            console.log(`📡 Save response status: ${response.status}`);

            if (response.ok) {
                // Also save to localStorage as backup
                localStorage.setItem(`${dataType}_backup`, JSON.stringify(data));
                console.log(`✅ Data saved to Firebase via REST: ${dataType}`);
                return true;
            } else {
                const errorText = await response.text();
                console.error(`❌ Save failed: ${response.status} - ${errorText}`);
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            console.error(`❌ Error saving ${dataType} to Firebase:`, error);
            
            // Fallback to localStorage
            localStorage.setItem(`${dataType}_backup`, JSON.stringify(data));
            this.showToast(`Saved locally (offline): ${dataType}`, 'warning');
            return false;
        }
    }

    async loadData(dataType) {
        try {
            const url = `${this.databaseURL}/timetracker/${dataType}.json`;
            console.log(`📥 Loading ${dataType} from: ${url}`);
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            console.log(`📡 Load response status: ${response.status}`);

            if (response.ok) {
                const data = await response.json();
                console.log(`📦 Loaded data for ${dataType}:`, data);
                
                if (data !== null) {
                    // Update localStorage backup
                    localStorage.setItem(`${dataType}_backup`, JSON.stringify(data));
                    console.log(`✅ Data loaded from Firebase via REST: ${dataType}`);
                    return data;
                } else {
                    // Return default data if no data exists
                    console.log(`ℹ️  No data found in Firebase for: ${dataType}, using defaults`);
                    return this.getDefaultData(dataType);
                }
            } else {
                const errorText = await response.text();
                console.error(`❌ Load failed: ${response.status} - ${errorText}`);
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            console.error(`❌ Error loading ${dataType} from Firebase:`, error);
            // Fallback to localStorage
            const backup = localStorage.getItem(`${dataType}_backup`);
            if (backup) {
                console.log(`📱 Using local backup for: ${dataType}`);
                return JSON.parse(backup);
            } else {
                console.log(`🆕 Using default data for: ${dataType}`);
                return this.getDefaultData(dataType);
            }
        }
    }

    // Real-time listeners using Server-Sent Events (if supported) or polling
    setupRealtimeListener(dataType, callback) {
        console.log(`⏸️ Realtime listener disabled for: ${dataType} (auto-refresh disabled)`);
        // Realtime listeners are disabled to prevent continuous refreshing
        // Data will only be loaded when explicitly requested
    }

    // Cleanup polling intervals
    cleanupListeners() {
        const dataTypes = ['projects', 'tasks', 'backlogItems', 'timeEntries', 'timesheetReviews'];
        dataTypes.forEach(dataType => {
            if (this[`${dataType}Interval`]) {
                clearInterval(this[`${dataType}Interval`]);
                delete this[`${dataType}Interval`];
            }
        });
    }

    // Helper Methods
    getDefaultData(dataType) {
        const defaults = {
            projects: [],
            tasks: [],
            backlogItems: [],
            timeEntries: [],
            timesheetReviews: []
        };
        return defaults[dataType] || [];
    }

    initNetworkListeners() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            console.log('🌐 Network connection restored');
            this.showToast('Connection restored', 'success');
            this.testConnection();
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            console.log('📴 Network connection lost');
            this.showToast('Working offline', 'warning');
        });
    }

    setupRealtimeListeners() {
        console.log('⏸️ Realtime listeners disabled - data loads only once on page load');
        // Realtime listeners are disabled to prevent continuous refreshing
        // Data will only be loaded when explicitly requested
    }

    updateUI(dataType) {
        // Disabled automatic UI updates - data loads only once on page load
        console.log(`⏸️ Skipping automatic UI update for ${dataType} (auto-refresh disabled)`);
    }

    async syncPendingChanges() {
        // Sync any local changes that were made while offline
        if (this.isConnected) {
            try {
                console.log('🔄 Syncing pending changes...');
                const dataTypes = ['projects', 'tasks', 'backlogItems', 'timeEntries', 'timesheetReviews'];
                
                for (const dataType of dataTypes) {
                    const localData = JSON.parse(localStorage.getItem(`${dataType}_backup`) || '[]');
                    if (localData && localData.length > 0) {
                        await this.saveData(dataType, localData);
                    }
                }
                
                console.log('✅ Sync completed');
            } catch (error) {
                console.error('❌ Error syncing data:', error);
            }
        }
    }

    showToast(message, type = 'info') {
        // Use existing toast functionality if available
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else {
            console.log(`Toast: ${message}`);
        }
    }

    // Get connection status
    getConnectionStatus() {
        return {
            isConnected: this.isConnected,
            isOnline: this.isOnline
        };
    }

    // Get database URL
    getDatabaseURL() {
        return this.databaseURL;
    }

    // Manual test function for debugging
    async testFirebaseConnection() {
        console.log('🔍 Starting comprehensive Firebase test...');
        console.log(`📡 Database URL: ${this.databaseURL}`);
        
        // Test 1: Basic connection
        try {
            const response = await fetch(`${this.databaseURL}/.json`);
            console.log(`📡 Basic connection test: ${response.status}`);
            if (response.ok) {
                const data = await response.json();
                console.log('📦 Current database content:', data);
            }
        } catch (error) {
            console.error('❌ Basic connection test failed:', error);
        }

        // Test 2: Save test data
        try {
            const testData = { 
                message: 'Hello Firebase!', 
                timestamp: new Date().toISOString(),
                testId: Math.random().toString(36).substr(2, 9)
            };
            
            const response = await fetch(`${this.databaseURL}/timetracker/test.json`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(testData)
            });
            
            console.log(`📡 Save test response: ${response.status}`);
            if (response.ok) {
                console.log('✅ Test data saved successfully!');
                
                // Test 3: Read it back
                const readResponse = await fetch(`${this.databaseURL}/timetracker/test.json`);
                if (readResponse.ok) {
                    const readData = await readResponse.json();
                    console.log('📦 Test data read back:', readData);
                }
            } else {
                const errorText = await response.text();
                console.error('❌ Save test failed:', response.status, errorText);
            }
        } catch (error) {
            console.error('❌ Save test error:', error);
        }
    }
}

// Initialize Firebase REST Integration
let firebaseRESTIntegration;

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
    firebaseRESTIntegration = new FirebaseRESTIntegration();
    
    // Disable polling listeners - data loads only once on page load
    // firebaseRESTIntegration.setupRealtimeListeners();
    
    // Make it available globally immediately
    window.firebaseRESTIntegration = firebaseRESTIntegration;
    
    console.log('🚀 Firebase REST Integration initialized (Database URL only)');
    console.log(`📡 Using database URL: ${firebaseRESTIntegration.getDatabaseURL()}`);
    
    // Test a simple save operation
    setTimeout(async () => {
        console.log('🧪 Testing Firebase connection with a simple save...');
        try {
            const testData = { test: 'connection', timestamp: new Date().toISOString() };
            const result = await firebaseRESTIntegration.saveData('test', testData);
            if (result) {
                console.log('✅ Test save successful! Firebase is working.');
            } else {
                console.log('❌ Test save failed! Check Firebase configuration.');
            }
        } catch (error) {
            console.error('❌ Test save error:', error);
        }
    }, 2000);
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (firebaseRESTIntegration) {
        firebaseRESTIntegration.cleanupListeners();
    }
});

// Export for use in main app (set in DOMContentLoaded event)

// Global test function for debugging
window.testFirebase = () => {
    if (firebaseRESTIntegration) {
        firebaseRESTIntegration.testFirebaseConnection();
    } else {
        console.error('❌ Firebase integration not initialized yet');
    }
};
