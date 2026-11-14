import test from 'node:test';
import assert from 'node:assert/strict';
import { DigitNetwork } from '../src/shared/neural-network.js';
import { canTrainSample, hasDrawableInput, createPrediction, isCurrentPrediction } from '../public/js/lab-state.js';

test('only training samples may update weights without changing validation', () => {
  assert.equal(canTrainSample({ split: 'train' }), true);
  assert.equal(canTrainSample({ split: 'validation' }), false);
  assert.equal(canTrainSample(null), false);
  assert.equal(canTrainSample(undefined, 'recognition'), false);
});

test('empty and invalid inputs cannot be published as digit predictions', () => {
  assert.equal(hasDrawableInput(new Float32Array(256)), false);
  const pixels = new Float32Array(256);
  pixels[128] = 1;
  assert.equal(hasDrawableInput(pixels), true);
  pixels[128] = NaN;
  assert.equal(hasDrawableInput(pixels), false);
});

test('prediction belongs to exactly one input and model version', () => {
  const network = new DigitNetwork();
  const pixels = new Float32Array(256);
  pixels[120] = 1;
  const prediction = createPrediction(network, pixels, 4, 7);
  assert.notEqual(prediction.pixels, pixels);
  assert.deepEqual(prediction.result.probabilities, network.forward(pixels).probabilities);
  assert.equal(isCurrentPrediction(prediction, 4, 7), true);
  assert.equal(isCurrentPrediction(prediction, 5, 7), false);
  assert.equal(isCurrentPrediction(prediction, 4, 8), false);
  pixels.fill(0);
  assert.equal(prediction.pixels[120], 1);
  assert.equal(prediction.result.activations[0][120], 1);
});

test('drawing input rejects values outside the canonical zero-to-one range', () => {
  const pixels = new Float32Array(256);
  pixels[120] = 1;
  pixels[121] = -1;
  assert.equal(hasDrawableInput(pixels), false);
  pixels[121] = 2;
  assert.equal(hasDrawableInput(pixels), false);
});
