'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];page.on('pageerror',err=>errors.push(err.message));
  await page.goto('http://127.0.0.1:8765/isabella/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!window.ISABELLA_APP&&document.body.dataset.section==='assistant',null,{timeout:12000});
  await page.waitForFunction(()=>document.body.classList.contains('desk-enabled')&&!!document.querySelector('.desk-panel--chat'),null,{timeout:12000});
  const chat=await page.evaluate(()=>{
    const pick=selector=>{
      const el=document.querySelector(selector),cs=el?getComputedStyle(el):null;
      return {present:!!el,bg:cs?.backgroundColor,fg:cs?.color,font:cs?.fontFamily,radius:cs?.borderTopLeftRadius,border:cs?.borderTopColor};
    };
    return {section:document.body.dataset.section,dashboard:pick('.desk-shell'),
      chat:pick('.desk-panel--chat'),title:pick('.desk-panel-title'),
      controls:pick('.desk-panel-actions button'),composer:pick('.desk-panel--chat .composer'),
      send:pick('.desk-panel--chat .composer .send'),
      sidebar:pick('#desktopLenses'),nav:pick('.lens-nav-item.active'),
      panels:document.querySelectorAll('.desk-panel').length};
  });
  console.log('UNIFIED_CHAT_DESKTOP',JSON.stringify(chat));
  assert.equal(chat.dashboard.bg,'rgb(255, 255, 255)');
  assert.equal(chat.chat.bg,'rgb(255, 255, 255)');
  assert.ok(parseFloat(chat.chat.radius)>=16);
  assert.ok(chat.panels>=2,'Preserve original Isabella dashboard panels');
  assert.equal(chat.send.bg,'rgb(0, 122, 255)');
  assert.match(chat.title.font,/apple-system/);

  await page.evaluate(()=>window.ISABELLA_APP.show('work'));
  await page.waitForFunction(()=>document.body.dataset.section==='work',null,{timeout:5000});
  const work=await page.evaluate(()=>{
    const root=document.querySelector('#workBody');
    root.insertAdjacentHTML('beforeend','<section id="unifiedTestBucket" class="work-bucket"><article id="unifiedTestCard" class="work-task-card">Verificar tarjeta</article></section>');
    const values=selector=>{
      const el=document.querySelector(selector),cs=el?getComputedStyle(el):null;
      return {bg:cs?.backgroundColor,font:cs?.fontFamily,radius:cs?.borderTopLeftRadius};
    };
    return {screen:values('#workScreen'),shell:values('.work-shell'),
      body:values('#workBody'),bucket:values('#unifiedTestBucket'),card:values('#unifiedTestCard'),
      nav:values('.lens-nav-item.active')};
  });
  console.log('UNIFIED_WORK_DESKTOP',JSON.stringify(work));
  for(const key of ['screen','shell','body'])assert.equal(work[key].bg,'rgb(255, 255, 255)',key);
  assert.equal(work.bucket.bg,'rgb(241, 243, 246)');
  assert.equal(work.card.bg,'rgb(255, 255, 255)');
  assert.deepEqual(chat.title.font,work.shell.font,'Chat and Work should use the same system font stack');
  assert.equal(errors.length,0,'Unexpected uncaught JavaScript errors: '+errors.join(' / '));
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>window.ISABELLA_APP.show('assistant'));
  const mobile=await page.evaluate(()=>({
    section:document.body.dataset.section,
    width:document.querySelector('.app').getBoundingClientRect().width,
    bg:getComputedStyle(document.querySelector('#assistantScreen')).backgroundColor,
    composer:getComputedStyle(document.querySelector('.composer')).backgroundColor
  }));
  console.log('UNIFIED_CHAT_MOBILE',JSON.stringify(mobile));
  assert.equal(mobile.width,390);
  assert.equal(mobile.bg,'rgb(255, 255, 255)');
  assert.equal(mobile.composer,'rgb(255, 255, 255)');
 }finally{await browser.close()}
})().catch(error=>{console.error(error.stack||error);process.exitCode=1});
