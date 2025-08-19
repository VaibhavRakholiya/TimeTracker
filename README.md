# TimeTracker - Pure HTML/CSS/JavaScript Project

A task management and time tracking application built with pure HTML, CSS, and JavaScript. No frameworks or build tools required!

## Features

- **Project Management**: Create and organize projects
- **Task Tracking**: Add tasks with status management
- **Time Tracking**: Start/stop timers for tasks
- **Timesheet View**: Daily time tracking with reviews
- **File-Based Storage**: Data saved as JSON files
- **User Management**: Separate data for different users
- **Responsive Design**: Works on all PC and desktop devices

## How to Use

### 1. Setup
1. Download all files to a directory
2. Open `index.html` in any modern web browser
3. No server setup required - works completely offline

### 2. Template System
- **First Launch**: App detects repository template and creates local working copy
- **Local Data**: Your changes are saved to a local `data.json` file
- **Repository File**: Remains unchanged as a template for other users
- **Auto-Save**: Data is automatically saved when you make changes

### 3. User Management
- **Default User**: The app starts with "default" user
- **Change User**: Enter a new username and click "Load"
- **User Data**: Each user gets separate JSON data files

### 4. Data Storage
- **Central Database**: `data.json` acts as a central database storing all user data
- **localStorage**: All changes are automatically saved to browser's localStorage
- **User Separation**: Data is automatically filtered by user ID within the same database
- **Auto-Save**: Data is automatically saved to localStorage when changes are made
- **Database Sync**: Click "Update Database" button to sync local changes with central database

### 5. Data Persistence
- **Central Database**: `data.json` contains all user data across the system
- **localStorage**: App automatically saves and loads from browser's localStorage
- **Automatic Loading**: App loads from central database and merges with local changes
- **Cross-Device**: Data is centralized in `data.json` and accessible to all users

### 6. Features
- **Projects**: Create and manage different projects
- **Tasks**: Add tasks with due dates and status tracking
- **Timers**: Start/stop timers to track time spent on tasks
- **Timesheet**: View daily time summaries with review notes
- **Drag & Drop**: Reorder tasks by dragging between columns

## File Structure

```
TimeTracker/
├── index.html          # Main application
├── styles.css          # All styling
├── app.js             # Application logic
├── README.md          # This file
└── data.json          # Template data (example projects and tasks)
```

## Browser Compatibility

- **Chrome**: Full support
- **Firefox**: Full support
- **Safari**: Full support
- **Edge**: Full support
- **Opera**: Full support

## Data Format

### Complete Data File (data.json)
```json
{
  "projects": [
    {
      "id": 1234567890,
      "name": "Project Name",
      "userId": "username",
      "createdAt": "2024-01-01T10:00:00.000Z"
    }
  ],
  "tasks": [
    {
      "id": 1234567890,
      "projectId": 1234567890,
      "title": "Task Title",
      "status": "To Do",
      "dueDate": "2024-01-15",
      "userId": "username",
      "position": 1000,
      "timeSpent": 2.5,
      "createdAt": "2024-01-01T10:00:00.000Z",
      "timeEntries": [],
      "reviews": [],
      "isTimerRunning": false,
      "timerStart": null
    }
  ],
  "lastUpdated": "2024-01-01T10:00:00.000Z",
  "version": "1.0"
}
```

## Tips

1. **Database Sync**: Use "Update Database" button to sync local changes with central database
2. **User Names**: Use consistent usernames across devices
3. **Centralized Data**: All user data is stored in the central `data.json` database
4. **Cross-Device**: Data is centralized and accessible to all users
5. **Offline Use**: Works completely offline once loaded

## Troubleshooting

- **Data Not Loading**: Check browser console for error messages
- **localStorage Issues**: Ensure cookies/localStorage are enabled in your browser
- **Database Sync**: Use "Update Database" button to manually sync with central database
- **Browser Console**: Open developer tools to see any error messages
- **Central Database**: Ensure `data.json` is accessible and contains valid JSON data

## License

This is a free, open-source project. Feel free to modify and distribute as needed.
