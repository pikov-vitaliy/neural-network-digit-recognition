# -*- coding: utf-8 -*-
"""Страница инструкции для слушателя: docs/student-guide.md -> public/guide.html, public/guide.css, public/guide/*.png.

Запуск из корня проекта:  python scripts/build-guide.py          (нужен пакет markdown: pip install markdown)
                          python scripts/build-guide.py --check  (только проверить, что страница не устарела)
Источник один – docs/student-guide.md; guide.html и guide.css руками не править.

Страница: оглавление (на широком экране – колонка слева с подсветкой текущего раздела, на узком – блок
после вступления и кнопка «Содержание»), якоря у разделов и подразделов, переключатель темы ☾/☀ справа
сверху. Тема по умолчанию – по времени суток: с 20:00 до 07:00 тёмная, днём светлая; ручной выбор
действует до ближайшей смены дня и ночи. Внутренние ссылки в Markdown пишутся в виде якорей GitHub
(#первые-шаги-за-10-минут) – так они работают и в репозитории; здесь они переводятся в латинские якоря."""
import html
import os
import re
import shutil
import sys

import markdown

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'docs', 'student-guide.md')
OUT = os.path.join(ROOT, 'public', 'guide.html')
CSS = os.path.join(ROOT, 'public', 'guide.css')
IMG_DIR = os.path.join(ROOT, 'public', 'guide')
URL = 'https://neural-network-digit-recognition.pikov.expert/guide.html'
DESC = ('Как пользоваться лабораторией «Цифра. Слой за слоем»: что на экране, первые шаги, как устроены '
        'полносвязная и свёрточная сети, опыты для самопроверки, частые вопросы и словарик.')
E = html.escape
TR = dict(zip('абвгдеёжзийклмнопрстуфхцчшщъыьэюя',
              ['a', 'b', 'v', 'g', 'd', 'e', 'e', 'zh', 'z', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'r', 's', 't', 'u',
               'f', 'h', 'c', 'ch', 'sh', 'shch', '', 'y', '', 'e', 'yu', 'ya']))


def latin_id(text):
    """Латинский якорь: проверка ссылок портала не принимает кириллицу в якорях."""
    s = ''.join(TR.get(c, c) for c in text.lower())
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')[:60].rstrip('-') or 'r'


def github_id(text):
    """Якорь, который GitHub ставит заголовку в Markdown: строчные буквы, без знаков, пробелы – дефисы."""
    return re.sub(r'[^\w\- ]', '', text.lower()).replace(' ', '-')


CSS_TEXT = '''/* Собирается scripts/build-guide.py из docs/student-guide.md – руками не править. */
:root {
  --bg: #eef2f7; --panel: #ffffff; --panel-soft: #e8edf4; --ink: #152039; --muted: #5d6a80; --line: #cdd6e3;
  --accent: #3157c9; --accent-ink: #ffffff; --accent-soft: #dfe7ff; --code: #e8edf4; --shadow: 0 6px 24px rgb(32 50 79 / 10%);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0b1220; --panel: #121c2e; --panel-soft: #172338; --ink: #edf2ff; --muted: #a1aec3; --line: #2a3a55;
    --accent: #8fb0ff; --accent-ink: #0b1220; --accent-soft: #1d2b4a; --code: #172338; --shadow: 0 6px 24px rgb(0 0 0 / 35%);
  }
}
:root[data-theme="dark"] {
  --bg: #0b1220; --panel: #121c2e; --panel-soft: #172338; --ink: #edf2ff; --muted: #a1aec3; --line: #2a3a55;
  --accent: #8fb0ff; --accent-ink: #0b1220; --accent-soft: #1d2b4a; --code: #172338; --shadow: 0 6px 24px rgb(0 0 0 / 35%);
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
body { margin: 0; background: var(--bg); color: var(--ink); font: 17px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
a { color: var(--accent); }
a:focus-visible, button:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; border-radius: 6px; }
.skip { position: absolute; left: -9999px; }
.skip:focus { left: 16px; top: 16px; z-index: 30; padding: 8px 12px; background: var(--panel); }

.top { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; padding: 12px 72px 12px 16px;
  background: var(--panel); border-bottom: 1px solid var(--line); }
.top .course { color: var(--muted); font-size: 14px; margin-right: auto; }
.btn { display: inline-flex; align-items: center; padding: 7px 14px; border: 1px solid var(--line); border-radius: 999px;
  background: var(--panel-soft); color: var(--ink); font-weight: 600; font-size: 15px; text-decoration: none; }
.btn.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
.theme-toggle { position: fixed; top: 12px; right: 16px; z-index: 20; width: 42px; height: 42px; border-radius: 50%;
  border: 1px solid var(--line); background: var(--panel); color: var(--ink); font-size: 19px; cursor: pointer; box-shadow: var(--shadow); }

.layout { max-width: 1240px; margin: 0 auto; padding: 0 16px; }
.hero { padding: 28px 0 8px; }
.hero h1 { font-size: clamp(26px, 5vw, 38px); line-height: 1.18; margin: 0 0 14px; }
.hero .lead { font-size: 18px; max-width: 72ch; }
.hero-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 18px 0 6px; }

.toc { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; font-size: 15px; }
.toc-title { font-weight: 700; margin: 0 0 6px; }
.toc ol { list-style: none; margin: 0; padding: 0; }
.toc > ol > li { margin: 6px 0; }
.toc > ol > li > a { font-weight: 600; }
.toc ol ol { padding-left: 14px; margin: 2px 0 6px; border-left: 2px solid var(--line); }
.toc ol ol li { margin: 2px 0 2px 8px; font-size: 14px; }
.toc a { text-decoration: none; color: var(--ink); }
.toc a:hover { color: var(--accent); text-decoration: underline; }
.toc a.active { color: var(--accent); }
.toc .num { color: var(--muted); font-variant-numeric: tabular-nums; margin-right: 4px; }

main { min-width: 0; }
.content { max-width: 820px; }
section.part { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; padding: 4px 22px 18px; margin: 18px 0; box-shadow: var(--shadow); }
h2 { font-size: 25px; line-height: 1.25; margin: 18px 0 10px; }
h2 .num { display: inline-block; min-width: 1.6em; color: var(--accent); }
h3 { font-size: 19px; margin: 22px 0 6px; }
h2[id], h3[id] { scroll-margin-top: 16px; }
p, li { max-width: 72ch; }
ol, ul { padding-left: 1.3em; }
li { margin: 6px 0; }
code { padding: 1px 5px; border-radius: 5px; background: var(--code); font: 0.92em ui-monospace, Consolas, monospace; }
.table-wrap { overflow-x: auto; margin: 12px 0; border: 1px solid var(--line); border-radius: 10px; }
table { width: 100%; border-collapse: collapse; font-size: 15px; }
th, td { padding: 8px 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
tr:last-child td { border-bottom: 0; }
th { background: var(--accent-soft); }
figure { margin: 16px 0; }
figure img { display: block; width: 100%; height: auto; border: 1px solid var(--line); border-radius: 12px; }
figcaption { margin-top: 6px; color: var(--muted); font-size: 14px; }
.up { margin: 14px 0 0; font-size: 14px; }
.up a { text-decoration: none; }
.to-toc { position: fixed; right: 16px; bottom: 16px; z-index: 20; padding: 9px 14px; border-radius: 999px; background: var(--panel);
  color: var(--accent); border: 1px solid var(--line); box-shadow: var(--shadow); font-weight: 600; font-size: 15px; text-decoration: none; }
footer { max-width: 1240px; margin: 24px auto 0; padding: 0 16px 36px; color: var(--muted); font-size: 14px; }

@media (min-width: 1100px) {
  .grid { display: grid; grid-template-columns: 290px minmax(0, 1fr); gap: 32px; align-items: start; }
  .toc { position: sticky; top: 16px; max-height: calc(100vh - 32px); overflow-y: auto; margin-top: 18px; }
  .to-toc { display: none; }
}
@media (max-width: 1099px) { .toc { margin: 14px 0; } }
@media (max-width: 600px) {
  body { font-size: 16px; }
  section.part { padding: 2px 14px 14px; border-radius: 12px; }
  h2 { font-size: 22px; }
}
@media print {
  .theme-toggle, .to-toc, .toc, .top nav { display: none !important; }
  section.part { box-shadow: none; break-inside: auto; }
  h2, h3 { break-after: avoid; }
}
'''

HEAD = '''<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="{desc}">
  <meta name="author" content="Виталий Александрович Пиков">
  <meta property="og:type" content="article">
  <meta property="og:locale" content="ru_RU">
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{desc}">
  <meta property="og:url" content="{url}">
  <meta property="og:image" content="https://neural-network-digit-recognition.pikov.expert/og-image.jpg">
  <link rel="canonical" href="{url}">
  <title>{title} | Искусственный интеллект для инженеров</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <script type="application/ld+json">{{"@context": "https://schema.org", "@type": "LearningResource", "name": "{title}", "inLanguage": "ru", "url": "{url}", "description": "{desc}", "learningResourceType": "Инструкция", "isAccessibleForFree": true, "author": {{"@type": "Person", "name": "Виталий Александрович Пиков", "url": "https://pikov.expert/"}}}}</script>
  <script>
    // тема до отрисовки: с 20:00 до 07:00 тёмная, днём светлая; ручной выбор – до ближайшей смены дня и ночи
    (function () {{
      var h = new Date().getHours(), theme = (h >= 20 || h < 7) ? 'dark' : 'light';
      try {{
        var s = JSON.parse(localStorage.getItem('digit-lab-guide-theme') || 'null');
        if (s && s.until > Date.now() && (s.theme === 'dark' || s.theme === 'light')) theme = s.theme;
      }} catch (e) {{}}
      document.documentElement.setAttribute('data-theme', theme);
    }})();
  </script>
  <script>
    // счётчик посещений портала pikov.expert – только в онлайн-версии; в npx и npm start не загружается
    if (location.hostname === 'neural-network-digit-recognition.pikov.expert') {{
      (function(m,e,t,r,i,k,a){{m[i]=m[i]||function(){{(m[i].a=m[i].a||[]).push(arguments)}};m[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){{if(document.scripts[j].src===r){{return}}}}k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)}})(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');
      ym(109116119, 'init', {{clickmap:false, trackLinks:true, accurateTrackBounce:true, webvisor:false}});
    }}
  </script>
  <link rel="stylesheet" href="/guide.css">
</head>
<body>
  <a class="skip" href="#main">К тексту инструкции</a>
  <button class="theme-toggle" id="theme-toggle" type="button" aria-label="Переключить тему">☾</button>
  <header class="top">
    <span class="course">Искусственный интеллект для инженеров · лаборатория «Цифра. Слой за слоем»</span>
    <nav aria-label="Ссылки"><a class="btn primary" href="/">К лаборатории</a> <a class="btn brand-back" href="https://pikov.expert/">pikov.expert</a></nav>
  </header>
'''

SCRIPT = '''  <script>
    (function () {
      var root = document.documentElement, btn = document.getElementById('theme-toggle');
      function paint() {
        var dark = root.getAttribute('data-theme') === 'dark';
        btn.textContent = dark ? '☀' : '☾';
        btn.setAttribute('aria-label', dark ? 'Включить светлую тему' : 'Включить тёмную тему');
      }
      paint();
      btn.addEventListener('click', function () {
        var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', next);
        try {
          var now = new Date(), until = new Date(now), h = now.getHours();
          if (h >= 20) { until.setDate(until.getDate() + 1); until.setHours(7, 0, 0, 0); }
          else if (h < 7) until.setHours(7, 0, 0, 0);
          else until.setHours(20, 0, 0, 0);
          localStorage.setItem('digit-lab-guide-theme', JSON.stringify({ theme: next, until: until.getTime() }));
        } catch (e) {}
        paint();
      });
      // подсветка текущего раздела в оглавлении
      var links = {}, heads = [];
      document.querySelectorAll('.toc a[href^="#"]').forEach(function (a) { links[a.getAttribute('href').slice(1)] = a; });
      document.querySelectorAll('main h2[id], main h3[id]').forEach(function (h) { if (links[h.id]) heads.push(h); });
      function spy() {
        var cur = null;
        for (var i = 0; i < heads.length; i++) { if (heads[i].getBoundingClientRect().top < 120) cur = heads[i]; else break; }
        Object.keys(links).forEach(function (k) { links[k].classList.toggle('active', !!cur && k === cur.id); });
      }
      window.addEventListener('scroll', spy, { passive: true });
      spy();
    })();
  </script>
'''


def build():
    text = open(SRC, encoding='utf-8').read().replace('\r\n', '\n')
    h1, body = text.split('\n', 1)
    title = h1.lstrip('# ').strip()
    out = markdown.markdown(body, extensions=['tables', 'sane_lists'], output_format='html')

    # якоря у h2/h3: латиница; карта «якорь GitHub -> латинский» для внутренних ссылок
    gh2id, seen, toc = {}, set(), []

    def head(m):
        lvl, inner = int(m.group(1)), m.group(2)
        plain = html.unescape(re.sub(r'<[^>]+>', '', inner)).strip()
        hid, k = latin_id(plain), 2
        while hid in seen:
            hid, k = f'{latin_id(plain)}-{k}', k + 1
        seen.add(hid)
        gh2id[github_id(plain)] = hid
        toc.append((lvl, hid, plain))
        return f'<h{lvl} id="{hid}">{inner}</h{lvl}>'
    out = re.sub(r'<h([23])>(.*?)</h\1>', head, out)

    def inner_link(m):
        key = html.unescape(m.group(1))
        if key not in gh2id:
            raise SystemExit(f'build-guide: ссылка на несуществующий раздел #{key}')
        return f'href="#{gh2id[key]}"'
    out = re.sub(r'href="#([^"]+)"', inner_link, out)

    # разделы h2 – отдельными карточками с номером и ссылкой «к содержанию»
    parts = re.split(r'(?=<h2 id=)', out)
    intro, sections = parts[0], parts[1:]
    numbered = []
    for i, sec in enumerate(sections, 1):
        sec = re.sub(r'<h2 id="([^"]+)">', lambda m: f'<h2 id="{m.group(1)}"><span class="num">{i}.</span>', sec, count=1)
        numbered.append(f'<section class="part">\n{sec}<p class="up"><a href="#toc">↑ К содержанию</a></p>\n</section>\n')

    # оглавление
    lis, open_sub, n = [], False, 0
    for lvl, hid, plain in toc:
        if lvl == 2:
            n += 1
            lis.append('</ol></li>' if open_sub else ('</li>' if lis else ''))
            open_sub = False
            lis.append(f'<li><a href="#{hid}"><span class="num">{n}.</span>{E(plain)}</a>')
        else:
            if not open_sub:
                lis.append('<ol>')
                open_sub = True
            lis.append(f'<li><a href="#{hid}">{E(plain)}</a></li>')
    lis.append('</ol></li>' if open_sub else '</li>')
    toc_html = ('<nav class="toc" id="toc" aria-label="Содержание"><p class="toc-title">Содержание</p><ol>'
                + ''.join(lis) + '</ol></nav>')

    # скриншоты из docs/screenshots -> public/guide/
    body_html = ''.join(numbered)
    imgs = re.findall(r'<img alt="[^"]*" src="screenshots/([^"]+)"', body_html)
    body_html = re.sub(r'<p><img alt="([^"]*)" src="screenshots/([^"]+)" ?/?></p>',
                       r'<figure><img alt="\1" src="guide/\2" loading="lazy"><figcaption>\1</figcaption></figure>', body_html)
    intro = re.sub(r'^<p>', '<p class="lead">', intro.strip(), count=1)
    html_all = intro + '\n<!--split-->\n' + body_html
    html_all = re.sub(r'<a href="(https?://[^"]+)">', r'<a href="\1" target="_blank" rel="noopener">', html_all)
    html_all = html_all.replace('<a href="https://neural-network-digit-recognition.pikov.expert/" target="_blank" rel="noopener">',
                                '<a href="/">')  # ссылка на саму лабораторию – в той же вкладке
    intro_html, body_html = html_all.split('\n<!--split-->\n', 1)

    page = (HEAD.format(title=E(title), desc=E(DESC), url=URL)
            + '  <div class="layout">\n'
            + f'    <div class="hero"><h1>{E(title)}</h1>\n{intro_html}\n'
            + '    <div class="hero-actions"><a class="btn primary" href="/">Открыть лабораторию</a>'
            + f' <a class="btn" href="#{gh2id["первые-шаги-за-10-минут"]}">Первые шаги</a>'
            + f' <a class="btn" href="#{gh2id["опыты-для-самопроверки"]}">Опыты</a>'
            + f' <a class="btn" href="#{gh2id["словарик"]}">Словарик</a></div></div>\n'
            + f'    <div class="grid">\n{toc_html}\n    <main id="main"><div class="content">\n{body_html}    </div></main>\n    </div>\n  </div>\n'
            + '  <a class="to-toc" href="#toc">☰ Содержание</a>\n'
            + '  <footer>Инструкция к учебной лаборатории курса «Искусственный интеллект для инженеров». Автор – Виталий Александрович Пиков. '
            + 'Исходники и руководство преподавателя – <a href="https://github.com/pikov-vitaliy/neural-network-digit-recognition" target="_blank" rel="noopener">GitHub</a>.</footer>\n'
            + SCRIPT + '</body>\n</html>\n')
    page = '\n'.join(l.rstrip() for l in page.split('\n'))
    # все внутренние ссылки ведут на существующие id, в якорях нет кириллицы
    ids = set(re.findall(r'\sid="([^"]+)"', page))
    bad = [h for h in re.findall(r'href="#([^"]+)"', page) if h not in ids]
    if bad:
        raise SystemExit(f'build-guide: нет якорей {bad}')
    if re.search(r'id="[^"]*[а-яё]', page):
        raise SystemExit('build-guide: кириллица в якоре')
    return page, imgs


def main():
    sys.stdout.reconfigure(encoding='utf-8')  # консоль Windows по умолчанию не печатает кириллицу
    page, imgs = build()
    read = lambda p: open(p, encoding='utf-8').read() if os.path.exists(p) else ''
    if '--check' in sys.argv:
        ok = read(OUT) == page and read(CSS) == CSS_TEXT and all(os.path.exists(os.path.join(IMG_DIR, i)) for i in imgs)
        print('guide.html актуальна' if ok else 'guide.html устарела: python scripts/build-guide.py')
        sys.exit(0 if ok else 1)
    os.makedirs(IMG_DIR, exist_ok=True)
    for i in imgs:
        shutil.copy2(os.path.join(ROOT, 'docs', 'screenshots', i), os.path.join(IMG_DIR, i))
    open(OUT, 'w', encoding='utf-8', newline='\n').write(page)
    open(CSS, 'w', encoding='utf-8', newline='\n').write(CSS_TEXT)
    print(f'ok: {OUT}, скриншотов {len(imgs)}')


if __name__ == '__main__':
    main()
