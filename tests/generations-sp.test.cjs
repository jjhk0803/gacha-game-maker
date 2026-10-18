const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../www/combat/core');
const finish=g=>{let r;do{r=g.next();}while(!r.done);return r.value;};
const actor=(skills,extra={})=>({name:'actor',role:'atk',hp:100000,atk:100,def:0,spd:100,skills:skills||quiet(),...extra});
function quiet(){const k=C.defaults();for(const slot of Object.keys(C.SLOTS)){k[slot].initial=180;k[slot].cooldown=180;}return k;}
const advance=(s,n)=>{for(let i=0;i<n;i++)C.step(s,false);};
test('individual SP starts empty, fills from basics, time and actives, consumes on ultimate',()=>{
 const k=quiet();k.active.initial=0;const a=actor(k),b=actor();const s=C.create([a],[b],{practice:true});assert.equal(a.sp,0);assert.equal(C.cast(s,a,'ultimate'),false);assert.equal(C.cast(s,a,'active'),true);assert.equal(a.sp,12);a.g=1000;C.step(s,false);assert.ok(a.sp>=22);assert.equal(b.sp,0);C.gainSP(s,a,1000);assert.equal(a.sp,100);assert.equal(C.cast(s,a,'ultimate'),true);assert.equal(a.sp,0);C.gainSP(s,a,100);assert.equal(C.cast(s,a,'ultimate'),false);advance(s,6);assert.equal(C.cast(s,a,'ultimate'),true);
});
test('SP support and legacy cooldown conversion affect SP, never action gauge; hit gains are bounded',()=>{
 const a=actor(),b=actor(),e=actor();a.skills.active.initial=0;a.skills.active.effects=[{type:'sp',target:'allies',value:10}];e.skills.active.initial=0;e.skills.active.effects=[C.defaultEffect('multi',{hits:10,value:10,target:'enemy'})];const s=C.create([a,b],[e]);const gauge=b.g;C.cast(s,a,'active');assert.equal(b.sp,5);assert.equal(b.g,gauge);C.cast(s,e,'active');assert.equal(a.sp,23);assert.equal(e.sp,12);assert.ok(a.counts.on_hit===10);
});
test('active basic/hit counters fire on chosen event instead of shared cooldown polling',()=>{
 for(const trigger of ['after_basic','on_hit','attack_hit']){
  const a=actor(),e=actor();a.skills.active.trigger=trigger;a.skills.active.triggerEvery=3;a.skills.active.initial=0;a.skills.active.cooldown=.17;const s=C.create([a],[e]);advance(s,2);assert.equal(a.casts.active,0);
  for(let i=0;i<3;i++){if(trigger==='on_hit'){e.kit.active.effects=[C.defaultEffect('damage',{value:1})];e.ready.active=0;C.cast(s,e,'active');}else a.g=1000;C.step(s,false);}
  assert.equal(a.casts.active,1,trigger);
 }
});
test('AI uses 1–3 simple effects within independent generation budgets and preserves other slots',()=>{
 for(let generation=1;generation<=5;generation++)for(const slot of Object.keys(C.SLOTS)){
  const k=C.defaults();k[slot].effects=[C.defaultEffect('record'),...Array.from({length:4},()=>C.defaultEffect('multi',{hits:30,value:100000,target:'enemies',basis:'대상 최대 HP',stacks:99,duration:180}))];const before=C.clone(k),r=C.aiPolicy(k,{name:'test',generation},slot);assert.ok(r[slot].effects.length>=1&&r[slot].effects.length<=3);assert.ok(C.slotCost(r[slot],slot)<=C.GENERATIONS[generation][slot]+.001);assert.deepEqual(C.validate(r),[]);for(const other of Object.keys(C.SLOTS).filter(x=>x!==slot))assert.deepEqual(r[other],before[other]);assert.deepEqual(k,before);
 }
 const k=C.defaults();k.passive.effects=[C.defaultEffect('reduction',{value:50})];assert.equal(C.aiPolicy(k,{role:'def'}).passive.effects[0].type,'def_up');
});
test('generation-specific reference and simulator report change while manual values stay exact',()=>{
 const a=C.reference(1,undefined,1),b=C.reference(1,undefined,5);assert.ok(b[1].skills.active.effects[0].value>a[1].skills.active.effects[0].value);const c={role:'atk',generation:5,skills:C.defaults()},copy=C.clone(c);const r=finish(C.inspectSkill(c,{levels:[1]}));assert.equal(r.report.generation,5);assert.equal(r.report.slotBudgets.active,5.25);assert.deepEqual(c,copy);assert.deepEqual(r.kit,c.skills);
});
test('manual five-effect skills are allowed; six rejected and normalization bounded to five',()=>{const k=C.defaults();k.active.effects=Array.from({length:5},()=>C.defaultEffect('damage',{value:10000}));assert.deepEqual(C.validate(k),[]);k.active.effects.push(C.defaultEffect());assert.ok(C.validate(k).some(x=>x.includes('1~5')));assert.equal(C.normalize(k).active.effects.length,5);});
test('full SP does not bypass stun, silence, death, or per-battle ultimate limit',()=>{const a=actor(),s=C.create([a],[actor()]);C.gainSP(s,a,100);a.status.push({type:'stun',value:1,until:5});assert.equal(C.cast(s,a,'ultimate'),false);a.status=[];a.kit.ultimate.limit=1;assert.equal(C.cast(s,a,'ultimate'),true);advance(s,7);C.gainSP(s,a,100);assert.equal(C.cast(s,a,'ultimate'),false);a.hp=0;assert.equal(C.cast(s,a,'ultimate'),false);});
