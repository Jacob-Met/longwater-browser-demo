from pathlib import Path
import subprocess,json,hashlib,datetime
repo=Path('/dev/shm/lw45-sound-composition/source')
root=repo.parent
base='f3215e82795d881c27f0c0225aa8ea5fcd2bbe4c'
product='e9628acd0f977e42f7a5c062223976c199c10d16'
head='20724ac249d1bf4b4e60e8e3dbe46dc1f419cea4'
def git(*args):return subprocess.check_output(['git','-C',str(repo),*args])
def sha(b):return hashlib.sha256(b).hexdigest()
def leaves(ref):
 d={}
 for line in git('ls-tree','-rz',ref).split(b'\0'):
  if not line:continue
  meta,path=line.split(b'\t',1);mode,kind,oid=meta.decode().split()
  d[path.decode()]={'mode':mode,'kind':kind,'oid':oid}
 return d
assert git('rev-parse','HEAD').decode().strip()==head
a,b,c=leaves(base),leaves(product),leaves(head)
changed=sorted(p for p in set(a)|set(c) if a.get(p)!=c.get(p))
allowed={'README.md','downloads/Longwater-Fourteen-Tides.html','game.js','index.html','scripts/package.mjs','watch-audio.css','watch-audio.js','tests/watch-audio.test.mjs','tests/watch-save.browser.test.mjs'}
assert set(changed)==allowed,changed
followup=sorted(p for p in set(b)|set(c) if b.get(p)!=c.get(p))
assert followup==['tests/watch-save.browser.test.mjs']
original=git('show',base+':game.js');current=git('show',head+':game.js')
inverse=current
replacements=[
 (b'import { WatchAudio } from "./watch-audio.js";\n',b''),
 (b'const watchAudio = new WatchAudio(document.querySelector("#sound-enabled"), document.querySelector("#sound-status"));\n',b''),
 (b'  if (state !== previous) {\n    journal.record(previous, state);\n    watchAudio.play(action, state.finished);\n  }\n',b'  if (state !== previous) journal.record(previous, state);\n'),
 (b'  watchAudio.ready();\n',b'')]
for before,after in replacements:
 assert inverse.count(before)==1
 inverse=inverse.replace(before,after,1)
assert inverse==original
f='tests/watch-save.browser.test.mjs';old=git('show',base+':'+f);new=git('show',head+':'+f);inv=new
for row in [b'  ["/watch-audio.js", ["watch-audio.js", "text/javascript"]],\n',b'  ["/watch-audio.css", ["watch-audio.css", "text/css"]],\n']:
 assert inv.count(row)==1
 inv=inv.replace(row,b'',1)
assert inv==old
packets={}
for p in [
 root/'review-packet/production.patch',
 root/'review-packet/source-review-pins.json',
 root/'review-packet/native-qualification-summary.json',
 root/'evidence/fixture-server-followup/fixture-followup-receipt.json',
 root/'evidence/fixture-server-followup/fixture-routes.patch',
 root/'evidence/thinkpad-cdp/receipt.json',
 root/'evidence/composed-reset/receipt.json',
 root/'evidence/composed-reset-v2/receipt.json']:
 data=p.read_bytes()
 packets[str(p.relative_to(root))]={'bytes':len(data),'sha256':sha(data)}
 if p.name=='receipt.json':
  j=json.loads(data);packets[str(p.relative_to(root))].update({'status':j['status'],'groups':len(j['groups']),'failure':j.get('failure'),'cleanup':j.get('cleanup')})
out={
 'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'reviewer':'ChatGPT github_receiving for estate-45d4289ccf6c',
 'scope':'read-only exact composition and fixture source proof; no app/test runs',
 'base':base,'product':product,'head':head,'tree':git('rev-parse',head+'^{tree}').decode().strip(),'parents':git('show','-s','--format=%P',head).decode().strip().split(),
 'base_leaf_count':len(a),'product_leaf_count':len(b),'final_leaf_count':len(c),
 'final_changed_paths':changed,'unrelated_base_leaves_exact':sum(1 for p,v in a.items() if p not in allowed and c.get(p)==v),
 'product_to_final_delta':followup,
 'game_inverse_exact_base':True,'game_base_sha256':sha(original),'game_current_sha256':sha(current),
 'fixture_inverse_exact_base':True,'fixture_base_sha256':sha(old),'fixture_current_sha256':sha(new),
 'worktree_status':git('status','--porcelain').decode(),
 'packets':packets}
print(json.dumps(out,indent=2))
