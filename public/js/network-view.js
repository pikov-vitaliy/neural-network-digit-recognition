const DISPLAY_DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

export class NetworkView {
  constructor(canvas, network, { tooltip, onSelection } = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.network = network;
    this.tooltip = tooltip;
    this.onSelection = onSelection;
    this.selected = null;
    this.activeEdges = [];
    this.cache = document.createElement('canvas');
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);
    canvas.addEventListener('pointermove', (event) => this.pointerMove(event));
    canvas.addEventListener('pointerleave', () => { tooltip.hidden = true; });
    canvas.addEventListener('click', (event) => {
      const hit = this.hitTest(this.localPoint(event));
      if (hit) this.select(hit.layer, hit.index);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.animationFrame) cancelAnimationFrame(this.animationFrame);
    });
  }

  resize() {
    const width = this.canvas.parentElement.clientWidth;
    const height = this.canvas.parentElement.clientHeight;
    if (!width || !height) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    this.width = width;
    this.height = height;
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    this.cache.width = this.canvas.width;
    this.cache.height = this.canvas.height;
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.cache.getContext('2d').setTransform(ratio, 0, 0, ratio, 0, 0);
    this.layout();
    this.buildCache();
    this.draw(performance.now());
  }

  layout() {
    const { width, height } = this;
    const positions = [];
    const inputPositions = [];
    const gridSize = Math.min(184, (height - 110) * 0.58, width * 0.24);
    const gridLeft = Math.max(14, width * 0.035);
    const gridTop = (height - gridSize) / 2;
    const cell = gridSize / 16;
    for (let index = 0; index < 256; index += 1) {
      inputPositions.push({
        x: gridLeft + (index % 16 + 0.5) * cell,
        y: gridTop + (Math.floor(index / 16) + 0.5) * cell,
      });
    }
    positions.push(inputPositions);
    const xPositions = [0, width * 0.43, width * 0.68, width * 0.89];
    for (let layer = 1; layer < 4; layer += 1) {
      const count = this.network.sizes[layer];
      const layerPositions = [];
      for (let index = 0; index < count; index += 1) {
        layerPositions.push({ x: xPositions[layer], y: 52 + (height - 100) * index / (count - 1) });
      }
      positions.push(layerPositions);
    }
    this.positions = positions;
    this.grid = { left: gridLeft, top: gridTop, size: gridSize, cell };
    this.nodeRadius = Math.max(7, Math.min(13, (height - 100) / 32));
  }

  palette() {
    const styles = getComputedStyle(document.documentElement);
    return {
      positive: styles.getPropertyValue('--positive').trim(),
      negative: styles.getPropertyValue('--negative').trim(),
      signal: styles.getPropertyValue('--signal').trim(),
      ink: styles.getPropertyValue('--canvas-ink').trim(),
      muted: styles.getPropertyValue('--canvas-muted').trim(),
    };
  }

  buildCache() {
    if (!this.positions) return;
    const context = this.cache.getContext('2d');
    context.clearRect(0, 0, this.width, this.height);
    const colors = this.palette();
    context.lineWidth = 0.45;
    for (let layer = 0; layer < 3; layer += 1) {
      const weights = this.network.layers[layer].weights;
      const inputCount = this.network.sizes[layer];
      for (let target = 0; target < this.network.sizes[layer + 1]; target += 1) {
        const end = this.positions[layer + 1][target];
        for (let source = 0; source < inputCount; source += 1) {
          const start = this.positions[layer][source];
          const weight = weights[target * inputCount + source];
          context.globalAlpha = 0.045 + Math.min(0.035, Math.abs(weight) * 0.025);
          context.strokeStyle = weight >= 0 ? colors.positive : colors.negative;
          context.beginPath();
          context.moveTo(start.x, start.y);
          context.lineTo(end.x, end.y);
          context.stroke();
        }
      }
    }
    context.globalAlpha = 1;
  }

  setNetwork(network) {
    this.network = network;
    this.selected = null;
    if (this.width) {
      this.layout();
      this.buildCache();
    }
  }

  refreshTheme() {
    if (this.width) this.buildCache();
    this.draw(performance.now());
  }

  render(result, { animate = false } = {}) {
    this.result = result;
    this.computeActiveEdges();
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    if (animate && !this.reducedMotion.matches && !document.hidden) {
      this.animationStart = performance.now();
      const frame = (time) => {
        this.draw(time);
        if (time - this.animationStart < 850 && !document.hidden) this.animationFrame = requestAnimationFrame(frame);
      };
      this.animationFrame = requestAnimationFrame(frame);
    } else this.draw(performance.now());
  }

  computeActiveEdges() {
    if (!this.result) return;
    const edges = [];
    for (let layer = 0; layer < 3; layer += 1) {
      const weights = this.network.layers[layer].weights;
      const input = this.result.activations[layer];
      const inputCount = this.network.sizes[layer];
      for (let target = 0; target < this.network.sizes[layer + 1]; target += 1) {
        for (let source = 0; source < inputCount; source += 1) {
          const weight = weights[target * inputCount + source];
          const contribution = Math.abs(weight * input[source]);
          if (contribution > 0.0001) edges.push({ layer, source, target, weight, contribution });
        }
      }
    }
    edges.sort((a, b) => b.contribution - a.contribution);
    this.activeEdges = edges.slice(0, 250);
  }

  draw(time) {
    if (!this.width || !this.result || !this.positions) return;
    const context = this.context;
    context.clearRect(0, 0, this.width, this.height);
    context.drawImage(this.cache, 0, 0, this.width, this.height);
    const colors = this.palette();
    const maximum = this.activeEdges[0]?.contribution || 1;
    for (const edge of this.activeEdges) {
      const start = this.positions[edge.layer][edge.source];
      const end = this.positions[edge.layer + 1][edge.target];
      const strength = edge.contribution / maximum;
      context.globalAlpha = 0.1 + strength * 0.62;
      context.strokeStyle = edge.weight >= 0 ? colors.positive : colors.negative;
      context.lineWidth = 0.55 + strength * 1.35;
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      context.stroke();
    }
    context.globalAlpha = 1;
    this.drawSelected(context, colors);
    this.drawNodes(context, colors);
    this.drawLabels(context, colors);
    if (this.animationStart && time - this.animationStart < 850) this.drawPulse(context, time);
  }

  drawSelected(context, colors) {
    if (!this.selected || this.selected.layer === 0) return;
    const { layer, index } = this.selected;
    const inputCount = this.network.sizes[layer - 1];
    const weights = this.network.layers[layer - 1].weights;
    const incoming = [];
    for (let source = 0; source < inputCount; source += 1) {
      const weight = weights[index * inputCount + source];
      const activation = this.result.activations[layer - 1][source];
      incoming.push({ source, weight, contribution: Math.abs(weight * activation) });
    }
    incoming.sort((a, b) => b.contribution - a.contribution);
    const labelled = new Set(incoming.slice(0, 5).map((edge) => edge.source));
    const end = this.positions[layer][index];
    for (const edge of incoming) {
      const start = this.positions[layer - 1][edge.source];
      context.globalAlpha = 0.68;
      context.strokeStyle = edge.weight >= 0 ? colors.positive : colors.negative;
      context.lineWidth = 1.2;
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      context.stroke();
      if (labelled.has(edge.source) && layer > 1) {
        const x = start.x + (end.x - start.x) * 0.56;
        const y = start.y + (end.y - start.y) * 0.56;
        context.globalAlpha = 1;
        context.fillStyle = '#172338';
        context.strokeStyle = edge.weight >= 0 ? colors.positive : colors.negative;
        context.lineWidth = 1;
        context.beginPath();
        context.arc(x, y, 12, 0, Math.PI * 2);
        context.fill();
        context.stroke();
        context.fillStyle = '#edf2ff';
        context.font = '7px "Cascadia Mono", Consolas, monospace';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(edge.weight.toFixed(2), x, y);
      }
    }
    context.globalAlpha = 1;
  }

  drawNodes(context, colors) {
    const input = this.result.activations[0];
    for (let index = 0; index < 256; index += 1) {
      const point = this.positions[0][index];
      const value = input[index];
      const shade = Math.round(10 + value * 225);
      context.fillStyle = `rgb(${Math.round(shade * 0.86)}, ${Math.round(shade * 0.93)}, ${shade})`;
      const size = Math.max(2, this.grid.cell - 1.2);
      context.fillRect(point.x - size / 2, point.y - size / 2, size, size);
    }
    for (let layer = 1; layer < 4; layer += 1) {
      const isOutput = layer === 3;
      const radius = isOutput ? Math.max(13, this.nodeRadius + 3) : this.nodeRadius;
      for (let index = 0; index < this.network.sizes[layer]; index += 1) {
        const point = this.positions[layer][index];
        const activation = this.result.activations[layer][index];
        const selected = this.selected?.layer === layer && this.selected?.index === index;
        context.globalAlpha = 1;
        context.fillStyle = `rgba(93, 132, 220, ${0.13 + activation * 0.55})`;
        context.strokeStyle = selected ? colors.ink : colors.signal;
        context.lineWidth = selected ? 2.5 : 1;
        context.beginPath();
        context.arc(point.x, point.y, radius, 0, Math.PI * 2);
        context.fill();
        context.stroke();
        context.fillStyle = colors.ink;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.font = `${isOutput ? 11 : Math.max(6, this.nodeRadius * 0.62)}px "Cascadia Mono", Consolas, monospace`;
        context.fillText(isOutput ? String(DISPLAY_DIGITS[index]) : activation.toFixed(2), point.x, point.y - (isOutput ? 3 : 0));
        if (isOutput) {
          context.fillStyle = colors.muted;
          context.font = '6px "Cascadia Mono", Consolas, monospace';
          context.fillText(`${Math.round(activation * 100)}%`, point.x, point.y + 7);
        }
      }
    }
  }

  drawLabels(context, colors) {
    const labels = ['ВХОД · 16×16', 'СКРЫТЫЙ · 16', 'СКРЫТЫЙ · 12', 'ВЫХОД · 10'];
    const xs = [this.grid.left + this.grid.size / 2, ...this.positions.slice(1).map((layer) => layer[0].x)];
    context.fillStyle = colors.muted;
    context.font = '8px "Cascadia Mono", Consolas, monospace';
    context.textAlign = 'center';
    context.textBaseline = 'alphabetic';
    labels.forEach((label, index) => context.fillText(label, xs[index], 23));
    context.fillStyle = colors.muted;
    context.font = '8px "Segoe UI", sans-serif';
    context.fillText('a = σ(Σw·x + b)', this.positions[2][0].x, 38);
  }

  drawPulse(context, time) {
    const elapsed = time - this.animationStart;
    const colors = this.palette();
    this.activeEdges.slice(0, 42).forEach((edge, index) => {
      const progress = Math.max(0, Math.min(1, (elapsed - (index % 7) * 45) / 580));
      if (progress <= 0 || progress >= 1) return;
      const start = this.positions[edge.layer][edge.source];
      const end = this.positions[edge.layer + 1][edge.target];
      const eased = 1 - (1 - progress) ** 2;
      context.globalAlpha = Math.sin(progress * Math.PI);
      context.fillStyle = edge.weight >= 0 ? colors.positive : colors.negative;
      context.beginPath();
      context.arc(start.x + (end.x - start.x) * eased, start.y + (end.y - start.y) * eased, 2.2, 0, Math.PI * 2);
      context.fill();
    });
    context.globalAlpha = 1;
  }

  localPoint(event) {
    const bounds = this.canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  hitTest(point) {
    if (!this.positions) return null;
    let nearest = null;
    let distance = Infinity;
    for (let layer = 1; layer < 4; layer += 1) {
      this.positions[layer].forEach((position, index) => {
        const current = Math.hypot(point.x - position.x, point.y - position.y);
        const threshold = (layer === 3 ? this.nodeRadius + 3 : this.nodeRadius) + 7;
        if (current <= threshold && current < distance) {
          nearest = { layer, index };
          distance = current;
        }
      });
    }
    return nearest;
  }

  pointerMove(event) {
    const point = this.localPoint(event);
    const hit = this.hitTest(point);
    if (!hit || !this.result) {
      this.tooltip.hidden = true;
      this.canvas.style.cursor = 'default';
      return;
    }
    const activation = this.result.activations[hit.layer][hit.index];
    const bias = this.network.layers[hit.layer - 1].biases[hit.index];
    this.tooltip.textContent = `Слой ${hit.layer} · нейрон ${hit.index + 1}\na = ${activation.toFixed(4)} · b = ${bias.toFixed(4)}\nНажмите, чтобы увидеть веса`;
    this.tooltip.style.left = `${Math.min(this.width - 190, point.x + 12)}px`;
    this.tooltip.style.top = `${Math.max(8, point.y - 52)}px`;
    this.tooltip.hidden = false;
    this.canvas.style.cursor = 'pointer';
  }

  select(layer, index) {
    if (layer < 1 || layer > 3 || index < 0 || index >= this.network.sizes[layer]) return;
    this.selected = { layer, index };
    this.draw(performance.now());
    this.onSelection?.(this.getInspection());
  }

  getInspection() {
    if (!this.selected || !this.result) return null;
    const { layer, index } = this.selected;
    const incoming = [];
    const inputCount = this.network.sizes[layer - 1];
    const weights = this.network.layers[layer - 1].weights;
    for (let source = 0; source < inputCount; source += 1) {
      const weight = weights[index * inputCount + source];
      const activation = this.result.activations[layer - 1][source];
      incoming.push({ source, weight, activation, contribution: Math.abs(weight * activation) });
    }
    incoming.sort((a, b) => b.contribution - a.contribution);
    return {
      layer,
      index,
      activation: this.result.activations[layer][index],
      bias: this.network.layers[layer - 1].biases[index],
      incoming,
    };
  }
}
