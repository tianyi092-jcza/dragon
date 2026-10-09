// Current explicit SQL reference multiplicity, NOT authority, complete graph or a deletion plan.
import { createHash } from 'node:crypto';
import { fail } from './security.js';
const sha = value => createHash('sha256').update(value).digest('hex');
const objectTables = ['copy_objects','draft_objects','draft_references','data_compile_objects','image_compile_objects','fallback_compile_objects'];
function encoded(value) { const text=JSON.stringify(value); if(Buffer.byteLength(text)>4*1024*1024)fail(413,'DELETE_REFERENCE_EDGES_BUDGET'); return text; }
function parsed(text) { try { return JSON.parse(text); } catch { fail(503,'DELETE_INVENTORY_RECORD'); } }
function compare(a,b) { if(a<b)return -1; if(a>b)return 1; return 0; }
// Input is an actual authorized capture made NOW by GameDeletionInventory; this helper alone grants nothing.
export function buildPrivateReferenceEdges(capture) {
 const nodes=new Map(),rowDigests=new WeakMap();let edgeCount=0;
 const edge=(table,row,field,hash,length)=>{
  if(typeof hash!=='string'||!/^[a-f0-9]{64}$/.test(hash)||length!==null&&(!Number.isSafeInteger(length)||length<1))fail(503,'DELETE_INVENTORY_REFERENCE');
  let node=nodes.get(hash);if(!node){node={sha256:hash,byteLength:length,edges:[]};nodes.set(hash,node);if(nodes.size>10000)fail(413,'DELETE_REFERENCE_EDGES_BUDGET');}
  if(length!==null&&node.byteLength!==null&&length!==node.byteLength)fail(503,'DELETE_INVENTORY_LENGTH');
  if(length!==null)node.byteLength=length;
  if(!rowDigests.has(row))rowDigests.set(row,sha(encoded(row)));
  node.edges.push({table,recordDigest:rowDigests.get(row),field});if(++edgeCount>50000)fail(413,'DELETE_REFERENCE_EDGES_BUDGET');
 };
 const root=(table,row)=>{const prefix='private/'+capture.gameId+'/';if(typeof row.root_key!=='string'||!row.root_key.startsWith(prefix))fail(503,'DELETE_INVENTORY_REFERENCE');edge(table,row,'root_key',row.root_key.slice(prefix.length),null);};
 for(const table of objectTables)for(const row of capture.rows[table])edge(table,row,'sha256',row.sha256,row.byte_length);
 for(const row of capture.rows.content_snapshots)root('content_snapshots',row);
 for(const row of capture.rows.copy_origins)edge('copy_origins',row,'baseline_root',row.baseline_root,row.baseline_length);
 for(const row of capture.rows.compile_jobs){root('compile_jobs',row);const records=parsed(row.checkpoint_json);if(!Array.isArray(records)||records.length>16)fail(503,'DELETE_INVENTORY_RECORD');for(let i=0;i<records.length;i++){const record=records[i];if(!record||!Array.isArray(record.outputs)||record.outputs.length>128)fail(503,'DELETE_INVENTORY_RECORD');for(let j=0;j<record.outputs.length;j++){const output=record.outputs[j];edge('compile_jobs',row,'checkpoint['+i+'].outputs['+j+']',output?.sha256,output?.byteLength);}}}
 const result=[...nodes.values()].sort((a,b)=>compare(a.sha256,b.sha256));
 for(const node of result){node.edges.sort((a,b)=>compare(encoded(a),encoded(b)));for(const item of node.edges)Object.freeze(item);Object.freeze(node.edges);Object.freeze(node);}
 const referenceDigest=sha(encoded({gameId:capture.gameId,rowRevision:capture.rowRevision,sqlDigest:capture.sqlDigest,nodes:result}));
 return Object.freeze({nodes:Object.freeze(result),edgeCount,referenceDigest});
}
