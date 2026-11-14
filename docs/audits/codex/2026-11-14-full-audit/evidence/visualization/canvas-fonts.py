import json,sys
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
sys.stdout.reconfigure(encoding='utf8')
OUT=Path('V:/tmp/codex/2026-11-14/digit-lab-full-audit-2119/visualization')
report=[]
with sync_playwright() as p:
    b=p.chromium.launch(headless=True)
    for width,height in [(1440,1000),(390,844)]:
        page=b.new_page(viewport={'width':width,'height':height})
        page.add_init_script('''window.__auditTexts=[];const originalFillText=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...extra){if(this.canvas.id==='network-canvas')window.__auditTexts.push({text:String(text),font:this.font,x,y,scaleX:this.getTransform().a});return originalFillText.call(this,text,x,y,...extra);};''')
        page.goto('http://127.0.0.1:59226',wait_until='networkidle')
        expect(page.locator('#sample-grid button')).to_have_count(100)
        page.locator('#predict').click()
        record=page.evaluate('''() => {const c=document.querySelector('#network-canvas'),r=c.getBoundingClientRect();return {viewport:{width:innerWidth,height:innerHeight},canvas:{width:r.width,height:r.height,bitmapWidth:c.width,bitmapHeight:c.height},fonts:Array.from(new Set(window.__auditTexts.map(x=>x.font))),hiddenExample:window.__auditTexts.find(x=>/^0\\.\\d{2}$/.test(x.text)),percentExample:window.__auditTexts.find(x=>/\\d%/.test(x.text)),layerExample:window.__auditTexts.find(x=>x.text.startsWith('СКРЫТЫЙ')),weightsInInspector:document.querySelectorAll('#weight-list .weight-chip').length}}''')
        report.append(record)
        page.locator('#network-figure').screenshot(path=str(OUT/f'canvas-{width}.png'))
        page.close()
    b.close()
(OUT/'canvas-fonts.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(report,ensure_ascii=False,indent=2))
