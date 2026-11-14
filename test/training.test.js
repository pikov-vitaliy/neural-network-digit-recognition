import test from 'node:test';
import assert from 'node:assert/strict';
import { DigitNetwork } from '../src/shared/neural-network.js';
import { generateDataset } from '../scripts/generate-samples.js';
import { createTrainingRandom, trainEpoch } from '../public/js/training.js';

test('12 deterministic epochs reduce training loss and reach at least 60% validation accuracy', () => {
  const samples = generateDataset().map((sample) => ({
    ...sample,
    pixels: Float32Array.from(sample.pixels, (value) => value / 255),
  }));
  const training = samples.filter((sample) => sample.split === 'train');
  const validation = samples.filter((sample) => sample.split === 'validation');
  const network = new DigitNetwork();
  const initial = network.evaluate(training);
  let final;
  const random = createTrainingRandom();
  for (let epoch = 0; epoch < 12; epoch += 1) {
    final = trainEpoch(network, training, random);
  }
  const validationResult = network.evaluate(validation);
  assert.ok(final.loss < initial.loss, `loss must decrease: ${initial.loss} → ${final.loss}`);
  assert.ok(validationResult.accuracy >= 0.6, `validation accuracy is ${validationResult.accuracy}`);
  console.log(JSON.stringify({ initialLoss: initial.loss, finalLoss: final.loss, trainAccuracy: final.accuracy, validationAccuracy: validationResult.accuracy, steps: network.steps }));
});
