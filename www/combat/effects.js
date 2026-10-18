/* Presentation and explicit arrival callbacks. Damage is committed by the shared combat core. */
(function(root){
'use strict';
const arrivals=new WeakMap(),pending=new Set(),fallbackFrames=new Set(),actorMotions=new Map(),castReady=new WeakMap();
const PROJECTILES=new Set(['마력탄','화살','총탄','화염구','빙결창','별빛 폭발']);
const motionMode=()=>{try{const mode=typeof P==='function'?P().battleMotion:'full';return ['full','reduced','system'].includes(mode)?mode:'full';}catch{return 'full';}};
const reduced=()=>motionMode()==='reduced'||motionMode()==='system'&&!!root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
// Android system animation scales can suppress compositor animations. Drive combat
// transforms ourselves there; the game's explicit motion preference remains authoritative.
const nativeFrames=()=>!!(root.Capacitor&&(root.Capacitor.isNativePlatform?.()||root.Capacitor.Plugins?.CapacitorHttp));
// Acceleration has a presentation floor: projectiles must remain readable at 3x.
const tempo=()=>typeof B!=='undefined'&&B?Math.max(.7,1/Math.sqrt(B.speed||1)):1;
const TIMING=Object.freeze({cutBig:1800,cutSmall:1450,cutReduced:1100,prepare:260});
const flight=fx=>(fx==='총탄'?440:fx==='화살'?620:fx==='빛줄기'?330:fx==='번개'||fx==='연쇄 전격'?300:700)*tempo();
function resolveColor(color,host){
 if(/^#[0-9a-f]{6}$/i.test(color||''))return color;
 const variable=String(color||'').match(/^var\((--[a-z0-9_-]+)\)$/i);
 if(variable&&host){const resolved=getComputedStyle(host).getPropertyValue(variable[1]).trim();if(/^#[0-9a-f]{3,8}$/i.test(resolved)||/^rgba?\([0-9.,%\s]+\)$/.test(resolved))return resolved;}
 return '#ef476f';
}
function node(host,cls,color,x,y){
 if(!host)return null;if(host.querySelectorAll('.v2-fx').length>=96){const decoration=host.querySelector('.v3-light-rain,.v3-chevron,.v3-shard,.v2-fx-spark,.v2-fx-tail');if(/v3-motif|v2-fx-projectile|v2-fx-beam|v4-/.test(cls)&&decoration)decoration.remove();else return null;}
 const d=document.createElement('i');d.className='v2-fx '+cls;d.style.cssText=`left:${x}px;top:${y}px`;d.style.setProperty('--fx',resolveColor(color,host));host.append(d);return d;
}
function visibleFrame(frames){return frames.find(f=>Number(f.opacity??1)>=.9&&f.offset!==0)||frames[Math.min(1,frames.length-1)];}
function manualMotion(el,frames,duration){
 let cancelled=false;
 if(typeof root.requestAnimationFrame!=='function')return;
 for(const key of ['opacity','transform','clipPath'])if(frames[0][key]!==undefined)el.style[key]=frames[0][key];
 const steps=frames.map((frame,i)=>({...frame,offset:frame.offset??i/(frames.length-1)})),started=Date.now();let id;
 const interpolate=(a,b,t)=>{if(typeof a==='number'&&typeof b==='number')return a+(b-a)*t;const av=String(a).match(/-?(?:\d*\.)?\d+/g)||[],bv=String(b).match(/-?(?:\d*\.)?\d+/g)||[];if(av.length!==bv.length)return t<.5?a:b;let i=0;return String(b).replace(/-?(?:\d*\.)?\d+/g,()=>{const v=Number(av[i])+(Number(bv[i])-Number(av[i]))*t;i++;return String(Math.round(v*1000)/1000);});};
 const tick=()=>{fallbackFrames.delete(id);if(cancelled||!el.isConnected)return;const progress=Math.min(1,(Date.now()-started)/duration);let index=steps.findIndex((s,i)=>i>0&&progress<=s.offset);if(index<1)index=steps.length-1;const a=steps[index-1],b=steps[index],fraction=Math.min(1,Math.max(0,(progress-a.offset)/Math.max(.001,b.offset-a.offset)));for(const key of ['opacity','transform','clipPath'])if(b[key]!==undefined)el.style[key]=interpolate(a[key]??b[key],b[key],fraction);if(progress<1){id=root.requestAnimationFrame(tick);fallbackFrames.add(id);}};
 id=root.requestAnimationFrame(tick);fallbackFrames.add(id);
 return ()=>{cancelled=true;root.cancelAnimationFrame?.(id);fallbackFrames.delete(id);};
}
function animate(d,frames,ms,extra={}){
 if(!d)return;const duration=reduced()?220:Math.max(180,ms);let animation;
 const fallback=()=>{if(animation){try{animation.cancel?.();}catch{}animation=null;}const frame=visibleFrame(frames);for(const [key,value]of Object.entries(frame))if(!['offset','easing','composite'].includes(key))d.style[key]=value;d.style.opacity='1';d.dataset.animationFallback='visible';manualMotion(d,frames,duration);};
 try{if(!nativeFrames()&&typeof d.animate==='function'){animation=d.animate(frames,{duration,easing:'linear',fill:'forwards',...extra});if(!animation||animation.playState==='finished')fallback();}else fallback();}catch{fallback();}
 // Keep the node for its full display window even if a platform instantly finishes animation.
 if(animation){animation.onfinish=()=>{if(Date.now()-started<duration*.6)fallback();else d.remove();};}
 const started=Date.now(),timer=setTimeout(()=>{d.remove();pending.delete(timer);},duration+80);pending.add(timer);
}

function position(host,el){
 // Aim at visible artwork, never the SP/skill controls below the card.
 const art=el.matches?.('.au,.eu')&&el.querySelector('.au-art,.v2-dummy-art,.en-img,.shape'),ar=art?.getBoundingClientRect?.();
 const r=ar?.width>0&&ar?.height>0?ar:el.getBoundingClientRect(),h=host.getBoundingClientRect();
 return{x:r.left+r.width/2-h.left,y:r.top+r.height*(ar?.width>0?.5:.4)-h.top};
}
function actorMotion(el,frames,duration){
 actorMotions.get(el)?.();const previous={transform:el.style.transform,zIndex:el.style.zIndex};let animation,cancelFallback;
 el.style.zIndex='30';
 const cleanup=()=>{animation?.cancel?.();cancelFallback?.();el.style.transform=previous.transform;el.style.zIndex=previous.zIndex;actorMotions.delete(el);};
 try{if(!nativeFrames())animation=el.animate?.(frames,{duration,easing:'linear',fill:'both'});if(!animation||animation.playState==='finished'){animation?.cancel?.();animation=null;cancelFallback=manualMotion(el,frames,duration);}}catch{cancelFallback=manualMotion(el,frames,duration);}
 const timer=setTimeout(()=>{pending.delete(timer);cleanup();},duration+20);pending.add(timer);
 actorMotions.set(el,()=>{clearTimeout(timer);pending.delete(timer);cleanup();});
}
function preparation(ev){return reduced()||ev.periodic||ev.delayed||ev.visual?.phase==='tick'||ev.visual?.phase==='return'?0:Math.max(0,(castReady.get(ev.source)||0)-Date.now());}
function impact(host,z,fx,color){
 if(!host?.isConnected)return;
 const ms=580*tempo(),heal=fx==='회복 광휘',shield=fx==='보호막';
 const ring=node(host,'v2-fx-ring'+(shield?' v2-fx-shield':''),color,z.x,z.y);
 animate(ring,[{transform:'translate(-50%,-50%) scale(.15)',opacity:1},{transform:'translate(-50%,-50%) scale(1.4)',opacity:0}],ms);
 if(reduced())return;
 if(fx==='참격'){
  for(let i=0;i<2;i++)animate(node(host,'v2-fx-slash',color,z.x,z.y),[{transform:`translate(-50%,-50%) rotate(${i?35:-35}deg) scaleX(.1)`,opacity:1},{transform:`translate(-50%,-50%) rotate(${i?35:-35}deg) scaleX(1.3)`,opacity:0}],ms);
 }else if(fx==='번개'){
  animate(node(host,'v2-fx-lightning',color,z.x,z.y-38),[{transform:'translate(-50%,-50%) scaleY(.1)',opacity:1},{transform:'translate(-50%,-50%) scaleY(1)',opacity:0}],ms);
 }
 const n=fx==='별빛 폭발'?8:shield?4:6;
 for(let i=0;i<n;i++){
  const a=i*2*Math.PI/n,r=heal?24:fx==='타격 파동'?48:34;
  const particle=node(host,heal?'v2-fx-heal':fx==='별빛 폭발'?'v2-fx-star':'v2-fx-spark',color,z.x,z.y);
  if(particle&&heal)particle.textContent='+';
  animate(particle,[{transform:'translate(-50%,-50%) scale(.4)',opacity:1},{transform:`translate(calc(-50% + ${Math.cos(a)*r}px),calc(-50% + ${heal?-54:Math.sin(a)*r}px)) rotate(100deg) scale(${heal?1:.1})`,opacity:0}],ms+(heal?180:0));
 }
}
function launch(host,a,z,fx,color){
 if(!host||!a||!z||host.querySelectorAll('.v2-fx').length>=96)return 0;
 if(reduced()){impact(host,z,fx,color);return 0;}
 const dx=z.x-a.x,dy=z.y-a.y,angle=Math.atan2(dy,dx)*180/Math.PI;
 let delay=0;
 if(fx==='번개'||fx==='연쇄 전격'){
  delay=flight(fx);const bolt=node(host,'v4-lightning-line',color,a.x,a.y),length=Math.max(1,Math.hypot(dx,dy));if(bolt){const points=`0,20 ${length*.16},8 ${length*.32},30 ${length*.51},9 ${length*.7},31 ${length*.86},12 ${length},20`;bolt.style.cssText+=`;width:${length}px;height:40px;transform-origin:0 20px`;bolt.innerHTML=`<svg viewBox="0 0 ${length} 40" preserveAspectRatio="none"><polyline class="v4-bolt-edge" points="${points}"/><polyline class="v4-bolt-core" points="${points}"/></svg>`;animate(bolt,[{transform:`translateY(-20px) rotate(${angle}deg)`,opacity:1},{transform:`translateY(-20px) rotate(${angle}deg)`,opacity:.55,offset:.35},{transform:`translateY(-20px) rotate(${angle}deg)`,opacity:1,offset:.6},{transform:`translateY(-20px) rotate(${angle}deg)`,opacity:0}],520*tempo());}
 }else if(PROJECTILES.has(fx)){
  delay=flight(fx);
  const shape={'마력탄':'orb','화살':'arrow','총탄':'bullet','화염구':'fire','빙결창':'ice','별빛 폭발':'star'}[fx];
  const d=node(host,'v2-fx-projectile v2-fx-'+shape,color,a.x,a.y);
  if(d){d.dataset.projectile=fx;d.style.setProperty('--angle',angle+'deg');}
  const arc=fx==='화염구'?-32:fx==='별빛 폭발'?-24:0;
  animate(d,[{transform:`translate(0,0) rotate(${angle}deg)`,opacity:1},{transform:`translate(${dx*.5}px,${dy*.5+arc}px) rotate(${angle}deg)`,opacity:1,offset:.5},{transform:`translate(${dx}px,${dy}px) rotate(${angle}deg)`,opacity:1}],delay,{easing:'linear'});
  // A short moving tail follows the same path, rather than drawing a line across the arena.
  const tail=node(host,'v2-fx-tail',color,a.x,a.y);
  animate(tail,[{transform:`translate(0,0) rotate(${angle}deg) scaleX(.3)`,opacity:0},{transform:`translate(${dx*.5}px,${dy*.5+arc}px) rotate(${angle}deg)`,opacity:.7,offset:.5},{transform:`translate(${dx}px,${dy}px) rotate(${angle}deg) scaleX(.2)`,opacity:0}],delay,{easing:'linear'});
 }else if(fx==='빛줄기'){
  delay=flight(fx);const beam=node(host,'v2-fx-beam',color,a.x,a.y);
  if(beam)beam.style.width=Math.hypot(dx,dy)+'px';
  animate(beam,[{transform:`rotate(${angle}deg) scaleX(0)`,opacity:1},{transform:`rotate(${angle}deg) scaleX(1)`,opacity:1,offset:.4},{transform:`rotate(${angle}deg) scaleX(1) scaleY(0)`,opacity:0}],550*tempo());
 }else if(fx==='번개')delay=100*tempo();
 const battle=typeof B!=='undefined'?B:null,previewToken=host.dataset.previewToken;
 const timer=setTimeout(()=>{pending.delete(timer);if(battle&&B!==battle||previewToken&&host.dataset.previewToken!==previewToken)return;impact(host,z,fx,color);},delay);pending.add(timer);
 return delay;
}
function remember(source,target,delay,slot){let map=arrivals.get(source);if(!map){map=new WeakMap();arrivals.set(source,map);}map.set(target,{at:Date.now()+delay,stamp:slot?source.lastCast?.[slot]:null,slot});}
function remaining(source,target){return Math.max(0,(arrivals.get(source)?.get(target)?.at||0)-Date.now());}
function hasArrival(source,target,slot){const a=arrivals.get(source)?.get(target);return !!a&&a.slot===slot&&a.stamp===source.lastCast?.[slot];}

function impactUnit(u,fx,color){if(typeof B==='undefined'||!B||document.hidden)return;const host=document.querySelector('#ov > .bt'),el=uel(u);if(host&&el)attackImpact(host,position(host,el),{style:fx,color,kind:'damage',family:'attack'},{});}
function cast(ev){
 if(typeof B==='undefined'||!B||document.hidden)return;
 const host=document.querySelector('#ov > .bt'),el=uel(ev.source);if(!host||!el)return;
 const z=position(host,el),d=node(host,'v2-fx-cast v5-caster-ring',ev.color,z.x,z.y);
 castReady.set(ev.source,Date.now()+(reduced()?0:TIMING.prepare*tempo()));
 animate(d,[{transform:'translate(-50%,-50%) scale(.65)',opacity:1},{transform:'translate(-50%,-50%) scale(1.2)',opacity:1,offset:.3},{transform:'translate(-50%,-50%) scale(1.3)',opacity:0}],1100*tempo());
 const label=node(host,'v5-caster-label',ev.color,z.x,z.y-58);
 if(label){label.textContent=[ev.source.name||ev.source.c?.name,ev.name||ev.source.kit?.[ev.slot]?.name].filter(Boolean).join(' · ');label.dataset.caster=String(ev.source.slot);}
 animate(label,[{transform:'translate(-50%,8px)',opacity:0},{transform:'translate(-50%,0px)',opacity:1,offset:.12},{transform:'translate(-50%,0px)',opacity:1,offset:.8},{transform:'translate(-50%,-8px)',opacity:0}],1400*tempo());
}


function ranged(u){return GGMCombat.isRanged(u);}
const impactFrames=new Set(),meleeGroups=new WeakMap();
function liveTimeline(duration,frame,done){
 const battle=B;let elapsed=0,last=Date.now(),raf,cancelled=false;
 const cancel=()=>{cancelled=true;root.cancelAnimationFrame?.(raf);impactFrames.delete(cancel);};impactFrames.add(cancel);
 const tick=()=>{
  if(cancelled)return;
  if(B!==battle||battle.over||battle.ending){cancel();return;}
  const now=Date.now(),dt=Math.min(80,now-last);last=now;
  if(!battle.paused&&!battle.presentationBusy&&!document.hidden)elapsed+=dt*(battle.speed||1)/GGMCombat.IMPACT.wallPerSecond;
  const progress=Math.min(1,elapsed/Math.max(.001,duration));frame(progress,elapsed);
  if(progress>=1){cancel();done?.();}else raf=root.requestAnimationFrame(tick);
 };raf=root.requestAnimationFrame(tick);return cancel;
}
function intent(ev,onLand){
 const ctx=context(ev);if(!ctx){onLand();return;}
 const p=ev.plan,host=ctx.host,a=ev.source,t=ev.target,source=ev.visual?.flightOrigin||a,startEl=uel(source)||ctx.a.el;
 const base=position(host,startEl),end=()=>position(host,uel(t)||ctx.z.el),color=chosenColor(a.kit?.[ev.slot]||{})||ECOL[a.elem]||'#edf6ff';
 if(p.mode==='melee'&&!reduced()){
  const startMelee=()=>{
   if(a.hp<=0)return;
   const old=meleeGroups.get(a);if(old?.group===p.group)return;old?.cancel();
   const el=uel(a);if(!el)return;
   const transform=el.style.transform,zIndex=el.style.zIndex,origin=position(host,el),contact=p.duration-p.startDelay,windup=p.windup-p.startDelay,hold=GGMCombat.IMPACT.gap*Math.max(0,p.total-1),overall=contact+hold+.24;
   el.style.zIndex='30';let stop;
   const cleanup=()=>{el.style.transform=transform;el.style.zIndex=zIndex;delete el.dataset.contactProgress;meleeGroups.delete(a);};
   const cancel=()=>{stop?.();cleanup();};meleeGroups.set(a,{group:p.group,cancel});
   stop=liveTimeline(overall,(_,time)=>{
    let q=time<=contact?Math.max(0,Math.min(1,(time-windup)/Math.max(.001,contact-windup))):time<=contact+hold?1:Math.max(0,1-(time-contact-hold)/.24);
    const eased=q*q*(3-2*q),z=end();el.dataset.contactProgress=String(q);el.style.transform=`${transform} translate(${(z.x-origin.x)*eased}px,${(z.y-origin.y)*eased}px) scale(${1+.06*eased})`;
   },cleanup);
  };
  if(p.startDelay>0)liveTimeline(p.startDelay,()=>{},startMelee);else startMelee();
 }
 let projectile;
 if(p.mode==='projectile'){
  const cls={'마력탄':'orb','화살':'arrow','총탄':'bullet','화염구':'fire','빙결창':'ice','별빛 폭발':'star'}[p.transport]||'orb';
  projectile=node(host,'v2-fx-projectile v2-fx-'+cls,color,base.x,base.y);
  if(projectile){projectile.style.margin='0';projectile.style.zIndex='40';projectile.dataset.projectile=p.transport;projectile.dataset.intentId=ev.id;projectile.dataset.flightBend=p.curve;projectile.style.opacity='0';}
 }
 liveTimeline(p.duration,(_,time)=>{
  if(!projectile)return;
  const q=Math.max(0,Math.min(1,(time-p.windup)/Math.max(.001,p.duration-p.windup))),z=end(),dx=z.x-base.x,dy=z.y-base.y,len=Math.max(1,Math.hypot(dx,dy)),bend=Math.sin(Math.PI*q)*p.curve;
  const x=dx*q-dy/len*bend,y=dy*q+dx/len*bend,db=Math.PI*Math.cos(Math.PI*q)*p.curve,angle=Math.atan2(dy+dx/len*db,dx-dy/len*db)*180/Math.PI;
  projectile.style.opacity=time>=p.windup?'1':'0';projectile.style.transform=`translate(${x}px,${y}px) translate(-50%,-50%) rotate(${angle}deg)`;
  projectile.dataset.travelProgress=q;projectile.dataset.targetX=z.x;projectile.dataset.targetY=z.y;
 },()=>{projectile?.remove();onLand();});
}
function basic(a,t){
 if(typeof B==='undefined'||!B||document.hidden||!a||!t||a.side===t.side)return 0;
 const host=document.querySelector('#ov > .bt'),ae=uel(a),te=uel(t);if(!host||!ae||!te)return 0;
 const start=position(host,ae),end=position(host,te),color=ECOL[a.elem]||'#edf6ff';
 if(ranged(a)){
  const text=[a.c?.weapon?.name,a.c?.weapon?.desc,a.c?.skillConcept,a.c?.concept,a.c?.profile].filter(v=>typeof v==='string').join(' ');
  return launch(host,start,end,/총|rifle|sniper/i.test(text)?'총탄':/활|궁수|archer/i.test(text)?'화살':'마력탄',color);
 }
 if(reduced())return 0;
 const dx=end.x-start.x,dy=end.y-start.y,tilt=dx>=0?6:-6,duration=900*tempo();
 actorMotion(ae,[{transform:'translate(0px,0px) rotate(0deg) scale(1)'},{transform:`translate(${-dx*.04}px,${-dy*.04}px) rotate(${-tilt}deg) scale(.96)`,offset:.14},{transform:`translate(${dx*.78}px,${dy*.78}px) rotate(${tilt}deg) scale(1.1)`,offset:.42},{transform:`translate(${dx*.78}px,${dy*.78}px) rotate(${tilt}deg) scale(1.1)`,offset:.53},{transform:'translate(0px,0px) rotate(0deg) scale(1)'}],duration);
 return duration*.42;
}

function clear(){for(const cancel of [...impactFrames])cancel();if(typeof B!=='undefined'&&B)for(const u of [...B.allies,...B.enemies])meleeGroups.get(u)?.cancel();for(const cancel of [...actorMotions.values()])cancel();for(const frame of fallbackFrames)root.cancelAnimationFrame?.(frame);fallbackFrames.clear();for(const timer of pending)clearTimeout(timer);pending.clear();document.querySelectorAll('.v2-fx,.v3-state-aura,.v3-status-strip,.v3-status-detail').forEach(d=>d.remove());}
// Semantic overlays are independent of damage math and work in previews and battles.
const V=root.GGMVisuals,areaSeen=new WeakMap(),combos=new WeakMap();
const GLYPHS={
 shield:'<path d="M50 8 83 22V49Q82 76 50 92 18 76 17 49V22Z"/>',
 heal:'<path d="M42 16h16v26h26v16H58v26H42V58H16V42h26Z"/>',
 buff:'<path d="m18 58 17-20 15 18 16-20 16 20M18 78l17-20 15 18 16-20 16 20"/>',
 debuff:'<path d="m18 22 17 20 15-18 16 20 16-20M18 42l17 20 15-18 16 20 16-20"/>',
 focus:'<circle cx="50" cy="50" r="25"/><path d="M50 2v30m0 36v30M2 50h30m36 0h30"/>',
 clock:'<circle cx="50" cy="50" r="33"/><path d="M50 23v28l23 14M16 15l-7 20h20"/>',
 mark:'<path d="m50 4 39 46-39 46L11 50ZM50 22l23 28-23 28-23-28Z"/><circle cx="50" cy="50" r="5"/>',
 record:'<path d="M22 14h56v72H22ZM33 29h34M33 43h34M33 57h25M33 71h18"/>',
 wings:'<path d="M50 71Q9 67 6 23L36 42 18 12Q48 22 50 57 52 22 82 12L64 42 94 23Q91 67 50 71ZM40 78h20"/>',
 seal:'<circle cx="50" cy="50" r="34"/><path d="m25 75 50-50M35 66l15-38 15 38M40 54h20"/>',
 heart:'<path d="M50 83 17 49C-3 14 40 6 50 30 60 6 103 14 83 49Z"/>',
 prism:'<path d="m50 5 37 33-14 45H27L13 38ZM13 38h74M27 83l23-78 23 78M13 38l37 45 37-45"/>',
 spiral:'<path d="M53 51c-15-17 22-34 24-7 3 33-54 39-57 2C15-5 101 1 92 57"/>',
 chain:'<path d="m15 55 18-18q14-14 26 0t0 25L42 79q-14 14-26 0t0-24Zm29-32L61 6q14-14 26 0t0 24L70 47q-14 14-26 0t0-24ZM35 58l29-31"/>',
 crystal:'<path d="m50 0 24 25 9 51-33 24L17 76l9-51ZM50 0v100M26 25l48 0M17 76l66 0M26 25l24 51 24-51"/>',
 star:'<path d="m50 3 12 32 35 2-27 22 9 35-29-20-29 20 9-35L3 37l35-2Z"/>',
 sword:'<path d="M76 5 91 9 88 25 43 69 30 56ZM23 48l29 29M35 65 14 86M8 80l12 12"/>',
 flame:'<path d="M50 4Q75 29 65 47 81 35 84 58 92 87 51 96 10 86 17 59 21 42 36 30 29 61 50 4ZM50 56Q68 78 50 89 33 78 50 56Z"/>',
 lightning:'<path d="M47 3H82L58 37H79L21 97 37 55H16Z"/>',
 rune:'<circle cx="50" cy="50" r="42"/><path d="m50 12 33 57H17ZM50 88 17 31h66Z"/>'
};
const FAMILIES={pierce:'prism',combo:'sword',scatter:'star',chain:'chain',delayed:'clock',detonate:'mark',dot:'spiral',weapon:'sword',heal:'heal',regen:'heal',support:'rune',drain:'heart',overheal:'shield',shield:'shield',reduction:'shield',block:'shield',invincible:'rune',survive:'wings',revive:'wings',buff:'buff',debuff:'debuff',cleanse:'star',dispel:'prism',shatter:'shield',immune:'rune',element:'prism',stun:'star',silence:'seal',noheal:'heal',confuse:'spiral',dodge:'spiral',taunt:'focus',focus:'focus',sp:'star',haste:'clock',slow:'clock',cooldown:'clock',cooldown_up:'clock',ready:'clock',nextcool:'clock',sacrifice:'heart',mark:'mark',consume:'mark',record:'record',mode:'rune',replace:'prism',follow:'chain',extra:'star'};
function semanticProfile(e,choice,color){
 const p=V.resolve(e,choice,color);
 if(!color){const styleColor={'화염구':'#ff6b35','빙결창':'#4cc9f0','번개':'#ffd166','연쇄 전격':'#ffd166','총탄':'#ffd166','화살':'#a7e765'}[p.style];if(styleColor)p.color=styleColor;}
 if(!PROJECTILES.has(p.style)&&!['빛줄기','타격 파동','번개','참격','회복 광휘','보호막'].includes(p.style)){
  const styled=Object.values(V.profiles).find(x=>x.style===p.style);if(styled)p.shape=FAMILIES[styled.family];
 }
 p.stateStyle=p.automatic&&(e.kind==='dot'||e.kind==='stun')?V.STATES[e.status]?.[0]:null;
 if(p.style==='빙결 감옥'||p.stateStyle==='빙결 감옥')p.shape='crystal';if(p.style==='속박 사슬'||p.stateStyle==='속박 사슬')p.shape='chain';if(p.style==='화상 불씨'||p.stateStyle==='화상 불씨')p.shape='flame';if(p.style==='감전 잔류'||p.stateStyle==='감전 잔류')p.shape='lightning';
 return p;
}
function motif(host,z,p,e={}){
 if(!p.automatic&&p.styleFamily)p={...p,family:p.styleFamily};
 if(!host?.isConnected)return;
 const tick=e.phase==='tick',ms=(tick?540:1050)*tempo(),size=p.family==='revive'?124:tick?46:92;
 const d=node(host,'v3-motif v3-'+p.family,p.color,z.x,z.y);if(!d)return;
 d.dataset.effectKind=p.kind;d.dataset.visualStyle=p.style;d.style.setProperty('--motif-size',size+'px');
 const shape=(V.ATTACK.has(p.kind)?p.shape:null)||(['dot','stun'].includes(p.kind)?p.shape:null)||FAMILIES[p.family]||'star';d.dataset.visualShape=shape;
 d.innerHTML='<svg viewBox="0 0 100 100" aria-hidden="true">'+GLYPHS[shape]+'</svg>';
 const glyph=document.createElement('b');glyph.textContent=p.icon;glyph.className='v4-effect-glyph';d.append(glyph);
 let frames=[{transform:'translate(-50%,-50%) scale(.45)',opacity:.85},{transform:'translate(-50%,-50%) scale(1)',opacity:1,offset:.18},{transform:'translate(-50%,-50%) scale(1.06)',opacity:1,offset:.75},{transform:'translate(-50%,-58%) scale(1.12)',opacity:0}];
 if(['consume','sacrifice','delayed'].includes(p.family))frames=[{transform:'translate(-50%,-50%) scale(1.5) rotate(-40deg)',opacity:0},{transform:'translate(-50%,-50%) scale(1) rotate(0deg)',opacity:1,offset:.25},{transform:'translate(-50%,-50%) scale(.05) rotate(80deg)',opacity:0}];
 if(['dispel','shatter'].includes(p.family))frames=[{transform:'translate(-50%,-50%) scale(.8)',opacity:1},{transform:'translate(-50%,-50%) scale(1.8) rotate(30deg)',opacity:0}];
 if(p.family==='dodge')frames=[{transform:'translate(-50%,-50%) skewX(-15deg)',opacity:.8},{transform:'translate(-100%,-50%) skewX(-15deg)',opacity:0}];
 if(p.family==='debuff'||p.family==='slow')frames=[{transform:'translate(-50%,-85%) scale(.8)',opacity:0},{transform:'translate(-50%,-50%) scale(1)',opacity:1,offset:.3},{transform:'translate(-50%,-10%) scale(.7)',opacity:0}];
 if(p.style==='빙결 감옥'||p.stateStyle==='빙결 감옥')frames=[{transform:'translate(-50%,-20%) scaleY(.1)',opacity:0},{transform:'translate(-50%,-50%) scaleY(1)',opacity:1,offset:.3},{transform:'translate(-50%,-50%) scale(1.1)',opacity:0}];
 if(p.style==='감전 잔류'||p.stateStyle==='감전 잔류')frames=[{transform:'translate(-50%,-50%)',opacity:0},{transform:'translate(-50%,-50%)',opacity:1,offset:.15},{transform:'translate(-45%,-50%)',opacity:.1,offset:.4},{transform:'translate(-55%,-50%)',opacity:1,offset:.55},{transform:'translate(-50%,-50%)',opacity:0}];
 if(frames.length===3&&frames[1].opacity===1)frames.splice(2,0,{...frames[1],offset:.75});
 animate(d,frames,ms);
 if(reduced()||host.querySelectorAll('.v2-fx').length>48)return;
 if(['revive','heal','regen','cleanse','mode'].includes(p.family)||p.style==='화상 불씨'||p.stateStyle==='화상 불씨'){
  for(let i=0;i<4;i++){const n=node(host,'v3-light-rain',p.color,z.x+(i-1.5)*18,z.y+(p.family==='cleanse'?-50:30));animate(n,[{transform:'scaleY(.2)',opacity:0},{transform:'translateY('+(p.family==='cleanse'?65:-75)+'px) scaleY(1)',opacity:1,offset:.6},{transform:'translateY('+(p.family==='cleanse'?85:-100)+'px)',opacity:0}],ms+70*i);}
 }
 if(['buff','debuff','haste','cooldown','cooldown_up','slow'].includes(p.family)){
  for(let i=0;i<3;i++){const n=node(host,'v3-chevron',p.color,z.x+(i-1)*18,z.y);const down=['debuff','cooldown_up','slow'].includes(p.family);if(n)n.style.rotate=down?'180deg':'0deg';animate(n,[{transform:'translate(-50%,0)',opacity:0},{transform:`translate(-50%,${down?40:-40}px)`,opacity:1,offset:.6},{transform:`translate(-50%,${down?65:-65}px)`,opacity:0}],ms);}
 }
 if(['shatter','dispel','detonate','consume'].includes(p.family)){
  for(let i=0;i<6;i++){const a=i*Math.PI/3,n=node(host,'v3-shard',p.color,z.x,z.y),inward=p.family==='consume';const far=`translate(${Math.cos(a)*50}px,${Math.sin(a)*50}px) rotate(${i*60}deg)`;animate(n,[{transform:inward?far:'scale(.3)',opacity:1},{transform:inward?'scale(.1)':far,opacity:0}],ms);}
 }
}
function attackImpact(host,z,p,e={}){
 const style=p.style||'타격 파동';let cls,svg;
 if(style==='참격'||(p.automatic?p.family:p.styleFamily)==='combo'){
  cls='v4-slash';svg='<svg viewBox="0 0 140 100"><path class="edge" d="M2 44 124 35 140 45 18 54Z"/><path class="core" d="M8 44 124 41 132 45 18 48Z"/></svg>';
 }else if(style==='빙결창'||p.stateStyle==='빙결 감옥'){
  cls='v4-ice-hit';svg='<svg viewBox="0 0 120 110"><path class="edge" d="m12 95 5-44 20 8 8-54 24 48 26-29-3 51 21 21-59 9Z"/><path class="core" d="M45 7 54 96 69 54M17 51l37 45 38-21"/></svg>';
 }else if(style==='화염구'){
  cls='v4-fire-hit';svg='<svg viewBox="0 0 120 120"><path class="edge" d="M61 3Q100 38 88 66 112 42 109 83 102 117 60 116 8 117 11 77 8 54 30 35 23 66 43 73 33 34 61 3Z"/><path class="core" d="M62 53Q89 81 75 103 34 120 37 89 45 72 62 53Z"/></svg>';
 }else if(style==='번개'||style==='연쇄 전격'||(p.automatic?p.family:p.styleFamily)==='chain'){
  cls='v4-shock-hit';svg='<svg viewBox="0 0 100 130"><path class="edge" d="M45 0H86L59 50H81L20 130 35 73H12Z"/><path class="core" d="m50 12-22 49h23l-17 44 35-46H50l20-47Z"/></svg>';
 }else{
  cls=style==='총탄'||style==='화살'?'v4-bullet-hit':'v4-force-hit';svg='<svg viewBox="0 0 120 120"><path class="edge" d="m60 1 9 32 28-20-13 30 35 8-33 15 22 29-34-12-11 36-13-34-31 19 16-34L1 59l34-12-20-29 32 16Z"/><path class="core" d="m60 25 11 24 25 10-26 12-10 25-11-26-26-11 26-10Z"/></svg>';
 }
 const d=node(host,'v4-impact '+cls,p.color,z.x,z.y);if(!d)return;d.innerHTML=svg;d.style.zIndex='40';d.dataset.impactStyle=cls;d.dataset.visualStyle=style;d.dataset.effectKind=p.kind;

 const angle=e.slashAngle??[-38,36,-62,62,-15,18][(e.hitIndex||0)%6];d.dataset.slashAngle=String(angle);
 const cut=(x,scale)=>`translate(-50%,-50%) rotate(${angle}deg) translateX(${x}px) scaleX(${scale})`;
 const frames=cls==='v4-slash'?[{transform:cut(-70,.25),opacity:0},{transform:cut(-10,1.2),opacity:1,offset:.2},{transform:cut(45,1.25),opacity:1,offset:.55},{transform:cut(95,.5),opacity:0}]:[{transform:'translate(-50%,-50%) scale(.35)',opacity:1},{transform:'translate(-50%,-50%) scale(1.05)',opacity:1,offset:.22},{transform:'translate(-50%,-50%) scale(1.15)',opacity:1,offset:.65},{transform:'translate(-50%,-50%) scale(1.3)',opacity:0}];
 animate(d,frames,(cls==='v4-slash'?240:e.phase==='tick'?460:780)*tempo());
}
function speedLines(cut,band,duration){
 const groups=[];
 for(const [side,edge]of ['top','bottom'].entries()){
  const strip=document.createElement('div');strip.className='v5-speed v5-speed-'+edge;strip.setAttribute('aria-hidden','true');
  const streak=document.createElement('div');streak.className='v5-speed-streak';strip.append(streak);band.append(strip);
  const lines=[];
  for(let i=0;i<12;i++){
   const line=document.createElement('i');line.className='v6-speedline';line.style.top=((i%6+.5)/6*100)+'%';line.style.height=(i%3+2)+'px';line.style.background=i%3?'#fff':'var(--ec)';streak.append(line);
   lines.push({el:line,period:210+(i%4)*35,phase:i*67,length:70+(i%5)*29});
  }
  groups.push({strip,lines,direction:side?-1:1});
 }
 const started=Date.now();let frame;
 const tick=()=>{
  fallbackFrames.delete(frame);if(!cut.isConnected||Date.now()-started>=duration)return;
  const elapsed=Date.now()-started,rush=elapsed+Math.max(0,elapsed-duration*.86)*2.4;
  for(const group of groups){const width=group.strip.clientWidth||root.innerWidth||390;for(const line of group.lines){
   const progress=((rush+line.phase)%line.period)/line.period,x=group.direction>0?progress*(width+line.length)-line.length:width-progress*(width+line.length);
   line.el.style.width=line.length+'px';line.el.style.transform=`translateX(${Math.round(x)}px)`;
  }}
  frame=root.requestAnimationFrame(tick);fallbackFrames.add(frame);
 };
 tick();
}
function cutIn(d,onComplete){
 const battle=typeof B!=='undefined'?B:null,small=d.classList.contains('v4-small-cut'),simple=reduced(),duration=simple?TIMING.cutReduced:small?TIMING.cutSmall:TIMING.cutBig;let finished=false;
 d.classList.add('v4-cut','v5-cut');d.dataset.duration=duration;d.dataset.motion=simple?'reduced':'full';d.dataset.renderer=nativeFrames()?'frames':'web';const host=d.parentElement;if(battle)host?.classList.add('v2-cut-playing');
 const motion=(el,frames)=>{if(!el)return;let animation;const fallback=()=>{animation?.cancel?.();manualMotion(el,frames,duration);};try{if(!nativeFrames())animation=el.animate?.(frames,{duration,fill:'both',easing:'linear'});if(!animation||animation.playState==='finished')fallback();else{const started=Date.now();animation.onfinish=()=>{if(Date.now()-started<duration*.6)fallback();};}}catch{fallback();}};
 // Instant dark backdrop; the band and portrait strike across it, rather than fading in.
 motion(d,simple?[{opacity:.3},{opacity:1,offset:.18},{opacity:1,offset:.85},{opacity:0}]:[{opacity:1},{opacity:1,offset:.98},{opacity:0}]);
 const fullClip='polygon(-20% 0%,120% 0%,120% 100%,-20% 100%)',band=d.querySelector('.scut-band');motion(band,simple?[{opacity:.3},{opacity:1,offset:.18},{opacity:1,offset:.85},{opacity:0}]:[{transform:'translateX(-115%) skewY(-7deg)',clipPath:fullClip,opacity:1},{transform:'translateX(3%) skewY(-7deg)',clipPath:fullClip,opacity:1,offset:.08},{transform:'translateX(0%) skewY(-7deg)',clipPath:fullClip,opacity:1,offset:.12},{transform:'translateX(0%) skewY(-7deg)',clipPath:fullClip,opacity:1,offset:.86},{transform:'translateX(-1%) skewY(-7deg)',clipPath:fullClip,opacity:1,offset:.885},{transform:'translateX(0%) skewY(-7deg)',clipPath:'polygon(35% 0%,120% 0%,120% 100%,15% 100%)',opacity:1,offset:.925},{transform:'translateX(3%) skewY(-7deg)',clipPath:'polygon(120% 0%,120% 0%,120% 100%,100% 100%)',opacity:1,offset:.985},{transform:'translateX(3%) skewY(-7deg)',clipPath:'polygon(120% 0%,120% 0%,120% 100%,120% 100%)',opacity:0}]);
 for(const el of d.querySelectorAll('.scut-img,.scut-st'))motion(el,simple?[{opacity:.5},{opacity:1,offset:.18},{opacity:1,offset:.85},{opacity:0}]:[{transform:'skewY(7deg) translateX(48%) scale(1.22)',opacity:1},{transform:'skewY(7deg) translateX(-2%) scale(1.08)',opacity:1,offset:.1},{transform:'skewY(7deg) translateX(0%) scale(1.05)',opacity:1,offset:.16},{transform:'skewY(7deg) translateX(-2%) scale(1.02)',opacity:1,offset:.86},{transform:'skewY(7deg) translateX(0%) scale(1.06)',opacity:1,offset:.895},{transform:'skewY(7deg) translateX(8%) scale(1.1)',opacity:1}]);
 motion(d.querySelector('.scut-t'),simple?[{opacity:.4},{opacity:1,offset:.18},{opacity:1,offset:.85},{opacity:0}]:[{transform:'translateX(-140px)',opacity:0},{transform:'translateX(8px)',opacity:1,offset:.12},{transform:'translateX(0px)',opacity:1,offset:.17},{transform:'translateX(0px)',opacity:1,offset:.84},{transform:'translateX(-8px)',opacity:1,offset:.875},{transform:'translateX(90px)',opacity:0,offset:.945},{transform:'translateX(90px)',opacity:0}]);
 if(!simple&&band){
  speedLines(d,band,duration);
  motion(d.querySelector('.scut-bg'),[{opacity:1},{opacity:1,offset:.88},{opacity:0,offset:.99},{opacity:0}]);
  for(const [index,strip]of [...band.querySelectorAll('.v5-speed')].entries()){
   const sign=index?1:-1;motion(strip,[{transform:'translateY(0px) scaleX(1)',opacity:1},{transform:'translateY(0px) scaleX(1)',opacity:1,offset:.87},{transform:`translateY(${sign*12}px) scaleX(1.07)`,opacity:1,offset:.915},{transform:`translateY(${sign*90}px) scaleX(1.15)`,opacity:0,offset:.985},{transform:`translateY(${sign*90}px) scaleX(1.15)`,opacity:0}]);
  }
  const sweep=document.createElement('div');sweep.className='v7-exit-sweep';d.append(sweep);const width=d.clientWidth||root.innerWidth||390;
  motion(sweep,[{transform:`translateX(${-width*.3}px) rotate(11deg)`,opacity:0},{transform:`translateX(${-width*.3}px) rotate(11deg)`,opacity:0,offset:.875},{transform:`translateX(${-width*.2}px) rotate(11deg)`,opacity:.95,offset:.89},{transform:`translateX(${width*1.3}px) rotate(11deg)`,opacity:.95,offset:.985},{transform:`translateX(${width*1.3}px) rotate(11deg)`,opacity:0}]);
  const flash=document.createElement('div');flash.className='v5-cut-impact';d.append(flash);
  motion(flash,[{opacity:0},{opacity:.8,offset:.08},{opacity:0,offset:.16},{opacity:0}]);
 }
 setTimeout(()=>{if(finished)return;finished=true;d.remove();if(!battle||B===battle)host?.classList.remove('v2-cut-playing');onComplete?.();},duration);
 return duration;
}

function later(host,delay,fn,battle=typeof B!=='undefined'?B:null,token){
 const timer=setTimeout(()=>{pending.delete(timer);if(!host?.isConnected||battle&&B!==battle||token&&host.dataset.previewToken!==token)return;fn();},Math.max(0,delay));pending.add(timer);
}
function route(host,a,z,p,e={},offset=0,token){
 // Selection of a shape never changes target or damage.
 let travel=0;
 if(e.phase!=='tick'&&e.phase!=='prepare'&&Math.hypot(z.x-a.x,z.y-a.y)>8){
  const transport=!p.automatic?(PROJECTILES.has(p.style)||['빛줄기','번개','연쇄 전격'].includes(p.style)?p.style:null):p.family==='chain'?'번개':p.family==='scatter'?'총탄':p.family==='drain'&&e.phase==='return'?'마력탄':PROJECTILES.has(p.style)||p.style==='빛줄기'?p.style:p.family==='pierce'?'빛줄기':['heal','regen','shield','sp','support','follow'].includes(p.family)?'마력탄':null;
  if(transport)travel=flight(transport);
  if(transport){const launchIt=()=>{const origin=a.el?position(host,a.el):a;if(z.el)Object.assign(z,position(host,z.el));launch(host,origin,z,transport,p.color);};if(offset)later(host,offset,launchIt,undefined,token);else launchIt();}
 }
 if(reduced()){offset=0;travel=0;}
 const delay=offset+travel;
 const draw=()=>{if(!V.ATTACK.has(p.kind)||['delayed','detonate'].includes(p.kind)||!p.automatic&&p.styleFamily&&!['combo','chain'].includes(p.styleFamily)&&!PROJECTILES.has(p.style))motif(host,z,p,e);if(V.ATTACK.has(p.kind))attackImpact(host,z,p,e);if(p.automatic&&(p.family==='detonate'||p.family==='delayed'&&e.phase==='hit'))impact(host,z,'별빛 폭발',p.color);};
 if(delay)later(host,delay,draw,undefined,token);else draw();
 return delay;
}
function context(ev){
 if(typeof B==='undefined'||!B||document.hidden)return null;
 const host=document.querySelector('#ov > .bt'),source=ev.origin||ev.visual?.origin||ev.source,a=source&&uel(source),t=ev.target&&uel(ev.target);if(!host||!a||!t)return null;
 return {host,a:{...position(host,a),el:a},z:{...position(host,t),el:t}};
}
function area(ev,ctx,p){
 if(!['enemies','allies','other_allies','same_element','same_faction','role_allies'].includes(ev.visual?.targetRule||ev.targetRule))return;
 let seen=areaSeen.get(B);if(!seen){seen=new Set();areaSeen.set(B,seen);}const key=[ev.source.side,ev.source.slot,ev.slot,ev.source.lastCast?.[ev.slot],p.kind].join(':');if(seen.has(key))return;if(seen.size>=512)seen.clear();seen.add(key);
 const units=ev.target.side==='a'?B.allies:B.enemies,points=units.filter(u=>u.hp>0).map(uel).filter(Boolean).map(el=>position(ctx.host,el));if(!points.length)return;
 const x=points.reduce((n,v)=>n+v.x,0)/points.length,y=points.reduce((n,v)=>n+v.y,0)/points.length,n=node(ctx.host,'v3-area-field',p.color,x,y);
 if(n)n.style.width=Math.min(500,Math.max(...points.map(v=>v.x))-Math.min(...points.map(v=>v.x))+100)+'px';
 animate(n,[{transform:'translate(-50%,-50%) scale(.4)',opacity:0},{transform:'translate(-50%,-50%) scale(1)',opacity:.4,offset:.4},{transform:'translate(-50%,-50%) scale(1.2)',opacity:0}],700*tempo());
}
function chosenColor(s={},fallback){return s.colorMode==='effect'||!s.colorMode&&s.fx==='효과별 자동'?undefined:(fallback||s.color);}
function semanticEffect(ev){
 const ctx=context(ev);if(!ctx)return 0;const e=ev.visual||ev,p=semanticProfile(e,ev.fx,chosenColor(ev.source.kit?.[ev.slot],ev.color));area(ev,ctx,p);
 if(['heal','heal_percent','revive'].includes(e.kind))return 0;
 if(e.kind==='sacrifice')ctx.z=ctx.a;
 if(V.ATTACK.has(e.kind)){
  // Attack delivery is driven by actual damage events, including every hit and retarget.
  if(e.kind!=='delayed')return 0;
  motif(ctx.host,ctx.z,p,{phase:'prepare'});return 0;
 }
 if(e.kind==='lifesteal'&&!ev.source.kit?.[ev.slot]?.effects?.some(x=>x.type==='lifesteal'&&x.studio))return 0;
 const z=e.kind==='sp'&&ev.target.side==='a'?spPosition(ctx.host,ev.target,ctx.z):ctx.z;
 const delay=route(ctx.host,ctx.a,z,p,e,preparation(ev));remember(ev.source,ev.target,delay,ev.slot);return delay;
}
function spPosition(host,u,fallback){const el=uel(u)?.querySelector('.skill');return el?position(host,el):fallback;}
function semanticDamage(ev){
 const ctx=context(ev);if(!ctx)return 0;
 const e=ev.visual||{kind:ev.periodic?'dot':ev.delayed?'delayed':'damage',phase:ev.periodic?'tick':'hit'},s=ev.source.kit?.[ev.slot]||{},p=semanticProfile(e,e.intentStyle||s.fx,chosenColor(s));
 if(ev.impact||e.landed){attackImpact(ctx.host,ctx.z,p,e);return 0;}
 if(s.fx==='효과별 자동'&&e.kind==='damage'&&ev.source.c){const theme=GGMCombat.skillVisual(ev.source.c,ev.slot,{type:'damage'});p.style=theme.fx;if(s.colorMode!=='custom')p.color=theme.color;}
 if(e.kind==='follow'&&p.automatic)p.style='빛줄기';
 if(e.kind==='lifesteal'){Object.assign(p,semanticProfile({kind:'damage'},s.fx,s.color));}
 let offset=preparation(ev);
 if(['multi','scatter','chain'].includes(e.kind)){
  let seq=combos.get(ev.source);if(!seq){seq=new Map();combos.set(ev.source,seq);}const key=ev.slot+':'+e.id;
  const previous=seq.get(key)||0;offset=Math.max(offset,e.kind==='chain'?previous:(e.hitIndex||0)*140*tempo());
  const delay=route(ctx.host,ctx.a,ctx.z,p,e,offset);seq.set(key,delay+70*tempo());if(seq.size>64)seq.delete(seq.keys().next().value);remember(ev.source,ev.target,delay,ev.slot);return delay;
 }
 const delay=route(ctx.host,ctx.a,ctx.z,p,e,offset);remember(ev.source,ev.target,delay,ev.slot);return delay;
}
function semanticHeal(ev){
 if(!ev.visual)return remaining(ev.source,ev.target);
 const ctx=context(ev);if(!ctx)return 0;
 const s=ev.source.kit?.[ev.slot]||{},p=semanticProfile(ev.visual,s.fx,chosenColor(s));if(ev.visual.landed){motif(ctx.host,ctx.z,p,ev.visual);return 0;}const delay=route(ctx.host,ctx.a,ctx.z,p,ev.visual,preparation(ev));remember(ev.source,ev.target,delay);return delay;
}
function proc(ev){const ctx=context(ev);if(ctx)motif(ctx.host,ctx.z,semanticProfile(ev.visual||{kind:'shield'},'효과별 자동'),ev.visual);}
function statusModel(u,sim){
 const list=[];
 for(const s of u.status||[]){if(s.until<=sim.time)continue;const p=V.resolve({kind:s.type,status:s.status,stat:s.stat});const remaining=Math.round(Math.max(0,s.until-sim.time)*100)/100,permanent=s.until>=sim.maxTime&&s.slot==='passive'&&s.source?.kit?.passive?.trigger==='always';
  const count=s.type==='mark'?s.value:['block','survive','basic','nextcool'].includes(s.type)?s.remaining:null;
  const value=s.type==='record'||s.type==='shield'?Math.round(s.value):null;
  const name=(typeof GGMCombat!=='undefined'?GGMCombat.EFFECTS[s.type]?.[0]:s.type)||s.type;
  list.push({key:s.id,kind:s.type,style:p.style,color:p.color,icon:p.icon,title:name+(s.mark?' · '+s.mark:'')+(s.stat?' · '+s.stat:'')+(count!==null?' · '+count+'회/중첩':'')+(value!==null?' · '+value:'')+' · '+(permanent?'상시':remaining+'초'),label:count!==null?count:value!==null?value:permanent?'∞':remaining+'s'});
 }
 for(const job of sim.pending||[])if(job.target===u)list.push({key:'pending:'+job.visual?.id,kind:'delayed',style:'시한 폭탄',color:'#ffad66',icon:'◷',title:'지연 피해 · '+Math.round(Math.max(0,job.at-sim.time)*100)/100+'초 후',label:Math.round(Math.max(0,job.at-sim.time)*100)/100+'s'});
 return list;
}
function sync(){
 if(typeof B==='undefined'||!B||B.presentationBusy)return;
 for(const u of [...B.allies,...B.enemies]){
  const el=uel(u);if(!el)continue;const items=u.hp>0?statusModel(u,B.engine):[];
  let strip=el.querySelector('.v3-status-strip');if(!strip){strip=document.createElement('div');strip.className='v3-status-strip';strip.setAttribute('aria-label','현재 적용 중인 상태');el.append(strip);}
  const signature=JSON.stringify(items);if(strip.dataset.signature===signature)continue;strip.dataset.signature=signature;strip.replaceChildren();
  for(const [index,item]of items.slice(0,5).entries()){
   const badge=document.createElement('button');badge.type='button';badge.className='v3-status-badge';badge.dataset.stateKind=item.kind;badge.style.setProperty('--state-color',item.color);badge.title=item.title;badge.setAttribute('aria-label',item.title);badge.textContent=item.icon+' '+item.label;badge.onclick=e=>{e.stopPropagation();const old=el.querySelector('.v3-status-detail');if(old){old.remove();return;}const detail=document.createElement('div');detail.className='v3-status-detail';detail.dataset.key=item.key;detail.textContent=item.title;el.append(detail);};strip.append(badge);
  }
  if(items.length>5){const more=document.createElement('button');more.className='v3-status-badge';more.textContent='+'+(items.length-5);more.setAttribute('aria-label',items.slice(5).map(x=>x.title).join('\n'));more.onclick=e=>{e.stopPropagation();el.querySelector('.v3-status-detail')?.remove();const detail=document.createElement('div');detail.className='v3-status-detail';detail.dataset.key='__more';detail.textContent=items.slice(5).map(x=>x.title).join('\n');el.append(detail);};strip.append(more);}
  const detail=el.querySelector('.v3-status-detail');if(detail){const item=items.find(x=>x.key===detail.dataset.key);if(item)detail.textContent=item.title;else if(detail.dataset.key==='__more'&&items.length>5)detail.textContent=items.slice(5).map(x=>x.title).join('\n');else detail.remove();}
  el.querySelector('.v3-state-aura')?.remove();if(items.length&&!reduced()){const primary=items.find(x=>['stun','silence','shield','invincible','mode','dot'].includes(x.kind))||items[0],aura=document.createElement('i');aura.className='v3-state-aura';aura.dataset.auraKind=primary.kind;aura.dataset.auraStyle=primary.style;aura.style.setProperty('--state-color',primary.color);el.append(aura);}
 }
}
document.addEventListener('click',e=>{if(!e.target.closest('.v3-status-badge'))document.querySelectorAll('.v3-status-detail').forEach(d=>d.remove());});
function previewSkill(host,s){
 if(!host)return;host.replaceChildren();const token=String(Date.now())+':'+Math.random();host.dataset.previewToken=token;
 const w=host.clientWidth||280,h=host.clientHeight||110,a={x:30,y:h/2},z={x:w-30,y:h/2};
 for(const [text,x]of [['시전자',30],['대상',w-30]]){const label=document.createElement('span');label.className='v2-fx-preview-label';label.textContent=text;label.style.left=x+'px';host.append(label);}
 const choices=Array.isArray(s.effects)&&s.effects.length?s.effects:[{type:'damage'}];
 choices.forEach((effect,index)=>{
  const e={...effect,kind:effect.type,phase:effect.type==='delayed'?'prepare':'hit'},p=semanticProfile(e,s.fx,chosenColor(s)),offset=index*180;
  const target=effect.target==='self'?a:z;
  const action=()=>{
   const info=document.createElement('span');info.className='v3-preview-caption';info.textContent=(index+1)+'. '+((typeof GGMCombat!=='undefined'?GGMCombat.EFFECTS[e.kind]?.[0]:e.kind)||e.kind)+' · '+p.style;host.querySelector('.v3-preview-caption')?.remove();host.append(info);
   if(e.kind==='multi'||e.kind==='scatter'||e.kind==='chain'){
    let chainAt=0,from=a;for(let i=0;i<Math.min(5,e.hits||3);i++){const to=e.kind==='chain'||e.kind==='scatter'?{x:z.x-(i%3)*28,y:z.y-(i%2)*20}:target;const delay=route(host,e.kind==='chain'?from:a,to,p,{...e,hitIndex:i},e.kind==='chain'?chainAt:i*85,token);chainAt=delay+70;from=to;}
   }else if(e.kind==='delayed'){motif(host,target,p,e);later(host,800,()=>route(host,a,target,p,{...e,phase:'hit'},0,token),undefined,token);}
   else if(e.kind==='lifesteal'){route(host,a,z,semanticProfile({kind:'damage'},'마력탄',p.color),e,0,token);later(host,500,()=>route(host,z,a,p,{...e,phase:'return'},0,token),undefined,token);}
   else{route(host,a,target,p,e,0,token);if(['dot','regen','support'].includes(e.kind))later(host,800,()=>route(host,a,target,p,{...e,phase:'tick'},0,token),undefined,token);}
  };if(offset)later(host,offset,action,undefined,token);else action();
 });
}

root.GGMVFX={revision:'FX9',intent,motionMode,reduced,TIMING,resolveColor,cutIn,launch,impact,effect:semanticEffect,damage:semanticDamage,heal:semanticHeal,proc,sync,statusModel,semanticProfile,cast,basic,ranged,remaining,hasArrival,impactUnit,preview:previewSkill,clear};
})(typeof window!=='undefined'?window:globalThis);
