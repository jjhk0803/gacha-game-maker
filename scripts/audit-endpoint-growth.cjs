#!/usr/bin/env node
const fs=require('node:fs'),C=require('../www/combat/core'),assert=require('node:assert/strict');
const t=lv=>({rank:Math.min(lv,7),mastery:Object.fromEntries(Object.keys(C.SLOTS).map(k=>[k,Math.max(0,lv-7)]))}),round=n=>Math.round(n*100)/100;
const samples=[];let battles=0,recipes=0;
for(let g=1;g<=5;g++){
 const c={name:'표본',role:'atk',generation:g},k=C.generationDefaults(c);samples.push({label:g+'세대 기본 패시브 치명타 증가',unit:'%p',slot:'passive',effectIndex:0,kit:k});
}
for(const [role,recipe,type,label,unit]of [['sup','charge','sp','3세대 SP 회복',' SP'],['def','guard','reduction','3세대 보호막의 피해 감소','%'],['atk','volley','crit_up','3세대 연속 공격의 치명타 증가','%p'],['atk','poison','spd_down','3세대 지속 피해의 공격속도 감소','%']]){
 const c={name:'표본',role,generation:3},kit=C.defaults(c),extras=type==='reduction'?['reduction']:type==='crit_up'?['crit_up']:type==='spd_down'?['spd_down']:[];kit.active=C.aiDesign(c,'active',{recipe,power:100,extras});const k=C.aiPolicy(kit,c,'active');samples.push({label,unit,slot:'active',effectIndex:k.active.effects.findIndex(e=>e.type===type),kit:k});
}
const rows=samples.map(({label,unit,slot,effectIndex,kit})=>{assert.ok(effectIndex>=0);const curve=Array.from({length:10},(_,i)=>C.trainedKit(kit,t(i+1))[slot].effects[effectIndex].value),raw=kit[slot].effects[effectIndex].value;assert.ok(Math.abs(curve[9]-raw)<1e-6);for(let i=1;i<10;i++)assert.ok(curve[i]>curve[i-1]);return {label,unit,curve,raw};});
// Run each permitted default/recipe at both training endpoints against same-gen enemies.
for(let generation=1;generation<=5;generation++)for(const kind of ['atk','def','sup','healer']){
 const c={name:'검사 '+generation+' '+kind,role:kind==='healer'?'sup':kind,profile:kind==='healer'?'동료를 치료하는 치유사':'',generation};
 for(const slot of Object.keys(C.SLOTS))for(const [id,r]of [['default',null],...Object.entries(C.aiRecipes(c,slot))]){
  let k=C.generationDefaults(c);if(r)k[slot]=C.aiDesign(c,slot,{recipe:id,power:100,extras:r.extras});k=C.aiPolicy(k,c,slot);recipes++;
  for(const lv of [1,10])for(let seed=1;seed<=3;seed++){const a=C.reference(30,undefined,generation),i=c.role==='def'?0:c.role==='sup'?3:1;a[i].skills=k;a[i].skillTraining=t(lv);const result=C.run(a,C.reference(30,undefined,generation),{seed,maxTime:60});assert.ok(Number.isFinite(result.time)&&Number.isFinite(result.damage));battles++;}
 }
}
const data={build:'2026.10.17.14',interpolation:'linear across effective levels 1..10; saved value is level-10 endpoint',recipes,battles,rows};fs.writeFileSync('validation/endpoint-growth-audit.json',JSON.stringify(data,null,2)+'\n');console.log(JSON.stringify({rows:rows.length,recipes,battles}));
