import json,sys
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
sys.stdout.reconfigure(encoding='utf8')
root=Path('V:/tmp/codex/2026-11-14/digit-lab-full-audit-2119')
out=root/'browser'
results={}
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    page=browser.new_page(viewport={'width':1440,'height':900})
    page.goto('http://127.0.0.1:59226',wait_until='networkidle')
    meta=page.locator('meta[name="color-scheme"]')
    before=meta.get_attribute('content')
    page.locator('#theme-toggle').click()
    after=meta.get_attribute('content')
    page.reload(wait_until='networkidle')
    results['theme']={'before':before,'after':after,'afterReload':meta.get_attribute('content'),'savedChoice':page.evaluate("localStorage.getItem('ai-engineers-color-scheme')")}
    # Exercise handlers in one browser turn, before the training continuation.
    active=page.evaluate('''() => {
      document.getElementById('train-all').click();
      const busy=document.getElementById('train-all').disabled;
      const epoch=document.getElementById('epoch-count').textContent;
      document.getElementById('reset-model').click();
      document.getElementById('confirm-reset').click();
      return {busyBeforeReset:busy,epochBeforeReset:epoch,method:'synthetic DOM clicks in one event-loop turn'};
    }''')
    expect(page.locator('#train-all')).to_be_enabled()
    page.wait_for_timeout(300)
    results['activeReset']={**active,'status':page.locator('#model-status').inner_text(),'epoch':page.locator('#epoch-count').inner_text(),'storage':page.evaluate("localStorage.getItem('ai-engineers-digit-lab-model-v1')")}
    previous=page.locator('#sample-name').inner_text()
    previousToast=page.locator('#toast').inner_text()
    page.locator('#file-input').set_input_files({'name':'corrupt.png','mimeType':'image/png','buffer':b'not a PNG'})
    expect(page.locator('#toast')).not_to_have_text(previousToast)
    results['corruptImage']={'message':page.locator('#toast').inner_text(),'sampleUnchanged':previous==page.locator('#sample-name').inner_text()}
    browser.close()
(out/'browser-followup-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(results,ensure_ascii=False,indent=2))
