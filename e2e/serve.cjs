const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = path.join(__dirname, '..');
const port = Number(process.env.PORT || 8123);
const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.webmanifest': 'application/manifest+json'
};

http.createServer((request, response) => {
    const requested = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const relative = requested.endsWith('/') ? `${requested}index.html` : requested;
    const file = path.normalize(path.join(root, relative));

    if (!file.startsWith(root + path.sep)) {
        response.writeHead(403);
        response.end('forbidden');
        return;
    }

    fs.readFile(file, (error, data) => {
        if (error) {
            response.writeHead(404);
            response.end('not found');
            return;
        }
        response.writeHead(200, {
            'Content-Type': types[path.extname(file)] || 'application/octet-stream',
            'Cache-Control': 'no-store'
        });
        response.end(data);
    });
}).listen(port, '127.0.0.1', () => {
    console.log(`Serving Manzil on http://127.0.0.1:${port}`);
});
