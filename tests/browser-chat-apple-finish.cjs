'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1536,height:900},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/isabella/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.body.classList.contains('desk-enabled')&&
    document.querySelectorAll('.desk-panel').length===4,null,{timeout:15000});
  const detail=await page.evaluate(()=>{
    const css=q=>{const x=document.querySelector(q),s=x?getComputedStyle(x):null;
      return {exists:!!x,font:s?.fontFamily,size:s?.fontSize,color:s?.color,
        bg:s?.backgroundColor,height:x?.getBoundingClientRect().height,
        radius:s?.borderRadius,text:x?.textContent?.trim().slice(0,80)}};
    const day=document.querySelector('.desk-month-day.is-selected');
    return {
      title:css('.desk-panel-title'),month:css('.desk-month-bar strong'),
      previous:css('.desk-month-bar [data-desk-month="-1"]'),
      day:css('.desk-month-day'),selected:day?{bg:getComputedStyle(day).backgroundColor,width:day.getBoundingClientRect().width}:null,
      add:css('.desk-add-task'),segment:css('.desk-plan-view-switch button.is-selected'),
      footer:css('.desk-panel--today [data-desk-open-time]'),
      composer:css('.desk-panel--chat .composer'),send:css('#sendButton'),
      iconCount:document.querySelectorAll('.desk-panel-actions .desk-ui-icon').length,
      dateCount:document.querySelectorAll('.desk-month-day').length,
      buttons:[...['#attachButton','#micButton','#sendButton']].map(q=>({id:q,icons:document.querySelector(q)?.querySelectorAll('svg').length||0}))
    };
  });
  console.log('CHAT_APPLE_FINISH_DESKTOP',JSON.stringify(detail));
  assert.ok(detail.iconCount>=8,'Every panel should have two vector actions');
  assert.equal(detail.dateCount,42);
  assert.ok(detail.previous.height>=31,'Calendar month navigation requires discernible click targets');
  assert.ok(parseFloat(detail.day.size)>=12,'Calendar dates must be more readable');
  assert.equal(detail.selected?.bg,'rgb(0, 122, 255)');
  assert.ok(detail.month.text[0]===detail.month.text[0].toLocaleUpperCase('es-ES'));
  assert.match(detail.month.text,/ de /,'Spanish preposition stays lower case');
  assert.equal(detail.month.font,detail.title.font,'Month and panel title share one font system');
  assert.equal(detail.send.bg,'rgb(0, 122, 255)');
  assert.ok(detail.buttons.every(x=>x.icons===1),'Use consistent SVG for attach, mic and send');
  assert.ok(parseFloat(detail.add.size)>=11,'Add task label must be readable');
  const before=detail.month.text;
  await page.locator('.desk-month-bar [data-desk-month="-1"]').click();
  const after=(await page.locator('.desk-month-bar strong').innerText()).trim();
  assert.notEqual(after,before,'Month previous control remains interactive');
  await page.locator('.desk-month-bar [data-desk-month="1"]').click();
  await page.locator('[data-desk-plan-mode="week"]').click();
  assert.equal(await page.locator('[data-desk-plan-mode="week"]').getAttribute('aria-pressed'),'true');
  await page.locator('[data-desk-plan-mode="day"]').click();
  assert.equal(await page.locator('[data-desk-plan-mode="day"]').getAttribute('aria-pressed'),'true');
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>!document.body.classList.contains('desk-enabled'),null,{timeout:7000});
  const mobile=await page.evaluate(()=>{
    const c=document.querySelector('.composer'),r=c?.getBoundingClientRect();
    return {width:window.innerWidth,composerLeft:r?.left,composerRight:r?.right,
      buttons:[...['attachButton','micButton','sendButton']].map(id=>({id,
        svg:!!document.getElementById(id)?.querySelector('svg'),width:document.getElementById(id)?.getBoundingClientRect().width}))};
  });
  console.log('CHAT_APPLE_FINISH_MOBILE',JSON.stringify(mobile));
  assert.ok(mobile.composerLeft>=0&&mobile.composerRight<=390);
  assert.ok(mobile.buttons.every(b=>b.svg&&b.width>=38));
  assert.deepEqual(errors,[]);
 }finally{await browser.close()}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
