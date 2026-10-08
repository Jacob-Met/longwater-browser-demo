import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {NativeBrowser,waitFor,sha256} from './receiving-browser.mjs';
const root=resolve(process.argv[2]),out=resolve(process.argv[3]);
await mkdir(out,{recursive:true});
const wasmBytes=await readFile(join(root,'pkg/longwater_web_bg.wasm'));
const {initSync,BrowserSession}=await import(pathToFileURL(join(root,'pkg/longwater_web.js')));
initSync({module:wasmBytes});const native=new BrowserSession();
const plan=[['gate',0],['shade',1],['seed',2],['shade',0],['shade',2],['gate',1],['seed',0],['shade',1],['seed',1],['shade',0],['gate',2],['shade',2],['seed',2],['gate',0]];
const snapshots=[native.snapshot_json()],turns=[];
for(const [action,index] of plan){const previous=JSON.parse(snapshots.at(-1)),cell=previous.cells[index].id;snapshots.push(native.take_turn(action,cell));turns.push({action,cell,index});}
native.free();
const states=snapshots.map(JSON.parse);
assert.equal(states.at(-1).day,14);assert.equal(states.at(-1).finished,true);
const inputs={owner:'estate-49f845d0dece/recall_import_receiving',generatedAt:new Date().toISOString(),base:'c44245f45f21ddd14c4bfbb5cf8d5a21d0e98fe3',baseTree:'83c3d5e74377ff6403d1a531718d0674de02d9d2',wasmSha256:sha256(wasmBytes),glueSha256:sha256(await readFile(join(root,'pkg/longwater_web.js'))),source:'Separate unchanged native BrowserSession, no renderer or report candidate inspected',turns,snapshots,partialDay:3,partialReportCell:states[3].report.cell,partialSelectedGameCellAfterReview:'north',partialReviewedTrendTide:1};
await writeFile(join(out,'native-inputs.json'),JSON.stringify(inputs,null,2)+'\n');
const report={status:'running',owner:inputs.owner,base:inputs.base,startedAt:new Date().toISOString(),candidateInspected:false,node:process.version,platform:process.platform,baselineScriptSha256:sha256(await readFile(new URL(import.meta.url))),browserHelperSha256:sha256(await readFile(new URL('./receiving-browser.mjs',import.meta.url))),nativeInputsSha256:sha256(await readFile(join(out,'native-inputs.json'))),checks:[],screenshots:[],turns:[]};
const browser=new NativeBrowser({source:root,output:out,browser:'/home/jacob/.cache/puppeteer/chrome/linux-154.0.8037.57/chrome-linux64/chrome'});
const save=()=>writeFile(join(out,'baseline-report.json'),JSON.stringify(report,null,2)+'\n');
await save();
try{
 await browser.start();report.browser=browser.version;
 const page=await browser.page(browser.base+'/',{width:1280,height:1000});
 await waitFor(()=>page.evaluate("!document.querySelector('#watch-journal').hidden && document.querySelector('#cell-0-readings').textContent.length>0"),'native game');
 assert.equal(await page.evaluate("document.body.innerText.includes('Download watch report')"),false);
 assert.equal(await page.text('#journal-count'),'No tides yet');
 await page.activate('#journal-details > summary');
 for(let i=0;i<turns.length;i++){
  const {action,index}=turns[i];await page.activate('[data-cell="'+index+'"]');await page.activate('[data-action="'+action+'"]');
  await waitFor(()=>page.evaluate("document.querySelectorAll('#journal-entries > li').length === "+(i+1)),'native tide '+(i+1));
  const witness=await page.gameWitness(),saved=JSON.parse(witness.saved);
  assert.equal(saved.snapshot,snapshots[i+1],'actual saved native snapshot at tide '+(i+1));
  assert.deepEqual(saved.turns,turns.slice(0,i+1).map(({action,cell})=>({action,cell})));
  const entry=await page.evaluate("(()=>{const row=document.querySelector('#journal-entries > li:last-child');return {choice:row.querySelector('.journal-choice').textContent,event:row.querySelector('.journal-event').textContent,note:row.querySelector('.journal-event-note').textContent,lines:[...row.querySelectorAll('.journal-notes li')].map(x=>x.textContent),resources:row.querySelector('.journal-resources').textContent,cells:[...row.querySelectorAll('.journal-cell')].map(c=>({id:c.dataset.cellId,name:c.querySelector('h4').textContent,values:[...c.querySelectorAll('dd')].map(x=>x.textContent)}))};})()");
  const before=states[i],after=states[i+1],accepted=after.report,cell=after.cells.find(x=>x.id===accepted.cell);
  assert.equal(entry.choice,'Tide '+after.day+' · '+{gate:'Gate',shade:'Shade',seed:'Seed'}[accepted.action]+' · '+cell.name);
  assert.equal(entry.event,accepted.event.name);assert.equal(entry.note,accepted.event.note);assert.deepEqual(entry.lines,accepted.lines);
  assert.equal(entry.resources,'Freshwater: '+before.freshwater+' → '+after.freshwater+'. Seed packs: '+before.seedPacks+' → '+after.seedPacks+'.');
  for(const c of after.cells){const old=before.cells.find(x=>x.id===c.id),actual=entry.cells.find(x=>x.id===c.id);assert.equal(actual.name,c.name);assert.deepEqual(actual.values,[['depth','cm'],['salinity','ppt'],['oxygen','%'],['biomass','%'],['shade','/ 3']].map(([key,unit])=>old[key]+' → '+c[key]+' '+unit));}
  report.turns.push({day:after.day,accepted:accepted.action,cell:accepted.cell,snapshotMatches:true,journalMatches:true});
  if(i===2){
   await page.activate('[data-cell="0"]');
   const beforeReview=await page.gameWitness();await page.focus('#trend-tide');await page.press('Home');await page.press('ArrowRight');
   const partial=await page.gameWitness();assert.equal(partial.saved,beforeReview.saved);assert.equal(partial.writes,beforeReview.writes);assert.equal(partial.reviewTide,'1');assert.equal(JSON.parse(partial.saved).selected,'north');assert.equal(JSON.parse(JSON.parse(partial.saved).snapshot).report.cell,'south');
   report.partial=partial;report.screenshots.push(await page.screenshot('baseline-partial-journal.png','#watch-journal'));
   assert.equal(await page.evaluate("document.body.innerText.includes('Download watch report')"),false);
  }
 }
 const final=await page.gameWitness();assert.equal(JSON.parse(JSON.parse(final.saved).snapshot).finished,true);assert.equal(final.reviewTide,'1');assert.ok(final.recap.includes(states[14].outcome));
 report.completed=final;report.checks.push('All fourteen actual UI tides equal independent native WASM snapshots and complete journal values','Partial day-three accepted cell differs from current game selection; historical review spends no tide or saved write','Completed native outcome and original opening-to-final recap retained','Readable report control absent from real partial watch baseline');
 assert.deepEqual(browser.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.error=error.stack||String(error);console.error(report.error);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();report.pageErrors=browser.errors;report.requests=browser.requests;await browser.stop();await save();console.log(JSON.stringify({status:report.status,checks:report.checks.length,nativeTides:report.turns.length,out}));}
