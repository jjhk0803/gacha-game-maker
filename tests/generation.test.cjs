const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),C=require('../www/combat/core');
const json=x=>JSON.parse(JSON.stringify(x));
function harness(provider){
 const c={GGMCombat:C,GGMStudio:C.Studio,AbortController,Error,Promise,Date,setTimeout,clearTimeout,SAMPLE:provider,parseLoose:JSON.parse,aiErrText:e=>e.message||e.code||'오류',v2CharacterInput:c=>json(c),v2Options:()=>({}),v2Job:async(type,args,o={})=>{const g=C[type](...args);let r;do{if(o.signal?.aborted){const e=Error('cancel');e.name='AbortError';throw e;}r=g.next();if(!r.done)o.onProgress?.(r.value);}while(!r.done);return r.value;}};
 vm.createContext(c);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../www/combat/generation.js'),'utf8'),c);return c;
}
const character=()=>({name:'빙결 기사',role:'atk',elem:'홍',profile:'얼음 창으로 공격',hp:1100,atk:130,def:50,spd:100,skills:C.defaults()});
test('one-slot compiler accepts partial designs, Korean names, numeric strings, range repairs and integer counts',()=>{
 const h=harness(),base=C.defaults(),before=json(base);const r=h.v2CompileSlot({name:'얼음창',cooldown:'999초',effects:[{type:C.Studio.EFFECTS.chain.name,target:'all_enemies',basis:'atk',value:'250%',hits:'4.7회',duration:-4,chance:150,stacks:'2.3'}]},'active',base);
 // Catalog Korean labels are resolved exactly; unknown labels must fail rather than invent effects.
 assert.deepEqual(C.validate(r.kit),[]);assert.equal(r.skill.cooldown,180);assert.equal(r.skill.effects[0].target,'enemies');assert.equal(r.skill.effects[0].hits,5);assert.equal(r.skill.effects[0].duration,.1);assert.equal(r.skill.effects[0].chance,100);assert.equal(r.skill.effects[0].stacks,2);assert.ok(r.repairs.length>0);assert.deepEqual(base,before);assert.deepEqual(json(r.kit.passive),before.passive);assert.deepEqual(json(r.kit.ultimate),before.ultimate);
});
test('all 50 catalog effects compile with valid dependencies and numeric defaults',()=>{
 const h=harness();for(const type of Object.keys(C.Studio.EFFECTS)){
  const e=C.defaultEffect(type),effects=['consume','detonate'].includes(type)?[C.defaultEffect('mark'),e]:[e];
  const r=h.v2CompileSlot({name:type,effects},'active',C.defaults());assert.deepEqual(C.validate(r.kit),[],type);assert.ok(r.skill.effects.some(e=>e.type===type),type);
 }
});
test('unsupported effects, dangling marks and prototype names are rejected; zero-impact attacks are repaired',()=>{
 const h=harness();for(const type of ['teleport','constructor','__proto__'])assert.throws(()=>h.v2CompileSlot({effects:[{type}]},'active',C.defaults()),/지원하지/);
 assert.throws(()=>h.v2CompileSlot({effects:[{type:'detonate',mark:'없는표식'}]},'active',C.defaults()),/표식/);
 assert.throws(()=>h.v2CompileSlot({trigger:'mark_threshold',triggerMark:'새표식',effects:[{type:'damage'}]},'passive',C.defaults()),/다른 저장된/);
 const r=h.v2CompileSlot({effects:[{type:'damage',value:0}]},'active',C.defaults());assert.ok(r.skill.effects[0].value>0);assert.ok(r.repairs.some(x=>x.includes('효과량')));
});
test('invalid_json provider codes and unsupported designs retry with visible causes, then a partial valid skill succeeds',async()=>{
 let calls=0;const prompts=[],events=[],h=harness({json:async(p,o)=>{prompts.push(p);assert.equal(o.managedRetry,true);calls++;if(calls===1)throw {code:'invalid_json'};if(calls===2)return {skill:{effects:[{type:'teleport'}]}};return {plan:{theme:'얼음창'},skill:{name:'빙결창',effects:[{type:'damage',value:'190%'}]}};}}),c=character(),before=json(c.skills);
 const r=await h.v2GenerateSelected(c,'active','얼음 창술',c.skills,{onEvent:e=>events.push(e)});assert.equal(calls,3);assert.equal(r.fallback,false);assert.ok(events.some(e=>e.kind==='failure'&&e.text.includes('JSON')));assert.ok(events.some(e=>e.kind==='failure'&&e.text.includes('teleport')));assert.ok(events.some(e=>e.kind==='repair'));assert.ok(events.some(e=>e.kind==='phase'&&e.stage===7&&e.text.includes('비교')));assert.match(prompts[1],/직전 실패/);assert.match(prompts[0],/딱 하나/);assert.deepEqual(json(r.kit.passive),before.passive);assert.deepEqual(json(r.kit.ultimate),before.ultimate);assert.deepEqual(c.skills,before);
});
test('six malformed responses yield an explicitly labelled valid recovery draft, never a fake AI success',async()=>{
 let calls=0;const events=[],h=harness({json:async()=>{calls++;return {skill:{effects:[{type:'unsupported'}]}};}}),c=character();const r=await h.v2GenerateSelected(c,'ultimate','얼음 창',c.skills,{onEvent:e=>events.push(e)});assert.equal(calls,6);assert.equal(r.fallback,true);assert.equal(events.filter(e=>e.kind==='failure').length,6);assert.ok(events.some(e=>e.kind==='fallback'));assert.deepEqual(C.validate(r.kit),[]);assert.deepEqual(json(r.kit.passive),c.skills.passive);assert.deepEqual(json(r.kit.active),c.skills.active);
});
test('auth, credit and repeated network failures stop with causes rather than inventing a recovered AI response',async()=>{
 for(const code of ['bad_key','low_credit','network']){let calls=0;const h=harness({json:async()=>{calls++;throw {code,message:'서비스 오류'};}}),c=character();await assert.rejects(h.v2GenerateSelected(c,'active','',c.skills),e=>e.code===code);assert.equal(calls,code==='network'?3:1);}
});
test('cancelling an outstanding request is immediate and late provider data cannot enter simulation',async()=>{
 let release,requests=0,jobs=0,signal;const h=harness({json:async(p,o)=>{requests++;signal=o.signal;return new Promise(r=>release=r);}});h.v2Job=async()=>{jobs++;throw Error('must not simulate');};const c=character(),controller=new AbortController(),task=h.v2GenerateSelected(c,'active','',c.skills,{signal:controller.signal});await new Promise(r=>setTimeout(r,1));controller.abort();await assert.rejects(task,e=>e.name==='AbortError');assert.equal(signal.aborted,true);release({skill:{effects:[{type:'damage'}]}});await new Promise(r=>setTimeout(r,1));assert.equal(requests,1);assert.equal(jobs,0);
});
test('selected-slot balance simulation never changes another slot and does not mutate inputs',()=>{
 const c=character(),before=json(c);const g=C.balanceSlot(c,'active');let r,yields=0;do{r=g.next();if(!r.done){yields++;assert.ok(r.value.pass>=1&&r.value.pass<=3);}}while(!r.done);assert.ok(yields>=27);assert.deepEqual(r.value.kit.passive,before.skills.passive);assert.deepEqual(r.value.kit.ultimate,before.skills.ultimate);assert.deepEqual(c,before);assert.equal(r.value.report.slot,'active');
});

test('a simulator failure is logged separately and never applies a generated skill',async()=>{
 const h=harness({json:async()=>({skill:{name:'검사대상',effects:[{type:'damage',value:150}]}})}),events=[],c=character(),before=json(c);h.v2Job=async()=>{throw Error('모의 전투 시간 초과');};await assert.rejects(h.v2GenerateSelected(c,'active','',c.skills,{onEvent:e=>events.push(e)}),/시간 초과/);assert.ok(events.some(e=>e.kind==='failure'&&e.attempt==='모의 전투'&&e.text.includes('시간 초과')));assert.deepEqual(c,before);
});

test('one-slot prompt separates percent input from legacy multiplier context',()=>{const h=harness(),c=character();c.skills.passive.effects[0].value=12.3456789;const p=h.v2SlotPrompt(c,'active','얼음창',c.skills,'');assert.match(p,/1.5배는150/);assert.match(p,/studio:true/);assert.equal(p.includes('12.3456789'),false);assert.match(p,/mark/);});
