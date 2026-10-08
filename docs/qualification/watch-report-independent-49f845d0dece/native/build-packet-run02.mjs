import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,copyFile,readdir,lstat} from 'node:fs/promises';
import {join,dirname,relative} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const pub='/dev/shm/lw49-report-public-49f845d0dece',source='/dev/shm/lw49-report-receiver-49f845d0dece',old='/tmp/lw49-report-49f845d0dece',prefix='docs/qualification/watch-report-independent-49f845d0dece',packet=join(pub,prefix);
const excludedTransientBrowserDirs=new Set();
const hash=(b,a='sha256')=>createHash(a).update(b).digest('hex'),meta=(path,b)=>({path,bytes:b.length,sha256:hash(b),gitBlobSha1:hash(Buffer.concat([Buffer.from('blob '+b.length+'\0'),b]),'sha1')});
await mkdir(packet,{recursive:true});await mkdir(join(packet,'native'),{recursive:true});
async function walk(root,base=root){const out=[];for(const d of(await readdir(root,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const p=join(root,d.name);if(d.isDirectory()&&/^org\.chromium\.Chromium\./.test(d.name)){excludedTransientBrowserDirs.add(p);continue;}if(d.isDirectory())out.push(...await walk(p,base));else{assert.ok(d.isFile(),'only regular owned evidence '+p);out.push(meta(relative(base,p),await readFile(p)));}}return out;}
const archives=[{root:old,name:'lw49-report-49f845d0dece'},{root:source,name:'lw49-report-receiver-49f845d0dece'}],before=[];
for(const a of archives)before.push({root:a.root,name:a.name,files:await walk(a.root)});
const archive=join(packet,'native/native-history.tar.gz'),args=['--exclude=*/org.chromium.Chromium.*','--sort=name','--owner=0','--group=0','--numeric-owner','-czf',archive,'-C','/tmp',archives[0].name,'-C','/dev/shm',archives[1].name],startedAt=new Date().toISOString();
execFileSync('tar',args,{encoding:'utf8'});assert.equal(execFileSync('tar',['-tzf',archive],{encoding:'utf8'}).includes('/org.chromium.Chromium.'),false,'transient browser locks excluded');
for(let i=0;i<archives.length;i++)assert.deepEqual(await walk(archives[i].root),before[i].files,'source evidence unchanged during archive');
const verifyRoot=join(pub,'archive-verification');await mkdir(verifyRoot,{recursive:true});execFileSync('tar',['-xzf',archive,'-C',verifyRoot],{encoding:'utf8'});
for(let i=0;i<archives.length;i++)assert.deepEqual(await walk(join(verifyRoot,archives[i].name)),before[i].files,'all extracted archived bytes exact');
const archiveMeta=meta('native/native-history.tar.gz',await readFile(archive)),archiveReceipt={owner:'estate-49f845d0dece/recall_import_receiving',startedAt,finishedAt:new Date().toISOString(),status:'passed',command:'tar',args,archive:archiveMeta,allArchivedFilesVerifiedAfterExtraction:true,excludedTransientBrowserDirectories:[...excludedTransientBrowserDirs],exclusionReason:'Owned Chromium runtime IPC/lock directories are left in place but excluded from the reproducible receiving archive. All input/source/result/log/download/receiver files are retained.',files:before};
await writeFile(join(packet,'native/archive-receipt.json'),JSON.stringify(archiveReceipt,null,2)+'\n');
const mappings=[
['composed/public-source-correspondence.json',join(pub,'public-source-correspondence.json')],
['failures/initial-archive.stderr.log',join(pub,'build-packet.stderr.log')],
['native/build-packet.mjs',join(pub,'build-packet.mjs')],
['native/build-packet-run02.mjs',join(pub,'build-packet-run02.mjs')],
['README.md',join(pub,'README-content.md')],
['receiver/receive-watch-report.mjs',join(source,'receive-watch-report.mjs')],
['receiver/receiving-browser.mjs',join(source,'receiving-browser.mjs')],
['receiver/receive-watch-report-composed.mjs',join(source,'receive-watch-report-composed.mjs')],
['receiver/composition-adapter.md',join(source,'composition-adapter.md')],
['receiver/composition-adapter-freeze.json',join(source,'evidence/composition-adapter-freeze.json')],
['receiver/check-composition-correspondence.mjs',join(source,'check-composition-correspondence.mjs')],
['composed/source-freeze.json',join(source,'evidence/candidate-a8030e2-author-freeze.json')],
['composed/composition-correspondence.json',join(source,'evidence/composition-correspondence.json')],
['coordination-receipt.json',join(source,'evidence/coordination-receipt.json')],
['failures/initial-source-custody.stderr.log',join(source,'evidence/stage-final.stderr.log')]
];
for(const [tag,root] of [['a67b893',old],['260d00a',source],['a8030e2',source]]){
 mappings.push(['runs/'+tag+'/source-receipt.json',join(root,'evidence/candidate-'+tag+'-receipt.json')]);
 mappings.push(['runs/'+tag+'/receiving-report.json',join(root,'evidence/receiving-'+tag+'-run-01/receiving-report.json')]);
 mappings.push(['runs/'+tag+'/process-receipt.json',join(root,'evidence/'+tag+'-process-receipt.json')]);
 mappings.push(['runs/'+tag+'/receiving.stdout.log',join(root,'evidence/'+tag+'-receiving.stdout.log')]);
 mappings.push(['runs/'+tag+'/receiving.stderr.log',join(root,'evidence/'+tag+'-receiving.stderr.log')]);
}
const current=join(source,'evidence/receiving-a8030e2-run-01');
for(const [target,name] of [['reports/partial-three-tides.html','packaged-partial.html'],['reports/completed-fourteen-tides.html','packaged-completed.html'],['reports/new-watch-one-tide.html','packaged-new-watch.html'],['reports/actual-downloaded-offline-game.html','actual-downloaded-offline-game.html'],['reports/partial-observed.json','packaged-partial-observed.json'],['reports/completed-observed.json','packaged-completed-observed.json'],['screenshots/modular-partial-desktop.png','modular-partial-desktop.png'],['screenshots/packaged-completed-phone.png','packaged-completed-phone.png']])mappings.push([target,join(current,name)]);
for(const [dest,from]of mappings){await mkdir(dirname(join(packet,dest)),{recursive:true});await copyFile(from,join(packet,dest));assert.deepEqual(await readFile(join(packet,dest)),await readFile(from));}
const files=await walk(packet);await writeFile(join(packet,'receiving-file-manifest.json'),JSON.stringify({owner:'estate-49f845d0dece/recall_import_receiving',createdAt:new Date().toISOString(),prefix,sourceHead:'a8030e23c6bef1fc4e7220150a72ae0273053f3e',sourceTree:'8db39a069c3c856c2c555a9ca6f7d796ebfe9b86',base:'f3215e82795d881c27f0c0225aa8ea5fcd2bbe4c',originalContractCommit:'38bb955d94bbf1032890307f7c4d04f0cb08f9be',allFilesExceptThisManifest:files},null,2)+'\n');
const publish=[];for(const m of await walk(packet)){const b=await readFile(join(packet,m.path)),encoding=/\.(png|gz)$/.test(m.path)?'base64':'utf-8';publish.push({...m,path:prefix+'/'+m.path,encoding,content:b.toString(encoding==='base64'?'base64':'utf8')});}
await writeFile(join(pub,'publication.json'),JSON.stringify({prefix,files:publish}));
const result={status:'passed',nativeArchive:archiveMeta,archivedFiles:before.reduce((n,a)=>n+a.files.length,0),publicFiles:publish.length,publicBytes:publish.reduce((n,f)=>n+f.bytes,0),publication:join(pub,'publication.json'),packet};
await writeFile(join(pub,'packet-receipt.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
