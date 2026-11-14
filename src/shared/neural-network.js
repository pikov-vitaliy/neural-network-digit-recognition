const MODEL_VERSION = 1;

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

function sigmoid(value) {
  if (value >= 0) return 1 / (1 + Math.exp(-value));
  const exponential = Math.exp(value);
  return exponential / (1 + exponential);
}

function toBase64(array) {
  const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}

function fromBase64(value, expectedLength, name) {
  if (typeof value !== 'string' || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new TypeError(`Invalid base64 data for ${name}`);
  }
  let binary;
  try {
    binary = atob(value);
  } catch {
    throw new TypeError(`Invalid base64 data for ${name}`);
  }
  if (binary.length !== expectedLength * 4) {
    throw new RangeError(`Invalid ${name} length`);
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const result = new Float32Array(bytes.buffer);
  if (!result.every(Number.isFinite)) throw new TypeError(`Invalid ${name} data`);
  return result;
}

export class DigitNetwork {
  constructor({ sizes = [256, 16, 12, 10], seed = 20261114 } = {}) {
    if (!Array.isArray(sizes) || sizes.length < 2 || sizes.some((size) => !Number.isInteger(size) || size < 1)) {
      throw new TypeError('Invalid layer sizes');
    }
    this.sizes = [...sizes];
    this.steps = 0;
    const random = randomGenerator(seed);
    this.layers = sizes.slice(1).map((outputSize, index) => {
      const inputSize = sizes[index];
      const limit = Math.sqrt(6 / (inputSize + outputSize));
      const weights = new Float32Array(inputSize * outputSize);
      for (let position = 0; position < weights.length; position += 1) {
        weights[position] = (random() * 2 - 1) * limit;
      }
      return { weights, biases: new Float32Array(outputSize) };
    });
    this.activations = [];
  }

  forward(input) {
    if (!input || typeof input.length !== 'number' || input.length !== this.sizes[0]) {
      throw new RangeError(`Input must contain ${this.sizes[0]} values`);
    }
    let current = input instanceof Float32Array ? input : Float32Array.from(input);
    if (!current.every(Number.isFinite)) throw new TypeError('Input values must be finite');
    const activations = [current];
    for (let layerIndex = 0; layerIndex < this.layers.length; layerIndex += 1) {
      const layer = this.layers[layerIndex];
      const outputSize = this.sizes[layerIndex + 1];
      const output = new Float32Array(outputSize);
      const isOutput = layerIndex === this.layers.length - 1;
      if (isOutput) {
        let maximum = -Infinity;
        for (let neuron = 0; neuron < outputSize; neuron += 1) {
          let sum = layer.biases[neuron];
          for (let source = 0; source < current.length; source += 1) {
            sum += layer.weights[neuron * current.length + source] * current[source];
          }
          output[neuron] = sum;
          maximum = Math.max(maximum, output[neuron]);
        }
        let total = 0;
        for (let neuron = 0; neuron < outputSize; neuron += 1) {
          output[neuron] = Math.exp(output[neuron] - maximum);
          total += output[neuron];
        }
        for (let neuron = 0; neuron < outputSize; neuron += 1) output[neuron] /= total;
      } else {
        for (let neuron = 0; neuron < outputSize; neuron += 1) {
          let sum = layer.biases[neuron];
          for (let source = 0; source < current.length; source += 1) {
            sum += layer.weights[neuron * current.length + source] * current[source];
          }
          output[neuron] = sigmoid(sum);
        }
      }
      activations.push(output);
      current = output;
    }
    this.activations = activations;
    let prediction = 0;
    for (let digit = 1; digit < current.length; digit += 1) {
      if (current[digit] > current[prediction]) prediction = digit;
    }
    return {
      activations,
      probabilities: current,
      prediction,
      confidence: current[prediction],
    };
  }

  trainExample(input, label, learningRate = 0.35) {
    if (!Number.isInteger(label) || label < 0 || label >= this.sizes.at(-1)) {
      throw new RangeError('Label is outside the output layer');
    }
    if (!Number.isFinite(learningRate) || learningRate <= 0) {
      throw new RangeError('Learning rate must be positive');
    }
    const result = this.forward(input);
    const deltas = new Array(this.layers.length);
    const outputDelta = new Float32Array(result.probabilities.length);
    for (let neuron = 0; neuron < outputDelta.length; neuron += 1) {
      outputDelta[neuron] = result.probabilities[neuron] - (neuron === label ? 1 : 0);
    }
    deltas[deltas.length - 1] = outputDelta;
    for (let layerIndex = this.layers.length - 2; layerIndex >= 0; layerIndex -= 1) {
      const outputSize = this.sizes[layerIndex + 1];
      const nextLayer = this.layers[layerIndex + 1];
      const nextDelta = deltas[layerIndex + 1];
      const activation = result.activations[layerIndex + 1];
      const delta = new Float32Array(outputSize);
      for (let neuron = 0; neuron < outputSize; neuron += 1) {
        let error = 0;
        for (let target = 0; target < nextDelta.length; target += 1) {
          error += nextLayer.weights[target * outputSize + neuron] * nextDelta[target];
        }
        delta[neuron] = error * activation[neuron] * (1 - activation[neuron]);
      }
      deltas[layerIndex] = delta;
    }
    for (let layerIndex = 0; layerIndex < this.layers.length; layerIndex += 1) {
      const layer = this.layers[layerIndex];
      const inputActivation = result.activations[layerIndex];
      const delta = deltas[layerIndex];
      for (let neuron = 0; neuron < delta.length; neuron += 1) {
        const gradient = delta[neuron];
        for (let source = 0; source < inputActivation.length; source += 1) {
          layer.weights[neuron * inputActivation.length + source] -= learningRate * gradient * inputActivation[source];
        }
        layer.biases[neuron] -= learningRate * gradient;
      }
    }
    this.steps += 1;
    return {
      loss: -Math.log(Math.max(result.probabilities[label], 1e-12)),
      prediction: result.prediction,
      confidence: result.confidence,
    };
  }

  evaluate(samples) {
    if (!Array.isArray(samples) || samples.length === 0) return { loss: 0, accuracy: 0 };
    let loss = 0;
    let correct = 0;
    for (const sample of samples) {
      const result = this.forward(sample.pixels);
      loss -= Math.log(Math.max(result.probabilities[sample.label], 1e-12));
      if (result.prediction === sample.label) correct += 1;
    }
    return { loss: loss / samples.length, accuracy: correct / samples.length };
  }

  toJSON() {
    return {
      version: MODEL_VERSION,
      sizes: [...this.sizes],
      steps: this.steps,
      layers: this.layers.map((layer) => ({
        weights: toBase64(layer.weights),
        biases: toBase64(layer.biases),
      })),
    };
  }

  static fromJSON(value) {
    if (!value || typeof value !== 'object' || value.version !== MODEL_VERSION) {
      throw new TypeError('Unsupported model version');
    }
    const { sizes } = value;
    if (!Array.isArray(sizes) || sizes.length < 2 || sizes.length > 6 ||
        sizes.some((size) => !Number.isInteger(size) || size < 1 || size > 4096) ||
        !Array.isArray(value.layers) || value.layers.length !== sizes.length - 1) {
      throw new TypeError('Invalid model shape');
    }
    const parameterCount = sizes.slice(1).reduce((sum, size, index) => sum + size * (sizes[index] + 1), 0);
    if (parameterCount > 2_000_000) throw new RangeError('Model shape is too large');
    const network = new DigitNetwork({ sizes });
    network.layers = value.layers.map((layer, index) => ({
      weights: fromBase64(layer?.weights, sizes[index] * sizes[index + 1], 'weights'),
      biases: fromBase64(layer?.biases, sizes[index + 1], 'biases'),
    }));
    if (!Number.isInteger(value.steps) || value.steps < 0) throw new TypeError('Invalid training steps');
    network.steps = value.steps;
    return network;
  }
}
