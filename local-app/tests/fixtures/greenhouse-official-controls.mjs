import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';

const manifest=JSON.parse(await fs.readFile(new URL('./greenhouse-current-source.json',import.meta.url),'utf8'));
const entryName=new URL(manifest.asset).pathname.split('/').at(-1);
const vendorName=new URL(manifest.vendor.url).pathname.split('/').at(-1);

export async function loadOfficialControls(){
  async function pinned(url,sha256){
    const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error('Could not read pinned Greenhouse asset '+new URL(url).pathname);
    const data=Buffer.from(await response.arrayBuffer());
    assert.equal(createHash('sha256').update(data).digest('hex'),sha256);
    return data.toString('utf8');
  }
  const [entry,vendor,locale]=await Promise.all([
    pinned(manifest.asset,manifest.sourceSha256),
    pinned(manifest.vendor.url,manifest.vendor.sha256),
    pinned(manifest.locale.url,manifest.locale.sha256)
  ]);
  const startup='window.requestIdleCallback?window.requestIdleCallback(es):window.setTimeout(es,1);je.getInstance().postHeight();';
  assert.equal(entry.split(startup).length,2);
  return new Map([
    ['/official-controls.js',`import {r as React,j as jsx,i as i18n,a as reactTranslation,fixtureReactDOM,fixtureLocation}
       from "/${vendorName}";
       import {fixtureBoard,fixtureCountry,fixtureCity,fixtureEthnicity} from "/${entryName}";
       const en=${JSON.stringify(JSON.parse(locale))};
       export ${installOfficialControls.toString()}`],
    ['/'+entryName,entry.replace(startup,'')+'\nexport {Ct as fixtureBoard,za as fixtureCountry,To as fixtureCity,Fo as fixtureEthnicity};'],
    ['/'+vendorName,vendor+'\nexport {Sd as fixtureReactDOM,L0 as fixtureLocation};']
  ]);
}

export async function installOfficialControls(form,job){
  await i18n.use(reactTranslation).init({lng:'en',fallbackLng:'en',resources:{en:{job_post:en}}});
  function mount(id,component){
    const original=form.querySelector('#'+id);
    const host=document.createElement('div');
    original.closest('p').replaceWith(host);
    fixtureReactDOM.createRoot(host).render(jsx.jsx(fixtureBoard.Provider,{value:{outside_label:false},
      children:jsx.jsx(fixtureLocation.Provider,{value:{location:{pathname:location.pathname}},children:component})}));
  }
  let country='us',city,race;
  function Country(){
    const [value,setValue]=React.useState({value:'us',label:'United States +1'});
    return jsx.jsx(fixtureCountry,{id:'country',label:'Country',required:true,value,onChange:option=>{
      country=option?.value;setValue(option);
    }});
  }
  function Ethnicity(){
    const [value,setValue]=React.useState();
    const question=job.eeoc_sections.flatMap(section=>section.questions).find(question=>question.fields[0].name==='race');
    return jsx.jsx(fixtureEthnicity,{question,selected:value,onChange:(_key,choice)=>{
      race=choice;setValue({value:choice});
    }});
  }
  mount('country',jsx.jsx(Country,{}));
  mount('candidate-location',jsx.jsx(fixtureCity,{required:true,handleChange:value=>{city=value;}}));
  mount('hispanic_ethnicity',jsx.jsx(Ethnicity,{}));
  await new Promise((resolve,reject)=>{
    const started=Date.now();
    function check(){
      if(['country','candidate-location','hispanic_ethnicity'].every(id=>form.querySelector('#'+id+'[role="combobox"]')))return resolve();
      if(Date.now()-started>3000)return reject(Error('Official controls did not mount'));
      setTimeout(check,25);
    }
    check();
  });
  return ()=>({country,'candidate-location':city?.id,race});
}
