import json, sys
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
sys.stdout.reconfigure(encoding='utf-8')
ROOT=Path('V:/tmp/codex/2026-11-14/digit-lab-full-audit-2119')
OUT=ROOT/'visualization'
S=ROOT/'source-snapshot'
manifest=json.loads((S/'public/samples/manifest.json').read_text(encoding='utf8'))
report={'url':'http://127.0.0.1:59226','checks':[],'errors':[]}
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    page=browser.new_page(viewport={'width':1440,'height':1000})
    page.on('pageerror',lambda e:report['errors'].append(str(e)))
    page.goto(report['url'],wait_until='networkidle')
    expect(page.locator('#sample-grid button')).to_have_count(100)
    page.locator('#train-all').click()
    expect(page.locator('#epoch-label')).to_have_text('Обучение завершено',timeout=30000)
    report['trainedModelSteps']=page.evaluate("JSON.parse(localStorage.getItem('ai-engineers-digit-lab-model-v1')).steps")
    def state():
        return page.evaluate('''() => ({preview:Array.from(document.querySelector('#input-preview').getContext('2d').getImageData(0,0,16,16).data).filter((x,i)=>i%4===2),predicted:document.querySelector('#predicted-digit').textContent,confidence:document.querySelector('#confidence-copy').textContent,probabilities:Array.from(document.querySelectorAll('#digit-outputs output')).map(x=>x.textContent)})''')
    for sample in manifest['samples']:
        page.locator('[data-id="'+sample['id']+'"]').click()
        page.locator('#predict').click()
        gallery=state()
        page.locator('#file-input').set_input_files(str(S/'public'/sample['file']))
        expect(page.locator('#sample-name')).to_have_text(Path(sample['file']).name)
        page.locator('#predict').click()
        upload=state()
        differences=[abs(a-b) for a,b in zip(gallery['preview'],upload['preview'])]
        row={'id':sample['id'],'label':sample['label'],'split':sample['split'],'galleryPrediction':gallery['predicted'],'uploadPrediction':upload['predicted'],'galleryConfidence':gallery['confidence'],'uploadConfidence':upload['confidence'],'changedPixels':sum(x!=0 for x in differences),'maxPixelDelta':max(differences),'meanPixelDelta':sum(differences)/256}
        report['checks'].append(row)
        if gallery['predicted']!=upload['predicted'] and not report.get('mismatchScreenshot'):
            page.screenshot(path=str(OUT/'same-png-upload-mismatch.png'),full_page=True)
            report['mismatchScreenshot']=sample['id']
        if len(report['checks'])%20==0: print('samples',len(report['checks']),flush=True)
    report['summary']={'samples':len(report['checks']),'differentPrediction':sum(x['galleryPrediction']!=x['uploadPrediction'] for x in report['checks']),'galleryCorrect':sum(x['galleryPrediction']==str(x['label']) for x in report['checks']),'uploadCorrect':sum(x['uploadPrediction']==str(x['label']) for x in report['checks']),'changedInputs':sum(x['changedPixels']>0 for x in report['checks'])}
    before=page.evaluate("localStorage.getItem('ai-engineers-digit-lab-model-v1')")
    page.locator('#import-input').set_input_files(str(OUT/'model-finite-overflow.json'))
    expect(page.locator('#toast')).to_contain_text('Модель импортирована')
    page.locator('#predict').click()
    report['finiteOverflow']={'toast':page.locator('#toast').inner_text(),'state':state(),'storageReplaced':page.evaluate("localStorage.getItem('ai-engineers-digit-lab-model-v1')")!=before}
    page.screenshot(path=str(OUT/'finite-overflow-import.png'),full_page=True)
    (OUT/'browser-probes.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
    browser.close()
print(json.dumps({'summary':report['summary'],'finiteOverflow':{k:v for k,v in report['finiteOverflow'].items() if k!='state'},'overflowConfidence':report['finiteOverflow']['state']['confidence'],'errors':report['errors']},ensure_ascii=False,indent=2))
