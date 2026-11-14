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
    const analyticGradient = original - network.layers[1][target][0];
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

test('cross-entropy uses stable logits for an extremely confident mistake', () => {
  const network = new DigitNetwork({ sizes: [1, 2] });
  network.layers[0].weights.set([50, -50]);
  const result = network.forward([1]);
  close(result.logits[0], 50);
  close(result.logits[1], -50);
  close(network.prepareTrainingStep([1], 1).loss, 100, 1e-5);
  close(network.evaluate([{ pixels: [1], label: 1 }]).loss, 100, 1e-5);
});

test('finite but numerically unsafe model parameters cannot produce NaN', () => {
  const network = new DigitNetwork({ sizes: [1, 2] });
  network.layers[0].weights.fill(3e38);
  network.layers[0].biases.fill(3e38);
  assert.throws(() => network.forward([1]), /numerical|finite|range|диапазон/i);
});

test('prepared SGD step is immutable until applied and exposes a real weight change', () => {
  const network = new DigitNetwork({ sizes: [2, 3, 2], seed: 19 });
  const before = network.toJSON();
  const plan = network.prepareTrainingStep([0.1, 0.9], 1, 0.2, { layer: 1, target: 1, source: 0 });
  assert.deepEqual(network.toJSON(), before);
  assert.equal(plan.forward.activations.length, 3);
  assert.equal(plan.sums.length, 2);
  const change = network.weightChange(plan);
  close(change.oldWeight, network.layers[1].weights[3]);
  assert.ok(Math.abs(change.gradient) > 0);
  close(change.deltaWeight, -0.2 * change.gradient);
  close(change.newWeight, change.oldWeight + change.deltaWeight, 1e-7);
  assert.ok(plan.loss > 0 && Number.isFinite(plan.loss));
  network.applyTrainingStep(plan);
  assert.equal(network.steps, 1);
  close(network.layers[1].weights[3], change.newWeight, 1e-7);
  assert.throws(() => network.applyTrainingStep(plan), /current|version|шаг/i);
});

test('trainExample applies the same prepared step exactly once', () => {
  const network = new DigitNetwork({ sizes: [2, 3, 2], seed: 19 });
  const result = network.trainExample([0.1, 0.9], 1, 0.2);
  assert.equal(network.steps, 1);
  close(network.layers[1].weights[3], network.weightChange(result.plan).newWeight, 1e-7);
  assert.ok(Number.isFinite(result.loss));
});

test('a prepared lesson keeps its input and gradients when the drawing changes', () => {
  const network = new DigitNetwork({ sizes: [2, 3, 2], seed: 19 });
  const input = new Float32Array([0.1, 0.9]);
  const plan = network.prepareTrainingStep(input, 1, 0.2, { layer: 0, target: 0, source: 0 });
  const change = network.weightChange(plan);
  input.fill(0);
  assert.deepEqual(network.weightChange(plan), change);
  assert.deepEqual(plan.forward.activations[0], plan.input);
});

test('applying a lesson does not share live parameters with its saved preview', () => {
  const network = new DigitNetwork({ sizes: [2, 3, 2], seed: 19 });
  const plan = network.prepareTrainingStep([0.1, 0.9], 1);
  network.applyTrainingStep(plan);
  const applied = network.toJSON();
  plan.weightsAfter[0].fill(0);
  plan.biasesAfter[0].fill(0);
  assert.deepEqual(network.toJSON(), applied);
});

test('cached output activations contain probabilities, matching the forward result', () => {
  const network = new DigitNetwork({ sizes: [2, 3, 2], seed: 19 });
  const result = network.forward([0.1, 0.9]);
  assert.deepEqual(network.activations.at(-1), result.probabilities);
});

test('unsafe step counters cannot bypass exactly-once training', () => {
  const network = new DigitNetwork({ sizes: [2, 3, 2] });
  const serialized = network.toJSON();
  serialized.steps = Number.MAX_SAFE_INTEGER + 1;
  assert.throws(() => DigitNetwork.fromJSON(serialized), /steps/i);
  network.steps = Number.MAX_SAFE_INTEGER;
  const before = network.toJSON();
  assert.throws(() => network.trainExample([0.1, 0.9], 1), /steps/i);
  assert.deepEqual(network.toJSON(), before);
});

test('a numerically unsafe prepared update leaves parameters and steps unchanged', () => {
  const network = new DigitNetwork({ sizes: [2, 3, 2], seed: 19 });
  const before = network.toJSON();
  const plan = network.prepareTrainingStep([0.1, 0.9], 1, 1e8);
  assert.throws(() => network.applyTrainingStep(plan), /numerical|range/i);
  assert.deepEqual(network.toJSON(), before);
});
