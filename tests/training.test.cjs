const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../www/combat/core');
const done=g=>{let r;do{r=g.next()}while(!r.done);return r.value;};
function kit(){const k=C.defaults();for(const s of Object.values(C.SLOTS).map((_,i)=>Object.keys(C.SLOTS)[i])){k[s].effects=[C.defaultEffect('damage',{target:'enemy',value:100})];k[s].initial=0;k[s].trigger='interval';k[s].triggerEvery=8;k[s].cooldown=8;}return k;}
function battle(training,k=kit()){return C.create([{name:'a',hp:10000,atk:100,def:0,spd:100,skills:k,skillTraining:training}],[{name:'e',hp:100000,atk:1,def:0,spd:100}],{practice:true,seed:1});}
test('training defaults, costs, rank bounds and per-slot mastery gates',()=>{
 assert.deepEqual(C.trainingState(),{rank:1,mastery:{passive:0,active:0,ultimate:0}});assert.equal(C.trainingState({rank:99,mastery:{active:99}}).mastery.active,3);assert.equal(C.trainingState({rank:2,mastery:{active:3}}).mastery.active,0);
 assert.equal(C.trainingPlan({},'active').allowed,false);assert.equal(C.trainingPlan({rank:7}).allowed,false);assert.equal(C.trainingPlan({rank:7},'active').materials,90);assert.equal(C.trainingPlan({rank:7,mastery:{active:3}},'active').allowed,false);assert.equal(C.trainingPlan({rank:1}).materials,30);
});
test('rank 1 is identical, rank 7 grows all skills, mastery only grows its own slot and never mutates designs',()=>{
 const k=kit(),before=JSON.stringify(k);assert.deepEqual(C.trainedKit(k,{}),C.normalize(k));const seven=C.trainedKit(k,{rank:7}),master=C.trainedKit(k,{rank:7,mastery:{active:3}});for(const s of Object.keys(C.SLOTS))assert.equal(seven[s].effects[0].value,125);assert.equal(master.active.effects[0].value,150);assert.deepEqual(master.passive,seven.passive);assert.deepEqual(master.ultimate,seven.ultimate);assert.equal(JSON.stringify(k),before);assert.deepEqual(C.validate(master),[]);
});
test('live engine uses trained power once, preserves actual gear signature and applies mastery to normal damage',()=>{
 const k=kit();k.passive.initial=100;k.passive.trigger='interval';const low=battle({},k),high=battle({rank:7,mastery:{active:3}},k);C.cast(low,low.allies[0],'active');C.cast(high,high.allies[0],'active');assert.ok(Math.abs(high.allies[0].dmg/low.allies[0].dmg-1.5)<.01);assert.equal(high.allies[0].kit.active.effects[0].value,150);assert.equal(high.allies[0].baseKit.active.effects[0].value,100);
 const c={skills:k,weapon:{}};c.weapon.passiveOption=C.equipmentBind(c,{sourceSlot:'active',effectIndex:0,modifier:'potency',value:10});const sim=C.create([{...c,c,hp:1000,atk:100,wlv:1,skillTraining:{rank:7}}],[{hp:10000,atk:1}],{practice:true});assert.ok(sim.allies[0].gearOption);assert.equal(C.equipmentState(c,1).active,true);
});
test('growth distinguishes duration, frequency, cleanse, bounded control and unchanged event counts/costs',()=>{
 const k=kit();k.active.trigger='after_basic';k.active.triggerEvery=4;k.active.effects=[C.defaultEffect('mark',{stacks:1,maxStacks:5,duration:8}),C.defaultEffect('sacrifice',{target:'self',value:20}),C.defaultEffect('cleanse',{target:'self',count:1}),C.defaultEffect('stun',{duration:1,status:'기절'}),C.defaultEffect('reduction',{target:'self',value:8,duration:5})];const b=C.trainedKit(k,{rank:7,mastery:{active:3}}).active;
 assert.equal(b.triggerEvery,4);assert.ok(b.cooldown<8);assert.equal(b.effects[0].stacks,1);assert.equal(b.effects[0].maxStacks,5);assert.equal(b.effects[0].duration,8.25);assert.equal(b.effects[1].value,19);assert.equal(b.effects[2].count,1);assert.ok(b.effects[3].duration<=1.1);assert.ok(b.effects[4].value<10);assert.deepEqual(C.validate({...k,active:b}),[]);
});
test('ultimate SP stays 100 and starting SP improves at every level',()=>{
 for(const [training,sp] of [[{},0],[{rank:4},3.333333],[{rank:7},6.666667],[{rank:7,mastery:{ultimate:3}},10]]){const sim=battle(training);assert.equal(sim.allies[0].sp,sp);assert.equal(C.cast(sim,sim.allies[0],'ultimate'),false);sim.allies[0].sp=100;assert.equal(C.cast(sim,sim.allies[0],'ultimate'),true);assert.equal(sim.allies[0].sp,0);}
});
test('every supported effect grows within valid numeric limits without adding effects or changing targets',()=>{
 for(const type of Object.keys(C.EFFECTS)){const k=C.defaults();k.active.effects=[C.defaultEffect(type)];const a=C.trainedKit(k,{rank:7,mastery:{active:3}}).active.effects[0];assert.ok(Number.isFinite(a.value)&&Number.isFinite(a.duration));assert.equal(a.type,type);assert.equal(a.target,k.active.effects[0].target);assert.equal(a.hits,k.active.effects[0].hits);assert.equal(a.targetCount,k.active.effects[0].targetCount);assert.ok(a.duration<=180);assert.ok(a.chance<=100);}
});
test('equipment comparison retains growth on both sides without mutating progress or skill signatures',()=>{
 const c={name:'a',role:'atk',hp:1100,atk:130,def:50,skills:kit(),weapon:{},skillTraining:{rank:7,mastery:{active:2}}},option=C.equipmentDraft(c),before=JSON.stringify(c);const r=done(C.inspectEquipment(c,option,{levels:[1]}));assert.equal(r.report.trials,9);assert.equal(JSON.stringify(c),before);assert.equal(r.option.sourceSignature,C.equipmentSkillSignature(c.skills,r.option.sourceSlot));
});
