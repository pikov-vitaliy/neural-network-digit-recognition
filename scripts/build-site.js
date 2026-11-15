#!/usr/bin/env node
// Сборка статической версии для хостинга без Node.js: public/ + src/shared/ -> <out>/ и <out>/shared/.
// Приложение запрашивает только свои файлы (/js, /shared, /samples), поэтому работает с любого
// статического веб-сервера в корне домена, например https://neural-network-digit-recognition.pikov.expert/.
// Запуск: node scripts/build-site.js [папка-результата] [--check]   (по умолчанию dist/site; --check – только проверить путь)
// Папка результата – либо внутри dist/ проекта, либо вне проекта; исходники и ссылки (junction/symlink) запрещены.
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const out = resolve(args.find(a => a !== '--check') || join(root, 'dist', 'site'));

// канонический путь: реальный путь ближайшей существующей папки + остаток; на Windows без учёта регистра
function canonical(p) {
  let head = p, tail = [];
  while (!existsSync(head)) {
    if (dirname(head) === head) throw new Error(`Нет диска или корня для пути: ${p}`);
    tail.unshift(basename(head)); head = dirname(head);
  }
  const real = join(realpathSync.native(head), ...tail);
  return process.platform === 'win32' ? real.toLowerCase() : real;
}
// parent может оканчиваться разделителем (корень диска V:\) – тогда второй разделитель не добавляем
const inside = (child, parent) => { const p = parent.endsWith(sep) ? parent : parent + sep; return child === parent || child + sep === p || child.startsWith(p); };
const R = canonical(root), O = canonical(out), DIST = canonical(join(root, 'dist'));
if (dirname(O) === O) throw new Error(`Папка результата – корень диска: ${out}`);
if (inside(R, O)) throw new Error(`Папка результата не может содержать проект: ${out}`);
if (inside(O, R) && !inside(O, DIST)) throw new Error(`Внутри проекта результат кладётся только в dist/: ${out}`);
for (const src of [join(root, 'public'), join(root, 'src')]) {
  if (inside(O, canonical(src)) || inside(canonical(src), O)) throw new Error(`Папка результата пересекается с исходниками: ${out}`);
}
// путь не должен проходить через ссылку – и для существующей, и для будущей папки
if (canonical(out) !== (process.platform === 'win32' ? resolve(out).toLowerCase() : resolve(out))) {
  throw new Error(`Путь к папке результата проходит через ссылку (junction/symlink): ${out}`);
}
// внутри папки результата не должно быть ни одной ссылки – проверяем всё дерево до любых удалений
function assertNoLinks(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n), st = lstatSync(p);
    if (st.isSymbolicLink()) throw new Error(`В папке результата ссылка: ${p}`);
    if (st.isDirectory()) assertNoLinks(p);
  }
}
if (existsSync(out)) {
  if (lstatSync(out).isSymbolicLink()) throw new Error(`Папка результата – ссылка: ${out}`);
  assertNoLinks(out);
}

// непустая папка вне dist/ – только если это прошлая сборка лаборатории (защита чужих сайтов от rmSync)
if (!inside(O, DIST) && existsSync(out) && readdirSync(out).some(n => !['.htaccess', 'robots.txt', 'sitemap.xml'].includes(n))
    && !existsSync(join(out, 'js', 'app.js'))) {
  throw new Error(`Папка не пустая и не похожа на прошлую сборку лаборатории (нет js/app.js): ${out}`);
}

if (checkOnly) { console.log(`Путь допустим: ${out}`); process.exit(0); }

// заменяем только файлы приложения; служебные файлы хостинга (.htaccess, robots.txt, sitemap.xml) остаются
for (const name of ['index.html', 'styles.css', 'cnn.css', 'cnn-lab.css', 'favicon.svg', 'js', 'samples', 'shared']) {
  rmSync(join(out, name), { recursive: true, force: true });  // ссылки исключены проверкой выше
}
mkdirSync(out, { recursive: true });
cpSync(join(root, 'public'), out, { recursive: true });
cpSync(join(root, 'src', 'shared'), join(out, 'shared'), { recursive: true });

let files = 0;
const walk = (dir) => { for (const n of readdirSync(dir)) { const p = join(dir, n); statSync(p).isDirectory() ? walk(p) : files++; } };
walk(out);
for (const required of ['index.html', 'js/app.js', 'shared/neural-network.js', 'samples/manifest.json']) {
  if (!existsSync(join(out, required))) throw new Error(`Нет ${required} в ${out}`);
}
console.log(`Статическая версия: ${out} (${files} файлов)`);
