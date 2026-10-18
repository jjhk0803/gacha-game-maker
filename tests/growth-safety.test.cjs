const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../www/combat/core');
const MAX={rank:7,mastery:{passive:3,active:3,ultimate:3}};
function base(effect,slot='active'){const k=C.defaults();for(const s of Object.keys(C.SLOTS)){k[s].effects=[];k[s].trigger='interval';k[s].initial=180;k[s].cooldown=20;k[s].triggerEvery=20;}Object.assign(k[slot],{initial:0,cooldown:10,triggerEvery:10,effects:[effect]});return k;}
const unit=(skills,extra={})=>({name:'test',hp:100000,atk:100,def:0,spd:10,skills,...extra});
function grown(e){return C.trainedKit(base(e),MAX).active.effects[0];}
test('all skill ranks keep low proc chances and cleanse/dispel counts fixed',()=>{
 for(let rank=1;rank<=10;rank++)for(const type of ['cleanse','dispel'])for(const studio of [true,false]){const e=studio?C.defaultEffect(type,{count:1,chance:1}):{...C.defaultEffect(type),studio:false,value:1,chance:1};const t={rank:Math.min(7,rank),mastery:{active:Math.max(0,rank-7)}};const k=C.trainedKit(base(e),t);assert.equal(k.active.effects[0].chance,1);assert.equal(studio?k.active.effects[0].count:k.active.effects[0].value,1);assert.equal(k.active.effects[0].duration,e.duration);if(rank===10)assert.equal(k.active.cooldown,8.8);}
});
test('periodic damage and recovery gain only per-tick potency; actual tick count is unchanged',()=>{
 for(const type of ['dot','regen']){const k=base(C.defaultEffect(type,{target:type==='dot'?'enemy':'self',duration:6,interval:2,value:100}));let totals=[];for(const training of [{},MAX]){const a=unit(k,{skillTraining:training}),sim=C.create([a],[unit(base(C.defaultEffect('heal')))],{practice:true});a.hp=100;assert.ok(C.cast(sim,a,'active'));let count=0,total=0;while(sim.time<7.5)for(const ev of C.step(sim,false))if(type==='dot'?ev.type==='damage'&&ev.periodic:ev.type==='heal'){count++;total+=ev.value;}totals.push({count,total});assert.equal(a.kit.active.cooldown,10);assert.equal(a.kit.active.effects[0].duration,6);}assert.deepEqual(totals,[{count:2,total:200},{count:2,total:300}]);}
});
test('attack speed aliases share one curve; mitigation and dodge never grow past sensitive caps',()=>{
 assert.equal(grown(C.defaultEffect('spd_up',{value:20})).value,22);assert.equal(grown(C.defaultEffect('buff',{stat:'행동 속도',value:20})).value,22);
 for(const type of ['dodge']){assert.equal(grown(C.defaultEffect(type,{value:80})).value,80.4);assert.equal(grown(C.defaultEffect(type,{value:29})).value,30);assert.equal(grown(C.defaultEffect(type,{value:8})).value,9.6);}
 assert.equal(grown(C.defaultEffect('debuff',{stat:'받는 피해',value:80})).value,80);
});
test('sensitive effects gain only small potency or duration; charges and proc chances stay fixed',()=>{
 for(const type of ['gauge','delay','revive','overheal','lifesteal']){const e=C.defaultEffect(type,{value:10,hits:2,turns:2,duration:4}),b=grown(e);assert.equal(b.value,10.5,type);assert.equal(b.hits,2,type);assert.equal(b.turns,2,type);assert.equal(b.duration,4,type);}
 for(const type of ['cooldown','cooldownUp','nextcool'])assert.equal(grown(C.defaultEffect(type,{turns:2})).turns,2.1,type);
 for(const type of ['block','survive','immune','mark']){const e=grown(C.defaultEffect(type,{duration:5,hits:2}));assert.equal(e.duration,5.25,type);assert.equal(e.hits,2,type);}
 for(const type of ['stun','silence','confuse','noheal']){const k=C.trainedKit(base(C.defaultEffect(type,{duration:5})),MAX).active;assert.equal(k.effects[0].duration,5.1,type);assert.equal(k.cooldown,10,type);}
 const ready=C.trainedKit(base(C.defaultEffect('ready')),MAX).active;assert.equal(ready.cooldown,9.8);assert.equal(ready.triggerEvery,9.8);
});
test('invincibility starts at half duration capped at 2s/18s and grows within 3s/17s',()=>{
 for(const duration of [1,3,9,180])for(const slot of Object.keys(C.SLOTS))for(const training of [{},MAX]){const e=C.defaultEffect('invincible',{target:'self',duration}),k=C.trainedKit(base(e,slot),training)[slot];const g=C.invincibilityGrowth(training,slot);assert.equal(k.effects[0].duration,Math.round(Math.min(2,duration/2)*(1+C.INVINCIBILITY.durationGrowth*g.progress)*1000)/1000);assert.equal(k.cooldown,g.minInterval);assert.equal(k.lockout,g.minInterval);assert.equal(k.triggerEvery,g.minInterval);}
});
test('invincibility expires on always passives; other casters and ready effects cannot refresh or bypass target interval',()=>{
 const k=base(C.defaultEffect('invincible',{target:'slot_ally',slot:1,duration:9})),a=unit(k),b=unit(k),sim=C.create([a,b],[unit(base(C.defaultEffect('heal')))]);
 assert.equal(C.cast(sim,a,'active'),true);assert.equal(a.status.filter(s=>s.type==='invincible').length,1);assert.equal(a.status[0].until,2);b.ready.active=180;
 while(sim.time<3)C.step(sim,false);assert.equal(a.status.some(s=>s.type==='invincible'),false);assert.equal(C.cast(sim,a,'active'),false);
 b.ready.active=0;assert.equal(C.cast(sim,b,'active'),true);assert.equal(a.status.some(s=>s.type==='invincible'),false);assert.equal(a.lastInvincibleAt,0);
 while(sim.time<18.1)C.step(sim,false);b.ready.active=0;b.lastCast.active=-Infinity;b.kit.active.effects[0].duration=99;assert.equal(C.cast(sim,b,'active'),true);assert.ok(a.status.find(s=>s.type==='invincible').until<=sim.time+2);assert.ok(a.lastInvincibleAt>=18);
 const always=base(C.defaultEffect('invincible',{target:'self',duration:9}),'passive');always.passive.trigger='always';const p=unit(always),s=C.create([p],[unit(base(C.defaultEffect('heal')))],{practice:true});assert.equal(p.status.find(x=>x.type==='invincible').until,2);while(s.time<3)C.step(s,false);assert.equal(p.status.some(x=>x.type==='invincible'),false);
});
test('target invincibility limit survives dispel and forced cooldown reset',()=>{
 const k=base(C.defaultEffect('invincible',{target:'self',duration:9})),a=unit(k),sim=C.create([a],[unit(base(C.defaultEffect('heal')))]);C.cast(sim,a,'active');a.status=[];sim.time=5;a.ready.active=0;a.lastCast.active=-Infinity;assert.ok(C.cast(sim,a,'active'));assert.equal(a.status.length,0);assert.equal(a.lastInvincibleAt,0);
});

test('skill replacement inherits the short duration and the shared target restriction',()=>{
 const k=base(C.defaultEffect('invincible',{target:'self',duration:9}),'passive');k.passive.initial=180;k.active.initial=0;k.active.effects=[C.defaultEffect('replace',{target:'self',skillSlot:'액티브',sourceSlot:'passive',duration:30})];const a=unit(k),sim=C.create([a],[unit(base(C.defaultEffect('heal')))]);C.cast(sim,a,'active');sim.time=1;a.ready.active=0;C.cast(sim,a,'active');assert.equal(a.lastInvincibleAt,1);assert.equal(a.status.find(s=>s.type==='invincible').until,3);sim.time=5;a.status=a.status.filter(s=>s.type!=='invincible');a.ready.active=0;C.cast(sim,a,'active');assert.equal(a.status.some(s=>s.type==='invincible'),false);assert.equal(a.lastInvincibleAt,1);
});
