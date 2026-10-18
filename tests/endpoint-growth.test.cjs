const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../www/combat/core');
const t=lv=>({rank:Math.min(lv,7),mastery:Object.fromEntries(Object.keys(C.SLOTS).map(k=>[k,Math.max(0,lv-7)]))});
function kit(e,slot='active'){const k=C.defaults();Object.assign(k[slot],{effects:[e],initial:0,cooldown:10,triggerEvery:10,trigger:'interval'});return k;}
const close=(a,b)=>assert.ok(Math.abs(a-b)<.000002,`${a} != ${b}`);
test('all agreed effect aliases reach saved endpoints with 1.5x crit and 2x other growth',()=>{
 const variants=[['crit_up',{},'critical'],['buff',{stat:'치명타 확률'},'critical'],['sp',{studio:false},'double'],['reduction',{},'double'],['debuff',{stat:'받는 피해'},'double'],['spd_down',{},'double'],['debuff',{stat:'행동 속도'},'double']];
 for(const [type,extra,kind]of variants)for(const slot of Object.keys(C.SLOTS)){
  const e=C.defaultEffect(type,{value:8,...extra}),k=kit(e,slot),raw=JSON.stringify(k);let prev=0;
  for(let lv=1;lv<=10;lv++){const s=C.trainedKit(k,t(lv))[slot],value=s.effects[0].value;close(value,8*(kind==='critical'?(2+(lv-1)/9)/3:(1+(lv-1)/9)/2));assert.ok(value>prev);assert.equal(s.effects[0].duration,e.duration);assert.equal(s.effects[0].chance,e.chance);if(lv<10)assert.equal(C.trainingChanges(k,t(lv),t(lv+1),slot),true);prev=value;}
  assert.equal(JSON.stringify(k),raw);close(C.trainedKit(k,t(10))[slot].effects[0].value,8);
 }
});
test('automatic table values are executable endpoints, including all five default crit passives',()=>{
 for(let gen=1;gen<=5;gen++){const k=C.generationDefaults({role:'atk',generation:gen}),base=[15,18,21.75,26.25,31.5][gen-1];close(k.passive.effects[0].value,base);close(C.trainedKit(k,t(1)).passive.effects[0].value,base/1.5);close(C.trainedKit(k,t(10)).passive.effects[0].value,base);}
 const e=C.defaultEffect('reduction',{value:4.86});for(const [lv,v]of [[1,2.43],[4,3.24],[7,4.05],[10,4.86]])close(C.trainedKit(kit(e),t(lv)).active.effects[0].value,v);
});
test('live SP recovery is 5 at level one and 10 at max, no repeated scaling of saves',()=>{
 const k=kit(C.defaultEffect('sp',{studio:false,value:10,target:'self'})),raw=JSON.stringify(k);
 for(const lv of [1,10]){const a={name:'a',hp:1000,atk:100,def:0,skills:k,skillTraining:t(lv)},sim=C.create([a],[{hp:10000,atk:1}],{practice:true});a.sp=0;assert.ok(C.cast(sim,a,'active'));close(a.sp,(lv===1?5:10)+C.SP.active);assert.equal(a.baseKit.active.effects[0].value,10);}
 assert.equal(JSON.stringify(k),raw);
});
test('normal/practice execution share trained values; raw gear signatures survive level changes',()=>{
 const k=kit(C.defaultEffect('reduction',{value:8,target:'self'})),c={skills:k,weapon:{}};c.weapon.passiveOption=C.equipmentBind(c,{sourceSlot:'passive',effectIndex:0,modifier:'duration',value:1});const sig=c.weapon.passiveOption.sourceSignature;
 for(const practice of [false,true])for(const lv of [1,10]){const a={...c,name:'a',hp:1000,atk:100,skills:k,skillTraining:t(lv),wlv:1},sim=C.create([a],[{hp:10000,atk:1}],{practice});C.cast(sim,a,'active');assert.equal(a.status.find(s=>s.type==='reduction').value,lv===1?4:8);assert.equal(C.equipmentState(c,1).active,true);assert.equal(c.weapon.passiveOption.sourceSignature,sig);}
});
test('unlisted effects retain previous growth and weapon/HP/trigger counts are untouched',()=>{
 for(const [e,want]of [[C.defaultEffect('damage',{value:100}),150],[C.defaultEffect('spd_up',{value:20}),22],[C.defaultEffect('buff',{stat:'치명타 피해',value:20}),22],[C.defaultEffect('lifesteal',{value:20}),21]]){const k=kit(e);assert.equal(C.trainedKit(k,t(1)).active.effects[0].value,e.value);assert.equal(C.trainedKit(k,t(10)).active.effects[0].value,want);}
});
