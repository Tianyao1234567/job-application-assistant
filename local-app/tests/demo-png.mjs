// Read-only verification of actual browser PNGs. No rendering or image rewriting.
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';

function paeth(left,above,upperLeft){
  const predicted=left+above-upperLeft,a=Math.abs(predicted-left),b=Math.abs(predicted-above),c=Math.abs(predicted-upperLeft);
  return a<=b&&a<=c?left:b<=c?above:upperLeft;
}

export function decodeScreenshotPng(bytes){
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a','Only actual PNG screenshots may be reviewed');
  let offset=8,width,height,channels,ended=false;
  const compressed=[];
  while(offset<bytes.length){
    assert.ok(offset+12<=bytes.length,'Truncated screenshot PNG');
    const length=bytes.readUInt32BE(offset),type=bytes.subarray(offset+4,offset+8).toString('ascii');
    assert.ok(['IHDR','IDAT','IEND','sRGB','gAMA','cHRM','pHYs','iCCP'].includes(type),'Screenshot PNG must exclude text/EXIF metadata');
    assert.ok(offset+12+length<=bytes.length,'Truncated screenshot PNG chunk');
    if(type==='IHDR'){
      assert.equal(width,undefined,'Screenshot PNG must have one header');
      assert.equal(length,13);width=bytes.readUInt32BE(offset+8);height=bytes.readUInt32BE(offset+12);
      assert.equal(bytes[offset+16],8,'Screenshot review requires eight-bit pixels');
      const colorType=bytes[offset+17];assert.ok(colorType===2||colorType===6,'Screenshot review requires RGB/RGBA pixels');
      channels=colorType===2?3:4;
      assert.equal(bytes[offset+18],0);assert.equal(bytes[offset+19],0);assert.equal(bytes[offset+20],0,'Interlaced screenshot PNG is unsupported');
      assert.ok(width>0&&width<=1600&&height>0&&height<12000&&width*height<=20_000_000,'Screenshot dimensions exceed their bound');
    }else if(type==='IDAT')compressed.push(bytes.subarray(offset+8,offset+8+length));
    else if(type==='IEND'){assert.equal(length,0);ended=true;offset+=12;break;}
    offset+=12+length;
  }
  assert.equal(ended,true);assert.equal(offset,bytes.length);assert.ok(width&&compressed.length);
  const stride=width*channels,expected=(stride+1)*height;
  const filtered=inflateSync(Buffer.concat(compressed),{maxOutputLength:expected});assert.equal(filtered.length,expected);
  const pixels=Buffer.alloc(stride*height);
  for(let y=0;y<height;y++){
    const row=y*stride,source=y*(stride+1),filter=filtered[source];assert.ok(filter<=4,'Unknown screenshot PNG filter');
    for(let x=0;x<stride;x++){
      const left=x>=channels?pixels[row+x-channels]:0,above=y?pixels[row+x-stride]:0,upperLeft=y&&x>=channels?pixels[row+x-stride-channels]:0;
      const prediction=filter===0?0:filter===1?left:filter===2?above:filter===3?Math.floor((left+above)/2):paeth(left,above,upperLeft);
      pixels[row+x]=(filtered[source+1+x]+prediction)&255;
    }
  }
  return {width,height,channels,pixels};
}

export function verifyOpaqueMaskPixels(image,rectangles,color=[203,213,225]){
  let checkedPixels=0;
  for(const [rectangleIndex,rectangle] of rectangles.entries()){
    const {x,y,width,height}=rectangle;
    for(const value of [x,y,width,height])assert.equal(Number.isInteger(value),true,'Mask pixel bounds must be integers');
    assert.ok(width>0&&height>0&&x>=0&&y>=0&&x+width<=image.width&&y+height<=image.height,'Mask pixel bounds leave the screenshot');
    for(let row=y;row<y+height;row++)for(let column=x;column<x+width;column++){
      const index=(row*image.width+column)*image.channels;
      const actual=[image.pixels[index],image.pixels[index+1],image.pixels[index+2],image.channels===4?image.pixels[index+3]:255];
      if(actual[0]!==color[0]||actual[1]!==color[1]||actual[2]!==color[2]||actual[3]!==255){
        const error=new Error('Screenshot mask must be opaque and have no unmasked pixels');error.code='DEMO_MASK_PIXEL';
        error.demoMask={rectangleIndex,x:column,y:row,expected:[...color,255],actual,width:image.width,height:image.height};throw error;
      }
      checkedPixels++;
    }
  }
  return {rectangles:rectangles.length,checkedPixels,opaque:true};
}
