const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { fork } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const QRCode = require('qrcode');

const APP_EVENT_CHANNEL = 'sm3000:event';

const DEFAULT_CONFIG = {
  TARGET_CONTACT_IDS: '',
  TARGET_CONTACT_NAMES: '',
  TARGET_CONTACT_ID: '',
  TARGET_CONTACT_NAME: '',
  TELEGRAM_TARGET_CHAT_NAMES: '',
  TELEGRAM_AUTH_PATH: './.telegram_auth',
  TELEGRAM_POLL_MS: '3000',
  TELEGRAM_WEB_URL: 'https://web.telegram.org/k/',
  SCREENSHOT_DIR: './screenshots',
  LOCAL_AUTH_PATH: './.wwebjs_auth',
  HEADLESS: 'false',
  FULL_PAGE_SCREENSHOT: 'true',
  AUTO_OPEN_CHAT_BEFORE_SCREENSHOT: 'true',
  MESSAGE_RENDER_WAIT_MS: '1200',
  DEBUG_FOCUS: 'false',
  RECONNECT_BASE_MS: '5000',
  RECONNECT_MAX_MS: '120000',
  LOG_TO_FILE: 'true',
  LOG_FILE: './logs/monitor.log',
  PUPPETEER_EXECUTABLE_PATH: '',
};

const KNOWN_CONFIG_KEYS = new Set(Object.keys(DEFAULT_CONFIG));

let mainWindow;
let monitorProcess;
let monitorStopping = false;
let monitorStatus = 'Stopped';
let latestQrDataUrl = '';
let contacts = [];
let logs = [];

function getConfigDir() {
  return app.isPackaged ? app.getPath('userData') : app.getAppPath();
}

function getConfigPath() {
  return path.join(getConfigDir(), '.env');
}

function getMonitorPath() {
  return path.join(app.getAppPath(), 'monitor.js');
}

function splitList(rawValue) {
  return String(rawValue || '')
    .split(/[\n,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function listValue(rawValue) {
  return splitList(rawValue).join(',');
}

function firstListValue(rawValue) {
  return splitList(rawValue)[0] || '';
}

function formatEnvValue(value) {
  const text = String(value ?? '');
  if (!text) {
    return '';
  }

  if (/^[A-Za-z0-9_./:@+-]+$/.test(text)) {
    return text;
  }

  return JSON.stringify(text);
}

function buildEnvContent(values, extraValues = {}) {
  const next = { ...DEFAULT_CONFIG, ...values };
  next.TARGET_CONTACT_IDS = listValue(next.TARGET_CONTACT_IDS);
  next.TARGET_CONTACT_NAMES = listValue(next.TARGET_CONTACT_NAMES);
  next.TARGET_CONTACT_ID = firstListValue(next.TARGET_CONTACT_IDS);
  next.TARGET_CONTACT_NAME = firstListValue(next.TARGET_CONTACT_NAMES);
  next.TELEGRAM_TARGET_CHAT_NAMES = listValue(next.TELEGRAM_TARGET_CHAT_NAMES);

  const lines = [
    '# Screenshot Maschine 3000 configuration',
    '# Target contacts can be selected in the app dashboard.',
    `TARGET_CONTACT_IDS=${formatEnvValue(next.TARGET_CONTACT_IDS)}`,
    `TARGET_CONTACT_NAMES=${formatEnvValue(next.TARGET_CONTACT_NAMES)}`,
    '',
    '# Legacy single-contact fields are kept for script compatibility.',
    `TARGET_CONTACT_ID=${formatEnvValue(next.TARGET_CONTACT_ID)}`,
    `TARGET_CONTACT_NAME=${formatEnvValue(next.TARGET_CONTACT_NAME)}`,
    '',
    '# Telegram Web target chats are matched by exact visible chat name.',
    `TELEGRAM_TARGET_CHAT_NAMES=${formatEnvValue(next.TELEGRAM_TARGET_CHAT_NAMES)}`,
    `TELEGRAM_AUTH_PATH=${formatEnvValue(next.TELEGRAM_AUTH_PATH)}`,
    `TELEGRAM_POLL_MS=${formatEnvValue(next.TELEGRAM_POLL_MS)}`,
    `TELEGRAM_WEB_URL=${formatEnvValue(next.TELEGRAM_WEB_URL)}`,
    '',
    '# App and monitor settings',
    `SCREENSHOT_DIR=${formatEnvValue(next.SCREENSHOT_DIR)}`,
    `LOCAL_AUTH_PATH=${formatEnvValue(next.LOCAL_AUTH_PATH)}`,
    `HEADLESS=${formatEnvValue(next.HEADLESS)}`,
    `FULL_PAGE_SCREENSHOT=${formatEnvValue(next.FULL_PAGE_SCREENSHOT)}`,
    `AUTO_OPEN_CHAT_BEFORE_SCREENSHOT=${formatEnvValue(next.AUTO_OPEN_CHAT_BEFORE_SCREENSHOT)}`,
    `MESSAGE_RENDER_WAIT_MS=${formatEnvValue(next.MESSAGE_RENDER_WAIT_MS)}`,
    `DEBUG_FOCUS=${formatEnvValue(next.DEBUG_FOCUS)}`,
    `RECONNECT_BASE_MS=${formatEnvValue(next.RECONNECT_BASE_MS)}`,
    `RECONNECT_MAX_MS=${formatEnvValue(next.RECONNECT_MAX_MS)}`,
    `LOG_TO_FILE=${formatEnvValue(next.LOG_TO_FILE)}`,
    `LOG_FILE=${formatEnvValue(next.LOG_FILE)}`,
    `PUPPETEER_EXECUTABLE_PATH=${formatEnvValue(next.PUPPETEER_EXECUTABLE_PATH)}`,
  ];

  const extraKeys = Object.keys(extraValues).filter((key) => !KNOWN_CONFIG_KEYS.has(key)).sort();
  if (extraKeys.length > 0) {
    lines.push('', '# Extra settings');
    for (const key of extraKeys) {
      lines.push(`${key}=${formatEnvValue(extraValues[key])}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

function ensureConfigFile() {
  fs.mkdirSync(getConfigDir(), { recursive: true });
  if (!fs.existsSync(getConfigPath())) {
    fs.writeFileSync(getConfigPath(), buildEnvContent(DEFAULT_CONFIG), 'utf8');
  }
}

function readConfig() {
  ensureConfigFile();
  const raw = fs.readFileSync(getConfigPath(), 'utf8');
  const parsed = dotenv.parse(raw);
  const values = { ...DEFAULT_CONFIG, ...parsed };

  if (!values.TARGET_CONTACT_IDS && values.TARGET_CONTACT_ID) {
    values.TARGET_CONTACT_IDS = values.TARGET_CONTACT_ID;
  }

  if (!values.TARGET_CONTACT_NAMES && values.TARGET_CONTACT_NAME) {
    values.TARGET_CONTACT_NAMES = values.TARGET_CONTACT_NAME;
  }

  const extra = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!KNOWN_CONFIG_KEYS.has(key)) {
      extra[key] = value;
    }
  }

  return { values, extra };
}

function writeConfig(values, extra) {
  ensureConfigFile();
  const content = buildEnvContent(values, extra);
  fs.writeFileSync(getConfigPath(), content, 'utf8');

  const next = readConfig().values;
  fs.mkdirSync(resolveConfigPath(next.SCREENSHOT_DIR), { recursive: true });
  fs.mkdirSync(resolveConfigPath(next.LOCAL_AUTH_PATH), { recursive: true });
  fs.mkdirSync(resolveConfigPath(next.TELEGRAM_AUTH_PATH), { recursive: true });
  fs.mkdirSync(path.dirname(resolveConfigPath(next.LOG_FILE)), { recursive: true });
}

function resolveConfigPath(configValue) {
  return path.resolve(getConfigDir(), configValue || '.');
}

function publicState() {
  const config = readConfig();
  return {
    configPath: getConfigPath(),
    configDir: getConfigDir(),
    isPackaged: app.isPackaged,
    values: config.values,
    extra: config.extra,
    contacts,
    logs,
    monitor: {
      running: Boolean(monitorProcess),
      status: monitorStatus,
      qrDataUrl: latestQrDataUrl,
    },
    paths: {
      screenshotDir: resolveConfigPath(config.values.SCREENSHOT_DIR),
      localAuthPath: resolveConfigPath(config.values.LOCAL_AUTH_PATH),
      telegramAuthPath: resolveConfigPath(config.values.TELEGRAM_AUTH_PATH),
      logFile: resolveConfigPath(config.values.LOG_FILE),
    },
  };
}

function broadcast(reason) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send('app:event', {
    reason,
    state: publicState(),
  });
}

function appendLog(line, level = 'info') {
  const text = String(line || '').trimEnd();
  if (!text) {
    return;
  }

  logs.push({
    level,
    text,
    at: new Date().toISOString(),
  });

  if (logs.length > 300) {
    logs = logs.slice(-300);
  }

  broadcast('log');
}

async function handleMonitorEvent(event) {
  if (!event || !event.type) {
    return;
  }

  if (event.type === 'qr') {
    monitorStatus = 'Waiting for QR scan';
    latestQrDataUrl = await QRCode.toDataURL(event.qr, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 280,
    });
    broadcast('qr');
    return;
  }

  if (event.type === 'authenticated') {
    monitorStatus = 'Authenticated';
    latestQrDataUrl = '';
    broadcast('authenticated');
    return;
  }

  if (event.type === 'ready') {
    const hasTargets = Boolean(event.targetContactIds?.length || event.targetContactNames?.length);
    monitorStatus = hasTargets ? 'Monitoring' : 'Choose contacts';
    latestQrDataUrl = '';
    broadcast('ready');
    return;
  }

  if (event.type === 'telegram-login') {
    monitorStatus = latestQrDataUrl ? 'WhatsApp login required' : 'Telegram login required';
    broadcast('telegram-login');
    return;
  }

  if (event.type === 'telegram-ready') {
    if (!latestQrDataUrl) {
      monitorStatus = 'Monitoring';
    }
    broadcast('telegram-ready');
    return;
  }

  if (event.type === 'contacts') {
    contacts = Array.isArray(event.contacts) ? event.contacts : [];
    broadcast('contacts');
    return;
  }

  if (event.type === 'screenshot') {
    appendLog(`Screenshot saved: ${event.path}`);
    return;
  }

  if (event.type === 'auth_failure' || event.type === 'fatal' || event.type === 'error') {
    monitorStatus = 'Needs attention';
    appendLog(event.message || event.type, 'error');
    broadcast(event.type);
    return;
  }

  if (event.type === 'disconnected') {
    monitorStatus = 'Disconnected';
    appendLog(`Disconnected: ${event.reason || 'unknown reason'}`, 'warn');
    broadcast('disconnected');
    return;
  }

  if (event.type === 'contacts-error') {
    appendLog(`Could not load contacts: ${event.message || 'unknown error'}`, 'warn');
  }
}

function handleMonitorMessage(message) {
  if (message?.channel !== APP_EVENT_CHANNEL || !message.event || typeof message.event !== 'object') {
    return;
  }

  handleMonitorEvent(message.event).catch((error) => {
    appendLog(`Invalid monitor event: ${error.message}`, 'warn');
  });
}

function wireMonitorStream(stream, level) {
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      appendLog(line, level);
    }
  });
}

function startMonitor() {
  if (monitorProcess) {
    return publicState();
  }

  ensureConfigFile();
  monitorStopping = false;
  latestQrDataUrl = '';
  monitorStatus = 'Starting';
  appendLog('Starting monitor...');

  monitorProcess = fork(getMonitorPath(), [], {
    cwd: getConfigDir(),
    execPath: process.execPath,
    env: {
      ...process.env,
      APP_BRIDGE: '1',
      APP_DATA_DIR: getConfigDir(),
      CONFIG_FILE: getConfigPath(),
      ELECTRON_RUN_AS_NODE: '1',
    },
    silent: true,
  });

  wireMonitorStream(monitorProcess.stdout, 'info');
  wireMonitorStream(monitorProcess.stderr, 'error');
  monitorProcess.on('message', handleMonitorMessage);

  monitorProcess.on('error', (error) => {
    monitorStatus = 'Needs attention';
    appendLog(`Monitor failed to start: ${error.message}`, 'error');
    broadcast('monitor-error');
  });

  monitorProcess.on('exit', (code, signal) => {
    monitorProcess = undefined;
    latestQrDataUrl = '';
    monitorStatus = monitorStopping ? 'Stopped' : `Stopped${code ? ` (${code})` : ''}${signal ? ` ${signal}` : ''}`;
    monitorStopping = false;
    appendLog(`Monitor ${monitorStatus.toLowerCase()}.`);
    broadcast('monitor-exit');
  });

  broadcast('monitor-start');
  return publicState();
}

async function stopMonitor() {
  if (!monitorProcess) {
    monitorStatus = 'Stopped';
    return publicState();
  }

  const child = monitorProcess;
  monitorStopping = true;
  monitorStatus = 'Stopping';
  appendLog('Stopping monitor...');
  child.kill();

  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });

  return publicState();
}

async function restartMonitor() {
  await stopMonitor();
  return startMonitor();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 900,
    minHeight: 680,
    title: 'Screenshot Maschine 3000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

ipcMain.handle('app:get-state', () => publicState());
ipcMain.handle('config:save', (_event, payload) => {
  writeConfig(payload?.values || {}, payload?.extra || {});
  return publicState();
});
ipcMain.handle('monitor:start', () => startMonitor());
ipcMain.handle('monitor:stop', () => stopMonitor());
ipcMain.handle('monitor:restart', () => restartMonitor());
ipcMain.handle('contacts:refresh', () => startMonitor());
ipcMain.handle('folder:choose', async (_event, currentPath) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    defaultPath: currentPath ? resolveConfigPath(currentPath) : getConfigDir(),
    properties: ['openDirectory', 'createDirectory'],
  });

  return result.canceled ? '' : result.filePaths[0];
});
ipcMain.handle('path:open', async (_event, targetPath) => {
  const absolutePath = resolveConfigPath(targetPath);
  fs.mkdirSync(absolutePath, { recursive: true });
  return shell.openPath(absolutePath);
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    ensureConfigFile();
    createWindow();
    startMonitor();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on('before-quit', () => {
  if (monitorProcess) {
    monitorStopping = true;
    monitorProcess.kill();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
