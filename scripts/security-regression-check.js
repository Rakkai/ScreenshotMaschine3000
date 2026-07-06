const fs = require('node:fs');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const monitor = read('monitor.js');
const electronMain = read('electron/main.js');

for (const flag of ['--no-sandbox', '--disable-setuid-sandbox']) {
  assert(!monitor.includes(flag), `monitor.js must not launch Chromium with ${flag}`);
}

assert(monitor.includes('process.send'), 'monitor.js must send app bridge events over child-process IPC');
assert(
  electronMain.includes("monitorProcess.on('message'") || electronMain.includes('monitorProcess.on("message"'),
  'electron/main.js must listen for monitor IPC messages'
);
assert(!electronMain.includes('SM3000_EVENT'), 'electron/main.js must not parse SM3000_EVENT from stdout');
assert(!electronMain.includes('EVENT_PREFIX'), 'electron/main.js must not use stdout prefix parsing for trusted events');
