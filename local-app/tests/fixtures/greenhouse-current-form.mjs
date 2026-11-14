import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fullFields,assertFullApplication as assertArchived} from './greenhouse-native-full-form.mjs';

export const currentQuestions=JSON.parse(fs.readFileSync(new URL('./greenhouse-current-questions.json',import.meta.url),'utf8'));
const source=JSON.parse(fs.readFileSync(new URL('./greenhouse-current-source.json',import.meta.url),'utf8'));
export const currentClientSha=source.sourceSha256;
export const currentClient=fs.readFileSync(new URL('./greenhouse-current-client.js',import.meta.url));
assert.equal(createHash('sha256').update(currentClient).digest('hex'),source.fixtureSha256);

export const places=[
  {id:'fiction-place-a',label:'Fictional Twin City, Province A, Canada',region:'Province A',lat:46.01,lon:-72.01},
  {id:'fiction-place-b',label:'Fictional Twin City, Province B, Canada',region:'Province B',lat:49.01,lon:-79.01}
];
export function locationResponse(query){
  const matches=query==='other'?places.slice(1):places;
  return {features:matches.map(place=>({geometry:{type:'Point',coordinates:[place.lon,place.lat]},
    properties:{id:place.id,label:place.label,layer:'locality',region:place.region,country:'Canada',country_code:'CA'}}))};
}
export function isolatedControls(){
  for(const id of ['country','candidate-location','hispanic_ethnicity']){
    const select=document.getElementById(id),wrap=document.createElement('div'),input=document.createElement('input');
    select.before(wrap);wrap.className='select';wrap.append(input,select);select.id=id+'-native';select.hidden=true;
    const label=document.querySelector('label[for="'+id+'"]');
    if(label)label.setAttribute('for',id);
    input.id=id;input.setAttribute('role','combobox');
    const show=()=>{
      wrap.querySelector('.select__single-value')?.remove();
      if(!select.value)return;
      const value=document.createElement('div'),option=select.selectedOptions[0];
      value.className='select__single-value';value.dataset.optionId=option.value;
      if(id==='country'){
        const flag=document.createElement('span');flag.className='iti__flag iti__'+option.value;value.append(flag,option.textContent.match(/\+\d+$/)[0]);
      }else value.textContent=option.textContent;
      wrap.append(value);
    };
    input.addEventListener('mousedown',()=>{
      if(wrap.querySelector('[role=listbox]'))return;
      const list=document.createElement('div');
      list.id=id+'-choices';list.setAttribute('role','listbox');input.setAttribute('aria-controls',list.id);
      for(const option of [...select.options].filter(option=>option.value)){
        const item=document.createElement('div');item.setAttribute('role','option');item.dataset.optionId=option.value;
        if(id==='country'){
          const flag=document.createElement('span');flag.className='iti__flag iti__'+option.value;item.append(flag);
        }
        item.append(option.textContent);
        item.addEventListener('click',()=>{select.value=option.value;show();list.remove();input.removeAttribute('aria-controls');
          select.dispatchEvent(new Event('change',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));});
        list.append(item);
      }
      wrap.append(list);
    });
    if(id==='country')select.value='us';
    show();
  }
}
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
function select(name,label,choices,required=false){
  return '<p><label for="'+name+'">'+label+(required?'*':'')+'</label><select id="'+name+'" name="'+name+'"'+(required?' required':'')+'><option value=""></option>'+
    choices.map(([id,text])=>'<option value="'+id+'">'+escape(text)+'</option>').join('')+'</select></p>';
}
export function currentFields(){
  const original=fullFields(currentQuestions.questions);
  const voluntary=currentQuestions.eeoc_sections.flatMap(section=>section.questions);
  const menu=key=>voluntary.find(question=>question.fields[0].name===key).fields[0].values.map(item=>[item.value,item.label]);
  const location=select('candidate-location','Location (City)',places.map(place=>[place.id,place.label]),true);
  const locationIndex=original.indexOf('id="candidate-location"');
  const before=original.lastIndexOf('<p',locationIndex),after=original.indexOf('</p>',locationIndex)+4;
  return original.slice(0,before)+location+original.slice(after)+
    select('country','Country',[['us','United States +1'],['ca','Canada +1'],['jp','Japan +81']],true)+
    select('gender','Gender',menu('gender'))+
    select('hispanic_ethnicity','Are you Hispanic/Latino?',[['1','Yes'],['0','No'],['2','Decline To Self Identify']])+
    '<div id="race-slot"></div><template id="race-template">'+select('race','Please identify your race',menu('race').filter(([id])=>id!=='4'))+'</template>'+
    select('veteran_status','Veteran Status',menu('veteran_status'));
}
export function currentValues(values,places,city){
  const {hispanic_ethnicity, 'candidate-location':locationId, country, ...rest}=values;
  const place=city?{id:city.id,label:city.name,lat:city.latitude,lon:city.longitude,country:city.country_short_name}:
    places.find(item=>item.id===locationId);
  if(!place||!rest.phone.startsWith('+1')||country!=='ca')throw Error('Fictional country/location not matched');
  if(hispanic_ethnicity==='1')rest.race='4';
  if(hispanic_ethnicity==='2')rest.race='8';
  return {...rest,location:place.label,latitude:String(place.lat),longitude:String(place.lon),country_short_name:place.country||'CA'};
}
export function assertCurrentApplication(application,reference,file,id,email='fictional@example.invalid'){
  const {race,gender,veteran_status,phone,location,latitude,longitude,country_short_name,...rest}=application;
  assert.equal(gender,undefined);assert.equal(veteran_status,undefined);
  assert.equal(race,['12345674','900000013'].includes(id)?'8':'2');
  assert.equal(rest.email,email);
  assert.equal(phone,'+16135550100');
  assert.deepEqual({location,latitude,longitude,country_short_name},{location:places[0].label,latitude:String(places[0].lat),longitude:String(places[0].lon),country_short_name:'CA'});
  assertArchived({...rest,email:'fictional@example.invalid',phone:'10000000000',location:'Fictional Test City',latitude:'35.0001',longitude:'139.0001',country_short_name:'JP'},reference,file);
}
