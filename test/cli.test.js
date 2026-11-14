import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCliArgs } from '../src/cli.js';

test('CLI defaults to port 4173 and opens a browser', () => {
  assert.deepEqual(parseCliArgs([]), { port: 4173, noOpen: false, help: false, version: false });
});

test('CLI accepts separate and equals port forms and no-open', () => {
  assert.deepEqual(parseCliArgs(['--port', '5000', '--no-open']), { port: 5000, noOpen: true, help: false, version: false });
  assert.equal(parseCliArgs(['--port=5001']).port, 5001);
  assert.equal(parseCliArgs(['--port', '0', '--no-open']).port, 0);
});

test('CLI accepts the conventional npx argument separator', () => {
  assert.deepEqual(parseCliArgs(['--', '--no-open', '--port', '0']), { port: 0, noOpen: true, help: false, version: false });
});

test('CLI exposes help and version', () => {
  assert.equal(parseCliArgs(['--help']).help, true);
  assert.equal(parseCliArgs(['--version']).version, true);
});

test('CLI rejects invalid ports and unknown flags', () => {
  for (const args of [['--port', 'abc'], ['--port', '-1'], ['--port', '65536'], ['--port'], ['--unknown']]) {
    assert.throws(() => parseCliArgs(args), /port|unknown/i);
  }
});
