import test from 'node:test';
import assert from 'node:assert/strict';
import { CnnNetwork, CNN_LEARNING_RATE } from '../src/shared/cnn-network.js';

const close = (actual, expected, tolerance = 1e-10) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}, tolerance ${tolerance}`);
};
const blocks = ['conv1', 'conv2', 'dense'];
const zero = (network) => {
  for (const name of blocks) {
    network[name].weights.fill(0);
    network[name].biases.fill(0);
  }
  return network;
};
const inputFixture = () => Float64Array.from({ length: 256 }, (_, i) => 0.1 + ((i * 73 + 19) % 251) / 300);

test('CNN has 3818 Float64 parameters, deterministic seeds and HWC tensors', () => {
  const network = new CnnNetwork({ seed: 7 });
  assert.deepEqual(network.toJSON(), new CnnNetwork({ seed: 7 }).toJSON());
  assert.notDeepEqual(network.conv1.weights, new CnnNetwork({ seed: 8 }).conv1.weights);
  assert.equal(blocks.reduce((sum, name) => sum + network[name].weights.length + network[name].biases.length, 0), 3818);
  assert.ok(blocks.every((name) => network[name].weights instanceof Float64Array));
  const result = network.forward(inputFixture());
  const trace = result.trace;
  assert.deepEqual(trace.input.shape, [16, 16, 1]);
  assert.deepEqual(trace.conv1.z.shape, [16, 16, 8]);
  assert.deepEqual(trace.conv1.a.shape, [16, 16, 8]);
  assert.deepEqual(trace.pool1.output.shape, [8, 8, 8]);
  assert.deepEqual(trace.conv2.z.shape, [8, 8, 16]);
  assert.deepEqual(trace.pool2.output.shape, [4, 4, 16]);
  assert.deepEqual(trace.flat, trace.pool2.output.data);
  assert.equal(trace.flat.length, 256);
  close(result.probabilities.reduce((sum, value) => sum + value, 0), 1);
  assert.equal(result.confidence, result.probabilities[result.prediction]);
  assert.ok(result.probabilities.every((p) => Number.isFinite(p) && p >= 0 && p <= 1));
});

test('first convolution matches a hand-calculated window, zero padding and bias', () => {
  const network = zero(new CnnNetwork());
  network.conv1.weights.set([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  network.conv1.biases[0] = 0.5;
  const input = Float64Array.from({ length: 256 }, (_, i) => i / 255);
  network.forward(input);
  const middle = network.inspectConv(1, 0, 3, 4);
  const expected = (35 + 2 * 36 + 3 * 37 + 4 * 51 + 5 * 52 + 6 * 53 + 7 * 67 + 8 * 68 + 9 * 69) / 255 + 0.5;
  close(middle.z, expected);
  close(middle.a, expected);
  assert.equal(middle.terms.length, 9);
  close(middle.terms.reduce((sum, term) => sum + term.product, middle.bias), middle.z);
  const corner = network.inspectConv(1, 0, 0, 0);
  close(corner.z, (5 * 0 + 6 * 1 + 8 * 16 + 9 * 17) / 255 + 0.5);
  assert.equal(corner.terms.filter((term) => term.padded).length, 5);
  assert.ok(corner.terms.filter((term) => term.padded).every((term) => term.input === 0 && term.product === 0));
});

test('second convolution includes all eight input channels and 72 inspectable products', () => {
  const network = zero(new CnnNetwork());
  network.conv1.biases.set([1, 2, 3, 4, 5, 6, 7, 8]);
  for (let channel = 0; channel < 8; channel += 1) network.conv2.weights[channel * 9 + 4] = channel + 1;
  network.conv2.biases[0] = 2;
  network.forward(new Float64Array(256));
  const inspection = network.inspectConv(2, 0, 3, 3);
  assert.equal(inspection.terms.length, 72);
  assert.deepEqual(Array.from(inspection.channelSums), [1, 4, 9, 16, 25, 36, 49, 64]);
  close(inspection.z, 206);
  close(inspection.a, 206);
});

test('pooling uses the actual maximum and selects top-left when maxima are equal', () => {
  const network = zero(new CnnNetwork());
  network.conv1.weights[4] = 1;
  const input = new Float64Array(256);
  input[0] = 0.2;
  input[1] = 0.4;
  input[16] = 0.8;
  input[17] = 0.6;
  network.forward(input);
  const inspection = network.inspectPool(1, 0, 0, 0);
  assert.deepEqual(inspection.cells.map((cell) => cell.value), [0.2, 0.4, 0.8, 0.6]);
  close(inspection.max, 0.8);
  assert.equal(inspection.maxIndex, 16 * 8);
  assert.deepEqual(inspection.cells.filter((cell) => cell.selected).map((cell) => [cell.y, cell.x]), [[1, 0]]);
  network.conv1.biases[1] = 1;
  network.forward(input);
  assert.equal(network.inspectPool(1, 1, 2, 3).maxIndex, ((4 * 16 + 6) * 8) + 1);
});

test('pooling ties route gradients to the first maximum and ReLU derivative at zero is zero', () => {
  const network = zero(new CnnNetwork());
  network.conv1.biases.fill(1);
  network.conv2.weights[4] = 1;
  network.dense.weights[0] = 1;
  const plan = network.prepareTrainingStep(new Float64Array(256), 1);
  const nonzero = Array.from(plan.deltas.conv1.data.entries()).filter(([, value]) => value !== 0);
  assert.equal(nonzero.length, 1);
  assert.equal(nonzero[0][0], 0);
  zero(network);
  network.dense.weights[0] = 1;
  const atZero = network.prepareTrainingStep(inputFixture(), 1);
  assert.ok(atZero.gradients.conv1.weights.every((value) => value === 0));
  assert.ok(atZero.gradients.conv2.weights.every((value) => value === 0));
  assert.ok(atZero.gradients.conv1.biases.every((value) => value === 0));
  assert.ok(atZero.gradients.conv2.biases.every((value) => value === 0));
});

test('trace and inspectors retain their own input and weights after later changes', () => {
  const network = new CnnNetwork({ seed: 7 });
  const input = inputFixture();
  const { trace } = network.forward(input);
  const expected = network.inspectConv(1, 0, 5, 5, trace);
  input.fill(0);
  network.conv1.weights.fill(0);
  network.forward(input);
  assert.deepEqual(network.inspectConv(1, 0, 5, 5, trace), expected);
  assert.notEqual(trace.input.data[0], 0);
  assert.throws(() => new CnnNetwork().inspectConv(1, 0, 5, 5, trace), /trace/i);
});

test('gradients of both convolutions, every bias and dense weights match central differences', () => {
  const network = new CnnNetwork({ seed: 7 });
  // Positive preactivations avoid the ReLU kink; nonuniform pixels give distinct pool maxima.
  for (const name of ['conv1', 'conv2']) {
    network[name].weights.set(network[name].weights.map((value) => 0.01 + Math.abs(value) * 0.03));
    network[name].biases.fill(0.1);
  }
  const input = inputFixture();
  const plan = network.prepareTrainingStep(input, 3);
  for (const name of ['conv1', 'conv2']) {
    assert.ok(plan.forward.trace[name].z.data.every((value) => value > 0.09));
    const layer = name === 'conv1' ? 1 : 2;
    const shape = plan.forward.trace[`pool${layer}`].output.shape;
    for (let y = 0; y < shape[0]; y += 1) for (let x = 0; x < shape[1]; x += 1) for (let c = 0; c < shape[2]; c += 1) {
      const values = network.inspectPool(layer, c, y, x, plan.forward.trace).cells.map((cell) => cell.value).sort((a, b) => b - a);
      assert.ok(values[0] - values[1] > 1e-6);
    }
  }
  let checked = 0;
  for (const name of blocks) {
    for (const field of ['weights', 'biases']) {
      const values = network[name][field];
      const stride = field === 'biases' || name === 'conv1' ? 1 : name === 'conv2' ? 17 : 31;
      for (let index = 0; index < values.length; index += stride) {
        const original = values[index];
        const epsilon = 1e-6;
        values[index] = original + epsilon;
        const plus = network.evaluate([{ pixels: input, label: 3 }]).loss;
        values[index] = original - epsilon;
        const minus = network.evaluate([{ pixels: input, label: 3 }]).loss;
        values[index] = original;
        close(plan.gradients[name][field][index], (plus - minus) / (2 * epsilon), 2e-7);
        checked += 1;
      }
    }
  }
  assert.ok(checked > 250);
});

test('a shared kernel gradient equals all spatial contributions and the applied update', () => {
  const network = new CnnNetwork({ seed: 7 });
  for (const name of ['conv1', 'conv2']) {
    network[name].weights.set(network[name].weights.map((value) => 0.01 + Math.abs(value) * 0.03));
    network[name].biases.fill(0.1);
  }
  const input = inputFixture();
  const selection = { kind: 'conv', layer: 2, filter: 0, inChannel: 0, ky: 1, kx: 1 };
  const before = network.toJSON();
  const plan = network.prepareTrainingStep(input, 3, 0.02, selection);
  const change = network.weightChange(plan);
  assert.deepEqual(network.toJSON(), before);
  assert.equal(change.contributions.length, 64);
  assert.ok(change.contributions.filter((term) => term.contribution !== 0).length > 1);
  close(change.gradient, change.contributions.reduce((sum, term) => sum + term.contribution, 0));
  close(change.newWeight, change.oldWeight - change.learningRate * change.gradient);
  input.fill(0);
  selection.filter = 1;
  assert.deepEqual(network.weightChange(plan), change);
  network.applyTrainingStep(plan);
  close(network.conv2.weights[4], change.newWeight);
  assert.equal(network.steps, 1);
  assert.throws(() => network.applyTrainingStep(plan), /stale|applied/i);
  const applied = network.toJSON();
  plan.parametersAfter.conv2.weights.fill(0);
  assert.deepEqual(network.toJSON(), applied);
});

test('stale, foreign, fabricated and numerically unsafe training plans cannot change a model', () => {
  const network = new CnnNetwork();
  const other = new CnnNetwork();
  const input = inputFixture();
  const plan = network.prepareTrainingStep(input, 2);
  const before = network.toJSON();
  assert.throws(() => other.applyTrainingStep(plan), /stale|applied/i);
  assert.throws(() => network.applyTrainingStep({ ...plan }), /stale|applied/i);
  assert.throws(() => network.prepareTrainingStep(input, 2, 1e300), /range|values/i);
  assert.deepEqual(network.toJSON(), before);
  network.dense.biases[0] += 0.01;
  const changed = network.toJSON();
  assert.throws(() => network.applyTrainingStep(plan), /parameters/i);
  assert.deepEqual(network.toJSON(), changed);
});

test('CNN JSON round-trip preserves parameters, steps and predictions and rejects incompatible imports', () => {
  const network = new CnnNetwork({ seed: 8 });
  const input = inputFixture();
  network.trainExample(input, 2);
  const serialized = JSON.parse(JSON.stringify(network.toJSON()));
  const restored = CnnNetwork.fromJSON(serialized);
  assert.deepEqual(restored.toJSON(), serialized);
  assert.deepEqual(restored.forward(input).probabilities, network.forward(input).probabilities);
  for (const mutate of [
    (value) => { value.kind = 'mlp'; },
    (value) => { value.version = 2; },
    (value) => { delete value.seed; },
    (value) => { value.steps = Number.MAX_SAFE_INTEGER + 1; },
    (value) => { value.parameters.conv1.weights.pop(); },
    (value) => { value.parameters.conv2.weights[0] = NaN; },
    (value) => { value.parameters.dense.biases[0] = Infinity; },
    (value) => { value.parameters.conv1.weights[0] = 3e38; },
  ]) {
    const invalid = structuredClone(serialized);
    mutate(invalid);
    assert.throws(() => CnnNetwork.fromJSON(invalid));
    assert.deepEqual(network.toJSON(), serialized);
  }
});

test('each output index denotes the same digit class from zero through nine', () => {
  for (let classId = 0; classId < 10; classId += 1) {
    const network = zero(new CnnNetwork());
    network.dense.biases[classId] = 12;
    const result = network.forward(new Float64Array(256));
    assert.equal(result.prediction, classId);
    assert.ok(result.probabilities[classId] > 0.999);
    close(result.confidence, result.probabilities[classId]);
  }
});

test('classification uses stable logits and invalid input, labels and exhausted steps are rejected', () => {
  const network = zero(new CnnNetwork());
  network.dense.biases.set([50, -50, -50, -50, -50, -50, -50, -50, -50, -50]);
  close(network.evaluate([{ pixels: new Float64Array(256), label: 1 }]).loss, 100);
  assert.throws(() => network.forward([0]), /256/);
  assert.throws(() => network.forward(new Float64Array(256).fill(NaN)), /finite/);
  assert.throws(() => network.forward(new Float64Array(256).fill(2)), /between/);
  assert.throws(() => network.prepareTrainingStep(inputFixture(), 10), /label/);
  assert.throws(() => network.prepareTrainingStep(inputFixture(), 1, 0), /rate/);
  network.steps = Number.MAX_SAFE_INTEGER;
  const before = network.toJSON();
  assert.throws(() => network.trainExample(inputFixture(), 1), /steps/);
  assert.deepEqual(network.toJSON(), before);
});

test('repeated supervised examples reduce loss and update both convolution layers and the output', () => {
  const network = new CnnNetwork({ seed: 7 });
  const input = inputFixture();
  const samples = [{ pixels: input, label: 3 }];
  const initial = network.evaluate(samples).loss;
  const before = network.toJSON();
  for (let step = 0; step < 12; step += 1) network.trainExample(input, 3, CNN_LEARNING_RATE);
  assert.ok(network.evaluate(samples).loss < initial * 0.2);
  for (const name of blocks) assert.notDeepEqual(Array.from(network[name].weights), before.parameters[name].weights);
  assert.equal(network.steps, 12);
});
