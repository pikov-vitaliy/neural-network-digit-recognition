import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dilatePixels, generateDataset } from '../scripts/generate-samples.js';
import { encodePng } from '../src/shared/png.js';

const dataset = generateDataset();
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('dataset contains exactly 100 deterministic samples, ten for every digit', async () => {
  assert.equal(dataset.length, 100);
  for (let label = 0; label <= 9; label += 1) {
    const examples = dataset.filter((sample) => sample.label === label);
    assert.equal(examples.length, 10);
    assert.equal(examples.filter((sample) => sample.split === 'train').length, 8);
    assert.equal(examples.filter((sample) => sample.split === 'validation').length, 2);
  }
  assert.equal(hash(dataset[0].pixels), hash(generateDataset()[0].pixels));
  assert.equal(new Set(dataset.map((sample) => hash(sample.pixels))).size, 100);
  for (const sample of dataset) {
    assert.equal(sample.pixels.length, 256);
    assert.ok(sample.pixels.some((value) => value > 200), `${sample.id} is empty`);
    assert.match(sample.file, /^samples\/digit-[0-9]-[0-9]{2}\.png$/);
  }
  const manifest = JSON.parse(await readFile(new URL('../public/samples/manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.imageSize, 16);
  assert.equal(manifest.samples.length, 100);
  assert.equal(manifest.samples[0].pixels, Buffer.from(dataset[0].pixels).toString('base64'));
});

test('thickness expands bright glyph marks without changing dimensions', () => {
  const source = new Float32Array(25);
  source[12] = 0.75;
  const expanded = dilatePixels(source, 5, 1);
  assert.equal(expanded.length, 25);
  assert.equal(expanded[12], 0.75);
  for (const index of [6, 7, 8, 11, 13, 16, 17, 18]) assert.equal(expanded[index], 0.75);
  assert.equal(expanded[0], 0);
  assert.deepEqual(dilatePixels(source, 5, 0), source);
});

test('encoded PNG files have a valid signature and 16×16 IHDR', async () => {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  for (const sample of dataset) {
    const encoded = encodePng(sample.pixels);
    assert.ok(encoded.subarray(0, 8).equals(signature));
    assert.equal(encoded.readUInt32BE(16), 16);
    assert.equal(encoded.readUInt32BE(20), 16);
    assert.equal(encoded[24], 8);
    assert.equal(encoded[25], 0);
    const stored = await readFile(new URL(`../public/${sample.file}`, import.meta.url));
    assert.ok(stored.subarray(0, 8).equals(signature));
    assert.equal(stored.readUInt32BE(16), 16);
    assert.equal(stored.readUInt32BE(20), 16);
  }
});
