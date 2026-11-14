const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs/promises');
const cp=require('node:child_process');
const path=require('node:path');
const os=require('node:os');
const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1]};
const url=arg('--url',process.env.DIGIT_LAB_URL || 'http://127.0.0.1:4173');
const output=path.resolve(arg('--out',process.env.DIGIT_LAB_VERIFY_OUT || 'docs/verification/browser'));

(async()=>{
 await fs.mkdir(output,{recursive:true});
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'digit-lab-visibility-'));
 const child=cp.spawn(process.env.CHROMIUM_PATH || chromium.executablePath(),['--remote-debugging-port=0','--remote-debugging-address=127.0.0.1',`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','about:blank'],{windowsHide:true,stdio:'ignore'});
 let port;
 for(let i=0;i<100;i++){try{port=(await fs.readFile(profile+'/DevToolsActivePort','utf8')).split('\n')[0];break}catch{} await new Promise(resolve=>setTimeout(resolve,100));}
 if(!port){child.kill();throw new Error('Own Chromium debug endpoint did not start');}
 const browser=await chromium.connectOverCDP('http://127.0.0.1:'+port,{noDefaults:true});
 try{
  const context=browser.contexts()[0];
  const page=context.pages()[0];
  await page.setViewportSize({width:1366,height:768});
  await page.addInitScript(()=>{window.__rafPending=new Set();const request=window.requestAnimationFrame,cancel=window.cancelAnimationFrame;window.requestAnimationFrame=fn=>{const id=request(t=>{window.__rafPending.delete(id);fn(t)});window.__rafPending.add(id);return id};window.cancelAnimationFrame=id=>{window.__rafPending.delete(id);return cancel(id)}});
  await page.goto(url,{waitUntil:'networkidle'});
  await page.bringToFront();await page.locator('#predict').click();
  const observe=()=>page.evaluate(()=>({documentHidden:document.hidden,visibilityState:document.visibilityState,rafPending:window.__rafPending.size,model:localStorage.getItem('ai-engineers-digit-lab-model-v1'),prediction:document.querySelector('#predicted-digit').textContent}));
  await page.waitForTimeout(250);const initial=await observe();
  const other=await context.newPage();await other.goto('about:blank');await other.bringToFront();
  await page.waitForTimeout(300);const background=await observe();
  await page.bringToFront();await page.waitForTimeout(300);const rendered=await observe();
  const modelUnchanged=initial.model===background.model&&initial.model===rendered.model;
  for(const x of [initial,background,rendered])delete x.model;
  const result={capturedAt:new Date().toISOString(),method:'Own headed Chromium 1248, fresh profile, connectOverCDP noDefaults=true; two actual tabs; document.hidden was not overridden and no visibility event synthesized',initialObservation:initial,backgroundObservation:background,renderedObservation:rendered,modelUnchanged};
  result.pass=!initial.documentHidden&&background.documentHidden&&background.rafPending===0&&!rendered.documentHidden&&rendered.rafPending===1&&modelUnchanged;
  await fs.writeFile(path.join(output,'visibility-native.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));if(!result.pass)process.exitCode=1;
 }finally{try{await (await browser.newBrowserCDPSession()).send('Browser.close')}catch{}await browser.close();if(child.exitCode===null)child.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
