'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try {
  const context=await browser.newContext({viewport:{width:1366,height:900},deviceScaleFactor:1});
  const page=await context.newPage();
  await page.goto('http://127.0.0.1:8765/isabella/',{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#modalBody',{timeout:15000});
  await page.evaluate(()=>{
    const block='<div class="minds-task-section"><div class="minds-task-section-head"><strong>Checklist</strong></div><p>Test content for scrolling and typography</p></div>';
    const contents='<div class="minds-task-detail"><header class="minds-task-detail-top">'+
     '<button class="minds-task-complete" aria-pressed="false" aria-label="Marcar como completada"></button>'+
     '<input value="Planliste aktualisieren"><button class="minds-task-more">···</button></header>'+
     '<div class="minds-task-fields"><label>Proyecto<input value="Bernried"></label><label>Fecha<input type="date" value="2026-11-02"></label></div>'+
     block.repeat(45)+'</div>';
    document.querySelector('#modalTitle').textContent='Tarea';
    document.querySelector('#modalBody').innerHTML=contents;
    document.querySelector('#modal').classList.remove('hidden');
    document.querySelector('#modalBackdrop').classList.remove('hidden');
  });
  const m=await page.evaluate(()=>{
    const modal=document.querySelector('#modal'),title=document.querySelector('#modalTitle'),
      body=document.querySelector('#modalBody'),
      toggle=document.querySelector('.minds-task-complete');
    const outer=modal.getBoundingClientRect(),inner=body.getBoundingClientRect();
    const mc=getComputedStyle(modal),bc=getComputedStyle(body),tc=getComputedStyle(title),cc=getComputedStyle(toggle);
    const input=document.querySelector('.minds-task-detail-top>input');
    return {outer:{left:outer.left,right:outer.right,top:outer.top,bottom:outer.bottom,width:outer.width},
      content:{left:inner.left,right:inner.right},overflow:mc.overflow,display:mc.display,
      radius:mc.borderTopRightRadius,titleFont:tc.fontFamily,titleSize:tc.fontSize,
      titleWeight:tc.fontWeight,bodyOverflow:bc.overflowY,scrollHeight:body.scrollHeight,
      clientHeight:body.clientHeight,inputFont:getComputedStyle(input).fontFamily,
      toggle:{width:toggle.getBoundingClientRect().width,
        borderRadius:cc.borderRadius,background:cc.backgroundColor,inner:toggle.innerHTML}};
  });
  assert.equal(m.overflow,'hidden','Shell should clip every rounded corner');
  assert.equal(m.display,'flex','The shell needs internal flex scrolling');
  assert.equal(m.bodyOverflow,'auto','Only modalBody should scroll');
  assert.ok(m.scrollHeight>m.clientHeight,'Long task details must scroll internally');
  assert.ok(parseFloat(m.radius)>=20,'Modal corners should be visibly rounded');
  assert.ok(!/Iowan|Georgia|Palatino/.test(m.titleFont),'Task title must use a native sans-serif face');
  assert.ok(parseFloat(m.titleSize)>=19&&parseFloat(m.titleSize)<=25,'Title must remain balanced');
  assert.ok(!/Iowan|Georgia|Palatino/.test(m.inputFont));
  assert.ok(m.toggle.width>=22&&m.toggle.width<=26);
  assert.equal(m.toggle.inner,'','The pending completion button must not show a double-ring glyph');
  assert.ok(m.outer.left>=0&&m.outer.right<=1366,'Shell must stay in viewport');
  console.log('WORK_MODAL_DESKTOP_ACCEPTED',JSON.stringify(m));

  await page.setViewportSize({width:390,height:844});
  const mobile=await page.locator('#modal').evaluate(el=>{
    const rect=el.getBoundingClientRect(),c=getComputedStyle(el);
    const body=el.querySelector('#modalBody');
    return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,
      radius:c.borderTopRightRadius,scrollHeight:body.scrollHeight,clientHeight:body.clientHeight};
  });
  assert.ok(mobile.left>=0&&mobile.right<=390,'Mobile modal must fit viewport');
  assert.ok(mobile.top>=0&&mobile.bottom<=844,'Mobile modal must fit viewport height');
  assert.ok(mobile.scrollHeight>mobile.clientHeight);
  console.log('WORK_MODAL_MOBILE_ACCEPTED',JSON.stringify(mobile));
 }
 finally{await browser.close()}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
