const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'logs/sync.log');

function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

module.exports = { log };
