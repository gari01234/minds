import {cpSync, mkdirSync, rmSync, writeFileSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
rmSync(dist, {recursive:true, force:true});
mkdirSync(dist, {recursive:true});
for (const app of ['theory','isabella']) cpSync(new URL(`apps/${app}/`,root),new URL(`${app}/`,dist),{recursive:true});
cpSync(new URL('shared/',root),new URL('shared/',dist),{recursive:true});
// Stamp the HTML that was actually published, not a cached or hardcoded
// version label. Offline clients keep the SHA of their own loaded HTML.
const stamp = /^[0-9a-f]{40}$/i.test(process.env.GITHUB_SHA||'')
  ? process.env.GITHUB_SHA.toLowerCase() : 'local';
const publishedIndex = new URL('isabella/index.html',dist);
const publishedHtml = readFileSync(publishedIndex,'utf8');
const stamped = publishedHtml.replace(
  '<meta name="minds-build-sha" content="local">',
  '<meta name="minds-build-sha" content="'+stamp+'">'
);
if(stamped===publishedHtml)throw new Error('Build SHA meta tag missing');
writeFileSync(publishedIndex,stamped);
writeFileSync(new URL('.nojekyll',dist),'');
console.log(`Built ${fileURLToPath(dist)} with /theory/ and /isabella/`);
