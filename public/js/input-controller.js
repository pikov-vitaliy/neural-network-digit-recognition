import { normalizePixels } from '/shared/image.js';

export class InputController {
  constructor({ preview, drawingCanvas, fileInput, uploadZone, onChange, onError }) {
    this.preview = preview;
    this.drawingCanvas = drawingCanvas;
    this.fileInput = fileInput;
    this.uploadZone = uploadZone;
    this.onChange = onChange;
    this.onError = onError;
    this.pixels = new Float32Array(256);
    this.name = 'Пустой вход';
    this.drawing = false;
    this.context = drawingCanvas.getContext('2d');
    this.clearDrawing(false);
    this.bindDrawing();
    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) this.loadFile(fileInput.files[0]);
    });
    for (const eventName of ['dragenter', 'dragover']) {
      uploadZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        uploadZone.classList.add('dragging');
      });
    }
    for (const eventName of ['dragleave', 'drop']) {
      uploadZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        uploadZone.classList.remove('dragging');
      });
    }
    uploadZone.addEventListener('drop', (event) => {
      const file = event.dataTransfer.files[0];
      if (file) this.loadFile(file);
    });
  }

  setPixels(pixels, name) {
    if (!pixels || pixels.length !== 256) throw new RangeError('Ожидается изображение 16×16');
    this.pixels = pixels instanceof Float32Array ? pixels : Float32Array.from(pixels);
    this.name = name;
    this.paintPreview();
    this.onChange(this.pixels, name);
  }

  paintPreview() {
    const image = new ImageData(16, 16);
    for (let index = 0; index < 256; index += 1) {
      const value = Math.round(Math.max(0, Math.min(1, this.pixels[index])) * 255);
      image.data[index * 4] = Math.round(value * 0.92);
      image.data[index * 4 + 1] = Math.round(value * 0.97);
      image.data[index * 4 + 2] = value;
      image.data[index * 4 + 3] = 255;
    }
    this.preview.getContext('2d').putImageData(image, 0, 0);
    this.preview.setAttribute('aria-label', `${this.name}, изображение 16 на 16 пикселей`);
  }

  bindDrawing() {
    const position = (event) => {
      const bounds = this.drawingCanvas.getBoundingClientRect();
      return {
        x: (event.clientX - bounds.left) * this.drawingCanvas.width / bounds.width,
        y: (event.clientY - bounds.top) * this.drawingCanvas.height / bounds.height,
      };
    };
    this.drawingCanvas.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.drawing = true;
      this.drawingCanvas.setPointerCapture(event.pointerId);
      const point = position(event);
      this.context.beginPath();
      this.context.moveTo(point.x, point.y);
      this.context.lineTo(point.x + 0.01, point.y + 0.01);
      this.context.stroke();
    });
    this.drawingCanvas.addEventListener('pointermove', (event) => {
      if (!this.drawing) return;
      const point = position(event);
      this.context.lineTo(point.x, point.y);
      this.context.stroke();
    });
    const finish = () => {
      if (!this.drawing) return;
      this.drawing = false;
      const source = this.context.getImageData(0, 0, 256, 256).data;
      const gray = new Float32Array(256 * 256);
      for (let index = 0; index < gray.length; index += 1) {
        gray[index] = (source[index * 4] * 0.2126 + source[index * 4 + 1] * 0.7152 + source[index * 4 + 2] * 0.0722) / 255;
      }
      this.setPixels(normalizePixels(gray, 256, 256), 'Собственный рисунок');
    };
    this.drawingCanvas.addEventListener('pointerup', finish);
    this.drawingCanvas.addEventListener('pointercancel', finish);
  }

  clearDrawing(notify = true) {
    this.context.fillStyle = '#000000';
    this.context.fillRect(0, 0, 256, 256);
    this.context.strokeStyle = '#ffffff';
    this.context.lineWidth = 22;
    this.context.lineCap = 'round';
    this.context.lineJoin = 'round';
    if (notify) this.setPixels(new Float32Array(256), 'Пустой рисунок');
  }

  async loadFile(file) {
    try {
      if (!file.type.startsWith('image/')) throw new Error('Выберите файл изображения');
      if (file.size > 10 * 1024 * 1024) throw new Error('Размер изображения не должен превышать 10 МБ');
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, 64, 64);
      const scale = Math.min(64 / bitmap.width, 64 / bitmap.height);
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      context.drawImage(bitmap, (64 - width) / 2, (64 - height) / 2, width, height);
      bitmap.close();
      const rgba = context.getImageData(0, 0, 64, 64).data;
      const gray = new Float32Array(64 * 64);
      for (let index = 0; index < gray.length; index += 1) {
        gray[index] = (rgba[index * 4] * 0.2126 + rgba[index * 4 + 1] * 0.7152 + rgba[index * 4 + 2] * 0.0722) / 255;
      }
      this.setPixels(normalizePixels(gray, 64, 64), file.name);
    } catch (error) {
      this.onError(error.message);
    } finally {
      this.fileInput.value = '';
    }
  }
}
