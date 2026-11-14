# Проверка поставки 1.0.0

Состояние перед публикацией, 15 ноября 2026 года. Публичная публикация ещё не выполнялась.

Проверенный архив: neural-network-digit-recognition-1.0.0.tgz. SHA256: 2968c40b4169a4e58a0789d5e5857d5a32f53658c2cbc3b63dd0ed5b3068b4d2. В нём 130 файлов, оба примера, 100 PNG, manifest и два снимка README. Файлы архива совпадают с текущим деревом: sourceDrift пуст.

[Сверка архива](evidence/packaging/final-candidate-seal.json), [Node.js 20](evidence/packaging/final-tests-node20.json), [Node.js 24](evidence/packaging/final-tests-node24.json), [чистая установка и npx](evidence/packaging/final-npx-node20-clean.json). Оба набора дали 62/62 PASS.

Автоматическое открытие штатного Brave и реальный Ctrl+C проверены на предыдущем кандидате с тем же CLI: [UI Automation](evidence/packaging/autoopen-uia.json), [остановка](evidence/packaging/autoopen-ctrlc-result.json). Для опубликованной версии отдельно будут записаны URL, версия, владелец, integrity, commit/tag и результат установки из публичного источника.
