// Preserve a trusted installed source tuple before any later default change.
// Metadata only; never migrates drafts, runs DOS or installs a new game.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {BUILTIN_RESOURCES} from '../web/src/content/builtinresources.generated.js';
import {BUILTIN_ENTITY_SOURCE} from '../web/src/editor/builtinentitysource.generated.js';
import {readInstalledEditorSource} from './editor_builtin_source.mjs';
import {readInstalledEntitySource} from './editor_entity_source.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),round=process.argv[2];assert.equal(process.argv.length,3);assert.match(round??'',/^[A-Za-z0-9-]{1,64}$/);
const sha=b=>createHash('sha256').update(b).digest('hex'),inputs={};
function readWeb(url){assert.ok(url.startsWith(`content/builtin/compiled/${BUILTIN_RESOURCES.world.revision}/`)||[BUILTIN_ENTITY_SOURCE.manifestURL,BUILTIN_ENTITY_SOURCE.resourceURL].includes(url));const p='web/'+url,b=readFileSync(join(root,p));inputs[p]=sha(b);return b;}
const source=readInstalledEditorSource(BUILTIN_RESOURCES,readWeb),body=await readInstalledEntitySource(readWeb);assert.equal(source.revision,BUILTIN_RESOURCES.world.revision);assert.equal(body.chapters.length,20);
const tuple={sourceRevision:source.revision,dataURL:BUILTIN_RESOURCES.dataURL,descriptor:BUILTIN_ENTITY_SOURCE};
const bytes=Buffer.from('// Trusted immutable author-source history; entries are not arbitrary draft URLs.\nfunction freeze(value) { if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }\nexport const BUILTIN_ENTITY_HISTORY = freeze('+JSON.stringify([tuple],null,2)+');\n');
for(const p of['tools/preserve_editor_entity_history.mjs','tools/editor_builtin_source.mjs','tools/editor_entity_source.mjs','web/src/content/builtinresources.generated.js','web/src/editor/builtinentitysource.generated.js'])inputs[p]=sha(readFileSync(join(root,p)));
for(const[p,h]of Object.entries(inputs))assert.equal(sha(readFileSync(join(root,p))),h,'history input drift');
const output=join(root,'.dragon-analysis/editor-phase',round);mkdirSync(output);
const target='web/src/editor/builtinentityhistory.generated.js';if(existsSync(join(root,target)))assert.deepEqual(readFileSync(join(root,target)),bytes,'history conflict: explicit merge/review required');else writeFileSync(join(root,target),bytes,{flag:'wx'});
writeFileSync(join(output,'receipt.json'),JSON.stringify({result:'PASS-PRESERVED-TRUSTED-HISTORY',inputs,target,sha256:sha(bytes),sourceRevision:source.revision,allowedURLs:[tuple.dataURL,tuple.descriptor.manifestURL,tuple.descriptor.resourceURL],limitations:'One validated immutable historical tuple, not arbitrary content registry/adoption/authorization or draft migration; future additional versions need explicit controlled merge'},null,2)+'\n',{flag:'wx'});
process.stdout.write(JSON.stringify({result:'PASS-PRESERVED-TRUSTED-HISTORY',sha256:sha(bytes),sourceRevision:source.revision})+'\n');
