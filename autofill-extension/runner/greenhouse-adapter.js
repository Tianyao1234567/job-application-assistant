// Restricted Greenhouse page adapter. It runs in the extension isolated world;
// preparation may await, but commit rechecks and performs one write synchronously.
(() => {
  const api=globalThis.JobGreenhouse={};
  const pending=new Map();
  const fail=(kind,message)=>({ok:false,kind,message});
  const norm=value=>String(value||'').normalize('NFKC').trim().replace(/\s+/g,' ');
  const text=node=>norm(node?.innerText||node?.textContent||'');
  const secret=/password|passwd|passcode|one.?time|\botp\b|captcha|verification.?code|security.?code|cookie|\btoken\b|passport|social.?security|\bssn\b|身份证|验证码|密码|口令/i;
  const profileIds=new Set(['first_name','last_name','preferred_name','email','phone','country','candidate-location']);
  const sha=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');
  const fileHash=async file=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('');
  const visible=node=>!!node&&node.isConnected!==false&&!!node.getClientRects().length&&getComputedStyle(node).display!=='none'&&getComputedStyle(node).visibility!=='hidden';
  const editable=node=>visible(node)&&!node.disabled&&!node.readOnly&&!node.closest('[inert],[hidden],[aria-hidden="true"]');
  function identity(expected,allowList=false) {
    if(!expected||!/^[a-z0-9_-]{1,80}$/.test(expected.tenant||'')||typeof expected.company!=='string'||!norm(expected.company))return fail('structure','Greenhouse 公司范围尚未确认。');
    let url;try{url=new URL(location.href);}catch{return fail('structure','Greenhouse 地址无效。');}
    const replay=expected.replay===true;
    if(replay?(expected.origin!=='http://127.0.0.1:17322'||url.origin!==expected.origin):(!['https://job-boards.greenhouse.io','https://boards.greenhouse.io'].includes(expected.origin)||url.origin!==expected.origin))return fail('structure','页面不属于已确认的 Greenhouse 网站。');
    if(url.username||url.password)return fail('structure','招聘地址不能包含账号凭据。');
    const base=(replay?'/greenhouse':'')+'/'+expected.tenant;
    const job=typeof expected.jobId==='string'&&/^\d{1,30}$/.test(expected.jobId)?expected.jobId:null;
    const detail=job?base+'/jobs/'+job:null;
    if(!(detail&&(url.pathname===detail||url.pathname===detail+'/confirmation'||replay&&url.pathname===detail+'/receipt'))&&!(allowList&&url.pathname===base))return fail('structure','公司租户或岗位标识已变化。');
    const title=norm(document.title),suffix=' at '+norm(expected.company);
    if(!title.toLowerCase().endsWith(suffix.toLowerCase()))return fail('account','页面企业名称与确认的公司不符。');
    return {ok:true,url,source:url.origin+(detail||base),base,job};
  }
  function findForm() {
    const forms=[...document.querySelectorAll('form')].filter(form=>form.querySelector('#first_name')&&form.querySelector('#email')&&form.querySelector('#resume'));
    return forms.length===1?forms[0]:null;
  }
  function account(expected,form) {
    if(typeof expected.expectedAccount!=='string'||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(expected.expectedAccount))return {status:'unknown',account:'',tenant:expected.tenant,identitySource:'anonymous-applicant-unconfirmed'};
    const emails=form?[...form.querySelectorAll('input')].filter(node=>node.id==='email'):[];
    if(emails.length>1)return {status:'account',account:'',tenant:expected.tenant,identitySource:'ambiguous-applicant'};
    const value=emails[0]?.value?.trim();
    if(value&&value.toLowerCase()!==expected.expectedAccount.toLowerCase())return {status:'account',account:'',tenant:expected.tenant,identitySource:'different-form-applicant'};
    // An anonymous application form is not proof of a logged-in session. The
    // readiness here refers only to the user's pinned applicant confirmation.
    return {status:expected.applicantConfirmed===true?'ready':'unknown',account:expected.applicantConfirmed===true?expected.expectedAccount:'',tenant:expected.tenant,identitySource:expected.applicantConfirmed===true?'confirmed-anonymous-applicant':'anonymous-applicant-unconfirmed'};
  }
  function context(expected,requireForm=false) {
    const scope=identity(expected,!requireForm);if(!scope.ok)return scope;
    if([...document.querySelectorAll('input[type="password"],input[autocomplete="one-time-code"]')].some(visible))return fail('manual','此页面需要本人登录或验证，请在同一浏览器完成。');
    const form=findForm(),login=account(expected,form);
    if(login.status==='account')return {...fail('account','申请表已有邮箱与本次确认的申请人不符，请人工核对。'),login};
    if(requireForm&&!form)return {...fail('structure','未找到唯一且已识别的 Greenhouse 申请表。'),login};
    return {...scope,form,login};
  }
  function labels(node) {
    const labelled=(node.getAttribute('aria-labelledby')||'').split(/\s+/).filter(Boolean).map(id=>document.getElementById(id)).filter(Boolean);
    return [...(node.labels||[])].map(text).filter(Boolean).join('\n')||labelled.map(text).filter(Boolean).join('\n')||node.getAttribute('aria-label')||'';
  }
  function groupLabel(node) {
    const group=node.closest('fieldset,[data-field],.field,.form-group,.application-field,.file-upload,.attachment');
    if(!group)return '';
    const heading=group.querySelector('legend,.input-label,.field-label,.label,h2,h3');
    return text(heading);
  }
  function purpose(field) {
    if(field.type==='file')return 'attachment';
    if(/why.*(?:role|company|interested)|motivation|申请原因/i.test(field.text))return 'company-motivation';
    if(/authoriz|sponsor|citizen|work permit|工作许可/i.test(field.text))return 'work-authorization';
    if(/gender|ethnicity|veteran|disability|hispanic/i.test(field.text))return 'voluntary-sensitive';
    return profileIds.has(field.key)?'confirmed-profile-fact':'site-specific-question';
  }
  // Read only the scoped public loader schema, never execute page scripts or
  // use preloaded confirmation prose as evidence of an application.
  function publicQuestions() {
    try {
      for(const script of [...document.querySelectorAll('script')]){
        const source=script.textContent||'';
        if(source.length>1500000||!source.trim().startsWith('window.__remixContext'))continue;
        const match=/^\s*window\.__remixContext\s*=\s*(\{[\s\S]*\})\s*;?\s*$/.exec(source);if(!match)continue;
        const loader=JSON.parse(match[1]).state?.loaderData?.['routes/$url_token_.jobs_.$job_post_id'];
        const job=loader?.jobPost,url=new URL(location.href);
        if(!job||String(loader.jobPostId)!==url.pathname.split('/').at(-1)||loader.urlToken!==url.pathname.split('/').at(-3)||job.public_url!==url.origin+url.pathname||!Array.isArray(job.questions)||job.questions.length>60)continue;
        return job.questions;
      }
    }catch{}
    return [];
  }
  function submissionProtocol(expected) {
    try{
      for(const script of document.querySelectorAll('script')){
        const source=script.textContent||'';if(source.length>1500000)continue;
        const match=/^\s*window\.__remixContext\s*=\s*(\{[\s\S]*\})\s*;?\s*$/.exec(source);if(!match)continue;
        const loader=JSON.parse(match[1]).state?.loaderData?.['routes/$url_token_.jobs_.$job_post_id'];
        if(loader?.urlToken!==expected.tenant||String(loader.jobPostId)!==expected.jobId||loader.jobPost?.public_url!==expected.origin+(expected.replay?'/greenhouse':'')+'/'+expected.tenant+'/jobs/'+expected.jobId)continue;
        const submit=new URL(loader.submitPath,location.href),confirmation=new URL(loader.confirmationPath,location.href),base=(expected.replay?'/greenhouse':'')+'/'+expected.tenant+'/jobs/'+expected.jobId;
        if(submit.pathname!==base||submit.username||submit.password||!(submit.origin===expected.origin||!expected.replay&&submit.origin==='https://boards.greenhouse.io')||confirmation.origin!==expected.origin||confirmation.pathname!==base+'/confirmation')continue;
        return {submitUrl:submit.href,confirmationUrl:confirmation.href,rule:'greenhouse-response-ok-v1'};
      }
    }catch{}
    return null;
  }
  function selectedChoice(node) {
    const group=node.closest?.('.select');
    const values=group?.querySelectorAll?.('.select__single-value');
    if(values?.length!==1)return '';
    const value=values[0],label=text(value);
    // The official phone-country renderer displays a dial code and an ISO flag,
    // not the option label. Shared dial codes alone cannot bind a country.
    if(node.id==='country'){
      const flags=value.querySelectorAll?.('.iti__flag')||[];
      if(flags.length===1){
        const codes=[...(flags[0].classList||[])].filter(name=>/^iti__[a-z]{2}$/.test(name));
        if(codes.length===1)return label+' ('+codes[0].slice(5)+')';
        return '';
      }
    }
    return label;
  }
  function controlValue(record) {return record.field.customControl?selectedChoice(record.node):record.node.value;}
  function collect(form) {
    const nodes=[...form.querySelectorAll('input,textarea,select')].filter(node=>node.type!=='hidden'&&(!secret.test([node.id,node.name,node.type,labels(node)].join(' ')))&&(visible(node)||node.type==='file'));
    if(nodes.length>60)throw new Error('FIELD_BUDGET');
    const records=[],keys=new Set(),schema=publicQuestions();
    for(const node of nodes){
      if(['submit','button','reset','image'].includes(node.type))continue;
      // React Select's unnamed required proxy belongs to its one labelled control.
      if(!node.id&&!node.name&&node.required&&node.closest?.('.select')?.querySelector?.('[role="combobox"][id]'))continue;
      const key=node.id||node.name;
      if(!key||key.length>160||keys.has(key))throw new Error('AMBIGUOUS_FIELD');keys.add(key);
      const label=labels(node),group=groupLabel(node),business=schema.find(question=>question.fields?.some(field=>field.name===key)&&norm(question.label)===norm((node.type==='file'?group:label).replace(/\*\s*$/,''))),definition=business?.fields.find(field=>field.name===key);
      if(!label||label.length>2000||group.length>2000)throw new Error('QUESTION_LABEL');
      const customControl=node.getAttribute('role')==='combobox'||node.getAttribute('aria-haspopup')==='listbox'||!!node.closest('[role="combobox"]');
      let options=[],optionKeys=[],optionsComplete=node.tagName==='SELECT';
      if(node.tagName==='SELECT'){
        if(node.options.length>300)throw new Error('OPTION_BUDGET');
        options=[...node.options].map(option=>({text:text(option),disabled:!!option.disabled||!!option.parentElement?.disabled}));
        optionKeys=[...node.options].map(option=>String(option.value));
      }else if(customControl&&definition?.type==='multi_value_single_select'&&Array.isArray(definition.values)&&definition.values.length<=300){
        options=definition.values.map(option=>({text:String(option.label),disabled:false}));optionKeys=definition.values.map(option=>String(option.value));optionsComplete=true;
      }else if(customControl){
        // An unopened or virtualized custom control is not a known option set.
        // Reading displayed choices never marks them complete automatically.
        const list=document.getElementById(node.getAttribute('aria-controls')||'');
        if(list&&node.getAttribute('aria-expanded')==='true')options=[...list.querySelectorAll('[role="option"]')].filter(visible).map(option=>({text:text(option),disabled:option.getAttribute('aria-disabled')==='true'}));
      }
      if(options.some(option=>option.text.length>1000))throw new Error('OPTION_BUDGET');
      const requiredEvidence={native:node.required===true,aria:node.getAttribute('aria-required')==='true',labelAsterisk:/\*/.test(label),groupAsterisk:/\*/.test(group),schema:business?.required===true};
      const field={key,text:node.type==='file'&&group?group+' / '+label:label,type:node.type||node.tagName.toLowerCase(),tag:node.tagName,required:Object.values(requiredEvidence).some(Boolean),requiredEvidence,options,optionsComplete,customControl,accept:node.accept||'',groupTitle:group,attachmentRequirementKnown:node.type!=='file'||!!group&&/resume|cv|cover letter/i.test(group)&&(typeof business?.required==='boolean'||Object.values(requiredEvidence).some(Boolean)||/optional/i.test(group)),alreadyPopulated:node.type==='file'?node.files.length>0:customControl?!!selectedChoice(node):['checkbox','radio'].includes(node.type)?node.checked===true:!!node.value?.trim()};
      field.purpose=purpose(field);
      const {alreadyPopulated,...structure}=field;
      records.push({node,field,raw:JSON.stringify({...structure,name:node.name||'',optionKeys})});
    }
    return records;
  }
  function formLayout(form,records) {
    return JSON.stringify({form:{id:form.id||'',action:form.getAttribute('action')||'',method:form.getAttribute('method')||''},fields:records.map(record=>record.raw),submit:[...form.querySelectorAll('button[type="submit"],input[type="submit"]')].map(node=>({id:node.id||'',type:node.type,text:text(node)||node.value||''}))});
  }
  function checked(expected,layout,requireApplicant=true) {
    const current=context(expected,true);if(!current.ok)return current;
    if(requireApplicant&&current.login.status!=='ready')return {...fail('manual','请先确认本次岗位、申请资料、附件及提交用途。'),login:current.login};
    try{const records=collect(current.form),actual=formLayout(current.form,records);return layout===undefined||actual===layout?{...current,records,layout:actual}:fail('structure','申请表原问题、选项、必填依据或结构已变化，请重新检查。');}
    catch{return fail('structure','Greenhouse 字段标识或结构尚未核实，已停止操作。');}
  }
  async function question(expected,record) {
    const version=await sha(record.raw),field=record.field;
    const manualSelection=field.customControl&&!field.optionsComplete&&!!selectedChoice(record.node);
    return {...field,...(manualSelection?{manualSelection:true,options:[{text:selectedChoice(record.node),disabled:false}]}:{}),version,source:expected.origin+(expected.replay?'/greenhouse':'')+'/'+expected.tenant+'/jobs/'+expected.jobId,scope:`greenhouse-v1:${expected.tenant}:${expected.jobId}:${field.key}:${version}`,defaultRemember:false};
  }
  function ownedAnswer(expected,q,record) {
    if(!q.alreadyPopulated||!Array.isArray(expected.confirmedAnswers))return false;
    let value=controlValue(record);
    if(record.node.tagName==='SELECT'){
      const selected=[...record.node.options].filter(option=>option.value===record.node.value);
      if(selected.length!==1)return false;value=text(selected[0]);
    }
    return expected.confirmedAnswers.some(answer=>answer?.confirmed===true&&['key','scope','version','text','source','purpose'].every(key=>answer[key]===q[key])&&(answer.value??answer.answer)===value);
  }
  async function confirmedQuestions(expected,current) {
    const profile=new Set(Array.isArray(expected.profileFields)?expected.profileFields.filter(key=>profileIds.has(key)):[]);
    for(const record of current.records){
      const q=await question(expected,record);
      if(q.type!=='file'&&(q.required||q.alreadyPopulated)&&!(profile.has(q.key)&&!q.customControl)&&!ownedAnswer(expected,q,record))return fail('manual','仍有原问题或网页已有答案未经本次明确确认，请核对后继续。');
    }
    return {ok:true};
  }
  function replayReceipt(expected) {
    if(expected.replay!==true)return null;
    const nodes=[...document.querySelectorAll('[data-greenhouse-replay-receipt]')];
    if(!nodes.length)return null;
    if(nodes.length!==1)throw new Error('RECEIPT_IDENTITY');
    const data=nodes[0].dataset;
    if(data.tenant!==expected.tenant||data.jobId!==expected.jobId||data.account?.toLowerCase()!==expected.expectedAccount?.toLowerCase()||!data.receiptId||!/^[a-f0-9]{64}$/.test(data.sha256||'')||!Number.isInteger(Number(data.fileSize))||Number(data.fileSize)<=0||!data.fileName)throw new Error('RECEIPT_IDENTITY');
    return {kind:'greenhouse-replay',id:data.receiptId,tenant:data.tenant,jobId:data.jobId,account:data.account,fileName:data.fileName,fileSize:Number(data.fileSize),sha256:data.sha256};
  }
  api.read=async(op,expected)=>{
    try{
      const current=context(expected);if(!current.ok)return current;
      if(op==='discover'){
        if(current.url.pathname!==current.base)return fail('structure','岗位发现入口不属于当前租户列表。');
        const jobs=[];
        for(const link of document.querySelectorAll('a[href]')){
          let url;try{url=new URL(link.href);}catch{continue;}
          const match=new RegExp('^'+current.base.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'/jobs/(\\d+)$').exec(url.pathname);
          if(url.origin!==expected.origin||url.username||url.password||!match)continue;
          const title=text(link);if(!title||title.length>300)continue;
          const container=link.closest('.opening,.job-post,tr,section,li');
          let location='';
          if(container){
            const links=[...container.querySelectorAll('a[href]')].filter(candidate=>{
              try{const target=new URL(candidate.href);return target.origin===expected.origin&&target.pathname.startsWith(current.base+'/jobs/');}catch{return false;}
            });
            // A department-wide section may contain several jobs. Do not pair
            // this link with a different job's location from that container.
            const identities=new Set(links.map(candidate=>new URL(candidate.href).pathname));
            const locations=[...container.querySelectorAll('.location,.job__location,.job-location,[data-job-location]')].filter(visible);
            if(identities.size===1&&identities.has(url.pathname)&&locations.length===1)location=text(locations[0]).slice(0,200);
          }
          if(!jobs.some(job=>job.jobId===match[1]))jobs.push({jobId:match[1],title,company:expected.company,location,url:url.origin+url.pathname,tenant:expected.tenant});
          if(jobs.length>=200)break;
        }
        return {ok:true,jobs,login:current.login};
      }
      if(op==='check')return {ok:true,login:current.login,anonymousApplication:true};
      const receipt=replayReceipt(expected);
      if(op==='verify')return {ok:true,receipt,login:current.login,verificationOnly:true,productionReceiptObserved:false};
      if(receipt)return {ok:true,receipt,login:current.login};
      const result=checked(expected,undefined,false);if(!result.ok)return result;
      const title=text(document.querySelector('h1'));
      if(!title||title.length>300)return fail('structure','岗位标题尚未可靠识别。');
      const jobMetadata={tenant:expected.tenant,jobId:expected.jobId,url:current.source,title,company:expected.company,location:text(document.querySelector('.job__location,.job-location,[data-job-location]')).slice(0,200)};
      const fields=await Promise.all(result.records.map(record=>question(expected,record)));
      const fillable=new Set(Array.isArray(expected.profileFields)?expected.profileFields.filter(key=>profileIds.has(key)):[]);
      const questions=fields.filter((field,index)=>(field.required||field.alreadyPopulated)&&field.type!=='file'&&!(fillable.has(field.key)&&!field.customControl)&&!ownedAnswer(expected,field,result.records[index]));
      return {ok:true,login:current.login,jobMetadata,submissionProtocol:submissionProtocol(expected),applyUrl:current.source,layout:result.layout,formVersion:await sha(result.layout),fields,questions,question:questions[0]||null,anonymousApplication:true,verificationVisible:[...document.querySelectorAll('iframe[src*="captcha" i],iframe[src*="verify" i]')].some(visible),productionReceiptObserved:false};
    }catch{return fail('structure','Greenhouse 回执、原问题或页面范围未通过保护检查。');}
  };
  function fieldTarget(current,expected,key,value,explicit=false) {
    const records=current.records.filter(record=>record.field.key===key);
    if(records.length!==1)return fail('structure','字段不存在或不唯一，不能自动填写。');
    const record=records[0],{node,field}=record;
    if(field.customControl){
      if(!editable(node))return fail('manual','控件当前不可编辑，请本人检查。');
      if(!explicit||typeof value!=='string'||!value.trim()||value.length>5000)return fail('manual','请针对原问题确认实际选项。');
      const selected=selectedChoice(node);
      if(selected&&selected!==value)return fail('manual','保留本人已选择的原值，请核对后继续。');
      if(!field.optionsComplete&&selected!==value)return fail('manual','选项未完整观察，请先由本人在原页面选择，再确认该原文。');
      if(field.optionsComplete&&!field.options.some(option=>option.text===value&&!option.disabled))return fail('manual','确认答案不在实际选项中。');
      const list=document.getElementById(node.getAttribute('aria-controls')||'');
      const matches=[...(list?.querySelectorAll?.('[role="option"]')||[])].filter(option=>visible(option)&&text(option)===value&&option.getAttribute('aria-disabled')!=='true');
      return {ok:true,...record,write:value,choice:true,selected,option:matches.length===1?matches[0]:null};
    }
    if(!editable(node)||!['INPUT','TEXTAREA','SELECT'].includes(node.tagName)||!['text','email','tel','url','search','number','textarea','select-one'].includes(field.type))return fail('manual','此控件需要本人处理，自动填写已停止。');
    if(secret.test([field.text,key,node.name].join(' ')))return fail('manual','登录、验证或证件内容不能由申请答案填写。');
    if(!explicit&&(!profileIds.has(key)||globalThis.JobFill?.guardText([field.text,key].join(' '))))return fail('manual','此字段不是可直接复用的已确认普通资料。');
    if(typeof value!=='string'||!value.trim()||value.length>5000||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value))return fail('manual','确认内容没有通过长度或格式检查。');
    if(key==='email'&&norm(value).toLowerCase()!==norm(expected.expectedAccount).toLowerCase())return fail('account','待填写邮箱与本次确认的申请人不符，未修改申请表。');
    let write=value;
    if(node.tagName==='SELECT'){
      const matches=[...node.options].filter(option=>!option.disabled&&!option.parentElement?.disabled&&text(option)===value);
      if(matches.length!==1)return fail('manual','答案与完整选项没有唯一的原文匹配，请人工核对。');
      write=matches[0].value;
    }
    if(node.value?.trim()&&node.value!==write)return fail('manual','保留网页已有内容，请本人核对后继续。');
    if(node.maxLength>0&&write.length>node.maxLength)return fail('manual','内容超过网页字段限制。');
    if(node.type==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(write))return fail('manual','邮箱格式不符。');
    return {ok:true,...record,write};
  }
  function uploadTarget(current) {
    const records=current.records.filter(record=>record.field.key==='resume'&&record.field.type==='file');
    if(records.length!==1||records[0].node.disabled||records[0].node.multiple)return fail('structure','未识别到唯一的简历附件控件。');
    return {ok:true,...records[0]};
  }
  const sameExpected=(a,b)=>['origin','tenant','jobId','company','expectedAccount','replay','applicantConfirmed'].every(key=>a[key]===b[key])&&JSON.stringify(a.confirmedAnswers||[])===JSON.stringify(b.confirmedAnswers||[]);
  // Values stay in this isolated world only. They must not be serialized into
  // layout, task reports, or logs; submission binds the form state seen before
  // asynchronous hashing and authorization to the final synchronous click.
  function captureValues(current) {
    return current.records.map(({node,field})=>({node,key:field.key,value:field.type==='file'?null:node.value,selection:field.customControl?selectedChoice(node):null,checked:node.checked,selectedIndex:node.tagName==='SELECT'?node.selectedIndex:undefined,files:field.type==='file'?[...node.files]:null}));
  }
  function sameValues(captured,current) {
    return captured.length===current.records.length&&captured.every((before,index)=>{
      const {node,field}=current.records[index];
      return before.node===node&&before.key===field.key&&before.value===(field.type==='file'?null:node.value)&&before.selection===(field.customControl?selectedChoice(node):null)&&before.checked===node.checked&&(node.tagName!=='SELECT'||before.selectedIndex===node.selectedIndex)&&(!before.files||node.files.length===before.files.length&&before.files.every((file,index)=>node.files[index]===file));
    });
  }
  function captchaVisible() {
    const frames=[...document.querySelectorAll('iframe[src*="captcha" i],iframe[src*="verify" i],input[autocomplete="one-time-code"]')];
    const active=frames.filter(frame=>{
      if(!visible(frame))return false;
      try{const url=new URL(frame.getAttribute?.('src')||'',location.href);if(['www.google.com','www.recaptcha.net'].includes(url.hostname)&&url.pathname.includes('/anchor')&&url.searchParams.get('size')==='invisible')return false;}catch{}
      return true;
    });
    if(!active.length)return false;
    // Only observe provider completion. Never write, return, or persist tokens.
    const responses=[...document.querySelectorAll('textarea[name="g-recaptcha-response"],input[name="g-recaptcha-response"],textarea[name="h-captcha-response"]')];
    return responses.length!==1||!responses[0].value?.trim();
  }
  function submissionTarget(expected,current) {
    const receipt=replayReceipt(expected);if(receipt)return {ok:true,receipt};
    if(captchaVisible())return fail('manual','提交前需要本人完成网站验证；系统不会操作或绕过 CAPTCHA。');
    const buttons=[...current.form.querySelectorAll('button[type="submit"],input[type="submit"]')].filter(node=>/^(?:submit application|submit|申请|提交申请)$/i.test(text(node)||node.value||''));
    if(buttons.length!==1||!editable(buttons[0]))return fail('structure','未识别到唯一且可操作的提交申请按钮。');
    if(current.form.dataset.greenhouseSubmissionAttempt)return fail('unknown','此表单已进入提交阶段，只允许核对结果。');
    for(const {node,field} of current.records){
      if(field.type==='file'&&field.key!=='resume'&&node.files.length)return fail('manual','网页已有其他附件尚未纳入本次确认版本，未允许提交。');
      if(field.type==='file'&&!field.attachmentRequirementKnown)return fail('manual','附件分组标题及必填依据尚未核实，请本人检查后再继续。');
      if(!field.required)continue;
      if(field.customControl&&!selectedChoice(node))return fail('manual','请本人完成必填选择，并针对当前原题确认。');
      if(field.type==='file'?node.files.length===0:field.customControl?!selectedChoice(node):!node.value?.trim())return fail('manual','仍有必填字段或附件未完成，请补充原问题后继续。');
    }
    return {ok:true,node:buttons[0]};
  }
  async function lockedFile(current,locked) {
    const target=uploadTarget(current);if(!target.ok)return target;
    const file=target.node.files[0];
    if(!locked||target.node.files.length!==1||file.name!==locked.name||file.size!==locked.size||!/^[a-f0-9]{64}$/.test(locked.sha256||''))return fail('manual','附件与本次锁定的文件身份或版本不符。');
    if(await fileHash(file)!==locked.sha256)return fail('manual','附件内容与本次锁定的文件摘要不符。');
    if(target.node.files.length!==1||target.node.files[0]!==file)return fail('manual','附件在摘要核对期间已被替换。');
    return {ok:true,node:target.node,file};
  }
  api.validateSubmit=async(expected,layout,locked)=>{
    try{
      const current=checked(expected,layout);if(!current.ok)return current;
      const values=captureValues(current),confirmed=await confirmedQuestions(expected,current);if(!confirmed.ok)return confirmed;
      const submit=submissionTarget(expected,current);if(!submit.ok||submit.receipt)return submit;
      if(!current.form.checkValidity())return fail('manual','表单必填项或原生格式校验未通过。');
      const file=await lockedFile(current,locked);if(!file.ok)return file;
      const fresh=checked(expected,layout);if(!fresh.ok||fresh.form!==current.form)return fresh.ok?fail('structure','申请表在核对附件期间已被替换。'):fresh;
      if(!sameValues(values,fresh))return fail('manual','提交预检期间申请内容已变化，请本人重新核对。');
      const again=submissionTarget(expected,fresh);if(!again.ok)return again;
      if(file.node.files.length!==1||file.node.files[0]!==file.file)return fail('manual','附件在提交预检期间已变化。');
      return {ok:true,layout};
    }catch{return fail('manual','提交预检未能确认申请表和附件，已停止操作。');}
  };
  api.prepare=async(method,expected,args)=>{
    try{
      if(!['fillField','openChoice','answer','upload','submit'].includes(method)||!Array.isArray(args))return fail('manual','不支持此页面操作。');
      const payload=['answer','openChoice'].includes(method)?args[0]:null,layout=payload?.layout||args[0];
      const current=checked(expected,layout);if(!current.ok)return current;
      const prepared={method,expected:{...expected},layout,form:current.form,at:Date.now()};
      if(method==='openChoice'){
        const target=current.records.find(record=>record.field.key===payload.key);
        if(!target?.field.customControl||!target.field.optionsComplete||selectedChoice(target.node)||!editable(target.node))return fail('manual','此选项应由本人在页面选择。');
        const q=await question(expected,target);if(payload.confirmed!==true||q.scope!==payload.scope||q.version!==payload.version||q.text!==payload.text||!q.options.some(option=>option.text===payload.answer&&!option.disabled))return fail('structure','原题或确认选项已变化。');
        Object.assign(prepared,{key:payload.key,node:target.node,original:target.node.value,raw:target.raw});
      }else if(method==='fillField'||method==='answer'){
        let key=method==='answer'?payload.key:args[1],value=method==='answer'?payload.answer:args[2];
        const target=fieldTarget(current,expected,key,value,method==='answer');if(!target.ok)return target;
        if(method==='answer'){
          const q=await question(expected,target);
          if(payload.confirmed!==true||q.scope!==payload.scope||q.version!==payload.version||q.text!==payload.text||q.source!==payload.source||q.purpose!==payload.purpose)return fail('structure','答案必须由本人确认，并限定于相同原问题、来源和用途。');
          if(q.optionsComplete&&q.options.length&&!q.options.some(option=>option.text===value&&!option.disabled))return fail('manual','确认答案不属于当前实际选项。');
          prepared.questionRaw=target.raw;
        }
        if(target.choice&&!target.selected&&!target.option)return fail('manual','请先打开当前原题的选项菜单。');
        Object.assign(prepared,{key,value,write:target.write,node:target.node,original:target.node.value,raw:target.raw,choice:target.choice,selection:target.selected,option:target.option});
      }else if(method==='upload'){
        const target=uploadTarget(current);if(!target.ok)return target;
        const file=args[1];
        if(!file||typeof file.name!=='string'||!/^[^\\/\x00-\x1f]{1,200}$/.test(file.name)||!Number.isInteger(file.size)||file.size<=0||file.size>8*1024*1024||!/^[a-f0-9]{64}$/.test(file.sha256||''))return fail('manual','待上传的确认附件身份无效。');
        const accepts=target.field.accept.split(',').map(value=>value.trim().toLowerCase()).filter(Boolean);
        if(!accepts.length||!accepts.some(value=>value.startsWith('.')?file.name.toLowerCase().endsWith(value):value===file.mime))return fail('manual','附件格式未包含在实际控件接受范围内。');
        const bytes=Uint8Array.from(atob(file.base64),c=>c.charCodeAt(0));
        const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
        if(bytes.length!==file.size||digest!==file.sha256)return fail('manual','待上传附件与锁定版本摘要不符。');
        const originalFiles=[...target.node.files];
        if(originalFiles.length&&(originalFiles.length!==1||originalFiles[0].name!==file.name||originalFiles[0].size!==file.size||await fileHash(originalFiles[0])!==digest))return fail('manual','保留网页已有附件，请本人核对。');
        const transfer=new DataTransfer();transfer.items.add(new File([bytes],file.name,{type:file.mime}));
        Object.assign(prepared,{node:target.node,originalFiles,transfer,file,hash:digest});
      }else{
        prepared.values=captureValues(current);
        const confirmed=await confirmedQuestions(expected,current);if(!confirmed.ok)return confirmed;
        const target=submissionTarget(expected,current);if(!target.ok||target.receipt)return target;
        if(!current.form.checkValidity())return fail('manual','表单必填项或原生格式校验未通过。');
        const file=await lockedFile(current,args[1]);if(!file.ok)return file;
        Object.assign(prepared,{node:target.node,fileNode:file.node,verifiedFile:file.file});
      }
      const fresh=checked(expected,layout);if(!fresh.ok||fresh.form!==prepared.form)return fresh.ok?fail('structure','申请表在预检期间已被替换。'):fresh;
      if(prepared.values&&!sameValues(prepared.values,fresh))return fail('manual','确认内容在附件核对期间已变化，未允许提交。');
      if(pending.size>=16)pending.clear();
      const token=crypto.randomUUID();pending.set(token,prepared);return {ok:true,token};
    }catch{return fail('manual','页面预检未完成，未继续填写、上传或提交。');}
  };
  function setValue(node,value) {
    const proto=node.tagName==='SELECT'?HTMLSelectElement.prototype:node.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto,'value').set.call(node,value);
    node.dispatchEvent(new Event('input',{bubbles:true,composed:true}));node.dispatchEvent(new Event('change',{bubbles:true,composed:true}));
  }
  async function observedWrite(prepared) {
    await new Promise(resolve=>setTimeout(resolve,500));
    if(!prepared.node.isConnected||prepared.node.value!==prepared.write||prepared.node.getAttribute('aria-invalid')==='true'||prepared.node.validity?.valid===false)return fail('manual','网站没有保留确认内容或显示校验错误，请本人核对。');
    return {ok:true,layout:prepared.layout,filled:1};
  }
  async function waitReceipt(expected) {
    if(expected.replay!==true)return fail('unknown','已发出一次提交；尚无经过验证的生产回执识别，只允许核对结果。');
    for(let count=0;count<50;count++){
      await new Promise(resolve=>setTimeout(resolve,100));
      try{const receipt=replayReceipt(expected);if(receipt)return {ok:true,receipt};}catch{return fail('unknown','回执身份不符，保留待核实且禁止重复提交。');}
    }
    return fail('unknown','未取得与本岗位、申请人及附件对应的可靠回执，禁止重复提交。');
  }
  api.commit=(expected,token)=>{
    const prepared=pending.get(token);pending.delete(token);
    if(!prepared||!sameExpected(expected,prepared.expected)||Date.now()-prepared.at>30000)return fail('structure','操作预检已过期或用途已变化，请重新检查。');
    try{
      const current=checked(expected,prepared.layout);if(!current.ok)return current;
      if(current.form!==prepared.form)return fail('structure','申请表已被替换，请重新检查。');
      if(prepared.method==='openChoice'){
        const target=current.records.find(record=>record.field.key===prepared.key);
        if(target?.node!==prepared.node||target.raw!==prepared.raw||target.node.value!==prepared.original||selectedChoice(target.node))return fail('manual','控件已变化，未打开菜单。');
        target.node.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));return {ok:true,opened:true};
      }
      if(prepared.method==='fillField'||prepared.method==='answer'){
        const target=fieldTarget(current,expected,prepared.key,prepared.value,prepared.method==='answer');if(!target.ok)return target;
        if(target.node!==prepared.node||target.raw!==prepared.raw||target.node.value!==prepared.original)return fail('manual','保留本人接管后修改的内容，未覆盖原值。');
        if(prepared.choice){
          if(selectedChoice(target.node)!==prepared.selection)return fail('manual','本人选择已变化，未覆盖。');
          if(prepared.selection===prepared.write)return {ok:true,layout:prepared.layout,filled:0};
          if(target.option!==prepared.option||!visible(prepared.option))return fail('structure','当前选项菜单已变化。');
          prepared.option.click();return new Promise(resolve=>setTimeout(()=>resolve(selectedChoice(target.node)===prepared.write?{ok:true,layout:prepared.layout,filled:1}:fail('manual','网站未保留确认选项。')),500));
        }
        if(target.node.value===prepared.write)return {ok:true,layout:prepared.layout,filled:0};
        // No await precedes this one authorized DOM write.
        setValue(target.node,prepared.write);return observedWrite(prepared);
      }
      if(prepared.method==='upload'){
        const target=uploadTarget(current);if(!target.ok)return target;
        const node=target.node;
        if(node!==prepared.node||node.files.length!==prepared.originalFiles.length||prepared.originalFiles.some((file,index)=>node.files[index]!==file))return fail('manual','保留本人接管后修改的附件，未覆盖已有文件。');
        if(!prepared.originalFiles.length){node.files=prepared.transfer.files;node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));}
        const verified=prepared.originalFiles[0]||prepared.transfer.files[0];
        if(node.files.length!==1||node.files[0]!==verified||node.files[0].name!==prepared.file.name||node.files[0].size!==prepared.file.size)return fail('manual','网站未接受已确认附件或附件被替换。');
        return {ok:true,layout:prepared.layout,fileName:prepared.file.name,fileSize:prepared.file.size,sha256:prepared.hash};
      }
      if(!sameValues(prepared.values,current))return fail('manual','提交授权等待期间申请内容已变化，请本人重新核对。');
      const target=submissionTarget(expected,current);if(!target.ok||target.receipt)return target;
      if(!current.form.checkValidity())return fail('manual','表单必填项或原生格式校验未通过。');
      // Native validation may dispatch synchronous handlers; repeat all structure
      // and immutable File checks after validation and immediately before click.
      const fresh=checked(expected,prepared.layout);if(!fresh.ok)return fresh;
      const final=submissionTarget(expected,fresh);if(!final.ok||final.receipt)return final;
      if(fresh.form!==prepared.form||final.node!==prepared.node||!sameValues(prepared.values,fresh)||prepared.fileNode.files.length!==1||prepared.fileNode.files[0]!==prepared.verifiedFile)return fail('manual','提交预检或授权期间申请内容、表单、入口或附件已变化。');
      fresh.form.dataset.greenhouseSubmissionAttempt='started';
      final.node.click();return waitReceipt(expected);
    }catch{return fail(prepared.method==='submit'?'unknown':'manual','操作结果未能可靠核验，请本人检查；不会自动重复提交。');}
  };
})();
