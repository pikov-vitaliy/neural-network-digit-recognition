# Воспроизведение проверок

Основной набор: npm test. Проверены Node.js 20.20.2 и 24.16.0. Вычислительные тесты используют только Node.js; отдельный браузер для них не требуется.

Для ручного показа: npm start. Остановка: Ctrl+C. Для браузерных сценариев дополнительно нужны Python 3 и Playwright: python -m pip install playwright, затем python -m playwright install chromium. Эти инструменты не входят в runtime-зависимости приложения.

В отдельном терминале запустите сервер на 4173. Проверка состояния двух примеров:

~~~powershell
python scripts/verify-cnn-state.py docs/audits/codex/повтор-cnn
~~~

При другом порту задайте переменную DIGIT_LAB_URL. Фикстуры fixtures/cnn-trained.json и fixtures/mlp-legacy.json нужны для импорта и проверки обратной совместимости. Скрипт не использует постоянный профиль браузера. Часть гонок (двойное подтверждение и смена входа при открытом модальном окне) специально вызывается синтетическими DOM-действиями; переключение режима во время batch проверяется обычными кликами. Это указано в JSON.

Проверка MLP:

~~~powershell
python scripts/verify-audit-fixes.py --stage state
~~~

Для stage demo/all нужна Node-библиотека Playwright и полноценный Chromium. scripts/verify-visibility.cjs принимает PLAYWRIGHT_MODULE и CHROMIUM_PATH; Python-сценарий передаёт ему URL. Настоящие вкладки используются без подмены document.hidden. DIGIT_LAB_VERIFY_OUT задаёт новый каталог результатов. Старые доказательства не следует перезаписывать.

[Комбинированная MLP-регрессия](evidence/mlp-state/combined-regression.json): 10 групп PASS. [CNN](evidence/cnn-state/browser-results-final.json): 18 сценариев PASS, ошибок страницы нет. Числа в отчётах относятся к зафиксированным хешам исходников и не заменяют проверку будущих изменений.
