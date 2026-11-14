import json, sys, time, hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

sys.stdout.reconfigure(encoding='utf8')
ROOT = Path('V:/tmp/codex/2026-11-14/digit-lab-full-audit-2119')
OUT = ROOT/'browser'
BASE = 'http://127.0.0.1:59226'
results = {'base': BASE, 'scenarios': {}, 'errors': [], 'external_requests': []}

def capture(page, name):
    page.screenshot(path=str(OUT/(name+'.png')), full_page=True)
    (OUT/'browser-audit-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')

def state(page):
    ids = ['sample-name','predicted-digit','confidence-copy','inspection-title','activation-value','bias-value','model-status','training-message','epoch-label','epoch-count','loss-value','train-accuracy','validation-accuracy']
    return {'text': {i: page.locator('#'+i).inner_text() for i in ids},
            'outputs': page.locator('#digit-outputs tbody tr').evaluate_all('(els)=>els.map(e=>({digit:+e.dataset.digit,text:e.querySelector("output").textContent}))'),
            'weights': page.locator('#weight-list').inner_text(),
            'training': page.locator('#train-all').is_disabled(),
            'modeRecognition': page.locator('#mode-recognition').get_attribute('aria-pressed')}

def new_page(browser, width=1440, height=900, **context_options):
    context = browser.new_context(viewport={'width':width,'height':height}, **context_options)
    page = context.new_page()
    page.on('pageerror',lambda error: results['errors'].append(str(error)))
    page.on('request',lambda request: results['external_requests'].append(request.url) if request.url.startswith(('http:','https:')) and not request.url.startswith(BASE) else None)
    page.goto(BASE,wait_until='networkidle')
    return page

def train(page):
    t = time.perf_counter()
    page.locator('#train-all').click()
    expect(page.locator('#epoch-label')).to_have_text('Обучение завершено',timeout=30000)
    expect(page.locator('#train-all')).to_be_enabled()
    return round(time.perf_counter()-t,3)

def export(page,name):
    with page.expect_download() as download:
        page.locator('#export-model').click()
    path = OUT/(name+'.json')
    download.value.save_as(path)
    data=json.loads(path.read_text(encoding='utf8'))
    return {'steps':data.get('steps'), 'sha256':hashlib.sha256(path.read_bytes()).hexdigest(), 'path':str(path), 'keys':list(data)}

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    page=new_page(browser)
    page.locator('#help-button').click()
    results['scenarios']['lesson']={'text':page.locator('#lesson-dialog').inner_text(), 'buttons':page.locator('#lesson-dialog button').all_text_contents()}
    capture(page,'02-lesson-dialog')
    page.keyboard.press('Escape')
    results['scenarios']['lesson']['escapeCloses']=not page.locator('#lesson-dialog').is_visible()
    page.locator('#neuron-picker').select_option('3:0')
    results['scenarios']['output-zero']=state(page)
    capture(page,'03-output-zero-mismatch')
    page.locator('#predict').click()
    capture(page,'04-untrained-prediction')
    results['scenarios']['untrained']=state(page)
    page.locator('#neuron-picker').select_option('1:0')
    before=state(page)
    page.locator('#train-one').click()
    after=state(page)
    results['scenarios']['one-step']={'before':before,'after':after}
    capture(page,'05-one-training-step')
    page.context.close()

    page=new_page(browser)
    results['scenarios']['train-all']={'seconds':train(page),'state':state(page),'export':export(page,'trained-model')}
    capture(page,'06-trained-model')
    page.locator('#mode-recognition').click()
    page.get_by_role('button',name='Цифра 0, вариант 9, проверочный пример',exact=True).click()
    page.locator('#predict').click()
    before=state(page)
    for digit in range(1,10):
        page.get_by_role('button',name=f'Цифра {digit}, вариант 9, проверочный пример',exact=True).click()
        current=state(page)
        top=max(current['outputs'],key=lambda row:float(row['text'].replace('%','').replace(',','.')))
        if str(top['digit']) != before['text']['predicted-digit']:
            break
    results['scenarios']['stale-verdict']={'before':before,'afterChangingInput':current,'tableWinner':top}
    capture(page,'07-stale-answer-after-input-change')
    page.locator('#predict').click()
    results['scenarios']['stale-verdict']['afterExplicitPredict']=state(page)
    capture(page,'08-answer-after-explicit-predict')
    # Export/import roundtrip and rejected invalid JSON must preserve valid model.
    exp_before=export(page,'before-invalid-import')
    page.locator('#import-input').set_input_files({'name':'broken-model.json','mimeType':'application/json','buffer':b'{invalid'})
    toast=page.locator('#toast')
    expect(toast).to_contain_text('Не удалось импортировать модель:',timeout=5000)
    expect(toast).to_be_visible(timeout=5000)
    error_message=toast.inner_text()
    exp_after=export(page,'after-invalid-import')
    results['scenarios']['invalid-import']={'before':exp_before,'after':exp_after,'message':error_message}
    page.context.close()

    page=new_page(browser)
    page.locator('#mode-recognition').click()
    before=state(page)
    initial_export=export(page,'recognition-before')
    capture(page,'09-recognition-before-training')
    elapsed=train(page)
    results['scenarios']['recognition-can-train']={'before':before,'beforeExport':initial_export,'seconds':elapsed,'after':state(page),'afterExport':export(page,'recognition-after')}
    capture(page,'10-recognition-after-training')
    page.context.close()

    page=new_page(browser)
    page.locator('#dataset-filter').select_option('validation')
    page.get_by_role('button',name='Цифра 0, вариант 9, проверочный пример',exact=True).click()
    before=state(page)
    page.locator('#train-one').click()
    results['scenarios']['validation-trains']={'before':before,'after':state(page),'export':export(page,'validation-trained')}
    capture(page,'11-validation-used-for-training')
    page.context.close()

    page=new_page(browser)
    page.locator('#source-draw').click()
    page.locator('#clear-drawing').click()
    page.locator('#predict').click()
    results['scenarios']['blank-input']=state(page)
    capture(page,'12-blank-classified-as-digit')
    canvas=page.locator('#drawing-canvas').bounding_box()
    page.mouse.move(canvas['x']+80,canvas['y']+40)
    page.mouse.down()
    page.mouse.move(canvas['x']+80,canvas['y']+210,steps=20)
    page.mouse.up()
    page.locator('#predict').click()
    results['scenarios']['drawing']=state(page)
    page.context.close()

    layout=[]
    for width,height in [(1920,1080),(1366,768),(1280,720),(1024,768),(390,844)]:
        page=new_page(browser,width,height)
        metrics=page.evaluate('''() => ({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,rects:Object.fromEntries(['network-canvas','neuron-inspector','predict','train-one','train-all','digit-outputs'].map(id=>{let e=document.getElementById(id);return [id,e.getBoundingClientRect().toJSON()]})), fonts:Object.fromEntries(['confidence-copy','training-message','sample-name','activation-value','weight-list'].map(id=>[id,getComputedStyle(document.getElementById(id)).fontSize]))})''')
        layout.append(metrics)
        page.screenshot(path=str(OUT/f'layout-{width}x{height}-viewport.png'),full_page=False)
        if width in [1280,390]:capture(page,f'layout-{width}x{height}-full')
        page.context.close()
    results['scenarios']['layout']=layout

    page=new_page(browser)
    page.keyboard.press('Tab')
    tabs=[]
    for i in range(125):
        tabs.append(page.evaluate('() => ({id:document.activeElement.id,tag:document.activeElement.tagName,label:document.activeElement.getAttribute("aria-label"),text:document.activeElement.innerText.slice(0,60)})'))
        if tabs[-1]['id']=='train-one':break
        page.keyboard.press('Tab')
    results['scenarios']['keyboard']={'tabCountThroughTrainOne':len(tabs),'sequence':tabs}
    page.context.close()
    browser.close()

(OUT/'browser-audit-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'scenarios':list(results['scenarios']),'errors':results['errors'],'external_requests':results['external_requests']},ensure_ascii=False,indent=2))
