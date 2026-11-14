import { DigitNetwork } from '/shared/neural-network.js';

export const MODEL_KEY = 'ai-engineers-digit-lab-model-v1';
export const HISTORY_KEY = 'ai-engineers-digit-lab-history-v1';
export const MODEL_SIZES = [256, 16, 12, 10];

export function parseModel(serialized) {
  let value;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new TypeError('Файл не является корректным JSON.');
  }
  let restored;
  try {
    restored = DigitNetwork.fromJSON(value);
  } catch (error) {
    if (/version/i.test(error.message)) throw new TypeError('Версия модели не поддерживается.');
    if (/shape|length/i.test(error.message)) throw new TypeError('Размер или структура параметров модели неверны.');
    if (/base64|data/i.test(error.message)) throw new TypeError('Данные весов повреждены.');
    if (/steps/i.test(error.message)) throw new TypeError('Счётчик шагов модели повреждён.');
    throw new TypeError('Параметры модели повреждены или не являются конечными числами.');
  }
  if (restored.sizes.length !== MODEL_SIZES.length || restored.sizes.some((size, index) => size !== MODEL_SIZES[index])) {
    throw new TypeError('Несовместимая архитектура: ожидается 256→16→12→10.');
  }
  return restored;
}

export function validateModel(network, trainingSamples, validationSamples) {
  try {
    const training = network.evaluate(trainingSamples);
    const validation = network.evaluate(validationSamples);
    if (![training.loss, training.accuracy, validation.loss, validation.accuracy].every(Number.isFinite)) {
      throw new RangeError('Метрики модели не являются конечными числами.');
    }
    return { training, validation };
  } catch (error) {
    throw new RangeError('Числовой диапазон параметров небезопасен для этой лаборатории. Модель не импортирована.', { cause: error });
  }
}

export function readHistory(steps, storage = localStorage) {
  try {
    const value = JSON.parse(storage.getItem(HISTORY_KEY) || 'null');
    if (!value || value.steps !== steps || !Array.isArray(value.epochs)) return [];
    return value.epochs.filter((entry) => Number.isInteger(entry.epoch) && entry.epoch > 0 &&
      [entry.loss, entry.trainAccuracy, entry.validationAccuracy, entry.steps].every(Number.isFinite));
  } catch {
    return [];
  }
}
