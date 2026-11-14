import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createStaticServer, listenWithFallback } from '../src/server.js';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const sharedDir = fileURLToPath(new URL('../src/shared/', import.meta.url));

async function runningServer(t) {
  const server = createStaticServer({ publicDir, sharedDir });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

test('server returns the application, shared modules and correct MIME types', async (t) => {
  const { origin } = await runningServer(t);
  const page = await fetch(`${origin}/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.match(await page.text(), /<html lang="ru"/);

  const module = await fetch(`${origin}/shared/neural-network.js`);
  assert.equal(module.status, 200);
  assert.match(module.headers.get('content-type'), /javascript/);
  assert.match(await module.text(), /class DigitNetwork/);

  const manifest = await fetch(`${origin}/samples/manifest.json`);
  assert.equal(manifest.status, 200);
  assert.match(manifest.headers.get('content-type'), /application\/json/);
  assert.equal(JSON.parse(await manifest.text()).samples.length, 100);
});

test('HEAD has no body, unsupported methods are rejected and missing files are 404', async (t) => {
  const { origin } = await runningServer(t);
  const head = await fetch(`${origin}/`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal((await fetch(`${origin}/`, { method: 'POST' })).status, 405);
  assert.equal((await fetch(`${origin}/missing.txt`)).status, 404);
});

test('encoded traversal cannot escape public or shared roots', async (t) => {
  const { origin } = await runningServer(t);
  for (const path of ['/%2e%2e%2fpackage.json', '/shared/%2e%2e%2fserver.js', '/..%5cpackage.json']) {
    const response = await fetch(`${origin}${path}`);
    assert.ok([403, 404].includes(response.status), `${path}: ${response.status}`);
    assert.doesNotMatch(await response.text(), /neural-network-digit-recognition/);
  }
});

test('a busy port falls back to the next available port', async (t) => {
  const first = createStaticServer({ publicDir, sharedDir });
  const port = await listenWithFallback(first, 0);
  t.after(() => first.close());
  const second = createStaticServer({ publicDir, sharedDir });
  const secondPort = await listenWithFallback(second, port);
  t.after(() => second.close());
  assert.equal(secondPort, port + 1);
  assert.equal((await fetch(`http://127.0.0.1:${secondPort}/`)).status, 200);
});

async function occupyRange(t, count) {
  const { createServer } = await import('node:net');
  const first = createServer();
  first.listen(0, '127.0.0.1');
  await once(first, 'listening');
  const start = first.address().port;
  const servers = [first];
  for (let offset = 1; offset < count; offset += 1) {
    const server = createServer();
    server.listen(start + offset, '127.0.0.1');
    await once(server, 'listening');
    servers.push(server);
  }
  t.after(() => Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve)))));
  return start;
}

test('nine busy ports fall back without accumulating listeners', async (t) => {
  const start = await occupyRange(t, 9);
  const server = createStaticServer({ publicDir, sharedDir });
  t.after(() => server.close());
  assert.equal(await listenWithFallback(server, start), start + 9);
  assert.equal(server.listenerCount('listening'), 1, 'остаётся только штатный обработчик Node HTTP');
  assert.equal(server.listenerCount('error'), 0);
});

test('ten busy ports produce a clear error and no listener leak', async (t) => {
  const start = await occupyRange(t, 10);
  const server = createStaticServer({ publicDir, sharedDir });
  await assert.rejects(listenWithFallback(server, start), /свободн|available|4173|диапазон/i);
  assert.equal(server.listenerCount('listening'), 1, 'остаётся только штатный обработчик Node HTTP');
  assert.equal(server.listenerCount('error'), 0);
  assert.equal(server.listening, false);
});
