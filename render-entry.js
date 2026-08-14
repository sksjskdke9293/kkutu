const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const httpProxy = require('./Server/lib/node_modules/http-proxy');

const root = __dirname;
const children = [];
function run(script, args, env) {
  const child = spawn(process.execPath, [script].concat(args || []), {
    cwd: path.join(root, 'Server', 'lib'),
    env: Object.assign({}, process.env, env || {}),
    stdio: 'inherit'
  });
  children.push(child);
  child.on('exit', code => {
    if (code && !process.exitCode) process.exitCode = code;
  });
}

run('Game/cluster.js', ['0', '1']);
run('Web/cluster.js', ['1'], { KKUTU_WEB_PORT: '3000' });

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
  showStarting(res);
});

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(302, {
      Location: '/?server=0#',
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

function shutdown() {
  children.forEach(child => child.kill('SIGTERM'));
  server.close(() => process.exit(0));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
