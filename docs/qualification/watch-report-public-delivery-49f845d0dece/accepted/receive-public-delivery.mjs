import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const root = dirname(fileURLToPath(import.meta.url));
const contract = JSON.parse(await fs.readFile(join(root, "contract.json"), "utf8"));
process.env.TMPDIR = "/home/jacob/lw49pub-tmp3";
const require = createRequire("/dev/shm/lw49-report-author-49f845d0dece/package.json");
const { chromium } = require("playwright");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const blob = bytes => createHash("sha1").update(Buffer.from("blob " + bytes.length + "\0")).update(bytes).digest("hex");
const result = {owner: contract.owner, started_at: new Date().toISOString(), merge: contract.merge,
  tree: contract.tree, node: process.version, contract_sha256: sha(await fs.readFile(join(root, "contract.json"))),
  source_sha256: sha(await fs.readFile(fileURLToPath(import.meta.url))), served: [], groups: [], downloads: [],
  page_errors: [], page_requests: [], assertions: [], outcome: "running"};
let browser;
const check = (name, value) => {assert.equal(value, true, name); result.assertions.push(name);};
const expectedBytes = async (file, expected) => {
  const bytes = await fs.readFile(file);
  assert.equal(bytes.length, expected.bytes);
  assert.equal(sha(bytes), expected.sha256);
  return bytes;
};
const watch = async page => page.evaluate(() => ({
  saved: Object.entries(localStorage).sort(([a], [b]) => a.localeCompare(b)),
  summary: document.querySelector("#state-summary")?.textContent,
  selected: [...document.querySelectorAll("[data-cell]")].map(n => [n.dataset.cell, n.getAttribute("aria-pressed")]),
  journal: document.querySelector("#journal-entries")?.innerHTML,
  save_status: document.querySelector("#watch-save-status")?.textContent
}));
const collect = (page, label) => {
  page.on("pageerror", error => result.page_errors.push({page: label, message: error.message}));
  page.on("request", request => result.page_requests.push({page: label, url: request.url(), method: request.method()}));
};
const turn = async (page, action, cell, day) => {
  await page.locator('[data-cell="' + cell + '"]').click();
  await page.locator('[data-action="' + action + '"]').click();
  await page.locator("#journal-entries > li").nth(day - 1).waitFor({state: "attached"});
  assert.equal(await page.locator("#journal-entries > li").count(), day);
};
const download = async (page, selector, filename, expected, label) => {
  const before = await watch(page);
  const [item] = await Promise.all([page.waitForEvent("download"), page.locator(selector).click()]);
  assert.equal(await item.failure(), null);
  const output = join(root, "downloads", filename);
  await item.saveAs(output);
  const bytes = await expectedBytes(output, expected);
  assert.deepEqual(await watch(page), before, label + " preserves current game and saved witness");
  result.downloads.push({label,filename,suggested_filename:item.suggestedFilename(),url:item.url(),bytes:bytes.length,sha256:sha(bytes),git_blob:blob(bytes),saved_witness_unchanged:true});
  return output;
};
const staticReport = async (file, tides, label) => {
  const context = await browser.newContext({javaScriptEnabled: false, offline: true});
  try {
    const page = await context.newPage(); collect(page, label);
    const requested = []; page.on("request", request => requested.push(request.url()));
    await page.goto(pathToFileURL(file).href, {waitUntil:"load"});
    assert.equal(await page.locator("[data-tide]").count(), tides);
    assert.equal(await page.locator("script,iframe,form,img,link,object").count(), 0);
    assert.deepEqual(requested, [pathToFileURL(file).href]);
    result.groups.push({name:label,outcome:"pass",tides,status:await page.locator("#report-status").textContent(),requests:requested,javaScriptEnabled:false,offline:true});
  } finally { await context.close(); }
};

try {
  const oracle = await fs.readFile(contract.expected.oracle.file);
  assert.equal(sha(oracle), contract.expected.oracle.sha256);
  const peerPartial = await expectedBytes(contract.expected.partial.file, contract.expected.partial);
  result.oracle_sha256 = sha(oracle);
  const fetched = await Promise.allSettled(contract.files.map(async pin => {
    const url = new URL(pin.path === "index.html" ? "./" : pin.path, contract.base_url).href;
    const response = await fetch(url, {signal:AbortSignal.timeout(20000),cache:"no-store"});
    const bytes = Buffer.from(await response.arrayBuffer());
    const receipt = {path:pin.path,url,response_url:response.url,status:response.status,bytes:bytes.length,
      sha256:sha(bytes),git_blob:blob(bytes),expected_git_blob:pin.git_blob,
      last_modified:response.headers.get("last-modified"),content_type:response.headers.get("content-type")};
    result.served.push(receipt);
    assert.equal(response.status,200,url);
    assert.equal(response.url,url);
    assert.equal(receipt.git_blob,pin.git_blob,"public source " + pin.path);
    const destination=join(root,"public-files",pin.path);await fs.mkdir(dirname(destination),{recursive:true});await fs.writeFile(destination,bytes,{flag:"wx"});
    return receipt;
  }));
  const failed = fetched.filter(x => x.status === "rejected");
  if (failed.length) throw new AggregateError(failed.map(x=>x.reason),"Public bytes did not match qualified merge");
  result.groups.push({name:"public runtime and downloadable artifact",outcome:"pass",files:contract.files.length});
  browser = await chromium.launch({headless:true, executablePath:"/home/jacob/.cache/puppeteer/chrome/linux-154.0.8037.57/chrome-linux64/chrome",downloadsPath:join(root,"tmp"),timeout:30000});
  result.browser = await browser.version();
  const online = await browser.newContext({acceptDownloads:true,viewport:{width:1280,height:900}});
  let actualOffline;
  try {
    const page = await online.newPage(); collect(page,"public-game");
    await page.goto(contract.base_url,{waitUntil:"networkidle",timeout:30000});
    await page.locator("#watch-journal").waitFor({state:"visible"});
    assert.equal(await page.locator("#watch-report-download").isDisabled(),true);
    await turn(page,"gate",0,1);await turn(page,"shade",1,2);await turn(page,"seed",2,3);
    await page.locator('[data-cell="0"]').click();
    const partial = await download(page,"#watch-report-download","public-three-tide-report.html",contract.expected.partial,"public partial report");
    assert.deepEqual(await fs.readFile(partial),peerPartial);
    actualOffline = await download(page,"#offline-download","Longwater-Fourteen-Tides.html",contract.expected.offline,"public offline game");
    result.groups.push({name:"actual public game and two browser downloads",outcome:"pass",accepted_actions:["Gate/North Bank","Shade/Heart Pool","Seed/South Reach"],selected_cell:"North Bank",report_matches_independent_file:true});
    await staticReport(partial,3,"public partial report direct-open");
  } finally {await online.close();}
  const offline = await browser.newContext({acceptDownloads:true,offline:true,viewport:{width:390,height:844}});
  try {
    const page = await offline.newPage();collect(page,"downloaded-offline-game");
    await page.goto(pathToFileURL(actualOffline).href,{waitUntil:"load",timeout:30000});
    await page.locator("#watch-journal").waitFor({state:"visible"});
    assert.equal(await page.locator("#watch-report-download").isDisabled(),true);
    await turn(page,"shade",2,1);
    const fresh = await download(page,"#watch-report-download","offline-one-tide-report.html",contract.expected.fresh,"public artifact offline report");
    result.groups.push({name:"actual public download plays offline",outcome:"pass",accepted_action:"Shade/South Reach",offline:true});
    await staticReport(fresh,1,"offline new-watch report direct-open");
  } finally {await offline.close();}
  check("no page exceptions",result.page_errors.length===0);
  check("no HTTP requests from either direct-open report or offline game",result.page_requests.filter(x=>x.page!=="public-game").every(x=>!/^https?:/.test(x.url)));
  result.outcome="pass";
} catch(error) {
  result.outcome="fail";
  result.error={name:error.name,message:error.message,stack:error.stack,errors:error.errors?.map(e=>({name:e.name,message:e.message,stack:e.stack}))};
  process.exitCode=1;
} finally {
  if(browser) await browser.close().catch(error=>{result.close_error=String(error);result.outcome="fail";process.exitCode=1;});
  result.finished_at=new Date().toISOString();
  result.served.sort((a,b)=>a.path.localeCompare(b.path));
  await fs.writeFile(join(root,"receipt.json"),JSON.stringify(result,null,2)+"\n",{flag:"wx"});
  console.log(JSON.stringify({outcome:result.outcome,groups:result.groups,downloads:result.downloads.map(({label,bytes,sha256})=>({label,bytes,sha256})),served:result.served.length,page_errors:result.page_errors,error:result.error}));
}
