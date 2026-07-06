#!/usr/bin/env node

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');

const CONFIG_FILE = process.env.CONFIG_FILE ? path.resolve(process.env.CONFIG_FILE) : undefined;
require('dotenv').config({
  path: CONFIG_FILE,
  quiet: true,
  override: true,
});

const APP_BRIDGE = process.env.APP_BRIDGE === '1';
const APP_EVENT_CHANNEL = 'sm3000:event';
const PATH_BASE = path.resolve(process.env.APP_DATA_DIR || (CONFIG_FILE ? path.dirname(CONFIG_FILE) : process.cwd()));
const SCREENSHOT_DIR = resolveConfiguredPath(process.env.SCREENSHOT_DIR, './screenshots');
const LOCAL_AUTH_PATH = resolveConfiguredPath(process.env.LOCAL_AUTH_PATH, './.wwebjs_auth');
const TARGET_CONTACT_IDS_RAW = splitEnvList(process.env.TARGET_CONTACT_IDS || process.env.TARGET_CONTACT_ID || '');
const TARGET_CONTACT_NAMES_RAW = splitEnvList(process.env.TARGET_CONTACT_NAMES || process.env.TARGET_CONTACT_NAME || '');
const TELEGRAM_TARGET_CHAT_NAMES_RAW = splitEnvList(process.env.TELEGRAM_TARGET_CHAT_NAMES || process.env.TELEGRAM_TARGET_CHAT_NAME || '');
const TELEGRAM_AUTH_PATH = resolveConfiguredPath(process.env.TELEGRAM_AUTH_PATH, './.telegram_auth');
const TELEGRAM_POLL_MS = Number(process.env.TELEGRAM_POLL_MS || 3000);
const TELEGRAM_WEB_URL = (process.env.TELEGRAM_WEB_URL || 'https://web.telegram.org/k/').trim();
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
const WHATSAPP_CHAT_WINDOW_SELECTORS = [
  '#main',
  '[data-testid="conversation-panel-wrapper"]',
  '[data-testid="conversation-panel"]',
];
const TELEGRAM_CHAT_WINDOW_SELECTORS = [
  '#column-center',
  '.middle-column',
  '.chat.tabs-tab.active',
  '.chat.active',
];

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
const telegramTargetChatNames = TELEGRAM_TARGET_CHAT_NAMES_RAW.filter(Boolean);
const resolvedTargetIds = new Set();
let puppeteerModule;

if (!hasConfiguredTargets() && !hasTelegramTargets() && !APP_BRIDGE) {
  console.error('Missing config: set WhatsApp TARGET_CONTACT_* or TELEGRAM_TARGET_CHAT_NAMES in .env');
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

function hasTelegramTargets() {
  return telegramTargetChatNames.length > 0;
}

function emitAppEvent(type, payload = {}) {
  if (!APP_BRIDGE) {
    return;
  }

  try {
    if (typeof process.send === 'function') {
      process.send({
        channel: APP_EVENT_CHANNEL,
        event: { type, ...payload },
      });
    }
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

function hashSegment(value) {
  return crypto
    .createHash('sha1')
    .update(String(value || ''))
    .digest('hex')
    .slice(0, 10);
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

async function findChatWindowClip(page, selectors) {
  return page.evaluate((candidateSelectors) => {
    const isVisible = (node) => {
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width > 240
        && rect.height > 240
        && style.visibility !== 'hidden'
        && style.display !== 'none';
    };

    for (const selector of candidateSelectors) {
      const candidates = [...document.querySelectorAll(selector)]
        .filter(isVisible)
        .map((node) => {
          const rect = node.getBoundingClientRect();
          const left = Math.max(0, rect.left);
          const top = Math.max(0, rect.top);
          const right = Math.min(window.innerWidth, rect.right);
          const bottom = Math.min(window.innerHeight, rect.bottom);

          return {
            x: Math.floor(left),
            y: Math.floor(top),
            width: Math.ceil(right - left),
            height: Math.ceil(bottom - top),
          };
        })
        .filter((rect) => rect.width > 240 && rect.height > 240)
        .sort((a, b) => (b.width * b.height) - (a.width * a.height));

      if (candidates[0]) {
        return candidates[0];
      }
    }

    return null;
  }, selectors).catch(() => null);
}

async function screenshotChatWindow(page, outputPath, selectors) {
  const clip = await findChatWindowClip(page, selectors);
  const options = clip
    ? { path: outputPath, clip }
    : { path: outputPath, fullPage: FULL_PAGE_SCREENSHOT };

  await page.screenshot(options);
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
  await fsp.mkdir(TELEGRAM_AUTH_PATH, { recursive: true });
}

function buildClient() {
  const puppeteerOptions = {
    headless: HEADLESS,
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

function getPuppeteer() {
  if (!puppeteerModule) {
    puppeteerModule = require('puppeteer');
  }

  return puppeteerModule;
}

function buildTelegramLaunchOptions() {
  const launchOptions = {
    headless: HEADLESS,
    userDataDir: TELEGRAM_AUTH_PATH,
    defaultViewport: null,
  };
  const executablePath = findBrowserExecutable();

  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }

  return launchOptions;
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

  await screenshotChatWindow(client.pupPage, outputPath, WHATSAPP_CHAT_WINDOW_SELECTORS);

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

async function waitForTelegramLogin(page) {
  let announced = false;

  while (true) {
    const loggedIn = await page.evaluate(() => {
      const text = document.body?.innerText || '';
      const hasChatList = Boolean(document.querySelector(
        '.chatlist, .chat-list, .dialogs-list, [class*="chatlist"], [class*="dialogs-list"]'
      ));
      return hasChatList || /Saved Messages|Archived Chats/i.test(text);
    }).catch(() => false);

    if (loggedIn) {
      return;
    }

    if (!announced) {
      announced = true;
      emitAppEvent('telegram-login');
      console.log('Telegram login required. Use the opened Telegram Web browser window to sign in.');
    }

    await delay(5000);
  }
}

async function focusTelegramSearch(page) {
  const selectors = [
    'input[placeholder="Search"]',
    'input[placeholder*="Search"]',
    '.input-search input',
    '#telegram-search-input',
    '[contenteditable="true"][aria-label*="Search"]',
    '[contenteditable="true"][placeholder*="Search"]',
  ];

  for (const selector of selectors) {
    const input = await page.$(selector).catch(() => null);
    if (!input) {
      continue;
    }

    await input.click({ clickCount: 3 });
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.down(modifier).catch(() => {});
    await page.keyboard.press('A').catch(() => {});
    await page.keyboard.up(modifier).catch(() => {});
    return true;
  }

  return page.evaluate(() => {
    const normalize = (value) => String(value || '').trim().toLowerCase();
    const candidates = [...document.querySelectorAll('input, [contenteditable="true"], [role="searchbox"]')];
    const input = candidates.find((node) => {
      const text = normalize(node.getAttribute('placeholder') || node.getAttribute('aria-label') || node.textContent);
      const rect = node.getBoundingClientRect();
      return rect.width > 40 && rect.height > 12 && text.includes('search');
    });

    if (!input) {
      return false;
    }

    input.focus();
    if ('value' in input) {
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return true;
  });
}

async function clickTelegramChatByName(page, chatName) {
  return page.evaluate((desiredName) => {
    const normalize = (value) => String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    const wanted = normalize(desiredName);
    const isVisible = (node) => {
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width > 20 && rect.height > 12 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const leftSide = (node) => node.getBoundingClientRect().left < window.innerWidth * 0.58;
    const matches = (node) => {
      const title = normalize(node.getAttribute('title'));
      const label = normalize(node.getAttribute('aria-label'));
      const lines = String(node.innerText || '')
        .split('\n')
        .map(normalize)
        .filter(Boolean);

      return title === wanted || label === wanted || lines.includes(wanted);
    };
    const nodes = [...document.querySelectorAll('a, button, [role="button"], .chatlist-chat, [class*="chatlist-chat"], [class*="ListItem"]')]
      .filter((node) => isVisible(node) && leftSide(node) && matches(node));

    const node = nodes[0];
    if (!node) {
      return false;
    }

    const clickable = node.closest('a, button, [role="button"], .chatlist-chat, [class*="chatlist-chat"]') || node;
    clickable.click();
    return true;
  }, chatName).catch(() => false);
}

async function openTelegramChat(page, chatName) {
  if (await clickTelegramChatByName(page, chatName)) {
    await delay(Math.max(700, MESSAGE_RENDER_WAIT_MS));
    return true;
  }

  if (!await focusTelegramSearch(page)) {
    return false;
  }

  await page.keyboard.type(chatName, { delay: 20 });
  await delay(1200);

  if (await clickTelegramChatByName(page, chatName)) {
    await delay(Math.max(700, MESSAGE_RENDER_WAIT_MS));
    return true;
  }

  await page.keyboard.press('Enter').catch(() => {});
  await delay(Math.max(700, MESSAGE_RENDER_WAIT_MS));
  return clickTelegramChatByName(page, chatName);
}

async function getTelegramLastMessageState(page) {
  return page.evaluate(() => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const isVisible = (node) => {
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width > 30 && rect.height > 12 && style.visibility !== 'hidden' && style.display !== 'none';
    };

    const scrollables = [...document.querySelectorAll('*')]
      .filter((node) => node.scrollHeight > node.clientHeight + 80 && node.getBoundingClientRect().left > window.innerWidth * 0.25)
      .sort((a, b) => b.scrollHeight - a.scrollHeight);
    if (scrollables[0]) {
      scrollables[0].scrollTop = scrollables[0].scrollHeight;
    }

    const selectors = ['[data-message-id]', '.message', '[class*="message"]', '.bubble', '[class*="bubble"]'];
    const seen = new Set();
    const messages = [];

    for (const selector of selectors) {
      for (const node of document.querySelectorAll(selector)) {
        if (seen.has(node) || !isVisible(node)) {
          continue;
        }
        seen.add(node);

        const rect = node.getBoundingClientRect();
        if (rect.left < window.innerWidth * 0.22) {
          continue;
        }

        const text = normalize(node.innerText);
        if (!text || text.length < 2 || /^(today|yesterday|unread messages)$/i.test(text)) {
          continue;
        }

        const className = String(node.className || '').toLowerCase();
        const own = /\bown\b|is-out|outgoing|message-out/.test(className) || rect.left > window.innerWidth * 0.62;
        messages.push({
          text,
          own,
          bottom: rect.bottom,
        });
      }
    }

    messages.sort((a, b) => a.bottom - b.bottom);
    const incoming = messages.filter((message) => !message.own);
    const relevant = incoming.length > 0 ? incoming : messages;
    const tail = relevant.slice(-5);
    const latest = tail[tail.length - 1];

    if (!latest) {
      return null;
    }

    return {
      signature: tail.map((message) => message.text).join('\n---\n'),
      preview: latest.text.slice(0, 160),
    };
  }).catch(() => null);
}

async function takeTelegramScreenshot(page, chatName, state) {
  const ts = timestampForFilename();
  const filename = `${ts}__Telegram__${sanitizeSegment(chatName)}__${hashSegment(state?.signature)}.png`;
  const outputPath = path.join(SCREENSHOT_DIR, filename);

  await screenshotChatWindow(page, outputPath, TELEGRAM_CHAT_WINDOW_SELECTORS);

  return outputPath;
}

async function runTelegramSession() {
  const browser = await getPuppeteer().launch(buildTelegramLaunchOptions());
  const page = await browser.newPage();
  const lastSeenByChat = new Map();

  try {
    page.setDefaultTimeout(30_000);
    await page.goto(TELEGRAM_WEB_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await waitForTelegramLogin(page);

    console.log('Telegram Web client is ready.');
    console.log(`Monitoring Telegram chats: ${telegramTargetChatNames.join(', ')}`);
    emitAppEvent('telegram-ready', { targetChatNames: telegramTargetChatNames });

    for (const chatName of telegramTargetChatNames) {
      if (!await openTelegramChat(page, chatName)) {
        console.warn(`Could not open Telegram chat "${chatName}". Will retry during polling.`);
        continue;
      }

      const state = await getTelegramLastMessageState(page);
      if (state?.signature) {
        lastSeenByChat.set(chatName, state.signature);
      }
    }

    while (true) {
      for (const chatName of telegramTargetChatNames) {
        try {
          if (!await openTelegramChat(page, chatName)) {
            console.warn(`Could not open Telegram chat "${chatName}".`);
            continue;
          }

          const state = await getTelegramLastMessageState(page);
          if (!state?.signature) {
            continue;
          }

          const previous = lastSeenByChat.get(chatName);
          if (!previous) {
            lastSeenByChat.set(chatName, state.signature);
            continue;
          }

          if (state.signature === previous) {
            continue;
          }

          lastSeenByChat.set(chatName, state.signature);
          await delay(Math.max(0, MESSAGE_RENDER_WAIT_MS));
          const screenshotPath = await takeTelegramScreenshot(page, chatName, state);

          console.log(`[${new Date().toISOString()}] Telegram message matched in ${chatName}`);
          console.log(`Screenshot saved: ${screenshotPath}`);
          console.log(`Message preview: ${state.preview}`);
          console.log('');
          emitAppEvent('screenshot', {
            path: screenshotPath,
            displayName: chatName,
            from: 'telegram',
          });
        } catch (error) {
          console.error(`Failed to process Telegram chat "${chatName}":`, error);
          emitAppEvent('error', { message: error?.message || String(error) });
        }
      }

      await delay(Math.max(1000, TELEGRAM_POLL_MS));
    }
  } finally {
    await browser.close().catch(() => {});
  }
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

async function runWhatsAppForever() {
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

async function runTelegramForever() {
  let reconnectAttempts = 0;

  while (true) {
    try {
      await runTelegramSession();
      reconnectAttempts = 0;
      console.log('Telegram session ended. Reconnecting...');
    } catch (error) {
      reconnectAttempts += 1;
      const waitMs = reconnectDelayMs(reconnectAttempts);
      console.error(`Telegram connection error: ${error?.message || error}`);
      console.log(`Retrying Telegram in ${Math.round(waitMs / 1000)}s...`);
      await delay(waitMs);
      continue;
    }

    reconnectAttempts += 1;
    const waitMs = reconnectDelayMs(reconnectAttempts);
    console.log(`Reconnecting Telegram in ${Math.round(waitMs / 1000)}s...`);
    await delay(waitMs);
  }
}

async function main() {
  await ensureDirectories();

  const sessions = [];

  if (hasConfiguredTargets() || (APP_BRIDGE && !hasTelegramTargets())) {
    sessions.push(runWhatsAppForever());
  }

  if (hasTelegramTargets()) {
    sessions.push(runTelegramForever());
  }

  if (sessions.length === 0) {
    console.error('No WhatsApp or Telegram targets configured.');
    return;
  }

  await Promise.all(sessions);
}

main().catch((error) => {
  emitAppEvent('fatal', { message: error?.message || String(error) });
  console.error('Fatal error:', error);
  process.exit(1);
});
