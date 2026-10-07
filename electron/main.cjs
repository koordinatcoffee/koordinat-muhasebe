const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

// `npm run electron:dev` loads the Vite dev server; otherwise the bundled dist/ is loaded
const isDev = process.env.ELECTRON_DEV === '1';
const DEV_SERVER_URL = 'http://localhost:5173';
const APP_ENTRY = path.join(__dirname, '..', 'dist', 'index.html');

let mainWindow = null;

const isAppUrl = (url) => (isDev ? url.startsWith(DEV_SERVER_URL) : url.startsWith('file://'));

function openExternally(url) {
  if (/^https?:\/\//.test(url)) shell.openExternal(url);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 420,
    minHeight: 600,
    title: 'Koordinat Muhasebe',
    backgroundColor: '#f5f6f4',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      devTools: isDev,
    },
  });

  // Show only after the first paint to avoid a blank flash on startup
  mainWindow.once('ready-to-show', () => mainWindow.show());

  if (isDev) {
    mainWindow.loadURL(DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(APP_ENTRY);
  }

  // Links that try to open a new window go to the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternally(url);
    return { action: 'deny' };
  });

  // Never navigate the app window away from the bundled app
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) return;
    event.preventDefault();
    openExternally(url);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// A single running instance; launching again focuses the existing window
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    createMainWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
