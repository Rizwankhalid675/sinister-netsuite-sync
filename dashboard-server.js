const http = require('http');
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'logs', 'sync.log');
const PORT = 3001;

// Simple rate limiter — max 30 requests per minute per IP
const rateLimiter = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const window = 60000;
  const max = 30;
  if (!rateLimiter.has(ip)) rateLimiter.set(ip, []);
  const hits = rateLimiter.get(ip).filter(t => now - t < window);
  hits.push(now);
  rateLimiter.set(ip, hits);
  return hits.length > max;
}
// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, hits] of rateLimiter.entries()) {
    const fresh = hits.filter(t => now - t < 60000);
    if (fresh.length === 0) rateLimiter.delete(ip);
    else rateLimiter.set(ip, fresh);
  }
}, 300000);

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
  const ip = req.headers['x-real-ip'] || req.socket.remoteAddress;
  if (isRateLimited(ip)) {
    res.statusCode = 429;
    res.end(JSON.stringify({ error: 'Too many requests' }));
    return;
  }

  res.setHeader('Access-Control-Allow-Origin', 'same-origin');
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
