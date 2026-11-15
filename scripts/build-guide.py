# -*- coding: utf-8 -*-
"""Страница инструкции для слушателя: docs/student-guide.md -> public/guide.html (+ скриншоты в public/guide/).

Запуск из корня проекта:  python scripts/build-guide.py          (нужен пакет markdown: pip install markdown)
                          python scripts/build-guide.py --check  (только проверить, что страница не устарела)
Источник один – docs/student-guide.md; guide.html руками не править."""
import html
import os
import re
import shutil
import sys

import markdown

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'docs', 'student-guide.md')
OUT = os.path.join(ROOT, 'public', 'guide.html')
IMG_DIR = os.path.join(ROOT, 'public', 'guide')
URL = 'https://neural-network-digit-recognition.pikov.expert/guide.html'
E = html.escape

HEAD = '''<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
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
    // счётчик посещений портала pikov.expert – только в онлайн-версии; в npx и npm start не загружается
    if (location.hostname === 'neural-network-digit-recognition.pikov.expert') {{
      (function(m,e,t,r,i,k,a){{m[i]=m[i]||function(){{(m[i].a=m[i].a||[]).push(arguments)}};m[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){{if(document.scripts[j].src===r){{return}}}}k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)}})(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');
      ym(109116119, 'init', {{clickmap:false, trackLinks:true, accurateTrackBounce:true, webvisor:false}});
    }}
  </script>
  <style>
    :root {{ --bg: #eef2f7; --panel: #ffffff; --ink: #152039; --muted: #5d6a80; --line: #cdd6e3; --signal: #3157c9; --soft: #e8edf4; --code: #e8edf4; }}
    @media (prefers-color-scheme: dark) {{
      :root {{ --bg: #0b1220; --panel: #121c2e; --ink: #edf2ff; --muted: #a1aec3; --line: #2a3a55; --signal: #8fb0ff; --soft: #172338; --code: #172338; }}
    }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; background: var(--bg); color: var(--ink); font: 17px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }}
    a {{ color: var(--signal); }}
    a:focus-visible {{ outline: 2px solid currentColor; outline-offset: 3px; border-radius: 4px; }}
    .top {{ position: sticky; top: 0; z-index: 5; display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; justify-content: space-between; padding: 10px 16px; background: var(--panel); border-bottom: 1px solid var(--line); }}
    .top .course {{ color: var(--muted); font-size: 14px; }}
    .top nav {{ display: flex; flex-wrap: wrap; gap: 8px; }}
    .btn {{ display: inline-block; padding: 7px 14px; border: 1px solid var(--line); border-radius: 999px; background: var(--soft); color: var(--ink); font-weight: 600; font-size: 15px; text-decoration: none; }}
    .btn.primary {{ background: var(--signal); border-color: var(--signal); color: var(--panel); }}
    main {{ max-width: 860px; margin: 0 auto; padding: 24px 16px 48px; }}
    h1 {{ font-size: clamp(26px, 5vw, 36px); line-height: 1.2; margin: 8px 0 16px; }}
    h2 {{ margin: 40px 0 12px; font-size: 24px; line-height: 1.25; padding-top: 8px; border-top: 1px solid var(--line); }}
    p, li {{ max-width: 72ch; }}
    ol, ul {{ padding-left: 1.3em; }}
    li {{ margin: 6px 0; }}
    code {{ padding: 1px 5px; border-radius: 5px; background: var(--code); font: 0.92em ui-monospace, Consolas, monospace; }}
    .table-wrap {{ overflow-x: auto; margin: 12px 0; }}
    table {{ width: 100%; border-collapse: collapse; background: var(--panel); font-size: 15px; }}
    th, td {{ padding: 8px 10px; border: 1px solid var(--line); text-align: left; vertical-align: top; }}
    th {{ background: var(--soft); }}
    figure {{ margin: 16px 0; }}
    figure img {{ display: block; width: 100%; height: auto; border: 1px solid var(--line); border-radius: 12px; }}
    figcaption {{ margin-top: 6px; color: var(--muted); font-size: 14px; }}
    .lead {{ font-size: 18px; }}
    @media (max-width: 600px) {{ .top {{ position: static; }} }}
    footer {{ max-width: 860px; margin: 0 auto; padding: 0 16px 32px; color: var(--muted); font-size: 14px; }}
  </style>
</head>
<body>
  <header class="top">
    <span class="course">Искусственный интеллект для инженеров · лаборатория «Цифра. Слой за слоем»</span>
    <nav aria-label="Навигация"><a class="btn primary" href="/">Открыть лабораторию</a><a class="btn brand-back" href="https://pikov.expert/">pikov.expert</a></nav>
  </header>
  <main id="main">
'''

FOOT = '''  </main>
  <footer>Инструкция к учебной лаборатории курса «Искусственный интеллект для инженеров». Автор – Виталий Александрович Пиков. Исходники и описание для преподавателя – <a href="https://github.com/pikov-vitaliy/neural-network-digit-recognition" target="_blank" rel="noopener">GitHub</a>.</footer>
</body>
</html>
'''


def build():
    text = open(SRC, encoding='utf-8').read().replace('\r\n', '\n')
    h1, body = text.split('\n', 1)
    title = h1.lstrip('# ').strip()
    desc = 'Как пользоваться лабораторией «Цифра. Слой за слоем»: что на экране, первые шаги, как устроены полносвязная и свёрточная сети, опыты для самопроверки и словарик.'
    out = markdown.markdown(body, extensions=['tables', 'sane_lists'], output_format='html')
    out = out.replace('<table>', '<div class="table-wrap"><table>').replace('</table>', '</table></div>')
    # скриншоты из docs/screenshots -> public/guide/
    imgs = re.findall(r'<img alt="[^"]*" src="screenshots/([^"]+)"', out)
    out = re.sub(r'<p><img alt="([^"]*)" src="screenshots/([^"]+)" ?/?></p>',
                 r'<figure><img alt="\1" src="guide/\2" loading="lazy"><figcaption>\1</figcaption></figure>', out)
    out = re.sub(r'<a href="(https?://[^"]+)">', r'<a href="\1" target="_blank" rel="noopener">', out)
    out = out.replace('<a href="https://neural-network-digit-recognition.pikov.expert/" target="_blank" rel="noopener">',
                      '<a href="/">')  # ссылка на саму лабораторию – в той же вкладке
    out = re.sub(r'^<p>', '<p class="lead">', out, count=1)
    page = HEAD.format(title=E(title), desc=E(desc), url=URL) + f'    <h1>{E(title)}</h1>\n' + out + '\n' + FOOT
    # стили – отдельным файлом: локальный сервер лаборатории запрещает встроенные стили (CSP style-src 'self')
    m = re.search(r'\n  <style>\n(.*?)\n  </style>', page, re.S)
    css = '\n'.join(l[4:] if l.startswith('    ') else l for l in m.group(1).split('\n')) + '\n'
    page = page[:m.start()] + '\n  <link rel="stylesheet" href="/guide.css">' + page[m.end():]
    page = '\n'.join(l.rstrip() for l in page.split('\n'))
    return page, imgs, css


def main():
    sys.stdout.reconfigure(encoding='utf-8')  # консоль Windows по умолчанию не печатает кириллицу
    page, imgs, css = build()
    css_path = os.path.join(ROOT, 'public', 'guide.css')
    if '--check' in sys.argv:
        read = lambda p: open(p, encoding='utf-8').read() if os.path.exists(p) else ''
        ok = read(OUT) == page and read(css_path) == css and all(os.path.exists(os.path.join(IMG_DIR, i)) for i in imgs)
        print('guide.html актуальна' if ok else 'guide.html устарела: python scripts/build-guide.py')
        sys.exit(0 if ok else 1)
    os.makedirs(IMG_DIR, exist_ok=True)
    for i in imgs:
        shutil.copy2(os.path.join(ROOT, 'docs', 'screenshots', i), os.path.join(IMG_DIR, i))
    open(OUT, 'w', encoding='utf-8', newline='\n').write(page)
    open(css_path, 'w', encoding='utf-8', newline='\n').write(css)
    print(f'ok: {OUT}, скриншотов {len(imgs)}')


if __name__ == '__main__':
    main()
