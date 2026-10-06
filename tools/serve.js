// Minimal static server for local testing. No dependencies, so it starts
// instantly and works offline.
//
//   node tools/serve.js [port]

const http = require('http');
const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.argv[2] || process.env.PORT || 8080);

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'text/javascript; charset=utf-8',
    '.mjs':  'text/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.jsonc':'application/json; charset=utf-8',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif':  'image/gif',
    '.svg':  'image/svg+xml',
    '.webp': 'image/webp',
    '.ico':  'image/x-icon',
    '.mp3':  'audio/mpeg',
    '.wav':  'audio/wav',
    '.woff2':'font/woff2',
    '.map':  'application/json; charset=utf-8',
};

http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel === '/') rel = '/index.html';

    // Resolve inside the project only — a served path must not climb out.
    const file = path.resolve(ROOT, '.' + rel);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }

    fs.readFile(file, (err, buf) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('not found: ' + rel);
            console.log('404', rel);
            return;
        }
        res.writeHead(200, {
            'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': 'no-store',       // so a reload always gets the edit
        });
        res.end(buf);
    });
}).listen(PORT, () => {
    console.log(`serving ${ROOT}`);
    console.log(`  http://localhost:${PORT}/              menu`);
    console.log(`  http://localhost:${PORT}/RunningBoy.html   straight into the game`);
});
