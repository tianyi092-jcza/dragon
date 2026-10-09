// Installed reader boundary: exactly three Web assets; no DOS/audit/profile IO.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {BUILTIN_RESOURCES} from '../web/src/content/builtinresources.generated.js';
import {BUILTIN_ENTITY_SOURCE} from '../web/src/editor/builtinentitysource.generated.js';
import {readInstalledEntitySource} from './editor_entity_source.mjs';
const root=fileURLToPath(new URL('../web/',import.meta.url)),d=BUILTIN_ENTITY_SOURCE,urls=[BUILTIN_RESOURCES.dataURL,d.manifestURL,d.resourceURL],assets=new Map();
for(const url of urls){assert.ok(!/save\.dat|\.dragon-analysis|\.\./i.test(url));assets.set(url,readFileSync(join(root,url)));}
const sha=b=>createHash('sha256').update(b).digest('hex');
const before=Object.fromEntries([...assets].map(([url,b])=>[url,sha(b)]));let calls=[];
const reader=async url=>{assert.ok(assets.has(url));calls.push(url);return assets.get(url);};
const parsed=await readInstalledEntitySource(reader);assert.deepEqual(calls,urls);assert.equal(parsed.chapters.length,20);
assert.equal(parsed.chapters.reduce((n,c)=>n+c.general32.length,0),2560);assert.equal(parsed.chapters.reduce((n,c)=>n+c.city32.length,0),3840);assert.equal(parsed.chapters.reduce((n,c)=>n+c.faction64.length,0),480);
assert.ok(Object.isFrozen(d)&&Object.isFrozen(d.resource)&&Object.isFrozen(d.sourceChapterOrder)&&Object.isFrozen(d.originalSources));
let negatives=0;
for(const target of urls){calls=[];await assert.rejects(()=>readInstalledEntitySource(async url=>{assert.ok(assets.has(url));calls.push(url);if(url===target){const corrupt=Buffer.from(assets.get(url));corrupt[0]^=1;return corrupt;}return assets.get(url);}));assert.ok(calls.every(url=>urls.includes(url)));negatives++;}
await assert.rejects(()=>readInstalledEntitySource(async url=>{assert.ok(assets.has(url));if(url===d.resourceURL)throw new Error('owned fixture missing');return assets.get(url);}));negatives++;
await assert.rejects(()=>readInstalledEntitySource(async url=>{assert.ok(assets.has(url));return url===d.resourceURL?'not bytes':assets.get(url);}));negatives++;
assert.deepEqual(await readInstalledEntitySource(),parsed); // real fixed default reader, same three assets
for(const[url,b]of assets){assert.equal(sha(b),before[url]);assert.equal(sha(readFileSync(join(root,url))),before[url]);}
process.stdout.write(JSON.stringify({result:'PASS-INSTALLED-WEB-AUTHOR-READER-NOT-DRAFT-UI',inputHashes:before,allowedURLs:urls,chapters:20,general32:2560,city32:3840,faction64:480,negativeControls:negatives,
  limits:'fixed Web assets only; no originals/ignored audit dependence, no draft/UI/actor edit/init/currentgame switch'})+'\n');
