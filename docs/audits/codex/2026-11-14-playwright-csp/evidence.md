# Доказательства проверки Playwright/CSP

Дата: 14 ноября 2026 года. Время ниже указано в CET (UTC+01:00). Проверялись журнал выполнения и текущий проверочный скрипт; независимый запуск приложения не выполнялся.

## Журнал разработчика

Источник: сессия session_f7c811c0-6e95-4628-a5a6-8d8120e4d9ec, agents/main/wire.jsonl.

| Место в журнале | Время | Наблюдение |
| --- | --- | --- |
| Строка 193, tool.result | 20:27:45.474 | Page.wait_for_function завершился EvalError: строковое вычисление нарушает CSP, unsafe-eval отсутствует в script-src. |
| Строка 235, tool.call Edit; строка 236, подтверждение | 20:28:15.463 | Ожидание JS-выражения заменено на повторяемую проверку текста локатора. |
| Строка 243, tool.result | 20:28:25.601 | Повторный запуск browser-baseline.py вывел PASS. |

Исходное ожидание:

```python
page.wait_for_function("document.getElementById('sample-name').textContent === 'digit-7-08.png'")
```

Замена:

```python
expect(page.locator("#sample-name")).to_have_text("digit-7-08.png")
```

Вывод повторного прогона:

```text
PASS: 100 samples, 10 outputs, filters, drawing, clear, upload, dialog, theme, mobile overflow, reduced motion, console
```

Это наблюдение результата из журнала разработчика. Оно не подтверждает прохождение всех последующих проверок или готовность приложения. Разработка продолжалась после этого прогона.

## Текущие файлы

- [browser-baseline.py](../../../../.superpowers/sdd/2026-11-14-digit-lab/browser-baseline.py): строка 3 импортирует expect; строка 43 содержит to_have_text для digit-7-08.png.
- [src/server.js](../../../../src/server.js): строка 25 устанавливает Content-Security-Policy, включая script-src 'self' 'unsafe-inline', без unsafe-eval.

Номера строк относятся к состоянию во время проверки; при дальнейшей разработке они могут измениться.

## Первичные технические источники

- [Playwright: to_have_text](https://playwright.dev/python/docs/api/class-locatorassertions#locator-assertions-to-have-text): проверка повторяется до совпадения или тайм-аута.
- [Playwright: реализация ожидания](https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/frames.ts#L1477-L1503): текущая ветка main содержит globalThis.eval(expression); это поясняет механизм, но не устанавливает точную локальную версию библиотеки.
- [W3C CSP: строковая компиляция](https://www.w3.org/TR/CSP3/#can-compile-strings): браузер применяет ограничения политики к строковому вычислению JavaScript.

[Предыдущий отдельный эпизод HTTP 400 Kimi](../2026-11-14-development-interruption/README.md).
