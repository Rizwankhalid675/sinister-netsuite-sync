const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const LOG_FILE = path.join(__dirname, 'logs', 'sync.log');
const REPORTS_DIR = path.join(__dirname, 'margin-check', 'reports');
const MARGIN_CHECK_SCRIPT = path.join(__dirname, 'margin-check', 'check-priceoffile.js');
const PORT = 3001;

// Runs the XLSX-parsing report generator in its own process (it can spike to 400MB+
// while parsing the 14MB Holley price file) so it can never trip dashboard-api's own
// memory limit and take the whole API down with it.
function runMarginCheckInSubprocess() {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [MARGIN_CHECK_SCRIPT, '--json'],
      { cwd: __dirname, timeout: 5 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          reject(new Error(err.killed ? 'Report generation timed out or was killed' : err.message));
          return;
        }
        const line = stdout.split('\n').find(l => l.startsWith('RESULT_JSON:'));
        if (!line) {
          reject(new Error('Report process finished without returning a result'));
          return;
        }
        try {
          resolve(JSON.parse(line.slice('RESULT_JSON:'.length)));
        } catch {
          reject(new Error('Could not parse report result'));
        }
      }
    );
  });
}

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

// Reads only the trailing chunk of the file instead of the whole thing — sync.log grows
// unbounded (hit 389MB in production) and a full readFileSync on every poll was spiking
// RSS to 600MB+ and getting dashboard-api OOM-killed by the kernel every ~90 seconds.
const TAIL_CHUNK_BYTES = 512 * 1024;

function readLastLines(filePath, maxLines = 300) {
  try {
    const { size } = fs.statSync(filePath);
    const start = Math.max(0, size - TAIL_CHUNK_BYTES);
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    const lines = buf.toString('utf8').split('\n').filter(l => l.trim());
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
      const result = await runMarginCheckInSubprocess();
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
