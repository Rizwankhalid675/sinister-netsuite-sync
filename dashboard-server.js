const http = require('http');
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'logs', 'sync.log');
const PORT = 3001;

function readLastLines(filePath, maxLines = 300) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    return lines.slice(-maxLines);
  } catch { return []; }
}

function getStats() {
  const lines = readLastLines(LOG_FILE, 500);
  const today = new Date().toISOString().substring(0, 10);
  const ordersToday = lines.filter(l => l.includes(today) && l.includes('→ NetSuite Sales Order')).length;
  const invoicesToday = lines.filter(l => l.includes(today) && l.includes('Invoice')).length;
  const errors = lines.filter(l => l.includes('❌') || l.includes('[ERROR]')).length;

  // uptime from process
  const uptimeSecs = process.uptime();
  const h = Math.floor(uptimeSecs / 3600);
  const m = Math.floor((uptimeSecs % 3600) / 60);
  const uptime = h > 0 ? `${h}h ${m}m` : `${m}m`;

  return { ordersToday, invoicesToday, errors, uptime };
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Content-Type', 'application/json');

  if (req.url === '/api/logs') {
    const lines = readLastLines(LOG_FILE, 300);
    res.end(JSON.stringify({ lines, total: lines.length }));
  } else if (req.url === '/api/stats') {
    res.end(JSON.stringify(getStats()));
  } else {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'not found' }));
  }
});

server.listen(PORT, () => {
  console.log(`Dashboard API running on port ${PORT}`);
});
