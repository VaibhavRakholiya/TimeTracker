# Firebase Authentication Setup Guide

This guide will help you set up Firebase Authentication for the TimeTracker application to support multiple users.

## Prerequisites

- A Firebase project (if you don't have one, create it at [Firebase Console](https://console.firebase.google.com))
- Your Firebase project should have Realtime Database enabled

## Step 1: Enable Authentication

1. Go to your Firebase Console
2. Select your project
3. In the left sidebar, click on "Authentication"
4. Click on "Get started" if you haven't set up authentication yet
5. Go to the "Sign-in method" tab
6. Enable the following sign-in methods:
   - **Email/Password**: Click on it and toggle "Enable"
   - **Google**: Click on it and toggle "Enable", then configure the OAuth consent screen

## Step 2: Configure OAuth Consent Screen (for Google Sign-in)

1. In the Google sign-in method configuration
2. Click "Configure" next to "Web SDK configuration"
3. Add your domain to the authorized domains
4. For local development, add `localhost` to the authorized domains
5. Save the configuration

## Step 3: Update Firebase Configuration

1. In your Firebase Console, go to Project Settings (gear icon)
2. Scroll down to "Your apps" section
3. If you don't have a web app, click "Add app" and select the web icon
4. Copy the Firebase configuration object
5. Update the `firebase-config.js` file with your actual configuration:

```javascript
const FIREBASE_CONFIG = {
    apiKey: "your-actual-api-key",
    authDomain: "your-project-id.firebaseapp.com",
    databaseURL: "https://your-project-id-default-rtdb.firebaseio.com",
    projectId: "your-project-id",
    storageBucket: "your-project-id.appspot.com",
    messagingSenderId: "your-sender-id",
    appId: "your-app-id"
};
```

## Step 4: Set Up Database Rules

1. Go to "Realtime Database" in your Firebase Console
2. Click on the "Rules" tab
3. Replace the existing rules with the following to secure user data:

```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "$uid === auth.uid",
        ".write": "$uid === auth.uid",
        "projects": {
          ".read": "$uid === auth.uid",
          ".write": "$uid === auth.uid"
        },
        "tasks": {
          ".read": "$uid === auth.uid",
          ".write": "$uid === auth.uid"
        },
        "backlogItems": {
          ".read": "$uid === auth.uid",
          ".write": "$uid === auth.uid"
        },
        "timeEntries": {
          ".read": "$uid === auth.uid",
          ".write": "$uid === auth.uid"
        },
        "timesheetReviews": {
          ".read": "$uid === auth.uid",
          ".write": "$uid === auth.uid"
        }
      }
    }
  }
}
```

4. Click "Publish" to save the rules

## Step 5: Test the Authentication

1. Open your TimeTracker application
2. You should see the authentication modal
3. Try creating a new account with email/password
4. Try logging in with the created account
5. Test Google sign-in (if configured)
6. Verify that data is saved and loaded correctly for each user

## Features Included

### Authentication Methods
- **Email/Password**: Traditional sign-up and sign-in
- **Google Sign-in**: One-click authentication with Google account

### User Data Isolation
- Each user's data is stored under their unique user ID
- Database rules ensure users can only access their own data
- Complete data separation between different users

### User Interface
- Modern, responsive authentication modal
- Tab-based interface for login/signup
- User profile display in sidebar
- Logout functionality
- Error handling and validation

### Security Features
- Password validation (minimum 6 characters)
- Email format validation
- Secure Firebase Authentication
- Database rules preventing unauthorized access
- User session management

## Troubleshooting

### Common Issues

1. **"Firebase Auth not available" error**
   - Make sure you've included the Firebase Auth SDK in your HTML
   - Check that your Firebase configuration is correct

2. **Google sign-in not working**
   - Verify OAuth consent screen is configured
   - Check that your domain is in authorized domains
   - Ensure Google sign-in is enabled in Firebase Console

3. **Database permission denied**
   - Check your database rules
   - Make sure the user is authenticated before accessing data
   - Verify the user ID matches the authenticated user

4. **Data not loading/saving**
   - Check browser console for errors
   - Verify Firebase configuration
   - Ensure user is authenticated

### Debug Mode

The application includes extensive logging. Open browser developer tools and check the console for detailed information about:
- Authentication state changes
- Data loading and saving operations
- Error messages and stack traces

## Data Structure

User data is organized as follows in the database:

```
users/
  {userId}/
    projects/
    tasks/
    backlogItems/
    timeEntries/
    timesheetReviews/
```

This structure ensures complete data isolation between users while maintaining the same functionality for each individual user.

## Next Steps

After setting up authentication:

1. Test with multiple user accounts
2. Verify data isolation works correctly
3. Customize the user interface if needed
4. Set up additional authentication methods if required
5. Configure email verification if needed

## Support

If you encounter any issues:

1. Check the browser console for error messages
2. Verify your Firebase configuration
3. Ensure all required services are enabled
4. Check the Firebase Console for any service issues
5. Review the database rules for proper permissions

The authentication system is now fully integrated and ready for multi-user support! 🎉
