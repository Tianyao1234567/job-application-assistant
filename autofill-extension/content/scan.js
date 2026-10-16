(() => {
  const api = globalThis.JobFill ||= {};
  api.nodes ||= new Map(); api.undoBatches ||= [];
  const text = node => (node?.textContent || '').trim().replace(/\s+/g,' ').slice(0,180);
  function heading(container) {
    const label = container.getAttribute('aria-label');
    if (label) return label.slice(0,180);
    const labelled = container.getAttribute('aria-labelledby');
    if (labelled) return labelled.split(/\s+/).map(id=>text(document.getElementById(id))).join(' ').slice(0,180);
    return text(container.querySelector(':scope > legend,:scope > h1,:scope > h2,:scope > h3,:scope > h4,:scope > .section-title,:scope > header'));
  }
  api.evidence = node => {
    const labels = [...(node.labels || [])].map(text).filter(Boolean);
    const aria = node.getAttribute('aria-label') || '';
    const by = (node.getAttribute('aria-labelledby') || '').split(/\s+/).map(id=>text(document.getElementById(id))).filter(Boolean).join(' ');
    const row = node.closest('[data-field],.form-item,.form-group,.field,.row');
    const nearby = row ? text(row.querySelector('label,.label,.field-label')) : '';
    let container = node.parentElement, sectionNode = null;
    while (container && container !== document.body) {
      if (container.matches('fieldset,section,[role="group"],[data-section],.education-item,.experience-item,.project-item') && heading(container)) { sectionNode = container; break; }
      container = container.parentElement;
    }
    const section = sectionNode ? heading(sectionNode) : '';
    const ancestors = [];
    let parent = sectionNode?.parentElement;
    while (parent && parent !== document.body && ancestors.length < 3) {
      if (parent.matches('fieldset,section,[role="group"],[data-section]')) { const title = heading(parent); if (title) ancestors.push(title); }
      parent = parent.parentElement;
    }
    const hints = [node.name,node.id,node.placeholder,node.autocomplete].filter(Boolean).join(' ').slice(0,300);
    return {label:[...new Set([...labels,aria,by,nearby].filter(Boolean))].join(' / ').slice(0,300) || node.placeholder || node.name || node.id || '未命名字段', hints, section:[...ancestors.reverse(),section].join(' / '), sectionNode};
  };
  api.scan = () => {
    const fields = [], groups = new Map(), collisions = new Map();
    const all = [...document.querySelectorAll('input,textarea,select,[role="combobox"]')];
    let excluded = 0, secretCount = 0;
    for (const node of all) {
      if (!api.editable(node)) { excluded++; continue; }
      const evidence = api.evidence(node), reason = api.fieldGuard(node,evidence);
      // Never collect values, labels, or identifiers from login/verification fields.
      if (reason?.startsWith('登录') || reason === '不采集字段') { secretCount++; continue; }
      const groupNode = evidence.sectionNode || document.body;
      if (!groups.has(groupNode)) groups.set(groupNode,groups.size);
      const group = groups.get(groupNode);
      const signatureBase = JSON.stringify([location.origin,location.pathname,node.tagName,node.type || '',node.id,node.name,evidence.label,evidence.hints,evidence.section,group]);
      const ordinal = collisions.get(signatureBase) || 0; collisions.set(signatureBase,ordinal+1);
      const signature = signatureBase + ':' + ordinal;
      let token = null;
      for (const [key,record] of api.nodes) if (record.node === node) {token=key;break;}
      token ||= crypto.randomUUID();
      const choices = node.tagName === 'SELECT' && !reason ? [...node.options].map(opt=>({text:opt.textContent.trim().slice(0,200),value:opt.value.slice(0,200),disabled:opt.disabled || opt.parentElement?.disabled === true})) : [];
      const descriptor = {token,signature,label:evidence.label,hints:evidence.hints,section:evidence.section,group,tag:node.tagName,type:node.type || '',blocked:reason,existing:!reason && Boolean(node.value?.trim()),choices,maxLength:node.maxLength > 0 ? node.maxLength : null};
      fields.push(descriptor); api.nodes.set(token,{node,descriptor});
    }
    // Remove detached references after each scan while keeping undo batches in memory.
    for (const [key,record] of api.nodes) if (!record.node.isConnected) api.nodes.delete(key);
    const layout = JSON.stringify(fields.map(f=>f.signature));
    return {fields,layout,site:location.origin+location.pathname,hostname:location.hostname,excluded,secretCount,frames:document.querySelectorAll('iframe').length,custom:document.querySelectorAll('[role="combobox"]').length, scannedAt:new Date().toISOString()};
  };
})();
