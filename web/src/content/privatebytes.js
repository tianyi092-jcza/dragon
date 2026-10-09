// Opt-in exact private byte transport. NOT RuntimeManifest, Trial, decoding or permission.
// Existing Root authorizes EVERY GET; no settled-byte cache can bypass that check.
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,hash=/^[a-f0-9]{64}$/;
const purposes=['data','images','fallback-spring','fallback-summer','fallback-autumn','fallback-winter'];
function need(ok,code){if(!ok)throw new TypeError('PRIVATE_BYTES_'+code);}
function fields(value,keys){need(value&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null),'FIELDS');const names=Reflect.ownKeys(value);need(names.length===keys.length&&keys.every(k=>names.includes(k)),'FIELDS');const copy={};for(const k of keys){const d=Object.getOwnPropertyDescriptor(value,k);need(d&&Object.hasOwn(d,'value')&&d.enumerable,'FIELDS');copy[k]=d.value;}return copy;}
/** Caller supplies a trusted local lifecycle assertion, never an HTTP authority.
 * Headers/hash are byte/context checks ONLY. No resource is installed in an engine.
 * Concurrent same-locator reads share one in-flight GET but never a settled cache.
 */
export function createPrivateByteContext(reference,{fetcher=globalThis.fetch,subtle=globalThis.crypto?.subtle,assertCurrent}={}){
  const ref=Object.freeze(fields(reference,['gameId','draftRevision','sourceDigest','dependencyDigest']));
  need(typeof ref.gameId==='string'&&uuid.test(ref.gameId)&&typeof ref.draftRevision==='string'&&/^[1-9][0-9]{0,63}$/.test(ref.draftRevision),'REFERENCE');
  for(const k of ['sourceDigest','dependencyDigest'])need(typeof ref[k]==='string'&&hash.test(ref[k]),'REFERENCE');
  need(typeof fetcher==='function'&&typeof subtle?.digest==='function'&&typeof assertCurrent==='function','PORTS');
  const pending=new Map();let closed=false;
  function check(){need(!closed,'CLOSED');assertCurrent();need(!closed,'CLOSED');}
  function locator(value){
    const kind=Object.getOwnPropertyDescriptor(value??{},'kind');need(kind&&Object.hasOwn(kind,'value'),'FIELDS');
    let keys=['kind','gameId','draftRevision','sourceDigest','assetId','sha256','byteLength'];
    if(kind.value==='private-stage')keys=[...keys,'purpose','operationId'];else if(kind.value==='private-library')keys=[...keys,'registryId','catalogRoot','logicalURL','mime'];else need(false,'KIND');
    const x=fields(value,keys);for(const k of ['gameId','draftRevision','sourceDigest'])need(x[k]===ref[k],'CONTEXT');
    need(typeof x.sha256==='string'&&hash.test(x.sha256)&&Number.isSafeInteger(x.byteLength)&&x.byteLength>0,'DESCRIPTOR');
    if(x.kind==='private-stage'){need(typeof x.purpose==='string'&&purposes.includes(x.purpose)&&typeof x.operationId==='string'&&uuid.test(x.operationId)&&typeof x.assetId==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x.assetId)&&x.byteLength<=4*1024*1024,'DESCRIPTOR');}
    else{need(typeof x.assetId==='string'&&/^library-[0-9]{3}$/.test(x.assetId)&&Number(x.assetId.slice(8))<398&&x.registryId==='approved-available-library-76cdf28-1'&&typeof x.catalogRoot==='string'&&hash.test(x.catalogRoot)&&typeof x.logicalURL==='string'&&/^[A-Za-z0-9_/-]+\.(bin|json|png|flac|wav|woff2)$/.test(x.logicalURL)&&!x.logicalURL.startsWith('/')&&!x.logicalURL.includes('//')&&typeof x.mime==='string'&&x.byteLength<=16*1024*1024,'DESCRIPTOR');}
    return Object.freeze(x);
  }
  function path(x){if(x.kind==='private-stage')return `/api/games/${ref.gameId}/stage-jobs/${x.purpose}/${x.operationId}/artifacts/${x.assetId}`;return `/api/games/${ref.gameId}/draft/library-assets/${x.assetId}?revision=${ref.draftRevision}`;}
  async function retrieve(x){
    let response,reader,complete=false,failure=false;
    try{
      check();response=await fetcher(path(x),{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/octet-stream'}});check();
      need(response?.status===200,'HTTP_'+response?.status);need(!response.redirected,'REDIRECT');
      for(const [header,expected]of [['x-game-id',ref.gameId],['x-draft-revision',ref.draftRevision],['x-source-sha256',ref.sourceDigest],['x-dependency-sha256',ref.dependencyDigest],['x-content-sha256',x.sha256],['cache-control','no-store'],['content-type','application/octet-stream']])need(response.headers.get(header)===expected,'HEADER');
      const admission=x.kind==='private-stage'?'stage-only':'private-available-bytes-only';need(response.headers.get('x-content-admission')===admission,'ADMISSION');if(x.kind==='private-library')need(response.headers.get('x-library-root')===x.catalogRoot,'HEADER');
      const length=response.headers.get('content-length');if(length!==null)need(/^[1-9][0-9]*$/.test(length)&&length===String(x.byteLength),'LENGTH');
      need(typeof response.body?.getReader==='function','BODY');reader=response.body.getReader();const bytes=new Uint8Array(x.byteLength);let used=0;
      while(true){check();const part=await reader.read();check();if(part.done)break;need(part.value instanceof Uint8Array&&part.value.length<=bytes.length-used,'LENGTH');bytes.set(part.value,used);used+=part.value.length;}
      need(used===bytes.length,'LENGTH');check();const digest=await subtle.digest('SHA-256',bytes);check();const actual=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');need(actual===x.sha256,'SHA');complete=true;return bytes;
    }catch(error){failure=true;throw error;}finally{
      // Keep the primary HTTP/integrity/lifecycle failure if owned cleanup also fails.
      // Cancellation is NOT EOF/provider drain certification.
      try{
        if(reader){try{if(!complete)await reader.cancel();}finally{reader.releaseLock();}}
        else if(response?.body&&!response.body.locked){await response.body.cancel();}
      }catch(cleanupError){if(!failure)throw cleanupError;}
    }
  }
  async function read(value){
    check();const x=locator(value),key=JSON.stringify(['private-bytes-1',ref,x]);let task=pending.get(key);
    if(!task){need(pending.size<8,'CONCURRENCY');task=retrieve(x);pending.set(key,task);const remove=()=>{if(pending.get(key)===task)pending.delete(key);};task.then(remove,remove);}
    const bytes=await task;check();return bytes.slice();
  }
  function close(){closed=true;pending.clear();}
  check();return Object.freeze({read,close,mode:'private-bytes-1',runtimeAllowed:false,trialAllowed:false,releaseAllowed:false,deleteAllowed:false});
}
