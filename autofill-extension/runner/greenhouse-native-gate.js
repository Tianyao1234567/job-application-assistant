// Both functions are serialized by chrome.scripting and execute in the MAIN
// world of one verified top-level document. The key is never passed via DOM.
export function installNativeGate({key,source,submitUrl,confirmationUrl,isolatedMarker}) {
  const controlName='__jobNativeGateControl';
  const isolated=location.origin==='https://job-boards.greenhouse.io'&&/^\/mattermost\/jobs\/900\d{6}$/.test(location.pathname)&&
    /^[a-f0-9]{48}$/.test(isolatedMarker||'')&&document.querySelector('meta[name="job-isolated-execution"]')?.content===isolatedMarker;
  if(location.href!==source||(!isolated&&location.origin!=='http://127.0.0.1:17322')||
    new URL(submitUrl).origin!==location.origin||!globalThis.navigation||
    typeof key!=='string'||!key||Object.hasOwn(globalThis,controlName))return {ok:false};
  const nativeFetch=globalThis.fetch.bind(globalThis);
  const target=new URL(submitUrl);
  const failure=()=>new TypeError('Managed application request was not released');
  let phase='idle',pending,deadline,resolveCapture;
  const capture=new Promise(resolve=>{resolveCapture=resolve;});
  function stop() {
    clearTimeout(deadline);
    if(phase!=='released'){
      phase='closed';
      resolveCapture(null);
      pending?.reject(failure());
      pending=null;
    }
  }
  function guardedFetch(input,init) {
    let url;
    try{url=new URL(input instanceof Request?input.url:input,location.href);}catch{
      return nativeFetch(input,init);
    }
    const method=String(init?.method??(input instanceof Request?input.method:'GET')).toUpperCase();
    if(url.origin!==target.origin||url.pathname!==target.pathname||['GET','HEAD'].includes(method))return nativeFetch(input,init);
    const keys=init?Object.keys(init).sort().join(','):'';
    if(phase!=='idle'||url.href!==submitUrl||location.href!==source||typeof input!=='string'||
      keys!=='body,headers,method'||init.method!=='POST'||typeof init.body!=='string'||
      init.body.length>12582912||!init.headers||Object.keys(init.headers).length!==1||
      init.headers['Content-Type']!=='application/json'){
      stop();
      return Promise.reject(failure());
    }
    phase='captured';
    const view=Object.freeze({requestId:crypto.randomUUID(),url:url.href,method:'POST',
      headers:Object.freeze({'content-type':'application/json'}),credentials:'same-origin',redirect:'follow',body:init.body});
    return new Promise((resolve,reject)=>{
      pending={view,input,resolve,reject};
      resolveCapture(view);
    });
  }
  // Preserve the application's Response object and its own navigation.
  // An application navigation needs the real Response from this fetch first.
  function release(value) {
    if(phase!=='captured'||!pending||globalThis.fetch!==guardedFetch||
      location.href!==source||
      value?.requestId!==pending.view.requestId||value.body!==pending.view.body){
      stop();
      return {ok:false};
    }
    const {view,input,resolve,reject}=pending;
    pending=null;
    phase='released';
    clearTimeout(deadline);
    return new Promise(result=>{
      nativeFetch(input,{method:view.method,headers:{'Content-Type':'application/json'},body:view.body}).then(response=>{
        if(!response.ok||response.redirected||response.url!==submitUrl){
          resolve(response);
          result({ok:false});
          return;
        }
        const onNavigate=event=>{
          if(!event.isTrusted||event.userInitiated||event.destination.sameDocument||
            event.sourceElement||event.destination.url!==confirmationUrl)return;
          clearTimeout(wait);
          navigation.removeEventListener('navigate',onNavigate);
          result({ok:true,requestId:view.requestId,status:response.status,responseUrl:response.url,confirmationObserved:true});
        };
        const wait=setTimeout(()=>{
          navigation.removeEventListener('navigate',onNavigate);
          result({ok:false});
        },4000);
        navigation.addEventListener('navigate',onNavigate);
        resolve(response);
      },error=>{
        reject(error);
        result({ok:false});
      });
    });
  }
  try{
    Object.defineProperty(globalThis,controlName,{value:(secret,action,value)=>{
      if(secret!==key)return {ok:false};
      if(action==='cancel'){stop();return {ok:true};}
      if(action==='ready')return {ok:phase==='idle'&&location.href===source&&globalThis.fetch===guardedFetch};
      if(action==='capture')return capture;
      if(action==='release')return release(value);
      return {ok:false};
    }});
    Object.defineProperty(globalThis,'fetch',{value:guardedFetch,writable:false,configurable:false});
  }catch{stop();return {ok:false};}
  // The original client prevents default and uses fetch. Keep native form
  // fallback from issuing a second POST if hydration is missing.
  addEventListener('submit',event=>{
    if(event.target instanceof HTMLFormElement&&new URL(event.target.action,location.href).pathname===target.pathname)event.preventDefault();
  });
  addEventListener('pagehide',stop,{once:true});
  deadline=setTimeout(stop,15000);
  return {ok:true};
}

export function controlNativeGate(key,action,value) {
  return globalThis.__jobNativeGateControl?.(key,action,value)??{ok:false};
}
