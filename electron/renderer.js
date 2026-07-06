const appApi = window.screenshotApp;

let state;
let formDirty = false;

const elements = {
  statusDot: document.querySelector('#statusDot'),
  monitorStatus: document.querySelector('#monitorStatus'),
  startButton: document.querySelector('#startButton'),
  stopButton: document.querySelector('#stopButton'),
  restartButton: document.querySelector('#restartButton'),
  qrPanel: document.querySelector('#qrPanel'),
  qrImage: document.querySelector('#qrImage'),
  whatsappServiceStatus: document.querySelector('#whatsappServiceStatus'),
  whatsappServiceTargets: document.querySelector('#whatsappServiceTargets'),
  telegramServiceStatus: document.querySelector('#telegramServiceStatus'),
  telegramServiceTargets: document.querySelector('#telegramServiceTargets'),
  targetNames: document.querySelector('#targetNames'),
  telegramChatNames: document.querySelector('#telegramChatNames'),
  screenshotPath: document.querySelector('#screenshotPath'),
  screenshotDir: document.querySelector('#screenshotDir'),
  chooseScreenshotsButton: document.querySelector('#chooseScreenshotsButton'),
  openScreenshotsButton: document.querySelector('#openScreenshotsButton'),
  configPath: document.querySelector('#configPath'),
  saveButton: document.querySelector('#saveButton'),
  localAuthPath: document.querySelector('#localAuthPath'),
  telegramAuthPath: document.querySelector('#telegramAuthPath'),
  telegramPoll: document.querySelector('#telegramPoll'),
  logFile: document.querySelector('#logFile'),
  messageWait: document.querySelector('#messageWait'),
  reconnectBase: document.querySelector('#reconnectBase'),
  reconnectMax: document.querySelector('#reconnectMax'),
  browserPath: document.querySelector('#browserPath'),
  headless: document.querySelector('#headless'),
  fullPage: document.querySelector('#fullPage'),
  autoOpenChat: document.querySelector('#autoOpenChat'),
  logToFile: document.querySelector('#logToFile'),
  debugFocus: document.querySelector('#debugFocus'),
  extraSettings: document.querySelector('#extraSettings'),
  lastUpdate: document.querySelector('#lastUpdate'),
  logOutput: document.querySelector('#logOutput'),
};

function splitList(value) {
  return String(value || '')
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinLines(value) {
  return splitList(value).join('\n');
}

function boolValue(input) {
  return input ? 'true' : 'false';
}

function setCheckbox(element, value) {
  element.checked = String(value || '').toLowerCase() === 'true';
}

function setServiceState(element, status) {
  element.textContent = status;
  element.className = 'service-state';

  if (/monitoring|ready/i.test(status)) {
    element.classList.add('ready');
  } else if (/attention|error|failure|fatal|disconnected/i.test(status)) {
    element.classList.add('error');
  } else if (/starting|stopping|login|authenticated|target/i.test(status)) {
    element.classList.add('pending');
  }
}

function renderMonitoring() {
  const values = state.values || {};
  const services = state.monitor.services || {};
  const whatsappNames = splitList(values.TARGET_CONTACT_NAMES);
  const telegramChats = splitList(values.TELEGRAM_TARGET_CHAT_NAMES);

  setServiceState(elements.whatsappServiceStatus, services.whatsapp || 'Stopped');
  setServiceState(elements.telegramServiceStatus, services.telegram || 'Stopped');
  elements.whatsappServiceTargets.textContent = whatsappNames.length > 0
    ? `Names: ${whatsappNames.join(', ')}`
    : 'No WhatsApp targets';
  elements.telegramServiceTargets.textContent = telegramChats.length > 0
    ? `Chats: ${telegramChats.join(', ')}`
    : 'No Telegram chats';
}

function renderStatus() {
  const status = state.monitor.status || 'Stopped';
  elements.monitorStatus.textContent = status;
  elements.statusDot.classList.toggle('running', state.monitor.running && !/attention|error|failure/i.test(status));
  elements.statusDot.classList.toggle('error', /attention|error|failure|fatal/i.test(status));
  elements.startButton.disabled = state.monitor.running;
  elements.stopButton.disabled = !state.monitor.running;
  elements.restartButton.disabled = !state.monitor.running;
}

function renderQr() {
  const hasQr = Boolean(state.monitor.qrDataUrl);
  elements.qrPanel.classList.toggle('hidden', !hasQr);
  if (hasQr) {
    elements.qrImage.src = state.monitor.qrDataUrl;
  } else {
    elements.qrImage.removeAttribute('src');
  }
}

function renderConfig() {
  if (formDirty) {
    return;
  }

  const values = state.values;
  elements.targetNames.value = joinLines(values.TARGET_CONTACT_NAMES);
  elements.telegramChatNames.value = joinLines(values.TELEGRAM_TARGET_CHAT_NAMES);
  elements.screenshotDir.value = values.SCREENSHOT_DIR || '';
  elements.localAuthPath.value = values.LOCAL_AUTH_PATH || '';
  elements.telegramAuthPath.value = values.TELEGRAM_AUTH_PATH || '';
  elements.telegramPoll.value = values.TELEGRAM_POLL_MS || '';
  elements.logFile.value = values.LOG_FILE || '';
  elements.messageWait.value = values.MESSAGE_RENDER_WAIT_MS || '';
  elements.reconnectBase.value = values.RECONNECT_BASE_MS || '';
  elements.reconnectMax.value = values.RECONNECT_MAX_MS || '';
  elements.browserPath.value = values.PUPPETEER_EXECUTABLE_PATH || '';
  setCheckbox(elements.headless, values.HEADLESS);
  setCheckbox(elements.fullPage, values.FULL_PAGE_SCREENSHOT);
  setCheckbox(elements.autoOpenChat, values.AUTO_OPEN_CHAT_BEFORE_SCREENSHOT);
  setCheckbox(elements.logToFile, values.LOG_TO_FILE);
  setCheckbox(elements.debugFocus, values.DEBUG_FOCUS);
  elements.screenshotPath.textContent = state.paths.screenshotDir;
  elements.configPath.textContent = state.configPath;
  renderExtraSettings();
}

function renderExtraSettings() {
  const entries = Object.entries(state.extra || {});
  elements.extraSettings.innerHTML = '';

  for (const [key, value] of entries) {
    const label = document.createElement('label');
    label.textContent = key;

    const input = document.createElement('input');
    input.type = 'text';
    input.dataset.extraKey = key;
    input.value = value;
    input.spellcheck = false;
    input.addEventListener('input', markFormDirty);

    label.append(input);
    elements.extraSettings.append(label);
  }
}

function renderLogs() {
  const lines = (state.logs || []).slice(-120).map((entry) => {
    const time = new Date(entry.at).toLocaleTimeString();
    return `[${time}] ${entry.text}`;
  });
  elements.logOutput.textContent = lines.join('\n');
  elements.logOutput.scrollTop = elements.logOutput.scrollHeight;
  elements.lastUpdate.textContent = state.logs?.length ? 'Live' : 'Waiting';
}

function render() {
  if (!state) {
    return;
  }

  renderStatus();
  renderQr();
  renderMonitoring();
  renderConfig();
  renderLogs();
}

function markFormDirty() {
  formDirty = true;
}

function collectConfig() {
  const extra = {};
  for (const input of elements.extraSettings.querySelectorAll('[data-extra-key]')) {
    extra[input.dataset.extraKey] = input.value;
  }

  return {
    values: {
      ...state.values,
      TARGET_CONTACT_IDS: '',
      TARGET_CONTACT_NAMES: splitList(elements.targetNames.value).join(','),
      TELEGRAM_TARGET_CHAT_NAMES: splitList(elements.telegramChatNames.value).join(','),
      SCREENSHOT_DIR: elements.screenshotDir.value.trim(),
      LOCAL_AUTH_PATH: elements.localAuthPath.value.trim(),
      TELEGRAM_AUTH_PATH: elements.telegramAuthPath.value.trim(),
      TELEGRAM_POLL_MS: String(Math.max(1000, Number(elements.telegramPoll.value || 1000))),
      HEADLESS: boolValue(elements.headless.checked),
      FULL_PAGE_SCREENSHOT: boolValue(elements.fullPage.checked),
      AUTO_OPEN_CHAT_BEFORE_SCREENSHOT: boolValue(elements.autoOpenChat.checked),
      MESSAGE_RENDER_WAIT_MS: String(Math.max(0, Number(elements.messageWait.value || 0))),
      DEBUG_FOCUS: boolValue(elements.debugFocus.checked),
      RECONNECT_BASE_MS: String(Math.max(1000, Number(elements.reconnectBase.value || 1000))),
      RECONNECT_MAX_MS: String(Math.max(1000, Number(elements.reconnectMax.value || 1000))),
      LOG_TO_FILE: boolValue(elements.logToFile.checked),
      LOG_FILE: elements.logFile.value.trim(),
      PUPPETEER_EXECUTABLE_PATH: elements.browserPath.value.trim(),
    },
    extra,
  };
}

async function saveAndRestart() {
  state = await appApi.saveConfig(collectConfig());
  formDirty = false;
  render();
  state = await appApi.restartMonitor();
  render();
}

elements.startButton.addEventListener('click', async () => {
  state = await appApi.startMonitor();
  render();
});

elements.stopButton.addEventListener('click', async () => {
  state = await appApi.stopMonitor();
  render();
});

elements.restartButton.addEventListener('click', async () => {
  state = await appApi.restartMonitor();
  render();
});

elements.targetNames.addEventListener('input', markFormDirty);
elements.telegramChatNames.addEventListener('input', markFormDirty);

elements.chooseScreenshotsButton.addEventListener('click', async () => {
  const selected = await appApi.chooseFolder(elements.screenshotDir.value);
  if (selected) {
    elements.screenshotDir.value = selected;
    markFormDirty();
  }
});

elements.openScreenshotsButton.addEventListener('click', async () => {
  await appApi.openPath(elements.screenshotDir.value);
});

elements.saveButton.addEventListener('click', saveAndRestart);

for (const input of [
  elements.screenshotDir,
  elements.localAuthPath,
  elements.telegramAuthPath,
  elements.telegramPoll,
  elements.logFile,
  elements.messageWait,
  elements.reconnectBase,
  elements.reconnectMax,
  elements.browserPath,
  elements.headless,
  elements.fullPage,
  elements.autoOpenChat,
  elements.logToFile,
  elements.debugFocus,
]) {
  input.addEventListener('input', markFormDirty);
  input.addEventListener('change', markFormDirty);
}

appApi.onEvent((payload) => {
  state = payload.state;
  render();
});

appApi.getState().then((initialState) => {
  state = initialState;
  render();
});
