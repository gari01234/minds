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
 }finally{await browser.close()}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
