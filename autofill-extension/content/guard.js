(() => {
  const api = globalThis.JobFill ||= {};
  const secret = /password|passwd|pwd|passcode|one.?time|\botp\b|verification.?code|security.?code|captcha|验证码|校验码|动态码|密码|口令|登录|登陆|sign.?in|log.?in|username|user.?name|\baccount\b|账户|帐号|账号|cookie|token|二维码|身份证|证件|passport|护照|social.?security|\bssn\b|national.?id|id.?card|identity.?number|tax.?id/i;
  const sensitive = /salary|compensation|wage|pay.?expect|薪资|薪酬|工资|work.?permit|work.?authori|right.?to.?work|eligible.?to.?work|legally.?authori|工作许可|工作资格|就业资格|合法工作|visa|签证|sponsor|担保|criminal|conviction|犯罪|案底|disab|残障|残疾|gender|\bsex\b|性别|ethnic|\brace\b|族裔|种族|民族|veteran|military|退伍|兵役|relocat|搬迁|迁居|调动|notice.?period|available.?from|availability|join.?date|到岗|入职时间|离职通知|legal|声明|declaration|conflict|利益冲突|contract|合同|terms|条款|agree|consent|privacy|同意|协议|隐私|marital|婚姻|birth|生日|出生|年龄|\bage\b|nationality|国籍|政治面貌|户籍|户口|授权|授权工作/i;
  api.guardText = text => {
    const words = String(text || '').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[_-]/g,' ');
    const extraSensitive = /remuneration|\bctc\b|permission.?to.?work|citizenship|arrest|felony|misdemeanor|违法记录|earliest.?start|when.{0,60}(?:start|join)|available.?date|joining.?date|入职日期|到职|上班时间|开始工作|work.?start/i;
    return secret.test(words) ? '登录、验证或证件字段：不采集、不填写' : sensitive.test(words) || extraSensitive.test(words) ? '敏感问题或声明：请手填' : null;
  };
  api.norm = value => String(value || '').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
  api.editable = node => {
    if (!node?.isConnected || node.disabled || node.readOnly || node.closest('[inert],[hidden],[aria-hidden="true"]')) return false;
    if (node.checkVisibility && !node.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})) return false;
    const style = getComputedStyle(node), rect = node.getBoundingClientRect();
    return rect.right + scrollX > 0 && rect.bottom + scrollY > 0 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width >= 8 && rect.height >= 8 && node.getClientRects().length > 0 && !/honey|bot.?trap|website.?check/i.test(node.name+' '+node.id);
  };
  api.fieldGuard = (node,evidence) => {
    const type = (node.type || '').toLowerCase();
    if (['password','hidden'].includes(type)) return '不采集字段';
    const text = [evidence.label,evidence.hints,evidence.section, node.form?.getAttribute('aria-label') || '', node.form?.id || '', node.form?.getAttribute('action') || ''].join(' ');
    const blocked = api.guardText(text);
    if (blocked) return blocked;
    if (['checkbox','radio','file','submit','button','reset','image','range','color'].includes(type)) return '此控件需手动处理';
    if (node.tagName !== 'SELECT' && (node.closest('[role="combobox"],[aria-haspopup="listbox"]') || node.getAttribute('inputmode') === 'none')) return '自定义控件需手填';
    if (!['INPUT','TEXTAREA','SELECT'].includes(node.tagName)) return '自定义控件需手填';
    if (node.tagName === 'INPUT' && !['text','email','tel','url','search','number','date','month'].includes(type)) return '此输入类型需手填';
    if (node.multiple) return '多选控件需手填';
    return null;
  };
})();
