const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const C=require('../www/combat/core.js'),V=require('../www/combat/visual-catalog.js');
const {JSDOM,VirtualConsole}=require('jsdom');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function kit(effects=[]){const k=C.defaults();for(const s of ['passive','active','ultimate']){k[s].initial=180;k[s].effects=[];k[s].auto=false;}k.ultimate.initial=0;k.ultimate.effects=effects;return k;}
function unit(k,extra={}){return {hp:10000,maxhp:10000,atk:100,def:0,spd:0,role:'atk',g:0,skills:k,...extra};}
function cast(effects,count=1){const a=unit(kit(effects)),targets=Array.from({length:count},(_,i)=>unit(kit(),{name:'대상'+i})),sim=C.create([a],targets,{seed:7,practice:true,maxTime:40});sim.events=[];a.sp=100;a.ready.ultimate=0;C.cast(sim,a,'ultimate');return {a,targets,sim};}
test('every supported engine effect has an explicit visual profile; every style is selectable',()=>{
 assert.equal(Object.keys(C.EFFECTS).length,62);assert.deepEqual(Object.keys(C.EFFECTS).filter(k=>!V.profiles[k]),[]);assert.equal(new Set(C.FX_TYPES).size,C.FX_TYPES.length);
 for(const [kind,p]of Object.entries(V.profiles)){assert.ok(p.motion&&p.icon&&p.family,kind);assert.ok(C.FX_TYPES.includes(p.style),kind);assert.match(p.color,/^#[a-f0-9]{6}$/);}
 assert.equal(V.resolve({kind:'stun',status:'빙결'}).style,'빙결 감옥');assert.equal(V.resolve({kind:'stun',status:'독'}).style,'기절 별무리');assert.equal(V.resolve({kind:'dot',status:'화상'}).style,'화상 불씨');assert.notEqual(V.resolve({kind:'buff',stat:'공격력'}).icon,V.resolve({kind:'buff',stat:'방어력'}).icon);
});
test('visual metadata preserves fifteen endpoint-growth battle outcomes exactly',()=>{
 const fixtures=require('./fixtures/endpoint-growth-combat-baseline.json');for(const f of fixtures)assert.deepEqual(C.run(C.reference(f.level,f.allyElements,f.generation),C.reference(f.enemyLevel,f.enemyElements,f.generation),f.options),f.expected);
});
test('Worker source includes the visual catalog and runs without DOM or require',()=>{
 const sandbox={};vm.createContext(sandbox);for(const n of ['catalog','visual-catalog','core'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../www/combat/'+n+'.js'),'utf8'),sandbox);assert.equal(Object.keys(sandbox.GGMCombat.Visuals.profiles).length,62);assert.equal(sandbox.GGMCombat.run(sandbox.GGMCombat.reference(),sandbox.GGMCombat.reference(),{seed:7}).damage,C.run(C.reference(),C.reference(),{seed:7}).damage);
});
test('multi and scatter expose real hit indices; chain exposes each actual previous target',()=>{
 for(const kind of ['multi','scatter','chain']){
  const {a,sim}=cast([C.defaultEffect(kind,{target:'enemy',value:50,hits:3})],3),hits=sim.events.filter(e=>e.type==='damage'&&e.visual?.kind===kind);assert.equal(hits.length,3,kind);assert.deepEqual(hits.map(e=>e.visual.hitIndex),[0,1,2]);
  if(kind==='chain'){assert.equal(hits[0].origin,a);assert.equal(hits[1].origin,hits[0].target);assert.equal(hits[2].origin,hits[1].target);assert.equal(new Set(hits.map(e=>e.target)).size,3);}
 }
});
test('delayed damage separates preparation from firing and periodic damage retains its state flavour',()=>{
 const {sim}=cast([C.defaultEffect('delayed',{target:'enemy',value:50,delay:.4}),C.defaultEffect('dot',{target:'enemy',status:'화상',value:20,interval:.3,duration:1})]);
 assert.ok(sim.events.some(e=>e.type==='effect'&&e.visual.kind==='delayed'&&e.visual.phase==='prepare'));assert.equal(sim.events.some(e=>e.type==='damage'&&e.delayed),false);
 const events=[];for(let i=0;i<5;i++)events.push(...C.step(sim,false));assert.ok(events.some(e=>e.type==='damage'&&e.delayed&&e.visual.kind==='delayed'&&e.visual.phase==='hit'));assert.ok(events.some(e=>e.type==='damage'&&e.periodic&&e.visual.status==='화상'&&e.visual.phase==='tick'));
});
test('lifesteal return originates from the damaged enemy; missed/failed conditional effects do not fire visual effects',()=>{
 const a=unit(kit([{type:'lifesteal',target:'enemy',value:1.5,duration:3,chance:100,condition:'always',stacks:1}]),{hp:5000}),b=unit(kit()),sim=C.create([a],[b],{seed:3,practice:true});sim.events=[];a.sp=100;a.ready.ultimate=0;C.cast(sim,a,'ultimate');const h=sim.events.find(e=>e.type==='heal');assert.ok(h);assert.equal(h.visual.kind,'lifesteal');assert.equal(h.visual.origin,b);
 const failed=cast([C.defaultEffect('buff',{target:'self',condition:'self_low',threshold:1})]);assert.equal(failed.sim.events.some(e=>e.type==='effect'),false);
});
function boot(){const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>{if(!/Could not parse CSS|Not implemented:/.test(e.message))errors.push(e.detail||e);});const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'../www/index.html'),'utf8'),{url:'https://localhost/?builtin=1',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){w.fetch=()=>Promise.reject(Error('offline'));w.matchMedia=()=>({matches:false,addListener(){},addEventListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}};w.confirm=()=>true;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollTo=()=>{};w.URL.createObjectURL=()=>{throw Error('fallback')};w.animations=[];w.HTMLElement.prototype.animate=function(frames,options){w.animations.push({el:this,frames,options});return {onfinish:null}};w.HTMLElement.prototype.getBoundingClientRect=function(){if(this.matches(".au-art,.v2-dummy-art,.en-img,.shape"))return {left:0,top:0,width:0,height:0};const i=+(this.id?.match(/\d+/)?.[0]||0),enemy=this.classList.contains('eu'),ally=this.classList.contains('au');return {left:enemy?40+i*100:ally?30+i*110:0,top:enemy?70:ally?500:0,width:enemy||ally?80:480,height:enemy||ally?100:700}};}});return {dom,w:dom.window,errors};}
test('actual semantic renderer, persisted states and full-skill previews',async t=>{
 const {dom,w,errors}=boot();t.after(()=>dom.window.close());await wait(30);w.eval('P().settings.stamina=false;P().squad=[G.chars[0].id];P().owned[G.chars[0].id]={lv:1,dup:0,wlv:0,exp:0};v2OpenPractice()');await w.eval('v2StartPractice()');w.eval('clearInterval(B.timer);B.auto=false;');
 await t.test('battle effects and cut-ins mount inside the visible overlay, never the lobby button',()=>{
  const battle=w.document.querySelector('#ov > .bt');battle.style.setProperty('--e1','#ff5a5a');battle.style.setProperty('--e3','#4fa3ff');assert.ok(battle.classList.contains('v2-practice'));const decoy=w.document.createElement('div');decoy.className='lb-banner';decoy.innerHTML='<div class="bt"></div>';w.document.body.prepend(decoy);
  w.eval('GGMVFX.clear();GGMVFX.proc({source:B.allies[0],target:B.enemies[0],visual:{kind:"shield"}});P().skillCut="small";window.smallCutOK=skillCut(G.chars[0],"작은 컷인",false);');assert.equal(w.smallCutOK,true);assert.ok(battle.querySelector('.v3-shield'));assert.ok(battle.querySelector('.scut.v4-small-cut'));assert.equal(decoy.querySelector('.scut,.v2-fx'),null);assert.notEqual(w.eval('GGMVFX.resolveColor("var(--e1)",document.querySelector("#ov > .bt"))'),w.eval('GGMVFX.resolveColor("var(--e3)",document.querySelector("#ov > .bt"))'));battle.querySelector('.scut').remove();decoy.remove();
 });
 await t.test('missing or throwing animation API still displays an opaque effect and cleans it',async()=>{
  w.eval('GGMVFX.clear();window.originalEffectAnimate=HTMLElement.prototype.animate;HTMLElement.prototype.animate=undefined;GGMVFX.proc({source:B.allies[0],target:B.enemies[0],visual:{kind:"shield"}})');let n=w.document.querySelector('#ov > .bt [data-animation-fallback=visible]');assert.ok(n);await wait(40);assert.ok(Number(n.style.opacity)>.5);w.eval('GGMVFX.clear();HTMLElement.prototype.animate=()=>{throw Error("disabled")};GGMVFX.proc({source:B.allies[0],target:B.enemies[0],visual:{kind:"buff",stat:"공격력"}})');assert.ok(w.document.querySelector('#ov > .bt [data-animation-fallback=visible]'));w.eval('GGMVFX.clear();HTMLElement.prototype.animate=()=>({playState:"finished",cancel(){}});GGMVFX.proc({source:B.allies[0],target:B.enemies[0],visual:{kind:"shield"}})');assert.ok(w.document.querySelector('#ov > .bt [data-animation-fallback=visible]'));w.eval('GGMVFX.clear();HTMLElement.prototype.animate=window.originalEffectAnimate');assert.equal(w.document.querySelector('#ov > .bt .v2-fx'),null);
 });
 await t.test('all 62 effects render a distinct semantic node without errors; particles stay bounded',()=>{
  for(const kind of Object.keys(C.EFFECTS)){w.eval('GGMVFX.clear()');w.eval(`GGMVFX.proc({source:B.allies[0],target:B.enemies[0],visual:{kind:${JSON.stringify(kind)},phase:'proc'}})`);assert.ok(w.document.querySelector('[data-effect-kind="'+kind+'"]'),kind);}
  w.eval('for(let i=0;i<200;i++)GGMVFX.proc({source:B.allies[0],target:B.enemies[0],visual:{kind:"buff",stat:"攻撃力"}})');assert.ok(w.document.querySelectorAll('.bt .v2-fx').length<=96);w.eval('GGMVFX.clear()');
 });
 await t.test('chain travel begins at the previous enemy; DOT ticks never relaunch a projectile',async()=>{
  w.eval('window.hitId=123;GGMVFX.damage({source:B.allies[0],target:B.enemies[0],slot:"active",visual:{id:hitId,kind:"chain",phase:"hit",hitIndex:0}});GGMVFX.damage({source:B.allies[0],origin:B.enemies[0],target:B.enemies[1],slot:"active",visual:{id:hitId,kind:"chain",phase:"hit",hitIndex:1}})');await wait(430);const beams=Array.from(w.document.querySelectorAll('.bt .v4-lightning-line'));assert.ok(beams.some(el=>el.style.left==='80px'));
  w.eval('GGMVFX.clear();GGMVFX.damage({source:B.allies[0],target:B.enemies[0],slot:"active",periodic:true,visual:{kind:"dot",status:"독",phase:"tick"}})');assert.equal(w.document.querySelector('.bt [data-projectile]'),null);assert.ok(w.document.querySelector('.v3-dot'));
 });
 await t.test('real status expiry, mark stacks and block charges drive badges; cleanup removes stale details',()=>{
  w.eval('GGMVFX.clear();window.u=B.allies[0];u.status=[{id:"mark",type:"mark",mark:"낙인",value:3,until:B.engine.time+3,slot:"active"},{id:"block",type:"block",remaining:2,value:1,until:B.engine.time+4,slot:"active"}];GGMVFX.sync()');assert.match(w.document.querySelector('[data-state-kind=mark]').textContent,/3/);assert.match(w.document.querySelector('[data-state-kind=block]').textContent,/2/);w.document.querySelector('[data-state-kind=mark]').click();assert.match(w.document.querySelector('.v3-status-detail').textContent,/낙인/);
  w.eval('u.status=[];GGMVFX.sync()');assert.equal(w.document.querySelector('.v3-status-detail'),null);assert.equal(w.document.querySelector('#u_a0 .v3-state-aura'),null);assert.equal(w.document.querySelector('#u_a0 [data-state-kind]'),null);
 });
 await t.test('status flavours use actual different geometry, and custom colours survive automatic style',()=>{
  assert.equal(w.eval('GGMVFX.semanticProfile({kind:"stun",status:"빙결"},"효과별 자동").shape'),'crystal');assert.equal(w.eval('GGMVFX.semanticProfile({kind:"stun",status:"빙결"},"화염구").style'),'화염구');assert.notEqual(w.eval('GGMVFX.semanticProfile({kind:"stun",status:"빙결"},"화염구").shape'),'crystal');
  const host=w.document.querySelector('#ov > .bt');for(const [status,shape]of [['화상','flame'],['감전','lightning'],['빙결','crystal'],['속박','chain']]){w.eval('GGMVFX.clear()');w.eval(`GGMVFX.proc({source:B.allies[0],target:B.enemies[0],visual:{kind:${JSON.stringify(status==='화상'||status==='감전'?'dot':'stun')},status:${JSON.stringify(status)}}})`);assert.ok(host.querySelector('[data-visual-shape='+shape+']'));}
  w.eval('B.allies[0].kit.active.fx="효과별 자동";B.allies[0].kit.active.colorMode="custom";B.allies[0].kit.active.color="#f783d2";GGMVFX.clear();GGMVFX.effect({source:B.allies[0],target:B.allies[0],slot:"active",fx:"효과별 자동",color:"#f783d2",visual:{kind:"buff",stat:"방어력"}})');assert.equal(host.querySelector('[data-effect-kind=buff]').style.getPropertyValue('--fx'),'#f783d2');
 });
 await t.test('SP support visibly targets the ultimate button instead of the action label',()=>{
  const button=w.document.querySelector('.skill');button.getBoundingClientRect=()=>({left:30,top:650,width:80,height:30});w.eval('GGMVFX.clear();GGMVFX.effect({source:B.allies[0],target:B.allies[0],slot:"active",fx:"효과별 자동",visual:{kind:"sp"}})');const particle=w.document.querySelector('[data-projectile]');assert.ok(particle);const an=w.animations.find(a=>a.el===particle);assert.match(an.frames.at(-1).transform,/translate\(0px,122px\)/);
 });
 await t.test('all selected skill effects preview; reopening preview discards earlier scheduled nodes',async()=>{
  w.eval('v2OpenEditor(G.chars[0].id,"active");V2EDIT.kit.active.fx="효과별 자동";V2EDIT.kit.active.effects=[GGMCombat.defaultEffect("damage"),GGMCombat.defaultEffect("buff",{target:"self"}),GGMCombat.defaultEffect("shield",{target:"self"})];v2DrawEditor()');const preview=w.document.querySelector('[data-preview-slot=active]');w.document.querySelector('[data-v2-slot=active] [data-act=v2fxpreview]').click();await wait(900);assert.match(preview.textContent,/보호막/);assert.ok(w.animations.some(a=>a.el.dataset.effectKind==='buff'));
  w.eval('GGMVFX.preview(document.querySelector("[data-preview-slot=active]"),{fx:"효과별 자동",effects:[{type:"delayed"}]});GGMVFX.preview(document.querySelector("[data-preview-slot=active]"),{fx:"효과별 자동",effects:[{type:"record"}]})');await wait(850);assert.doesNotMatch(preview.textContent,/지연 피해/);assert.match(preview.textContent,/수치 기록/);
 });
 assert.deepEqual(errors.map(e=>e.message),[]);
});
