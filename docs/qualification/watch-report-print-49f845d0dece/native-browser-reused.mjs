import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve,join,extname} from 'node:path';
import {createHash} from 'node:crypto';
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function waitFor(check,label,attempts=160){
 let last;for(let i=0;i<attempts;i++){try{if(await check())return;}catch(error){last=error;}await delay(75);}
 throw new Error('Timed out: '+label+(last?' ('+last.message+')':''));
}
export class NativeBrowser {
 constructor({source,output,browser}){Object.assign(this,{source:resolve(source),output:resolve(output),executable:browser,sequence:0,pending:new Map(),downloads:new Map(),pages:[],requests:[],errors:[],browserLog:''});}
 async start(){
  await mkdir(this.output,{recursive:true});this.downloadPath=join(this.output,'downloads');await mkdir(this.downloadPath,{recursive:true});this.profile=await mkdtemp(join(this.output,'profile-'));
  this.server=createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=resolve(this.source,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(this.source+'/')){res.writeHead(403).end();return;}const bytes=await readFile(file),mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm'}[extname(file)];res.writeHead(200,{'Content-Type':mime||'application/octet-stream'}).end(bytes);}catch{res.writeHead(404).end();}});
  await new Promise(resolve=>this.server.listen(0,'127.0.0.1',resolve));this.base='http://127.0.0.1:'+this.server.address().port;
  this.child=spawn(this.executable,['--headless=new','--no-sandbox','--disable-gpu','--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--no-default-browser-check','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+this.profile,'about:blank'],{stdio:['ignore','ignore','pipe']});
  this.child.stderr.on('data',b=>{this.browserLog+=b.toString();});this.child.on('error',error=>{this.launchError=error;});
  let port,endpoint;await waitFor(async()=>{if(this.launchError)throw this.launchError;if(this.child.exitCode!==null)throw new Error('Browser exit '+this.child.exitCode+': '+this.browserLog);[port,endpoint]=(await readFile(join(this.profile,'DevToolsActivePort'),'utf8')).trim().split('\n');return !!(port&&endpoint);},'native browser startup',600);
  this.socket=new WebSocket('ws://127.0.0.1:'+port+endpoint);
  this.socket.addEventListener('message',event=>{
   const m=JSON.parse(event.data);if(m.id){const p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);return;}
   if(m.method==='Browser.downloadWillBegin'||m.method==='Browser.downloadProgress'){const p=m.params;this.downloads.set(p.guid,{...this.downloads.get(p.guid),...p});}
   if(m.method==='Runtime.exceptionThrown')this.errors.push({sessionId:m.sessionId,detail:m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text});
   if(m.method==='Network.requestWillBeSent'){const url=m.params.request.url;this.requests.push({sessionId:m.sessionId,url:url.startsWith('data:')?url.slice(0,url.indexOf(','))+',[sha256:'+sha256(url)+']':url});}
  });
  await new Promise((resolve,reject)=>{this.socket.addEventListener('open',resolve,{once:true});this.socket.addEventListener('error',reject,{once:true});});
  this.version=await this.command('Browser.getVersion');
  await this.command('Browser.setDownloadBehavior',{behavior:'allowAndName',downloadPath:this.downloadPath,eventsEnabled:true});
  return this;
 }
 command(method,params={},sessionId){
  const id=++this.sequence;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('CDP timeout: '+method));},10000);this.pending.set(id,{resolve,reject,timer});this.socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
 }
 async page(url,{width=1280,height=1000,observeStorage=true,javascript=true,offline=false}={}){
  const {targetId}=await this.command('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await this.command('Target.attachToTarget',{targetId,flatten:true});
  const page=new NativePage(this,{targetId,sessionId,url,width,height});this.pages.push(page);
  await page.command('Page.enable');await page.command('Runtime.enable');await page.command('Network.enable');
  if(observeStorage)await page.command('Page.addScriptToEvaluateOnNewDocument',{source:"window.__receivingWrites=[];for(const name of ['setItem','removeItem','clear']){const original=Storage.prototype[name];Storage.prototype[name]=function(...args){if(name==='clear'||args[0]==='longwater.watch.v1')window.__receivingWrites.push({method:name,key:args[0]??null});return original.apply(this,args);};}"});
  if(!javascript)await page.command('Emulation.setScriptExecutionDisabled',{value:true});
  if(offline)await page.command('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  await page.command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  await page.command('Page.navigate',{url});
  await waitFor(()=>page.evaluate("document.readyState === 'complete' && document.URL === "+JSON.stringify(url)),'new document '+url);
  return page;
 }
 async stop(){
  if(this.socket?.readyState===WebSocket.OPEN)try{await this.command('Browser.close');}catch{}
  this.socket?.close();for(const p of this.pending.values())clearTimeout(p.timer);
  if(this.child&&this.child.exitCode===null)this.child.kill('SIGTERM');
  if(this.server){this.server.closeAllConnections();await new Promise(resolve=>this.server.close(resolve));}
  if(this.output)await writeFile(join(this.output,'browser.stderr.log'),this.browserLog);
  await delay(300);if(this.profile)await rm(this.profile,{recursive:true,force:true});
 }
}
export class NativePage {
 constructor(browser,info){this.browser=browser;Object.assign(this,info);}
 command(method,params={}){return this.browser.command(method,params,this.sessionId);}
 async evaluate(expression){const r=await this.command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
 text(selector){return this.evaluate('document.querySelector('+JSON.stringify(selector)+')?.textContent ?? null');}
 async press(key){
  const codeMap={Enter:13,Home:36,End:35,ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40,Escape:27,Tab:9};
  const code=key===' '?'Space':key.length===1?(Number.isInteger(Number(key))?'Digit'+key:'Key'+key.toUpperCase()):key,vk=key===' '?32:codeMap[key]??key.toUpperCase().charCodeAt(0);
  for(const type of ['keyDown','keyUp'])await this.command('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode:vk,nativeVirtualKeyCode:vk,...(type==='keyDown'&&(key==='Enter'||key.length===1)?{text:key==='Enter'?'\r':key,unmodifiedText:key==='Enter'?'\r':key}:{})});
 }
 async focus(selector){assert.ok(await this.evaluate('!!document.querySelector('+JSON.stringify(selector)+')'),'Missing '+selector);await this.evaluate('document.querySelector('+JSON.stringify(selector)+').focus()');}
 async activate(selector){await this.focus(selector);assert.equal(await this.evaluate('!!document.querySelector('+JSON.stringify(selector)+').disabled'),false,'Disabled '+selector);await this.press('Enter');}
 async screenshot(name,selector){if(selector)await this.evaluate('document.querySelector('+JSON.stringify(selector)+").scrollIntoView({block:'start'})");const r=await this.command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});const bytes=Buffer.from(r.data,'base64');await writeFile(join(this.browser.output,name),bytes);return {name,bytes:bytes.length,sha256:sha256(bytes)};}
 async download(selector,name){
  const before=new Set(this.browser.downloads.keys());await this.activate(selector);let entry;
  await waitFor(()=>{entry=[...this.browser.downloads.values()].find(x=>!before.has(x.guid)&&x.state==='completed');return !!entry;},'actual download '+name);
  const bytes=await readFile(join(this.browser.downloadPath,entry.guid)),path=join(this.browser.output,name);await writeFile(path,bytes);return {path,bytes,record:{name,guid:entry.guid,suggestedFilename:entry.suggestedFilename,bytes:bytes.length,sha256:sha256(bytes)}};
 }
 async gameWitness(){return this.evaluate("({saved:localStorage.getItem('longwater.watch.v1'),writes:window.__receivingWrites.length,selected:[...document.querySelectorAll('[data-cell]')].map(x=>x.getAttribute('aria-pressed')),state:document.querySelector('#state-summary').textContent,cells:[0,1,2].map(i=>document.querySelector('#cell-'+i+'-readings').textContent),journalEntries:document.querySelector('#journal-entries').innerHTML,recap:document.querySelector('#watch-recap').innerHTML,count:document.querySelector('#journal-count').textContent,journalOpen:document.querySelector('#journal-details').open,metric:document.querySelector('#trend-metric').value,reviewTide:document.querySelector('#trend-tide').value,trendReadout:document.querySelector('#trend-selected').textContent})");}
 async close(){await this.browser.command('Target.closeTarget',{targetId:this.targetId});}
}
