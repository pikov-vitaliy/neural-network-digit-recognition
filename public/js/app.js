import { DigitNetwork } from '/shared/neural-network.js';
import { loadDataset } from './dataset.js';
import { InputController } from './input-controller.js';
import { NetworkView } from './network-view.js';
import { createTrainingRandom, EPOCH_COUNT, trainEpoch } from './training.js';

const $ = (id) => document.getElementById(id);
const DISPLAY_DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
const THEME_KEY = 'ai-engineers-color-scheme';
const MODEL_KEY = 'ai-engineers-digit-lab-model-v1';
const MODEL_SIZES = [256, 16, 12, 10];
const themeMeta = document.querySelector('meta[name="color-scheme"]');
const systemTheme = matchMedia('(prefers-color-scheme: dark)');

function parseModel(serialized) {
  const restored = DigitNetwork.fromJSON(JSON.parse(serialized));
  if (restored.sizes.length !== MODEL_SIZES.length || restored.sizes.some((size, index) => size !== MODEL_SIZES[index])) {
    throw new TypeError('Несовместимая архитектура модели');
  }
  return restored;
}

function loadModel() {
  try {
    const serialized = localStorage.getItem(MODEL_KEY);
    return serialized ? { network: parseModel(serialized) } : {};
  } catch {
    return { error: 'Сохранённая модель повреждена или недоступна. Используются случайные веса.' };
  }
}

const savedModel = loadModel();
let network = savedModel.network || new DigitNetwork();
let dataset = [];
let trainingSamples = [];
let validationSamples = [];
let currentResult = null;
let selectedSample = null;
let trainingToken = null;
let toastTimer;

function showToast(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  $('announcer').textContent = message;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500);
}

function updateModelStatus() {
  $('model-status').classList.toggle('trained', network.steps > 0);
  $('model-status').lastElementChild.textContent = network.steps > 0
    ? `Обучена · ${network.steps} шагов`
    : 'Случайные веса';
}

function persistModel() {
  try {
    localStorage.setItem(MODEL_KEY, JSON.stringify(network.toJSON()));
  } catch {
    showToast('Не удалось сохранить модель в браузере. Используйте экспорт в JSON.');
  }
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1).replace('.', ',')}%`;
}

function updateMetrics(trainingResult = network.evaluate(trainingSamples)) {
  const validationResult = network.evaluate(validationSamples);
  $('loss-value').textContent = trainingResult.loss.toFixed(4);
  $('train-accuracy').textContent = formatPercent(trainingResult.accuracy);
  $('validation-accuracy').textContent = formatPercent(validationResult.accuracy);
}

function setTraining(active) {
  $('train-all').disabled = active || dataset.length === 0;
  $('train-one').disabled = active || dataset.length === 0;
  $('export-model').disabled = active;
  $('import-model').disabled = active;
  $('train-all').textContent = active ? 'Обучение…' : 'Обучить на всех примерах';
}

async function yieldToBrowser() {
  if (globalThis.scheduler?.yield) await globalThis.scheduler.yield();
  else await new Promise((resolve) => setTimeout(resolve, 0));
}

function updateInspector(inspection) {
  if (!inspection) return;
  const layerNames = ['Вход', 'Скрытый слой 1', 'Скрытый слой 2', 'Выходной слой'];
  const neuronName = inspection.layer === 3 ? ` · цифра ${inspection.index}` : ` · нейрон ${inspection.index + 1}`;
  $('inspection-title').textContent = `${layerNames[inspection.layer]}${neuronName}`;
  $('activation-value').textContent = inspection.activation.toFixed(4);
  $('bias-value').textContent = inspection.bias.toFixed(4);
  $('neuron-picker').value = `${inspection.layer}:${inspection.index}`;
  $('inspection-copy').textContent = inspection.layer === 3
    ? 'Этот нейрон голосует за свою цифру. После softmax его сигнал становится долей общей уверенности.'
    : 'Чем выше активация, тем сильнее этот нейрон передаёт обнаруженный признак следующему слою.';
  $('weight-list').replaceChildren();
  for (const edge of inspection.incoming.slice(0, 8)) {
    const chip = document.createElement('span');
    chip.className = `weight-chip ${edge.weight >= 0 ? 'positive' : 'negative'}`;
    chip.textContent = `n${edge.source + 1}: w=${edge.weight.toFixed(4)} · w·a=${(edge.weight * edge.activation).toFixed(3)}`;
    $('weight-list').append(chip);
  }
}

const input = new InputController({
  preview: $('input-preview'),
  drawingCanvas: $('drawing-canvas'),
  fileInput: $('file-input'),
  uploadZone: $('upload-zone'),
  onChange: (_pixels, name) => {
    $('sample-name').textContent = name;
    runForward(false);
  },
  onError: showToast,
});

const view = new NetworkView($('network-canvas'), network, {
  tooltip: $('network-tooltip'),
  onSelection: updateInspector,
});

function runForward(animate = false) {
  currentResult = network.forward(input.pixels);
  view.network = network;
  if (view.width) view.buildCache();
  view.render(currentResult, { animate });
  updateOutputs(currentResult, false);
  if (view.selected) updateInspector(view.getInspection());
}

function updateOutputs(result, reveal) {
  for (const digit of DISPLAY_DIGITS) {
    const row = $(`output-row-${digit}`);
    const probability = result.probabilities[digit];
    row.classList.toggle('winner', reveal && result.prediction === digit);
    row.querySelector('.confidence-bar').style.width = `${(probability * 100).toFixed(2)}%`;
    row.querySelector('output').textContent = `${(probability * 100).toFixed(1).replace('.', ',')}%`;
  }
}

function predict() {
  currentResult = network.forward(input.pixels);
  view.render(currentResult, { animate: true });
  updateOutputs(currentResult, true);
  $('predicted-digit').textContent = String(currentResult.prediction);
  const confidence = (currentResult.confidence * 100).toFixed(1).replace('.', ',');
  $('confidence-copy').textContent = `Уверенность ${confidence}%${network.steps === 0 ? ' · веса ещё случайны' : ''}`;
  view.select(3, currentResult.prediction);
}

function populateNeuronPicker() {
  const select = $('neuron-picker');
  for (let layer = 1; layer < 4; layer += 1) {
    const group = document.createElement('optgroup');
    group.label = layer === 3 ? 'Выходной слой' : `Скрытый слой ${layer}`;
    for (let index = 0; index < network.sizes[layer]; index += 1) {
      const option = document.createElement('option');
      option.value = `${layer}:${index}`;
      option.textContent = layer === 3 ? `Цифра ${index}` : `Нейрон ${index + 1}`;
      group.append(option);
    }
    select.append(group);
  }
  select.addEventListener('change', () => {
    const [layer, index] = select.value.split(':').map(Number);
    view.select(layer, index);
  });
}

function selectSample(sample) {
  selectedSample = sample;
  for (const button of $('sample-grid').querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.id === sample.id));
  }
  $('correct-answer').value = String(sample.label);
  input.setPixels(sample.input, `Цифра ${sample.label} · вариант ${sample.variant + 1} · ${sample.split === 'train' ? 'обучение' : 'проверка'}`);
}

function renderSamples() {
  const list = $('sample-grid');
  list.replaceChildren();
  for (const sample of dataset) {
    const item = document.createElement('li');
    item.dataset.split = sample.split;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.id = sample.id;
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', `Цифра ${sample.label}, вариант ${sample.variant + 1}, ${sample.split === 'train' ? 'обучающий пример' : 'проверочный пример'}`);
    const image = document.createElement('img');
    image.src = `/${sample.file}`;
    image.width = 16;
    image.height = 16;
    image.loading = 'lazy';
    image.alt = '';
    const label = document.createElement('span');
    label.textContent = String(sample.label);
    label.setAttribute('aria-hidden', 'true');
    button.append(image, label);
    button.addEventListener('click', () => selectSample(sample));
    item.append(button);
    list.append(item);
  }
}

function setSource(source) {
  const gallery = source === 'gallery';
  $('source-gallery').setAttribute('aria-pressed', String(gallery));
  $('source-draw').setAttribute('aria-pressed', String(!gallery));
  $('gallery-source').hidden = !gallery;
  $('draw-source').hidden = gallery;
}

function setMode(mode) {
  const training = mode === 'training';
  $('mode-training').setAttribute('aria-pressed', String(training));
  $('mode-recognition').setAttribute('aria-pressed', String(!training));
  $('train-one').hidden = !training;
  $('training-message').textContent = training
    ? '80 примеров для обучения · 20 отложены для проверки'
    : 'Веса заморожены · показываем только прямой проход сигнала';
}

function resolvedTheme() {
  const stored = themeMeta.content;
  return stored === 'light dark' ? (systemTheme.matches ? 'dark' : 'light') : stored;
}

function updateThemeControl() {
  $('theme-toggle').setAttribute('aria-label', resolvedTheme() === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему');
  view.refreshTheme();
}

$('theme-toggle').addEventListener('click', () => {
  const target = resolvedTheme() === 'dark' ? 'light' : 'dark';
  const system = systemTheme.matches ? 'dark' : 'light';
  try {
    if (target === system) localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, target);
  } catch {}
  themeMeta.content = target === system ? 'light dark' : target;
  updateThemeControl();
});
systemTheme.addEventListener('change', updateThemeControl);
window.addEventListener('storage', (event) => {
  if (event.key !== THEME_KEY) return;
  themeMeta.content = event.newValue || 'light dark';
  updateThemeControl();
});
$('help-button').addEventListener('click', () => $('lesson-dialog').showModal());
$('close-lesson').addEventListener('click', () => $('lesson-dialog').close());
$('predict').addEventListener('click', predict);
$('source-gallery').addEventListener('click', () => setSource('gallery'));
$('source-draw').addEventListener('click', () => setSource('draw'));
$('clear-drawing').addEventListener('click', () => input.clearDrawing());
$('dataset-filter').addEventListener('change', () => {
  const filter = $('dataset-filter').value;
  for (const item of $('sample-grid').children) item.hidden = filter !== 'all' && item.dataset.split !== filter;
});
function trainOne() {
  if (trainingToken || dataset.length === 0) return;
  try {
    const label = Number($('correct-answer').value);
    const result = network.trainExample(input.pixels, label);
    updateMetrics();
    updateModelStatus();
    persistModel();
    runForward(false);
    showToast(`Один шаг обучения выполнен. Ошибка примера: ${result.loss.toFixed(4)}.`);
  } catch (error) {
    showToast(`Не удалось выполнить шаг обучения: ${error.message}`);
  }
}

async function trainAll() {
  if (trainingToken || dataset.length === 0) return;
  const token = { cancelled: false };
  const targetNetwork = network;
  const samples = trainingSamples;
  const random = createTrainingRandom();
  const cancelled = () => token.cancelled || targetNetwork !== network;
  trainingToken = token;
  setTraining(true);
  try {
    for (let epoch = 0; epoch < EPOCH_COUNT; epoch += 1) {
      if (cancelled()) return;
      const metrics = trainEpoch(targetNetwork, samples, random);
      if (cancelled()) return;
      updateMetrics(metrics);
      updateModelStatus();
      $('epoch-label').textContent = epoch === EPOCH_COUNT - 1 ? 'Обучение завершено' : `Эпоха ${epoch + 1} из ${EPOCH_COUNT}`;
      $('epoch-count').textContent = `${epoch + 1} / ${EPOCH_COUNT}`;
      $('training-progress').value = epoch + 1;
      $('training-message').textContent = `Эпоха ${epoch + 1}: 80 примеров в перемешанном порядке · модель сохранена`;
      runForward(false);
      persistModel();
      await yieldToBrowser();
      if (cancelled()) return;
    }
    showToast(`Обучение завершено: ${network.steps} шагов. Проверка: ${$('validation-accuracy').textContent}.`);
  } catch (error) {
    $('training-message').textContent = 'Обучение остановлено из-за ошибки';
    showToast(`Не удалось завершить обучение: ${error.message}`);
  } finally {
    if (trainingToken === token) {
      trainingToken = null;
      setTraining(false);
    }
  }
}

function exportModel() {
  const blob = new Blob([JSON.stringify(network.toJSON(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `digit-lab-model-${network.steps}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function importModel(file) {
  if (!file || trainingToken) return;
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error('Файл модели больше 5 МБ');
    const imported = parseModel(await file.text());
    network = imported;
    view.setNetwork(network);
    updateModelStatus();
    updateMetrics();
    persistModel();
    runForward(false);
    view.select(3, currentResult.prediction);
    showToast('Модель импортирована и сохранена в браузере.');
  } catch (error) {
    showToast(`Не удалось импортировать модель: ${error.message}. Текущая сеть не изменена.`);
  } finally {
    $('import-input').value = '';
  }
}

function resetModel() {
  if (trainingToken) trainingToken.cancelled = true;
  trainingToken = null;
  network = new DigitNetwork();
  let storageFailed = false;
  try {
    localStorage.removeItem(MODEL_KEY);
  } catch {
    storageFailed = true;
  }
  view.setNetwork(network);
  updateModelStatus();
  setTraining(false);
  $('epoch-label').textContent = 'Готов к первой эпохе';
  $('epoch-count').textContent = `0 / ${EPOCH_COUNT}`;
  $('training-progress').value = 0;
  $('training-message').textContent = 'Модель сброшена · 80 примеров готовы к новому обучению';
  $('loss-value').textContent = '—';
  $('train-accuracy').textContent = '—';
  $('validation-accuracy').textContent = '—';
  $('predicted-digit').textContent = '—';
  $('confidence-copy').textContent = 'Нажмите «Распознать цифру»';
  runForward(false);
  view.select(3, 5);
  showToast(storageFailed
    ? 'Веса сброшены, но браузер не разрешил очистить сохранение.'
    : 'Модель сброшена. Обучение остановлено, веса снова случайные.');
}

$('mode-training').addEventListener('click', () => setMode('training'));
$('mode-recognition').addEventListener('click', () => setMode('recognition'));
$('train-one').addEventListener('click', trainOne);
$('train-all').addEventListener('click', trainAll);
$('export-model').addEventListener('click', exportModel);
$('import-model').addEventListener('click', () => $('import-input').click());
$('import-input').addEventListener('change', () => importModel($('import-input').files[0]));
$('reset-model').addEventListener('click', () => $('reset-dialog').showModal());
$('cancel-reset').addEventListener('click', () => $('reset-dialog').close());
$('confirm-reset').addEventListener('click', () => {
  $('reset-dialog').close();
  resetModel();
});

populateNeuronPicker();
updateModelStatus();
setTraining(false);
try {
  dataset = await loadDataset();
  trainingSamples = dataset.filter((sample) => sample.split === 'train').map((sample) => ({ pixels: sample.input, label: sample.label }));
  validationSamples = dataset.filter((sample) => sample.split === 'validation').map((sample) => ({ pixels: sample.input, label: sample.label }));
  renderSamples();
  selectSample(dataset.find((sample) => sample.label === 5 && sample.variant === 0) || dataset[0]);
  view.select(3, 5);
  setTraining(false);
  if (savedModel.error) showToast(savedModel.error);
} catch (error) {
  $('sample-name').textContent = 'Примеры не загружены';
  $('predict').disabled = true;
  showToast(error.message);
}
