import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createStaticServer, listenWithFallback } from './server.js';

export function parseCliArgs(argv) {
  const options = { port: 4173, noOpen: false, help: false, version: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--') continue;
    if (argument === '--no-open') options.noOpen = true;
    else if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--version' || argument === '-v') options.version = true;
    else if (argument === '--port' || argument.startsWith('--port=')) {
      const value = argument === '--port' ? argv[++index] : argument.slice('--port='.length);
      if (!/^\d+$/.test(value || '')) throw new TypeError('Port must be an integer from 0 to 65535');
      options.port = Number(value);
      if (options.port > 65535) throw new RangeError('Port must be from 0 to 65535');
    } else throw new TypeError(`Unknown option: ${argument}`);
  }
  return options;
}

export function openBrowser(url) {
  const [command, args] = process.platform === 'win32'
    ? ['cmd.exe', ['/c', 'start', '', url]]
    : process.platform === 'darwin'
      ? ['open', [url]]
      : ['xdg-open', [url]];
  const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  let reported = false;
  const reportFailure = () => {
    if (reported) return;
    reported = true;
    console.log(`Не удалось открыть браузер. Откройте адрес вручную: ${url}`);
  };
  child.on('error', reportFailure);
  child.on('exit', (code) => { if (code !== 0) reportFailure(); });
  child.unref();
}

export async function runCli(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  if (options.help) {
    console.log('Искусственный интеллект для инженеров — лаборатория нейросети\n');
    console.log('npx -y neural-network-digit-recognition [-- --port 4173] [--no-open]');
    console.log('\n--port N   начальный порт (0 — свободный порт автоматически)');
    console.log('--no-open  не открывать браузер автоматически');
    return null;
  }
  if (options.version) {
    const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    console.log(packageJson.version);
    return null;
  }
  const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
  const sharedDir = fileURLToPath(new URL('./shared/', import.meta.url));
  const server = createStaticServer({ publicDir, sharedDir });
  const port = await listenWithFallback(server, options.port);
  const url = `http://127.0.0.1:${port}`;
  console.log('\nЦифра. Слой за слоем — приложение запущено.');
  console.log(url);
  console.log('Нажмите Ctrl+C, чтобы остановить сервер.\n');
  if (!options.noOpen && !process.env.CI) openBrowser(url);
  return { server, url };
}
