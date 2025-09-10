// Firebase Configuration - Database URL Only
// ⚠️  IMPORTANT: Replace the database URL with your actual Firebase Realtime Database URL
// See FIREBASE_SETUP.md for detailed instructions

// Only the database URL is required for Realtime Database operations
const FIREBASE_DATABASE_URL = "https://tictac-405e5-default-rtdb.firebaseio.com";

// Check if database URL is still using placeholder value
if (FIREBASE_DATABASE_URL === "your-database-url-here") {
    console.warn('⚠️  Firebase database URL not set up! Please follow the instructions in FIREBASE_SETUP.md');
    console.warn('⚠️  The app will work with localStorage only until Firebase is configured.');
}

// Initialize Firebase with minimal configuration
const firebaseConfig = {
    databaseURL: FIREBASE_DATABASE_URL
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Firebase Realtime Database
const database = firebase.database();

// Export for use in other files
window.firebaseDatabase = database;
window.FIREBASE_DATABASE_URL = FIREBASE_DATABASE_URL;
