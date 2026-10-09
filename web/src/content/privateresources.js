// Opt-in private decoding, NOT a runtime manifest/permission/engine installation.
import { createPrivateByteContext } from './privatebytes.js';
import { inspectSmallPrivatePNG as pngShape } from './privatepng.js';
const MAX_JSON=4*1024*1024;
function need(value,code){if(!value)throw new TypeError('PRIVATE_RESOURCE_'+code);}
function capture(value){need(value&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null),'LOCATOR');const copy={};for(const key of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,key);need(typeof key==='string'&&d.enumerable&&Object.hasOwn(d,'value'),'LOCATOR');Object.defineProperty(copy,key,{value:d.value,enumerable:true});}return Object.freeze(copy);}
function freezeJSON(value,depth=0,budget={nodes:0}){need(depth<=32&&++budget.nodes<=200000,'JSON_BUDGET');if(typeof value==='number')need(Number.isFinite(value),'JSON_NUMBER');if(value&&typeof value==='object'){for(const child of Object.values(value))freezeJSON(child,depth+1,budget);Object.freeze(value);}return value;}
/** Every read still performs original Root-authenticated byte GET. No settled decode cache.
 * assertCurrent is caller-owned lifecycle, NOT actual server authority. Images remain
 * caller-readable after exposure: dispose/close are ownership cleanup, not DRM/revocation.
 */
export function createPrivateResourceContext(reference,{fetcher,subtle,assertCurrent,decodeBitmap=globalThis.createImageBitmap,BlobType=globalThis.Blob}={}){
  need(typeof assertCurrent==='function','PORTS');let closed=false,pendingImages=0;const images=new Set();
  function check(){need(!closed,'CLOSED');assertCurrent();need(!closed,'CLOSED');}
  const bytes=createPrivateByteContext(reference,{fetcher,subtle,assertCurrent:check});
  async function readJSON(value){check();const x=capture(value);need(Number.isSafeInteger(x.byteLength)&&x.byteLength>0&&x.byteLength<=MAX_JSON,'JSON_BUDGET');if(x.kind==='private-library')need(x.mime==='application/json'&&typeof x.logicalURL==='string'&&x.logicalURL.endsWith('.json'),'FORMAT');const raw=await bytes.read(x);check();let result;try{const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(raw);result=JSON.parse(text);}catch(cause){throw new TypeError('PRIVATE_RESOURCE_JSON',{cause});}result=freezeJSON(result);check();return result;}
  async function readPNG(value){
    check();need(typeof decodeBitmap==='function'&&typeof BlobType==='function','PNG_PORTS');const x=capture(value);if(x.kind==='private-library')need(x.mime==='image/png'&&typeof x.logicalURL==='string'&&x.logicalURL.endsWith('.png'),'FORMAT');need(images.size+pendingImages<8,'IMAGE_BUDGET');pendingImages++;let image,delivered=false;
    try{const raw=await bytes.read(x);check();const shape=pngShape(raw);check();image=await decodeBitmap(new BlobType([raw],{type:'image/png'}),{premultiplyAlpha:'none',colorSpaceConversion:'none',imageOrientation:'none'});check();need(image&&image.width===shape.width&&image.height===shape.height&&typeof image.close==='function','PNG_DECODE');
      let disposed=false;const handle=Object.freeze({image,width:shape.width,height:shape.height,dispose(){if(disposed)return;disposed=true;images.delete(handle);image.close();}});images.add(handle);delivered=true;return handle;
    }finally{pendingImages--;if(image&&!delivered){try{image.close();}catch{/* Preserve primary decoder/lifecycle error; cleanup is not provider drain. */}}}
  }
  function close(){if(closed)return;closed=true;bytes.close();let failed=false,first;for(const handle of images){try{handle.dispose();}catch(error){if(!failed){failed=true;first=error;}}}if(failed)throw first;}
  check();return Object.freeze({readJSON,readPNG,close,mode:'private-resources-1',runtimeAllowed:false,trialAllowed:false,releaseAllowed:false,deleteAllowed:false});
}
