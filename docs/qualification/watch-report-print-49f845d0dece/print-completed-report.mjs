import assert from 'node:assert/strict';
import {readFile,writeFile,copyFile,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {NativeBrowser} from './native-browser-reused.mjs';

const root=resolve(import.meta.dirname);
const sourcePath=process.argv[2], expectedHtmlSha=process.argv[3];
assert.ok(sourcePath&&/^[0-9a-f]{64}$/.test(expectedHtmlSha),'Usage: node print-completed-report.mjs ACTUAL_HTML EXPECTED_SHA256');
const sha=b=>createHash('sha256').update(b).digest('hex');
const modulePath='/dev/shm/lw49-report-author-49f845d0dece/watch-report.js';
const expectedModuleSha='1d44bd246fed7b4d8e710829162f457b6edbad9f4cb9f0f23bb0a6492cf27a25';
const expectedOracleSha='2e5aef1f4269c17dc763796a6109c072c0a6a835b14f1b0012ba9bfb61670163';
const expectedHelperSha='afdb405bedd25272f21166359f60ee0047ceaf7e0b3e58f63d62feeae5acf492';
const startedAt=new Date().toISOString();
const html=await readFile(sourcePath);
assert.equal(sha(html),expectedHtmlSha,'Actual peer-downloaded HTML custody');
assert.equal(sha(await readFile(modulePath)),expectedModuleSha,'Final report module source pin');
assert.equal(sha(await readFile(join(root,'native-inputs.json'))),expectedOracleSha,'Independent native expected states');
assert.equal(sha(await readFile(join(root,'native-browser-reused.mjs'))),expectedHelperSha,'Unchanged reused native CDP helper');
await writeFile(join(root,'completed-report.html'),html,{flag:'wx'});
const browser=new NativeBrowser({source:root,output:join(root,'browser'),browser:'/home/jacob/.cache/puppeteer/chrome/linux-154.0.8037.57/chrome-linux64/chrome'});
const params={landscape:false,displayHeaderFooter:false,printBackground:true,scale:1,paperWidth:210/25.4,paperHeight:297/25.4,marginTop:10/25.4,marginBottom:10/25.4,marginLeft:10/25.4,marginRight:10/25.4,preferCSSPageSize:false,transferMode:'ReturnAsBase64'};
let receipt={startedAt,sourceHead:'260d00a902cb5ab6e5e7cad1a909dbd609842b1c',runtimeHead:'0df34ae888c6ca9655ef93f6ca4c03fce477f3a4',module:{path:modulePath,sha256:expectedModuleSha},nativeOracle:{sha256:expectedOracleSha},html:{originalPath:sourcePath,path:'completed-report.html',bytes:html.length,sha256:sha(html)},reusedHelper:{sha256:expectedHelperSha},node:process.version,printCommand:'Page.printToPDF',parameters:params};
try{
 await browser.start();
 const url=pathToFileURL(join(root,'completed-report.html')).href;
 const page=await browser.page(url,{javascript:false,offline:true,observeStorage:false,width:1280,height:1000});
 await page.command('Emulation.setEmulatedMedia',{media:'print'});
 const printLayout=await page.evaluate("({media:matchMedia('print').matches,tables:document.querySelectorAll('table').length,minWidths:[...new Set([...document.querySelectorAll('table')].map(x=>getComputedStyle(x).minWidth))],headers:[...new Set([...document.querySelectorAll('thead')].map(x=>getComputedStyle(x).display))],scripts:document.scripts.length,images:document.images.length})");
 assert.equal(printLayout.media,true);
 assert.deepEqual(printLayout.minWidths,['0px']);
 assert.deepEqual(printLayout.headers,['table-header-group']);
 const result=await page.command('Page.printToPDF',params);
 const pdf=Buffer.from(result.data,'base64');
 assert.ok(pdf.subarray(0,5).equals(Buffer.from('%PDF-')),'Chrome generated actual PDF');
 await writeFile(join(root,'completed-report.pdf'),pdf,{flag:'wx'});
 receipt={...receipt,browser:browser.version,printLayout,pdf:{path:'completed-report.pdf',bytes:pdf.length,sha256:sha(pdf)},requests:browser.requests};
 assert.ok(browser.requests.every(r=>r.url===url),'Report made no external request');
 assert.equal(browser.errors.length,0);
 assert.equal(sha(await readFile(sourcePath)),expectedHtmlSha,'Original HTML unchanged by printing');
 assert.equal(sha(await readFile(modulePath)),expectedModuleSha,'Source unchanged by receiving');
 receipt.status='printed';
}catch(error){receipt.status='failed';receipt.error=error.stack;process.exitCode=1;}
finally{
 await browser.stop();
 receipt.completedAt=new Date().toISOString();
 await writeFile(join(root,'print-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify(receipt));
}
