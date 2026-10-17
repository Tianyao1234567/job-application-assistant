import {definitions, emptyProfile, validateProfile} from '/schema.js';

// The dashboard renders server observations. It never advances application state on a timer.
const $ = selector => document.querySelector(selector);
const key = $('meta[name="local-key"]')?.content || '';
const content = $('#view-content');
const dialog = $('#task-dialog');
const healthDialog = $('#health-dialog');
const drafts = new Map();
const pendingActions = new Set();
const pendingForms = new Set();
const READ_TIMEOUT_MS = 8000;
const WRITE_TIMEOUT_MS = 20000;
let state = null;
let lastSignature = '';
let renderedView = '';
let taskDialogId = null;
let extensionReady = false;
let pairingIntent = null;
let pairingTimer;
let pairingRequested = false;
let composing = false;
let fetching = false;
let profileDraft = null;
let profileDirty = false;
let settingsDraft = null;
let settingsDirty = false;
let selectedResumeFile = null;
let toastTimer;
let healthBusy = false;
let healthResult = null;
let healthError = '';
const views = {
  overview: ['总览', '把精力留给下一次机会', '查看投递进度，处理需要你参与的环节。'],
  queue: ['岗位队列', '每一个机会，都有迹可循', '查看真实执行步骤；暂停、补答和核对都保留原任务。'],
  issues: ['待处理', '需要你的参与', '集中处理缺少的答案与人工步骤，再继续原来的申请。'],
  sites: ['网站准备', '一次准备，安心继续', '请在实际执行的同一浏览器中完成登录，再读取页面核实。'],
  profile: ['资料与简历', '确认你的申请资料', '只使用你确认过的资料；每次保存均保留版本。'],
  settings: ['设置与计划', '按自己的节奏出发', '配置岗位、城市、网站和每日额度。计划依赖本机组件持续运行。']
};
const taskLabels = {queued:'排队中', running:'正在执行', waiting_answer:'待补充答案', waiting_user:'待人工处理', paused:'已暂停', submitting:'正在提交 · 不可重投', submitted:'已核实提交', unknown:'结果待核实', failed:'执行失败', skipped:'已跳过', cancelled:'已取消'};
const phaseLabels = {inspect:'检查岗位与申请表', fill:'填写确认资料', upload:'上传所选简历', answer:'填写确认答案', submit:'准备提交', verify:'核对接收记录', done:'已完成'};
const loginLabels = {ready:'页面检查已就绪', login:'需要登录', expired:'登录已失效', verification:'需要人工验证', unknown:'尚待核实', account:'账号或范围不符'};
const modeLabel = mode => mode === 'real' ? '真实模式' : '本地演示';
const currentView = () => Object.hasOwn(views, location.hash.slice(1)) ? location.hash.slice(1) : 'overview';
const fmtDate = value => value ? new Intl.DateTimeFormat('zh-CN', {timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(value)) : '尚无记录';
const nextPlanLabel = () => state.manualPaused ? '已手动暂停，等待你继续' : state.nextRun ? fmtDate(state.nextRun) : state.settings.scheduleEnabled ? '等待当日计划检查' : '尚未启用';
const clone = value => structuredClone(value);
const openIssues = () => state?.issues.filter(issue => issue.status === 'open') || [];
const activeTasks = () => state?.tasks.filter(task => !['submitted','skipped','cancelled'].includes(task.status)) || [];

function el(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined || value === null || value === false) continue;
    if (name === 'class') node.className = value;
    else if (name === 'text') node.textContent = value;
    else if (name.startsWith('on')) node.addEventListener(name.slice(2).toLowerCase(), value);
    else if (name === 'checked' || name === 'disabled' || name === 'required' || name === 'hidden') node[name] = Boolean(value);
    else if (name === 'value') node.value = value;
    else node.setAttribute(name, String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child !== null && child !== undefined && child !== false) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}
const p = (text, className = '') => el('p', {class:className, text});
const badge = (text, style = 'neutral') => el('span', {class:`badge ${style}`, text});
const statusBadge = task => badge(taskLabels[task.status] || '状态待核实', task.status === 'submitted' ? 'good' : ['unknown','failed'].includes(task.status) ? 'bad' : ['waiting_answer','waiting_user','paused'].includes(task.status) ? 'warning' : task.status === 'running' ? 'blue' : 'neutral');
const link = (text, href, className = '') => el('a', {href, class:className, text});
function button(text, handler, style = '', disabled = false) {
  return el('button', {type:'button', class:`button ${style}`, disabled, onClick:handler, text});
}
function actionButton(text, action, payload = {}, style = '', disabled = false) {
  const token = actionToken(action, payload);
  const node = button(text, () => perform(action, payload), style, disabled || pendingActions.has(token));
  node.dataset.actionToken = token;
  node.dataset.actionDisabled = String(disabled);
  return node;
}
function card(title, body, extra = null, subtitle = '') {
  return el('section', {class:'card'}, el('div', {class:'card-header'}, el('div', {}, el('h2', {text:title}), subtitle ? p(subtitle, 'subtitle') : null), extra), el('div', {class:'card-body'}, body));
}
function meta(label, value) { return el('div', {}, el('div', {class:'meta-label', text:label}), el('div', {class:'meta-value'}, value)); }
function empty(title, text, actions = []) {
  return el('div', {class:'empty-state'}, el('span', {class:'empty-symbol', 'aria-hidden':'true', text:'◌'}), el('h2', {text:title}), p(text), actions.length ? el('div', {class:'actions'}, actions) : null);
}
function banner(title, detail = '', style = '') {
  return el('div', {class:`banner ${style}`}, el('div', {}, el('strong', {text:title}), detail ? p(detail) : null));
}
function errorBox(form, error) {
  let box = form.querySelector('.form-error');
  if (!box) {box = el('p', {class:'form-error', role:'alert'}); form.append(box);}
  box.textContent = error instanceof Error ? error.message : String(error);
  box.scrollIntoView({block:'nearest'});
}
function toast(message, error = false) {
  clearTimeout(toastTimer);
  const node = $('#toast'); node.textContent = message; node.classList.toggle('error', error); node.hidden = false;
  toastTimer = setTimeout(() => {node.hidden = true;}, error ? 8000 : 4500);
}
async function api(path, body) {
  const readOnly = body === undefined;
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(readOnly ? '读取本机后台超时，将继续尝试同步。' : '操作等待超时，结果尚未确认；请先核对后台状态，再决定是否再次操作。'));
      controller.abort();
    }, readOnly ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS);
  });
  const request = (async () => {
    let response;
    try {
      response = await fetch(path, {method:readOnly ? 'GET' : 'POST', signal:controller.signal, credentials:'same-origin', cache:'no-store', headers:{'X-Local-Key':key, ...(readOnly ? {} : {'Content-Type':'application/json'})}, ...(readOnly ? {} : {body:JSON.stringify(body)})});
    } catch (error) {
      if (controller.signal.aborted) throw error;
      throw new Error(readOnly ? '无法连接本机后台，将继续尝试同步。' : '连接中断，操作结果尚未确认；请先核对后台状态，系统不会自动重试此操作。');
    }
    let data;
    try {data = await response.json();} catch (error) {
      if (controller.signal.aborted) throw error;
      throw new Error(readOnly ? '后台返回内容无法读取，请检查本机服务。' : '无法读取操作回执，结果尚未确认；请先核对后台状态。');
    }
    if (!response.ok || data?.ok === false) throw new Error(data?.error || `操作未完成（${response.status}），请检查后台状态。`);
    return data;
  })();
  try {return await Promise.race([request, timeout]);}
  finally {clearTimeout(timer);}
}
const actionToken = (action, payload = {}) => `${action}:${payload.taskId || payload.siteId || ''}`;
function markActionPending(token, busy) {
  document.querySelectorAll('[data-action-token]').forEach(node => {
    if (node.dataset.actionToken !== token) return;
    node.disabled = busy || node.dataset.actionDisabled === 'true';
  });
}
async function submitOnce(form, token, operation) {
  if (pendingForms.has(token)) return;
  pendingForms.add(token);form.setAttribute('aria-busy','true');
  const mark = busy => document.querySelectorAll('[data-form-token]').forEach(node => {if(node.dataset.formToken===token)node.disabled=busy;});
  mark(true);
  try {await operation();}
  finally {pendingForms.delete(token);form.removeAttribute('aria-busy');mark(false);}
}
function submitButton(text, token) {return el('button',{type:'submit',class:'button primary','data-form-token':token,disabled:pendingForms.has(token),text});}
async function perform(action, payload = {}) {
  const token = actionToken(action, payload);
  if (pendingActions.has(token)) return;
  pendingActions.add(token);markActionPending(token,true);
  try {
    const result = await api('/api/action', {action,...payload});
    if (action === 'demo') {profileDraft = null; settingsDraft = null; profileDirty = settingsDirty = false; selectedResumeFile = null; drafts.clear();}
    if (action === 'answer') {drafts.delete(`answer-${payload.taskId}`); drafts.delete(`save-answer-${payload.taskId}`);}
    if (action === 'add') drafts.delete('add-url');
    const messages = {demo:'已载入虚构资料，仅供本地测试站演示。', run:'已请求发现并投递，符合条件的岗位会进入自动申请；进度以实际浏览器回报为准。', discover:'已请求发现并投递，符合条件的岗位会进入自动申请；进度以实际浏览器回报为准。', pause:'已全局暂停，后续动作会检查停止授权。', resume:'已请求继续，执行前会重新检查页面。', add:result.duplicate?'这个岗位已在队列中，未创建重复任务。':'已加入队列。', answer:'答案已确认，将继续同一任务。', verify:'已请求核对接收记录，不会再次提交。', 'site-check':'已请求读取实际页面登录状态。', 'site-open':'已请求在投递浏览器打开网站准备入口。', 'site-skip':'已暂时跳过该网站，原任务保留。', 'site-resume':'已请求重新检查该网站。', 'task-pause':'任务已暂停，可在浏览器接管。', 'task-resume':'已请求继续原任务，先重新检查。', 'task-skip':'任务已跳过，记录保留。', 'browser-open':'已请求打开专用投递浏览器。'};
    toast(messages[action] || '操作已保存。');
    await refresh(true);
    return result;
  } catch (error) {toast(error.message, true); throw error;}
  finally {pendingActions.delete(token);markActionPending(token,false);}
}
// Catch click-handler errors once; forms handle and display their own validation errors.
window.addEventListener('unhandledrejection', event => {event.preventDefault(); toast(event.reason?.message || '操作未完成，请检查本机服务。', true);});
function connect() {
  if (!key) return toast('后台配对信息缺失，请从本机服务重新打开工作台。', true);
  if (pairingIntent) return;
  pairingRequested = true;
  // At most one initial message and one replay after a late content-script listener.
  pairingIntent = {readyReplaySent:extensionReady};
  pairingTimer = setTimeout(() => {
    pairingIntent = null;updateConnectButton();
    toast('未收到插件配对回执，请核对插件执行端状态后再点击连接。',true);
  },15000);
  window.postMessage({channel:'job-local', type:'connect', key}, location.origin);
  updateConnectButton();
  toast(extensionReady ? '已发送配对请求，等待执行端实际连接。' : '已发送配对请求。如果插件未加载，请按总览中的说明加载扩展。');
}
function updateConnectButton() {
  const node=$('#connect-button');node.disabled=Boolean(pairingIntent);
  node.textContent=pairingIntent?'等待插件配对…':state?.connection.connected?'重新连接':'连接插件';
}
$('#connect-button').addEventListener('click', connect);
window.addEventListener('message', event => {
  if (event.source !== window || event.origin !== location.origin || event.data?.channel !== 'job-local') return;
  if(event.data.type==='extension-ready'){
    extensionReady = true;
    if(pairingIntent&&!pairingIntent.readyReplaySent){
      pairingIntent.readyReplaySent=true;
      window.postMessage({channel:'job-local',type:'connect',key},location.origin);
    }
    render(true);
  }else if(event.data.type==='connected'&&pairingIntent&&typeof event.data.ok==='boolean'){
    clearTimeout(pairingTimer);pairingIntent=null;updateConnectButton();
    toast(event.data.ok?'插件已接受配对，等待后台确认实际执行端心跳。':'插件配对失败，请确认扩展已启用，再点击连接重试。',!event.data.ok);
  }
});
if (new URLSearchParams(location.search).get('autoconnect') === '1') setTimeout(() => {if(!pairingRequested)connect();}, 100);

function updateHealthButtons() {
  document.querySelectorAll('[data-health]').forEach(node => {node.disabled = healthBusy;node.textContent = healthBusy ? '正在自检…' : '一键自检';});
}
function healthFollowUp(check) {
  if (check.status === 'pass') return null;
  if (check.id === 'extension') return button('连接插件',connect,'small');
  if (check.id === 'configuration') return el('div',{class:'actions'},link('确认资料与简历','#profile','button small'),link('检查规则与计划','#settings','button small'));
  if (check.id?.startsWith('site:')) return link('前往网站准备','#sites','button small');
  if (check.id === 'execution') return link('查看计划与暂停状态','#settings','button small');
  return null;
}
function closeHealthForNavigation(event) {
  if (event.target.closest('a[href^="#"]')) healthDialog.close();
}
function renderHealthDialog() {
  const checks = healthResult?.checks || [];
  const labels = {pass:'通过',warning:'需要留意',fail:'需要处理'};
  const styles = {pass:'good',warning:'warning',fail:'bad'};
  const body = el('div',{class:'dialog-body'},
    banner('自检只读取状态，不会投递或解除暂停','插件心跳与网站登录项使用当前已记录的检查结果；要重新核实实际招聘页面，请前往“网站准备”。'),
    healthBusy ? p('正在检查本机服务与已记录的执行准备，请稍候。','muted') : null,
    healthError ? banner('本次自检未完成',healthError,'danger') : null,
    healthResult ? p(`检查时间：${fmtDate(healthResult.checkedAt)} · 上海时间`,'subtle') : null,
    checks.length ? el('ol',{class:'health-checks'},checks.map(check => el('li',{class:'health-check'},
      el('div',{class:'health-check-heading'},el('strong',{text:check.label}),badge(labels[check.status],styles[check.status])),
      p(check.detail),check.action ? p(`建议操作：${check.action}`,'health-action') : null,healthFollowUp(check)))) : null);
  const retry = button(healthBusy?'正在自检…':'一键自检',runHealthCheck,'primary small',healthBusy);retry.dataset.health='true';
  $('#health-dialog-content').replaceChildren(el('div',{class:'dialog-header'},el('div',{},el('h2',{id:'health-dialog-title',text:'本机运行自检'}),p('检查服务、执行端、配置与已记录的网站准备。')),el('button',{type:'button',class:'dialog-close','aria-label':'关闭自检结果',onClick:()=>healthDialog.close(),text:'×'})),body,el('div',{class:'health-dialog-actions'},retry,button('关闭',()=>healthDialog.close(),'small')));
}
async function runHealthCheck() {
  if (healthBusy) return;
  healthBusy=true;healthResult=null;healthError='';updateHealthButtons();renderHealthDialog();
  if (!healthDialog.open) healthDialog.showModal();
  try {
    const result = await api('/api/health');
    if (!result || !Array.isArray(result.checks) || !Number.isFinite(Date.parse(result.checkedAt)) || result.checks.some(check => !check || typeof check.id !== 'string' || !['pass','warning','fail'].includes(check.status) || typeof check.label !== 'string' || typeof check.detail !== 'string' || (check.action !== undefined && typeof check.action !== 'string'))) throw new Error('自检结果格式无法读取，请检查本机服务。');
    healthResult=result;
  } catch (error) {healthError=error.message;}
  finally {healthBusy=false;renderHealthDialog();updateHealthButtons();}
}
$('#health-button').addEventListener('click',runHealthCheck);
healthDialog.addEventListener('click',closeHealthForNavigation);

function focusSnapshot(root) {
  const node = document.activeElement;
  if (!node || !root.contains(node) || !node.dataset.focus) return null;
  return {id:node.dataset.focus, start:node.selectionStart, end:node.selectionEnd};
}
function restoreFocus(root, focus) {
  if (!focus) return;
  const target = [...root.querySelectorAll('[data-focus]')].find(node => node.dataset.focus === focus.id);
  if (!target) return;
  target.focus({preventScroll:true});
  if (typeof target.setSelectionRange === 'function' && typeof focus.start === 'number') {try {target.setSelectionRange(focus.start, focus.end);} catch { /* numeric inputs have no text selection */ }}
}
function draftInput(id, attributes = {}, initial = '', onChange = null, tag = 'input') {
  const value = drafts.has(id) ? drafts.get(id) : initial;
  const control = el(tag, {...attributes, 'data-focus':id, ...(attributes.type === 'checkbox' ? {checked:value} : {value})});
  control.addEventListener('input', () => {const next = control.type === 'checkbox' ? control.checked : control.value; drafts.set(id,next); onChange?.(next);});
  return control;
}
function field(label, input, hint = '') {return el('label', {class:'field'}, el('span', {text:label}), input, hint ? el('small', {text:hint}) : null);}
function checkLine(label, input) {return el('label', {class:'checkbox-line'}, input, el('span', {text:label}));}
function modeStrip() {
  return el('div', {class:'mode-strip'}, el('div', {}, el('strong', {text:modeLabel(state.settings.mode)}), ' · ', state.settings.mode === 'demo' ? '仅使用虚构资料，仅向 127.0.0.1 本地测试站提交。' : '真实网站尚待适配；不会自动执行未验证网站。'), badge(state.settings.mode === 'demo' ? '演示与真实记录分开' : '接入待验证', state.settings.mode === 'demo' ? 'good' : 'warning'));
}
function header() {
  const view = currentView();
  const [name,title,subtitle] = views[view];
  $('#breadcrumb-current').textContent = name; $('#page-title').textContent = title; $('#page-subtitle').textContent = subtitle;
  $('#page-eyebrow').textContent = {overview:'YOUR NEXT OPPORTUNITY',queue:'YOUR APPLICATIONS',issues:'NEEDS YOUR ATTENTION',sites:'READY TO CONTINUE',profile:'YOUR CONFIRMED PROFILE',settings:'YOUR WORKFLOW'}[view];
  document.querySelectorAll('nav [data-view]').forEach(node => {node.classList.toggle('active', node.dataset.view === view); if (node.dataset.view === view) node.setAttribute('aria-current','page'); else node.removeAttribute('aria-current');});
  $('#queue-nav-count').textContent = String(activeTasks().length);
  $('#issue-nav-count').textContent = String(openIssues().length);
  const connection = $('#connection-status');
  connection.replaceChildren(el('span', {class:'status-dot'}), document.createTextNode(state.connection.connected ? '插件执行端已连接' : '插件执行端未连接'));
  connection.classList.toggle('online', state.connection.connected);
  updateConnectButton();
  const mode = $('#mode-badge'); mode.textContent = modeLabel(state.settings.mode); mode.className = `badge ${state.settings.mode === 'demo' ? 'good' : 'warning'}`;
  const actions = [];
  if (view === 'overview' || view === 'queue') {
    actions.push(actionButton('发现并投递', 'discover', {}, '', !state.connection.connected || Boolean(state.readiness.length)));
    actions.push(state.running && !state.paused ? actionButton('暂停全部', 'pause') : state.manualPaused ? actionButton('继续投递', 'resume', {}, 'primary', !state.connection.connected || Boolean(state.readiness.length)) : actionButton('开始投递', 'run', {}, 'primary', !state.connection.connected || Boolean(state.readiness.length)));
  }
  if (view === 'sites') actions.push(actionButton('打开投递浏览器', 'browser-open', {}, 'primary'));
  $('#page-actions').replaceChildren(...actions);
  updateHealthButtons();
}
function render(force = false) {
  if (!state) return;
  header();
  const view = currentView();
  // Keep browser-owned editing and IME composition nodes intact during polling.
  // Counters and connection status above still reflect the latest server state.
  const editing = content.contains(document.activeElement) && document.activeElement?.matches('input,textarea,select,[contenteditable="true"]');
  if (renderedView === view && (composing || (!force && editing))) return;
  const signature = JSON.stringify([view, state.running,state.paused,state.manualPaused,state.settings,state.sites,state.tasks,state.issues,state.profile,state.resume,state.nextRun,state.lastSchedule,state.readiness,state.stats,state.connection.connected,state.connection.profileId,extensionReady]);
  if (!force && signature === lastSignature && renderedView === view) return;
  const focus = focusSnapshot(content);
  const renderer = {overview:renderOverview,queue:renderQueue,issues:renderIssues,sites:renderSites,profile:renderProfile,settings:renderSettings}[view];
  content.replaceChildren(renderer());
  renderedView = view; lastSignature = signature;
  restoreFocus(content, focus);
  renderTaskDialog();
}
async function refresh(force = false) {
  if (fetching) return;
  fetching = true;
  try {
    state = await api('/api/state');
    $('#offline-banner').hidden = true;
    $('#last-refresh').textContent = `最近同步 ${fmtDate(state.now)} · 上海时间`;
    render(force);
  } catch (error) {
    const offline = $('#offline-banner'); offline.textContent = `无法读取本机后台：${error.message} 所有进度保留最近一次实际状态。`; offline.hidden = false;
    $('#connection-status').classList.remove('online'); $('#connection-status').textContent = '后台连接中断';
    $('#last-refresh').textContent = '同步中断 · 等待重新连接';
  } finally {fetching = false;}
}
window.addEventListener('hashchange', () => render(true));
content.addEventListener('compositionstart', () => {composing = true;});
content.addEventListener('compositionend', () => {composing = false;});

function renderOverview() {
  const stats = state.stats[state.settings.mode];
  const stat = (label,value,foot,style='') => el('div', {class:`stat-card ${style}`}, el('div', {class:'stat-label',text:label}), el('div', {class:'stat-value',text:String(value)}), el('div', {class:'stat-foot',text:foot}));
  const running = state.tasks.find(task => ['running','submitting'].includes(task.status));
  const executionLabel = state.manualPaused ? '手动暂停，计划不会自动恢复' : state.running && !state.paused ? '按实际步骤执行中' : state.settings.scheduleEnabled ? '等待每日计划' : state.paused ? '自动执行已暂停' : '等待开始';
  const execution = el('div', {},
    el('div', {class:'hero-status'}, el('div', {class:'status-orb','aria-hidden':'true',text:state.paused?'Ⅱ':state.running?'↗':'◌'}), el('div', {}, el('h3', {text:executionLabel}), p(running ? `${running.company} · ${running.title}` : state.connection.connected ? '执行端已连接，等待可运行任务。' : '先连接插件，才能操作实际招聘页面。'))),
    el('div', {class:'execution-summary'}, meta('当前步骤', running ? phaseLabels[running.phase] || '等待页面回报' : '尚无正在执行的任务'), meta('投递浏览器', state.connection.connected?'实际执行端已连接':'未连接'), meta('下一次计划',nextPlanLabel()),meta('今日额度',`${stats.today} 已核实 / ${state.settings.dailyLimit} 每日上限`)),
    state.manualPaused ? p('手动暂停会持续保留。到达计划时间、重连或重启都不会解除；请确认准备后点击“继续投递”。','execution-note') : null,
    p('只有读取目标站可靠回执才记为已提交。提交结果未知时只核对，不会自动重投。','execution-note'),
    running ? button('查看当前任务',() => showTask(running.id),'text') : null);
  const issueList = openIssues().slice(0,3);
  const issues = issueList.length ? issueList.map(issue => el('div',{class:'issue-row'},el('span',{class:'issue-symbol','aria-hidden':'true',text:'!'}),el('div',{},el('strong',{text:issue.title}),p(issue.detail)),link('去处理','#issues','button small'))) : empty('暂时没有待处理事项','执行中遇到缺少答案、登录或人工步骤，会在这里集中显示。');
  const readiness = state.readiness.length ? el('div', {},banner('开始前，还需要完成这些准备'), el('ul',{class:'readiness-list'},state.readiness.map(text=>el('li',{text}))),el('div',{class:'actions'},link('确认资料','#profile','button small'),link('设置规则','#settings','button small'))) : el('div',{},banner('申请资料和设置已准备','网站登录状态会由实际执行浏览器逐站检查。','good'),link('查看网站准备','#sites','button text'));
  const bridge = el('div', {class:'connection-instructions'}, p(state.connection.connected ? '后台正在接收插件心跳。网站登录与申请操作均使用此执行端的浏览器配置。' : extensionReady ? '已检测到插件页面桥接，请点击“连接插件”，等待执行端心跳。' : '尚未检测到插件。请在运行本机服务的电脑上打开投递浏览器，或手动加载仓库中的 autofill-extension 目录。'),
    p('手动加载：在浏览器扩展管理页开启开发者模式，选择“加载已解压的扩展程序”，选取 autofill-extension，再刷新此工作台并连接。'),
    p('请保留本机服务、浏览器及插件执行器。关闭电脑或停止组件后计划无法执行；错过往日批次不会多批补跑。'),
    el('div',{class:'actions'},button('连接插件',connect,'small'),actionButton('打开投递浏览器','browser-open',{},'small')),
    state.connection.profileId ? p(`当前执行配置标识：${state.connection.profileId}`,'subtle') : null);
  return el('div', {},modeStrip(),el('div',{class:'stats-grid'},stat('今日已核实提交',stats.today,`${modeLabel(state.settings.mode)} · 依据接收记录`),stat('待执行与处理',activeTasks().length,'保留原任务和恢复记录'),stat('需要你处理',openIssues().length,'按网站和问题集中处理','warning'),stat('累计已核实提交',stats.submitted,'本模式独立统计')),
    el('div',{class:'overview-grid'},el('div',{class:'stack'},card('执行状态',execution),card('最近岗位',taskTable([...state.tasks].reverse().slice(0,4)),link('查看全部','#queue','card-link'))),el('div',{class:'stack'},card('待处理事项',issues,link('查看全部','#issues','card-link')),card('开始前的准备',readiness),card('插件与本机组件',bridge))),
    card('安全的本地演示',el('div',{},p('准备明确标注的虚构资料和本地测试站。仅供尚未创建任务的初始环境使用；不会清空已有任务。此操作会替换当前资料与筛选设置。','details-note'),button('准备虚构演示资料',()=>{if (window.confirm('将使用虚构演示资料替换当前资料、简历及筛选设置；仅向本地测试站提交，不清除已有任务。继续吗？')) return perform('demo');},'',state.running||state.tasks.length>0))));
}
function taskTable(tasks) {
  if (!tasks.length) return empty('还没有岗位记录','选择“发现并投递”会读取岗位列表并自动申请符合条件的岗位；也可以先手动加入链接。');
  const headings=['岗位与公司','城市 / 来源','状态','最近进展',''];
  return el('div',{class:'table-wrap'},el('table',{},el('thead',{},el('tr',{},headings.map(text=>el('th',{scope:'col',text})))),el('tbody',{},tasks.map(task=>el('tr',{},el('td',{},el('div',{class:'job-title',text:task.title}),el('div',{class:'job-sub',text:task.company}),badge(modeLabel(task.mode))),el('td',{},task.location||'待核实',el('div',{class:'job-sub',text:task.source})),el('td',{},statusBadge(task)),el('td',{},el('div',{text:task.steps.at(-1)?.label || '等待执行'}),el('div',{class:'job-sub',text:fmtDate(task.updatedAt||task.discoveredAt)})),el('td',{},button('查看详情',()=>showTask(task.id),'text')))))));
}
function renderQueue() {
  const filter = drafts.get('queue-filter') || 'all';
  const groups = {all:()=>true,active:t=>['queued','running','submitting'].includes(t.status),waiting:t=>['waiting_answer','waiting_user','paused','unknown','failed'].includes(t.status),submitted:t=>t.status==='submitted',skipped:t=>['skipped','cancelled'].includes(t.status)};
  const tabs=el('div',{class:'filter-tabs'},Object.entries({all:'全部岗位',active:'排队与执行',waiting:'待处理',submitted:'已核实提交',skipped:'已跳过'}).map(([id,label])=>button(label,()=>{drafts.set('queue-filter',id);render(true);},`filter-tab ${filter===id?'active':''}`)));
  const form = el('form',{class:'inline-form','aria-label':'手动加入岗位'});
  const input=draftInput('add-url',{class:'form-input',type:'url',required:true,placeholder:'粘贴完整岗位详情或申请页链接','aria-label':'岗位链接'});
  form.append(input,submitButton('加入队列','add'));
  form.addEventListener('submit',async event=>{event.preventDefault();try {await submitOnce(form,'add',()=>perform('add',{url:input.value}));}catch(error){errorBox(form,error);}});
  const jobs=[...state.tasks].reverse().filter(groups[filter]||groups.all);
  return el('div',{},modeStrip(),card('手动加入岗位',el('div',{},form,p('链接会按网站、租户、岗位与申请账号去重。未适配网站保留待办，不自动执行。','details-note'))),el('section',{class:'card'},el('div',{class:'toolbar'},tabs,el('span',{class:'subtle',text:`${jobs.length} 条记录`})),taskTable(jobs)));
}
function taskActions(task) {
  const actions=[];
  if (task.canVerify === true) actions.push(actionButton('核对接收记录','verify',{taskId:task.id},'primary',!state.connection.connected));
  else if (task.status==='submitting') actions.push(el('span',{class:'badge warning',text:'提交已记录，等待回执；不可重新投递'}));
  else {
    if (task.canResume === true) actions.push(actionButton(task.status==='skipped'?'重新检查并排队':'重新检查并继续','task-resume',{taskId:task.id},'primary'));
    if (['queued','running','waiting_answer','waiting_user'].includes(task.status)) actions.push(actionButton('暂停并接管','task-pause',{taskId:task.id}));
    if (!['skipped','cancelled'].includes(task.status)) actions.push(actionButton('跳过此任务','task-skip',{taskId:task.id},'danger'));
  }
  if (task.status==='waiting_answer') actions.push(button('去补充答案',()=>{dialog.close();location.hash='issues';},'primary'));
  return el('div',{class:'actions'},actions);
}
function showTask(id) {taskDialogId=id;renderTaskDialog();if(!dialog.open)dialog.showModal();}
function renderTaskDialog() {
  if (!taskDialogId) return;
  const task=state.tasks.find(item=>item.id===taskDialogId);if(!task)return;
  const root=$('#task-dialog-content');const focus=focusSnapshot(root);const scroll=dialog.scrollTop;
  const site=state.sites.find(item=>item.id===task.siteId);
  const sections=[
    el('div',{class:'dialog-header'},el('div',{},statusBadge(task),el('h2',{id:'task-dialog-title',text:task.title}),p(`${task.company} · ${task.location||'城市待核实'}`)),button('×',()=>dialog.close(),'dialog-close')),
    el('div',{class:'dialog-body'},el('div',{class:'dialog-meta'},meta('网站',site?.name||'网站已移除'),meta('运行模式',modeLabel(task.mode)),meta('当前步骤',phaseLabels[task.phase]||'等待核实'),meta('资料版本',task.profileVersion?`v${task.profileVersion}`:'执行前锁定'),meta('简历版本',task.resumeVersion?`v${task.resumeVersion}`:'执行前锁定'),meta('岗位编号',task.jobId)),p(task.filterReason,'details-note'),
      task.issue?banner(task.issue.title,task.issue.detail,task.status==='unknown'?'danger':''):null,
      task.status==='unknown'?banner('只核对，不重新提交','没有找到回执也不代表可以重投。登录恢复、重连和重启都不会自动再次提交。','danger'):null,
      task.result?card('提交结果依据',el('div',{},meta('站点回执',task.result.receiptId),meta('附件',`${task.result.fileName} · ${task.result.fileSize} 字节`),meta('附件 SHA-256',el('span',{class:'hash-text',text:task.result.sha256})),p(task.result.evidence,'details-note'))):null,
      taskActions(task),
      el('h3',{class:'dialog-section-title',text:'实际执行记录'}),task.steps.length?el('ol',{class:'timeline'},task.steps.map(step=>el('li',{},el('strong',{text:step.label}),p(step.detail),el('time',{datetime:step.at,text:fmtDate(step.at)})))):p('尚无执行记录。'),
      el('h3',{class:'dialog-section-title',text:'页面与任务标识'}),meta('原始岗位页面',task.url),meta('当前执行页面',task.currentUrl||'尚未打开'),meta('任务标识',task.id),meta('去重依据',task.dedupeKey),p('原页面可能含有申请资料，请在专用投递浏览器内查看；本页不会读取其他浏览器的登录。','details-note'))
  ];
  root.replaceChildren(...sections);restoreFocus(root,focus);dialog.scrollTop=scroll;
}
dialog.addEventListener('close',()=>{taskDialogId=null;});

function answerForm(issue,task) {
  const form=el('form',{'aria-label':`补充答案：${task.title}`});
  const question=issue.question||task.question;
  form.append(el('div',{class:'question-block'},el('strong',{text:'网站原问题'}),p(question?.text||issue.detail),p(`限定用途：${question?.scope||'仅本任务'}`,'subtle')));
  const answer=draftInput(`answer-${task.id}`,{required:true,maxlength:5000,placeholder:'请填写你确认的答案；系统不会猜测个人经历或其他信息。','aria-label':'确认答案'},'',null,'textarea');
  const save=draftInput(`save-answer-${task.id}`,{type:'checkbox'},false);
  form.append(field('你的确认答案',answer),checkLine('保存为本站相同原文、相同限定用途的确认答案',save),el('div',{class:'form-actions'},submitButton('确认答案并继续原任务',`answer-${task.id}`),el('span',{class:'form-caption',text:'提交答案后先重新检查页面和已有接收记录。'})));
  form.addEventListener('submit',async event=>{event.preventDefault();try {await submitOnce(form,`answer-${task.id}`,()=>perform('answer',{taskId:task.id,answer:answer.value,save:save.checked}));}catch(error){errorBox(form,error);}});
  return form;
}
function renderIssues() {
  const issues=openIssues();
  if(!issues.length)return el('div',{},modeStrip(),card('待处理中心',empty('当前没有待处理事项','遇到登录、缺少答案、结构变化或提交结果未知时，会保留原任务并在此显示。')));
  return el('div',{},modeStrip(),issues.map(issue=>{
    const task=state.tasks.find(item=>item.id===issue.taskId);const site=state.sites.find(item=>item.id===issue.siteId);
    let body;
    if(issue.kind==='answer'&&task?.status==='waiting_answer')body=answerForm(issue,task);
    else if(['login','account'].includes(issue.kind)&&site)body=el('div',{},p('请在实际执行的同一投递浏览器中处理，然后重新检查。页面打开或自行勾选完成不会被当作已登录。'),siteControls(site));
    else body=el('div',{},issue.question?el('div',{class:'question-block',text:issue.question.text}):null,task?taskActions(task):null,issue.kind==='adapter'?link('查看网站接入状态','#sites','button'):null);
    return el('section',{class:'card issue-card'},el('div',{class:'card-header'},el('div',{},el('h3',{text:issue.title}),p([site?.name,task?.title].filter(Boolean).join(' · '),'subtitle')),badge(issue.kind==='unknown'?'只核对结果':'等待你处理',issue.kind==='unknown'?'bad':'warning')),el('div',{class:'card-body'},p(issue.detail),body,task?button('查看任务完整记录',()=>showTask(task.id),'text'):null,el('p',{class:'subtle',text:`发现于 ${fmtDate(issue.createdAt)}`})));
  }));
}
function siteControls(site) {
  if(site.adapter!=='local-v1')return el('div',{class:'actions'},badge('待适配 · 不自动执行','warning'),link('编辑网站配置','#settings','button small'));
  return el('div',{class:'actions'},actionButton('打开准备页面','site-open',{siteId:site.id},'small',!state.connection.connected),actionButton('重新检查页面','site-check',{siteId:site.id},'primary small',!state.connection.connected),site.skipped?actionButton('恢复并检查','site-resume',{siteId:site.id},'small',!state.connection.connected):actionButton('暂时跳过本站','site-skip',{siteId:site.id},'small'));
}
function renderSites() {
  const sites=state.sites;
  const ready=sites.filter(site=>site.login?.status==='ready'&&site.login.profileId===state.connection.profileId).length;
  return el('div',{},modeStrip(),banner(`网站准备 ${ready} / ${sites.length} 已通过页面检查`,'同网站与租户合并处理；一个网站等待时，其他已准备的网站可继续。跳过会保留任务。'),!state.connection.connected?banner('请先连接投递浏览器','重新检查需要插件读取实际页面，不会通过勾选或网页打开状态确认登录。'):null,
    sites.length?el('div',{class:'site-grid'},sites.map(site=>{
      const affected=state.tasks.filter(task=>task.siteId===site.id&&!['submitted','skipped','cancelled'].includes(task.status));
      const login=site.login||{status:'unknown'};const sameProfile=login.profileId&&login.profileId===state.connection.profileId;
      const loginText=site.adapter!=='local-v1'?'网站待适配':site.skipped?'本站已暂时跳过':login.status==='ready'&&!sameProfile?'执行配置已变，需重新检查':loginLabels[login.status]||'状态待核实';
      return el('section',{class:'card site-card'},el('div',{class:'card-header'},el('div',{class:'site-title'},el('span',{class:'company-mark',text:site.name.slice(0,1)}),el('div',{},el('h3',{text:site.name}),p(site.origin,'subtitle'))),badge(loginText,login.status==='ready'&&sameProfile&&!site.skipped?'good':'warning')),el('div',{class:'card-body'},el('div',{class:'site-facts'},meta('申请账号标识',site.expectedAccount||'尚未配置'),meta('公司 / 租户范围',site.tenant),meta('受影响任务',`${affected.length} 个`),meta('最后页面检查',fmtDate(login.checkedAt)),meta('执行用途',modeLabel(site.mode)),meta('来源状态',site.enabled?'已启用':'未启用')),
        p(site.adapter==='local-v1'?'本地测试站仅提供虚构 demo 账号，不涉及密码或验证码。请在准备页面亲自选择账号并登录。':'该网站尚未验证发现、登录、填写和回执识别，当前不会自动执行真实投递。','site-help'),siteControls(site),affected.length?el('div',{class:'details-note'},el('strong',{text:'关联岗位'}),el('ul',{},affected.map(task=>el('li',{},button(task.title,()=>showTask(task.id),'text'),` · ${taskLabels[task.status]||'待核实'}`)))):null));
    })):card('网站来源',empty('尚未配置网站','请先设置招聘网站；或在总览载入只供本地测试站使用的虚构演示。',[link('配置网站','#settings','button primary')])),
    card('集中准备说明',el('div',{class:'connection-instructions'},p('请保留专用浏览器配置，本机服务、浏览器和插件执行器需要持续运行。你可以在等待时处理其他网站，无需反复确认同站点的多个岗位。'),p('登录、注册、扫码、短信和验证由你亲自处理。凭据不填写到资料库或补答框。重新检查只读取登录状态，不填写、上传或提交申请。'),p('不同浏览器或另一个执行配置的登录不能代替当前配置。账号或租户不符时保留暂停；提交结果未知时恢复登录也只核对回执。'))));
}

function profileField(kind,entry,keyName) {
  const data=entry[keyName]||{zh:null,en:null,source:'用户填写',confirmed:false};
  const row=el('div',{class:'field'});
  const label=definitions[kind]?.[keyName]||keyName;
  const prefix=`profile-${kind}-${entry.id||'base'}-${keyName}`;
  const update=(property,value)=>{
    if(!entry[keyName])entry[keyName]={zh:null,en:null,source:'用户填写',confirmed:false};
    entry[keyName][property]=property==='confirmed'?value:value.trim()?value:null;
    if(property!=='confirmed'){entry[keyName].confirmed=false;entry[keyName].source='用户填写';const confirmation=row.querySelector('input[type=checkbox]');if(confirmation)confirmation.checked=false;}
    profileDirty=true;
  };
  const multiline=['description'].includes(keyName);const tag=multiline?'textarea':'input';
  const zh=el(tag,{'data-focus':`${prefix}-zh`,value:data.zh||'',placeholder:'中文值','aria-label':`${label} 中文`,maxlength:10000,onInput:event=>update('zh',event.target.value)});
  const en=el(tag,{'data-focus':`${prefix}-en`,value:data.en||'',placeholder:'英文值（可选）','aria-label':`${label} 英文`,maxlength:10000,onInput:event=>update('en',event.target.value)});
  const confirmed=el('input',{type:'checkbox','data-focus':`${prefix}-confirmed`,checked:data.confirmed,'aria-label':`已确认 ${label}`,onChange:event=>update('confirmed',event.target.checked)});
  row.append(el('div',{class:'profile-field-label'},el('span',{text:label}),el('span',{class:'subtle',text:'中文 / 英文 / 确认'})),el('div',{class:'profile-value-row'},zh,en,confirmed));
  if(/Date$/.test(keyName))row.append(el('small',{text:'日期格式：YYYY-MM 或 YYYY-MM-DD；未知可留空。'}));
  return row;
}
function profileSection(kind,title,multiple=false) {
  const section=el('section',{class:'profile-section'},el('div',{class:'section-heading'},el('h3',{text:title}),multiple?button('添加一段',()=>{
    if(profileDraft[kind].length>=30)return toast('每类经历最多保存 30 段。',true);
    profileDraft[kind].push({id:`${kind}-${crypto.randomUUID()}`});profileDirty=true;render(true);
  },'small'):null));
  if(multiple){
    if(!profileDraft[kind].length)section.append(p('尚未填写；没有相关经历可留空。','subtle'));
    profileDraft[kind].forEach((entry,index)=>section.append(el('div',{class:'profile-group'},el('div',{class:'profile-entry-header'},el('strong',{text:`第 ${index+1} 段${title}`}),button('移除',()=>{profileDraft[kind]=profileDraft[kind].filter(item=>item.id!==entry.id);profileDirty=true;render(true);},'text danger')),Object.keys(definitions[kind]).map(fieldName=>profileField(kind,entry,fieldName)))));
  }else section.append(...Object.keys(definitions[kind]).map(fieldName=>profileField(kind,profileDraft[kind],fieldName)));
  return section;
}
function cleanProfile(draft) {
  const data=clone(draft);
  for(const kind of ['personal','skills','links','education','experience','projects']){
    const entries=Array.isArray(data[kind])?data[kind]:[data[kind]];
    for(const entry of entries)for(const [keyName,value] of Object.entries(entry))if(keyName!=='id'&&!value.zh&&!value.en)delete entry[keyName];
  }
  return validateProfile(data);
}
function renderProfile() {
  if(!profileDraft||(!profileDirty&&profileDraft._version!==state.profile.version)){
    profileDraft=clone(state.profile.data||emptyProfile());Object.defineProperty(profileDraft,'_version',{value:state.profile.version,writable:true,enumerable:false});
  }
  const form=el('form',{'aria-label':'确认申请资料'});
  const mode=draftInput('profile-mode',{class:'form-input','aria-label':'资料用途'},state.profile.mode);
  const modeSelect=el('select',{'data-focus':'profile-mode-select','aria-label':'资料用途'},el('option',{value:'demo',text:'本地演示 · 仅虚构资料'}),el('option',{value:'real',text:'真实模式 · 需本人确认资料'}));
  modeSelect.value=mode.value;modeSelect.addEventListener('change',()=>{drafts.set('profile-mode',modeSelect.value);profileDirty=true;});
  form.append(field('资料用途',modeSelect),p('按项核对右侧确认框；修改内容会取消该项确认。只填写已确认字段，未确认内容不会发送到申请页。','details-note'),profileSection('personal','个人信息'),profileSection('education','教育经历',true),profileSection('experience','工作与实习经历',true),profileSection('projects','项目经历',true),profileSection('skills','技能'),profileSection('links','链接'));
  const allConfirmed=draftInput('profile-confirmed',{type:'checkbox',required:true},false);
  form.append(checkLine('我已核对本次资料及用途；内容由我提供，未知内容未编造。',allConfirmed),el('div',{class:'form-actions'},submitButton('保存确认资料','profile'),el('span',{class:'form-caption',text:`当前版本 v${state.profile.version} · ${profileDirty?'有尚未保存的修改':'本地保存'}`})));
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    try {
      await submitOnce(form,'profile',async()=>{
        const data=cleanProfile(profileDraft);
        await api('/api/profile',{data,mode:modeSelect.value,confirmed:allConfirmed.checked});
        profileDirty=false;profileDraft=null;drafts.delete('profile-confirmed');toast('确认资料已保存为新版本。');await refresh(true);
      });
    }catch(error){errorBox(form,error);}
  });
  const advanced=el('details',{open:drafts.get('profile-json-open')===true},el('summary',{text:'高级：查看与导入资料 JSON（可选）'}),p('常用资料请使用上方表单。导入只改变编辑草稿，仍需逐项确认并保存；不在此填写凭据。','details-note'));
  advanced.addEventListener('toggle',()=>drafts.set('profile-json-open',advanced.open));
  const json=draftInput('profile-json',{'aria-label':'资料 JSON',spellcheck:'false'},JSON.stringify(profileDraft,null,2),null,'textarea');
  advanced.append(json,button('将 JSON 导入表单草稿',()=>{
    try {const parsed=validateProfile(JSON.parse(json.value));profileDraft=parsed;profileDirty=true;render(true);toast('已导入编辑草稿，请核对资料后保存。');}catch(error){toast(`未导入：${error.message}`,true);}
  },'small'));
  const uploadForm=el('form',{'aria-label':'上传简历文件'});
  const fileInput=el('input',{type:'file',accept:'.pdf,.doc,.docx,.txt','aria-label':'选择本机简历文件','data-focus':'resume-file'});
  const selected=el('p',{class:'selected-file',text:selectedResumeFile?`待上传：${selectedResumeFile.name} · ${selectedResumeFile.size} 字节`:'尚未选择文件'});
  fileInput.addEventListener('change',()=>{selectedResumeFile=fileInput.files[0]||null;selected.textContent=selectedResumeFile?`待上传：${selectedResumeFile.name} · ${selectedResumeFile.size} 字节`:'尚未选择文件';});
  const resumeMode=el('select',{'aria-label':'简历用途','data-focus':'resume-mode'},el('option',{value:'demo',text:'本地演示 · 虚构简历'}),el('option',{value:'real',text:'真实模式 · 本人简历'}));resumeMode.value=drafts.get('resume-mode')||state.resume?.mode||state.profile.mode;
  resumeMode.addEventListener('change',()=>drafts.set('resume-mode',resumeMode.value));
  uploadForm.append(el('label',{class:'upload-zone'},el('strong',{text:'选择这台电脑上的简历'}),el('small',{text:'PDF / Word / 文本 · 最大 8 MB，不读取任意系统路径'}),fileInput),selected,field('简历用途',resumeMode),submitButton('保存所选简历','resume'));
  uploadForm.addEventListener('submit',async event=>{
    event.preventDefault();
    try{
      await submitOnce(uploadForm,'resume',async()=>{
        const file=selectedResumeFile;if(!file)throw new Error('请先选择简历文件。');if(!file.size||file.size>8*1024*1024)throw new Error('简历文件须非空且不超过 8 MB。');if(!/\.(pdf|docx?|txt)$/i.test(file.name))throw new Error('请选择 PDF、Word 或测试文本简历。');
        const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let start=0;start<bytes.length;start+=32768)binary+=String.fromCharCode(...bytes.subarray(start,start+32768));
        await api('/api/resume',{name:file.name,mime:file.type||'application/octet-stream',base64:btoa(binary),mode:resumeMode.value});selectedResumeFile=null;toast('所选简历已保存，摘要和版本已记录。');await refresh(true);
      });
    }catch(error){errorBox(uploadForm,error);}
  });
  const resume=state.resume;
  return el('div',{},modeStrip(),el('div',{class:'two-column'},card('申请资料',el('div',{},form,advanced),badge(`资料 v${state.profile.version}`)),el('div',{class:'stack'},card('简历文件',el('div',{},resume?el('div',{class:'file-summary'},el('strong',{text:resume.name}),p(`${resume.size} 字节 · 简历 v${resume.version} · ${modeLabel(resume.mode)}`),p(resume.sha256,'hash-text')):p('尚未保存简历文件。','muted'),uploadForm)),card('版本与确认说明',el('div',{},p('每个任务在实际执行前锁定资料与简历版本。后续编辑不改变已锁定任务的内容。','details-note'),p('未确认字段不会自动填写。已有值与页面结构检查仍由通用填写引擎执行；遇到冲突暂停处理。','details-note'),p('云端开发和演示请仅使用虚构资料。真实网站尚待适配，不要求现在提供个人资料或网站凭据。','details-note'))))));
}

function renderSettingsSite(site,index) {
  const group=el('div',{class:'settings-site-row'});
  const head=el('div',{class:'settings-site-head'},el('strong',{text:`网站 ${index+1}`}),button('移除',()=>{settingsDraft.sites=settingsDraft.sites.filter(item=>item.id!==site.id);settingsDirty=true;render(true);},'text danger'));
  const enabled=el('input',{type:'checkbox',checked:site.enabled,'data-focus':`site-${site.id}-enabled`,onChange:event=>{site.enabled=event.target.checked;settingsDirty=true;}});
  const input=(keyName,label,hint='')=>{
    const control=el('input',{value:site[keyName]||'','data-focus':`site-${site.id}-${keyName}`,onInput:event=>{site[keyName]=event.target.value;settingsDirty=true;}});
    return field(label,control,hint);
  };
  group.append(head,checkLine('启用此来源',enabled),el('div',{class:'form-row'},input('name','网站名称'),input('origin','网站地址（含协议）')),el('div',{class:'form-row'},input('listUrl','岗位列表入口'),input('loginUrl','登录 / 准备入口')),el('div',{class:'form-row'},input('tenant','公司或租户标识'),input('expectedAccount','申请账号标识','仅用于核对账号，不填写密码、验证码或令牌。')),badge(site.adapter==='local-v1'?'本地测试站已接入':'真实网站待适配',site.adapter==='local-v1'?'good':'warning'),p('只有固定本地测试站支持当前自动执行。新增真实网站保留配置，适配验证完成前不会自动投递。'));
  return group;
}
function renderSettings() {
  if(!settingsDraft||!settingsDirty)settingsDraft={settings:clone(state.settings),sites:clone(state.sites)};
  const settings=settingsDraft.settings;
  const form=el('form',{'aria-label':'规则与计划设置'});
  if(state.manualPaused)form.append(banner('手动暂停，计划不会自动恢复','保存时间和额度不会解除手动暂停。准备完成后点击“继续投递”才会恢复；重启、重连与到达计划时间均不会代替你继续。'));
  else if(state.settings.scheduleEnabled&&(!state.running||state.paused))form.append(banner('等待每日计划','本机服务、浏览器与插件执行器需要持续运行；关机或停止组件后无法执行。','good'));
  const mode=el('select',{'data-focus':'settings-mode','aria-label':'运行模式'},el('option',{value:'demo',text:'本地演示 · 仅本地测试站'}),el('option',{value:'real',text:'真实模式 · 网站待适配'}));mode.value=settings.mode;
  mode.addEventListener('change',()=>{
    const previous=settings.mode;settings.mode=mode.value;settingsDirty=true;
    if(previous==='demo'&&mode.value==='real'){
      settings.keywords=[];settings.cities=[];drafts.set('settings-keywords','');drafts.set('settings-cities','');
      render(true);toast('已切换真实模式。请重新填写本人确认的关键词和城市，不沿用演示规则。');
    }
  });
  const keywords=draftInput('settings-keywords',{},settings.keywords.join('，'),value=>{settings.keywords=splitList(value);settingsDirty=true;},'textarea');
  const cities=draftInput('settings-cities',{},settings.cities.join('，'),value=>{settings.cities=splitList(value);settingsDirty=true;});
  const scheduled=el('input',{type:'checkbox',checked:settings.scheduleEnabled,'data-focus':'settings-scheduled',onChange:event=>{settings.scheduleEnabled=event.target.checked;settingsDirty=true;}});
  const time=el('input',{type:'time',required:true,value:settings.time,'data-focus':'settings-time',onInput:event=>{settings.time=event.target.value;settingsDirty=true;}});
  const limit=el('input',{type:'number',min:1,max:100,step:1,required:true,value:settings.dailyLimit,'data-focus':'settings-limit',onInput:event=>{settings.dailyLimit=Number(event.target.value);settingsDirty=true;}});
  form.append(card('筛选规则',el('div',{},field('运行模式',mode,'切换到真实模式会清空演示关键词和城市，请重新填写并确认。'),field('岗位关键词',keywords,'多个关键词用中文逗号、英文逗号或换行分隔；与城市共同筛选。'),field('工作城市',cities,'请自行配置；真实模式不会自动使用示例条件。'))),card('每日计划与额度',el('div',{},checkLine('启用每日计划',scheduled),el('div',{class:'form-row'},field('每日开始时间（上海时间）',time),field('每日最多申请数',limit,'1 至 100；已进入提交阶段的任务占用当天额度。')),p('持续运行的本机服务按上海时间每天触发一次。重启或休眠后，仅在当日尚未触发时执行一次；错过往日计划不补多批。','schedule-note'),p('请保留本机服务、专用浏览器与插件执行器。关机、浏览器退出或服务停止后无法执行；恢复时先核对页面及已有申请。','schedule-note'),meta('下一次计划',nextPlanLabel()),state.lastSchedule?meta('最近计划记录',`${fmtDate(state.lastSchedule.at)} · ${state.lastSchedule.result}`):null)),
    card('招聘网站来源',el('div',{},el('div',{class:'settings-sites'},settingsDraft.sites.map(renderSettingsSite)),button('添加招聘网站',()=>{
      if(settingsDraft.sites.length>=30)return toast('最多配置 30 个网站。',true);
      settingsDraft.sites.push({id:`site-${crypto.randomUUID()}`,name:'',origin:'',listUrl:'',loginUrl:'',tenant:'default',expectedAccount:'',adapter:'unsupported',mode:'real',enabled:false,skipped:false});settingsDirty=true;render(true);
    },'small'),p('登录、验证码和注册由你在实际执行浏览器里亲自完成。这里不收集登录凭据。','details-note'))),
    el('div',{class:'form-actions'},submitButton('保存规则与计划','settings'),el('span',{class:'form-caption',text:settingsDirty?'有尚未保存的修改':'设置保存在本机'})));
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    try{
      await submitOnce(form,'settings',async()=>{
        await api('/api/settings',{settings:{...settings,visual:true},sites:settingsDraft.sites});settingsDirty=false;settingsDraft=null;drafts.delete('settings-keywords');drafts.delete('settings-cities');toast('规则、网站与计划已保存。');await refresh(true);
      });
    }catch(error){errorBox(form,error);}
  });
  return el('div',{},modeStrip(),form);
}
function splitList(value) {return [...new Set(value.split(/[,，\n]/).map(item=>item.trim()).filter(Boolean))];}

setInterval(() => refresh(), 1000);
await refresh(true);
