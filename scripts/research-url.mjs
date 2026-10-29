// Keep navigation identity separate from the bounded public description.
// Callers must use accepted.href/researchUrlKey for navigation and deduplication;
// publicResearchUrl is only a display value and may omit or truncate content.
const sensitiveNames=new Set(['accesstoken','idtoken','refreshtoken','token','password','passwd','secret','cookie','session','sessionid','auth','authorization','credential','signature','ticket','nonce','code','authcode','sso','sid','csrftoken','apikey']);
const publicQueryNames=new Set(['q','wd','lang','language','page','position','jobid','job_id','job','category','campus','tenant','project','channel','locale','limit','city','reqid','type','id','languagecode','edit','hiremode']);
const normalizedName=value=>value.toLowerCase().replace(/[-_.]/g,'');
const sensitiveName=value=>sensitiveNames.has(normalizedName(value));

export function acceptResearchUrl(value,base){
  try{
    if(typeof value!=='string'&&!(value instanceof URL))return null;
    const url=new URL(value,base);
    if(url.protocol!=='https:'||url.username||url.password||url.port||url.hostname==='localhost'||url.hostname.endsWith('.localhost')||url.hostname.endsWith('.local')||/^\d+(?:\.\d+){3}$/.test(url.hostname)||url.hostname.includes(':'))return null;
    if([...url.searchParams.keys()].some(sensitiveName))return null;
    // Credentials can also occur in OAuth-style fragment parameters. A normal
    // hash route remains part of the accepted navigation identity.
    const fragment=decodeURIComponent(url.hash.slice(1));
    if([...fragment.matchAll(/(?:^|[?&;#/])([^?&;#/=]+)=/g)].some(match=>sensitiveName(match[1])))return null;
    if(/\.(?:zip|exe|pdf|docx?|xlsx?|png|jpe?g|mp4|webm)$/i.test(url.pathname))return null;
    return url;
  }catch{return null;}
}

export function researchUrlKey(value,base){return acceptResearchUrl(value,base)?.href??null;}

export function publicResearchUrl(value,{maxLength=350}={}){
  const accepted=acceptResearchUrl(value);
  if(!accepted)return '[URL refused]';
  const display=new URL(accepted.href);display.hash='';
  for(const key of [...display.searchParams.keys()])if(!publicQueryNames.has(key.toLowerCase()))display.searchParams.delete(key);
  const text=display.href,limit=Math.max(24,Math.min(4000,Math.floor(maxLength)||350));
  return text.length<=limit?text:text.slice(0,limit-1)+'…';
}
