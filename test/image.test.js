import test from 'node:test';
import assert from 'node:assert/strict';
import { IMAGE_SIZE, normalizePixels } from '../src/shared/image.js';

const centerOfMass = (pixels) => {
  let total = 0;
  let x = 0;
  let y = 0;
  for (let row = 0; row < IMAGE_SIZE; row += 1) {
    for (let column = 0; column < IMAGE_SIZE; column += 1) {
      const value = pixels[row * IMAGE_SIZE + column];
      total += value;
      x += column * value;
      y += row * value;
    }
  }
  return { x: x / total, y: y / total, total };
};

test('normalization returns 256 finite values and turns empty inputs into zeros', () => {
  const dark = normalizePixels(new Float32Array(256), 16, 16);
  const light = normalizePixels(new Float32Array(256).fill(1), 16, 16);
  assert.equal(dark.length, 256);
  assert.ok(dark.every((value) => value === 0));
  assert.ok(light.every((value) => value === 0));
});

test('a light background is inverted so the digit becomes bright', () => {
  const input = new Float32Array(256).fill(1);
  for (let y = 5; y < 11; y += 1) input[y * 16 + 8] = 0;
  const result = normalizePixels(input, 16, 16);
  assert.ok(centerOfMass(result).total > 0);
  assert.ok(result[8 * 16] < 0.01);
});

test('a digit in the corner is centered by its mass', () => {
  const input = new Float32Array(256);
  input[3 * 16 + 2] = 1;
  const center = centerOfMass(normalizePixels(input, 16, 16));
  assert.ok(Math.abs(center.x - 7.5) < 0.2, `x=${center.x}`);
  assert.ok(Math.abs(center.y - 7.5) < 0.2, `y=${center.y}`);
});

test('the longest normalized side is at most 12 pixels', () => {
  const input = new Float32Array(256);
  for (let y = 0; y < 16; y += 1) input[y * 16] = 1;
  const result = normalizePixels(input, 16, 16);
  const occupiedRows = [];
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      if (result[y * 16 + x] > 0.05) occupiedRows.push(y);
    }
  }
  assert.ok(Math.max(...occupiedRows) - Math.min(...occupiedRows) + 1 <= 12);
});

test('mismatched dimensions are rejected', () => {
  assert.throws(() => normalizePixels([0, 1], 16, 16), /length|size/i);
});
