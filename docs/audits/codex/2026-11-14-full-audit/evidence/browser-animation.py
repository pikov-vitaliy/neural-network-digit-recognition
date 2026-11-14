import json,sys,time,hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.stdout.reconfigure(encoding='utf8')
root=Path('V:/tmp/codex/2026-11-14/digit-lab-full-audit-2119')
out=root/'browser'
frames=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    page=browser.new_page(viewport={'width':1440,'height':1000},reduced_motion='no-preference')
    page.goto('http://127.0.0.1:59226',wait_until='networkidle')
    page.locator('#predict').click()
    started=time.perf_counter()
    for target in [0.10,0.40,1.20,1.60]:
        remaining=target-(time.perf_counter()-started)
        if remaining>0:page.wait_for_timeout(remaining*1000)
        path=out/f'animation-{int(target*1000)}ms.png'
        page.locator('#network-canvas').screenshot(path=str(path),animations='allow')
        frames.append({'targetSeconds':target,'capturedSeconds':round(time.perf_counter()-started,3),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'file':path.name})
    browser.close()
result={'frames':frames,'earlyFramesDifferent':frames[0]['sha256']!=frames[1]['sha256'],'lateFramesIdentical':frames[2]['sha256']==frames[3]['sha256'],'reducedMotion':'no-preference'}
(out/'animation-timing.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(result,ensure_ascii=False,indent=2))
