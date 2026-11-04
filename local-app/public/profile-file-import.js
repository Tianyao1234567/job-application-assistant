// Local JSON files are proposals. Only the authenticated server may map and
// persist them after the user reviews this version-bound preview.
export function createProfileFileImport(context) {
  const {el,button,p,banner,field,checkLine,definitions,api,getState,isDirty,discardDirty,openEditor,render,refresh,onSaved,toast}=context;
  const limit=500000;
  let selectedFile=null,selectedMode=null,localDraft=null,busy=false,error='',notice='',selection=0,currentDraftId=null;
  let confirmed=false;
  const recordMappings=new Map(),decisions=new Map(),answerSelections=new Map(),editedValues=new Map(),retiredEnglish=new Set(),selectedRoles=new Set(),createdRecords=[];
  const kinds={education:'教育经历',experience:'工作与实习经历',projects:'项目经历'};
  const text=value=>typeof value==='string'?value:'';
  const display=value=>typeof value==='string'?value:value&&typeof value==='object'?value.zh||'':'';
  const pathOf=target=>target?.path||target?.key||'';
  const kindFields=kind=>Object.entries(definitions[kind]||{});
  const redraw=()=>render(true);
  function changed(){confirmed=false;}
  function draft(){
    const remote=getState().profileImport;
    if(localDraft&&remote?.id!==localDraft.id)return localDraft;
    return remote||localDraft;
  }
  function initialize(value){
    if(currentDraftId===value?.id)return;
    currentDraftId=value?.id||null;recordMappings.clear();decisions.clear();answerSelections.clear();editedValues.clear();retiredEnglish.clear();selectedRoles.clear();createdRecords.length=0;confirmed=false;
    for(const record of value?.records||[])recordMappings.set(record.key,record.suggestedTarget||'');
  }
  function currentValue(path){
    const data=getState().profile.data,parts=String(path||'').split('.');
    if(parts.length===2)return data?.[parts[0]]?.[parts[1]]||null;
    if(parts.length===3&&Array.isArray(data?.[parts[0]]))return data[parts[0]].find(record=>record.id===parts[1])?.[parts[2]]||null;
    return null;
  }
  function conflict(change,target){
    const existing=currentValue(target);
    return change.conflict===true||!!existing&&['zh','en'].some(language=>typeof change.value?.[language]==='string'&&existing[language]&&existing[language]!==change.value[language]);
  }
  const blocked=change=>change.blocked===true||['expected','in_progress'].includes(change.qualifier);
  function targetFor(change,value){
    const saved=decisions.get(change.id);
    if(saved?.target!==undefined)return saved.target;
    if(change.recordKey){
      const record=value.records?.find(item=>item.key===change.recordKey),mapping=recordMappings.get(change.recordKey);
      const id=mapping==='new'?record?.proposedId:mapping;
      const name=(change.field||change.target||'').split('.').at(-1);
      if(record&&id&&Object.hasOwn(definitions[record.kind]||{},name))return `${record.kind}.${id}.${name}`;
      return '';
    }
    return change.target||'';
  }
  function targetOptions(value){
    const all=new Map((value.targets||[]).map(target=>[pathOf(target),target.label||pathOf(target)]).filter(([path])=>path));
    const add=(kind,id,label)=>{for(const [name,fieldLabel]of kindFields(kind))all.set(`${kind}.${id}.${name}`,`${label} · ${fieldLabel}（${id}）`);};
    for(const record of value.records||[]){
      const mapping=recordMappings.get(record.key),id=mapping==='new'?record.proposedId:mapping;
      if(id)add(record.kind,id,mapping==='new'?`新建${kinds[record.kind]||'经历'}`:`已有${kinds[record.kind]||'经历'}`);
    }
    for(const record of createdRecords)add(record.kind,record.id,`本人选择新建的${kinds[record.kind]}`);
    return all;
  }
  function decisionFor(change,value){
    const target=targetFor(change,value),saved=decisions.get(change.id);
    return {id:change.id,target,action:blocked(change)?'keep':saved?.action||(!change.requiresUserValue&&target&&!conflict(change,target)?'apply':'keep'),replace:!blocked(change)&&saved?.action==='apply'&&conflict(change,target)};
  }
  async function preview(){
    if(busy)return;
    error='';notice='';
    if(isDirty()){error='完整资料中还有未保存编辑。请先保存，或明确放弃这些编辑后再预览；所选文件和已有预览均已保留。';redraw();return;}
    if(!selectedFile){error='请先选择旧插件 v3 导出或固定格式增量 JSON 文件。';redraw();return;}
    const file=selectedFile,sequence=selection,mode=selectedMode||getState().profile.mode||'real',version=getState().profile.version;
    if(!file.size||file.size>limit){error='资料文件须非空且不超过 500 KB。';redraw();return;}
    busy=true;redraw();
    try{
      let document;
      try{document=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer()).replace(/^\uFEFF/,''));}catch{throw new Error('文件不是有效的 UTF-8 JSON，请核对格式后重新选择。');}
      if(sequence!==selection)return;
      if(isDirty()||getState().profile.version!==version)throw new Error('读取文件期间资料已有编辑或版本变化，请先处理当前资料，再重新预览所选文件。');
      if(!document||Array.isArray(document)||typeof document!=='object')throw new Error('资料文件顶层须为 JSON 对象。');
      const response=await api('/api/profile/import/preview',{document,mode,profileVersion:version});
      if(!response.draft||!Array.isArray(response.draft.changes))throw new Error('后台未返回可核对的资料预览，原资料未修改。');
      localDraft=response.draft;initialize(localDraft);notice='已生成待核对预览；原资料、附件与任务均未被自动修改。';
      await refresh(true);
    }catch(cause){error=cause.message;}
    finally{busy=false;redraw();}
  }
  function noteNode(note){
    if(typeof note==='string')return p(note,'details-note');
    return el('div',{class:'question-block'},note?.label?el('strong',{text:note.label}):null,p(note?.text||note?.message||note?.reason||'待本人处理的资料内容'),note?.source_text?p(`原始依据：${note.source_text}`,'subtle'):null);
  }
  function pending(value){
    const notes=Array.isArray(value?.notes)?value.notes:[],questions=Array.isArray(value?.questions)?value.questions:[];
    const rows=Array.isArray(value?.pendingChanges)?value.pendingChanges:[];
    const answers=Array.isArray(value?.jobAnswers)?value.jobAnswers:[];
    if(!notes.length&&!questions.length&&!rows.length&&!answers.length)return null;
    const answerStatus={applied:'已交给原任务补答，等待本人继续；未执行申请。','pending-batch':'已预填原任务的部分答案，仍需补齐并核对；尚未确认。',pending:'保留待处理，不会自动套用。'};
    return el('details',{},el('summary',{text:'待处理内容'}),
      notes.map(noteNode),rows.map(change=>el('div',{class:'question-block'},el('strong',{text:change.target_hint||change.field||'未匹配资料'}),change.target_hint==='停用的旧英文备份'&&change.value?.en?p('停用的旧英文备份：'+change.value.en,'details-note'):p(display(change.value)),change.qualifier?p(`保留限定：${change.qualifier==='expected'?'预计':'在读 / 进行中'}；未写成已完成事实。`,'warning'):null,change.source_text?p(`原始依据：${change.source_text}`,'subtle'):null)),
      answers.map(answer=>el('div',{class:'question-block'},el('strong',{text:answer.status==='applied'?'岗位答案已交给原任务':answer.status==='pending-batch'?'岗位答案已预填待核对':'岗位答案待处理'}),p(answer.question),p(answer.answer),p(answerStatus[answer.status]||answerStatus.pending,'details-note'),answer.matchReason?p(answer.matchReason,'subtle'):null)),
      questions.length?el('div',{},el('strong',{text:'仍需本人核对的问题'}),el('ul',{},questions.map(question=>el('li',{text:typeof question==='string'?question:question.text||'待核对问题'})))):null);
  }
  function recordControls(value){
    return (value.records||[]).map(record=>{
      const list=getState().profile.data?.[record.kind]||[];
      const select=el('select',{'aria-label':`记录归属：${record.label||record.key}`,'data-focus':`import-record-${record.key}`},el('option',{value:'',text:'保留待匹配，不写入'}),record.proposedId?el('option',{value:'new',text:`新建独立${kinds[record.kind]||'经历'}（${record.proposedId}）`}):null,
        list.map(existing=>el('option',{value:existing.id,text:`已有记录 ${existing.id}：${display(existing.school||existing.company||existing.title)||kinds[record.kind]||'经历'}`})));
      const mapping=recordMappings.get(record.key)||'';
      select.value=mapping==='new'||list.some(existing=>existing.id===mapping)?mapping:'';
      select.addEventListener('change',()=>{recordMappings.set(record.key,select.value);for(const change of value.changes)if(change.recordKey===record.key)decisions.delete(change.id);changed();redraw();});
      return field(`记录归属：${record.label||record.key}`,select,'仅按你选择的记录 ID 匹配，不凭相同学校、公司或项目名称自动合并。');
    });
  }
  function changeRow(change,index,value,targets){
    const choice=decisionFor(change,value),isBlocked=blocked(change),isConflict=conflict(change,choice.target);
    const parts=choice.target.split('.'),kind=parts[0],name=parts.at(-1);
    const label=(definitions[kind]?.[name]||change.target_hint||change.field||'待核对内容').split(' / ')[0];
    const row=el('div',{class:'field','data-import-change-id':change.id});
    const input=el('textarea',{'aria-label':label,'data-focus':`import-value-${change.id}`,maxlength:10000,disabled:isBlocked||!choice.target,value:editedValues.has(change.id)?editedValues.get(change.id):display(change.value)});
    input.addEventListener('input',()=>{editedValues.set(change.id,input.value);if(change.requiresUserValue)decisions.set(change.id,{target:choice.target,action:input.value.trim()?'apply':'keep'});changed();});
    row.append(field(label,input));
    if(isBlocked)row.append(p('此项包含待核对的时间或状态，暂未写入。','warning'));
    if(!change.recordKey&&(!choice.target||change.targetMappingKey)&&!isBlocked){
      const target=el('select',{'aria-label':`${label}归属`},el('option',{value:'',text:'保留待处理'}),[...targets].map(([path,title])=>el('option',{value:path,text:title.split(' / ')[0]})));
      target.value=targets.has(choice.target)?choice.target:'';
      target.addEventListener('change',()=>{decisions.set(change.id,{target:target.value,action:target.value&&!conflict(change,target.value)?'apply':'keep'});changed();redraw();});
      row.append(field('请选择资料位置',target));
    }
    const existing=currentValue(choice.target)||change.existing;
    if(existing?.en&&!isBlocked){
      const retire=el('input',{type:'checkbox',checked:retiredEnglish.has(change.id),'aria-label':`${label}停用旧英文并保留备份`});
      retire.addEventListener('change',()=>{if(retire.checked)retiredEnglish.add(change.id);else retiredEnglish.delete(change.id);});
      row.append(checkLine('如本次中文内容有变化，停用旧英文并保留备份',retire));
    }
    if(isConflict&&!isBlocked){
      row.append(p(`已保存：${display(currentValue(choice.target)||change.existing)}`,'details-note'));
      const action=el('select',{'aria-label':`${label}冲突处理`},el('option',{value:'keep',text:'保留已保存内容'}),el('option',{value:'apply',text:'使用这次内容'}));
      action.value=choice.action;
      action.addEventListener('change',()=>{decisions.set(change.id,{target:choice.target,action:action.value});changed();redraw();});
      row.append(field('请选择保留的内容',action));
    }
    return row;
  }
  function metaLine(label,value){return el('div',{},el('strong',{text:label}),p(text(value),'details-note'));}
  function answerRows(value){
    return (value.jobAnswers||[]).map((answer,index)=>{
      const row=el('fieldset',{class:'question-block'},el('legend',{text:`岗位答案 ${index+1}（限定用途）`}),metaLine('招聘页面原问题',answer.question),metaLine('文件中的待核对答案',answer.answer),answer.source_text?metaLine('原始依据',answer.source_text):null);
      row.append(p(answer.matched?`已匹配本机任务：${answer.taskTitle||answer.taskId}；仅用于该任务的原问题。`:`尚未匹配实际任务：${answer.matchReason||'岗位、站点或原问题不明确。'}`,'details-note'),answer.scope?metaLine('限定范围',answer.scope):null);
      const select=el('select',{'aria-label':`岗位答案 ${index+1}：处理`,'data-focus':`import-answer-${answer.id}`,disabled:!answer.matched},el('option',{value:'keep',text:'保留待处理，不套用答案'}),answer.matched?el('option',{value:'apply',text:'本人确认，交给此任务的现有补答流程'}):null);
      select.value=answer.matched&&answerSelections.get(answer.id)==='apply'?'apply':'keep';
      select.addEventListener('change',()=>{answerSelections.set(answer.id,select.value);changed();redraw();});
      row.append(field('本次处理',select),p('不会生成投递授权，不会把公司动机、薪资、日期或工作许可设为通用事实。','subtle'));
      return row;
    });
  }
  function previewForm(value){
    initialize(value);
    if(value.status==='saved')return el('div',{},banner('资料文件已核对保存',`已保存到资料 v${value.savedProfileVersion||value.profileVersion}；原附件和未列出的资料保持不变。`,'good'),pending(value));
    if(value.status!=='ready')return banner('资料文件暂不能确认保存',value.message||'请核对文件格式后重新预览。','warning');
    const stale=value.profileVersion!==getState().profile.version,wrongMode=selectedMode&&selectedMode!==value.mode;
    const form=el('form',{'aria-label':'核对资料文件变更'});
    if(stale)form.append(banner('资料版本已经变化','原资料未被覆盖。请点击“重新预览所选资料文件”，用当前版本重新核对。','warning'));
    if(wrongMode)form.append(banner('资料文件用途已经切换','请重新预览所选文件，不能用旧用途的预览保存。','warning'));
    form.append(p('请核对并按需修改草稿，然后一次确认保存。已有资料冲突时可选择保留的内容。','details-note'),...recordControls({...value,records:(value.records||[]).filter(record=>!record.suggestedTarget)}));
    const targets=targetOptions(value);
    if((value.changes||[]).some(change=>!change.recordKey&&(!change.target||change.targetMappingKey))){
      const kind=el('select',{'aria-label':'新建经历类型'},Object.entries(kinds).map(([key,title])=>el('option',{value:key,text:title})));
      const controls=el('details',{},el('summary',{text:'为待匹配内容新建经历'}),field('经历类型',kind),button('新建经历供选择',()=>{
        const chosen=kind.value;if(!Object.hasOwn(kinds,chosen))return;
        createdRecords.push({kind:chosen,id:`import-${crypto.randomUUID()}`});changed();redraw();
      },'small'));
      if(createdRecords.length)controls.append(p('已新建可选经历：'+createdRecords.map((record,index)=>`${kinds[record.kind]} ${index+1}`).join('、')+'。请在待匹配内容中选择对应位置。','details-note'));
      form.append(controls);
    }
    const missingRoles=(value.changes||[]).filter(change=>change.requiresUserValue && (change.field||'').endsWith('.role') && (change.field||'').startsWith('projects.'));
    if(missingRoles.length){
      const group=el('fieldset',{class:'profile-group'},el('legend',{text:'批量设置项目角色'}),p('选择需要设置角色的项目；仅应用于本次选中的项目。','details-note'));
      for(const [index,change] of missingRoles.entries()){
        const check=el('input',{type:'checkbox',checked:selectedRoles.has(change.id),'aria-label':`选择项目 ${index+1} 的角色`});
        check.addEventListener('change',()=>{if(check.checked)selectedRoles.add(change.id);else selectedRoles.delete(change.id);});
        group.append(checkLine(change.target_hint||`项目 ${index+1}`,check));
      }
      group.append(button('将选中项目的角色设为核心成员',()=>{for(const change of missingRoles){const target=targetFor(change,value);if(target&&selectedRoles.has(change.id)){editedValues.set(change.id,'核心成员');decisions.set(change.id,{target,action:'apply'});}}changed();redraw();},'small'));
      form.append(group);
    }
    for(const [kind,title] of Object.entries({personal:'个人信息',education:'教育经历',experience:'工作与实习经历',projects:'项目经历',skills:'技能',links:'链接'})){
      const changes=(value.changes||[]).filter(change=>(targetFor(change,value)||change.field||'').split('.')[0]===kind);
      if(!changes.length)continue;
      const section=el('section',{class:'profile-section'},el('h3',{text:title}));
      if(['education','experience','projects'].includes(kind)){
        const grouped=new Map();
        for(const change of changes){const key=change.recordKey||(targetFor(change,value)||change.field||'').split('.')[1]||'';if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(change);}
        let index=0;for(const [key,items] of grouped){index++;const record=value.records?.find(item=>item.key===key);section.append(el('div',{class:'profile-group'},el('strong',{text:record?.label||`第 ${index} 段${title}`}),items.map((change,rowIndex)=>changeRow(change,rowIndex,value,targets))));}
      }else section.append(...changes.map((change,index)=>changeRow(change,index,value,targets)));
      form.append(section);
    }
    const unmatched=(value.changes||[]).filter(change=>!Object.hasOwn({personal:1,education:1,experience:1,projects:1,skills:1,links:1},(targetFor(change,value)||change.field||'').split('.')[0]));
    if(unmatched.length)form.append(el('section',{class:'profile-section'},el('h3',{text:'待核对'}),unmatched.map((change,index)=>changeRow(change,index,value,targets))));
    form.append(...answerRows(value),pending({...value,jobAnswers:[]}));
    const submit=el('button',{type:'submit',class:'button primary',text:'确认并保存资料',disabled:busy||stale||wrongMode||isDirty()});
    form.append(submit);
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(busy)return;
      error='';
      try{
        if(isDirty())throw new Error('完整资料中仍有未保存编辑，请先保存或明确放弃；已有预览与所选文件均已保留。');
        if(getState().profile.version!==value.profileVersion||draft()?.id!==value.id)throw new Error('当前资料或预览已经变化，请重新预览所选文件。');
        if(selectedMode&&selectedMode!==value.mode)throw new Error('资料用途已变化，请重新预览后保存。');
        const selected=(value.changes||[]).map(change=>{
          const choice=decisionFor(change,value);
          return {id:change.id,action:choice.action,target:choice.target,replace:choice.action==='apply'&&conflict(change,choice.target),...(choice.action==='apply'&&editedValues.has(change.id)?{editedValue:editedValues.get(change.id)}:{}),...(choice.action==='apply'&&retiredEnglish.has(change.id)?{retireEnglish:true}:{})};
        });
        const usedRecords=createdRecords.filter(record=>selected.some(choice=>choice.action==='apply'&&choice.target.startsWith(`${record.kind}.${record.id}.`)));
        const body={id:value.id,profileVersion:value.profileVersion,mode:value.mode,confirmed:true,decisions:selected,recordMappings:Object.fromEntries(recordMappings),createRecords:usedRecords,answerSelections:(value.jobAnswers||[]).map(answer=>({id:answer.id,action:answer.matched&&answerSelections.get(answer.id)==='apply'?'apply':'keep'}))};
        busy=true;redraw();await api('/api/profile/import/confirm',body);onSaved();confirmed=false;localDraft=null;notice='已保存本人确认的变更；待处理内容已保留，未自动执行申请。';await refresh(true);toast('资料文件已核对保存，原附件与任务提交边界保持不变。');
      }catch(cause){error=cause.message;}
      finally{busy=false;redraw();}
    });
    return form;
  }
  function history(){
    const saved=getState().profileImportHistory;
    const entries=Array.isArray(saved)?saved:saved&&typeof saved==='object'?Object.values(saved):[];
    if(!entries.length)return null;
    return el('details',{},el('summary',{text:'已保存的资料导入记录'}),[...entries].reverse().map(entry=>el('section',{class:'question-block'},el('strong',{text:`${entry.kind||'资料文件'} · 资料 v${entry.savedProfileVersion||entry.profileVersion||'?'}${entry.savedAt||entry.createdAt?' · '+(entry.savedAt||entry.createdAt):''}`}),p(`已接受 ${entry.count??entry.result?.count??entry.appliedCount??entry.applied?.length??entry.acceptedCount??0} 项资料变更；${entry.answerCount??entry.result?.answerCount??0} 项答案交给原任务。未匹配或不支持内容继续保留。`,'subtle'),pending(entry))));
  }
  function view(){
    const state=getState(),value=draft();
    if(selectedMode===null)selectedMode=state.profile.mode||'real';
    if(state.profile.version>0)selectedMode=state.profile.mode;
    const root=el('section',{'aria-label':'选择资料文件并核对更新'},el('h3',{text:'选择资料文件'}),p('优先导入旧插件 v3 导出，或由 AI 按固定格式整理的增量 JSON。所有内容先在本机生成待核对草稿，不直接覆盖资料。','details-note'));
    const mode=el('select',{'aria-label':'资料文件用途','data-focus':'profile-file-mode',disabled:busy||state.profile.version>0},el('option',{value:'demo',text:'本地演示 · 仅虚构资料'}),el('option',{value:'real',text:'真实用途 · 本人资料'}));mode.value=selectedMode;
    mode.addEventListener('change',()=>{selectedMode=mode.value;changed();redraw();});
    const choose=el('input',{type:'file',accept:'.json,application/json','aria-label':'选择资料文件（JSON）','data-focus':'profile-file-json',disabled:busy});
    choose.addEventListener('change',()=>{selectedFile=choose.files[0]||null;selection++;error='';notice='';if(selectedFile)preview();else redraw();});
    root.append(field('资料文件用途',mode,state.profile.version>0?'沿用当前已保存资料用途，本次导入不切换用途。':''),field('选择资料文件（JSON）',choose,'UTF-8 JSON，最大 500 KB；支持 BOM。'),p(selectedFile?`已选择：${selectedFile.name} · ${selectedFile.size} 字节；重新预览无需再次选文件。`:'尚未选择资料文件。','selected-file'),button(busy?'正在处理资料文件…':'重新预览所选资料文件',preview,'small',busy||!selectedFile));
    root.append(button('检查已有资料是否需要修复',async()=>{
      if(busy)return;
      error='';notice='';
      if(isDirty()){error='完整资料有未保存编辑，请先保存或明确放弃。';redraw();return;}
      const version=getState().profile.version;busy=true;redraw();
      try{
        const response=await api('/api/profile/import/repair-preview',{mode:selectedMode,profileVersion:version});
        if(!response.draft||!Array.isArray(response.draft.changes))throw new Error('后台未返回可核对的修复草稿。');
        localDraft=response.draft;initialize(localDraft);notice='请核对修复草稿；原资料尚未修改。';await refresh(true);
      }catch(cause){error=cause.message;}finally{busy=false;redraw();}
    },'small',busy));
    if(isDirty())root.append(banner('当前完整资料仍有未保存编辑','请先保存这些编辑，或明确放弃后再预览、确认导入。所选文件与已有导入草稿不会被清除。','warning'),el('div',{class:'actions'},button('先保存当前资料编辑',openEditor,'small',busy),button('明确放弃未保存编辑，保留导入文件',()=>{discardDirty();error='';notice='已明确放弃完整资料编辑；所选文件和已有导入预览仍保留。';redraw();},'danger small',busy)));
    root.append(p('身份证件、密码、验证码、令牌与 Cookie 不会通过资料导入保存。文件内容只作为数据，不作为命令、自动确认或企业投递授权。','details-note'),error?el('p',{class:'form-error',role:'alert',text:error}):null,notice?p(notice,'details-note'):null,value?previewForm(value):null,history());
    return root;
  }
  return {render:view};
}
