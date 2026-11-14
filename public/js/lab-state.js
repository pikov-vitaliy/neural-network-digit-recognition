export function canTrainSample(sample, mode = 'training') {
  return mode === 'training' && sample?.split === 'train';
}

export function hasDrawableInput(pixels) {
  return pixels?.length === 256 && pixels.every((value) => Number.isFinite(value)) && pixels.some((value) => value > 0);
}

export function createPrediction(network, pixels, inputVersion, modelVersion) {
  return {
    result: network.forward(pixels),
    pixels: Float32Array.from(pixels),
    inputVersion,
    modelVersion,
  };
}

export function isCurrentPrediction(prediction, inputVersion, modelVersion) {
  return Boolean(prediction && prediction.inputVersion === inputVersion && prediction.modelVersion === modelVersion);
}
