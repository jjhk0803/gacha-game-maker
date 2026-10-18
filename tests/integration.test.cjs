const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'../www/index.html'),'utf8');
function boot(saved){
 const errors=[],vc=new VirtualConsole();
 vc.on('jsdomError',e=>{if(!e.message.startsWith('Could not parse CSS')&&!e.message.startsWith('Not implemented:'))errors.push(e.detail||e);});
 const dom=new JSDOM(html,{url:'https://localhost/?builtin=1',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  w.fetch=()=>Promise.reject(new Error('No network in integration tests'));
  w.matchMedia=()=>({matches:false,addEventListener(){},addListener(){}});
  w.ResizeObserver=class{observe(){}disconnect(){}};
  w.confirm=()=>true;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollTo=()=>{};
  w.URL.createObjectURL=()=>{throw new Error('Exercise the mobile worker fallback');};
  if(saved)w.localStorage.setItem('starfall-contract-v1',saved);
 }});return {dom,w:dom.window,errors};
}
test('original application + new combat adapter end-to-end (DOM, no native/visual assertions)',async t=>{
 const app=boot(),{w,errors}=app;t.after(()=>app.dom.window.close());
 await new Promise(r=>setTimeout(r,30));
 await t.test('legacy migration and editor appear without runtime errors',()=>{
  assert.equal(w.eval('G.chars.length'),8);assert.ok(w.eval('G.chars.every(c=>c.skills.version===2&&c.skill.name)'));
  w.eval('v2OpenEditor(G.chars[0].id)');assert.equal(w.document.querySelectorAll('[data-v2-slot]').length,3);
  w.document.querySelector('[data-act="v2add"][data-slot="active"]').click();assert.equal(w.eval('V2EDIT.kit.active.effects.length'),2);
  w.document.querySelector('[data-act="v2remove"][data-slot="active"]').click();assert.equal(w.eval('V2EDIT.kit.active.effects.length'),1);
 });
 await t.test('restored studio menus expose every condition/trigger/effect and dynamic parameters',async()=>{
  w.eval('v2OpenEditor(G.chars[0].id)');
  assert.equal(w.document.querySelector('[data-v2-field="trigger"]').options.length,22);
  assert.equal(w.document.querySelector('[data-v2-field="condition"]').options.length,13);
  const select=w.document.querySelector('[data-v2-slot="active"] [data-v2-field="type"]');
  assert.equal(select.querySelectorAll('optgroup:not(:last-child) option').length,51);
  select.value='detonate';select.dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.ok(w.document.querySelector('[data-v2-slot="active"] [data-v2-field="mark"]'));
  assert.ok(w.document.querySelector('[data-v2-slot="active"] [data-v2-field="basis"]'));
  const sample=w.eval('GGMStudio.effect("mark")');
  const skill={name:'Imported',trigger:'공격 적중 시',cooldown:3,initial:2,effects:[sample]};
  w.eval('V2EDIT.slot="active";v2DrawEditor()');
  w.document.querySelector('#v2-design').value=JSON.stringify({skills:[skill,skill,skill]});
  await w.eval('v2EditorAction("v2import",document.querySelector("[data-act=v2import]"))');
  assert.equal(w.eval('V2EDIT.kit.active.effects[0].type'),'mark');
  assert.equal(w.eval('V2EDIT.kit.passive.trigger'),'interval');
  w.eval('v2OpenEditor(G.chars[0].id)');
 });
 await t.test('previous APK skill data gains missing editor fields without losing original numbers',()=>{
  w.eval(`{
   const k=GGMCombat.clone(G.chars[0].skills);delete k.ruleset;
   for(const key of ['passive','active','ultimate']){for(const f of ['triggerEvery','threshold','triggerMark','limit','lockout','auto','fx','color'])delete k[key][f];
    k[key].effects=k[key].effects.map(e=>Object.fromEntries(['type','target','value','duration','chance','stacks','condition'].map(f=>[f,e[f]])));}
   G.chars[0].skills=k;v2OpenEditor(G.chars[0].id);v2ReadEditor();
  }`);
  assert.deepEqual(Array.from(w.document.querySelectorAll('#v2-fields input[type=number]')).filter(el=>!el.value||!Number.isFinite(Number(el.value))).map(el=>el.dataset.v2Field),[]);
  assert.equal(w.eval('GGMCombat.validate(V2EDIT.kit).length'),0);
 });
 await t.test('manual save preserves exact values and old abyss skill',async()=>{
  w.eval('v2OpenEditor(G.chars[0].id,"active")');
  const old=w.eval('JSON.stringify(G.chars[0].skill)');
  w.document.querySelector('[data-v2-slot="active"] [data-v2-field="value"]').value='213';
  await w.eval('v2EditorAction("v2save",document.querySelector("[data-act=v2save]"))');
  assert.equal(w.eval('G.chars[0].skills.active.effects[0].value'),2.13);
  assert.equal(w.eval('JSON.stringify(G.chars[0].skill)'),old);
  assert.equal(w.eval('G.chars[0].skillTuning'),'manual');
  assert.match(w.document.querySelector('#v2-status').textContent,/저장했어요/);
  w.document.querySelector('[data-v2-slot="active"] [data-v2-field="value"]').value='1000000000';
  await w.eval('v2EditorAction("v2save",document.querySelector("[data-act=v2save]"))');
  assert.equal(w.eval('G.chars[0].skills.active.effects[0].value'),2.13);
 });
 await t.test('AI concept path is validated and remains a draft until save (mock provider)',async()=>{
  w.eval('v2OpenEditor(G.chars[0].id,"active"); SAMPLE={json:async prompt=>{window.lastPrompt=prompt;return {skills:GGMCombat.defaults({role:"sup"})};}}');
  const old=w.eval('JSON.stringify(G.chars[0].skills)');
  w.document.querySelector('#v2-concept').value='얼음 기사';
  await w.eval('v2EditorAction("v2generate",document.querySelector("[data-act=v2generate]"))');
  assert.ok(w.lastPrompt.includes('얼음 기사'));assert.equal(w.eval('JSON.stringify(G.chars[0].skills)'),old);
  assert.equal(w.eval('V2EDIT.report.trials'),27);
  w.document.querySelector('#v2-concept').value='';
  await w.eval('v2EditorAction("v2generate",document.querySelector("[data-act=v2generate]"))');
  assert.ok(w.lastPrompt.includes('현재 캐릭터 설정에 맞게 결정'));
  w.eval('SAMPLE={json:async()=>({skills:{version:2,active:{effects:[{type:"invented"}]}}})}');
  await w.eval('v2EditorAction("v2generate",document.querySelector("[data-act=v2generate]"))');
  assert.match(w.document.querySelector('#v2-status').textContent,/복구한 초안/);
  assert.equal(w.eval('JSON.stringify(G.chars[0].skills)'),old);
 });
 await t.test('AI edits and saves only the selected slot, retaining unsaved drafts in the other tabs',async()=>{
  w.eval('v2OpenEditor(G.chars[1].id,"active");SAMPLE={json:async(p)=>{window.oneSlotPrompt=p;return {skill:{name:"새 액티브",cooldown:8,initial:0,effects:[{type:"damage",target:"enemy",value:"180%"}]}};}}');
  const old=w.eval('JSON.stringify(G.chars[1].skills)');
  w.document.querySelector('[data-v2-slot="passive"] [data-v2-field="name"]').value='미저장 패시브';w.document.querySelector('[data-v2-slot="ultimate"] [data-v2-field="value"]').value='-99900';
  await w.eval('v2EditorAction("v2generate",document.querySelector("[data-act=v2generate]"))');
  assert.match(w.oneSlotPrompt,/딱 하나/);assert.equal(w.eval('V2EDIT.kit.active.name'),'새 액티브');assert.equal(w.eval('V2EDIT.kit.passive.name'),'미저장 패시브');assert.equal(w.eval('V2EDIT.kit.ultimate.effects[0].value'),-999);assert.equal(w.eval('JSON.stringify(G.chars[1].skills)'),old);
  await w.eval('v2EditorAction("v2save",document.querySelector("[data-act=v2save]"))');
  const saved=JSON.parse(w.eval('JSON.stringify(G.chars[1].skills)')),before=JSON.parse(old);assert.equal(saved.active.name,'새 액티브');assert.deepEqual(saved.passive,before.passive);assert.deepEqual(saved.ultimate,before.ultimate);
 });
 await t.test('editor displays exact waiting stage and stops immediately without applying late AI results',async()=>{
  w.eval('v2OpenEditor(G.chars[0].id,"active");window.slotRequests=0;SAMPLE={json:(p,o)=>{slotRequests++;window.slotSignal=o.signal;return new Promise(resolve=>window.finishSlot=resolve);}}');
  const old=w.eval('JSON.stringify(V2EDIT.kit)'),saved=w.eval('JSON.stringify(G.chars[0].skills)');
  w.eval('window.slotRun=v2EditorAction("v2generate",document.querySelector("[data-act=v2generate]"))');await new Promise(r=>setTimeout(r,10));
  assert.match(w.document.querySelector('#v2-status').textContent,/2\/7.*AI.*응답/);
  const cancel=w.document.querySelector('[data-act="v2cancel"]');assert.equal(cancel.hidden,false);assert.equal(cancel.closest('fieldset'),null);assert.equal(w.document.querySelector('#v2-fields').disabled,true);
  cancel.click();await w.slotRun;assert.equal(w.slotSignal.aborted,true);assert.equal(w.eval('V2EDIT.busy'),false);assert.equal(w.document.querySelector('#v2-fields').disabled,false);assert.match(w.document.querySelector('#v2-status').textContent,/중단/);
  w.finishSlot({skill:{name:'늦은 결과',effects:[{type:'damage',value:180}]}});await new Promise(r=>setTimeout(r,10));assert.equal(w.eval('JSON.stringify(V2EDIT.kit)'),old);assert.equal(w.eval('JSON.stringify(G.chars[0].skills)'),saved);assert.equal(w.slotRequests,1);
 });
 await t.test('failed attempt reasons remain visible after a successful retry',async()=>{
  w.eval('v2OpenEditor(G.chars[0].id,"ultimate");window.reasonCalls=0;SAMPLE={json:async()=>{reasonCalls++;if(reasonCalls===1)throw {code:"invalid_json"};if(reasonCalls===2)return {skill:{effects:[{type:"invented"}]}};return {skill:{name:"복구된 궁극기",effects:[{type:"damage",value:170}]}};}}');
  await w.eval('v2EditorAction("v2generate",document.querySelector("[data-act=v2generate]"))');const history=w.document.querySelector('#v2-generation-history');assert.equal(history.hidden,false);assert.equal(history.open,true);assert.match(history.textContent,/1차 실패.*JSON/);assert.match(history.textContent,/2차 실패.*invented/);assert.match(w.document.querySelector('#v2-status').textContent,/선택한 스킬을 생성/);assert.equal(w.reasonCalls,3);
 });
 await t.test('simulator fallback can be cancelled and the next queued job still runs',async()=>{
  const task=w.eval('window.balanceCancel=new AbortController();v2Job("inspectSkill",[v2CharacterInput(G.chars[0]),v2Options()],{signal:balanceCancel.signal,onProgress:()=>balanceCancel.abort()})');
  await assert.rejects(task,e=>e.name==='AbortError');const next=await w.eval('v2Job("inspectSkill",[v2CharacterInput(G.chars[0]),v2Options()])');assert.equal(next.report.trials,27);
 });
 await t.test('browser/native transport honour logical cancellation and managed AI requests do not hide retries',async()=>{
  const oldFetch=w.fetch,oldCap=w.Capacitor;
  try{
   let observed;w.fetch=(url,options)=>new Promise((resolve,reject)=>{observed=options.signal;options.signal.addEventListener('abort',()=>{const e=new Error('abort');e.name='AbortError';reject(e);});});
   const request=w.eval('window.httpCancel=new AbortController();http("https://example.test/ai",{signal:httpCancel.signal})');const rejected=assert.rejects(request,e=>e.name==='AbortError');w.eval('httpCancel.abort()');await rejected;assert.equal(observed.aborted,true);
   let finishNative;w.Capacitor={Plugins:{CapacitorHttp:{request:()=>new Promise(r=>finishNative=r)}}};const native=w.eval('window.nativeCancel=new AbortController();http("https://example.test/ai",{signal:nativeCancel.signal})');const nativeRejected=assert.rejects(native,e=>e.name==='AbortError');w.eval('nativeCancel.abort()');await nativeRejected;finishNative({status:200,data:'{"ok":true}',headers:{}});await new Promise(r=>setTimeout(r,1));
   w.Capacitor=oldCap;let requests=0;w.fetch=async()=>{requests++;return {status:200,headers:{forEach(){}},text:async()=>JSON.stringify({choices:[{message:{content:'not JSON'},finish_reason:'stop'}]})};};
   w.eval('window.oldAIP=AIP;AIP=()=>({active:"fake",fallback:true,list:[{id:"fake",type:"openai",base:"https://example.test/v1",key:"test-only",model:"test"},{id:"fake2",type:"openai",base:"https://example.test/v1",key:"test-only",model:"test"}]})');
   await assert.rejects(w.eval('aiCall("스킬 테스트","default",null,{managedRetry:true})'),e=>e.code==='invalid_json');assert.equal(requests,1);
  }finally{w.fetch=oldFetch;w.Capacitor=oldCap;w.eval('if(window.oldAIP)AIP=oldAIP;SAMPLE=null');}
 });
 await t.test('idle cancel is visually hidden and effect inputs only show applicable rules',()=>{
  w.eval('v2OpenEditor(G.chars[0].id,"active")');const cancel=w.document.querySelector('[data-act="v2cancel"]');assert.equal(w.getComputedStyle(cancel).display,'none');assert.ok(!w.document.querySelector('#v2-fields').textContent.includes('AI 효과 상한'));
  const row=()=>w.document.querySelector('[data-v2-slot="active"] [data-v2-effect="0"]'),has=key=>!!row().querySelector('[data-v2-field="'+key+'"]');
  const effect=(type,target,extra={})=>{w.V2EDIT_PATCH={type,target,...extra};w.eval('V2EDIT.kit.active.effects=[GGMCombat.defaultEffect(V2EDIT_PATCH.type,V2EDIT_PATCH)];v2DrawEditor()');};
  effect('buff','self');assert.equal(has('priority'),false);assert.equal(has('owner'),false);assert.equal(has('fallback'),false);assert.equal(has('stat'),true);assert.equal(has('duration'),true);assert.equal(has('reapply'),true);
  effect('heal','allies');assert.equal(has('priority'),false);assert.equal(has('duration'),false);assert.equal(has('stacks'),false);assert.equal(has('removable'),false);
  effect('heal','ally');assert.equal(has('priority'),true);
  effect('damage','enemy');assert.equal(has('duration'),false);assert.equal(has('stacks'),false);assert.equal(has('reapply'),false);assert.equal(has('owner'),false);
  effect('mark','enemy');assert.equal(has('owner'),true);assert.equal(has('mark'),true);
  effect('damage','enemy',{basis:'기록한 피해량'});assert.equal(has('mark'),true);assert.equal(has('owner'),false);effect('buff','self',{reapply:'독립적으로 적용'});assert.equal(has('stacks'),true);effect('buff','self',{reapply:'강한 효과만 유지'});assert.equal(has('stacks'),false);
  effect('cleanse','random_allies',{count:2,targetCount:3});assert.equal(has('priority'),false);assert.equal(has('count'),true);assert.equal(has('targetCount'),true);assert.equal(row().querySelectorAll('[data-v2-field="count"]').length,1);
  w.eval('V2EDIT.busy=true;v2RenderGeneration(V2EDIT)');assert.notEqual(w.getComputedStyle(w.document.querySelector('[data-act="v2cancel"]')).display,'none');w.eval('V2EDIT.busy=false;v2RenderGeneration(V2EDIT)');assert.equal(w.getComputedStyle(w.document.querySelector('[data-act="v2cancel"]')).display,'none');
 });
 await t.test('role speed migration covers all existing characters once and preserves subsequent manual edits',()=>{
  assert.equal(w.eval('G.chars.every(c=>c.roleSpeedVersion===1)'),true);
  const ranges=w.eval('G.chars.map(c=>({role:c.role,spd:c.spd}))');for(const c of ranges){assert.ok(c.role==='atk'?c.spd>=105&&c.spd<=111:c.role==='def'?c.spd>=77&&c.spd<=83:c.spd>=83&&c.spd<=89);}
  w.eval('window.speedChar={name:"검증",role:"def",spd:120};v2ApplyRoleSpeed(speedChar)');assert.equal(w.speedChar.roleSpeedOriginal,120);const first=w.speedChar.spd;w.speedChar.spd=99;w.eval('v2ApplyRoleSpeed(speedChar)');assert.equal(w.speedChar.spd,99);w.speedChar.role='atk';w.eval('v2ApplyRoleSpeed(speedChar)');assert.ok(w.speedChar.spd>first);
 });
 await t.test('trigger and condition inputs match the selected rule',()=>{
  w.eval('v2OpenEditor(G.chars[0].id)');
  const choose=(selector,value)=>{const e=w.document.querySelector(selector);e.value=value;e.dispatchEvent(new w.Event('change',{bubbles:true}));};
  const prefix='[data-v2-slot="passive"] ';
  choose(prefix+'[data-v2-field="trigger"]','interval');
  assert.match(w.document.querySelector(prefix+'[data-v2-field="triggerEvery"]').parentElement.textContent,/간격 \(초\)/);
  assert.equal(w.document.querySelector(prefix+'[data-v2-field="threshold"]'),null);
  choose(prefix+'[data-v2-field="trigger"]','attack_hit');assert.match(w.document.querySelector(prefix+'[data-v2-field="triggerEvery"]').parentElement.textContent,/적중 몇 회/);
  choose(prefix+'[data-v2-field="trigger"]','hp_below');assert.equal(w.document.querySelector(prefix+'[data-v2-field="threshold"]').value,'40');assert.equal(w.document.querySelector(prefix+'[data-v2-field="triggerEvery"]'),null);assert.ok(w.document.querySelector(prefix+'[data-v2-field="threshold"]'));
  choose(prefix+'[data-v2-field="trigger"]','battle_start');assert.equal(w.document.querySelector(prefix+'[data-v2-field="triggerMark"]'),null);
  choose(prefix+'[data-v2-field="condition"]','has_mark');assert.ok(w.document.querySelector(prefix+'[data-v2-field="conditionMark"]'));
  choose(prefix+'[data-v2-field="condition"]','always');assert.equal(w.document.querySelector(prefix+'[data-v2-field="conditionMark"]'),null);
 });
 await t.test('AI repairs omitted optional fields and retries out-of-range results up to five times',async()=>{
  w.eval(`window.requests=0;window.prompts=[];SAMPLE={json:async p=>{requests++;prompts.push(p);const k=GGMCombat.defaults();if(requests<3)k.active.effects[0].value=999999;else delete k.active.effects[0].duration;return {skills:k};}};`);
  const k=await w.eval('v2GenerateSkills(G.chars[0],"빛의 기사")');assert.equal(w.requests,1);assert.equal(w.GGMCombat.validate(k).length,0);assert.ok(w.GGMCombat.slotCost(k.active,'active')<=w.GGMCombat.GENERATIONS[1].active);
  w.eval('requests=0;SAMPLE={json:async()=>{requests++;return {skills:{}};}}');
  const recovered=await w.eval('v2GenerateSkills(G.chars[0])');assert.equal(w.GGMCombat.validate(recovered).length,0);assert.match(w.eval('G.chars[0].skillGenerationNotice'),/5회/);assert.equal(w.eval('G.chars[0].skillDesignLog.filter(x=>x.kind==="failure").length'),6);assert.equal(w.requests,6);assert.equal(w.document.querySelector('.v2-generation-progress'),null);
  w.eval('requests=0;SAMPLE={json:async()=>{requests++;if(requests===1)throw new SyntaxError("invalid JSON");return {skills:GGMCombat.defaults()};}}');await w.eval('v2GenerateSkills(G.chars[0])');assert.equal(w.requests,2);
  w.eval('requests=0;SAMPLE={json:async()=>{requests++;throw new Error("network failed");}}');await assert.rejects(w.eval('v2GenerateSkills(G.chars[0])'));assert.equal(w.requests,1);
 });
 await t.test('new-character compact generation shares role caps and can be cancelled without late writes',async()=>{
  w.eval(`SAMPLE={json:async()=>({skills:{passive:{recipe:'focus',name:'집중'},active:{recipe:'mend',name:'치료'},ultimate:{recipe:'mend',name:'빛',target:'allies',extras:['def_up']}}})}`);
  const kit=await w.eval('v2GenerateSkills({...G.chars[0],role:"sup",generation:2},"빛의 치유사")');assert.equal(w.GGMCombat.validate(kit).length,0);assert.equal(kit.passive.effects.length,1);assert.equal(kit.active.effects.length,1);assert.ok(kit.ultimate.effects.length<=2);assert.equal(kit.active.effects[0].type,'heal');
  w.eval('SAMPLE={json:()=>new Promise(resolve=>window.finishNewSkills=resolve)};window.newSkillJob=v2GenerateSkills(G.chars[0]);window.newSkillJob.catch(()=>{});');
  await new Promise(r=>setTimeout(r,5));const before=w.eval('JSON.stringify(G.chars[0].skills)');w.document.querySelector('.v2-generation-progress button').click();await assert.rejects(w.newSkillJob,e=>e.name==='AbortError');assert.equal(w.document.querySelector('.v2-generation-progress'),null);w.finishNewSkills({skills:w.GGMCombat.defaults()});await new Promise(r=>setTimeout(r,5));assert.equal(w.eval('JSON.stringify(G.chars[0].skills)'),before);
 });
 await t.test('generation visibly animates while waiting and cleans its timer after completion',async()=>{
  w.eval('SAMPLE={json:()=>new Promise(resolve=>window.finishSkills=resolve)};window.generating=v2GenerateSkills(G.chars[0]);');
  const first=w.document.querySelector('.v2-generation-progress').textContent;
  await new Promise(r=>setTimeout(r,450));assert.notEqual(w.document.querySelector('.v2-generation-progress').textContent,first);
  w.eval('finishSkills({skills:GGMCombat.defaults()})');await w.generating;assert.equal(w.document.querySelector('.v2-generation-progress'),null);
 });
 await t.test('equipment has separate skill cards; icon dialogs stage, discard and commit independently',async()=>{
  w.eval('localStorage.setItem("ggm-play","1");render();openChar(G.chars[0].id)');assert.equal(w.eval('playMode()'),true);assert.equal(w.document.querySelectorAll('[data-skill-card]').length,3);
  assert.ok(w.document.querySelector('[data-act="wnai"] + [data-act="v2icons"]'));
  w.eval(`SAMPLE=null;window.savedNaiDraw=naiDraw;window.savedImgReady=imgReady;window.savedStoreImage=storeImage;window.savedCreateURL=URL.createObjectURL;window.savedRevokeURL=URL.revokeObjectURL;
   window.iconCounter=0;URL.createObjectURL=()=>"blob:icon-"+(++iconCounter);URL.revokeObjectURL=()=>{};imgReady=()=>true;naiDraw=async(k,p,o)=>{window.iconRequest={k,p,o};return new Blob(['png']);};storeImage=async(o,b)=>{o.img={idb:true};imgCache[o.id]='blob:saved-icon';};document.querySelector('[data-act="v2icons"]').click();`);
  assert.equal(w.document.querySelectorAll('.v2-icon-row').length,3);
  async function act(name,slot){const selector='[data-icon-act="'+name+'"]'+(slot?'[data-slot="'+slot+'"]':'');const target=w.document.querySelector(selector);assert.ok(target,selector);await w.v2IconClick({target});}
  await act('edit','passive');w.document.querySelector('#v2-icon-prompt').value='no humans, icy sigil';await act('generate');assert.equal(w.iconRequest.k,'icon');assert.equal(w.iconRequest.p,'no humans, icy sigil');await act('back');assert.equal(w.eval('Object.keys(V2ICONS.items).length'),0);
  for(const slot of ['passive','active','ultimate']){await act('edit',slot);await act('generate');await act('accept');}
  assert.equal(w.eval('!!G.chars[0].skillIcons'),false);w.confirm=()=>false;await act('close');assert.ok(w.document.querySelector('#v2-icon-dialog'));await act('done');assert.equal(w.eval('!!G.chars[0].skillIcons'),false);
  w.confirm=()=>true;await act('done');assert.equal(w.eval('Object.keys(G.chars[0].skillIcons).length'),3);assert.equal(w.eval('Object.values(G.chars[0].skillIcons).every(o=>imgObjsOf(G).includes(o))'),true);assert.equal(w.document.querySelector('#v2-icon-dialog'),null);
  w.eval('v2OpenIcons(G.chars[0].id)');await act('edit','active');await act('generate');await act('accept');const old=w.eval('G.chars[0].skillIcons.active.id');await act('close');assert.equal(w.eval('G.chars[0].skillIcons.active.id'),old);
  w.eval('naiDraw=savedNaiDraw;imgReady=savedImgReady;storeImage=savedStoreImage;URL.createObjectURL=savedCreateURL;URL.revokeObjectURL=savedRevokeURL;localStorage.removeItem("ggm-play");render();');
 });
 await t.test('standing off replaces base, skin and expression full-body art; keeps originals and skips batch drawing',()=>{
  w.eval(`{const c=G.chars[0];window.oldStanding=c.img;c.img={idb:true};imgCache[c.id]='blob:standing';c.upper.img={idb:true};imgCache[c.upper.id]='blob:upper';c.useStanding=false;}`);
  assert.equal(w.eval('charSrc(G.chars[0])'),'blob:upper');assert.equal(w.eval('imgSrc(G.chars[0])'),'blob:upper');assert.match(w.eval('art(G.chars[0])'),/upimg/);
  assert.equal(w.eval('drawTodo().some(x=>x.k==="char"&&x.c===G.chars[0])'),false);
  w.eval(`{const c=G.chars[0];c.skins.push({id:'test-skin',img:{idb:true},upper:{id:'test-skin-up',img:{idb:true}},faces:[{id:'test-face',name:'미소',img:{idb:true}}]});P().owned[c.id]={lv:1,dup:0,wlv:0,exp:0,skin:'test-skin'};imgCache['test-skin']='blob:skin-standing';imgCache['test-skin-up']='blob:skin-upper';imgCache['test-face']='blob:face-standing';}`);
  assert.equal(w.eval('charSrc(G.chars[0],"미소")'),'blob:skin-upper');
  w.eval('delete imgCache["test-skin-up"]');assert.equal(w.eval('charSrc(G.chars[0])'),'blob:upper');w.eval('delete imgCache[G.chars[0].upper.id]');assert.equal(w.eval('charSrc(G.chars[0])'),null);assert.equal(w.eval('imgSrc(G.chars[0])'),null);
  w.eval('openChar(G.chars[0].id)');assert.equal(w.document.querySelector('[role="switch"]').getAttribute('aria-checked'),'false');w.document.querySelector('[data-act="v2standing"]').click();assert.equal(w.eval('G.chars[0].useStanding'),true);assert.equal(w.eval('charSrc(G.chars[0])'),'blob:skin-standing');
  w.eval('G.chars[0].useStanding=false;G.chars[0].skins=G.chars[0].skins.filter(x=>x.id!=="test-skin");delete P().owned[G.chars[0].id].skin;G.chars[0].img=oldStanding;');
 });
 await t.test('season generation setting controls future releases and preserves existing character generations',async()=>{
  w.eval('closeModal();tab="studio";STTAB="live";render()');assert.match(w.eval('studioHTML()'),/시즌 운영/);
  const select=w.document.querySelector('#v2-season-generation');assert.ok(select);assert.equal(select.options.length,5);const old=w.eval('JSON.stringify(G.chars[0].skills)'),oldGen=w.eval('GGMCombat.generation(G.chars[0])');
  select.value='4';select.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(w.eval('P().live.skillGeneration'),4);assert.equal(w.eval('GGMCombat.generation(G.chars[0])'),oldGen);assert.equal(w.eval('JSON.stringify(G.chars[0].skills)'),old);assert.match(w.document.querySelector('#v2-season-generation-panel').textContent,/既存|기존 캐릭터/);
  w.eval('window.newSeasonChar=cleanChar({name:"세대 시험",generation:1,skills:GGMCombat.defaults()})');assert.equal(w.newSeasonChar.generation,4);
  const next=w.document.querySelector('#v2-season-generation');next.value='5';next.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(w.newSeasonChar.generation,4);assert.equal(w.eval('v2CurrentGeneration()'),5);
  w.eval('v2OpenEditor(G.chars[0].id,"active")');assert.equal(w.document.querySelector('#v2-generation'),null);assert.equal(w.eval('V2EDIT.generation'),oldGen);
  while(w.eval('V2EDIT.kit.active.effects.length')<5)w.document.querySelector('[data-act="v2add"][data-slot="active"]').click();assert.equal(w.document.querySelector('[data-act="v2add"][data-slot="active"]').disabled,true);
  w.document.querySelector('[data-act="v2tab"][data-slot="ultimate"]').click();assert.equal(w.document.querySelector('[data-v2-slot="ultimate"] [data-v2-field="cooldown"]'),null);assert.match(w.document.querySelector('[data-v2-slot="ultimate"]').textContent,/개인 SP 100/);
  w.eval('v2OpenEditor(G.chars[0].id,"active")');await w.eval('v2EditorAction("v2save",document.querySelector("[data-act=v2save]"))');assert.equal(w.eval('G.chars[0].generation'),oldGen);assert.equal(w.eval('P().live.skillGeneration'),5);
 });
 await t.test('skill card opens its selected tab, with edits retained while switching',()=>{
  w.eval('CS_TAB="equip";openChar(G.chars[0].id)');w.document.querySelector('[data-act="v2edit"][data-slot="active"]').click();
  assert.equal(w.eval('V2EDIT.slot'),'active');assert.equal(w.document.querySelectorAll('[role="tabpanel"]:not([hidden])').length,1);assert.equal(w.document.querySelector('[role="tabpanel"]:not([hidden])').dataset.v2Slot,'active');
  w.document.querySelector('[data-v2-slot="active"] [data-v2-field="name"]').value='임시 액티브';
  w.document.querySelector('[data-act="v2tab"][data-slot="ultimate"]').click();assert.equal(w.eval('V2EDIT.kit.active.name'),'임시 액티브');assert.equal(w.document.querySelector('[data-v2-slot="ultimate"]').hidden,false);
  w.document.querySelector('[data-act="v2tab"][data-slot="active"]').click();assert.equal(w.document.querySelector('[data-v2-slot="active"] [data-v2-field="name"]').value,'임시 액티브');
  w.eval('openChar(G.chars[0].id)');w.document.querySelector('[data-act="v2edit"][data-slot="passive"]').click();assert.equal(w.eval('V2EDIT.slot'),'passive');
 });
 await t.test('standing switch is on the standing heading and its bubble does not lock scroll',()=>{
  w.eval('CS_TAB="look";openChar(G.chars[0].id)');const header=w.document.querySelector('.v2-standing-header');assert.ok(header);assert.match(header.querySelector('h3').textContent,/스탠딩 \(전투/);
  const controls=header.querySelector('.v2-standing-controls');assert.equal(controls.children[0].dataset.act,'v2standhelp');assert.equal(controls.children[1].textContent,'스탠딩 사용');assert.equal(controls.children[2].dataset.act,'v2standing');
  const before=w.document.body.style.overflow;controls.children[0].click();assert.ok(w.document.querySelector('#v2-standing-help'));assert.equal(w.document.body.style.overflow,before);assert.equal(controls.children[0].getAttribute('aria-expanded'),'true');w.document.body.click();assert.equal(w.document.querySelector('#v2-standing-help'),null);
 });
 await t.test('icon root has no close X and character-specific concept prompts use the selected skill',async()=>{
  w.eval('v2OpenIcons(G.chars[0].id)');assert.equal(w.document.querySelectorAll('#v2-icon-dialog [data-icon-act="close"]').length,1);assert.equal(w.document.querySelector('#v2-icon-dialog h2').parentElement.querySelector('button'),null);
  const prompt=w.eval('v2IconPrompt({name:"서리 암살자",profile:"얼음과 단검",naiPrompt:"silver dagger, blue eyes",skills:GGMCombat.defaults()},"active")');assert.match(prompt,/ice crystals/);assert.match(prompt,/dagger/);
  w.eval('SAMPLE={json:async(p)=>{window.iconConceptRequest=p;return {prompt:"ice dagger, snowflake sigil"};}}');
  await w.v2IconClick({target:w.document.querySelector('[data-icon-act="edit"][data-slot="active"]')});await w.v2IconClick({target:w.document.querySelector('[data-icon-act="concept"]')});assert.match(w.iconConceptRequest,/캐릭터와 스킬/);assert.match(w.document.querySelector('#v2-icon-prompt').value,/ice dagger/);assert.equal(w.eval('V2ICONS.busy'),false);
  await w.v2IconClick({target:w.document.querySelector('[data-icon-act="back"]')});await w.v2IconClick({target:w.document.querySelector('[data-icon-act="close"]')});w.eval('SAMPLE=null');
 });
 await t.test('practice supports party selection, role dummies, pause, restart and no progression changes',async()=>{
  assert.match(w.eval('STTAB="";studioHTML()'),/연습장/);w.eval('v2OpenPractice()');
  w.document.querySelector('[data-practice-slot="1"]').value=w.document.querySelector('[data-practice-slot="0"]').value;assert.equal(w.eval('v2ReadPractice()'),false);
  w.eval('v2OpenPractice()');assert.equal(w.document.querySelector('#v2-practice-count').max,'5');w.document.querySelector('#v2-practice-count').value='6';assert.equal(w.eval('v2ReadPractice()'),false);w.document.querySelector('#v2-practice-count').value='5';assert.equal(w.eval('v2ReadPractice()'),true);assert.equal(w.eval('v2PracticeDummies(8,30).length'),5);w.document.querySelector('#v2-practice-count').value='3';w.document.querySelector('#v2-practice-level').value='20';w.document.querySelector('#v2-practice-hp').value='50';w.document.querySelector('#v2-practice-auto').value='false';
  const progress=w.eval('JSON.stringify(P(),(k,v)=>k==="savedAt"||k==="at"?undefined:v)');const squad=w.eval('JSON.stringify(P().squad)');await w.eval('v2StartPractice()');
  assert.equal(w.eval('B.ctx.kind'),'practice');assert.equal(w.eval('B.auto'),false);assert.equal(w.document.querySelectorAll('.v2-sp').length,w.eval('B.allies.length'));assert.equal(w.document.querySelector('.v2-sp').parentElement.className,'skill');w.eval('B.allies[0].sp=50;bUpdate()');assert.equal(w.document.querySelector('.v2-sp').getAttribute('aria-valuenow'),'50');assert.equal(w.document.querySelector('.v2-sp i').style.width,'50%');w.eval('B.allies[0].sp=100;bUpdate()');assert.equal(w.document.querySelector('.skill').disabled,false);w.eval('clearInterval(B.timer)');assert.deepEqual(Array.from(w.eval('B.enemies.map(u=>u.role)')),['def','atk','sup']);assert.equal(w.eval('B.allies.every(u=>u.hp<u.maxhp)'),true);
  w.eval('B.engine.externalImpacts=false;for(let i=0;i<1000;i++)bTick()');assert.equal(w.eval('B.over'),false);assert.ok(w.eval('B.engine.time')>119);assert.equal(w.eval('B.enemies.every(u=>u.hp===u.maxhp&&u.dmg===0)'),true);assert.ok(w.eval('B.allies.reduce((n,u)=>n+u.dmg,0)')>0);assert.match(w.document.querySelector('#v2-practice-time').textContent,/누적 피해/);
  w.document.querySelector('[data-act="v2practice-pause"]').click();const time=w.eval('B.engine.time');w.eval('bTick()');assert.equal(w.eval('B.engine.time'),time);w.document.querySelector('[data-act="v2practice-pause"]').click();w.eval('bTick()');assert.ok(w.eval('B.engine.time')>time);
  await w.eval('v2StartPractice(false)');w.eval('clearInterval(B.timer)');assert.equal(w.eval('B.engine.time'),0);assert.equal(w.eval('B.allies.reduce((n,u)=>n+u.dmg,0)'),0);
  w.document.querySelector('[data-act="bquit"]').click();assert.equal(w.eval('B'),null);assert.ok(w.document.querySelector('#v2-practice-count'));assert.equal(w.eval('JSON.stringify(P().squad)'),squad);assert.equal(w.eval('JSON.stringify(P(),(k,v)=>k==="savedAt"||k==="at"?undefined:v)'),progress);
  await w.eval('v2StartPractice()');w.eval('clearInterval(B.timer);B.allies.forEach(u=>u.hp=0);bTick()');assert.equal(w.eval('B'),null);
 });
 await t.test('normal battle completes, active skills run with auto disabled, BURST absent',async()=>{
  w.eval('closeModal();closeOv();P().settings.stamina=false;P().squad=G.chars.slice(0,4).map(c=>c.id);G.chars.slice(0,4).forEach(c=>{P().owned[c.id]={lv:1,dup:0,wlv:0,exp:0};});');
  await w.eval('startStage({id:"test_battle",title:"Test",enemies:[{name:"표적",elem:"청",hp:12000,atk:1,def:0,spd:50,manual:true}],reward:0,pre:"",post:""},{kind:"main"})');
  w.eval('clearInterval(B.timer);B.auto=false;window.activeSeen=false;for(let i=0;i<70&&!B.over;i++){bTick();if(B.log.some(x=>x.includes("액티브")))window.activeSeen=true;}');
  assert.equal(w.document.querySelector('#bBurst'),null);assert.equal(w.activeSeen,true);
  assert.equal(w.document.querySelectorAll('[data-act="skill"]').length,4);
  w.eval('for(let i=0;i<800&&!B.over;i++)bTick();');const finishDeadline=Date.now()+2500;while(!w.eval('B.over')&&Date.now()<finishDeadline)await new Promise(r=>setTimeout(r,20));
  assert.equal(w.eval('B.over'),true);assert.ok(w.document.querySelector('.result'));
 });
 await t.test('save and reload preserve skill schema and manual numbers',async()=>{
  await w.eval('flush()');const saved=w.eval('localStorage.getItem(LKEY)');assert.ok(saved.includes('"skills"'));
  const reloaded=boot(saved);await new Promise(r=>setTimeout(r,30));try{assert.equal(reloaded.w.eval('P().live.skillGeneration'),5);assert.equal(reloaded.w.eval('G.chars[0].skills.active.effects[0].value'),2.13);assert.equal(reloaded.w.eval('G.chars[0].useStanding'),false);assert.equal(reloaded.w.eval('Object.keys(G.chars[0].skillIcons).length'),3);assert.equal(reloaded.errors.length,0);}finally{reloaded.dom.window.close();}
 });
 assert.deepEqual(errors.map(e=>e.message),[]);
});
