// Conservative ordinary facts only. Never map country, sponsorship, consent,
// compensation, dates or company/job motivation to reusable personal facts.
const ordinary=new Map([
 ['first name','personal.firstName'],['given name','personal.firstName'],['名','personal.firstName'],
 ['last name','personal.lastName'],['family name','personal.lastName'],['姓','personal.lastName'],
 ['full name','personal.name'],['姓名','personal.name'],
 ['email','personal.email'],['email address','personal.email'],['邮箱','personal.email'],
 ['phone','personal.phone'],['phone number','personal.phone'],['手机','personal.phone'],['联系电话','personal.phone'],
 ['location (city)','personal.location'],['current city','personal.location'],['现居城市','personal.location'],
 ['linkedin profile','links.linkedin'],['linkedin','links.linkedin'],['github','links.github'],['github profile','links.github'],['personal website','links.website']
]);
export function stableProfileKey(question) {
 if(!question||question.unresolved||question.options?.length&&question.manualSelection!==true)return null;
 const label=String(question.text||'').normalize('NFKC').trim().replace(/[＊*：:]\s*$/,'').trim().toLowerCase();
 const key=ordinary.get(label);if(!key)return null;
 const identities={first_name:'personal.firstName',last_name:'personal.lastName',full_name:'personal.name',email:'personal.email',phone:'personal.phone','candidate-location':'personal.location'};
 if(question.purpose==='confirmed-profile-fact'&&identities[question.key]===key)return key;
 // The only currently observed custom personal-link question on the supported
 // production adapter. Unknown custom fields are not inferred from a short label.
 if(question.purpose==='site-specific-question'&&question.key==='question_18195686008'&&key==='links.linkedin'&&/^greenhouse-v1:(mattermost|mattermost-replay):/.test(question.scope||''))return key;
 return null;
}
export function profileFactAnswer(question,profile) {
 const key=stableProfileKey(question);if(!key)return null;
 const [kind,field]=key.split('.'),fact=profile?.[kind]?.[field];
 if(!fact?.confirmed)return null;
 const value=fact.zh||fact.en;if(!value)return null;
 if(question.alreadyPopulated&&question.currentValue!==value&&!(question.manualSelection&&question.options?.length===1&&question.options[0].text===value))return null;
 if(question.options?.length&&!question.options.some(o=>o.text===value&&!o.disabled))return null;
 return value;
}
