const http = require('http');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const httpProxy = require('./Server/lib/node_modules/http-proxy');

const root = __dirname;
const services = {
  game: { script: 'Game/cluster.js', args: ['0', '1'], port: 8080 },
  web: { script: 'Web/cluster.js', args: ['1'], env: { KKUTU_WEB_PORT: '3000' }, port: 3000 }
};
let shuttingDown = false;

function startService(name) {
  const service = services[name];
  if (shuttingDown || service.child) return;

  const child = spawn(process.execPath, [service.script].concat(service.args || []), {
    cwd: path.join(root, 'Server', 'lib'),
    env: Object.assign({}, process.env, service.env || {}),
    stdio: 'inherit'
  });
  service.child = child;
  service.failures = 0;
  service.ready = false;
  console.log(`[supervisor] ${name} started (pid ${child.pid})`);

  child.on('exit', code => {
    if (service.child !== child) return;
    service.child = null;
    console.error(`[supervisor] ${name} exited (${code}); restarting shortly`);
    if (!shuttingDown) setTimeout(() => startService(name), 1500);
  });
}

function restartService(name, reason) {
  const service = services[name];
  if (shuttingDown || service.restarting) return;

  service.restarting = true;
  service.ready = false;
  console.error(`[supervisor] restarting ${name}: ${reason}`);
  const child = service.child;
  service.child = null;
  if (child) child.kill('SIGTERM');

  setTimeout(() => {
    service.restarting = false;
    startService(name);
  }, 1200);
}

Object.keys(services).forEach(startService);

const proxy = httpProxy.createProxyServer({ ws: true, xfwd: true });

function showStarting(res) {
  if (!res || res.headersSent || typeof res.writeHead !== 'function') return;
  const html = '<!doctype html><html lang="ko"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta http-equiv="refresh" content="2">' +
    '<title>끄투 서버 시작 중</title></head>' +
    '<body style="margin:0;background:#15171b;color:#fff;font-family:sans-serif;' +
    'display:grid;place-items:center;min-height:100vh;text-align:center">' +
    '<main><h1>끄투 서버를 깨우는 중...</h1>' +
    '<p>준비되는 즉시 자동으로 입장합니다.</p></main></body></html>';
  res.writeHead(503, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Retry-After': '2'
  });
  res.end(html);
}

proxy.on('error', (err, req, res) => {
  console.error('[proxy]', err.message);
  if (err && (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET')) {
    restartService('web', err.code);
  }
  showStarting(res);
});

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    const ready = Boolean(services.web.ready && services.game.ready);
    res.writeHead(ready ? 200 : 503, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify({ status: ready ? 'ok' : 'starting' }));
    return;
  }
  if (req.url === '/') {
    res.writeHead(302, {
      Location: '/login',
      'Cache-Control': 'no-store'
    });
    res.end();
    return;
  }
  proxy.web(req, res, { target: 'http://127.0.0.1:3000' });
});

server.on('upgrade', (req, socket, head) => {
  let targetPort = 8080;
  const match = req.url.match(/^\/channel\/(\d+)\/(.*)$/);
  if (match) {
    targetPort = 8495 + Number(match[1]);
    req.url = '/' + match[2];
  }
  proxy.ws(req, socket, head, { target: 'ws://127.0.0.1:' + targetPort });
});

server.listen(Number(process.env.PORT || 10000), '0.0.0.0', () => {
  console.log('Render gateway listening on ' + (process.env.PORT || 10000));
});

function checkPort(name) {
  const service = services[name];
  if (!service.child || service.restarting) return;

  const socket = net.createConnection({ host: '127.0.0.1', port: service.port });
  let settled = false;
  function finish(ok) {
    if (settled) return;
    settled = true;
    socket.destroy();
    service.ready = ok;
    service.failures = ok ? 0 : (service.failures || 0) + 1;
    if (service.failures >= 3) restartService(name, 'health check failed');
  }
  socket.setTimeout(2500);
  socket.once('connect', () => finish(true));
  socket.once('timeout', () => finish(false));
  socket.once('error', () => finish(false));
}

const monitor = setInterval(() => {
  checkPort('web');
  checkPort('game');
}, 10000);
monitor.unref();

function shutdown() {
  shuttingDown = true;
  clearInterval(monitor);
  Object.keys(services).forEach(name => {
    const child = services[name].child;
    services[name].child = null;
    if (child) child.kill('SIGTERM');
  });
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
