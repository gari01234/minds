'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:850}});
  const events=[];page.on('pageerror',e=>events.push('PAGE_ERROR '+e.message));page.on('console',e=>{if(e.type()==='error')events.push('CONSOLE '+e.text())});
  page.on('requestfailed',req=>{if(req.url().includes('/isabella/'))events.push('FAILED '+req.url()+': '+req.failure()?.errorText)});
  await page.goto('http://127.0.0.1:8765/isabella/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!window.ISABELLA_APP && !!window.MINDS_WORK,null,{timeout:16000}).catch(()=>{});
  const initial=await page.evaluate(()=>({hasWork:!!window.MINDS_WORK,hasApp:!!window.ISABELLA_APP,section:document.body.dataset.section,loaded:document.readyState}));
  const nav=page.locator('[data-nav="work"]').filter({visible:true});
  if(await nav.count())await nav.first().click();
  else await page.evaluate(()=>window.ISABELLA_APP?.show?.('work'));
  await page.waitForTimeout(2800);
  const snapshot=await page.evaluate(()=>({
    section:document.body.dataset.section,hasWork:!!window.MINDS_WORK,
    switcher:document.querySelector('.work-project-switch')?.innerText,
    body:document.querySelector('#workBody')?.innerText?.slice(0,230),
    overviewActive:document.querySelector('[data-work-view="overview"]')?.classList.contains('active'),
    projects:document.querySelectorAll('[data-work-project]').length,
    tabs:[...document.querySelectorAll('[data-work-view]')].map(n=>({view:n.dataset.workView,handler:typeof n.onclick}))
  }));
  console.log('WORK_BOOT_SNAPSHOT',JSON.stringify({initial,snapshot,events}));
  assert.ok(snapshot.hasWork,'Work script must register window.MINDS_WORK');
  assert.ok(snapshot.tabs.every(t=>t.handler==='function'),'Work tabs must be bound');
  assert.ok(!/Abriendo Work/.test(snapshot.body||''),'Work must leave indefinite boot splash');
  await page.locator('[data-work-view="planner"]').click();
  await page.waitForTimeout(550);
  const after=await page.evaluate(()=>({
    view:document.querySelector('[data-work-view="planner"]').classList.contains('active'),
    body:document.querySelector('#workBody')?.innerText?.slice(0,220)
  }));
  console.log('WORK_TAB_SNAPSHOT',JSON.stringify({after,events}));
  assert.ok(after.view,'Planner tab must respond to click');

  // Synthetic browser-local session and rows. No network database writes.
  await page.evaluate(()=>{
    const sb=window.MINDS_SUPABASE;
    sb.auth.getSession=async()=>({data:{session:{user:{id:'offline-test-user'}}}});
    const project={id:'mock-project-id',client_key:'bernried',name:'Bernried Test'};
    sb.from=(table)=>{
      const query={
        select(){return this},eq(){return this},is(){return this},
        in(){return this},order(){return this},limit(){return this},
        maybeSingle:async()=>({data:table==='isabella_projects'?project:null,error:null}),
        then(resolve,reject){
          const data=table==='isabella_projects'?[project]
            :table==='minds_work_buckets'?[{id:'mock-bucket',name:'Grundrisse',sort_order:10,archived:false}]
            :[];
          return Promise.resolve({data,error:null}).then(resolve,reject);
        }
      };
      return query;
    };
    if(window.MINDS_WORK_TEAM)window.MINDS_WORK_TEAM.members=async()=>[];
    window.MINDS_WORK.render();
  });
  await page.waitForFunction(()=>{
    const board=document.querySelector('#workBody')?.innerText||'';
    return document.querySelectorAll('[data-work-project]').length===1 && /Grundrisse/.test(board);
  },null,{timeout:7000});
  const recovered=await page.evaluate(()=>({
    switcher:document.querySelector('.work-project-switch')?.innerText,
    board:document.querySelector('#workBody')?.innerText.slice(0,240),
    selected:document.querySelector('[data-work-view="planner"]')?.classList.contains('active')
  }));
  assert.match(recovered.switcher,/Bernried Test/);
  assert.ok(recovered.selected);
  console.log('WORK_FAKE_SESSION_ACCEPTED',JSON.stringify(recovered));

  // Reproduce a restored Work screen where its script arrives after app.js.
  // Previously app.js's one-off timer could fire before window.MINDS_WORK exists,
  // leaving the initial splash and inert tabs indefinitely.
  const delayed=await browser.newContext({viewport:{width:1280,height:800}});
  await delayed.addInitScript(()=>{
    localStorage.setItem('isabella-staging-v03',JSON.stringify({screen:'work'}));
  });
  const latePage=await delayed.newPage();
  await latePage.route('**/isabella/work.js?v=33',async route=>{
    await new Promise(resolve=>setTimeout(resolve,1200));
    await route.continue();
  });
  await latePage.goto('http://127.0.0.1:8765/isabella/',{waitUntil:'domcontentloaded'});
  await latePage.waitForFunction(()=>{
    const loaded=!!window.MINDS_WORK;
    const tab=document.querySelector('[data-work-view="planner"]');
    return loaded&&typeof tab?.onclick==='function' &&
      document.body.dataset.section==='work' &&
      !document.querySelector('#workBody')?.innerText.includes('Abriendo Work');
  },null,{timeout:8000});
  console.log('WORK_RESTORED_LATE_JS_ACCEPTED');
  await delayed.close();


 }finally{await browser.close()}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
