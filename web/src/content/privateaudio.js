// Opt-in byte-verified audio decoding only. Not playback, loop certification or admission.
import { createPrivateByteContext } from './privatebytes.js';
const MAX_PCM=256*1024*1024;
function need(value,code){if(!value)throw new TypeError('PRIVATE_AUDIO_'+code);}
function capture(value){
  need(value&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null),'LOCATOR');
  const result={};for(const key of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,key);need(typeof key==='string'&&d.enumerable&&Object.hasOwn(d,'value'),'LOCATOR');Object.defineProperty(result,key,{value:d.value,enumerable:true});}return Object.freeze(result);
}
function shape(rate,channels,samples,targetRate){
  need(Number.isInteger(rate)&&rate>=8000&&rate<=192000&&Number.isInteger(channels)&&channels>=1&&channels<=8&&Number.isSafeInteger(samples)&&samples>0,'FORMAT');
  const frames=Math.ceil(samples*targetRate/rate);need(Number.isSafeInteger(frames)&&frames>0&&(frames+1)*channels*4<=MAX_PCM,'PCM_BUDGET');return {rate,channels,samples,frames};
}
// Metadata preflight only; native decoder owns FLAC frames/CRC and PCM conversion.
function flac(bytes,targetRate){
  need(bytes.length>=42&&[102,76,97,67].every((v,i)=>bytes[i]===v),'FLAC_SIGNATURE');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let at=4,count=0,info;
  while(true){
    need(++count<=128&&bytes.length-at>=4,'FLAC_METADATA');const type=bytes[at]&127,last=bytes[at]&128,length=(bytes[at+1]<<16)|(bytes[at+2]<<8)|bytes[at+3],end=at+4+length;
    need(type<127&&end<=bytes.length&&(count!==1||type===0),'FLAC_METADATA');
    if(type===0){need(count===1&&length===34,'FLAC_STREAMINFO');const packed=view.getBigUint64(at+14);const rate=Number(packed>>44n),channels=Number((packed>>41n)&7n)+1,bits=Number((packed>>36n)&31n)+1,samples=Number(packed&0xfffffffffn);need(bits>=4&&bits<=32,'FORMAT');info=shape(rate,channels,samples,targetRate);}
    at=end;if(last)break;
  }
  need(info&&at<bytes.length,'FLAC_FRAMES');return info;
}
function wav(bytes,targetRate){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),tag=at=>String.fromCharCode(...bytes.subarray(at,at+4));
  need(bytes.length>=44&&tag(0)==='RIFF'&&tag(8)==='WAVE'&&view.getUint32(4,true)+8===bytes.length,'WAV_SIGNATURE');let at=12,count=0,format,data;
  while(at<bytes.length){
    need(++count<=128&&bytes.length-at>=8,'WAV_CHUNKS');const kind=tag(at),length=view.getUint32(at+4,true),end=at+8+length,padded=end+(length&1);need(padded<=bytes.length,'WAV_CHUNKS');
    if(kind==='fmt '){need(!format&&!data&&(length===16||length===18&&view.getUint16(at+24,true)===0),'WAV_FORMAT');need(view.getUint16(at+8,true)===1,'WAV_FORMAT');const channels=view.getUint16(at+10,true),rate=view.getUint32(at+12,true),align=view.getUint16(at+20,true),bits=view.getUint16(at+22,true);need([8,16,24,32].includes(bits)&&align===channels*bits/8&&align>0&&view.getUint32(at+16,true)===rate*align,'WAV_FORMAT');format={channels,rate,align};}
    else if(kind==='data'){need(format&&!data&&length>0&&length%format.align===0,'WAV_DATA');data=shape(format.rate,format.channels,length/format.align,targetRate);}
    at=padded;
  }
  need(format&&data,'WAV_DATA');return data;
}
/** Local assertion is caller lifecycle, NOT server authority. Every read uses original
 * authenticated byte GET. Exposed AudioBuffers cannot be revoked; disposal only drops
 * owned bookkeeping. No settled decode cache, source nodes, automatic playback or loops.
 * PCM budget is a metadata/postdecode bound, NOT browser heap/CPU allocation enforcement.
 */
export function createPrivateAudioContext(reference,{audioContext,fetcher,subtle,assertCurrent}={}){
  need(typeof assertCurrent==='function'&&audioContext&&typeof audioContext.decodeAudioData==='function'&&Number.isInteger(audioContext.sampleRate)&&audioContext.sampleRate>=8000&&audioContext.sampleRate<=192000,'PORTS');
  const targetRate=audioContext.sampleRate;let closed=false,pending=false;const owned=new Set();
  function check(){need(!closed,'CLOSED');assertCurrent();need(!closed,'CLOSED');need(audioContext.sampleRate===targetRate&&audioContext.state!=='closed','CONTEXT');}
  const bytes=createPrivateByteContext(reference,{fetcher,subtle,assertCurrent:check});
  async function readAudio(value){
    check();const x=capture(value);need(x.kind==='private-library'&&typeof x.logicalURL==='string'&&((x.mime==='audio/flac'&&x.logicalURL.endsWith('.flac'))||(x.mime==='audio/wav'&&x.logicalURL.endsWith('.wav'))),'FORMAT');need(!pending&&owned.size===0,'OWNED_BUDGET');pending=true;
    try{
      const raw=await bytes.read(x);check();let info;if(x.mime==='audio/flac')info=flac(raw,targetRate);else info=wav(raw,targetRate);check();
      const buffer=await audioContext.decodeAudioData(raw.buffer);check();need(buffer&&buffer.sampleRate===targetRate&&buffer.numberOfChannels===info.channels&&Number.isSafeInteger(buffer.length)&&Math.abs(buffer.length-info.samples*targetRate/info.rate)<=1&&buffer.length>0&&buffer.length*info.channels*4<=MAX_PCM&&buffer.duration===buffer.length/targetRate&&typeof buffer.getChannelData==='function','DECODE');
      let disposed=false;const handle=Object.freeze({buffer,duration:buffer.duration,sampleRate:buffer.sampleRate,numberOfChannels:buffer.numberOfChannels,length:buffer.length,dispose(){if(disposed)return;disposed=true;owned.delete(handle);}});owned.add(handle);return handle;
    }finally{pending=false;}
  }
  function close(){if(closed)return;closed=true;bytes.close();for(const handle of owned)handle.dispose();}
  check();return Object.freeze({readAudio,close,mode:'private-audio-1',runtimeAllowed:false,trialAllowed:false,releaseAllowed:false,deleteAllowed:false});
}
