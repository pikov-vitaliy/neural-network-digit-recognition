import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const testDir = new URL('../test/', import.meta.url);
const files = readdirSync(testDir)
  .filter((name) => name.endsWith('.test.js'))
  .sort()
  .map((name) => fileURLToPath(new URL(name, testDir)));

if (!files.length) {
  console.error('В каталоге test не найдены файлы *.test.js.');
  process.exitCode = 1;
} else {
  const result = spawnSync(process.execPath, ['--test', ...files], {
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
}
