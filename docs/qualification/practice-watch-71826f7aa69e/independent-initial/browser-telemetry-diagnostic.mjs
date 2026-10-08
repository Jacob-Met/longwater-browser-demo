import { chromium } from "/Users/me/workspace/estate/production-evidence-49f845d0dece/browser-tools/node_modules/playwright/index.mjs";
import { serve } from "/Users/me/hamon-longwater-practice-71826f7aa69e/source/tests/server.mjs";
import { writeFile } from "node:fs/promises";
const server=await serve();
const browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
const context=await browser.newContext();
const page=await context.newPage();
const result={schema:"longwater-independent-browser-telemetry-diagnostic/1",reset_focus:[],practice_focus:[],console_events:[]};
page.on("console",m=>{if(m.text().startsWith("COORD_HIDE"))result.console_events.push(m.text());});
try{
 await page.goto(server.url+"/");
 await page.waitForFunction(()=>!document.querySelector("#practice-open").disabled);
 await page.locator("#reset-control").click();
 for(let i=0;i<6;i++){await page.keyboard.press("Tab");result.reset_focus.push(await page.evaluate(()=>({id:document.activeElement.id,tag:document.activeElement.tagName,has_focus:document.hasFocus(),inside:!!document.activeElement.closest("#new-watch-review"),background_game:!!document.activeElement.closest("#playfield")})));}
 await page.keyboard.press("Escape");
 await page.locator("#practice-open").click();
 for(let i=0;i<18;i++){await page.keyboard.press("Tab");result.practice_focus.push(await page.evaluate(()=>({id:document.activeElement.id,tag:document.activeElement.tagName,has_focus:document.hasFocus(),inside:!!document.activeElement.closest("#practice-watch"),background_game:!!document.activeElement.closest("#playfield")})));}
 await page.evaluate(()=>{window.addEventListener("pagehide",e=>{const row={event:"pagehide",persisted:e.persisted,practice_open:document.querySelector("#practice-watch").open};sessionStorage.setItem("coord-lifecycle-diagnostic",JSON.stringify(row));console.info("COORD_HIDE "+JSON.stringify(row));});});
 await page.route(server.url+"/review-next.html",r=>r.fulfill({status:200,contentType:"text/html",body:"<!doctype html><title>Independent lifecycle destination</title>"}));
 await page.goto(server.url+"/review-next.html");
 result.durable_navigation_event=await page.evaluate(()=>JSON.parse(sessionStorage.getItem("coord-lifecycle-diagnostic")));
 result.same_origin_destination=page.url();
}finally{await context.close();await browser.close();await server.close();}
await writeFile("/Users/me/hamon-longwater-practice-review-71826f7aa69e/results/browser-telemetry-diagnostic.json",JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify(result));
