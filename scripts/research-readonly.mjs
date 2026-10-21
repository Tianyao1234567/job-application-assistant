// This policy is limited to read queries actually emitted by the observed
// anonymous Fourth Paradigm public site. It never constructs or replays a URL.
const ORIGIN='https://app.mokahr.com';
const safeIdentifier=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(value)||Number.isSafeInteger(value)&&value>=0&&value<=1e12;
const locale=value=>typeof value==='string'&&/^[a-z]{2}(?:[-_][A-Za-z]{2,4})?$/.test(value);
const nullable=validator=>value=>value===null||validator(value);
const identifierArray=value=>Array.isArray(value)&&value.length<=50&&value.every(safeIdentifier);
const scoped={orgId:value=>value==='4paradigm',siteId:value=>(typeof value==='string'||Number.isSafeInteger(value))&&String(value)==='102013',locale};
const routeSchemas=new Map([
  ['/api/outer/ats-jc-apply/website/feature-switches',{fields:{orgId:scoped.orgId},required:['orgId']}],
  ['/api/outer/ats-apply/privacy-policy/get',{fields:{orgId:scoped.orgId,scope:safeIdentifier,locale,businessId:safeIdentifier},required:['orgId','scope','locale','businessId']}],
  ...['group-by-job','jobs/departments/flat','jobs/departments/structure'].map(name=>['/api/outer/ats-apply/website/'+name,{fields:scoped,required:['orgId','siteId']}]),
  ['/api/outer/ats-apply/website/jobs/module',{fields:{
    ...scoped,
    keyword:value=>typeof value==='string'&&value.length<=120&&!/[\u0000-\u001f@]/.test(value),
    limit:value=>Number.isSafeInteger(value)&&value>=1&&value<=100,
    offset:value=>Number.isSafeInteger(value)&&value>=0&&value<=5000,
    departmentIds:nullable(identifierArray),commitments:nullable(identifierArray),
    needGroupType:value=>typeof value==='boolean'||value===0||value===1||typeof value==='string'&&/^[A-Za-z0-9_-]{0,80}$/.test(value),
    moduleId:nullable(safeIdentifier),jobEnableFields:nullable(identifierArray),
    enableBrandIcon:value=>typeof value==='boolean',websitePageId:nullable(safeIdentifier)
  },required:['orgId','siteId','keyword','limit','offset']}]
]);
export function classifyObservedMokaRead(request){
  const deny=reason=>({allowed:false,reason});
  let url;
  try{url=new URL(request.url);}catch{return deny('INVALID_URL');}
  if(url.origin!==ORIGIN||url.username||url.password||url.search||url.hash)return deny('UNSCOPED_URL');
  const schema=routeSchemas.get(url.pathname);
  if(!schema)return deny('UNOBSERVED_OR_NONREAD_ROUTE');
  if(request.method!=='POST'||!['xhr','fetch'].includes(request.resourceType))return deny('NOT_OBSERVED_QUERY_TRANSPORT');
  if((request.contentType||'').split(';')[0].trim().toLowerCase()!=='application/json')return deny('NON_JSON_QUERY');
  if(typeof request.postData!=='string'||Buffer.byteLength(request.postData)>20000)return deny('INVALID_QUERY_BODY');
  let body;
  try{body=JSON.parse(request.postData);}catch{return deny('INVALID_QUERY_BODY');}
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.getPrototypeOf(body)!==Object.prototype)return deny('INVALID_QUERY_BODY');
  const names=Object.keys(body);
  if(names.some(name=>!Object.hasOwn(schema.fields,name)))return deny('UNKNOWN_QUERY_FIELD');
  if(schema.required.some(name=>!Object.hasOwn(body,name)))return deny('MISSING_QUERY_FIELD');
  const invalidFields=names.filter(name=>!schema.fields[name](body[name]));
  if(invalidFields.length)return {...deny('UNSCOPED_OR_INVALID_QUERY_VALUE'),invalidFields};
  return {allowed:true,reason:'OBSERVED_PUBLIC_READ_QUERY',endpoint:url.pathname};
}
