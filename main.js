const { app, BrowserWindow, Tray, ipcMain, Menu } = require('electron');
const path = require('path');

let mainWindow;
let tray;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            backgroundThrottling: false
        }
    });

    // Load the local index.html
    mainWindow.loadFile('index.html');
}

function createTray() {
    // We use a simple 16x16 icon for the native Mac tray
    const iconPath = path.join(__dirname, 'icons', 'icon.png');
    const { nativeImage } = require('electron');
    const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    tray = new Tray(trayIcon);

    // Set a default empty title
    tray.setTitle('');
    tray.setToolTip('Time Tracker');

    const contextMenu = Menu.buildFromTemplate([
        { label: 'Show App', click: () => mainWindow.show() },
        { label: 'Quit', click: () => app.quit() }
    ]);

    tray.setContextMenu(contextMenu);

    // On click, bring the app to foreground
    tray.on('click', () => {
        if (mainWindow) {
            mainWindow.show();
        }
    });
}

app.whenReady().then(() => {
    createWindow();
    createTray();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Listen for timer updates from the renderer process
ipcMain.on('update-timer', (event, timeString) => {
    if (tray) {
        tray.setTitle(`⏱ ${timeString}`);
    }
});

// Listen for stop timer events from the renderer process
ipcMain.on('stop-timer', (event) => {
    if (tray) {
        tray.setTitle('');
    }
});
