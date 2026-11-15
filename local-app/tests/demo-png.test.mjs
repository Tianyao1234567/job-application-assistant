import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {decodeScreenshotPng,verifyOpaqueMaskPixels} from './demo-png.mjs';

function chunk(type,body){const header=Buffer.alloc(8);header.writeUInt32BE(body.length);header.write(type,4);return Buffer.concat([header,body,Buffer.alloc(4)]);}
function fixture(filters,channels=3){
  // Small synthetic verification input only; never a demonstration artifact.
  const width=8,height=filters.length,stride=width*channels,pixels=Buffer.alloc(stride*height),encoded=Buffer.alloc((stride+1)*height);
  const paeth=(a,b,c)=>{const p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);return da<=db&&da<=dc?a:db<=dc?b:c;};
  for(let y=0;y<height;y++)for(let x=0;x<stride;x++)pixels[y*stride+x]=channels===4&&x%4===3?255:[203,213,225][x%channels]??255;
  for(let y=0;y<height;y++){
    const filter=filters[y];encoded[y*(stride+1)]=filter;
    for(let x=0;x<stride;x++){
      const at=y*stride+x,left=x>=channels?pixels[at-channels]:0,up=y?pixels[at-stride]:0,corner=y&&x>=channels?pixels[at-stride-channels]:0;
      const prediction=filter===0?0:filter===1?left:filter===2?up:filter===3?Math.floor((left+up)/2):paeth(left,up,corner);
      encoded[y*(stride+1)+1+x]=(pixels[at]-prediction)&255;
    }
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=channels===4?6:2;
  return {bytes:Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(encoded)),chunk('IEND',Buffer.alloc(0))]),pixels};
}

test('screenshot review decodes every PNG row filter and checks actual opaque pixels',()=>{
  for(const channels of [3,4]){
    const input=fixture([0,1,2,3,4],channels),image=decodeScreenshotPng(input.bytes);
    assert.deepEqual(image.pixels,input.pixels);
    assert.equal(verifyOpaqueMaskPixels(image,[{x:0,y:0,width:8,height:5}]).checkedPixels,40);
  }
});

test('screenshot review fails on one exposed pixel, transparent alpha or invalid mask bounds',()=>{
  const image=decodeScreenshotPng(fixture([0,1],4).bytes),rectangle={x:0,y:0,width:8,height:2};
  image.pixels[0]=0;assert.throws(()=>verifyOpaqueMaskPixels(image,[rectangle]),/unmasked/);
  image.pixels[0]=203;image.pixels[3]=0;assert.throws(()=>verifyOpaqueMaskPixels(image,[rectangle]),/opaque/);
  assert.throws(()=>verifyOpaqueMaskPixels(image,[{x:-1,y:0,width:1,height:1}]),/bounds/);
  assert.throws(()=>decodeScreenshotPng(fixture([0]).bytes.subarray(0,30)),/Truncated/);
});
