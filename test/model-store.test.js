import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DigitNetwork } from '../src/shared/neural-network.js';

// The browser serves this import at /shared; use the same module from disk in Node.
const source = (await readFile(new URL('../public/js/model-store.js', import.meta.url), 'utf8'))
  .replace("'/shared/neural-network.js'", JSON.stringify(new URL('../src/shared/neural-network.js', import.meta.url).href));
const { parseModel, validateModel, readHistory } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('model validation rejects unsafe unseen inputs before replacing the active model', () => {
  const network = new DigitNetwork();
  network.layers[0].weights[0] = 2e6;
  const samples = [{ pixels: new Float32Array(256), label: 0 }];
  assert.ok(Number.isFinite(network.evaluate(samples).loss));
  const restored = parseModel(JSON.stringify(network.toJSON()));
  assert.throws(() => validateModel(restored, samples, samples), /диапазон/i);
});

test('valid model import preserves predictions and recomputes finite metrics', () => {
  const network = new DigitNetwork();
  const pixels = new Float32Array(256).fill(0.25);
  network.trainExample(pixels, 3);
  const restored = parseModel(JSON.stringify(network.toJSON()));
  assert.deepEqual(restored.forward(pixels).probabilities, network.forward(pixels).probabilities);
  assert.deepEqual(validateModel(restored, [{ pixels, label: 3 }], [{ pixels, label: 2 }]), {
    training: network.evaluate([{ pixels, label: 3 }]), validation: network.evaluate([{ pixels, label: 2 }]),
  });
});

test('saved history ignores invalid metrics and steps outside the saved model', () => {
  const valid = { epoch: 1, steps: 80, loss: 1, trainAccuracy: 0.5, validationAccuracy: 0.4 };
  const history = [valid, null, { ...valid, epoch: 2, steps: 161 },
    { ...valid, epoch: 2, steps: 80.5 }, { ...valid, epoch: 2, loss: -1 },
    { ...valid, epoch: 2, trainAccuracy: 2 }, { ...valid, epoch: 2, validationAccuracy: -1 }];
  const storage = { getItem: () => JSON.stringify({ steps: 160, history }) };
  assert.deepEqual(readHistory(160, storage), [valid]);
  assert.deepEqual(readHistory(80, storage), []);
});
