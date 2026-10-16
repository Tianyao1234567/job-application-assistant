(() => {
  const origin = 'http://127.0.0.1:17321';
  if (location.origin !== origin || window !== window.top) return;
  window.addEventListener('message',event => {
    if (event.source !== window || event.origin !== origin || event.data?.channel !== 'job-local' || event.data.type !== 'connect') return;
    const key = document.querySelector('meta[name="local-key"]')?.content;
    if (!key || event.data.key !== key) return;
    chrome.runtime.sendMessage({type:'local-pair',key}).then(result => {
      window.postMessage({channel:'job-local',type:'connected',ok:result?.ok === true},origin);
    }).catch(() => window.postMessage({channel:'job-local',type:'connected',ok:false},origin));
  });
  window.postMessage({channel:'job-local',type:'extension-ready'},origin);
})();
