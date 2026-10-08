const crypto=require("node:crypto");
const expected=[{"path":"index.html","git_blob":"4098a7e0023d3c74b2f0806e4cf1803d19b411e8","bytes":7223},{"path":"style.css","git_blob":"7cfc051bfd89e25a028397fbadcd05508e13aaea","bytes":3342},{"path":"journal.css","git_blob":"89d5e2413e32a9db5234727f54407e2a111f39af","bytes":2465},{"path":"watch-trends.css","git_blob":"04e9153a10a363c72f26d6779f8b5470db5936cc","bytes":2791},{"path":"watch-save.css","git_blob":"8de9e0fefbf4d3d3cd1045fad93fbb0d3896b007","bytes":473},{"path":"watch-report.css","git_blob":"b017c4c073c496e75aa951c33ff7cdfec7dc09d6","bytes":571},{"path":"watch-file.css","git_blob":"9aee526fc9225b5aea8242eed8fa543525574bef","bytes":1196},{"path":"watch-choice.css","git_blob":"1ce5b6c327978b953dcd9117162b03376fed31f3","bytes":3741},{"path":"game.js","git_blob":"af0ae1eed760355f38ed6b22ae774f5fb53134cf","bytes":21844},{"path":"pkg/longwater_web.js","git_blob":"50cef9486d91829183315c1a1fb31df1914d6316","bytes":8716},{"path":"journal.js","git_blob":"fe06c30c1006e4be92204b8ff4bb42f7dea9aa0e","bytes":6603},{"path":"watch-save.js","git_blob":"b350738efe99cb89622105a8431483dc06ab6e41","bytes":9891},{"path":"watch-file.js","git_blob":"34c8490804e696e500e1362c629bb05a51ab3040","bytes":5475},{"path":"watch-choice.js","git_blob":"c06835946ec99c7edd8eb16334d597356aada060","bytes":12066},{"path":"watch-trends.js","git_blob":"7e4bb64f3f6eef5bb265aa68f17c1b89cb9f67a0","bytes":11372},{"path":"watch-report.js","git_blob":"f1dd8b3cedd447eac99b55075a19e603ba5bcfe7","bytes":9346},{"path":"watch-choice-model.js","git_blob":"06e2fb072ce281f032e9c5c455372ff0eb60badd","bytes":3694},{"path":"pkg/longwater_web_bg.wasm","git_blob":"faf26b8aa6a8887688249d6e3e34b3042c8babf3","bytes":71368},{"path":"downloads/Longwater-Fourteen-Tides.html","git_blob":"111bef4eb9d3df8adc6a5c44eb4a08b3009c441c","bytes":316725}];
const inputs=["index.html","style.css","journal.css","watch-trends.css","watch-save.css","watch-report.css","watch-file.css","watch-choice.css","game.js","pkg/longwater_web.js","journal.js","watch-save.js","watch-file.js","watch-choice.js","watch-trends.js","watch-report.js","watch-choice-model.js","pkg/longwater_web_bg.wasm"];
const root="https://jacobmetoyer.com/longwater-browser-demo/";
const got=new Map(),started=new Date().toISOString();
const sha=b=>crypto.createHash("sha256").update(b).digest("hex");
async function asset(item){
 const url=new URL(item.path,root).href,begin=Date.now();
 try{
  const r=await fetch(url,{redirect:"error",signal:AbortSignal.timeout(15000)});
  const reader=r.body?.getReader(),chunks=[];let count=0;
  if(reader)for(;;){const x=await reader.read();if(x.done)break;count+=x.value.byteLength;if(count>1048576){await reader.cancel();throw Error("body exceeds1MiB bound");}chunks.push(Buffer.from(x.value));}
  const body=Buffer.concat(chunks);
  const git=crypto.createHash("sha1").update("blob "+body.length+"\0").update(body).digest("hex");
  const value={path:item.path,url,status:r.status,content_type:r.headers.get("content-type"),content_encoding:r.headers.get("content-encoding"),last_modified:r.headers.get("last-modified"),etag:r.headers.get("etag"),bytes:body.length,sha256:sha(body),git_blob:git,expected_git_blob:item.git_blob,expected_bytes:item.bytes,exact:r.status===200&&git===item.git_blob&&body.length===item.bytes,elapsed_ms:Date.now()-begin};
  got.set(item.path,body);return value;
 }catch(e){return {path:item.path,url,error:{name:e.name,message:e.message,code:e.cause?.code??e.code??null},exact:false,elapsed_ms:Date.now()-begin};}
}
(async()=>{
 const results=[];for(let n=0;n<expected.length;n+=3)results.push(...await Promise.all(expected.slice(n,n+3).map(asset)));
 let sourceSha256=null;
 if(inputs.every(n=>got.has(n))){const h=crypto.createHash("sha256");for(const n of inputs)h.update(n).update("\0").update(got.get(n)).update("\0");sourceSha256=h.digest("hex");}
 const offline=got.get("downloads/Longwater-Fourteen-Tides.html");
 const offlineSourceMeta=offline?.toString("utf8").match(/name="longwater-source-sha256" content="([^"]+)"/)?.[1]??null;
 console.log(JSON.stringify({schema:"longwater.public-baseline.v1",started_at:started,finished_at:new Date().toISOString(),site:root,git_head:"2451ec6fa29d10fa8bac53b59faf95c69fb9951c",git_tree:"60d5959531bef550d7af5db6ba3c1d2a2857f801",inputs,sourceSha256,offlineSourceMeta,offlineSourceMetaMatches:sourceSha256!==null&&sourceSha256===offlineSourceMeta,all_assets_exact:results.every(r=>r.exact),browser_executed:false,results}));
})();
