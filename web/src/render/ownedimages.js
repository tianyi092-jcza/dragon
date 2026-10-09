// Shared owned presentation I/O. Role limits are engineering input, not authority.
export function createOwnedImageResources({loadImage,assertCurrent},{role,limit,prefix}) {
  if(!(role instanceof RegExp)||!Number.isInteger(limit)||limit<1||limit>127||typeof prefix!=='string')throw new TypeError('OWNED_IMAGE_POLICY');
  if(typeof loadImage!=='function'||typeof assertCurrent!=='function')throw new TypeError(prefix+'_PORTS');
  const entries=new Map(),queue=[];let closed=false,active=0;
  function check(){if(closed)throw new Error(prefix+'S_CLOSED');assertCurrent();if(closed)throw new Error(prefix+'S_CLOSED');}
  function release(handle){try{handle?.dispose();}catch{/* Owned cleanup cannot replace a primary read/lifecycle failure. */}}
  function key(value){if(typeof value!=='string'||!role.test(value))throw new TypeError(prefix+'_ROLE');return value;}
  function pump(){while(!closed&&active<4&&queue.length){const e=queue.shift();active++;void run(e).finally(()=>{active--;pump();});}}
  function current(e){check();if(entries.get(e.url)!==e)throw new Error(prefix+'_STALE');}
  async function run(e){let handle,delivered=false;try{current(e);handle=await loadImage(e.url);current(e);if(!handle?.image||typeof handle.dispose!=='function')throw new TypeError(prefix+'_HANDLE');e.handle=handle;delivered=true;check();e.ready=true;for(const cb of e.callbacks){current(e);cb();current(e);}current(e);e.resolve(handle.image);}catch(error){e.ready=false;if(delivered&&e.handle===handle){e.handle=null;release(handle);}e.reject(error);}finally{e.settled=true;e.callbacks.clear();if(handle&&!delivered)release(handle);}}
  function start(url,onReady){check();url=key(url);if(entries.size>=limit&&!entries.has(url))throw new Error(prefix+'_BUDGET');const previous=entries.get(url),oldHandle=previous?.handle;if(previous){previous.handle=null;previous.ready=false;}release(oldHandle);check();if(entries.get(url)!==previous)throw new Error(prefix+'_STALE');let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});void promise.catch(()=>{});const e={url,promise,resolve,reject,handle:null,ready:false,settled:false,callbacks:new Set(typeof onReady==='function'?[onReady]:[])};entries.set(url,e);queue.push(e);pump();return e;}
  function getImage(url,onReady){check();url=key(url);const e=entries.get(url);if(!e){start(url,onReady);return null;}if(e.ready)return e.handle.image;if(typeof onReady==='function'&&!e.handle&&!e.settled&&e.callbacks.size===0)e.callbacks.add(onReady);return null;}
  async function loadImages(urls){check();if(!Array.isArray(urls)||urls.length>limit)throw new TypeError(prefix+'_LIST');const captured=urls.map(key);if(new Set(captured).size!==captured.length)throw new TypeError(prefix+'_LIST');const tasks=captured.map(url=>{const e=entries.get(url);return e&&!e.ready&&!e.settled?e:start(url);});const result=await Promise.all(tasks.map(e=>e.promise));check();return result;}
  function close(){if(closed)return;closed=true;for(const e of queue.splice(0))e.reject(new Error(prefix+'S_CLOSED'));for(const e of entries.values()){const handle=e.handle;e.handle=null;e.ready=false;e.callbacks.clear();release(handle);}entries.clear();}
  check();return Object.freeze({getImage,loadImages,assertCurrent:check,close});
}
