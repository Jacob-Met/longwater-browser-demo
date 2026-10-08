import pathlib,subprocess,os,json,time,hashlib,re,shutil,signal
root=pathlib.Path("/home/jacob/hamon-longwater-practice-2451-71826f7aa69e");source=root/"source";out=root/"evidence"/"qualification";out.mkdir()
cutPath=root/"evidence/source-cut.json";cut=json.loads(cutPath.read_text())
def snapshot():
 rows=[]
 for f in cut["files"]:
  p=source/f["path"];b=p.read_bytes();rows.append({"path":f["path"],"sha256":hashlib.sha256(b).hexdigest(),"expected":f["sha256"]})
 return rows
before=snapshot();assert all(r["sha256"]==r["expected"] for r in before)
freeBefore=shutil.disk_usage(root).free
taskenv=os.environ.copy();taskenv["TMPDIR"]=str(root/"tmp");taskenv["LONGWATER_CHROME_PATH"]="/snap/bin/chromium";taskenv["PLAYWRIGHT_BROWSERS_PATH"]=str(root/"browser-cache");taskenv["PATH"]="/usr/bin:"+taskenv.get("PATH","")
node="/usr/bin/node";steps=[]
def execute(name,command,limit):
 start=time.monotonic();timeout=False
 with (out/(name+".stdout.txt")).open("xb") as stdout,(out/(name+".stderr.txt")).open("xb") as stderr:
  p=subprocess.Popen(command,cwd=source,env=taskenv,stdout=stdout,stderr=stderr,start_new_session=True)
  try:code=p.wait(timeout=limit)
  except subprocess.TimeoutExpired:
   timeout=True;os.killpg(p.pid,signal.SIGTERM);code=p.wait(timeout=10)
 stdout=(out/(name+".stdout.txt")).read_bytes();stderr=(out/(name+".stderr.txt")).read_bytes()
 r={"name":name,"command":command,"exitCode":code,"timeout":timeout,"seconds":round(time.monotonic()-start,3),"stdoutBytes":len(stdout),"stderrBytes":len(stderr),"stdoutSha256":hashlib.sha256(stdout).hexdigest(),"stderrSha256":hashlib.sha256(stderr).hexdigest()}
 steps.append(r);return r,stdout.decode("utf-8",errors="replace")
start=time.monotonic()
files=[str(p.relative_to(source)) for p in sorted((source/"tests").glob("*.test.mjs"))]
full,fullText=execute("project",[node,"--test","--test-concurrency=1"]+files,480)
full["testFiles"]=len(files);full["counts"]={k:int(m.group(1)) for k in ["tests","pass","fail","cancelled","skipped","todo"] if (m:=re.search(r"(?m)^(?:ℹ|#)\s+"+k+r" (\d+)\s*$",fullText))}
witnessResult=None;emitterResult=None
if full["exitCode"]==0:
 witness,witnessText=execute("adoption-witness",[node,"scripts/receive-watch-choice-adoption.mjs"],120)
 authored=out/"witness-authored";authored.mkdir();members=[]
 for line in witnessText.splitlines():
  marker="LONGWATER_ADOPTION_RECEIVING_FILE "
  if line.startswith(marker):
   entry=json.loads(line[len(marker):]);assert entry["path"] in ["source-custody.json","run.json","run.log","failed-display-actual-download.json"]
   data=entry["text"].encode();assert len(data)==entry["bytes"] and hashlib.sha256(data).hexdigest()==entry["sha256"]
   with (authored/entry["path"]).open("xb") as f:f.write(data)
   members.append({k:v for k,v in entry.items() if k!="text"})
  if line.startswith("LONGWATER_ADOPTION_RECEIVING_RESULT "):witnessResult=json.loads(line[len("LONGWATER_ADOPTION_RECEIVING_RESULT "):])
 witness["authoredOutputs"]=members;witness["result"]=witnessResult
 emitter,emitterText=execute("choice-artifacts",[node,"scripts/emit-watch-choice-artifacts.mjs"],30)
 for line in emitterText.splitlines():
  if line.startswith("LONGWATER_CHOICE_BUNDLE_BEGIN "):emitterResult=json.loads(line[len("LONGWATER_CHOICE_BUNDLE_BEGIN "):])
 emitter["bundleHeader"]=emitterResult;emitter["bundleEnd"]=emitterText.rstrip().endswith("LONGWATER_CHOICE_BUNDLE_END")
after=snapshot();unchanged=before==after
receipt={"schema":1,"targetCommit":cut["targetCommit"],"publishedSource":json.loads((root/"evidence/published-source.json").read_text()),"rootDraftTreeBeforeOutputs":cut["rootDraftTreeBeforeOutputs"],"sourceCutSha256":hashlib.sha256(cutPath.read_bytes()).hexdigest(),"sourceRoot":str(source),"localPartialSnapshot":cut["localSnapshot"],"steps":steps,"sourceBefore":before,"sourceAfter":after,"sourceUnchanged":unchanged,"passed":len(steps)==3 and all(s["exitCode"]==0 and not s["timeout"] for s in steps) and unchanged and witnessResult is not None and witnessResult["passed"]==3 and witnessResult["failed"]==0,"seconds":round(time.monotonic()-start,3),"diskFreeBytes":{"before":freeBefore,"after":shutil.disk_usage(root).free},"scope":"Complete current published PR30 project test set, including maintained historical/practice regression, with test-file concurrency one; original three adoption witness cases and original authored artifact emitter. Installed alternate Playwright1.64.0, Node22.22.1 and Chromium153.0.8010.47; repository remains locked to1.62.1 and hosted locked-dependency qualification is separate. Existing Chrome through owned browser-path launcher; no source/dependency edits, installs or native builds."}
p=out/"receiving.json"
with p.open("x") as f:json.dump(receipt,f,indent=2);f.write("\n")
print("LWLINUXGATE:"+json.dumps({"receipt":str(p),"sha256":hashlib.sha256(p.read_bytes()).hexdigest(),"passed":receipt["passed"],"seconds":receipt["seconds"],"sourceUnchanged":unchanged,"steps":steps,"projectTail":fullText[-1800:]}),flush=True)
