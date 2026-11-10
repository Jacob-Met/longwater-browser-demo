from pathlib import Path
import subprocess,json,hashlib,datetime
repo=Path('/home/jacob/longwater-sound-45d4289ccf6c/final-qualified/source')
def git(*a): return subprocess.check_output(['git','-C',str(repo),*a])
base='e4e9bf82f6ebb363896559507a2fb5af07b490f5'
old='b49cccbb55d1df50821ebf015719e6dcd764bcb7'
tree='1e80c027be11d72ca91483c0dfedbf643cfa8109'
def sha(b):return hashlib.sha256(b).hexdigest()
def leaves(ref):
 d={}
 for line in git('ls-tree','-rz',ref).split(b'\0'):
  if not line:continue
  meta,p=line.split(b'\t',1);mode,kind,oid=meta.decode().split()
  d[p.decode()]={'mode':mode,'kind':kind,'oid':oid}
 return d
a,b,c=leaves(base),leaves(old),leaves(tree)
assert len(a)==135 and len(c)==154
changed=sorted(p for p in set(a)|set(c) if a.get(p)!=c.get(p))
changed_existing=sorted(p for p in a if a[p]!=c.get(p))
expected_existing=['README.md','downloads/Longwater-Fourteen-Tides.html','game.js','index.html','scripts/package.mjs','tests/watch-save.browser.test.mjs']
assert changed_existing==expected_existing
added=sorted(set(c)-set(a))
assert len(added)==19
for p in added:
 assert p in {'watch-audio.js','watch-audio.css','tests/watch-audio.test.mjs'} or p.startswith('docs/receiving/optional-sound-45d4289ccf6c/')
 assert c[p]==b[p],p
assert all(c.get(p)==v for p,v in a.items() if p not in expected_existing)
fixed=['watch-audio.js','watch-audio.css','game.js','tests/watch-audio.test.mjs']
assert all(c[p]==b[p] for p in fixed)
pack=git('show',tree+':scripts/package.mjs')
pinv=pack
for token in [b', "watch-audio.css"', b', "watch-audio.js"']:
 assert pinv.count(token)==1
 pinv=pinv.replace(token,b'',1)
assert pinv==git('show',base+':scripts/package.mjs')
fixture=git('show',tree+':tests/watch-save.browser.test.mjs');finv=fixture
for row in [b'  ["/watch-audio.js", ["watch-audio.js", "text/javascript"]],\n',b'  ["/watch-audio.css", ["watch-audio.css", "text/css"]],\n']:
 assert finv.count(row)==1
 finv=finv.replace(row,b'',1)
assert finv==git('show',base+':tests/watch-save.browser.test.mjs')
custody_path=repo.parent/'report-composition-custody.json';custody_bytes=custody_path.read_bytes();custody=json.loads(custody_bytes)
assert custody['prospective_tree']==tree
source_verified=[]
for p,expected in custody['source_sha256'].items():
 raw=git('show',tree+':'+p)
 assert sha(raw)==expected and (repo/p).read_bytes()==raw,p
 source_verified.append({'path':p,'sha256':sha(raw),'bytes':len(raw),'blob':c[p]['oid']})
index_diff=git('diff','--cached','--name-only',tree).decode()
working_diff=git('diff','--name-only').decode()
out={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'reviewer':'ChatGPT github_receiving / estate-45d4289ccf6c','scope':'Read-only independent current-report composition source check; no tests or source writes','base':base,'base_tree':git('rev-parse',base+'^{tree}').decode().strip(),'previous_qualified_source':old,'prospective_tree':tree,'observed_head':git('rev-parse','HEAD').decode().strip(),'base_leaves':len(a),'candidate_leaves':len(c),'changed_existing':changed_existing,'added_paths':added,'unrelated_main_leaves_exact':len(a)-len(changed_existing),'all_nineteen_added_leaves_exact_to_prior_qualified_audio_source':True,'unchanged_audio_and_game_paths':fixed,'packager_two_entry_inverse_exact_base':True,'fixture_two_route_inverse_exact_base':True,'index_diff_against_prospective_tree':index_diff,'working_diff_against_index':working_diff,'author_custody_sha256':sha(custody_bytes),'working_source_files_exact_to_immutable_tree':source_verified,'narrow_native_diff':git('diff',base,tree,'--','README.md','index.html','scripts/package.mjs','tests/watch-save.browser.test.mjs').decode()}
print(json.dumps(out,indent=2))
