import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function send(response, status, body, headers = {}) {
  response.writeHead(status, headers);
  response.end(body);
}

export function createStaticServer({ publicDir, sharedDir }) {
  const roots = { public: resolve(publicDir), shared: resolve(sharedDir) };
  return http.createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'");
    if (!['GET', 'HEAD'].includes(request.method)) {
      send(response, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    } catch {
      send(response, 400, 'Invalid URL');
      return;
    }
    if (pathname.includes('\0')) {
      send(response, 400, 'Invalid path');
      return;
    }
    const isShared = pathname.startsWith('/shared/');
    const root = isShared ? roots.shared : roots.public;
    const relative = isShared ? pathname.slice('/shared/'.length) : pathname === '/' ? 'index.html' : pathname.slice(1);
    const filePath = resolve(root, relative);
    if (filePath !== root && !filePath.startsWith(root + sep)) {
      send(response, 403, 'Forbidden');
      return;
    }
    try {
      const body = await readFile(filePath);
      response.writeHead(200, {
        'Content-Type': MIME_TYPES[extname(filePath)] || 'application/octet-stream',
        'Content-Length': body.length,
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch {
      send(response, 404, 'File not found');
    }
  });
}

export async function listenWithFallback(server, startPort = 4173) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const port = startPort === 0 ? 0 : startPort + attempt;
    try {
      await new Promise((resolveListen, rejectListen) => {
        const onError = (error) => rejectListen(error);
        server.once('error', onError);
        server.listen(port, '127.0.0.1', () => {
          server.off('error', onError);
          resolveListen();
        });
      });
      return server.address().port;
    } catch (error) {
      if (error.code !== 'EADDRINUSE' || startPort === 0 || attempt === 9) throw error;
    }
  }
  throw new Error('No available port');
}
