import {lockStorage} from '../shared/storage.js';
document.getElementById('manage').addEventListener('click',()=>chrome.runtime.openOptionsPage());
document.getElementById('scan').addEventListener('click',async () => {
  const status=document.getElementById('status');
  try {
    await lockStorage();
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if (!tab?.id || !/^(https?:|file:)/.test(tab.url || '')) throw new Error('请在普通招聘网页打开插件，浏览器内部页面无法扫描。');
    await chrome.tabs.create({url:chrome.runtime.getURL('workspace/index.html')+'?tab='+tab.id});
    window.close();
  } catch {status.textContent='无法打开扫描工作台。请切到招聘网页后重试；file:// 测试页需开启“允许访问文件网址”。';}
});
