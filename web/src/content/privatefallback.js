// Opt-in one generated seasonal fallback bitmap. NOT general large PNG/runtime permission.
import { createPrivateByteContext } from './privatebytes.js';
import { inspectFixedFallbackPNG } from './privatepng.js';
const seasons=['spring','summer','autumn','winter'];
function need(value,code){if(!value)throw new TypeError('PRIVATE_FALLBACK_'+code);}
function capture(value){need(value&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null),'LOCATOR');const copy={};for(const key of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,key);need(typeof key==='string'&&d.enumerable&&Object.hasOwn(d,'value'),'LOCATOR');Object.defineProperty(copy,key,{value:d.value,enumerable:true});}return Object.freeze(copy);}
/** Local lifecycle callback is not server authority. Every read uses original authenticated
 * byte transport; no settled cache. ONE owned/pending6144x4096 bitmap (~96MiB RGBA),
 * not a native decoder peak-memory/CPU quota. No large-library or all-purpose exception.
 * Exposed pixels are caller-readable; close/dispose is ownership, not DRM/provider drain.
 */
export function createPrivateFallbackContext(reference,{fetcher,subtle,assertCurrent,decodeBitmap=globalThis.createImageBitmap,BlobType=globalThis.Blob}={}){
  need(typeof assertCurrent==='function','PORTS');let closed=false,pending=false,owned;
  function check(){need(!closed,'CLOSED');assertCurrent();need(!closed,'CLOSED');}
  const bytes=createPrivateByteContext(reference,{fetcher,subtle,assertCurrent:check});
  async function readPNG(value){
    check();need(typeof decodeBitmap==='function'&&typeof BlobType==='function','PORTS');const x=capture(value);need(x.kind==='private-stage'&&typeof x.purpose==='string'&&seasons.some(s=>x.purpose==='fallback-'+s&&x.assetId==='fallback_'+s),'ROLE');need(!pending&&!owned,'OWNED_BUDGET');pending=true;let image,delivered=false;
    try{const raw=await bytes.read(x);check();const shape=inspectFixedFallbackPNG(raw);check();image=await decodeBitmap(new BlobType([raw],{type:'image/png'}),{premultiplyAlpha:'none',colorSpaceConversion:'none',imageOrientation:'none'});check();need(image&&image.width===shape.width&&image.height===shape.height&&typeof image.close==='function','DECODE');let disposed=false;const handle=Object.freeze({image,width:shape.width,height:shape.height,dispose(){if(disposed)return;disposed=true;if(owned===handle)owned=undefined;image.close();}});owned=handle;delivered=true;return handle;
    }finally{pending=false;if(image&&!delivered){try{image.close();}catch{/* Retain primary lifecycle/decode failure; no provider closure claim. */}}}
  }
  function close(){if(closed)return;closed=true;bytes.close();owned?.dispose();}
  check();return Object.freeze({readPNG,close,mode:'private-fixed-fallback-1',runtimeAllowed:false,trialAllowed:false,releaseAllowed:false,deleteAllowed:false});
}
