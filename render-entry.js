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
proxy.on('error', (err, req, res) => {
  console.error('[proxy]', err.message);
  if (res && res.writeHead) {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('KKuTu service is starting. Please retry shortly.');
  }
});

const server = http.createServer((req, res) => {
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
