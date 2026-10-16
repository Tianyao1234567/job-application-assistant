window.fixtureCounters={submit:0,enter:0};
document.getElementById('application-form').addEventListener('submit',event=>{event.preventDefault();fixtureCounters.submit++;document.getElementById('submitCount').textContent=fixtureCounters.submit;});
document.getElementById('application-form').addEventListener('keydown',event=>{if(event.key==='Enter'){fixtureCounters.enter++;document.getElementById('enterCount').textContent=fixtureCounters.enter;}});
document.getElementById('dynamic').addEventListener('click',()=>{
  if(document.getElementById('dynamicProject')) return;
  const fieldset=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent='项目经历 2';fieldset.append(legend);
  const label=document.createElement('label');label.textContent='项目名称';const input=document.createElement('input');input.id='dynamicProject';label.append(input);fieldset.append(label);document.getElementById('application-form').append(fieldset);
});
