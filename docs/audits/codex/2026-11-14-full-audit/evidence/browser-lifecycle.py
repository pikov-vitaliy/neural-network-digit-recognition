import json,sys,time,hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
sys.stdout.reconfigure(encoding='utf8')
root=Path('V:/tmp/codex/2026-11-14/digit-lab-full-audit-2119')
out=root/'browser'
url='http://127.0.0.1:59226'
key='ai-engineers-digit-lab-model-v1'
results={}
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    context=browser.new_context(viewport={'width':1440,'height':900})
    page=context.new_page()
    page.goto(url,wait_until='networkidle')
    durations=[]
    for i in range(3):
        page.evaluate('localStorage.clear()')
        page.reload(wait_until='networkidle')
        start=time.perf_counter()
        page.locator('#train-all').click()
        expect(page.locator('#epoch-label')).to_have_text('Обучение завершено')
        durations.append(round(time.perf_counter()-start,3))
    results['training_seconds_3_fresh_models']=durations
    storage=page.evaluate('(key)=>localStorage.getItem(key)',key)
    page.reload(wait_until='networkidle')
    results['reload']={'status':page.locator('#model-status').inner_text(),'storage_identical':page.evaluate('(key)=>localStorage.getItem(key)',key)==storage,'metrics':page.locator('.metrics').inner_text()}
    page.locator('#source-draw').click()
    page.locator('#clear-drawing').click()
    page.locator('#predict').click()
    results['trained_blank']={'digit':page.locator('#predicted-digit').inner_text(),'confidence':page.locator('#confidence-copy').inner_text(),'name':page.locator('#sample-name').inner_text()}
    page.screenshot(path=str(out/'13-trained-blank-input.png'),full_page=True)
    page.locator('#reset-model').click()
    page.locator('#cancel-reset').click()
    results['cancel_reset_preserves_model']=page.evaluate('(key)=>localStorage.getItem(key)',key)==storage
    page.locator('#reset-model').click()
    page.locator('#confirm-reset').click()
    results['confirmed_reset']={'status':page.locator('#model-status').inner_text(),'stored':page.evaluate('(key)=>localStorage.getItem(key)',key),'epoch':page.locator('#epoch-count').inner_text(),'metrics':page.locator('.metrics').inner_text()}
    page.locator('#import-input').set_input_files(str(out/'trained-model.json'))
    expect(page.locator('#toast')).to_contain_text('Модель импортирована')
    model=json.loads(page.evaluate('(key)=>localStorage.getItem(key)',key))
    saved=json.loads((out/'trained-model.json').read_text(encoding='utf8'))
    results['valid_import_roundtrip']={'matches_saved_export':model==saved,'steps':model['steps']}
    old=page.locator('html').get_attribute('data-theme')
    page.locator('#theme-toggle').click()
    changed=page.locator('html').get_attribute('data-theme')
    page.reload(wait_until='networkidle')
    results['theme']={'old':old,'changed':changed,'after_reload':page.locator('html').get_attribute('data-theme')}
    page.screenshot(path=str(out/'14-dark-theme.png'),full_page=True)
    results['runtime']={'browser':browser.version,'ua':page.evaluate('navigator.userAgent')}
    context.close()
    # A deliberately slowed browser makes the cancellation path observable.
    context=browser.new_context(viewport={'width':1440,'height':900})
    page=context.new_page()
    page.goto(url,wait_until='networkidle')
    cdp=context.new_cdp_session(page)
    cdp.send('Emulation.setCPUThrottlingRate',{'rate':20})
    page.locator('#train-all').click()
    results['during_slowed_training']={'busy':page.locator('#train-all').is_disabled(),'epoch':page.locator('#epoch-count').inner_text(),'sample':page.locator('#sample-name').inner_text()}
    page.locator('#reset-model').click()
    page.locator('#confirm-reset').click()
    expect(page.locator('#train-all')).to_be_enabled()
    page.wait_for_timeout(350)
    results['reset_while_training']={'status':page.locator('#model-status').inner_text(),'stored':page.evaluate('(key)=>localStorage.getItem(key)',key),'epoch':page.locator('#epoch-count').inner_text()}
    cdp.send('Emulation.setCPUThrottlingRate',{'rate':1})
    context.close()
    context=browser.new_context(viewport={'width':1440,'height':900},reduced_motion='reduce')
    page=context.new_page()
    page.goto(url,wait_until='networkidle')
    page.locator('#predict').click()
    results['reduced_motion']={'media':page.evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches"),'prediction':page.locator('#predicted-digit').inner_text()}
    context.close()
    browser.close()
(out/'browser-lifecycle-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(results,ensure_ascii=False,indent=2))
