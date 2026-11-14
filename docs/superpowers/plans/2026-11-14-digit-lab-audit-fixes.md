# Digit Lab Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Устранить AUD-01…AUD-13 и реализовать R-01…R-06 с проверяемым локальным выпуском лаборатории 16×16.

**Architecture:** Общая численная модель возвращает logits и готовит необратимо не применённый шаг SGD. Состояние приложения связывает опубликованный ответ с версией входа/модели; Canvas и диалоги лишь отображают это состояние. Выпуск сохраняет историю аудитов, содержит реальные browser/HTTP-доказательства и не выдумывает владельца публикации.

**Tech Stack:** Node.js ≥20, ES modules, node:test, Canvas 2D, native HTML dialog, существующий Python Playwright для внешних browser-прогонов; без новых runtime-зависимостей.

**Spec:** `docs/superpowers/specs/2026-11-14-digit-lab-audit-fixes-design.md`; исходные требования `docs/audits/codex/2026-11-14-full-audit/requirements.md` и `acceptance-checklist.md`.

## Global Constraints

- Сохранить 16×16, 256→16→12→10, 100 PNG, 80/20 train/validation, порядок `1…9,0` и светлую/тёмную темы Canvas.
- Не использовать ReadMediaFile для отдельных PNG 16×16; только скриншоты приложения.
- Не переписывать существующие аудиты. Новые доказательства — в `docs/verification/2026-11-14/`.
- Скорость и пауза не меняют вычисления; validation не участвует в обучении; распознавание не меняет модель.
- Локальные commit разрешены заданием. GitHub/npm публиковать только при подтверждённом владельце и доступе, иначе явно оставить незавершёнными.
- Не объявлять независимую приёмку, проектор, студентов, Node 20 или другие ОС проверенными без среды.

## Review Focus

- Асинхронная загрузка старого файла после нового выбора: не перезаписывать новый вход — browser-тест Task 3.
- Нулевые вклады и вырожденные параметры: интерфейс показывает нули/отказ, не NaN — численные тесты Task 1.
- Смена режима/входа во время диалога или цикла: отменять старое действие и останавливать цикл — browser-тесты Tasks 3–4.
- Скрытая вкладка/reduced-motion: нет постоянного RAF, статический путь читаем — browser-тест Task 4.
- Чужой npm/GitHub и случайные секреты/кэши: проверять владельца и состав до публикации — Task 6.

---

### Task 1: Достоверная математика и отображение классов

**Files:** Modify `src/shared/neural-network.js`; create `src/shared/classes.js`, `test/classes.test.js`; modify `test/neural-network.test.js`.
**Interfaces:** `DISPLAY_DIGITS`, `digitForClass(index)`, `classForRow(row)`; `forward()` дополнительно возвращает `{logits, sums}`; `crossEntropyFromLogits(logits,label)`; `prepareTrainingStep(input,label,rate,selection)` и `applyTrainingStep(plan)`; `weightChange(plan,layer,target,source)`.

- [ ] Инициализировать Git и зафиксировать исходное дерево с аудитами, документацией и `.gitignore`, исключив кэши/секреты. Проверить `git status`, `git ls-files`.
- [ ] Написать failing-тесты: все class ID ↔ `1…9,0`; edge loss `[50,-50]`, label 1 ≈100; большие конечные параметры не дают NaN; подготовленный шаг не меняет сеть, выбранный `w_new=w_old−η·gradient`, применение ровно +1 steps; обычные градиенты и round-trip остаются верными.
- [ ] Запустить `node --test test/classes.test.js test/neural-network.test.js`, зафиксировать RED на старом коде.
- [ ] Реализовать double-precision accumulation/log-sum-exp, проверки конечности logits/вероятностей/плана и единый backpropagation для одиночного/пакетного обучения. Не ограничивать loss через `max(p,1e-12)`.
- [ ] Повторить тесты и `npm test`: PASS. Обновить затронутые численные комментарии/документацию. Commit `fix: stabilize network calculations and class mapping`.

### Task 2: Общий вход и безопасные операции сервера/состояния

**Files:** Modify `src/shared/image.js`, `public/js/input-controller.js`, `src/server.js`, `test/image.test.js`, `test/server.test.js`; create `public/js/lab-state.js`, `test/lab-state.test.js`.
**Interfaces:** `prepareGalleryPixels(bytes)` и общий `normalizePixels`; `canTrainSample(sample)`, `createPrediction(network,pixels,inputVersion,modelVersion)`, `isCurrentPrediction(value,inputVersion,modelVersion)`; InputController отменяет устаревшее декодирование и выдаёт русские ошибки.

- [ ] Тесты: нормализация исходных grayscale байтов 16×16 эквивалентна общему пути; пустой вход распознаётся; validation отклоняется; prediction с другой версией недействителен; девять занятых портов → успех, десять → один понятный отказ без listener leak.
- [ ] Запустить отдельные тесты и убедиться в RED по недостающим контрактам/AUD-12.
- [ ] Реализовать общий контракт без изменения PNG и dataset labels; InputController делает token на каждый новый вход, переводит decode/file failures. В `listenWithFallback` именованные `error`/`listening` снимаются на каждом исходе.
- [ ] `npm test` PASS. Commit `fix: unify input and isolate model state`.

### Task 3: Атомарный ответ и обучение по обратной связи

**Files:** Modify `public/js/app.js`, `public/index.html`, `public/styles.css`; create `public/js/model-store.js` для parse/валидации/метрик восстановления; browser test `scripts/verify-audit-fixes.py`.
**Interfaces:** UI имеет `#feedback-correct`, `#feedback-dialog`, `#confirm-feedback`, `#cancel-feedback`, `#training-feedback`; parse/forward/import не меняют сеть и localStorage до успеха.

- [ ] Browser RED: десять доминирующих классов согласованы на Canvas/в таблице/инспекторе; старый ответ снят после рисунка/примера/file/model; 100 PNG gallery/upload совпадают по 256 входам и 10 вероятностям; validation и recognition не меняют hash/steps; reload/импорт пересчитывают метрики; overflow JSON не заменяет модель.
- [ ] Реализовать `inputVersion`/`modelVersion`, централизованные `invalidateResult`, `publishPrediction`, `replaceModel`, `cancelTraining`, блокировку всех training paths в recognition. Сохранять последнюю историю отдельно от модели; после reload/импорта явно обозначать новый цикл.
- [ ] Для рисунка потребовать сначала распознать; кнопка «Верно, обучить на цифре N» использует prediction. Выход Canvas в training выбирает label и открывает dialog, отдельная кнопка инспекции не выбирает label. В recognition клик только инспектирует. Список и кнопки выходов синхронизированы.
- [ ] Pending request хранит копию pixels, label и версии; cancel/change/reset отзывают; guard исключает double-click. После шага рисунок остаётся, результат пересчитан, показаны label, loss, вероятность target до/после и выбранный вес.
- [ ] Browser PASS по Task 3 и `npm test` PASS. Commit `feat: add confirmed feedback training`.

### Task 4: Продолжающаяся анимация и режим преподавателя

**Files:** Modify `public/js/network-view.js`, `public/js/app.js`, `public/index.html`, `public/styles.css`; create `public/js/teacher-view.js`; extend `scripts/verify-audit-fixes.py` and `test/neural-network.test.js`.
**Interfaces:** `NetworkView.render(result,{animate})`, `setPaused(boolean)`, `setSpeed(number)`, `stopAnimation()`, `setFocusMode(boolean)`; один видимый loop; teacher использует `prepareTrainingStep` и показывает шесть стадий до apply.

- [ ] Browser RED: импульсы различаются через 0/1/30 секунд, модель/ответ неизменны; нет дублей RAF; пауза/продолжение/скорость работают; смена входа останавливает старую анимацию; hidden/reduced-motion не запускают цикл. Видны пояснения прямого прохода и участия всех связей.
- [ ] Реализовать повторяющиеся phase-based pulses/свечение из `w×a`, без Math.random и лимита 850мс. Хранить phase при паузе; cancel/resume по visibility; статическое выделение при reduced-motion.
- [ ] Failing browser checks для вход→z→a→loss→gradient→вес, точного `w_old`,η,gradient,Δw,w_new и остановки на каждой стадии; менять speed не меняет plan. Показать реальную историю loss/accuracy эпох и отдельный `train-all`.
- [ ] Реализовать доступный teacher dialog/панель, управляемый preview плана, явное применение одного шага и сохранение истории. Все числа связаны с текущим входом/выбранным нейроном.
- [ ] Полный browser test, включая 30-секундную пробу, PASS; `npm test` PASS. Commit `feat: add guided network demonstration`.

### Task 5: Читаемость, все веса и клавиатура

**Files:** Modify `public/index.html`, `public/styles.css`, `public/js/network-view.js`, `public/js/teacher-view.js`, `public/js/app.js`; extend `scripts/verify-audit-fixes.py`.

- [ ] Browser RED: 1280×720/1366×768 содержат основные действия и крупный выбранный нейрон без постоянной прокрутки; full graph открывается по запросу; численно доступны все 4408 весов (выбор каждого слоя/neuron/source); gallery имеет один Tab stop, arrows/Home/End охватывают все 100; dialogs Escape/фокус; светлая/тёмная темы и reduced-motion сохраняют контраст.
- [ ] Добавить компактную входную/выходную рабочую зону, крупный z/a/b, выбранный путь, zoom/focus controls и отдельную прокручиваемую таблицу всех входящих весов. Canvas labels/вероятности не остаются 6–8px. Сохранить 16×16 preview.
- [ ] Реализовать roving tabindex и документированный skip-link/короткий маршрут. Не менять математику ради layout.
- [ ] Проверить фактические viewport, keyboard, focus return, увеличение текста и обе темы; сохранить только screenshot приложения и JSON-измерения. `npm test` PASS. Commit `fix: make lesson controls and weights accessible`.

### Task 6: Выпуск и доказательства

**Files:** Modify `README.md`, `package.json`, `.gitignore`; create `CHANGELOG.md`, `docs/verification/2026-11-14/*`, required Markdown/HTML pair in `V:\tmp\kimi\2026-11-14\` via independent self-contained report.

- [ ] Обновить реальные метрики/ограничения, сценарии R-01…R-03, PowerShell, `--no-open`, запуск/остановку, импорт/экспорт/сброс, тесты, экранные снимки, аудит и versioned npx-команду. Не вписывать непроверенные ссылки/владельца.
- [ ] Проверить LICENSE/данные, отсутствие секретов, файлы Git и npm; версия 1.1.0 и changelog с AUD/R соответствием. Добавить repository/homepage/bugs только при фактическом GitHub URL.
- [ ] Проверить доступные учётные записи и владельца. Создать/push GitHub и опубликовать npm только при подтверждённых данных; иначе зафиксировать точный блокер, не объявлять публичную поставку.
- [ ] Собрать заново tarball, установить и запустить его реальным npx, проверить HTML/100 PNG, автооткрытие и завершение собственного сервера. Проверить Node 20 через доступный Docker/version manager; иначе оставить непринятым.
- [ ] Сформировать таблицу AUD-ID/R-ID → commit/файл → выполненная проверка → доказательство и отдельные ограничения. Markdown/HTML report проверить на self-contained themes/localStorage. Commit `docs: prepare verified course release` и tag при завершённой проверенной версии.
