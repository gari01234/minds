import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const root = new URL("../apps/isabella/design-lab/", import.meta.url);
const html = readFileSync(new URL("index.html", root), "utf8");
const css = readFileSync(new URL("style.css", root), "utf8");
const source = readFileSync(new URL("app.js", root), "utf8");

function harness() {
  const nodes = new Map();
  const getNode = id => {
    if (!nodes.has(id)) nodes.set(id, {id, innerHTML:"",textContent:""});
    return nodes.get(id);
  };
  const buttons = {
    scenario: ["day","document","reading"].map(s=>({dataset:{scenario:s},setAttribute(k,v){this[k]=v;}})),
    visible: ["B1","B2"].map(s=>({dataset:{visible:s},setAttribute(k,v){this[k]=v;}}))
  };
  let onClick = null;
  const document = {
    documentElement: {dataset:{}},
    getElementById:getNode,
    querySelectorAll(selector) {
      return selector === "[data-scenario]" ? buttons.scenario : selector === "[data-visible]" ? buttons.visible : [];
    },
    addEventListener(type, cb) { if (type === "click") onClick = cb; }
  };
  vm.runInNewContext(source,{document,console});
  function click(variant,action){
    const trigger = {dataset:{action},
      closest(sel){return sel === ".phone" ? {id:"phone-"+variant} : null;}};
    onClick({target:{closest(sel){return sel==="button[data-action]"?trigger:null;}}});
  }
  function selectScenario(s){
    const trigger = {dataset:{scenario:s}};
    onClick({target:{closest(sel){return sel==="button[data-scenario]"?trigger:null;}}});
  }
  function selectVariant(v){
    const trigger = {dataset:{visible:v}};
    onClick({target:{closest(sel){return sel==="button[data-visible]"?trigger:null;}}});
  }
  return {getNode,click,selectScenario,selectVariant,document};
}
const view = (h,v)=>h.getNode("phone-"+v).innerHTML;
const metrics = (h,v)=>h.getNode("metrics-"+v).innerHTML;

test("lab is accessible at a static path without credentials or external scripts",()=>{
  assert.match(html, /PROTOTIPO AISLADO/);
  assert.match(html, /data-variant="B1"/);
  assert.match(html, /data-variant="B2"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /role="status"/);
  assert.match(html, /\.\/app\.js/);
  assert.match(html, /\.\/style\.css/);
  assert.doesNotMatch(html, /https:\/\/[^" ]+\.(?:js|css)/);
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|navigator\.sendBeacon|localStorage|sessionStorage|indexedDB|supabase\.createClient|serviceWorker\.register/);
  assert.match(css,/prefers-reduced-motion/);
  assert.match(css,/focus-visible/);
  assert.match(css,/@media\(max-width:750px\)/);
});

test("both variants start on Isabella and represent alternative stable destinations",()=>{
  const h=harness();
  assert.match(view(h,"B1"),/Lecturas/);
  assert.doesNotMatch(view(h,"B1"),/Biblioteca/);
  assert.match(view(h,"B2"),/Biblioteca/);
  assert.match(view(h,"B1"),/Thoughts ↗/);
  assert.doesNotMatch(view(h,"B2"),/Thoughts ↗/);
  assert.match(metrics(h,"B1"),/0 interacciones/);
  assert.match(metrics(h,"B2"),/0 interacciones/);
});

test("day: review distinguishes simulation from real receipt and can be cancelled",()=>{
  const h=harness();
  h.click("B1","time");
  h.click("B1","task");
  assert.match(view(h,"B1"),/29 de octubre/);
  h.click("B1","review");
  assert.match(view(h,"B1"),/Antes/);
  assert.match(view(h,"B1"),/Propuesto/);
  h.click("B1","cancelReview");
  assert.match(view(h,"B1"),/Ningún dato cambió/);
  assert.match(view(h,"B1"),/29 de octubre/);
  h.click("B1","review");
  h.click("B1","confirmReview");
  assert.match(view(h,"B1"),/DEMO-ONLY · NO SERVER RECEIPT/);
  assert.match(view(h,"B1"),/No hay recibo canónico/);
  h.click("B1","returnTask");
  assert.match(view(h,"B1"),/30 de octubre/);
  assert.match(metrics(h,"B2"),/0 interacciones/);
});

test("document: owner returns to original file after contextual Isabella query",()=>{
  const h=harness();
  h.selectScenario("document");
  h.click("B2","work");
  h.click("B2","document");
  assert.match(view(h,"B2"),/PDF · versión de ejemplo/);
  assert.match(view(h,"B2"),/Texto parcial/);
  h.click("B2","askDocument");
  assert.match(view(h,"B2"),/Origen:/);
  assert.match(view(h,"B2"),/Respuesta simulada/);
  h.click("B2","returnDocument");
  assert.match(view(h,"B2"),/Informe de coordinación/);
  assert.match(view(h,"B2"),/No se ha cargado ningún archivo real/);
  assert.match(metrics(h,"B1"),/0 interacciones/);
});

test("reading: B1 direct Lecturas vs B2 Biblioteca, annotation survives return",()=>{
  const h=harness();
  h.selectScenario("reading");
  h.click("B1","readings");
  h.click("B1","reader");
  h.click("B1","highlight");
  h.click("B1","sofia");
  assert.match(view(h,"B1"),/Interpretación simulada/);
  h.click("B1","returnReader");
  assert.match(view(h,"B1"),/Subrayado local de ejemplo/);
  h.click("B2","library");
  assert.match(view(h,"B2"),/Obra visual autónoma/);
  h.click("B2","readings");
  h.click("B2","reader");
  h.click("B2","highlight");
  h.click("B2","sofia");
  h.click("B2","returnReader");
  assert.match(view(h,"B2"),/Subrayado local de ejemplo/);
  const count=s=>Number(metrics(h,s).match(/(\d+) interacciones/)[1]);
  assert.equal(count("B2"),count("B1")+1);
});

test("Thoughts access is discoverable with different topologies; reset is local",()=>{
  const h=harness();
  h.click("B1","thoughts");
  assert.match(view(h,"B1"),/Representación esquemática/);
  h.click("B2","library");
  h.click("B2","thoughts");
  assert.match(view(h,"B2"),/obra real conserva su código/);
  h.click("B1","reset");
  assert.match(metrics(h,"B1"),/0 interacciones/);
  assert.match(metrics(h,"B2"),/2 interacciones/);
  h.selectVariant("B2");
  assert.equal(h.document.documentElement.dataset.visible,"B2");
});

test("the existing publish script will include the isolated design lab directory",()=>{
  const build=readFileSync(new URL("../scripts/build.mjs",import.meta.url),"utf8");
  assert.match(build,/\['theory','isabella'\]/);
  assert.match(build,/cpSync\(new URL\(`apps\/\$\{app\}\//);
});
