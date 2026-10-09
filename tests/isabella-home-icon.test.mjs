import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root));
const text=p=>read(p).toString('utf8');
const sha256=p=>createHash('sha256').update(read(p)).digest('hex');

test('Isabella Home Screen icon is pure black and iOS-specific',()=>{
  const html=text('apps/isabella/index.html');
  const manifest=JSON.parse(text('apps/isabella/manifest.webmanifest'));
  const svg=text('apps/isabella/icon.svg');

  assert.ok(html.includes('rel="apple-touch-icon" sizes="180x180" href="./apple-touch-icon.png?v=2"'));
  assert.ok(html.includes('<meta name="theme-color" content="#000000">'));
  assert.ok(html.includes('<meta name="apple-mobile-web-app-status-bar-style" content="black">'));
  assert.equal(manifest.background_color,'#000000');
  assert.equal(manifest.theme_color,'#000000');
  assert.deepEqual(manifest.icons.map(x=>x.src),['./icon-192.png?v=2','./icon-512.png?v=2']);
  assert.equal(svg.trim(),'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">\n  <rect width="512" height="512" fill="#000000"/>\n</svg>');

  assert.equal(sha256('apps/isabella/apple-touch-icon.png'),'d27d7749cb7889251cbe97f465f76622b58ee35fa7849105b983c2754591d7d7');
  assert.equal(sha256('apps/isabella/icon-192.png'),'37f643b62944f2afc59fc4efb13cfd3c79610a481fdf8cd0c1e18fe7cc517255');
  assert.equal(sha256('apps/isabella/icon-512.png'),'7e65b511beab6d74a586a64b51584a9d6bb8375d8330f35e8019bbceb9c1b310');
});

test('service worker caches and displays the black icon assets',()=>{
  const sw=text('apps/isabella/sw.js');
  assert.ok(sw.includes("isabella-shell-v116"));
  assert.ok(sw.includes("'./apple-touch-icon.png?v=2'"));
  assert.ok(sw.includes("'./icon-192.png?v=2'"));
  assert.ok(sw.includes("'./icon-512.png?v=2'"));
  assert.ok(sw.includes("icon: './icon-192.png?v=2'"));
});
