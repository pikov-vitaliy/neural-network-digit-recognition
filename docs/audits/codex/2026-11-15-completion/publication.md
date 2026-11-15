# Публичный выпуск 1.0.0

15 ноября 2026 года. GitHub и npm опубликованы; обе публичные команды запуска проверены. Выпуск относится к коммиту 1f35a9651c02c5f6e12343b9c2036b2a697e7791 и аннотированному тегу v1.0.0. Последующие коммиты документации сохраняют доказательства уже выполненной публикации.

## Адреса и запуск

- [Публичный репозиторий](https://github.com/pikov-vitaliy/neural-network-digit-recognition), владелец pikov-vitaliy, основная ветка main.
- [Релиз v1.0.0](https://github.com/pikov-vitaliy/neural-network-digit-recognition/releases/tag/v1.0.0) с архивом npm и SHA256SUMS.txt.
- [Пакет npm](https://www.npmjs.com/package/neural-network-digit-recognition), версия и latest 1.0.0, единственный maintainer pikov-vitaliy.

~~~powershell
npx -y neural-network-digit-recognition@1.0.0
~~~

Альтернатива из GitHub, дополнительно нужен Git:

~~~powershell
npx -y github:pikov-vitaliy/neural-network-digit-recognition#v1.0.0
~~~

Нужен Node.js 20 или новее. Браузер открывается автоматически. Сервер слушает 127.0.0.1; остановка через Ctrl+C в том же терминале.

## Фактические проверки

| Проверка | Результат | Доказательство |
|---|---|---|
| Публичность GitHub | Public, main, правильный владелец | [GitHub connector](evidence/publication/github-plugin-repo.json) |
| Тег и release | v1.0.0 указывает на release-коммит; архив скачан обратно и совпал по SHA256 | [Релиз](https://github.com/pikov-vitaliy/neural-network-digit-recognition/releases/tag/v1.0.0) |
| CI релиза | 4/4 задания success: Node.js 20/24 на Windows/Ubuntu, тесты и упаковка | [GitHub Actions](https://github.com/pikov-vitaliy/neural-network-digit-recognition/actions/runs/43656257757), [независимый запрос jobs](evidence/publication/github-jobs-plugin.json) |
| npm registry | 1.0.0, latest 1.0.0, maintainer и repository совпадают | [Метаданные и скачанный архив](evidence/publication/registry-verification.json), [независимый повтор](evidence/publication/registry-independent.json) |
| Registry npx | Пустая папка и новый cache, Node.js 20.20.2; HTTP 200, все 130 файлов совпадают | [Проверка npm](evidence/publication/registry-npx.json) |
| GitHub npx | Пустая папка и другой новый cache, Node.js 20.20.2; все 130 файлов совпадают | [Проверка тега](evidence/publication/github-npx.json) |
| Данные и CNN | Все 100 PNG 16×16, manifest из 100 записей и пять файлов CNN доступны с правильными хешами | Те же проверки npx |
| Автооткрытие | Публичный registry npx без --no-open открыл штатный Brave; адрес и документ видимы по UI Automation | [Открытие](evidence/publication/registry-autoopen-uia.json) |
| Ctrl+C | Реальный CTRL_C_EVENT остановил собственный сервер; HTTP перестал отвечать, принудительная остановка не применялась | [Остановка](evidence/publication/registry-autoopen-ctrlc-result.json) |

Архив имеет размер 614 023 байта и SHA256:

~~~text
2968c40b4169a4e58a0789d5e5857d5a32f53658c2cbc3b63dd0ed5b3068b4d2
~~~

Registry integrity также совпала с проверенным кандидатом: sha512-gBxqAI59ETGFWq9d3/mZ1/5l19550vWLCQwbwdS+OMcshvSQeFIsN4k6dx4ZLgu3KMsNsbaNgiP7CNOEgiGqBg==. Пакет содержит 130 файлов, включая два примера, все данные и снимки README. Исходники, тесты и аудиты доступны в GitHub; в npm включены файлы для запуска и две иллюстрации.

До публикации exact-кандидат прошёл 62/62 теста на каждой версии Node.js: [20](evidence/packaging/final-tests-node20.json), [24](evidence/packaging/final-tests-node24.json), а файлы архива совпали с рабочим деревом: [сверка](evidence/packaging/final-candidate-seal.json).

Публикация потребовала двухфакторного подтверждения владельца в npm. Сначала реестр сообщил об обработке принятого пакета; успех подтверждён после появления метаданных, скачивания архива и чистого запуска. Авторизационные ссылки, пароли, токены и коды подтверждения в доказательства не включены.

Проверки не распространяются на оборудование аудитории и понимание материала реальными студентами. Ограничения синтетического набора и validation сохранены в [основном отчёте](README.md).
