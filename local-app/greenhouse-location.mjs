// Scoped location source used by the observed English Greenhouse renderer.
import {greenhouseJob} from './greenhouse.mjs';
const LOCATION_ENDPOINT='https://api-geocode-earth-proxy.greenhouse.io/v1/autocomplete';

function cityName(p){
  const label=p.label.split(',').map(part=>part.trim());
  if(label.length===2)return [label[0],p.country].join(', ');
  if(label.length!==3)return p.label;
  const region=[p.macroregion,p.macroregion_a].includes(label[1])?p.macroregion:p.region;
  return [label[0],region,p.country].join(', ');
}
export function locationCandidates(data){
  if(!Array.isArray(data?.features)||data.features.length>30)throw new Error('地点来源响应结构已变化');
  const candidates=[];
  for(const feature of data.features){
    const p=feature?.properties,coordinates=feature?.geometry?.coordinates;
    if(p?.layer!=='locality'||feature.geometry?.type!=='Point'||!Array.isArray(coordinates)||coordinates.length!==2||
       typeof p.id!=='string'||!/^[-\w.:]{1,100}$/.test(p.id)||typeof p.label!=='string'||!p.label.trim()||p.label.length>200||
       typeof p.country!=='string'||!p.country.trim()||!/^[A-Z]{2}$/.test(p.country_code||'')||
       !coordinates.every(Number.isFinite)||Math.abs(coordinates[0])>180||Math.abs(coordinates[1])>90)continue;
    const [longitude,latitude]=coordinates;
    const candidate={id:p.id,label:cityName(p),latitude:String(latitude),longitude:String(longitude),country:p.country_code};
    if(candidates.some(other=>other.id===candidate.id))throw new Error('地点来源返回重复标识，请重新查询');
    candidates.push(candidate);
  }
  return candidates;
}
async function fetchLimited(url,type,max,origin){
  const response=await fetch(url,{headers:{Accept:type,...(origin?{Origin:origin}:{})},redirect:'error',signal:AbortSignal.timeout(9000)});
  if(!response.ok||!response.headers.get('content-type')?.includes(type))throw new Error('地点来源暂时无法读取');
  const reader=response.body.getReader(),parts=[];
  let total=0;
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      total+=value.length;
      if(total>max)throw new Error('地点来源响应超出范围');
      parts.push(Buffer.from(value));
    }
  }finally{await reader.cancel().catch(()=>{});}
  return Buffer.concat(parts).toString('utf8');
}
export async function searchGreenhouseLocations(query,{replay=false,site,taskUrl}={}){
  if(replay){
    const endpoint=new URL('http://127.0.0.1:17322/greenhouse-locations');
    endpoint.searchParams.set('q',query);
    return locationCandidates(JSON.parse(await fetchLimited(endpoint,'application/json',160000)));
  }
  const jobScope=greenhouseJob(site,taskUrl);
  if(site.adapter!=='greenhouse-v1'||site.tenant!=='mattermost'||
     !['https://job-boards.greenhouse.io','https://boards.greenhouse.io'].includes(site.origin))
    throw new Error('此岗位的地点服务尚未核实');
  const html=await fetchLimited(jobScope.url,'text/html',250000);
  const payload=html.match(/<script[^>]*>\s*window\.__remixContext\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/)?.[1];
  const data=payload&&JSON.parse(payload).state?.loaderData;
  const config=data?.root?.ENV,job=data?.['routes/$url_token_.jobs_.$job_post_id'];
  if(job?.urlToken!==site.tenant||String(job.jobPostId)!==jobScope.jobId||job.jobPost?.public_url!==jobScope.url||
     config?.LOCATION_CONTROL_PROVIDER!=='pelias'||config.LOCATION_CONTROL_BASE_URL!=='https://api-geocode-earth-proxy.greenhouse.io/'||
     typeof config.LOCATION_CONTROL_API_KEY!=='string'||!/^[-\w]{1,200}$/.test(config.LOCATION_CONTROL_API_KEY))
    throw new Error('当前公开岗位的地点服务配置已变化，请重新检查');
  const endpoint=new URL(LOCATION_ENDPOINT);
  endpoint.search=new URLSearchParams({api_key:config.LOCATION_CONTROL_API_KEY,layers:'locality',lang:'en',text:query});
  try{return locationCandidates(JSON.parse(await fetchLimited(endpoint,'application/json',160000,site.origin)));}
  catch{throw new Error('Greenhouse 地点搜索暂时不可用');}
}
