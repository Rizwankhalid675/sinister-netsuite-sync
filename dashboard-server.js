const http = require('http');
const fs = require('fs');
const path = require('path');
const { runCheck } = require('./margin-check/check-priceoffile');

const LOG_FILE = path.join(__dirname, 'logs', 'sync.log');
const REPORTS_DIR = path.join(__dirname, 'margin-check', 'reports');
const PORT = 3001;

let marginReportRunning = false;

function listMarginReports() {
  if (!fs.existsSync(REPORTS_DIR)) return [];
  return fs.readdirSync(REPORTS_DIR)
    .filter(f => f.endsWith('.pdf') || f.endsWith('.csv'))
    .map(f => {
      const stat = fs.statSync(path.join(REPORTS_DIR, f));
      return { file: f, mtime: stat.mtimeMs, size: stat.size };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

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

const server = http.createServer(async (req, res) => {
  const ip = req.headers['x-real-ip'] || req.socket.remoteAddress;
  if (isRateLimited(ip)) {
    res.statusCode = 429;
    res.end(JSON.stringify({ error: 'Too many requests' }));
    return;
  }

  const reqUrl = new URL(req.url, 'http://internal');

  res.setHeader('Access-Control-Allow-Origin', 'same-origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  if (reqUrl.pathname === '/api/logs') {
    res.setHeader('Content-Type', 'application/json');
    const lines = readLastLines(LOG_FILE, 300);
    res.end(JSON.stringify({ lines, total: lines.length }));

  } else if (reqUrl.pathname === '/api/stats') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(getStats()));

  } else if (reqUrl.pathname === '/api/margin-report/list') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ reports: listMarginReports(), running: marginReportRunning }));

  } else if (reqUrl.pathname === '/api/margin-report/generate' && req.method === 'POST') {
    res.setHeader('Content-Type', 'application/json');
    if (marginReportRunning) {
      res.statusCode = 409;
      res.end(JSON.stringify({ error: 'A report is already generating — please wait for it to finish' }));
      return;
    }
    marginReportRunning = true;
    try {
      const result = await runCheck();
      res.end(JSON.stringify({
        ok: true,
        totalIssues: result.totalIssues,
        obsoleteCount: result.obsoleteCount,
        notOnWebsiteCount: result.notOnWebsiteCount,
        priceMismatchCount: result.priceMismatchCount,
        rejectedCollisionCount: result.rejectedCollisionCount,
        reports: listMarginReports()
      }));
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message }));
    } finally {
      marginReportRunning = false;
    }

  } else if (reqUrl.pathname === '/api/margin-report/download') {
    const requested = reqUrl.searchParams.get('file') || '';
    // Only allow exact basenames of files that actually exist in REPORTS_DIR — blocks path traversal.
    const safeName = path.basename(requested);
    const filePath = path.join(REPORTS_DIR, safeName);
    if (!safeName || !fs.existsSync(filePath) || path.dirname(filePath) !== REPORTS_DIR) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Report not found' }));
      return;
    }
    const ext = path.extname(safeName).toLowerCase();
    res.setHeader('Content-Type', ext === '.pdf' ? 'application/pdf' : 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    fs.createReadStream(filePath).pipe(res);

  } else {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'not found' }));
  }
});

server.listen(PORT, () => {
  console.log(`Dashboard API running on port ${PORT}`);
});
