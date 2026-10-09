import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
const owner = path.dirname(root);
const source = path.join(root, "source");
const result = path.join(root, "result");
fs.mkdirSync(result); // Exclusive before any product child starts; never removed.
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
const read = p => fs.readFileSync(p);
const json = p => JSON.parse(read(p).toString("utf8"));
const write = (p,v) => fs.writeFileSync(p, JSON.stringify(v,null,2)+"\n",{flag:"wx"});
const identity = p => {
  const s=fs.lstatSync(p,{bigint:true});
  return {sha256:sha(read(p)),bytes:Number(s.size),inode:String(s.ino),device:String(s.dev),mtime_ns:String(s.mtimeNs),mode:String(s.mode)};
};
const equal = (a,b) => JSON.stringify(a)===JSON.stringify(b);
const expected=json(path.join(root,"expectations.json"));
const manifest=json(path.join(root,"source-before.json"));
const selected=path.join(owner,"fixtures",expected.input_name);
const output=path.join(result,"output","source-transition-handoff.html");
fs.mkdirSync(path.dirname(output));
const marker=path.join(path.dirname(output),".longwater-watch-independent-owner-sentinel");
fs.mkdirSync(marker);
const keep=path.join(marker,"keep.txt");
fs.writeFileSync(keep,"Private unrelated owner sentinel; preserve exactly.\n",{flag:"wx"});
const before={input:identity(selected),owner:identity(keep)};
const sourceBefore=manifest.map(row=>({path:row.path,...identity(path.join(source,row.path))}));
const command=[process.execPath,path.join(source,"scripts/package-watch.mjs"),selected,"--output",output];
const started=new Date().toISOString();
const startedMs=Date.now();
const child=spawnSync(command[0],command.slice(1),{cwd:source,encoding:null,timeout:45000,maxBuffer:2*1024*1024});
fs.writeFileSync(path.join(result,"stdout"),child.stdout??Buffer.alloc(0),{flag:"wx"});
fs.writeFileSync(path.join(result,"stderr"),child.stderr??Buffer.alloc(0),{flag:"wx"});
const sourceAfter=manifest.map(row=>({path:row.path,...identity(path.join(source,row.path))}));
const after={input:identity(selected),owner:identity(keep)};
const outputExists=fs.existsSync(output);
const mutationPath=path.join(source,"fixture-mutation.json");
const mutation=fs.existsSync(mutationPath)?json(mutationPath):null;
const savedOriginal=read(path.join(owner,"candidate/watch-save.js"));
const expectedMutated=Buffer.concat([savedOriginal,Buffer.from(expected.inert_marker)]);
const actualMutated=read(path.join(source,"watch-save.js"));
const unchanged = sourceBefore.filter(r=>r.path!=="watch-save.js").every(r=>equal(r,sourceAfter.find(v=>v.path===r.path)));
const checks=[];
const check=(name,pass,observed)=>checks.push({name,pass:!!pass,observed});
check("exact candidate and original inputs admitted before child",sourceBefore.every(r=>r.sha256===manifest.find(v=>v.path===r.path).sha256),sourceBefore);
check("actual child completed without timeout or signal",child.error===undefined&&child.signal===null,{status:child.status,signal:child.signal,error:child.error?.message??null});
check("fixture transition ran inside ordinary-packager child",mutation!==null&&mutation.before_sha256===expected.original_watch_sha256&&mutation.after_sha256===sha(expectedMutated),mutation);
check("private watch-save transition is exactly the inert comment",actualMutated.equals(expectedMutated),{before:sha(savedOriginal),after:sha(actualMutated),bytes:actualMutated.length});
check("unchanged original packager retained under same scripts directory",sha(read(path.join(source,"scripts/package-original.mjs")))===expected.original_packager_sha256,identity(path.join(source,"scripts/package-original.mjs")));
check("all other source files and both product additions preserved",unchanged,{before:sourceBefore,after:sourceAfter});
check("selected watch bytes and identity preserved",equal(before.input,after.input),{before:before.input,after:after.input});
check("unrelated owner sentinel bytes and identity preserved",equal(before.owner,after.owner),{before:before.owner,after:after.owner});
check("replay-to-package source divergence refuses without final artifact",child.status!==0&&!outputExists,{status:child.status,output_exists:outputExists});
const observations={publication:null};
if(outputExists){
  const bytes=read(output);
  const html=bytes.toString("utf8");
  const receipt=JSON.parse((child.stdout??Buffer.alloc(0)).toString("utf8").trim());
  const main=[...html.matchAll(/<script type="module" src="data:text\/javascript;base64,([^"]+)"><\/script>/g)];
  const mainBytes=main.length===1?Buffer.from(main[0][1],"base64"):null;
  const decoded=mainBytes?[...mainBytes.toString("utf8").matchAll(/data:text\/javascript;base64,([A-Za-z0-9+/=]+)/g)].map(m=>Buffer.from(m[1],"base64")):[];
  const matching=decoded.filter(b=>b.equals(expectedMutated));
  if(matching.length===1)fs.writeFileSync(path.join(result,"observed-embedded-watch-save.js"),matching[0],{flag:"wx"});
  const ordinary=json(path.join(owner,"original-receiving/ordinary-packager.stdout"));
  const h=crypto.createHash("sha256");
  for(const name of ordinary.inputs){h.update(name);h.update("\0");h.update(read(path.join(source,name)));h.update("\0");}
  const aggregate=h.digest("hex");
  observations.publication={
    file:output,bytes:bytes.length,sha256:sha(bytes),receipt,
    output_receipt_matches:receipt.bytes===bytes.length&&receipt.sha256===sha(bytes),
    main_module_count:main.length,exact_mutated_watch_save_occurrences:matching.length,
    expected_mutated_watch_sha256:sha(expectedMutated),
    independently_computed_packaged_source_sha256:aggregate,
    receipt_source_matches_mutated_closure:receipt.game.sourceSha256===aggregate,
    original_pretransition_source_sha256:ordinary.sourceSha256,
    source_receipt_changed:receipt.game.sourceSha256!==ordinary.sourceSha256,
    interpretation:"Comment-only source byte divergence. No changed simulation semantics claimed."
  };
}
const report={
  classification:"Independent pre-repair source-custody discriminator, separate from fixed-source 26/26 campaign",
  candidate_commit:expected.candidate_commit,driver_sha256:sha(read(fileURLToPath(import.meta.url))),
  command,started,duration_ms:Date.now()-startedMs,
  child:{status:child.status,signal:child.signal,error:child.error?.message??null,stdout_sha256:sha(child.stdout??Buffer.alloc(0)),stderr_sha256:sha(child.stderr??Buffer.alloc(0))},
  checks,passed:checks.filter(c=>c.pass).length,total:checks.length,observations,
  output_parent_entries:fs.readdirSync(path.dirname(output)).sort()
};
write(path.join(result,"report.json"),report);
console.log(JSON.stringify({passed:report.passed,total:report.total,child:report.child,publication:observations.publication,report_sha256:sha(read(path.join(result,"report.json")))}));
process.exitCode=checks.every(c=>c.pass)?0:2;
