import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {execFileSync,spawnSync} from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath,pathToFileURL} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const area=path.join(root,"docs/receiving/watch-rewind-7a9310dad255/hosted");
const artifact=path.join(root,"test-results/watch-rewind-independent");
const expectedInputs={
  "receive-current.mjs.source": {
    "bytes": 37548,
    "sha256": "b0de3b5104a10c0e456b041fa7b242a6d0196b1391c91a10be9fc81a543e64cc",
    "sha": "c207e6838b30fe78441fe2c44e100317411f0a6f"
  },
  "fixtures.json": {
    "bytes": 35126,
    "sha256": "c9521569705e88ee893e66a5ac27099ef2e491d99da727b6a454627b65a8639b",
    "sha": "5670cc3246359f8665cc8c4a7c6bd3dfd83a8550"
  },
  "fixtures/foreignThree.json": {
    "bytes": 1615,
    "sha256": "d451c3dcd660157de77a18af5ef499f9c52e1b37bdac986dfc97426384ad5445",
    "sha": "9328ef22ef4390bb0e133e184748d52001cfd5a7"
  },
  "BROWSER-CONTRACT.md": {
    "bytes": 8749,
    "sha256": "f246dc040f47e418424446adc81cee1eaaa885b6ffeab7afe7182626967bd9f2",
    "sha": "fd2fc0c8e3f00767d05a4acf0b41f031b44475be"
  },
  "COMPATIBILITY-CONTRACT.md": {
    "bytes": 2473,
    "sha256": "1cffef72979b941fe7753500fd162244e3801e7e92f09a7a1388ff97a3b024c4",
    "sha": "d513ae865bf2cbaae53a550fa00780b802f7e184"
  },
  "source-manifest.json": {
    "bytes": 7616,
    "sha256": "c0ec74e6b7b6d815de08702fffe9d375d22fafff7c42b766a3cbb7741d772c5b",
    "sha": "4804dae0398971a8f4f50b149ab5209f3872af65"
  }
};
const expectedCases=[
  "R1_pending_file_escape_and_real_adoption",
  "R2_confirm_readers_files_download_reload",
  "R3_completed_rewind_reload_new_continuation",
  "R4_first_tide_to_selected_opening",
  "R5_protected_unsupported_store",
  "R6_write_refusal_then_real_retry",
  "R7_unreadable_foreign_store_recovery",
  "R8_unobserved_same_document_foreign_write",
  "R9_observed_actual_other_tab_write",
  "R10_accepted_adoption_display_refusal",
  "R11_phone_direct_open_standalone",
  "P1_practice_preserves_pending_file_review",
  "P2_rewind_modal_then_offline_practice",
  "R12_binding_cleanup"
];
const expectedCaseBlock="8dbc55cbc6f8fb5b46acf6085adde3b7ae42a6f96afdf634d4cea5858b98e50a";
const digest=raw=>createHash("sha256").update(raw).digest("hex");
const blob=raw=>createHash("sha1").update("blob "+raw.length+"\0").update(raw).digest("hex");
const pin=raw=>({bytes:raw.length,sha:blob(raw),sha256:digest(raw)});
const git=args=>execFileSync("git",["--no-optional-locks","-C",root,...args],{maxBuffer:2*1024*1024});
const inputs=new Map();
for(const [name,expected] of Object.entries(expectedInputs)){
  const raw=await fs.readFile(path.join(area,name));
  assert.deepEqual(pin(raw),expected,"frozen receiving input: "+name);
  inputs.set(name,raw);
}
const adapterBefore=await fs.readFile(fileURLToPath(import.meta.url));
const sourceManifest=JSON.parse(inputs.get("source-manifest.json"));
assert.equal(sourceManifest.files.length,28);
assert.equal(new Set(sourceManifest.files.map(row=>row.path)).size,28);
assert.equal(sourceManifest.files.filter(row=>row.runtime_input).length,22);
const head=git(["rev-parse","HEAD"]).toString().trim();
const tree=git(["rev-parse","HEAD^{tree}"]).toString().trim();
async function admitSource(){
  for(const row of sourceManifest.files){
    const raw=await fs.readFile(path.join(root,row.path));
    assert.deepEqual(pin(raw),{bytes:row.bytes,sha:row.sha,sha256:row.sha256},"checked-out source: "+row.path);
    assert.ok(raw.equals(git(["show",head+":"+row.path])),"working bytes equal actual checkout: "+row.path);
    assert.equal(git(["ls-tree",head,"--",row.path]).toString().split(" ")[0],row.mode,"Git mode: "+row.path);
  }
}
await admitSource();
const {chromium}=await import(pathToFileURL(path.join(root,"node_modules/playwright/index.mjs")));
const chrome=chromium.executablePath();
assert.ok((await fs.stat(chrome)).isFile(),"installed Playwright Chromium is an ordinary file");
const witness=inputs.get("receive-current.mjs.source").toString("utf8");
const marker='  if(mode==="baseline"){';
assert.equal(witness.split(marker).length,2);
const caseBlock=witness.slice(witness.indexOf(marker));
assert.equal(digest(Buffer.from(caseBlock)),expectedCaseBlock,"complete frozen cases/cleanup");
let adapted=witness;
const substitutions=[];
function once(before,after){
  assert.equal(adapted.split(before).length,2,"one bootstrap substitution: "+before);
  adapted=adapted.replace(before,()=>after);substitutions.push({before,after});
}
once('const chrome="/snap/bin/chromium";',"const chrome="+JSON.stringify(chrome)+";");
once('version=execFileSync(chrome,["--version"],{encoding:"utf8",timeout:15000}).trim();',
     'version=execFileSync(chrome,["--version"],{encoding:"utf8",timeout:60000}).trim();');
once('browser=spawn(chrome,["--headless=new",',
     'browser=spawn(chrome,["--headless=new","--no-sandbox",');
once('chromeStderr.slice(-2000))),15000);browser.once',
     'chromeStderr.slice(-2000))),60000);browser.once');
assert.equal(adapted.slice(adapted.indexOf(marker)),caseBlock);
let inverse=adapted;
for(const {before,after} of [...substitutions].reverse()){
  assert.equal(inverse.split(after).length,2);inverse=inverse.replace(after,()=>before);
}
assert.equal(inverse,witness,"all helpers, cases and expectations invert byte-exact");
await fs.mkdir(path.dirname(artifact),{recursive:true});
await fs.mkdir(artifact,{recursive:false});
const own=await fs.mkdtemp(path.join(tmpdir(),"longwater-rewind-receiving-"));
const executed=path.join(own,"receive-current.mjs");
const manifest={...sourceManifest,head,tree,source_root:root};
let execution,receipt=null,runError=null,sourceUnchanged=false,inputsUnchanged=false,ownRemoved=false;
try{
  await fs.mkdir(path.join(own,"fixtures"));
  for(const name of ["fixtures.json","BROWSER-CONTRACT.md","fixtures/foreignThree.json"])
    await fs.writeFile(path.join(own,name),inputs.get(name));
  await fs.writeFile(executed,adapted);
  await fs.writeFile(path.join(artifact,"executed-receiver.mjs"),adapted);
  const manifestPath=path.join(artifact,"actual-source-manifest.json");
  await fs.writeFile(manifestPath,JSON.stringify(manifest,null,2)+"\n");
  await fs.writeFile(path.join(artifact,"admission.json"),JSON.stringify({
    head,tree,sourceFiles:28,runtimeFiles:22,
    frozenInputs:expectedInputs,adapter:pin(adapterBefore),executedReceiver:pin(Buffer.from(adapted)),
    semanticCaseBlockSha256:expectedCaseBlock,exactInverse:true,substitutions,
    sourceManifest:pin(await fs.readFile(manifestPath)),chrome,
    boundary:"Actual checked-out Git bytes; environment/bootstrap changes only. Earlier native current attempts remain incomplete."
  },null,2)+"\n");
  execution=spawnSync(process.execPath,[executed,root,manifestPath,path.join(artifact,"actual-browser"),"candidate"],{
    cwd:root,env:process.env,encoding:null,maxBuffer:1024*1024,timeout:300_000,
    detached:process.platform!=="win32",killSignal:"SIGTERM"
  });
  if(execution.error&&execution.pid&&process.platform!=="win32"){
    // Only the receiving child's own process group; descendants share it.
    try{process.kill(-execution.pid,"SIGTERM");}catch(error){if(error.code!=="ESRCH")throw error;}
  }
  await fs.writeFile(path.join(artifact,"stdout.log"),execution.stdout||Buffer.alloc(0));
  await fs.writeFile(path.join(artifact,"stderr.log"),execution.stderr||Buffer.alloc(0));
  try{receipt=JSON.parse(await fs.readFile(path.join(artifact,"actual-browser/receipt.json"),"utf8"));}
  catch(error){runError="Missing or unreadable actual browser receipt: "+String(error);}
  if(execution.error)runError=String(execution.error);
  await admitSource();sourceUnchanged=true;
  for(const [name,raw] of inputs)assert.ok(raw.equals(await fs.readFile(path.join(area,name))),name);
  assert.ok(adapterBefore.equals(await fs.readFile(fileURLToPath(import.meta.url))));inputsUnchanged=true;
}catch(error){runError=error.stack||String(error);}
finally{
  await fs.rm(own,{recursive:true,force:true});ownRemoved=true;
  await fs.writeFile(path.join(artifact,"execution.json"),JSON.stringify({
    head,tree,node:process.version,exitStatus:execution?.status??null,signal:execution?.signal??null,
    error:runError,sourceUnchanged,inputsUnchanged,ownTemporaryDirectoryRemoved:ownRemoved,
    semanticCaseBlockSha256:expectedCaseBlock,adaptedReceiver:pin(Buffer.from(adapted)),
    receipt:receipt?pin(await fs.readFile(path.join(artifact,"actual-browser/receipt.json"))):null
  },null,2)+"\n");
}
console.log("LONGWATER_REWIND_RECEIVING_RESULT "+JSON.stringify({
  head,tree,passed:receipt?.checks?.filter(row=>row.passed).length??0,
  failed:receipt?.checks?.filter(row=>!row.passed).map(row=>row.name)??[],
  fatal:receipt?.fatal??runError,artifact:"test-results/watch-rewind-independent",
  semanticCaseBlockSha256:expectedCaseBlock,sourceUnchanged,inputsUnchanged
}));
assert.equal(runError,null,"receiving execution/retention");
assert.equal(execution.signal,null,"receiving child completed normally");
assert.equal(execution.status,0,"actual frozen browser receiver exit");
assert.equal(receipt.fatal,null);
assert.deepEqual(receipt.checks.map(row=>row.name),expectedCases,"all fourteen frozen groups ran");
assert.ok(receipt.checks.every(row=>row.passed),"all fourteen groups passed");
assert.deepEqual(receipt.exceptions,[]);
assert.equal(receipt.cleanup.ownProfileRemoved,true);
assert.equal(receipt.cleanup.ownServerClosed,true);
assert.equal(sourceUnchanged,true);
assert.equal(inputsUnchanged,true);
