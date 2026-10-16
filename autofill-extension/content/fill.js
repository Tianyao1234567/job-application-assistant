(() => {
  const api = globalThis.JobFill ||= {};
  const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
  function setValue(node,value) {
    const proto = node.tagName === 'SELECT' ? HTMLSelectElement.prototype : node.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto,'value').set.call(node,value);
    node.dispatchEvent(new Event('input',{bubbles:true,composed:true}));
    node.dispatchEvent(new Event('change',{bubbles:true,composed:true}));
  }
  api.setValue = setValue;
  function validation(node) {
    const described = (node.getAttribute('aria-describedby') || '').split(/\s+/).map(id=>document.getElementById(id)).filter(Boolean);
    const scope = node.closest('[data-field],.form-item,.form-group,.field,.row');
    const errors = [...described,...(scope?.querySelectorAll('[role="alert"],.error,.invalid-feedback,.el-form-item__error,.ant-form-item-explain-error') || [])];
    const visible = errors.some(error=>error.textContent.trim() && getComputedStyle(error).display !== 'none' && error.getClientRects().length);
    return node.getAttribute('aria-invalid') === 'true' || (node.validity && !node.validity.valid) || visible;
  }
  api.apply = async payload => {
    const snapshot = api.scan();
    if (snapshot.site !== payload.site || snapshot.layout !== payload.layout) return {results:[],stale:true,error:'页面结构已变化，请重新扫描并确认'};
    const batch = [], results = [];
    for (const approval of payload.approvals) {
      const record = api.nodes.get(approval.token), node = record?.node;
      const current = api.scan();
      const f = current.fields.find(field=>field.token === approval.token);
      const result = {token:approval.token,label:f?.label || '字段',status:'跳过',reason:''};
      if (current.site !== payload.site || current.layout !== payload.layout || !f || f.signature !== approval.signature || !api.editable(node)) result.reason='字段结构变化，请重扫';
      else if (f.blocked || api.fieldGuard(node,api.evidence(node))) result.reason='保护规则禁止填写';
      else if (typeof approval.value !== 'string' || approval.value.length > 10000 || !approval.value.trim()) result.reason='值无效';
      else if (node.value === approval.value) result.reason='已为目标值';
      else if (node.value?.trim() && !approval.overwrite) result.reason='保留已有内容';
      else {
        let value = approval.value;
        if (node.tagName === 'SELECT') {
          const matching = [...node.options].filter(opt=>!opt.disabled && !opt.parentElement?.disabled && (api.norm(opt.value) === api.norm(value) || api.norm(opt.textContent) === api.norm(value)));
          if (matching.length !== 1) {result.reason='下拉选项无唯一精确匹配，请手填';results.push(result);continue;}
          value = matching[0].value;
        }
        if (node.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {result.reason='仅有年月，不能补日；请手填';results.push(result);continue;}
        if (node.type === 'month' && !/^\d{4}-\d{2}$/.test(value)) {result.reason='日期精度与控件不符；请手填';results.push(result);continue;}
        if (node.maxLength > 0 && value.length > node.maxLength) {result.reason='超过网页字段长度限制';results.push(result);continue;}
        if (node.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {result.reason='邮箱格式不符';results.push(result);continue;}
        const original = node.value;
        const undo = {node,original,written:value,signature:f.signature,site:payload.site,token:f.token};
        batch.push(undo);
        try {
          setValue(node,value);
          await delay(500);
          if (!node.isConnected || node.value !== value) {result.status='校验失败';result.reason='控件回滚或重建；请重扫/手填';}
          else if (validation(node)) {result.status='校验失败';result.reason='网页显示校验异常；请检查';}
          else {result.status='已填';result.reason='500ms观察期值保持；仍需检查网页';}
        } catch {result.status='校验失败';result.reason='事件或写入失败，请手填';}
      }
      results.push(result);
    }
    if (batch.length) api.undoBatches.push(batch);
    return {results,stale:false};
  };
  api.undo = async () => {
    const batch = api.undoBatches.pop();
    if (!batch) return {results:[],error:'本页没有可撤销记录（刷新后记录清除）'};
    const results = [];
    for (const entry of [...batch].reverse()) {
      const current = api.scan(), f = current.fields.find(field=>field.token === entry.token);
      const {node} = entry;
      const result = {token:entry.token,label:f?.label || '字段',status:'跳过',reason:'用户已修改、结构变化或字段不再安全'};
      if (current.site === entry.site && f?.signature === entry.signature && !f.blocked && api.editable(node) && node.value === entry.written) {
        try {setValue(node,entry.original); await delay(100); result.status=node.value === entry.original ? '已撤销' : '校验失败';result.reason='撤销仅恢复当前页面；无法收回网站已读取或保存的数据';}
        catch {result.status='校验失败';result.reason='撤销写入失败';}
      }
      results.push(result);
    }
    return {results};
  };
})();
