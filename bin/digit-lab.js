#!/usr/bin/env node
import { runCli } from '../src/cli.js';

try {
  const running = await runCli();
  if (running) {
    const stop = () => running.server.close(() => process.exit(0));
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  }
} catch (error) {
  console.error(`Не удалось запустить приложение: ${error.message}`);
  process.exitCode = 1;
}
