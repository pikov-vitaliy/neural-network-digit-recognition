import test from 'node:test';
import assert from 'node:assert/strict';
import { DigitNetwork } from '../src/shared/neural-network.js';

const close = (actual, expected, tolerance = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected} ± ${tolerance}`);
};

test('default network has 256→16→12→10 shape and 4408 connection weights', () => {
  const network = new DigitNetwork();
  assert.deepEqual(network.sizes, [256, 16, 12, 10]);
  assert.deepEqual(network.layers.map((layer) => layer.weights.length), [4096, 192, 120]);
  assert.deepEqual(network.layers.map((layer) => layer.biases.length), [16, 12, 10]);
  assert.equal(network.layers.reduce((sum, layer) => sum + layer.weights.length, 0), 4408);
  assert.equal(network.steps, 0);
});

test('same seed reproduces weights and forward returns a normalized softmax', () => {
  const first = new DigitNetwork({ seed: 42 });
  const second = new DigitNetwork({ seed: 42 });
  assert.deepEqual(first.layers[0].weights, second.layers[0].weights);
  const input = new Float32Array(256).fill(0.25);
  const result = first.forward(input);
  assert.equal(result.activations.length, 4);
  assert.equal(result.activations[0], input);
  assert.equal(result.probabilities.length, 10);
  close(result.probabilities.reduce((sum, value) => sum + value, 0), 1);
  assert.ok(result.prediction >= 0 && result.prediction <= 9);
  close(result.confidence, result.probabilities[result.prediction]);
  assert.ok(result.probabilities.every(Number.isFinite));
});

test('invalid inputs and labels fail explicitly', () => {
  const network = new DigitNetwork({ sizes: [2, 2, 2] });
  assert.throws(() => network.forward([0]), /input/i);
  assert.throws(() => network.trainExample([0, 1], -1), /label/i);
  assert.throws(() => network.trainExample([0, 1], 2), /label/i);
});

test('backpropagation matches numerical gradients for a weight and a bias', () => {
  const epsilon = 1e-3;
  const input = new Float32Array([0.2, 0.8]);
  const label = 1;
  const loss = (network) => -Math.log(network.forward(input).probabilities[label]);

  for (const target of ['weights', 'biases']) {
    const network = new DigitNetwork({ sizes: [2, 3, 2], seed: 7 });
    const parameter = network.layers[1][target];
    const original = parameter[0];
    parameter[0] = original + epsilon;
    const plus = loss(network);
    parameter[0] = original - epsilon;
    const minus = loss(network);
    parameter[0] = original;
    const numericalGradient = (plus - minus) / (2 * epsilon);
    network.trainExample(input, label, 1);
    const analyticGradient = original - parameter[0];
    close(analyticGradient, numericalGradient, 2e-5);
  }
});

test('training reduces loss and learns a small nonlinear mapping', () => {
  const network = new DigitNetwork({ sizes: [2, 8, 2], seed: 11 });
  const samples = [
    { pixels: new Float32Array([0, 0]), label: 0 },
    { pixels: new Float32Array([0, 1]), label: 1 },
    { pixels: new Float32Array([1, 0]), label: 1 },
    { pixels: new Float32Array([1, 1]), label: 0 },
  ];
  const initial = network.evaluate(samples).loss;
  for (let epoch = 0; epoch < 500; epoch += 1) {
    for (const sample of samples) network.trainExample(sample.pixels, sample.label, 0.5);
  }
  const final = network.evaluate(samples);
  assert.ok(final.loss < initial * 0.2, `${initial} → ${final.loss}`);
  assert.equal(final.accuracy, 1);
  assert.equal(network.steps, 2000);
});

test('model JSON round-trip preserves predictions and training steps', () => {
  const network = new DigitNetwork({ sizes: [2, 3, 2], seed: 19 });
  network.trainExample([0.1, 0.9], 1);
  const restored = DigitNetwork.fromJSON(network.toJSON());
  assert.equal(restored.steps, 1);
  assert.deepEqual(restored.sizes, [2, 3, 2]);
  assert.deepEqual(restored.forward([0.1, 0.9]).probabilities, network.forward([0.1, 0.9]).probabilities);
});

test('model JSON rejects unsupported versions, shapes and corrupt data', () => {
  const network = new DigitNetwork({ sizes: [2, 3, 2] });
  const unsupported = network.toJSON();
  unsupported.version = 99;
  assert.throws(() => DigitNetwork.fromJSON(unsupported), /version/i);

  const wrongShape = network.toJSON();
  wrongShape.sizes = [2, 4, 2];
  assert.throws(() => DigitNetwork.fromJSON(wrongShape), /shape|length/i);

  const corrupt = network.toJSON();
  corrupt.layers[0].weights = '%%%not-base64%%%';
  assert.throws(() => DigitNetwork.fromJSON(corrupt), /base64|data|weight/i);
});
