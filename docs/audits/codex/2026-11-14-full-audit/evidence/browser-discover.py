import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8')
root = Path('V:/tmp/codex/2026-11-14/digit-lab-full-audit-2119')
out = root / 'browser'
out.mkdir(exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:59226', wait_until='networkidle')
    page.screenshot(path=str(out/'01-initial-1440.png'), full_page=True)
    data = {
        'body': page.locator('body').inner_text(),
        'controls': page.locator('button,input,select,textarea,a').evaluate_all('(els) => els.map(e => ({tag:e.tagName,id:e.id,text:e.innerText,aria:e.getAttribute("aria-label"),type:e.type,value:e.value,disabled:e.disabled,hidden:!e.getClientRects().length,options:e.tagName==="SELECT"?[...e.options].map(o=>({value:o.value,text:o.text})):undefined}))'),
        'canvases': page.locator('canvas').evaluate_all('(els)=>els.map(e=>({id:e.id,width:e.width,height:e.height,rect:e.getBoundingClientRect().toJSON(),aria:e.getAttribute("aria-label")}))'),
        'errors': errors,
    }
    (out/'initial-dom.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps(data,ensure_ascii=False,indent=2))
    browser.close()
