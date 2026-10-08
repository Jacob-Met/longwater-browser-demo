import pathlib,subprocess,os,json,time,hashlib,re,shutil,signal
root=pathlib.Path("/Users/me/hamon-longwater-practice-43038-71826f7aa69e");source=root/"source";out=root/"evidence"/"full-current";out.mkdir()
cut=json.loads((root/"evidence/source-cut.json").read_text())
def source_hashes():
 result=[]
 for f in cut["files"]:
  b=(source/f["path"]).read_bytes();h=hashlib.sha256(b).hexdigest();assert h==f["sha256"],f["path"]
  result.append({"path":f["path"],"sha256":h})
 return result
before=source_hashes();free_before=shutil.disk_usage(root).free
taskenv=os.environ.copy();taskenv["TMPDIR"]=str(root/"tmp");taskenv["LONGWATER_CHROME_PATH"]="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";taskenv["PATH"]="/opt/homebrew/bin:"+taskenv.get("PATH","")
command=["/opt/homebrew/bin/node","--test","--test-concurrency=1"]+[str(p.relative_to(source)) for p in sorted((source/"tests").glob("*.test.mjs"))]
start=time.monotonic();timed_out=False
with (out/"stdout.txt").open("xb") as stdout,(out/"stderr.txt").open("xb") as stderr:
 p=subprocess.Popen(command,cwd=source,env=taskenv,stdout=stdout,stderr=stderr,start_new_session=True)
 try:code=p.wait(timeout=480)
 except subprocess.TimeoutExpired:
  timed_out=True;os.killpg(p.pid,signal.SIGTERM);code=p.wait(timeout=10)
after=source_hashes();stdout=(out/"stdout.txt").read_bytes();stderr=(out/"stderr.txt").read_bytes();text=stdout.decode("utf-8",errors="replace")
counts={k:int(m.group(1)) for k in ["tests","pass","fail","cancelled","skipped","todo"] if (m:=re.search(r"(?m)^ℹ "+k+r" (\d+)$",text))}
receipt={"schema":1,"targetCommit":cut["targetCommit"],"draftTree":cut["draftTree"],"sourceCutSha256":hashlib.sha256((root/"evidence/source-cut.json").read_bytes()).hexdigest(),"sourceRoot":str(source),"localPartialSnapshot":cut["localSnapshot"],"command":command,"testFiles":len(command)-3,"exitCode":code,"timeout":timed_out,"seconds":round(time.monotonic()-start,3),"counts":counts,"stdoutSha256":hashlib.sha256(stdout).hexdigest(),"stderrSha256":hashlib.sha256(stderr).hexdigest(),"sourceBefore":before,"sourceAfter":after,"sourceUnchanged":before==after,"diskFreeBytes":{"before":free_before,"after":shutil.disk_usage(root).free},"scope":"Current full project test set, same npm-test Node runner with test-file concurrency one to bound browser storage; existing shipped WASM and read-only Playwright, no dependency install or native build."}
with (out/"receiving.json").open("x") as f:json.dump(receipt,f,indent=2);f.write("\n")
print("LWGATE:"+json.dumps({"receipt":str(out/"receiving.json"),"sha256":hashlib.sha256((out/"receiving.json").read_bytes()).hexdigest(),"exitCode":code,"counts":counts,"seconds":receipt["seconds"],"sourceUnchanged":before==after,"tail":text[-4500:],"stderr":stderr.decode(errors="replace")[-2000:]}),flush=True)
