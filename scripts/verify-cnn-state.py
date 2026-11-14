import json,sys,hashlib,time,traceback,os
from pathlib import Path
from datetime import datetime,timezone
from playwright.sync_api import sync_playwright,expect
sys.stdout.reconfigure(encoding="utf-8")
ROOT=Path(__file__).resolve().parents[1]
FIXTURES=ROOT/"docs/audits/codex/2026-11-15-completion/fixtures"
OUT=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/"docs/audits/codex"/datetime.now().strftime("%Y-%m-%d-cnn-state-%H%M%S")
OUT.mkdir(parents=True,exist_ok=True)
URL=os.environ.get("DIGIT_LAB_URL","http://127.0.0.1:4173/")
MLP="ai-engineers-digit-lab-model-v1"; CNN="ai-engineers-digit-lab-cnn-v1"
manifest=json.loads((ROOT/"public/samples/manifest.json").read_text(encoding="utf-8"))
train_ids=[s["id"] for s in manifest["samples"] if s["split"]=="train"]
validation_id=next(s["id"] for s in manifest["samples"] if s["split"]=="validation")
trained=json.loads((FIXTURES/"cnn-trained.json").read_text(encoding="utf-8"))
mlp_fixture=json.loads((FIXTURES/"mlp-legacy.json").read_text(encoding="utf-8"))
report={"started":datetime.now(timezone.utc).isoformat(),"url":URL,"results":[],"pageErrors":[],"sourcesBefore":{}}
for f in ["public/js/cnn-lab.js","public/js/app.js","src/shared/cnn-network.js"]:
 report["sourcesBefore"][f]=hashlib.sha256((ROOT/f).read_bytes()).hexdigest()
def save():
 (OUT/"browser-results-final.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
def raw(page,key):
 return page.evaluate("(key)=>localStorage.getItem(key)",key)
def model(page,key=CNN):
 value=raw(page,key)
 if value is None:return None
 obj=json.loads(value); return obj.get("model",obj)
def steps(page,key=CNN):
 m=model(page,key);return m["steps"] if m else 0
def digest(value):
 return hashlib.sha256(value.encode()).hexdigest() if value is not None else None
def state(page):
 return {"cnnSteps":steps(page),"mlpSteps":steps(page,MLP),"cnnHash":digest(raw(page,CNN)),"mlpHash":digest(raw(page,MLP)),"cnnDigit":page.locator("#cnn-predicted-digit").inner_text(),"cnnProgress":page.locator("#cnn-progress").inner_text(),"loss":page.locator("#cnn-loss").inner_text(),"train":page.locator("#cnn-train-accuracy").inner_text(),"validation":page.locator("#cnn-validation-accuracy").inner_text(),"busy":not page.locator("#cnn-stop-training").is_disabled(),"input":page.locator("#sample-name").inner_text(),"toast":page.locator("#toast").inner_text()}
def choose(page,id):
 page.locator("#source-gallery").click()
 detail=page.locator("#gallery-details")
 if not detail.evaluate("(e)=>e.open"):detail.locator("summary").click()
 page.locator("#dataset-filter").select_option("all")
 page.locator('[data-id="'+id+'"]').click()
def cnn(page):page.locator("#example-cnn").click()
def predict(page):
 page.locator("#predict").click()
 expect(page.locator("#cnn-predicted-digit")).not_to_have_text("—")
def train_one(page):
 page.locator("#train-one").click()
 expect(page.locator("#cnn-feedback-dialog")).to_be_visible()
 page.locator("#cnn-confirm-feedback").click()
 expect(page.locator("#cnn-feedback-dialog")).not_to_be_visible()
def draw(page):
 page.locator("#source-draw").click()
 box=page.locator("#drawing-canvas").bounding_box()
 points=[(.25,.2),(.75,.2),(.25,.2),(.25,.5),(.7,.5),(.75,.75),(.25,.8)]
 page.mouse.move(box["x"]+box["width"]*points[0][0],box["y"]+box["height"]*points[0][1])
 page.mouse.down()
 for x,y in points[1:]:page.mouse.move(box["x"]+box["width"]*x,box["y"]+box["height"]*y,steps=4)
 page.mouse.up()
 expect(page.locator("#sample-name")).to_have_text("Собственный рисунок")
def canvas(page):
 return page.locator("#drawing-canvas").evaluate("(c)=>c.toDataURL()")
def upload(page,obj,name="model.json"):
 body=json.dumps(obj).encode() if not isinstance(obj,bytes) else obj
 page.locator("#cnn-import-input").set_input_files({"name":name,"mimeType":"application/json","buffer":body})
 page.wait_for_timeout(80)
def delayed(page):
 page.evaluate("""()=>{const original=File.prototype.text;window.__releaseImport=null;File.prototype.text=function(){if(this.name!=='delayed-cnn.json')return original.call(this);const file=this;document.body.dataset.delayedImport='waiting';return new Promise(resolve=>{window.__releaseImport=()=>original.call(file).then(resolve);});};}""")
 page.locator("#cnn-import-input").set_input_files({"name":"delayed-cnn.json","mimeType":"application/json","buffer":json.dumps(trained).encode()})
 expect(page.locator("body")).to_have_attribute("data-delayed-import","waiting")
def release(page):
 page.evaluate("()=>window.__releaseImport()")
 page.wait_for_timeout(100)
def fresh(browser):
 context=browser.new_context(viewport={"width":1440,"height":1000})
 page=context.new_page();page.set_default_timeout(5000)
 page.on("pageerror",lambda e:report["pageErrors"].append(str(e)))
 page.goto(URL,wait_until="networkidle")
 expect(page.locator("#train-one")).to_be_enabled()
 return context,page
def run(browser,name,fn):
 context,page=fresh(browser)
 result={"name":name,"started":datetime.now(timezone.utc).isoformat()}
 try:
  result["details"]=fn(page);result["pass"]=True
 except Exception as error:
  result["pass"]=False;result["error"]=str(error);result["traceback"]=traceback.format_exc()
  try:result["state"]=state(page);page.screenshot(path=str(OUT/(name+"-failure.png")),full_page=True)
  except Exception as inner:result["captureError"]=str(inner)
 finally:
  report["results"].append(result);save();print(json.dumps(result,ensure_ascii=False),flush=True);context.close()
def feedback(page):
 cnn(page);draw(page);image=canvas(page);predict(page)
 digit=int(page.locator("#cnn-predicted-digit").inner_text())
 page.locator("#cnn-feedback-correct").click()
 assert steps(page)==1
 assert ("Принята цифра "+str(digit)) in page.locator("#cnn-training-feedback").inner_text()
 assert canvas(page)==image
 correct=state(page)
 predict(page);target=(int(page.locator("#cnn-predicted-digit").inner_text())+1)%10
 baseline=raw(page,CNN)
 page.locator("#cnn-choose-"+str(target)).click()
 expect(page.locator("#cnn-feedback-dialog")).to_be_visible()
 assert raw(page,CNN)==baseline
 page.locator("#cnn-cancel-feedback").click()
 assert raw(page,CNN)==baseline
 page.locator("#cnn-choose-"+str(target)).click()
 page.evaluate("()=>{document.querySelector('#cnn-confirm-feedback').click();document.querySelector('#cnn-confirm-feedback').click();}")
 assert steps(page)==2
 assert ("Принята цифра "+str(target)) in page.locator("#cnn-training-feedback").inner_text()
 assert canvas(page)==image
 assert page.locator("#cnn-feedback-correct").is_disabled()
 page.screenshot(path=str(OUT/"feedback-corrected.png"),full_page=True)
 return {"correctButton":correct,"correctedTarget":target,"after":state(page),"drawingPreserved":True,"doubleConfirmMethod":"two DOM clicks in one JavaScript task"}
def isolation(page):
 page.locator("#train-one").click();assert steps(page,MLP)==1
 mlp=raw(page,MLP);cnn(page);train_one(page);assert steps(page)==1 and raw(page,MLP)==mlp
 cnnSaved=raw(page,CNN);page.locator("#example-mlp").click();page.locator("#train-one").click()
 assert steps(page,MLP)==2 and raw(page,CNN)==cnnSaved
 page.locator("#reset-model").click();page.locator("#confirm-reset").click()
 assert steps(page,MLP)==0 and raw(page,CNN)==cnnSaved
 page.locator("#train-one").click();mlp=raw(page,MLP);cnn(page)
 page.locator("#cnn-reset").click();page.locator("#cnn-confirm-reset").click()
 assert steps(page)==0 and raw(page,MLP)==mlp
 upload(page,trained);assert steps(page)==960 and raw(page,MLP)==mlp
 cnnSaved=raw(page,CNN);page.locator("#example-mlp").click()
 page.locator("#import-input").set_input_files({"name":"mlp.json","mimeType":"application/json","buffer":json.dumps(mlp_fixture).encode()})
 page.wait_for_timeout(100)
 assert steps(page,MLP)==960 and raw(page,CNN)==cnnSaved
 return {"after":state(page),"bothTrainResetImportDirections":True}
def holdout(page):
 cnn(page);choose(page,validation_id);predict(page);before=raw(page,CNN)
 assert page.locator("#train-one").is_disabled()
 assert page.locator("#cnn-feedback-correct").is_disabled()
 page.locator("#cnn-choose-3").click()
 assert not page.locator("#cnn-feedback-dialog").evaluate("(e)=>e.open")
 assert raw(page,CNN)==before
 return state(page)
def recognition(page):
 cnn(page);train_one(page);before=raw(page,CNN);page.locator("#cnn-mode-recognition").click();predict(page)
 for digit in range(10):
  page.locator("#cnn-choose-"+str(digit)).click()
  assert page.locator(".cnn-output tr.target").count()==1
  assert page.locator("#cnn-output-row-"+str(digit)).evaluate("e=>e.classList.contains('target')")
 assert page.locator("#cnn-train-all").is_disabled() and page.locator("#train-one").is_disabled()
 page.evaluate("()=>{document.querySelector('#cnn-train-all').dispatchEvent(new Event('click'));document.querySelector('#cnn-confirm-feedback').click();}")
 page.wait_for_timeout(150);assert raw(page,CNN)==before
 return {"after":state(page),"trainingHandlersGuarded":True}
def pending_stale(page):
 cnn(page);predict(page);page.locator("#cnn-choose-8").click();before=raw(page,CNN)
 page.evaluate("(id)=>document.querySelector('[data-id=\"'+id+'\"]').click()",train_ids[1])
 assert not page.locator("#cnn-feedback-dialog").evaluate("(e)=>e.open")
 page.evaluate("()=>document.querySelector('#cnn-confirm-feedback').click()")
 assert raw(page,CNN)==before
 expect(page.locator("#cnn-predicted-digit")).to_have_text("—")
 predict(page);page.locator("#cnn-choose-8").click()
 page.evaluate("()=>document.querySelector('#example-mlp').click()")
 assert not page.locator("#cnn-feedback-dialog").evaluate("(e)=>e.open")
 assert raw(page,CNN)==before
 return {"after":state(page),"method":"synthetic input/example clicks while modal was open"}
def cancel_during(page,target):
 cnn(page);page.locator("#cnn-train-all").click()
 expect(page.locator("#cnn-stop-training")).to_be_enabled()
 before=state(page)
 assert before["busy"] and 0<before["cnnSteps"]<960
 page.locator(target).click()
 after=state(page);stored=raw(page,CNN)
 page.wait_for_timeout(400)
 assert raw(page,CNN)==stored
 assert not state(page)["busy"]
 assert after["cnnSteps"]<960
 return {"before":before,"immediatelyAfter":after,"afterWait":state(page),"method":"actual Playwright button clicks"}
def import_rejections(page):
 cnn(page);train_one(page);before=raw(page,CNN);predict(page)
 cases=[]
 for name,obj in [("mlp.json",mlp_fixture),("bad.json",b"{"),("unsafe.json",trained)]:
  if name=="unsafe.json":obj=json.loads(json.dumps(obj));obj["parameters"]["conv1"]["weights"][0]=3e38
  upload(page,obj,name)
  assert raw(page,CNN)==before
  cases.append({"file":name,"toast":page.locator("#toast").inner_text()})
 return {"cases":cases,"after":state(page)}
def reload(page):
 cnn(page);page.locator("#cnn-train-all").click()
 expect(page.locator("#cnn-progress")).to_contain_text("Обучение завершено",timeout=15000)
 before=state(page);stored=raw(page,CNN)
 assert steps(page)==960 and before["train"]=="100,0%" and before["validation"]=="100,0%"
 page.reload(wait_until="networkidle");cnn(page)
 after=state(page)
 assert raw(page,CNN)==stored
 assert (after["loss"],after["train"],after["validation"])==(before["loss"],before["train"],before["validation"])
 assert "12" in after["cnnProgress"] and "960" in after["cnnProgress"]
 return {"before":before,"after":after}
def blank(page):
 cnn(page);page.locator("#source-draw").click();page.locator("#clear-drawing").click();before=raw(page,CNN)
 page.locator("#predict").click()
 expect(page.locator("#cnn-predicted-digit")).to_have_text("—")
 assert page.locator("#cnn-feedback-correct").is_disabled() and raw(page,CNN)==before
 return state(page)
def late_input(page):
 cnn(page);train_one(page);predict(page);delayed(page);choose(page,train_ids[1]);name=page.locator("#sample-name").inner_text();release(page)
 assert steps(page)==960
 assert page.locator("#sample-name").inner_text()==name
 expect(page.locator("#cnn-predicted-digit")).to_have_text("—")
 assert page.locator("#cnn-feedback-correct").is_disabled()
 assert not page.locator("#cnn-feedback-dialog").evaluate("(e)=>e.open")
 return {"after":state(page),"importAppliedToCurrentInputWithoutStalePrediction":True}
def late_cancel(page,action):
 cnn(page);train_one(page);delayed(page)
 if action=="mode":page.locator("#cnn-mode-recognition").click()
 elif action=="example":page.locator("#example-mlp").click()
 elif action=="reset":page.locator("#cnn-reset").click();page.locator("#cnn-confirm-reset").click()
 elif action=="new-step":predict(page);page.locator("#cnn-feedback-correct").click()
 baseline=raw(page,CNN);expectedSteps=steps(page);release(page)
 assert raw(page,CNN)==baseline and steps(page)==expectedSteps
 return {"action":action,"after":state(page)}
def late_replaced(page):
 cnn(page);train_one(page);current=model(page);delayed(page);upload(page,current,"newer-cnn.json");baseline=raw(page,CNN);release(page)
 assert raw(page,CNN)==baseline and steps(page)==1
 return state(page)
def stop_metrics(page):
 cnn(page)
 started=page.evaluate("""()=>{document.querySelector('#cnn-train-all').click();const busy=!document.querySelector('#cnn-stop-training').disabled;document.querySelector('#cnn-stop-training').click();return {busy,immediateLoss:document.querySelector('#cnn-loss').textContent,immediateTrain:document.querySelector('#cnn-train-accuracy').textContent,immediateValidation:document.querySelector('#cnn-validation-accuracy').textContent,method:'two synthetic DOM clicks in one task; metrics captured before yielding after stop'};}""")
 page.wait_for_timeout(100)
 current=state(page)
 actual=page.evaluate("""async()=>{const {CnnNetwork}=await import('/shared/cnn-network.js');const {prepareGalleryPixels}=await import('/shared/image.js');const saved=JSON.parse(localStorage.getItem('ai-engineers-digit-lab-cnn-v1'));const network=CnnNetwork.fromJSON(saved.model);const manifest=await(await fetch('/samples/manifest.json')).json();const data=manifest.samples.map(s=>({...s,pixels:prepareGalleryPixels(Uint8Array.from(atob(s.pixels),c=>c.charCodeAt(0)))}));return {steps:network.steps,training:network.evaluate(data.filter(s=>s.split==='train')),validation:network.evaluate(data.filter(s=>s.split==='validation'))};}""")
 evidence={"started":started,"displayed":current,"actual":actual}
 (OUT/"stop-metrics.json").write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding="utf-8")
 assert started["busy"] and actual["steps"]==8
 assert abs(float(current["loss"])-actual["training"]["loss"])<0.0000006, json.dumps(evidence,ensure_ascii=False)
 assert abs(float(started["immediateLoss"])-actual["training"]["loss"])<0.0000006
 assert started["immediateTrain"]==current["train"] and started["immediateValidation"]==current["validation"]
 return evidence

def corrupted_history(page):
 page.evaluate("(payload)=>localStorage.setItem('ai-engineers-digit-lab-cnn-v1',JSON.stringify(payload))",{"model":trained,"history":[None,{"epoch":1,"steps":80,"loss":1,"train":.5,"validation":.4}]})
 page.reload(wait_until="networkidle");cnn(page)
 result=state(page)
 result["storedHistoryContainsNull"]=True
 result["loadedModelHashMatches"]=model(page)==trained
 (OUT/"corrupted-history.json").write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
 with page.expect_download() as pending_download:page.locator("#cnn-export").click()
 download=pending_download.value
 download.save_as(str(OUT/"restored-history-model.json"))
 assert json.loads((OUT/"restored-history-model.json").read_text(encoding="utf-8"))==trained
 assert result["loss"]=="0.004967"
 assert not ("случайные веса" in result["toast"] and result["cnnSteps"]==960),json.dumps(result,ensure_ascii=False)
 return result

with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 report["browser"]=browser.version
 for name,fn in [
  ("feedback",feedback),("isolation",isolation),("validation",holdout),("recognition",recognition),("stale-pending",pending_stale),
  ("cancel-mode",lambda page:cancel_during(page,"#cnn-mode-recognition")),("cancel-example",lambda page:cancel_during(page,"#example-mlp")),
  ("import-rejections",import_rejections),("reload",reload),("blank",blank),("late-input",late_input),
  ("late-mode",lambda page:late_cancel(page,"mode")),("late-example",lambda page:late_cancel(page,"example")),
  ("late-reset",lambda page:late_cancel(page,"reset")),("late-new-step",lambda page:late_cancel(page,"new-step")),("late-newer-import",late_replaced),
  ("stop-metrics",stop_metrics),("corrupted-history",corrupted_history)
 ]:run(browser,name,fn)
 browser.close()
report["finished"]=datetime.now(timezone.utc).isoformat()
report["sourcesAfter"]={f:hashlib.sha256((ROOT/f).read_bytes()).hexdigest() for f in report["sourcesBefore"]}
report["sourceChangedDuringRun"]=report["sourcesBefore"]!=report["sourcesAfter"]
report["pass"]=all(r["pass"] for r in report["results"]) and not report["pageErrors"]
save()
print(json.dumps({"passed":sum(r["pass"] for r in report["results"]),"total":len(report["results"]),"errors":report["pageErrors"],"sourceChangedDuringRun":report["sourceChangedDuringRun"]},ensure_ascii=False))
sys.exit(0 if report["pass"] else 1)
