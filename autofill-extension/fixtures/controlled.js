// Use public framework APIs only; these are real controlled components.
const e=React.createElement;
function Controlled(){
  const [name,setName]=React.useState('');
  return e('fieldset',null,e('legend',null,'Personal information (React)'),e('label',{htmlFor:'reactName'},'Full name'),e('input',{id:'reactName',value:name,onChange:event=>setName(event.target.value)}),e('output',{id:'reactState'},name));
}
ReactDOM.createRoot(document.getElementById('react-root')).render(e(Controlled));
Vue.createApp({data(){return {name:''};},template:'<fieldset><legend>Personal information (Vue)</legend><label for="vueName">Full name</label><input id="vueName" v-model="name"><output id="vueState">{{name}}</output></fieldset>'}).mount('#vue-root');
document.getElementById('rollback').addEventListener('input',event=>setTimeout(()=>{event.target.value='';},40));
document.getElementById('invalid').addEventListener('input',()=>{document.getElementById('invalid-error').style.display='inline';});
