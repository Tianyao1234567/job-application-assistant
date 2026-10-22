// Fictional React-Select-shaped controls and the observed response.ok protocol.
// No production site, real applicant, CAPTCHA or enterprise receipt is simulated
// as evidence of a real application.
export function productionReplay(html,{job,scenario,origin,tenant}) {
  const choice=(id,label)=>`<div class="field select"><label class="label" for="${id}">${label}</label><div class="select-shell"><input id="${id}" class="select__input" role="combobox" aria-haspopup="listbox" aria-controls="${id}-choices" aria-expanded="false"><input required tabindex="-1" aria-hidden="true" style="opacity:0;position:absolute;width:1px"></div></div>`;
  const base=`/greenhouse/${tenant}/jobs/${job.id}`;
  html=html.replace(/<div class="field"><label for="country">[\s\S]*?<\/select><\/div>/,choice('country','Country*'));
  html=html.replace(/<div class="field"><label for="candidate-location">[\s\S]*?<\/div>/,choice('candidate-location','Location (City)*'));
  html=html.replace('<button id="submit_app"',choice('question_yes','Fictional site-specific confirmed choice*')+'<button id="submit_app"');
  const questions=[{label:'Resume/CV',required:true,fields:[{name:'resume',type:'input_file'}]},{label:'Cover Letter',required:false,fields:[{name:'cover_letter',type:'input_file'}]},{label:'Fictional site-specific confirmed choice',required:true,fields:[{name:'question_yes',type:'multi_value_single_select',values:[{value:1,label:'Yes'},{value:0,label:'No'}]}]}];
  const loader={state:{loaderData:{'routes/$url_token_.jobs_.$job_post_id':{urlToken:tenant,jobPostId:job.id,submitPath:origin+base,confirmationPath:base+'/confirmation',jobPost:{public_url:origin+base,questions}}}}};
  const script=`<iframe title="Fictional human verification" src="/fixture-captcha" style="width:250px;height:60px"></iframe><textarea name="g-recaptcha-response" hidden></textarea><button id="complete-verification" type="button">Fictional human completion</button><script>window.__remixContext = ${JSON.stringify(loader)};</script><script>
    for(const input of document.querySelectorAll('[role=combobox]'))input.addEventListener('mousedown',()=>{
      if(document.getElementById(input.id+'-choices'))return;
      const list=document.createElement('div');list.id=input.id+'-choices';list.setAttribute('role','listbox');input.setAttribute('aria-expanded','true');
      const values=input.id==='country'?['Fictional Test Country']:input.id==='candidate-location'?['Fictional Test City']:['Yes','No'];
      for(const value of values){const option=document.createElement('div');option.setAttribute('role','option');option.textContent=value;option.addEventListener('click',()=>{const group=input.closest('.select');group.querySelector('.select__single-value')?.remove();const label=document.createElement('div');label.className='select__single-value';label.textContent=value;group.append(label);group.querySelector('input[required]')?.remove();input.value='';input.setAttribute('aria-expanded','false');list.remove();});list.append(option);}input.closest('.select').append(list);
    });
    document.getElementById('complete-verification').onclick=()=>document.querySelector('[name="g-recaptcha-response"]').value='FICTIONAL-HUMAN-COMPLETION';
    document.querySelector('form').addEventListener('submit',async event=>{event.preventDefault();const form=event.target,app={};for(const node of form.querySelectorAll('input,textarea,select'))if(node.id&&node.type!=='file')app[node.id]=node.getAttribute('role')==='combobox'?node.closest('.select').querySelector('.select__single-value')?.textContent:node.value;
      const file=form.querySelector('#resume').files[0],bytes=new Uint8Array(await file.arrayBuffer());app.resume={filename:file.name,content:${scenario.badWire?"btoa('DIFFERENT FICTIONAL WIRE BYTES')":"btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''))"}};
      const response=await fetch(${JSON.stringify(base)},{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({job_application:app})});if(response.ok)location.assign(${JSON.stringify(base+'/confirmation')});
    });</script>`;
  return html.replace('</body>',script+'</body>');
}
