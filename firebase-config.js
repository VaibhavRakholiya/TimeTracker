// Firebase Configuration
//
// Used two ways in this app:
//  - databaseURL alone drives firebase-rest-integration.js's plain REST calls
//    (projects/tasks/agents/chats) — no SDK, no auth, same as before.
//  - The full config below additionally initializes the Firebase Auth SDK
//    (loaded via firebase-app-compat.js / firebase-auth-compat.js) so
//    login.html can do real Firebase Authentication instead of checking a
//    password against a value sitting in the Realtime Database (TASK-584).
//
// This apiKey is a public, client-side identifier — Firebase's own docs are
// explicit that it is not a secret and is safe to ship in source control;
// what actually protects data is Realtime Database / Auth security rules,
// not this key. See https://firebase.google.com/docs/projects/api-keys.
const firebaseConfig = {
    apiKey: "AIzaSyDWN9R22F2RbHxynkW_uOOWOi2NW6Cev2c",
    authDomain: "tictac-405e5.firebaseapp.com",
    databaseURL: "https://tictac-405e5-default-rtdb.firebaseio.com",
    projectId: "tictac-405e5",
    storageBucket: "tictac-405e5.firebasestorage.app",
    messagingSenderId: "85414466726",
    appId: "1:85414466726:web:177e99742c66833c2f9067",
};

firebase.initializeApp(firebaseConfig);

// Export for use in other files
window.FIREBASE_DATABASE_URL = firebaseConfig.databaseURL;
window.firebaseAuth = firebase.auth();
