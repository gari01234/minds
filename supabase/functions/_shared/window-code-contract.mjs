export const REPOSITORY='gari01234/minds';
export const AUDIENCE='minds-window-code';
export function trustedWorkflow(c){
 return c.repository===REPOSITORY&&c.repository_id==='1387794687'&&c.ref==='refs/heads/main'&&
 c.workflow_ref===REPOSITORY+'/.github/workflows/window-code.yml@refs/heads/main'&&
 ['push','schedule','workflow_dispatch'].includes(c.event_name)&&/^\d+$/.test(c.run_id||'')&&/^[a-f0-9]{40}$/.test(c.sha||'');
}
export function allowedPath(p){
 return typeof p==='string'&&p.length<200&&!p.includes('..')&&!p.includes('\\')&&
 /^(apps\/isabella\/[^/]+\.(js|css|html)|supabase\/functions\/(isabella-chat|_shared)\/[a-zA-Z0-9_-]+\.(ts|mjs)|tests\/[a-zA-Z0-9_-]+\.test\.mjs)$/.test(p)&&
 !/(window-code|code-preparation|self-review|sync\.js|supabase\.js)/.test(p);
}
export function validateEdits(patch,sources){
 if(!patch||!['change','no_change','blocked'].includes(patch.outcome)||!Array.isArray(patch.edits)||patch.edits.length>8)throw Error('invalid_patch');
 if(patch.outcome!=='change'&&patch.edits.length)throw Error('nonchange_with_edits');
 if(patch.outcome==='change'&&!patch.edits.length)throw Error('empty_change');
 const current=new Map(sources.map(f=>[f.path,f.content]));
 for(const e of patch.edits){
  if(!allowedPath(e.path)||typeof e.before!=='string'||typeof e.after!=='string'||e.after.length>30000||e.before===e.after)throw Error('invalid_edit');
  const old=current.get(e.path);
  if(old===undefined){if(!e.path.startsWith('tests/')||e.before!==''||!e.after)throw Error('invalid_new_file');current.set(e.path,e.after);continue;}
  if(e.path.startsWith('tests/'))throw Error('existing_tests_are_immutable');
  if(!e.before||old.split(e.before).length!==2)throw Error('ambiguous_or_stale_edit');
  current.set(e.path,old.replace(e.before,()=>e.after));
 }
 return [...current].filter(([path,content])=>sources.find(f=>f.path===path)?.content!==content).map(([path,content])=>({path,content}));
}
