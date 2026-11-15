// No URL or third-party service is accepted here. Only the selected PDF bytes.
import {parentPort,workerData} from 'node:worker_threads';
let document;
try{
 const {getDocument}=await import(new URL('../runtime-deps/node_modules/pdfjs-dist/legacy/build/pdf.mjs',import.meta.url).href);
 document=await getDocument({data:new Uint8Array(workerData),isEvalSupported:false,useSystemFonts:false,disableFontFace:true,useWasm:false,useWorkerFetch:false,disableAutoFetch:true,disableRange:true,disableStream:true,verbosity:0}).promise;
 if(document.numPages>30)throw new Error('PAGE_BUDGET');
 const pages=[];let size=0;
 for(let n=1;n<=document.numPages;n++){
  const page=await document.getPage(n),content=await page.getTextContent(),lines=[];let line='',lastY=null,lastEnd=0;
  for(const item of content.items){
   if(typeof item.str!=='string')continue;
   const y=item.transform?.[5],x=item.transform?.[4]||0;
   if(lastY!==null&&Math.abs(lastY-y)>3&&line){lines.push(line.trim());line='';}
   if(line&&x-lastEnd>2)line+=' ';
   line+=item.str;lastY=y;lastEnd=x+(item.width||0);
   if(item.hasEOL&&line){lines.push(line.trim());line='';lastY=null;}
  }
  if(line.trim())lines.push(line.trim());size+=lines.join('\n').length;
  if(size>150000)throw new Error('TEXT_BUDGET');
  pages.push({page:n,lines:lines.filter(Boolean)});page.cleanup();
 }
 parentPort.postMessage({ok:true,pages});
}catch(error){parentPort.postMessage({ok:false,reason:error.name==='PasswordException'?'encrypted':error.code==='MODULE_NOT_FOUND'||error.code==='ERR_MODULE_NOT_FOUND'||/DOMMatrix|@napi-rs\/canvas|native binding/.test(error.message)?'dependency':/BUDGET/.test(error.message)?'budget':'invalid'});}
finally{await document?.destroy();}
