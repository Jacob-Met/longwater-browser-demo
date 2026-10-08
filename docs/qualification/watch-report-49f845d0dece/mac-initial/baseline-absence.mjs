import {chromium} from "/Users/me/workspace/estate/production-evidence-49f845d0dece/browser-tools/node_modules/playwright/index.mjs";
import {readFile,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import assert from "node:assert/strict";
import {serve} from "/Users/me/workspace/estate/production-evidence-49f845d0dece/longwater-watch-report/tests/server.mjs";
import {initSync,BrowserSession} from "/Users/me/workspace/estate/production-evidence-49f845d0dece/longwater-watch-report/pkg/longwater_web.js";
const out="/Users/me/workspace/estate/production-evidence-49f845d0dece/longwater-watch-report-receiving";
const source="/Users/me/workspace/estate/production-evidence-49f845d0dece/longwater-watch-report";
const sha=b=>createHash("sha256").update(b).digest("hex");
initSync({module:await readFile(source+"/pkg/longwater_web_bg.wasm")});
const server=await serve();let browser;const sim=new BrowserSession();
try{
 browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 const ctx=await browser.newContext();const page=await ctx.newPage();await ctx.route("**/*",r=>new URL(r.request().url()).origin===server.url?r.continue():r.abort());
 await page.goto(server.url);await page.locator("#watch-journal").waitFor({state:"visible"});
 const opening=JSON.parse(sim.snapshot_json());await page.locator('[data-cell="0"]').click();await page.locator('[data-action="gate"]').click();
 const after=JSON.parse(sim.take_turn("gate",opening.cells[0].id));assert.equal(await page.locator("#journal-entries > li").count(),1);
 assert.deepEqual(await page.locator(".journal-notes > li").allTextContents(),after.report.lines);
 const present=await page.getByRole("button",{name:"Download watch report",exact:true}).count();
 const receipt={head:execFileSync("git",["rev-parse","HEAD"],{cwd:source,encoding:"utf8"}).trim(),receiver_sha256:sha(await readFile(new URL(import.meta.url))),browser:browser.version(),opening,after,control:"actual bundled WASM and browser agree on accepted first tide",required_report_control_present:present===1,observation:"Existing whole-game download and journal are present; no readable watch-report action exists",storage:await page.evaluate(()=>({...localStorage})),source_sha256:{}};
 for(const p of ["journal.js","game.js","scripts/package.mjs","pkg/longwater_web_bg.wasm"])receipt.source_sha256[p]=sha(await readFile(source+"/"+p));
 await writeFile(out+"/baseline-absence.json",JSON.stringify(receipt,null,2)+"\n");
 console.log(JSON.stringify({head:receipt.head,browser:receipt.browser,native_first_tide:true,required_report_control_present:receipt.required_report_control_present}));
 await ctx.close();
}finally{sim.free();if(browser)await browser.close();await server.close();}
