'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
  const context=await browser.newContext({viewport:{width:1698,height:882},deviceScaleFactor:1});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.goto('http://127.0.0.1:8765/isabella/',{waitUntil:'domcontentloaded'});
  try{await page.waitForFunction(()=>document.body.classList.contains('desk-enabled'),null,{timeout:16000});}
  catch(err){console.log('NO DESKTOP ACTIVATE',errors.slice(0,8));throw err;}
  await page.waitForTimeout(750);
  const stats=await page.evaluate(()=>{
    const ids=['.app','.topbar','#swipeArea','#assistantScreen','.desk-shell','.desk-layout','.desk-stage','.desk-rail','.desk-panel--chat','#menuButton','.top-actions','#desktopLenses'];
    return Object.fromEntries(ids.map(selector=>{
      const e=document.querySelector(selector);
      if(!e)return [selector,null];
      const r=e.getBoundingClientRect(),c=getComputedStyle(e);
      return [selector,{top:+r.top.toFixed(1),bottom:+r.bottom.toFixed(1),
        height:+r.height.toFixed(1),width:+r.width.toFixed(1),
        display:c.display,position:c.position,visibility:c.visibility,
        overflow:c.overflow,gridRow:c.gridRow,gridTemplateRows:c.gridTemplateRows,
        zIndex:c.zIndex}];
    }));
  });
  console.log('DESKTOP_COMPUTED_METRICS',JSON.stringify({viewport:{width:1698,height:882},section:await page.locator('body').getAttribute('data-section'),stats,errors:errors.slice(0,10)},null,2));
  const panel=stats['.desk-panel--chat'],layout=stats['.desk-layout'];
  assert.equal(await page.locator('body').getAttribute('data-section'),'assistant',
    'App initialization must finish (calendar model must precede app.js)');
  assert.deepEqual(errors,[],'The daily screen must initialize without page errors');
  assert.ok(panel&&layout,'The real Isabella daily grid must mount');
  assert.ok(layout.bottom>=862,'Daily grid bottom '+layout.bottom+' leaves unused viewport under dashboard');
  assert.ok(panel.bottom>=862,'Chat panel bottom '+panel.bottom+' leaves unused viewport');
  const candidates=page.locator('[data-desk-menu],#menuButton');
  const count=await candidates.count();
  console.log('MENU_CANDIDATES',count);
  let reachable=false;
  for(let i=0;i<count;i++){
    const x=candidates.nth(i);
    if(await x.isVisible()){
      const b=await x.boundingBox();
      if(b&&b.width>=20&&b.height>=20){
        await x.click();reachable=true;break;
      }
    }
  }
  assert.ok(reachable,'The existing More menu needs an accessible visible entry');
  await page.locator('#drawer:not(.hidden)').waitFor({timeout:4000});
  assert.ok(await page.locator('#drawer [data-action="permissions"]').count(),'Permissions remain reachable');
  assert.ok(await page.locator('#drawer [data-action="reviews"]').count(),'Reviews remain reachable');
  const buildNote=await page.locator('#currentBuildInfo').innerText();
  assert.match(buildNote,/Versión cargada · commit [0-9a-f]{12} · app v130/);
  console.log('BUILD_VERSION_DISPLAYED',buildNote);
  // Visual measurements execute against actual computed styles, not CSS source.
  const composer=page.locator('.desk-stage .desk-panel--chat .composer');
  const layoutMetrics=await composer.evaluate(node=>{
    const get=selector=>{
      const btn=node.querySelector(selector),rect=btn.getBoundingClientRect(),style=getComputedStyle(btn);
      return {size:[rect.width,rect.height],background:style.backgroundColor,color:style.color};
    };
    return {attach:get('.attach'),mic:get('.mic'),send:get('.send')};
  });
  for(const name of ['attach','mic','send']) {
    assert.ok(layoutMetrics[name].size[0]>=44 && layoutMetrics[name].size[1]>=44,
      name+' must retain a usable hit area');
  }
  assert.notEqual(layoutMetrics.send.background,layoutMetrics.attach.background,
    'Send must be the single prominent action');
  assert.equal(layoutMetrics.attach.background,layoutMetrics.mic.background,
    'The two utilities should form a consistent group');

  // Synthetic, browser-local fixtures. No authentication or backend writes.
  const fixtureDate=await page.evaluate(()=>{
    const key=window.MINDS_DESK_MODEL.dayKey(new Date());
    const current=window.ISABELLA_APP.getState();
    const changed={...current,date:key,
      projects:[{id:'blue',name:'Blue project',color:'#2F6FB0'}],
      categories:[{id:'orange',name:'Orange category',color:'#D08A6A'}],
      tasks:[{id:'first',title:'First',date:key,projectId:'blue',done:false},
             {id:'second',title:'Second',date:key,categoryId:'orange',done:false},
             {id:'third',title:'Third',date:key,projectId:'blue',done:false}],
      events:[{id:'meeting',title:'Meeting',date:key,projectId:'blue',start:'11:00',duration:30}]
    };
    window.ISABELLA_APP.replaceState(changed);
    return key;
  });
  const lookup='.desk-month-day[data-desk-date="'+fixtureDate+'"] .desk-month-dots i';
  await page.waitForFunction(selector=>document.querySelectorAll(selector).length===2,lookup,{timeout:5000});
  const compactColors=await page.locator(lookup).evaluateAll(nodes=>
    nodes.map(node=>getComputedStyle(node).backgroundColor));
  const compactToday=await page.locator('.desk-month-day[data-desk-date="'+fixtureDate+'"]').getAttribute('class');
  assert.match(compactToday,/is-today/);
  await page.locator('#closeDrawer').click();
  await page.locator('#drawer.hidden').waitFor({timeout:4000});
  await page.locator('#desktopLenses [data-nav="calendar"]').click();
  await page.locator('.mc[data-date="'+fixtureDate+'"] .dotset i').first().waitFor();
  const fullColors=await page.locator('.mc[data-date="'+fixtureDate+'"] .dotset i').evaluateAll(nodes=>
    nodes.map(node=>getComputedStyle(node).backgroundColor));
  assert.deepEqual(fullColors,compactColors,
    'Compact and full calendars must use exactly the same project/category colors');
  console.log('DAILY_COLORS_VERIFIED',JSON.stringify({compactColors,fullColors,layoutMetrics}));
  console.log('DAILY_BROWSER_ACCEPTED');
}
finally{await browser.close();}
})().catch(err=>{console.error(err.stack||err);process.exitCode=1;});
