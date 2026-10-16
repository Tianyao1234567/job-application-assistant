// Fixed local fixture adapter, executed only in an isolated world on the exact local origin.
(() => {
  const api = globalThis.JobLocal ||= {};
  const fail = (kind,message) => ({ok:false,kind,message});
  function context(expected,requireForm=false) {
    if (location.origin !== 'http://127.0.0.1:17322' || !['alpha','beta'].includes(expected.tenant) || !location.pathname.startsWith('/site/'+expected.tenant+'/')) return fail('structure','招聘页面不属于当前网站范围。');
    const marker=document.querySelector('[data-session-status]');
    if (!marker) return fail('manual','未能可靠识别当前登录状态，请人工检查。');
    const status=marker.dataset.sessionStatus, account=marker.dataset.account || '', tenant=marker.dataset.tenant || '';
    let login={status:['ready','login','expired','verification'].includes(status)?status:'unknown',account,tenant};
    if (tenant !== expected.tenant || (status === 'ready' && account !== expected.expectedAccount)) login.status='account';
    if (login.status !== 'ready') return {...fail(login.status === 'account'?'account':login.status === 'unknown'?'manual':'login',login.status === 'account'?'当前账号或公司范围不符，请切换后重新检查。':login.status === 'verification'?'网站需要人工验证。':login.status === 'expired'?'登录已失效，请在此浏览器重新登录。':'请在投递浏览器完成登录后重新检查。'),login};
    const form=document.querySelector('[data-application-form]');
    if (requireForm && (!form || form.dataset.jobId !== expected.jobId || form.dataset.tenant !== expected.tenant || form.dataset.account !== expected.expectedAccount || form.querySelector('input[name="jobId"]')?.value !== expected.jobId)) return {...fail('structure','申请表的岗位、公司或账号已变化，已停止操作。'),login};
    return {ok:true,login,form};
  }
  function receipt(expected) {
    const marker=document.querySelector('[data-receipt-id]');
    if (!marker) return null;
    if (marker.dataset.jobId !== expected.jobId || marker.dataset.tenant !== expected.tenant || marker.dataset.account !== expected.expectedAccount || !marker.dataset.receiptId || !/^[a-f0-9]{64}$/.test(marker.dataset.sha256 || '') || !Number.isInteger(Number(marker.dataset.fileSize)) || Number(marker.dataset.fileSize)<=0) throw new Error('回执与当前岗位或账号不符。');
    return {id:marker.dataset.receiptId,jobId:marker.dataset.jobId,account:marker.dataset.account,fileName:marker.dataset.fileName,fileSize:Number(marker.dataset.fileSize),sha256:marker.dataset.sha256};
  }
  async function liveContext(expected,layout) {
    try {
      const response=await fetch('/site/'+expected.tenant+'/session',{cache:'no-store',credentials:'same-origin',redirect:'error',signal:AbortSignal.timeout(5000)});
      if(!response.ok)return fail('login','无法确认网站会话，请重新检查登录。');
      const json=await response.json(), session=json.login || json;
      if(session.tenant!==expected.tenant || (session.status==='ready' && session.account!==expected.expectedAccount))return fail('account','当前账号或公司范围不符，请重新检查。');
      if(session.status!=='ready')return {...fail(session.status==='unknown'?'manual':'login',session.status==='verification'?'网站需要人工验证。':'登录已失效或尚未完成，请重新登录。'),login:{status:session.status,account:session.account || '',tenant:session.tenant}};
      return checkedForm(expected,layout);
    }catch{return fail('login','网站会话检查失败，已停止填写或提交。');}
  }
  api.read = (op,expected) => {
    try {
      const current=context(expected);
      if (op === 'check') return {ok:true,login:current.login || {status:'unknown',account:'',tenant:expected.tenant}};
      if (op === 'discover') {
        if (location.origin !== 'http://127.0.0.1:17322' || location.pathname !== '/site/'+expected.tenant+'/jobs') return fail('structure','岗位列表地址已变化。');
        const jobs=[...document.querySelectorAll('a[data-job-id]')].map(a=>({jobId:a.dataset.jobId,title:a.dataset.title || a.textContent.trim(),company:a.dataset.company || '',location:a.dataset.location || '',url:a.href,tenant:expected.tenant}));
        if (jobs.some(j=>!j.jobId || new URL(j.url).origin !== location.origin || new URL(j.url).pathname !== '/site/'+expected.tenant+'/jobs/'+encodeURIComponent(j.jobId))) return fail('structure','列表中的岗位链接不符合接入规则。');
        return {ok:true,jobs,login:current.login};
      }
      if (!current.ok) return current;
      const existing=receipt(expected);
      if (op === 'verify') return {ok:true,receipt:existing,login:current.login};
      if (existing) return {ok:true,receipt:existing,login:current.login};
      if (op === 'detail') {
        const link=document.querySelector('a[data-apply-link]');
        return link ? {ok:true,applyUrl:link.href,login:current.login} : fail('structure','没有找到明确的申请入口，需人工检查。');
      }
      const checked=context(expected,true); if (!checked.ok) return checked;
      const scan=JobFill.scan();
      const question=checked.form.querySelector('[data-question-key="motivation"]');
      let missing=null;
      if (question) {
        const node=question.matches('textarea,input')?question:question.querySelector('textarea,input');
        const text=question.dataset.questionText || question.querySelector('label')?.textContent?.trim() || JobFill.evidence(node).label;
        const scope=question.dataset.questionScope || '';
        if (!node || node.name !== 'motivation' || !scope || !text || JobFill.fieldGuard(node,JobFill.evidence(node))) return fail('structure','补充问题的结构或保护规则已变化。');
        if (!node.value.trim()) missing={key:'motivation',text,scope};
      }
      return {ok:true,login:checked.login,layout:scan.layout,question:missing};
    } catch {return fail('structure','网页回执或表单结构不符合当前接入规则。');}
  };
  function checkedForm(expected,layout) {
    const checked=context(expected,true); if (!checked.ok) return checked;
    const scan=JobFill.scan();
    return scan.layout === layout ? {...checked,scan} : fail('structure','页面结构已变化，请重新检查后继续。');
  }
  api.fillField = async (expected,layout,name,value) => {
    const checked=await liveContext(expected,layout);if(!checked.ok)return checked;
    const nodes=[...checked.form.elements].filter(node=>node.name===name);
    if(nodes.length!==1)return fail('structure','普通资料字段缺失或存在歧义，请人工检查。');
    const node=nodes[0], field=checked.scan.fields.find(f=>JobFill.nodes.get(f.token)?.node===node);
    if(!field || field.blocked || JobFill.fieldGuard(node,JobFill.evidence(node)))return fail('manual','字段受到保护，不能自动填写。');
    if(node.value?.trim() && node.value!==value)return fail('manual','保留网页已有内容，请人工核对后继续。');
    const result=await JobFill.apply({site:checked.scan.site,layout,approvals:[{token:field.token,signature:field.signature,value,overwrite:false}]});
    if(result.stale)return fail('structure','填写前页面结构已变化。');
    if(result.results.some(r=>r.status!=='已填' && r.reason!=='已为目标值'))return fail('manual','普通字段未能通过网页校验，请检查当前申请表。');
    return {ok:true,layout,filled:node.value===value?1:0};
  };
  api.upload = async (expected,layout,file) => {
    const checked=await liveContext(expected,layout);if(!checked.ok)return checked;
    const nodes=[...checked.form.querySelectorAll('input[type="file"][name="resume"]')];
    if(nodes.length!==1 || !JobFill.editable(nodes[0]))return fail('structure','简历附件控件已变化。');
    const node=nodes[0];
    const bytes=Uint8Array.from(atob(file.base64),c=>c.charCodeAt(0));
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
    if(bytes.length!==file.size || hash!==file.sha256)return fail('failure','待上传文件与已确认简历摘要不一致。');
    if(node.files.length){
      const previous=node.files[0], existingHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await previous.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('');
      if(node.files.length!==1 || previous.name!==file.name || previous.size!==file.size || existingHash!==hash)return fail('manual','保留网页已有附件，请人工核对。');
    } else {
      const transfer=new DataTransfer();transfer.items.add(new File([bytes],file.name,{type:file.mime}));
      node.files=transfer.files;node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));
    }
    if(node.files.length!==1 || node.files[0].name!==file.name || node.files[0].size!==file.size)return fail('manual','网站未接受所选简历附件。');
    return {ok:true,layout,fileName:node.files[0].name,fileSize:node.files[0].size,sha256:hash};
  };
  api.answer = async (expected,payload) => {
    const checked=await liveContext(expected,payload.layout);if(!checked.ok)return checked;
    const question=checked.form.querySelector('[data-question-key="motivation"]');
    const node=question?.matches('textarea,input')?question:question?.querySelector('textarea,input');
    const text=question?.dataset.questionText || question?.querySelector('label')?.textContent?.trim() || (node && JobFill.evidence(node).label);
    if(payload.key!=='motivation' || !node || text!==payload.text || question.dataset.questionScope!==payload.scope || payload.scope!=='local-v1:'+expected.tenant+':'+expected.jobId+':motivation:v1' || JobFill.guardText(text))return fail('structure','原问题或限定用途已变化，不能套用答案。');
    return api.fillField(expected,payload.layout,'motivation',payload.answer);
  };
  api.submit = async (expected,layout) => {
    const checked=await liveContext(expected,layout);if(!checked.ok)return {...checked,attempted:false};
    const existing=receipt(expected);if(existing)return {ok:true,receipt:existing};
    const buttons=[...checked.form.querySelectorAll('[data-submit-application]')];
    if(buttons.length!==1 || buttons[0].type!=='submit' || !JobFill.editable(buttons[0]) || !checked.form.checkValidity())return {...fail('manual','表单校验未通过或提交入口已变化，请人工检查。'),attempted:false};
    // Set before the click; even in this document, a repeated command cannot click twice.
    if(checked.form.dataset.localSubmissionAttempt)return fail('unknown','此表单已尝试提交，必须先核对回执。');
    checked.form.dataset.localSubmissionAttempt='started';
    buttons[0].click();
    for(let i=0;i<50;i++){
      await new Promise(resolve=>setTimeout(resolve,100));
      try {const found=receipt(expected);if(found)return {ok:true,receipt:found};}catch{return fail('unknown','已发出提交，但回执信息不匹配，待核实。');}
    }
    return fail('unknown','已点击提交，尚未取得可靠回执；请核对结果，勿重复提交。');
  };
})();