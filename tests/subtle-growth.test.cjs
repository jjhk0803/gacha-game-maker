const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../www/combat/core');
const t=lv=>({rank:Math.min(lv,7),mastery:{passive:Math.max(0,lv-7),active:Math.max(0,lv-7),ultimate:Math.max(0,lv-7)}});
function kit(...effects){const k=C.defaults();Object.assign(k.active,{trigger:'interval',cooldown:10,triggerEvery:10,initial:0,effects});return k;}
test('cleanse no longer freezes companion healing, even for battle-start passives',()=>{
 const k=kit(C.defaultEffect('cleanse',{count:1}),C.defaultEffect('heal',{value:100})),s=C.trainedKit(k,t(10)).active;assert.equal(s.effects[0].count,1);assert.equal(s.effects[1].value,150);assert.equal(s.cooldown,9.8);
 k.passive={...k.active,trigger:'battle_start'};assert.equal(C.trainedKit(k,t(10)).passive.effects[1].value,150);
});
test('sensitive capped growth is distributed across all ten levels instead of plateauing early',()=>{
 for(const type of ['reduction','dodge','crit_up'])for(const value of [29,31.5,80]){const k=kit(C.defaultEffect(type,{value}));let prev=-Infinity;for(let lv=1;lv<=10;lv++){const v=C.trainedKit(k,t(lv)).active.effects[0].value;assert.ok(v>prev,`${type} ${value} Lv${lv}`);prev=v;}assert.ok(prev<=value+.5||value===29);}
});
test('no training benefit is invented by extending a permanent status; maxed and one-shot mastery cannot spend',()=>{
 const k=kit(C.defaultEffect('immune',{duration:4}));k.passive={...k.active,trigger:'always'};assert.equal(C.trainingChanges(k,t(7),t(8),'passive'),false);
 k.passive={...k.active,trigger:'battle_start',effects:[C.defaultEffect('cleanse',{count:1})]};assert.equal(C.trainingChanges(k,t(7),t(8),'passive'),false);
 k.active.effects=[C.defaultEffect('cleanse')];assert.equal(C.trainingChanges(k,t(7),t(8),'active'),true);
});
test('all ultimate mastery steps gain starting SP while the cost remains 100',()=>{for(let lv=1;lv<10;lv++)assert.ok(C.trainingInitialSP(t(lv+1))>C.trainingInitialSP(t(lv)));assert.equal(C.trainingInitialSP(t(10)),10);});
test('small control growth cannot cross ninety percent uptime and does not add ticks to DOTs',()=>{
 let k=kit(C.defaultEffect('stun',{duration:8.99}));assert.equal(C.trainedKit(k,t(10)).active.effects[0].duration,9);
 k=kit(C.defaultEffect('dot',{duration:6,interval:2,value:100}));let e=C.trainedKit(k,t(10)).active.effects[0];assert.equal(e.duration,6);assert.equal(e.interval,2);assert.equal(e.value,150);
});
test('legacy control fields grow in the field actually used by battle',()=>{let k=kit({...C.defaultEffect('stun'),studio:false,value:1});assert.equal(C.trainedKit(k,t(10)).active.effects[0].value,1.05);});
