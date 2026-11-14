import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { normalizePixels } from '../src/shared/image.js';
import { encodePng } from '../src/shared/png.js';

const GLYPHS = [
  ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
];

const ALTERNATE_GLYPHS = [
  ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  ['00100', '10100', '00100', '00100', '00100', '00100', '11111'],
  ['00110', '01001', '00001', '00010', '00100', '01000', '11111'],
  ['01110', '10001', '00001', '00110', '00001', '10001', '01110'],
  ['10010', '10010', '10010', '11111', '00010', '00010', '00010'],
  ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  ['11111', '00001', '00010', '00010', '00100', '00100', '00100'],
  ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
];

function randomGenerator(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function dilatePixels(pixels, size, radius) {
  const result = new Float32Array(pixels);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const value = pixels[y * size + x];
      if (value <= 0) continue;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const targetX = x + dx;
          const targetY = y + dy;
          if (targetX < 0 || targetX >= size || targetY < 0 || targetY >= size) continue;
          const target = targetY * size + targetX;
          result[target] = Math.max(result[target], value);
        }
      }
    }
  }
  return result;
}

function renderGlyph(label, variant, random) {
  const size = 64;
  const pixels = new Float32Array(size * size);
  const glyph = (variant % 3 === 1 ? ALTERNATE_GLYPHS : GLYPHS)[label];
  const angle = (random() - 0.5) * 0.42;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const scaleX = 0.82 + random() * 0.28;
  const scaleY = 0.88 + random() * 0.2;
  const shear = (random() - 0.5) * 0.24;
  const thickness = 0.02 + random() * 0.13;
  const cell = 7.2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let coverage = 0;
      for (const [dx, dy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
        const centeredX = x + dx - size / 2;
        const centeredY = y + dy - size / 2;
        const rotatedX = (centeredX * cosine + centeredY * sine) / scaleX;
        const rotatedY = (-centeredX * sine + centeredY * cosine) / scaleY;
        const glyphX = (rotatedX - rotatedY * shear) / cell + 2.5;
        const glyphY = rotatedY / cell + 3.5;
        const column = Math.floor(glyphX);
        const row = Math.floor(glyphY);
        if (row >= 0 && row < 7 && column >= 0 && column < 5 && glyph[row][column] === '1') coverage += 1;
      }
      pixels[y * size + x] = coverage / 4;
    }
  }
  return dilatePixels(pixels, size, Math.round(thickness * 8));
}

export function generateDataset() {
  const samples = [];
  for (let label = 0; label <= 9; label += 1) {
    for (let variant = 0; variant < 10; variant += 1) {
      const random = randomGenerator(20261114 + label * 1009 + variant * 9176);
      const rendered = renderGlyph(label, variant, random);
      const normalized = normalizePixels(rendered, 64, 64);
      const pixels = new Uint8Array(256);
      const shiftX = Math.floor(random() * 3) - 1;
      const shiftY = Math.floor(random() * 3) - 1;
      const noise = 0.025 + random() * 0.035;
      for (let y = 0; y < 16; y += 1) {
        for (let x = 0; x < 16; x += 1) {
          const sourceX = Math.max(0, Math.min(15, x - shiftX));
          const sourceY = Math.max(0, Math.min(15, y - shiftY));
          let value = normalized[sourceY * 16 + sourceX] + (random() - 0.5) * noise;
          if (random() < 0.006) value += 0.18 + random() * 0.25;
          pixels[y * 16 + x] = Math.round(Math.max(0, Math.min(1, value)) * 255);
        }
      }
      const id = `digit-${label}-${String(variant).padStart(2, '0')}`;
      samples.push({
        id,
        label,
        split: variant < 8 ? 'train' : 'validation',
        variant,
        file: `samples/${id}.png`,
        pixels,
      });
    }
  }
  return samples;
}

async function writeDataset() {
  const outputDirectory = new URL('../public/samples/', import.meta.url);
  await mkdir(outputDirectory, { recursive: true });
  const samples = generateDataset();
  const manifest = {
    imageSize: 16,
    seed: 20261114,
    samples: samples.map((sample) => ({
      ...sample,
      pixels: Buffer.from(sample.pixels).toString('base64'),
    })),
  };
  await Promise.all(samples.map((sample) => writeFile(new URL(sample.id + '.png', outputDirectory), encodePng(sample.pixels))));
  await writeFile(new URL('manifest.json', outputDirectory), JSON.stringify(manifest));
  console.log('Создано 100 изображений 16×16: 80 для обучения, 20 для проверки.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await writeDataset();
}
