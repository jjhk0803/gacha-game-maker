const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),C=require('../www/combat/core');
const clone=x=>JSON.parse(JSON.stringify(x)),finish=g=>{let r;do{r=g.next();}while(!r.done);return r.value;};
function harness(provider){const h={GGMCombat:C,GGMStudio:C.Studio,SAMPLE:provider,AbortController,setTimeout,clearTimeout,parseLoose:JSON.parse,aiErrText:e=>e.message||e.code,v2CharacterInput:c=>c,v2Options:()=>({levels:[1]}),v2Job:async(type,args)=>finish(C[type](...args))};vm.createContext(h);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../www/combat/generation.js'),'utf8'),h);return h;}
const healer=()=>({name:'엘리아',role:'sup',generation:1,profile:'별빛으로 상처를 치료하는 성녀 힐러',weapon:{name:'별의 지팡이'},hp:1100,atk:110,def:50,spd:86,skills:C.generationDefaults({role:'sup'})});
test('healer passive rejects unrelated aim and creates concept-linked healing rather than attack-count self buffs',async()=>{
 let calls=0;const prompts=[],events=[],h=harness({json:async p=>{prompts.push(p);calls++;return calls===1?{skill:{name:'냉철한 조준',recipe:'focus'}}:{plan:{theme:'별빛 치유'},skill:{name:'별빛의 보살핌',recipe:'grace',trigger:'after_basic',triggerEvery:4}};}}),c=healer(),before=clone(c.skills);
 const r=await h.v2GenerateSelected(c,'passive','별의 축복으로 동료를 치료',c.skills,{onEvent:e=>events.push(e)});
 assert.equal(calls,2);assert.equal(r.fallback,false);assert.equal(r.kit.passive.name,'별빛의 보살핌');assert.equal(r.kit.passive.trigger,'interval');assert.equal(r.kit.passive.effects[0].type,'regen');assert.equal(r.kit.passive.effects[0].target,'ally');assert.ok(events.some(e=>e.kind==='failure'&&e.text.includes('컨셉 불일치')));assert.match(prompts[1],/컨셉 불일치/);assert.deepEqual(c.skills,before);
});
test('healer menus do not offer generic aim/crit passives and recovery names inherit the character motif',()=>{
 const c=healer(),h=harness();assert.ok(C.isHealer(c));assert.ok(!C.aiRecipes(c,'passive').focus);assert.ok(C.aiRecipes(c,'passive').grace);assert.ok(h.v2ConceptName(c,'passive').includes('별빛'));assert.throws(()=>h.v2CompileGenerated({recipe:'grace',name:'화염의 세례'},'passive',c.skills,c),/컨셉 불일치/);
 assert.doesNotThrow(()=>h.v2CompileGenerated({recipe:'strike',name:'정밀 조준'},'active',C.defaults(),{name:'저격수',role:'atk',weapon:{name:'저격총'}}));
});
test('overpowered generated skills request a weaker redesign using the same generation and preserve partners',async()=>{
 let calls=0,jobs=0;const prompts=[],events=[],h=harness({json:async p=>{prompts.push(p);calls++;return {skill:{recipe:'strike',name:'검사의 일격',power:130}};}}),c={name:'검사',role:'atk',generation:3,skills:C.defaults()},before=clone(c.skills);
 h.v2Job=async(type,args)=>({kit:clone(args[0].skills),report:{generation:3,trials:27,ratio:++jobs===1?3.2:1.1,status:jobs===1?'strong':'within'}});
 const r=await h.v2GenerateSelected(c,'active','검술',c.skills,{onEvent:e=>events.push(e)});assert.equal(calls,2);assert.match(prompts[1],/3세대 기준 3.2배/);assert.match(prompts[1],/줄이세요/);assert.ok(events.some(e=>e.kind==='failure'&&e.text.includes('밸런스 초과')));assert.equal(r.report.ratio,1.1);assert.deepEqual(r.kit.passive,before.passive);assert.deepEqual(r.kit.ultimate,before.ultimate);
});
test('persistent excessive power never returns a strong success; conservative fallback respects the total request limit',async()=>{
 let calls=0;const h=harness({json:async()=>{calls++;return {skill:{recipe:'strike',name:'검사의 일격'}};}}),c={name:'검사',role:'atk',generation:1,skills:C.defaults()},events=[];
 h.v2Job=async(type,args)=>({kit:clone(args[0].skills),report:{generation:1,trials:27,ratio:type==='inspectSkill'?1:5,status:type==='inspectSkill'?'within':'strong'}});
 const r=await h.v2GenerateSelected(c,'active','검술',c.skills,{onEvent:e=>events.push(e)});assert.equal(calls,6);assert.equal(r.fallback,true);assert.equal(r.report.status,'within');assert.ok(events.some(e=>e.kind==='fallback'&&e.text.includes('세대')));
 h.v2Job=async(type,args)=>({kit:clone(args[0].skills),report:{ratio:5,status:'strong'}});await assert.rejects(h.v2GenerateSelected(c,'active','검술',c.skills),/기존 스킬은 유지/);
});
test('old active enums migrate to the new name without losing slot and damage semantics',()=>{
 const k=C.defaults(),old='자동'+' 액티브';k.active.effects=[{...C.defaultEffect('buff'),stat:old+' 피해',skillSlot:old}];const r=C.normalize(k);assert.equal(r.active.effects[0].stat,'액티브 피해');assert.equal(r.active.effects[0].skillSlot,'액티브');assert.deepEqual(C.validate(r),[]);const design={name:old,trigger:old+' 사용 후',cooldown:3,initial:0,effects:[C.Studio.effect('heal')]};const imported=C.fromDesign({skills:[design,design,design]}).kit;assert.equal(imported.active.trigger,'after_active');assert.equal(imported.active.name,'액티브');
});
test('random target count is separate from dispel count and older data retains target coverage',()=>{
 const k=C.defaults();k.active.effects=[{...C.defaultEffect('cleanse'),target:'random_allies',targetCount:3,count:2}];const r=C.normalize(k);assert.equal(r.active.effects[0].targetCount,3);assert.equal(r.active.effects[0].count,2);
 const legacy={...r.active.effects[0],count:4};delete legacy.targetCount;k.active.effects=[legacy];assert.equal(C.normalize(k).active.effects[0].targetCount,4);
});
test('role attack speeds are stable, bounded, and slower for tanks and supports across names',()=>{
 for(let i=0;i<100;i++){const base={name:'대원 '+i,elem:'홍'},a=C.roleSpeed({...base,role:'atk'}),d=C.roleSpeed({...base,role:'def'}),s=C.roleSpeed({...base,role:'sup'});assert.ok(a>=105&&a<=111);assert.ok(d>=77&&d<=83);assert.ok(s>=83&&s<=89);assert.ok(d<s&&s<a);assert.equal(a,C.roleSpeed({...base,role:'atk'}));}
 const r=C.reference();assert.ok(r[0].spd<r[1].spd);assert.ok(r[3].spd<r[1].spd);
});
test('automatic whole-kit balancing finishes at or below the selected generation threshold',()=>{
 for(const role of ['atk','def','sup'])for(const generation of [1,3,5]){
  const c={name:'검증 '+role,role,generation,hp:1100,atk:130,def:60,spd:C.roleSpeed({role}),skills:C.defaults({role})};for(const slot of Object.keys(C.SLOTS))c.skills[slot].effects=[C.defaultEffect(role==='sup'?'heal':'multi',{target:role==='sup'?'allies':'enemies',value:100000,hits:30})];
  const before=clone(c),r=finish(C.balanceSkill(c,{levels:[1]}));assert.notEqual(r.report.status,'strong');assert.ok(r.report.ratio<=1.3);assert.equal(r.report.generation,generation);assert.deepEqual(c,before);
 }
});
