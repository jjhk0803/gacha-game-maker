const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../www/combat/core.js');
const finish=g=>{let r;do{r=g.next()}while(!r.done);return r.value;};
function character(effect,slot='active'){
 const skills=C.defaults();for(const s of Object.values(C.SLOTS).map((_,i)=>skills[Object.keys(C.SLOTS)[i]])){s.effects=[];s.initial=180;}skills[slot].initial=0;skills[slot].effects=[effect];
 return {name:'각인의 수호자',role:'atk',generation:1,elem:'홍',hp:10000,atk:100,def:0,spd:100,skills,weapon:{name:'각인의 검'},wlv:1};
}
function equip(c,modifier,value,slot='active'){c.weapon.passiveOption=C.equipmentBind(c,{name:'장비 패시브',sourceSlot:slot,effectIndex:0,modifier,value,enabled:true});return c;}
function battle(c,options={}){const a=C.clone(c),e={hp:100000,atk:1,def:0,spd:10,skills:C.defaults()};const sim=C.create([a],[e],{seed:7,...options});return {a,e,sim};}
test('equipment adds mark stacks in combat, respects the original cap and never edits the saved skill',()=>{
 const c=equip(character(C.defaultEffect('mark',{mark:'각인',stacks:1,maxStacks:5,duration:10})),'mark_stacks',1),saved=JSON.stringify(c.skills),{a,e,sim}=battle(c);
 for(let i=0;i<3;i++){sim.time=i*10;a.ready.active=sim.time;assert.equal(C.cast(sim,a,'active'),true);assert.equal(e.status.find(s=>s.type==='mark').value,[2,4,5][i]);}
 assert.equal(JSON.stringify(c.skills),saved);
});
test('locked equipment and changed linked skills cannot activate the extra passive',()=>{
 const c=equip(character(C.defaultEffect('mark',{stacks:1,maxStacks:5})),'mark_stacks',1);c.wlv=0;let b=battle(c);C.cast(b.sim,b.a,'active');assert.equal(b.e.status.find(s=>s.type==='mark').value,1);
 c.wlv=1;c.skills.active.effects[0].duration=7;assert.equal(C.equipmentState(c,1).needsReroll,true);b=battle(c);assert.equal(b.a.gearOption,null);C.cast(b.sim,b.a,'active');assert.equal(b.e.status.find(s=>s.type==='mark').value,1);
});
test('a cosmetic edit or unrelated skill edit preserves the link; reroll revision and sticky invalidation disable it',()=>{
 const c=equip(character(C.defaultEffect('damage',{value:180})),'potency',12);c.skills.active.name='다른 이름';c.skills.active.fx='화염구';c.skills.passive.effects=[C.defaultEffect('shield')];assert.equal(C.equipmentState(c,1).active,true);
 c.skillRevisions={active:1};assert.equal(C.equipmentState(c,1).reason,'changed');delete c.skillRevisions;c.weapon.passiveOption.invalidated=true;assert.equal(C.equipmentState(c,1).reason,'changed');
 c.weapon.passiveOption=C.equipmentBind(c,c.weapon.passiveOption);assert.equal(C.equipmentState(c,1).active,true);
});
test('one extra hit is applied to the linked active, while ultimate and original weapon scaling remain unchanged',()=>{
 const c=equip(character(C.defaultEffect('multi',{value:100,hits:3})),'hits',1);c.skills.ultimate.effects=[C.defaultEffect('multi',{value:100,hits:3})];const {a,e,sim}=battle(c);C.cast(sim,a,'active');assert.equal(sim.events.filter(x=>x.type==='damage').length,4);
 sim.events=[];a.sp=100;C.cast(sim,a,'ultimate');assert.equal(sim.events.filter(x=>x.type==='damage').length,3);assert.equal(c.skills.active.effects[0].hits,3);
 const simple=character(C.defaultEffect('damage',{value:100})),base=battle(simple);C.cast(base.sim,base.a,'active');equip(simple,'potency',12);const boosted=battle(simple);C.cast(boosted.sim,boosted.a,'active');assert.ok(Math.abs(boosted.a.dmg/base.a.dmg-1.12)<.02);
 simple.weapon.passiveOption.enabled=false;const disabled=battle(simple);C.cast(disabled.sim,disabled.a,'active');assert.equal(disabled.a.dmg,boosted.a.dmg);
});
test('duration enhancement reaches actual shields and legacy control timers',()=>{
 const c=equip(character(C.defaultEffect('shield',{target:'self',value:100,duration:4})),'duration',2),b=battle(c);C.cast(b.sim,b.a,'active');assert.equal(b.a.status.find(s=>s.type==='shield').until,6);
 const legacy=equip(character({type:'stun',target:'enemy',value:1,duration:5,chance:100,stacks:1,condition:'always'}),'duration',1),l=battle(legacy);C.cast(l.sim,l.a,'active');assert.equal(l.e.status.find(s=>s.type==='stun').until,2);
});
test('wounded-target recovery, random target coverage and cleanse count use their actual engine paths',()=>{
 const c=equip(character(C.defaultEffect('heal',{target:'self',value:100})),'wounded',20);let b=battle(c);b.a.hp=100;C.cast(b.sim,b.a,'active');assert.equal(b.a.healing,120);
 b=battle(c);b.a.hp=8000;C.cast(b.sim,b.a,'active');assert.equal(b.a.healing,100);
 const multi=equip(character(C.defaultEffect('damage',{target:'random_enemies',targetCount:1,value:100})),'targets',1),a=C.clone(multi),es=[{hp:10000,atk:1},{hp:10000,atk:1}];let sim=C.create([a],es,{seed:7});C.cast(sim,a,'active');assert.equal(sim.events.filter(x=>x.type==='damage').length,2);
 const clean=equip(character(C.defaultEffect('cleanse',{target:'self',count:1})),'cleanse',1),cl=battle(clean);cl.a.status=[{type:'stun',until:10,removable:true},{type:'dot',until:10,removable:true},{type:'atk_down',until:10,removable:true}];cl.a.status[0].type='silence';cl.a.status[0].effect={studio:true,skillSlot:'필살기'};C.cast(cl.sim,cl.a,'active');assert.equal(cl.a.status.length,1);
});
test('invalid options cannot link ultimates, nonexistent effects, unsupported resources or unbounded numbers',()=>{
 const c=character(C.defaultEffect('mark',{stacks:1,maxStacks:1}));assert.ok(!C.equipmentChoices(c).some(x=>x.modifier==='mark_stacks'));assert.throws(()=>equip(c,'mark_stacks',1));assert.throws(()=>equip(c,'potency',12,'ultimate'));
 const d=character(C.defaultEffect('damage'));assert.throws(()=>equip(d,'potency',Infinity));assert.throws(()=>equip(d,'potency',1000));assert.throws(()=>C.equipmentBind(d,{sourceSlot:'active',effectIndex:8,modifier:'potency',value:12}));
});
test('equipment comparison runs paired same-kit battles without mutating the character or the option',()=>{
 const c=character(C.defaultEffect('damage',{value:100})),p=C.equipmentDraft(c),before=JSON.stringify({c,p});const r=finish(C.inspectEquipment(c,p,{levels:[1]}));assert.equal(r.report.trials,9);assert.ok(Number.isFinite(r.report.ratio));assert.equal(JSON.stringify({c,p}),before);assert.equal(r.option.sourceSlot,p.sourceSlot);
});
