const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom'),C=require('../www/combat/core.js'),S=require('../www/combat/catalog.js');
const html=fs.readFileSync(path.join(__dirname,'../www/index.html'),'utf8');
function boot(){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>{if(!/Could not parse CSS|Not implemented:/.test(e.message))errors.push(e.detail||e);});
 const dom=new JSDOM(html,{url:'https://localhost/?builtin=1',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  w.fetch=()=>Promise.reject(new Error('Offline test'));w.matchMedia=()=>({matches:false,addEventListener(){},addListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}};w.confirm=()=>true;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollTo=()=>{};w.URL.createObjectURL=()=>{throw new Error('Use fallback');};
  w.framesSeen=[];w.HTMLElement.prototype.animate=function(frames,options){w.framesSeen.push({node:this,frames,options});return {onfinish:null};};
  w.HTMLElement.prototype.getBoundingClientRect=function(){if(this.matches(".au-art,.v2-dummy-art,.en-img,.shape"))return {left:0,top:0,width:0,height:0};const x=this.classList.contains('eu')?200:this.classList.contains('au')?30:0,y=this.classList.contains('eu')?50:this.classList.contains('au')?330:0;return {left:x,top:y,width:80,height:100,right:x+80,bottom:y+100};};
 }});return {w:dom.window,dom,errors};
}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function practice(w){w.eval('P().settings.stamina=false;P().squad=[G.chars[0].id];P().owned[G.chars[0].id]={lv:1,dup:0,wlv:0,exp:0};v2OpenPractice();');await w.eval('v2StartPractice()');w.eval('clearInterval(B.timer);B.auto=false;');}
test('all 12 effects survive normalization; concept visuals fit weapons and healing',()=>{
 for(const fx of C.FX_TYPES){const k=C.defaults();k.active.fx=fx;k.active.color='#24a6a4';assert.equal(C.normalize(k).active.fx,fx);assert.equal(C.normalize(k).active.color,'#24a6a4');}
 assert.equal(C.skillVisual({profile:'화염 마법사'},'active',{type:'damage'}).fx,'화염구');assert.equal(C.skillVisual({weapon:{name:'저격총'}},'active',{type:'damage'}).fx,'총탄');assert.equal(C.skillVisual({role:'sup'},'active',{type:'heal'}).fx,'회복 광휘');
});
test('skill summaries round floats to two decimals without mutating stored precision',()=>{
 const e=S.effect('damage',{value:435.599999999,duration:4.29999999});const before=JSON.stringify(e),text=S.describe(e);assert.match(text,/435\.6%/);assert.doesNotMatch(text,/999999/);assert.equal(JSON.stringify(e),before);
});
test('presentation editor, projectile travel, cooldowns and cut-in pause end to end',async t=>{
 const {w,dom,errors}=boot();t.after(()=>dom.window.close());await wait(30);
 await t.test('rounded numeric fields preserve raw values until the user edits them',()=>{
  w.eval('v2OpenEditor(G.chars[0].id,"active");V2EDIT.kit.active.effects=[GGMCombat.defaultEffect("damage",{value:435.599999999})];v2DrawEditor();');
  const input=w.document.querySelector('[data-v2-slot=active] [data-v2-field=value]');assert.equal(input.value,'435.6');w.eval('v2ReadEditor()');assert.equal(w.eval('V2EDIT.kit.active.effects[0].value'),435.599999999);
  input.dispatchEvent(new w.Event('input',{bubbles:true}));w.eval('v2ReadEditor()');assert.equal(w.eval('V2EDIT.kit.active.effects[0].value'),435.6);
 });
 await t.test('color presets retain the expanded panel and preview uses the same moving projectile renderer',()=>{
  const panel=w.document.querySelector('[data-v2-slot=active]'),details=panel.querySelector('details');details.open=true;
  assert.equal(panel.querySelector('[data-v2-field=fx]').options.length,C.Visuals.PRESET_NAMES.length);assert.equal(panel.querySelectorAll('[data-act=v2color]').length,12);
  panel.querySelector('[data-color="#4cc9f0"]').click();assert.equal(details.open,true);assert.equal(panel.querySelector('[data-v2-field=color]').value,'#4cc9f0');
  const select=panel.querySelector('[data-v2-field=fx]');select.value='화염구';select.dispatchEvent(new w.Event('change',{bubbles:true}));panel.querySelector('[data-act=v2fxpreview]').click();
  const projectile=panel.querySelector('[data-projectile="화염구"]');assert.ok(projectile);assert.equal(projectile.style.getPropertyValue('--fx'),'#4cc9f0');
  const a=w.framesSeen.find(x=>x.node===projectile);assert.match(a.frames[0].transform,/translate\(0,0\)/);assert.match(a.frames.at(-1).transform,/translate\(220px,0px\)/);assert.equal(a.options.easing,'linear');
 });
 await practice(w);
 await t.test('SP is inside the ultimate button; active interval countdown and speed read from current engine state',()=>{
  assert.equal(w.document.querySelector('.v2-sp').closest('button').dataset.act,'skill');
  w.eval('B.allies[0].kit.active.trigger="interval";B.allies[0].ready.active=B.engine.time+6.3;B.allies[0].sp=45.4;bUpdate()');
  assert.match(w.document.querySelector('.v2-active-time').textContent,/액티브 · 7초 후/);assert.equal(w.document.querySelector('.v2-sp').getAttribute('aria-valuenow'),'45');
  w.eval('window.delays=[];window.realInterval=window.setInterval;window.setInterval=(fn,ms)=>{window.delays.push(ms);return 0;};for(const speed of [1,2,3]){B.speed=speed;bRun();}window.setInterval=window.realInterval;B.speed=1;');assert.deepEqual(Array.from(w.delays),[230,115,230/3]);
 });
 await t.test('ranged weapons launch actual projectiles and selected effects target the enemy',async()=>{
  assert.equal(w.eval('GGMVFX.ranged({role:"atk",side:"a",c:{weapon:{name:"저격총",desc:"정밀 사격"}}})'),true);
  w.eval('window.delay=GGMVFX.basic({...B.allies[0],role:"sup"},B.enemies[0])');
  // A cloned unit is not on the field; require an actual party member for coordinates.
  w.eval('B.allies[0].role="sup";window.delay=GGMVFX.basic(B.allies[0],B.enemies[0]);');assert.ok(w.delay>0);assert.ok(w.document.querySelector('.bt [data-projectile]'));
  w.eval('GGMVFX.effect({source:B.allies[0],target:B.enemies[0],slot:"active",fx:"빙결창",color:"#5688ff"});');assert.ok(w.document.querySelector('.bt [data-projectile="빙결창"]'));assert.ok(w.eval('GGMVFX.remaining(B.allies[0],B.enemies[0])')>0);
  await wait(800);assert.equal(w.document.querySelector('.bt [data-projectile="빙결창"]'),null);assert.ok(w.document.querySelector('.bt .v2-fx-ring'));assert.equal(w.document.querySelector('.bt .v2-fx-slash'),null);
 });
 await t.test('ultimate cut-in freezes ticks, SP, and cooldowns, resumes its queue and preserves practice pause',async()=>{
  w.eval('P().skillCut="big";B.allies[0].sp=100;B.allies[0].ready.ultimate=0;B.allies[0].lastCast.ultimate=-100;useSkill(B.allies[0]);');
  assert.equal(w.eval('B.presentationBusy'),true);assert.ok(w.document.querySelector('.scut'));const snapshot=w.eval('JSON.stringify({time:B.engine.time,ticks:B.engine.ticks,sp:B.allies.map(u=>u.sp),ready:B.allies.map(u=>u.ready)})');
  w.eval('for(let i=0;i<20;i++)bTick();');assert.equal(w.eval('JSON.stringify({time:B.engine.time,ticks:B.engine.ticks,sp:B.allies.map(u=>u.sp),ready:B.allies.map(u=>u.ready)})'),snapshot);
  w.eval('B.paused=true');await wait(w.GGMVFX.TIMING.cutBig+70);assert.equal(w.eval('B.presentationBusy'),false);assert.equal(w.document.querySelector('.scut'),null);assert.equal(w.eval('B.paused'),true);const time=w.eval('B.engine.time');w.eval('bTick()');assert.equal(w.eval('B.engine.time'),time);w.eval('B.paused=false;bTick()');assert.ok(w.eval('B.engine.time')>time);
 });
 await t.test('cut-in preserves its entrance and holds while the exit wipes the art diagonally',()=>{
  const band=w.framesSeen.find(x=>x.node.classList.contains('scut-band')&&x.frames.some(f=>f.clipPath));assert.ok(band);
  assert.equal(band.frames[0].transform,'translateX(-115%) skewY(-7deg)');assert.equal(band.frames[1].transform,'translateX(3%) skewY(-7deg)');assert.equal(band.frames[1].offset,.08);assert.equal(band.frames[2].offset,.12);assert.equal(band.frames[3].offset,.86);
  assert.match(band.frames.at(-1).clipPath,/120%/);assert.equal(band.frames.at(-1).transform,'translateX(3%) skewY(-7deg)');assert.ok(w.framesSeen.some(x=>x.node.classList.contains('v7-exit-sweep')));
 });
 await t.test('cut-ins off never stall presentation; multiple queued ultimates each pause once',async()=>{
  w.eval('P().skillCut="off";B.allies[0].sp=100;B.allies[0].ready.ultimate=0;B.allies[0].lastCast.ultimate=-100;useSkill(B.allies[0]);');assert.equal(w.eval('!!B.presentationBusy'),false);assert.equal(w.document.querySelector('.scut'),null);
  w.eval('P().skillCut="big";window.castEvent={type:"cast",source:B.allies[0],slot:"ultimate",name:"연속 시험",fx:"마력탄",color:"#a878ff"};v2BattleEvents([castEvent,castEvent]);');assert.equal(w.eval('B.presentationQueue.length'),1);await wait(w.GGMVFX.TIMING.cutBig+40);assert.equal(w.eval('B.presentationBusy'),true);assert.equal(w.eval('B.presentationQueue.length'),0);await wait(w.GGMVFX.TIMING.cutBig+40);assert.equal(w.eval('B.presentationBusy'),false);
 });
 await t.test('explicit game motion overrides the device setting and retains a system-follow choice',()=>{
  w.eval('GGMVFX.clear();window.matchMedia=()=>({matches:true});P().battleMotion="full";B.allies[0].role="sup";window.fullDelay=GGMVFX.basic(B.allies[0],B.enemies[0]);');
  assert.equal(w.GGMVFX.reduced(),false);assert.ok(w.fullDelay>0);assert.ok(w.document.querySelector('[data-projectile]'));
  w.eval('GGMVFX.clear();P().battleMotion="system";window.systemDelay=GGMVFX.basic(B.allies[0],B.enemies[0]);');assert.equal(w.GGMVFX.reduced(),true);assert.equal(w.systemDelay,0);assert.equal(w.document.querySelector('[data-projectile]'),null);
  w.eval('P().battleMotion="reduced";window.matchMedia=()=>({matches:false});');assert.equal(w.GGMVFX.reduced(),true);
  w.eval('P().battleMotion="full";GGMVFX.clear()');
 });
 await t.test('reduced-motion mode keeps target feedback without traveling projectiles',()=>{
  w.eval('GGMVFX.clear();P().battleMotion="system";window.matchMedia=()=>({matches:true});window.reducedDelay=GGMVFX.effect({source:B.allies[0],target:B.enemies[0],slot:"active",fx:"화염구",color:"#ff6b35"});');assert.equal(w.reducedDelay,0);assert.equal(w.document.querySelector('.bt [data-projectile]'),null);assert.ok(w.document.querySelector('.bt .v2-fx-ring'));w.eval('P().battleMotion="full";window.matchMedia=()=>({matches:false})');
 });
 await t.test('leaving battle during cut-in cannot resume or alter a new scene',async()=>{
  w.eval('v2BattleEvents([castEvent]);window.oldBattle=B;v2StopPractice()');assert.equal(w.eval('B'),null);await wait(w.GGMVFX.TIMING.cutBig+50);assert.equal(w.eval('B'),null);assert.equal(w.document.querySelector('.scut'),null);
 });
 await t.test('finishing ultimate shows its cut-in and projectile before the victory result',async()=>{
  w.eval('closeModal();G.chars[0].skills.ultimate.effects=[GGMCombat.defaultEffect("damage",{value:300})];G.chars[0].skills.ultimate.fx="화염구";');
  await w.eval('startStage({id:"vfx_finish",title:"Finish",enemies:[{name:"표적",elem:"청",hp:1,atk:1,def:0,spd:50,manual:true}],reward:0,pre:"",post:""},{kind:"main"})');
  w.eval('clearInterval(B.timer);B.auto=false;B.allies[0].sp=100;B.allies[0].ready.ultimate=0;B.allies[0].lastCast.ultimate=-100;useSkill(B.allies[0]);');
  assert.equal(w.eval('B.presentationBusy'),true);assert.equal(w.document.querySelector('.result'),null);await wait(w.GGMVFX.TIMING.cutBig+300);assert.equal(w.document.querySelector('.result'),null);assert.ok(w.document.querySelector('.bt [data-projectile="화염구"]'));await wait(1600);assert.equal(w.eval('B.over'),true);assert.ok(w.document.querySelector('.result'));
 });
 assert.deepEqual(errors.map(e=>e.message),[]);
});
