#!/usr/bin/env node

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');

const CONFIG_FILE = process.env.CONFIG_FILE ? path.resolve(process.env.CONFIG_FILE) : undefined;
require('dotenv').config({
  path: CONFIG_FILE,
  quiet: true,
  override: true,
});

const APP_BRIDGE = process.env.APP_BRIDGE === '1';
const PATH_BASE = path.resolve(process.env.APP_DATA_DIR || (CONFIG_FILE ? path.dirname(CONFIG_FILE) : process.cwd()));
const SCREENSHOT_DIR = resolveConfiguredPath(process.env.SCREENSHOT_DIR, './screenshots');
const LOCAL_AUTH_PATH = resolveConfiguredPath(process.env.LOCAL_AUTH_PATH, './.wwebjs_auth');
const TARGET_CONTACT_IDS_RAW = splitEnvList(process.env.TARGET_CONTACT_IDS || process.env.TARGET_CONTACT_ID || '');
const TARGET_CONTACT_NAMES_RAW = splitEnvList(process.env.TARGET_CONTACT_NAMES || process.env.TARGET_CONTACT_NAME || '');
const FULL_PAGE_SCREENSHOT = String(process.env.FULL_PAGE_SCREENSHOT || 'true').toLowerCase() === 'true';
const HEADLESS = String(process.env.HEADLESS || 'false').toLowerCase() === 'true';
const AUTO_OPEN_CHAT_BEFORE_SCREENSHOT = String(process.env.AUTO_OPEN_CHAT_BEFORE_SCREENSHOT || 'true').toLowerCase() === 'true';
const MESSAGE_RENDER_WAIT_MS = Number(process.env.MESSAGE_RENDER_WAIT_MS || 1200);
const DEBUG_FOCUS = String(process.env.DEBUG_FOCUS || 'false').toLowerCase() === 'true';
const RECONNECT_BASE_MS = Number(process.env.RECONNECT_BASE_MS || 5000);
const RECONNECT_MAX_MS = Number(process.env.RECONNECT_MAX_MS || 120000);
const LOG_TO_FILE = String(process.env.LOG_TO_FILE || 'true').toLowerCase() === 'true';
const LOG_FILE = resolveConfiguredPath(process.env.LOG_FILE, './logs/monitor.log');
const PUPPETEER_EXECUTABLE_PATH = (process.env.PUPPETEER_EXECUTABLE_PATH || '').trim();

function formatLogArgs(args) {
  return args
    .map((value) => {
      if (typeof value === 'string') {
        return value;
      }

      if (value instanceof Error) {
        return value.stack || value.message;
      }

      try {
        return JSON.stringify(value);
      } catch (_error) {
        return String(value);
      }
    })
    .join(' ');
}

function setupFileLogging() {
  if (!LOG_TO_FILE) {
    return;
  }

  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  const stream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
  const writeLine = (level, args) => {
    stream.write(`[${new Date().toISOString()}] ${level} ${formatLogArgs(args)}\n`);
  };

  const originalLog = console.log.bind(console);
  const originalError = console.error.bind(console);

  console.log = (...args) => {
    originalLog(...args);
    writeLine('INFO', args);
  };

  console.error = (...args) => {
    originalError(...args);
    writeLine('ERROR', args);
  };
}

setupFileLogging();

const targetContactIds = new Set(TARGET_CONTACT_IDS_RAW.map(normalizeContactId).filter(Boolean));
const targetContactNames = new Set(
  TARGET_CONTACT_NAMES_RAW
    .map((name) => name.toLowerCase())
    .filter(Boolean)
);
const resolvedTargetIds = new Set();

if (!hasConfiguredTargets() && !APP_BRIDGE) {
  console.error('Missing config: set TARGET_CONTACT_IDS, TARGET_CONTACT_ID, TARGET_CONTACT_NAMES, or TARGET_CONTACT_NAME in .env');
  process.exit(1);
}

const seenMessageIds = new Set();

function resolveConfiguredPath(rawValue, fallbackValue) {
  return path.resolve(PATH_BASE, rawValue || fallbackValue);
}

function splitEnvList(raw) {
  return String(raw || '')
    .split(/[\n,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function hasConfiguredTargets() {
  return targetContactIds.size > 0 || targetContactNames.size > 0;
}

function emitAppEvent(type, payload = {}) {
  if (!APP_BRIDGE) {
    return;
  }

  try {
    process.stdout.write(`SM3000_EVENT ${JSON.stringify({ type, ...payload })}\n`);
  } catch (_error) {
    // App events are best-effort; normal file/terminal logging remains available.
  }
}

function normalizeContactId(raw) {
  if (!raw) {
    return '';
  }

  const cleaned = raw.trim();
  if (cleaned.includes('@')) {
    return cleaned;
  }

  const digits = cleaned.replace(/[^\d]/g, '');
  if (!digits) {
    return '';
  }

  return `${digits}@c.us`;
}

function sanitizeSegment(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9_.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64) || 'unknown';
}

function timestampForFilename(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractPhoneFromWhatsAppId(chatId) {
  if (!chatId || !chatId.endsWith('@c.us')) {
    return '';
  }

  return chatId.slice(0, -'@c.us'.length).replace(/[^\d]/g, '');
}

function pathExists(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch (_error) {
    try {
      fs.accessSync(filePath, fs.constants.F_OK);
      return true;
    } catch (_nestedError) {
      return false;
    }
  }
}

function browserExecutableCandidates() {
  if (process.platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];
  }

  if (process.platform === 'win32') {
    const roots = [
      process.env.PROGRAMFILES,
      process.env['PROGRAMFILES(X86)'],
      process.env.LOCALAPPDATA,
    ].filter(Boolean);

    return roots.flatMap((root) => [
      path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ]);
  }

  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ];
}

function findBrowserExecutable() {
  if (PUPPETEER_EXECUTABLE_PATH) {
    return PUPPETEER_EXECUTABLE_PATH;
  }

  return browserExecutableCandidates().find(pathExists) || '';
}

async function resolveTargetByName(client, desiredName) {
  if (!desiredName) {
    return '';
  }

  const lowered = desiredName.toLowerCase();

  const contacts = await client.getContacts();
  const contactMatches = contacts.filter((contact) => {
    const names = [contact.name, contact.pushname, contact.shortName]
      .filter(Boolean)
      .map((name) => name.toLowerCase());

    return names.includes(lowered);
  });

  if (contactMatches.length === 1) {
    return contactMatches[0].id._serialized;
  }

  if (contactMatches.length > 1) {
    console.warn(
      `Warning: multiple contacts matched name "${desiredName}" in address book. Falling back to runtime message checks.`
    );
    return '';
  }

  const chats = await client.getChats();
  const chatMatches = chats.filter((chat) => chat.name && chat.name.toLowerCase() === lowered);

  if (chatMatches.length === 1) {
    return chatMatches[0].id._serialized;
  }

  if (chatMatches.length > 1) {
    console.warn(
      `Warning: multiple chats matched name "${desiredName}". Falling back to runtime message checks.`
    );
  }

  return '';
}

async function ensureDirectories() {
  await fsp.mkdir(SCREENSHOT_DIR, { recursive: true });
  await fsp.mkdir(LOCAL_AUTH_PATH, { recursive: true });
}

function buildClient() {
  const puppeteerOptions = {
    headless: HEADLESS,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  };
  const executablePath = findBrowserExecutable();

  if (executablePath) {
    puppeteerOptions.executablePath = executablePath;
  }

  return new Client({
    authStrategy: new LocalAuth({
      dataPath: LOCAL_AUTH_PATH,
    }),
    puppeteer: puppeteerOptions,
    takeoverOnConflict: true,
    takeoverTimeoutMs: 0,
  });
}

function upsertContact(contactMap, id, label, phone) {
  if (!id || !id.endsWith('@c.us')) {
    return;
  }

  const existing = contactMap.get(id);
  const cleanLabel = String(label || '').trim();
  const nextLabel = cleanLabel || existing?.label || phone || id;

  contactMap.set(id, {
    id,
    label: nextLabel,
    phone: phone || existing?.phone || extractPhoneFromWhatsAppId(id),
  });
}

async function emitContactsForApp(client) {
  if (!APP_BRIDGE) {
    return;
  }

  try {
    const contactMap = new Map();
    const contacts = await client.getContacts();
    for (const contact of contacts) {
      const id = contact?.id?._serialized;
      upsertContact(
        contactMap,
        id,
        contact?.name || contact?.pushname || contact?.shortName,
        extractPhoneFromWhatsAppId(id)
      );
    }

    const chats = await client.getChats();
    for (const chat of chats) {
      const id = chat?.id?._serialized;
      upsertContact(contactMap, id, chat?.name, extractPhoneFromWhatsAppId(id));
    }

    const contactsForApp = [...contactMap.values()].sort((a, b) => {
      return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
    });

    emitAppEvent('contacts', { contacts: contactsForApp });
  } catch (error) {
    emitAppEvent('contacts-error', { message: error?.message || String(error) });
  }
}

async function takeScreenshot(client, message, displayName) {
  if (!client.pupPage) {
    throw new Error('WhatsApp page is not ready for screenshot capture.');
  }

  const contactSegment = sanitizeSegment(displayName || message.from);
  const fromSegment = sanitizeSegment(message.from);
  const messageId = sanitizeSegment(message.id?._serialized || 'noid');
  const ts = timestampForFilename();
  const filename = `${ts}__${contactSegment}__${fromSegment}__${messageId}.png`;
  const outputPath = path.join(SCREENSHOT_DIR, filename);

  await client.pupPage.screenshot({
    path: outputPath,
    fullPage: FULL_PAGE_SCREENSHOT,
  });

  return outputPath;
}

async function focusTargetChatInUi(client, message) {
  if (!AUTO_OPEN_CHAT_BEFORE_SCREENSHOT || !client.pupPage) {
    return;
  }

  const messageId = message.id?._serialized;
  const chatId = message.from;
  let opened = false;

  if (client.interface) {
    if (messageId && typeof client.interface.openChatWindowAt === 'function') {
      try {
        await client.interface.openChatWindowAt(messageId);
        opened = true;
        if (DEBUG_FOCUS) {
          console.log(`[focus] openChatWindowAt succeeded for ${messageId}`);
        }
      } catch (_err) {
        if (DEBUG_FOCUS) {
          console.log(`[focus] openChatWindowAt failed: ${_err?.message || _err}`);
        }
        // Try a less specific open call below.
      }
    }

    if (!opened && chatId && typeof client.interface.openChatWindow === 'function') {
      try {
        await client.interface.openChatWindow(chatId);
        opened = true;
        if (DEBUG_FOCUS) {
          console.log(`[focus] openChatWindow succeeded for ${chatId}`);
        }
      } catch (_err) {
        if (DEBUG_FOCUS) {
          console.log(`[focus] openChatWindow failed: ${_err?.message || _err}`);
        }
        // URL fallback below.
      }
    }
  } else if (DEBUG_FOCUS) {
    console.log('[focus] client.interface is unavailable');
  }

  // URL fallback for environments where interface calls are unavailable.
  const phone = extractPhoneFromWhatsAppId(chatId);
  if (!opened && phone) {
    const targetUrl = `https://web.whatsapp.com/send?phone=${phone}&app_absent=0`;
    await client.pupPage.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    opened = true;
    if (DEBUG_FOCUS) {
      console.log(`[focus] URL fallback succeeded for ${chatId}`);
    }
  } else if (!opened && DEBUG_FOCUS) {
    console.log(`[focus] No fallback path available for chat id ${chatId}`);
  }

  // Final nudge: scroll any visible message list containers to the bottom.
  await client.pupPage.evaluate(() => {
    const candidates = [
      '[aria-label=\"Message list\"]',
      '[data-testid=\"conversation-panel-body\"]',
      '[data-testid=\"chat-history\"]',
    ];

    for (const selector of candidates) {
      const node = document.querySelector(selector);
      if (node) {
        node.scrollTop = node.scrollHeight;
      }
    }
  }).catch(() => {});
}

async function waitForMessageToRender(client, message) {
  if (!client.pupPage) {
    return;
  }

  const preview = (message.body || '').trim();
  if (preview.length > 0) {
    const needle = preview.slice(0, 80);
    try {
      await client.pupPage.waitForFunction(
        (text) => document?.body?.innerText?.includes(text),
        { timeout: Math.max(2000, MESSAGE_RENDER_WAIT_MS + 1000) },
        needle,
      );
      return;
    } catch (_err) {
      // Fallback to timed wait below.
    }
  }

  await delay(Math.max(0, MESSAGE_RENDER_WAIT_MS));
}

async function isTargetMessage(message) {
  if (!message || message.fromMe || !message.from) {
    return false;
  }

  if (targetContactIds.has(message.from)) {
    return true;
  }

  if (targetContactNames.size === 0) {
    return false;
  }

  const contact = await message.getContact();
  const chat = await message.getChat();

  const names = [
    contact?.name,
    contact?.pushname,
    contact?.shortName,
    chat?.name,
  ]
    .filter(Boolean)
    .map((name) => name.toLowerCase());

  return names.some((name) => targetContactNames.has(name));
}

function attachClientHandlers(client) {
  client.on('qr', (qr) => {
    emitAppEvent('qr', { qr });

    if (APP_BRIDGE) {
      console.log('WhatsApp login required. QR code sent to app window.');
      return;
    }

    console.log('\nScan this QR code with your WhatsApp app:');
    qrcode.generate(qr, { small: true });
    console.log('Waiting for authentication...\n');
  });

  client.on('authenticated', () => {
    emitAppEvent('authenticated');
    console.log('Authenticated. Restoring session...');
  });

  client.on('ready', async () => {
    emitAppEvent('status', { status: 'ready' });
    console.log('WhatsApp Web client is ready.');

    for (const targetContactNameRaw of TARGET_CONTACT_NAMES_RAW) {
      const resolvedId = await resolveTargetByName(client, targetContactNameRaw);
      if (resolvedId) {
        targetContactIds.add(resolvedId);
        resolvedTargetIds.add(resolvedId);
        console.log(`Resolved target contact name "${targetContactNameRaw}" to id: ${resolvedId}`);
      } else {
        console.log(`Could not uniquely resolve target contact name "${targetContactNameRaw}". Using runtime name matching only.`);
      }
    }

    if (targetContactIds.size > 0) {
      const ids = [...targetContactIds].map((id) => `${id}${resolvedTargetIds.has(id) ? ' (resolved from name)' : ''}`);
      console.log(`Monitoring contact ids: ${ids.join(', ')}`);
    }

    if (TARGET_CONTACT_NAMES_RAW.length > 0) {
      console.log(`Monitoring contact names: ${TARGET_CONTACT_NAMES_RAW.join(', ')}`);
    }

    if (!hasConfiguredTargets()) {
      console.log('No target contacts configured yet. Use the app window to select contacts.');
    }

    console.log(`Saving screenshots to: ${SCREENSHOT_DIR}`);
    console.log('Listening for new messages...\n');
    emitAppEvent('ready', {
      screenshotDir: SCREENSHOT_DIR,
      targetContactIds: [...targetContactIds],
      targetContactNames: TARGET_CONTACT_NAMES_RAW,
    });
    await emitContactsForApp(client);
  });

  client.on('message', async (message) => {
    try {
      const messageId = message.id?._serialized;
      if (messageId && seenMessageIds.has(messageId)) {
        return;
      }

      const match = await isTargetMessage(message);
      if (!match) {
        return;
      }

      if (messageId) {
        seenMessageIds.add(messageId);
      }

      const contact = await message.getContact();
      const displayName = contact?.pushname || contact?.name || message.from;
      await focusTargetChatInUi(client, message);
      await waitForMessageToRender(client, message);
      const screenshotPath = await takeScreenshot(client, message, displayName);

      console.log(`[${new Date().toISOString()}] Message matched from ${displayName} (${message.from})`);
      console.log(`Screenshot saved: ${screenshotPath}`);
      emitAppEvent('screenshot', {
        path: screenshotPath,
        displayName,
        from: message.from,
      });
      if (message.body) {
        console.log(`Message preview: ${message.body.slice(0, 120)}`);
      }
      console.log('');
    } catch (error) {
      console.error('Failed to process incoming message:', error);
      emitAppEvent('error', { message: error?.message || String(error) });
    }
  });

  client.on('auth_failure', (msg) => {
    emitAppEvent('auth_failure', { message: msg });
    console.error('Authentication failure:', msg);
  });
}

async function destroyClientSafely(client) {
  if (!client) {
    return;
  }

  try {
    await client.destroy();
  } catch (_error) {
    // Client may already be torn down after disconnect.
  }
}

function reconnectDelayMs(attempt) {
  return Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * attempt);
}

async function runClientSession() {
  const client = buildClient();
  attachClientHandlers(client);

  let disconnectedResolve;
  const disconnected = new Promise((resolve) => {
    disconnectedResolve = resolve;
  });

  client.on('disconnected', (reason) => {
    emitAppEvent('disconnected', { reason });
    console.error('Client disconnected:', reason);
    disconnectedResolve(reason);
  });

  try {
    await client.initialize();
    await disconnected;
  } finally {
    await destroyClientSafely(client);
  }
}

async function main() {
  await ensureDirectories();

  let reconnectAttempts = 0;

  while (true) {
    try {
      await runClientSession();
      reconnectAttempts = 0;
      console.log('Session ended. Reconnecting...');
    } catch (error) {
      reconnectAttempts += 1;
      const waitMs = reconnectDelayMs(reconnectAttempts);
      console.error(`Connection error: ${error?.message || error}`);
      console.log(`Retrying in ${Math.round(waitMs / 1000)}s...`);
      await delay(waitMs);
      continue;
    }

    reconnectAttempts += 1;
    const waitMs = reconnectDelayMs(reconnectAttempts);
    console.log(`Reconnecting in ${Math.round(waitMs / 1000)}s...`);
    await delay(waitMs);
  }
}

main().catch((error) => {
  emitAppEvent('fatal', { message: error?.message || String(error) });
  console.error('Fatal error:', error);
  process.exit(1);
});
