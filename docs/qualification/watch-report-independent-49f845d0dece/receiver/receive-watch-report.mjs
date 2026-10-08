import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {NativeBrowser,waitFor,sha256} from './receiving-browser.mjs';
const args=process.argv.slice(2),arg=name=>args[args.indexOf(name)+1];
const source=resolve(arg('--root')),output=resolve(arg('--output')),manifestPath=resolve(arg('--manifest')),inputsPath=resolve(arg('--native-inputs'));
const browserPath=arg('--browser');
await mkdir(output,{recursive:true});
const inputBytes=await readFile(inputsPath);assert.equal(sha256(inputBytes),'2e5aef1f4269c17dc763796a6109c072c0a6a835b14f1b0012ba9bfb61670163');
const inputs=JSON.parse(inputBytes),states=inputs.snapshots.map(JSON.parse),manifest=JSON.parse(await readFile(manifestPath,'utf8'));
assert.equal(sha256(await readFile(join(source,'pkg/longwater_web_bg.wasm'))),inputs.wasmSha256);
const sourceBefore={};for(const file of manifest.files){const bytes=await readFile(join(source,file.path));assert.equal(sha256(bytes),file.sha256,file.path);sourceBefore[file.path]=sha256(bytes);}
const {initSync,BrowserSession}=await import(pathToFileURL(join(source,'pkg/longwater_web.js')));
initSync({module:await readFile(join(source,'pkg/longwater_web_bg.wasm'))});
const freshNative=new BrowserSession(),freshOpening=freshNative.snapshot_json(),freshAfter=freshNative.take_turn('shade','south');freshNative.free();
const resetStates=[JSON.parse(freshOpening),JSON.parse(freshAfter)];
assert.equal(freshOpening,inputs.snapshots[0]);
const report={status:'running',owner:'estate-49f845d0dece/recall_import_receiving',startedAt:new Date().toISOString(),candidateHead:manifest.candidateHead,candidateTree:manifest.candidateTree,base:manifest.base,source,contractCommit:'38bb955d94bbf1032890307f7c4d04f0cb08f9be',contractSha256:'797f75ea07859c0d3f54c8943d7bbaf8e16909ca58dfe24f27db3162d017c7da',nativeInputSha256:sha256(inputBytes),receiverSha256:sha256(await readFile(new URL(import.meta.url))),helperSha256:sha256(await readFile(new URL('./receiving-browser.mjs',import.meta.url))),node:process.version,sourceBefore,checks:[],entries:[],downloads:[],reportDocuments:[],screenshots:[],observedPreparationFailures:[],qualificationNotes:['Native print-media visibility is checked; root directed that no extra PDF or screenshot suite is needed when the two existing report captures cover the rendered values. No PDF is claimed.','The native game exposes no arbitrary player text field. Literal native Unicode and full notes are compared; no synthetic string is labeled an authentic watch.','WatchReport has no detached snapshot getter. Its internal collection is not treated as a public save/admission format; old/new actual reports and existing start/restore/record boundaries are exercised.']};
const save=()=>writeFile(join(output,'receiving-report.json'),JSON.stringify(report,null,2)+'\n');
const pass=async name=>{report.checks.push(name);console.log('PASS '+name);await save();};
const browser=new NativeBrowser({source,output,browser:browserPath});
let currentPage;
async function ready(page,day,{freshDocument=false}={}){
 await waitFor(()=>page.evaluate("!!document.querySelector('#watch-report-download') && !document.querySelector('#watch-journal').hidden && document.querySelector('#journal-count').textContent === "+JSON.stringify(day===0?'No tides yet':day+' of 14 tides'+(day===14?' · Watch closed':''))+(freshDocument?" && window.__receivingReloadMarker === undefined":"")),'game day '+day);
}
async function journal(page){if(!await page.evaluate("document.querySelector('#journal-details').open"))await page.activate('#journal-details > summary');}
async function reload(page,day){
 await page.evaluate("window.__receivingReloadMarker='previous-document'");
 await page.command('Page.reload',{ignoreCache:true});
 await ready(page,day,{freshDocument:true});await journal(page);
}
async function saveReport(page,name,expectedStates,opts={}){
 const before=await page.gameWitness(),download=await page.download('#watch-report-download',name+'.html'),after=await page.gameWitness();
 assert.deepEqual(after,before,'report export preserves exact native/saved/review state');
 assert.match(download.record.suggestedFilename,/^Longwater-watch-.*\.html$/);
 assert.ok((await page.text('#watch-report-status')).includes('download requested'));
 report.downloads.push({...download.record,entry:opts.entry,kind:'watch-report'});
 const received=await inspectReport(download.path,expectedStates,name,opts);
 return {...download,received};
}
const metrics=[['Depth','depth','cm'],['Salt','salinity','ppt'],['Oxygen','oxygen','%'],['Life','biomass','%'],['Canopy','shade','/ 3']];
const actionNames={gate:'Gate',shade:'Shade',seed:'Seed'};
function checkTable(actual,before,after,caption){
 assert.equal(actual.caption,caption);
 assert.deepEqual(actual.headers,['Cell',...metrics.map(([label,,unit])=>label+' ('+unit+')')].map(text=>({text,scope:'col'})));
 assert.deepEqual(actual.rows,after.cells.map(cell=>{const old=before?.cells.find(x=>x.id===cell.id);return {id:cell.id,name:cell.name,scope:'row',values:Object.fromEntries(metrics.map(([,key])=>[key,old?old[key]+' → '+cell[key]:String(cell[key])]))};}));
}
const expectedResources=(before,after)=>'Freshwater: '+(before?before.freshwater+' → '+after.freshwater:after.freshwater)+'. Seed packs: '+(before?before.seedPacks+' → '+after.seedPacks:after.seedPacks)+'.';
async function inspectReport(path,expectedStates,name,{width=1280,capture=false,print=false}={}){
 const url=pathToFileURL(path).href,page=await browser.page(url,{width,height:1000,javascript:false,offline:true,observeStorage:false});currentPage=page;
 const observed=await page.evaluate("(()=>{const table=root=>{const t=root.querySelector('table');return {caption:t.caption.textContent,headers:[...t.querySelectorAll('thead th')].map(x=>({text:x.textContent,scope:x.scope})),rows:[...t.querySelectorAll('tbody tr')].map(x=>({id:x.dataset.cellId,name:x.querySelector('th').textContent,scope:x.querySelector('th').scope,values:Object.fromEntries([...x.querySelectorAll('td')].map(x=>[x.dataset.reading,x.textContent]))}))};};const opening=document.querySelector('#report-opening'),overview=document.querySelector('#report-overview');return {title:document.title,heading:document.querySelector('h1')?.textContent,status:document.querySelector('#report-status')?.textContent,provenance:document.querySelector('.provenance')?.textContent,opening:{resources:opening.querySelector('.resources').textContent,table:table(opening)},overview:{heading:overview.querySelector('h2').textContent,resources:overview.querySelector('.resources').textContent,table:table(overview)},tides:[...document.querySelectorAll('.tide')].map(x=>({day:Number(x.dataset.tide),heading:x.querySelector('h2').textContent,event:x.querySelector('.event-name').textContent,note:x.querySelector('.event-note').textContent,lines:[...x.querySelectorAll('.notes li')].map(x=>x.textContent),resources:x.querySelector('.resources').textContent,table:table(x)})),scripts:document.scripts.length,gameControls:document.querySelectorAll('canvas,button,input,select,[data-action]').length,externalDependencies:[...document.querySelectorAll('[src],link[href],object[data],iframe')].map(x=>x.outerHTML),bodyText:document.body.innerText,layout:{width:innerWidth,documentWidth:document.documentElement.scrollWidth,tables:[...document.querySelectorAll('.table-wrap')].map(x=>({width:x.getBoundingClientRect().width,clientWidth:x.clientWidth,scrollWidth:x.scrollWidth,overflowX:getComputedStyle(x).overflowX}))}};})()");
 const first=expectedStates[0],last=expectedStates.at(-1);
 assert.equal(observed.title,'Longwater watch report');assert.equal(observed.heading,'Longwater watch report');
 assert.equal(observed.status,last.finished?'Watch closed · '+last.outcome:'Partial watch · '+last.day+' of 14 tides completed');
 assert.ok(observed.provenance.includes('Net changes include the action, the tide and dawn drift.'));
 assert.ok(observed.bodyText.includes('does not resume a watch'));
 assert.equal(observed.opening.resources,expectedResources(null,first));checkTable(observed.opening.table,null,first,'Before the first tide');
 assert.equal(observed.overview.heading,last.finished?'Opening → final readings':'Opening → current readings');
 assert.equal(observed.overview.resources,expectedResources(first,last));checkTable(observed.overview.table,first,last,last.finished?'Across the completed watch':'Across the completed tides so far');
 assert.equal(observed.tides.length,expectedStates.length-1);
 for(let index=1;index<expectedStates.length;index++){
  const before=expectedStates[index-1],after=expectedStates[index],native=after.report,actual=observed.tides[index-1],cell=after.cells.find(x=>x.id===native.cell);
  assert.equal(actual.day,after.day);assert.equal(actual.heading,'Tide '+after.day+' · '+actionNames[native.action]+' · '+cell.name);
  assert.equal(actual.event,native.event.name);assert.equal(actual.note,native.event.note);assert.deepEqual(actual.lines,native.lines);
  assert.equal(actual.resources,expectedResources(before,after));checkTable(actual.table,before,after,'Before → after tide '+after.day);
 }
 assert.equal(observed.scripts,0);assert.equal(observed.gameControls,0);assert.deepEqual(observed.externalDependencies,[]);
 assert.equal(observed.layout.documentWidth<=observed.layout.width,true,'report outer document does not clip or overflow');
 for(const table of observed.layout.tables){assert(table.width>0);assert.notEqual(table.overflowX,'hidden');}
 const ownRequests=browser.requests.filter(x=>x.sessionId===page.sessionId);
 assert.deepEqual(ownRequests.filter(x=>x.url!==url&&!x.url.startsWith('data:')),[],'direct report reads no neighboring resources');
 let printEvidence=null;
 if(print){
  await page.command('Emulation.setEmulatedMedia',{media:'print'});
  printEvidence=await page.evaluate("({tables:[...document.querySelectorAll('table')].map(x=>({visible:getComputedStyle(x).display!=='none'&&getComputedStyle(x).visibility!=='hidden',rows:x.rows.length,overflow:getComputedStyle(x.parentElement).overflowX})),sections:[...document.querySelectorAll('main > section')].map(x=>({id:x.id,tide:x.dataset.tide??null,visible:getComputedStyle(x).display!=='none'&&getComputedStyle(x).visibility!=='hidden'}))})");
  assert.equal(printEvidence.tables.length,expectedStates.length+1);assert.ok(printEvidence.tables.every(x=>x.visible&&x.rows===4&&x.overflow==='visible'));assert.ok(printEvidence.sections.every(x=>x.visible));
  await page.command('Emulation.setEmulatedMedia',{media:''});
 }
 if(capture)report.screenshots.push(await page.screenshot(name+'-'+(width<680?'phone':'desktop')+'.png'));
 const detail={name,path,url,width,day:last.day,finished:last.finished,outcome:last.outcome,scriptExecutionDisabled:true,networkDisabled:true,allNativeCellsResourcesAndFullNotesExact:true,acceptedCells:observed.tides.map(x=>x.heading),layout:observed.layout,printMedia:printEvidence,requestCount:ownRequests.length};
 report.reportDocuments.push(detail);await writeFile(join(output,name+'-observed.json'),JSON.stringify({detail,observed},null,2)+'\n');
 await page.close();currentPage=null;return detail;
}
async function exercise(name,url,{offline=false,width=1280}={}){
 const page=await browser.page(url,{width,height:1000,offline});currentPage=page;await ready(page,0);await journal(page);
 assert.equal(await page.evaluate("document.querySelector('#watch-report-download').disabled"),true);
 const entry={name,url,width,turns:[],partialReport:null,completedReport:null,resetReport:null};report.entries.push(entry);
 let partial;
 for(let index=0;index<inputs.turns.length;index++){
  const turn=inputs.turns[index];await page.activate('[data-cell="'+turn.index+'"]');await page.activate('[data-action="'+turn.action+'"]');await ready(page,index+1);
  const actual=JSON.parse((await page.gameWitness()).saved);assert.equal(actual.snapshot,inputs.snapshots[index+1]);assert.deepEqual(actual.turns,inputs.turns.slice(0,index+1).map(({action,cell})=>({action,cell})));
  entry.turns.push({day:index+1,action:turn.action,cell:turn.cell,snapshotMatchesFrozenNative:true});
  if(index===2){
   await page.activate('[data-cell="0"]');await page.focus('#trend-tide');await page.press('Home');await page.press('ArrowRight');
   const witness=await page.gameWitness();assert.equal(witness.reviewTide,'1');assert.equal(JSON.parse(witness.saved).selected,'north');assert.equal(JSON.parse(JSON.parse(witness.saved).snapshot).report.cell,'south');entry.partialWitness=witness;
   partial=await saveReport(page,name+'-partial',states.slice(0,4),{width,entry:name,capture:name==='modular'});entry.partialReport=partial.record;
   await pass(name+': actual three-tide report uses accepted South Reach provenance despite current North Bank selection and Tide 1 review; all values/notes exact and no mutation');
   const beforeFailure=await page.gameWitness(),beforeDownloads=browser.downloads.size;
   await page.evaluate("window.__receivingObjectUrl=URL.createObjectURL;URL.createObjectURL=()=>{throw new Error('independent report preparation failure');};");
   await page.activate('#watch-report-download');
   const failureStatus=await page.text('#watch-report-status');assert.match(failureStatus,/Could not prepare the report/);assert.equal(browser.downloads.size,beforeDownloads);assert.deepEqual(await page.gameWitness(),beforeFailure);
   await page.evaluate('URL.createObjectURL=window.__receivingObjectUrl;delete window.__receivingObjectUrl;');
   report.observedPreparationFailures.push({entry:name,status:failureStatus,noDownload:true,unchangedSavedNativeAndReview:true});
   await saveReport(page,name+'-retry',states.slice(0,4),{width,entry:name});
   await pass(name+': one controlled real Blob-URL preparation failure leaves the watch intact; retry produces an actual readable report');
   const savedBeforeReload=(await page.gameWitness()).saved;await reload(page,3);assert.equal((await page.gameWitness()).saved,savedBeforeReload);
   await page.focus('#trend-tide');await page.press('Home');await page.press('ArrowRight');
   await saveReport(page,name+'-resumed-partial',states.slice(0,4),{width,entry:name});
   await pass(name+': actual partial-watch reload restores original opening and all three native reports before export');
  }
 }
 await page.activate('[data-cell="2"]');
 assert.equal((await page.gameWitness()).reviewTide,'1');
 const completed=await saveReport(page,name+'-completed',states,{width,entry:name,capture:name==='packaged',print:true});entry.completedReport=completed.record;
 assert.equal(sha256(await readFile(partial.path)),partial.record.sha256);
 await inspectReport(partial.path,states.slice(0,4),name+'-old-partial-after-completion',{width});
 await pass(name+': all fourteen actual tides and resilient outcome export exactly; old partial bytes and reopened content remain stable; print tables stay visible');
 const completedSaved=(await page.gameWitness()).saved;await reload(page,14);assert.equal((await page.gameWitness()).saved,completedSaved);
 await saveReport(page,name+'-resumed-completed',states,{width,entry:name});
 await pass(name+': completed-watch replay exports all fourteen tides and the original opening/outcome');
 await page.activate('#reset-control');await ready(page,0);await journal(page);
 assert.equal(await page.evaluate("document.querySelector('#watch-report-download').disabled"),true);
 assert.equal(JSON.parse((await page.gameWitness()).saved).snapshot,inputs.snapshots[0]);
 await page.activate('[data-cell="2"]');await page.activate('[data-action="shade"]');await ready(page,1);
 assert.equal(JSON.parse((await page.gameWitness()).saved).snapshot,freshAfter);
 const resetReport=await saveReport(page,name+'-new-watch',resetStates,{width,entry:name});entry.resetReport=resetReport.record;
 assert.equal(sha256(await readFile(completed.path)),completed.record.sha256);
 await pass(name+': existing reset clears report collection; a fresh Shade/South Reach watch exports one true tide without prior history/outcome');
 let offlineGame;
 if(name==='modular'){
  const before=await page.gameWitness();offlineGame=await page.download('#offline-download','actual-downloaded-offline-game.html');assert.deepEqual(await page.gameWitness(),before);
  assert.equal(offlineGame.record.suggestedFilename,'Longwater-Fourteen-Tides.html');assert.deepEqual(offlineGame.bytes,await readFile(join(source,'downloads/Longwater-Fourteen-Tides.html')));
  report.downloads.push({...offlineGame.record,entry:name,kind:'offline-game'});await pass('actual modular offline-game download matches the frozen candidate artifact without changing the online watch');
 }
 await page.close();currentPage=null;return offlineGame;
}
await save();
try{
 const builds=[];
 for(const name of ['package-1.html','package-2.html']){
  const command=[join(source,'scripts/package.mjs'),join(output,name)],start=new Date().toISOString(),r=spawnSync(process.execPath,command,{cwd:source,encoding:'utf8'});
  const record={command:process.execPath,args:command,startedAt:start,finishedAt:new Date().toISOString(),status:r.status,stdout:r.stdout,stderr:r.stderr};builds.push(record);assert.equal(r.status,0,r.stderr);
 }
 const first=await readFile(join(output,'package-1.html'));assert.deepEqual(first,await readFile(join(output,'package-2.html')));assert.deepEqual(first,await readFile(join(source,'downloads/Longwater-Fourteen-Tides.html')));
 report.packaging={builds,bytes:first.length,sha256:sha256(first)};
 await pass('native repeated packager builds are deterministic and equal the frozen published offline artifact');
 await browser.start();report.browser=browser.version;
 const gameFile=await exercise('modular',browser.base+'/',{width:1280});
 await exercise('packaged',pathToFileURL(gameFile.path).href,{width:390,offline:true});
 assert.deepEqual(browser.errors,[]);
 const external=browser.requests.filter(x=>!x.url.startsWith(browser.base+'/')&&!x.url.startsWith('file:')&&!x.url.startsWith('data:')&&!x.url.startsWith('blob:'));assert.deepEqual(external,[]);
 report.externalRequests=external;report.sourceAfter={};
 for(const file of manifest.files)report.sourceAfter[file.path]=sha256(await readFile(join(source,file.path)));
 assert.deepEqual(report.sourceAfter,sourceBefore);
 await pass('both entrypoints finish with exact unchanged product source, no page exceptions and no hosted application requests');
 report.status='passed';
}catch(error){
 report.status='failed';report.error=error.stack||String(error);console.error(report.error);process.exitCode=1;
 if(currentPage)try{report.lastPage=await currentPage.evaluate("({url:location.href,title:document.title,ready:document.readyState,text:document.body.innerText.slice(0,14000)})");report.screenshots.push(await currentPage.screenshot('failed-state.png'));}catch{}
}finally{
 report.finishedAt=new Date().toISOString();report.pageErrors=browser.errors;report.requests=browser.requests;await browser.stop();await save();
 console.log(JSON.stringify({status:report.status,checks:report.checks.length,downloads:report.downloads.length,screenshots:report.screenshots,output}));
}
