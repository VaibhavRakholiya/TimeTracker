# Firebase Setup Guide for TimeTracker

This guide will help you set up Firebase Realtime Database for your TimeTracker application using only the database URL (no SDK required).

## Prerequisites

1. A Google account
2. Access to the Firebase Console

## Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project" or "Add project"
3. Enter a project name (e.g., "timetracker-app")
4. Choose whether to enable Google Analytics (optional)
5. Click "Create project"

## Step 2: Create Realtime Database

1. In your Firebase project, click on "Realtime Database" in the left sidebar
2. Click "Create Database"
3. Choose "Start in test mode" (for development)
4. Select a location for your database (choose the closest to your users)
5. Click "Done"

## Step 3: Get Database URL

1. In your Firebase project, go to "Realtime Database"
2. Copy the database URL from the top of the page
3. It will look like: `https://your-project-id-default-rtdb.firebaseio.com`

## Step 4: Update Firebase Configuration

1. Open `firebase-config.js` in your project
2. Replace the database URL with your actual Firebase database URL:

```javascript
const FIREBASE_DATABASE_URL = "https://your-project-id-default-rtdb.firebaseio.com";
```

**That's it!** No other configuration is needed. The app uses Firebase's REST API directly.

## Step 5: Set Up Database Rules (Important!)

1. Go to "Realtime Database" in your Firebase console
2. Click on the "Rules" tab
3. Replace the default rules with the contents of [`database.rules.json`](./database.rules.json) in this repo:

```json
{
  "rules": {
    "timetracker": {
      ".read": "auth != null",
      ".write": "auth != null"
    }
  }
}
```

**Note (TASK-589)**: These rules require a signed-in Firebase Auth user for every
read and write — the database URL alone no longer grants access, closing the
gap where anyone with the URL could bypass `login.html` entirely via a direct
REST call. `firebase-rest-integration.js` attaches the signed-in user's ID
token (`?auth=<idToken>`) to every request it makes, so the app keeps working
once these rules are published; a session that isn't signed in gets Firebase's
own permission-denied response instead of falling through to reading/writing
the database.

**This repo has no `firebase.json`/CLI project wired up**, so these rules are
not deployed automatically — they must be pasted into the console's Rules tab
by hand (or you can run `firebase deploy --only database` yourself after
`firebase init` if you set up the CLI).

**⚠️ Also review before publishing**: this same database backs the FlowBoard
agent board (`timetracker/flowboard_projects`, `flowboard_tasks`,
`flowboard_agents`, `flowboard_chats`), read and written by the `mcp-server/`
FlowBoard MCP tool that Claude Code agents (including the one that wrote this
change) use directly over unauthenticated REST — it has no Firebase Auth
session and no ID token to send. Publishing these rules as written will lock
those agents out of the board along with anyone else, so they will need
either a scoped rule exemption for the `flowboard_*` keys or a service-account
based auth path for `mcp-server/src/store.js` *before* this is published,
not after.

4. Click "Publish"

## Step 6: Test Your Setup

1. Open your TimeTracker application in a web browser
2. Your data should now sync to Firebase automatically via REST API!
3. Try creating a project or task - it will be saved to the cloud
4. Open the app in another browser/device to see real-time sync (polling every 5 seconds)

## Features Enabled

With Firebase REST API integration, your TimeTracker now includes:

### ☁️ **Cloud Synchronization**
- Data sync across devices using REST API
- Automatic backup of all your data
- Access your tasks from anywhere
- No Firebase SDK required

### 📱 **Multi-Device Support**
- Changes sync across all devices (polling every 5 seconds)
- Offline support with automatic sync when online
- No authentication required - simple and fast
- Lightweight implementation

### 🔄 **Real-time Updates**
- Changes appear on all connected devices via polling
- Automatic conflict resolution
- Live collaboration support
- REST API based synchronization

### 💾 **Data Persistence**
- Your data is safely stored in the cloud
- Automatic local backup for offline access
- No data loss during network issues
- Direct HTTP requests to Firebase

## Troubleshooting

### Database Issues
- Ensure your database rules are set correctly
- Check that the database URL in your config matches your actual database
- Verify that you're using the correct project ID
- Make sure the database URL ends with `.json` for REST API calls

### Sync Issues
- Check your internet connection
- Look for error messages in the browser console (F12)
- Try refreshing the page
- Check the Firebase Console for any error logs
- Verify that CORS is enabled for your domain (if needed)

## Security Best Practices

1. **Never commit your database URL to public repositories**
2. **Use environment variables for production deployments**
3. **Regularly review your database rules**
4. **Consider implementing authentication for production use**
5. **Monitor your Firebase usage and set up billing alerts**
6. **Use HTTPS for all requests**

## Next Steps

- Set up Firebase Hosting to deploy your app
- Configure custom domains
- Set up Firebase Analytics for usage insights
- Consider adding user authentication for production use
- Implement rate limiting for production

## Support

If you encounter any issues:
1. Check the Firebase Console for error logs
2. Review the browser console for JavaScript errors
3. Consult the [Firebase REST API Documentation](https://firebase.google.com/docs/database/rest/start)
4. Check the [Firebase Status Page](https://status.firebase.google.com/)

---

**Note**: This setup uses public read/write access for simplicity. For production deployment, consider implementing authentication and more restrictive database rules.
