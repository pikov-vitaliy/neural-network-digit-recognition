import json,sys
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
sys.stdout.reconfigure(encoding='utf8')
root=Path('V:/tmp/codex/2026-11-14/digit-lab-full-audit-2119')
out=root/'browser'
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    page=browser.new_page(viewport={'width':1440,'height':900})
    page.goto('http://127.0.0.1:59226',wait_until='networkidle')
    def state():
        return {'trainingAnswer':page.locator('#correct-answer').input_value(),'inspector':page.locator('#inspection-title').inner_text(),'status':page.locator('#model-status').inner_text(),'probability5':page.locator('#output-row-5 output').inner_text(),'probability0':page.locator('#output-row-0 output').inner_text()}
    before=state()
    # Top output circle coordinates observed in the 1440x900 screenshot.
    page.locator('#network-canvas').click(position={'x':616,'y':52})
    expect(page.locator('#inspection-title')).to_have_text('Выходной слой · цифра 0')
    after_click=state()
    page.screenshot(path=str(out/'15-output-click-does-not-label.png'),full_page=True)
    page.locator('#train-one').click()
    after_train=state()
    browser.close()
result={'clickedVisibleCircle':'1 (actually class0 due to AUD-01)','before':before,'afterClick':after_click,'afterTrainOne':after_train}
(out/'output-click-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(result,ensure_ascii=False,indent=2))
