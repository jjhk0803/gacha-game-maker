const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),C=require('../www/combat/core');
const finish=g=>{let r;do{r=g.next();}while(!r.done);return r.value;};
function harness(provider){
 const h={GGMCombat:C,GGMStudio:C.Studio,SAMPLE:provider,AbortController,setTimeout,clearTimeout,parseLoose:JSON.parse,aiErrText:e=>e.message||e.code,v2CharacterInput:c=>c,v2Options:()=>({levels:[1]}),v2Job:async(type,args,o)=>{const g=C[type](...args);let r;do{if(o.signal?.aborted)throw Error('cancelled');r=g.next();if(!r.done)o.onProgress?.(r.value);}while(!r.done);return r.value;}};
 vm.createContext(h);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../www/combat/generation.js'),'utf8'),h);return h;
}
test('generation ceilings and every role recipe produce useful valid skills within the power guard',()=>{
 assert.deepEqual([1,2,3,4,5].map(g=>Object.values(C.aiLimits({generation:g}))),[[1,1,1],[1,1,2],[1,2,2],[2,2,3],[2,3,3]]);
 let cases=0;
 for(const role of ['atk','def','sup'])for(let generation=1;generation<=5;generation++)for(const slot of Object.keys(C.SLOTS))for(const [recipe,r] of Object.entries(C.aiRecipes({role,generation},slot))){
  const c={name:'캐릭터 '+cases++,role,generation},base=C.defaults(c),before=C.clone(base);
  const s=C.aiDesign(c,slot,{recipe,power:99999,extras:[...r.extras,...r.extras,'invented'],target:'allies',trigger:'critical',cooldown:0,triggerEvery:0}),kit=C.aiPolicy({...base,[slot]:s},c,slot);
  assert.deepEqual(C.validate(kit),[],`${role}/${generation}/${slot}/${recipe}`);
  assert.ok(kit[slot].effects.length>=1&&kit[slot].effects.length<=C.aiLimits(c)[slot]);
  assert.ok(kit[slot].effects.every(e=>e.value>0));assert.ok(C.slotCost(kit[slot],slot)<=C.GENERATIONS[generation][slot]+.001);
  for(const other of Object.keys(C.SLOTS).filter(x=>x!==slot))assert.deepEqual(kit[other],before[other]);
 }
 assert.ok(cases>100);
});
test('low tiers stay simple even when AI returns five effects; later tiers may stay simple too',()=>{
 for(let generation=1;generation<=5;generation++){
  const c={role:'atk',generation},k=C.defaults(c);k.active.effects=Array.from({length:5},()=>C.defaultEffect('damage',{value:100000}));
  const out=C.aiPolicy(k,c,'active');assert.equal(out.active.effects.length,1);
  const simple=C.aiDesign(c,'active',{recipe:'strike',extras:[]});assert.equal(simple.effects.length,1);
 }
});
test('AI roles keep weaknesses and disallow role compression, resource loops and foreign recipes',()=>{
 for(let generation=1;generation<=5;generation++){
  const c={generation,role:'atk'},k=C.defaults(c);k.active.effects=[C.defaultEffect('heal'),C.defaultEffect('shield'),{type:'sp',target:'allies',value:30}];
  const out=C.aiPolicy(k,c,'active');assert.deepEqual(out.active.effects.map(e=>e.type),['damage']);
  assert.ok(!('charge' in C.aiRecipes({generation,role:'sup'},'ultimate')));
  if(generation<3)assert.ok(!('charge' in C.aiRecipes({generation,role:'sup'},'active')));
 }
 for(const recipe of ['constructor','__proto__','charge','mend'])assert.throws(()=>C.aiDesign({role:'atk'},'active',{recipe}),/지원하지/);
});
test('compact AI intents succeed once with malformed optional numbers and preserve other slots',async()=>{
 let calls=0;const h=harness({json:async(p)=>{calls++;assert.ok(p.length<7000);assert.match(p,/주역할/);return {data:{skill:{name:'빙결창',recipe:'strike',extras:['def_down','atk_up'],power:'bad',triggerEvery:-40,initial:999}}};}});
 const c={name:'얼음 기사',role:'atk',generation:1,hp:1100,atk:130,def:50,spd:100,skills:C.defaults()},before=C.clone(c.skills),events=[];
 const out=await h.v2GenerateSelected(c,'active','얼음 창',c.skills,{onEvent:e=>events.push(e)});
 assert.equal(calls,1);assert.equal(out.fallback,false);assert.equal(out.kit.active.effects.length,1);assert.deepEqual(C.validate(out.kit),[]);
 assert.deepEqual(JSON.parse(JSON.stringify(out.kit.passive)),before.passive);assert.deepEqual(JSON.parse(JSON.stringify(out.kit.ultimate)),before.ultimate);assert.deepEqual(c.skills,before);
});
test('support compact intents preserve recovery semantics rather than importing invalid catalog defaults',async()=>{
 const h=harness({json:async()=>({skill:{recipe:'mend',name:'빛의 치료',target:'allies',extras:['def_up']}})}),c={name:'치유사',role:'sup',generation:2,hp:1100,atk:130,def:50,skills:C.defaults({role:'sup'})};
 const r=await h.v2GenerateSelected(c,'ultimate','빛의 치유',c.skills);assert.equal(r.fallback,false);assert.deepEqual(C.validate(r.kit),[]);assert.equal(r.kit.ultimate.effects[0].type,'heal');assert.equal(r.kit.ultimate.effects[0].target,'allies');assert.equal(r.kit.ultimate.effects[0].priority,C.Studio.PRIORITY[1]);
});
test('selected-slot inspection compares the same custom partner skills in both parties',()=>{
 const c={name:'비교',role:'atk',generation:1};c.skills=C.generationDefaults(c);
 c.skills.ultimate.effects=[C.defaultEffect('damage',{value:100000,target:'enemies'})];
 const r=finish(C.inspectSkill(c,{levels:[1],referenceSlot:'active'}));assert.equal(r.report.ratio,1);assert.equal(r.report.status,'within');
});
test('conservative coverage and legacy-shaped studio buffs cannot hide party-wide cost',()=>{
 const single={...C.defaults().active,effects:[C.defaultEffect('atk_up',{value:20,duration:5,target:'self'})]},all={...single,effects:[{...single.effects[0],target:'allies'}]};
 assert.ok(C.slotCost(single,'active')>=1);assert.equal(C.slotCost(all,'active'),4*C.slotCost(single,'active'));
});
