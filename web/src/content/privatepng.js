// Shared envelope only; browser owns raster decode. No authority or runtime certificate.
const MAX_PIXELS=4*1024*1024;
function need(value,code){if(!value)throw new TypeError('PRIVATE_RESOURCE_'+code);}
const crcTable=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;crcTable[n]=c>>>0;}
function crc(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
// Envelope preflight only. Browser owns DEFLATE/filter/pixel decoding. No new PNG codec.
// Default subset stays at4Mi pixels. Fixed fallback wrapper requires EXACT generated RGBA8 size.
function pngShape(bytes,fixedFallback){
  need(bytes.length>=33&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v),'PNG_SIGNATURE');const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let at=8,count=0,width,height,type,depth,palette=false,transparency=false,data=false,closedData=false,ended=false;
  while(at<bytes.length){need(++count<=4096&&bytes.length-at>=12,'PNG_CHUNKS');const length=view.getUint32(at),end=at+12+length;need(end<=bytes.length,'PNG_TRUNCATED');const kind=String.fromCharCode(...bytes.subarray(at+4,at+8));need(/^[A-Za-z]{2}[A-Z][A-Za-z]$/.test(kind),'PNG_CHUNK_TYPE');need(crc(bytes.subarray(at+4,end-4))===view.getUint32(end-4),'PNG_CRC');need(count!==1||kind==='IHDR','PNG_ORDER');if(data&&kind!=='IDAT')closedData=true;
    if(kind==='IHDR'){need(count===1&&length===13,'PNG_IHDR');width=view.getUint32(at+8);height=view.getUint32(at+12);depth=bytes[at+16];type=bytes[at+17];if(fixedFallback)need(width===6144&&height===4096&&depth===8&&type===6,'PNG_FALLBACK_SHAPE');else need(width>0&&height>0&&width<=8192&&height<=8192&&width*height<=MAX_PIXELS,'PNG_PIXELS');need((depth===8||type===3&&[1,2,4].includes(depth))&&[0,2,3,4,6].includes(type)&&bytes[at+18]===0&&bytes[at+19]===0&&bytes[at+20]===0,'PNG_FORMAT');}
    else if(kind==='PLTE'){need(!data&&!palette&&!transparency&&type!==0&&type!==4&&length>0&&length<=768&&length%3===0&&(type!==3||length/3<=2**depth),'PNG_PALETTE');palette=length/3;}
    else if(kind==='tRNS'){need(!data&&!transparency&&type!==4&&type!==6,'PNG_TRANSPARENCY');if(type===3)need(palette&&length>0&&length<=palette,'PNG_TRANSPARENCY');else{need(length===(type===0?2:6),'PNG_TRANSPARENCY');for(let i=0;i<length;i+=2)need(view.getUint16(at+8+i)<=255,'PNG_TRANSPARENCY');}transparency=true;}
    else if(kind==='IDAT'){need(!closedData&&(type!==3||palette),'PNG_ORDER');data=true;}
    else if(kind==='IEND'){need(length===0&&data&&end===bytes.length,'PNG_IEND');ended=true;at=end;break;}
    else{need(kind[0]!==kind[0].toUpperCase(),'PNG_CRITICAL');need(!['acTL','fcTL','fdAT','iCCP','gAMA','cHRM','cICP','mDCV','cLLI'].includes(kind),'PNG_METADATA');}
    at=end;
  }
  need(ended,'PNG_IEND');return {width,height};
}
export function inspectSmallPrivatePNG(bytes){return pngShape(bytes,false);}
export function inspectFixedFallbackPNG(bytes){return pngShape(bytes,true);}
