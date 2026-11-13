import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

export const archivedSchema=JSON.parse(await fs.readFile(new URL('../../../docs/greenhouse-mattermost-form.json',import.meta.url),'utf8'));
export const location={location:'Fictional Test City',latitude:'35.0001',longitude:'139.0001',country_short_name:'JP'};
export const flowAnswers={first_name:'Fictional',last_name:'Applicant',
  question_18195688008:'Fictional event',question_18195689008:'Fictional application motivation',
  question_18195692008:'No',question_18195693008:'Yes',question_18196782008:'No',
  question_18196783008:'Yes',question_18196784008:'No'};
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');

export function fullFields(){
  return archivedSchema.questions.map(({label,required,fields})=>{
    const title=escape(label.trim())+(required?'*':'');
    if(fields[0].type==='input_file'){
      const [file,alternate]=fields;
      return '<fieldset class="file-upload"><legend id="upload-label-'+file.name+'">'+title+'</legend>'+
        '<label for="'+file.name+'">Attach</label><input id="'+file.name+'" name="'+file.name+'" type="file" accept=".pdf,.doc,.docx,.txt,.rtf">'+
        '<label for="'+alternate.name+'">Enter manually</label><textarea id="'+alternate.name+'" name="'+alternate.name+'"></textarea></fieldset>';
    }
    const [field]=fields,name=field.name==='candidate_location'?'candidate-location':field.name;
    const attributes='id="'+name+'" name="'+field.name+'"'+(required?' required':'');
    const control=field.values?'<select '+attributes+'><option value="">Choose</option>'+field.values.map(option=>
      '<option value="'+option.value+'">'+escape(option.label)+'</option>').join('')+'</select>':
      '<input '+attributes+' type="'+(name==='email'?'email':name==='phone'?'tel':'text')+'">';
    return '<p><label for="'+name+'">'+title+'</label>'+control+'</p>';
  }).join('');
}

export function fullValues(values){
  const {candidate_location,...rest}=values;
  if(candidate_location!==location.location)throw new Error('Unconfirmed fictional location');
  return {...rest,...location};
}

export function assertFullApplication(app,reference,file){
  const answers={};
  for(const [priority,{fields:[field]}] of archivedSchema.questions.filter(({fields})=>fields[0].name.startsWith('question_')).entries()){
    const id=field.name.split('_')[1],value=flowAnswers[field.name];
    answers[id]={question_id:id,priority,...(field.values?{boolean_value:field.values.find(option=>option.label===value).value}:{text_value:value??''})};
  }
  assert.deepEqual(app,{first_name:flowAnswers.first_name,last_name:flowAnswers.last_name,
    email:'fictional@example.invalid',phone:'10000000000',...location,answers_attributes:answers,demographic_answers:[],
    data_compliance:{},attachments:{},from_job_board_renderer:true,employments:[],resume_url:reference,resume_url_filename:file.name,
    mapped_url_token:null,appcast_click_id:null,time_zone:'UTC'});
}
