// Serves only this project's exported React Native Web preview on loopback.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../dist');
const port = Number(process.argv[2] || 8091);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  console.error('Choose a preview port between 1024 and 65535.');
  process.exit(1);
}
if (!fs.existsSync(path.join(root, 'index.html'))) {
  console.error('Build the preview first: npm run export:web');
  process.exit(1);
}
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf' };
const server = http.createServer((request, response) => {
  try {
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    const relative = decodeURIComponent(url.pathname);
    const file = path.resolve(root, '.' + (relative === '/' ? '/index.html' : relative));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404); response.end('Not found'); return;
    }
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(response);
  } catch { response.writeHead(400); response.end('Bad request'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Warm Wellness home preview: http://127.0.0.1:${port}\nCtrl+C stops this preview.`));
server.on('error', error => { console.error(`Preview could not start: ${error.code}`); process.exit(1); });
process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
