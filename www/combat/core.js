/* Gacha Game Maker combat v2. Pure, deterministic and DOM-free. */
(function(root){
'use strict';
const VERSION=2, RULESET=6, DT=.17;
const Studio=root.GGMStudio||(typeof require==='function'?require('./catalog.js'):null);
if(!Studio)throw new Error('Missing skill catalog');
const Visuals=root.GGMVisuals||(typeof require==='function'?require('./visual-catalog.js'):null);
if(!Visuals)throw new Error('Missing visual catalog');
const FX_TYPES=Visuals.STYLE_NAMES;
const FX_COLORS={'장미':'#ef476f','주홍':'#ff6b35','황금':'#ffd166','연두':'#a7e765','민트':'#39d9b0','하늘':'#4cc9f0','파랑':'#5688ff','보라':'#a878ff','분홍':'#f783d2','백색':'#edf6ff','청록':'#24a6a4','암흑':'#75658f'};
const SLOTS={passive:'패시브',active:'액티브',ultimate:'필살기'};
const TARGET_KEYS=['self','enemy','enemies','ally','allies','other_allies','random_enemies','random_allies','last_target','attacker','last_healed','marked_enemies','same_element','same_faction','role_allies','slot_ally'];
const TRIGGER_KEYS=['always','battle_start','action_start','action_end','after_basic','attack_hit','critical','on_hit','ally_hit','heal_given','heal_received','shield_break','status_expired','kill','ally_down','lethal','after_active','after_ultimate','ally_ultimate','interval','hp_below','mark_threshold'];
const CONDITION_KEYS=['always','self_low','target_low','has_mark','no_mark','mark_stacks','has_shield','no_shield','target_debuff','boss','allies_below','enemies_above','self_mode'];
const TARGETS=Object.fromEntries(Studio.TARGET.map((v,i)=>[TARGET_KEYS[i],v]));
Object.assign(TARGETS,{weak_enemy:'체력 비율이 낮은 적',strong_enemy:'공격력이 높은 적',front_enemy:'전열의 적',dead_ally:'쓰러진 아군'});
const TRIGGERS=Object.fromEntries(Studio.TRIGGER.map((v,i)=>[TRIGGER_KEYS[i],v]));
const CONDITIONS=Object.fromEntries(Studio.CONDITION.map((v,i)=>[CONDITION_KEYS[i],v]));
// [label, unit, min, max, default]. Percentage values are literal percentages.
const EFFECTS={sp:['궁극기 SP 회복','SP',1,30,10],damage:['피해','공격력 배율',.1,6,1.5],true_damage:['방어 무시 피해','공격력 배율',.1,3,1],heal:['회복','공격력 배율',.1,6,1.5],heal_percent:['최대 체력 비례 회복','%',1,30,10],shield:['보호막','공격력 배율',.1,6,2],dot:['지속 피해','초당 공격력 배율',.05,.8,.2],regen:['지속 회복','초당 공격력 배율',.05,.8,.2],atk_up:['공격력 증가','%',1,60,20],def_up:['방어력 증가','%',1,100,30],spd_up:['공격 속도 증가','%',1,60,20],atk_down:['공격력 감소','%',1,50,15],def_down:['방어력 감소','%',1,60,20],spd_down:['공격 속도 감소','%',1,50,15],crit_up:['치명타 확률 증가','%p',1,50,15],vulnerable:['받는 피해 증가','%',1,50,15],reduction:['받는 피해 감소','%',1,50,20],stun:['기절','초',.2,2,1],silence:['침묵 · 스킬 봉쇄','초',.5,4,2],taunt:['도발','초',1,8,4],cleanse:['해로운 효과 해제','개',1,3,1],dispel:['이로운 효과 해제','개',1,3,1],lifesteal:['흡혈 공격','공격력 배율 (피해의 30% 회복)',.1,4,1.5],cooldown:['필살기 대기시간 단축','초',.5,4,2],revive:['부활','최대 체력 %',5,30,15]};
for(const [type,d] of Object.entries(Studio.EFFECTS))if(!EFFECTS[type])EFFECTS[type]=[d.name,'%',0,100000,100];
const HARM=new Set(['dot','atk_down','def_down','spd_down','vulnerable','stun','silence','debuff','delay','focus','confuse','noheal','cooldownUp']);
const OFFENSIVE=new Set(['damage','true_damage','dot','atk_down','def_down','spd_down','vulnerable','stun','silence','dispel','lifesteal','multi','scatter','chain','delayed','detonate','pierce','fixed','extra','debuff','breakshield','delay','focus','confuse','noheal','cooldownUp']);
const INSTANT=new Set(['damage','true_damage','heal','heal_percent','cleanse','dispel','lifesteal','cooldown','revive']);
const has=(o,k)=>typeof k==='string'&&Object.prototype.hasOwnProperty.call(o,k);
const clone=x=>JSON.parse(JSON.stringify(x));
const clamp=(x,a,b,d=a)=>Number.isFinite(+x)?Math.min(b,Math.max(a,+x)):d;
const text=(x,n=80)=>String(x||'').slice(0,n);
function effect(type,target,value,extra={}){return {type,target,value,duration:5,chance:100,stacks:1,condition:'always',...extra};}
function skill(name,effects,cooldown=8,extra={}){return {name,description:'',cooldown,initial:cooldown,trigger:'interval',effects,...extra};}
function defaults(c={}){
 const role=c.role||'atk', old=c.skill||{};
 const legacy={dmg:effect('damage','weak_enemy',2.8),aoe:effect('damage','enemies',1.7),heal:effect('heal','allies',2.2),shield:effect('shield','allies',2.5),buff:effect('atk_up','allies',25,{duration:8})};
 return normalize({version:2,passive:skill('전투 태세',[effect(role==='def'?'def_up':role==='sup'?'atk_up':'crit_up','self',role==='def'?25:15,{duration:10})],12,{initial:0,trigger:'interval'}),active:skill(role==='def'?'수호':role==='sup'?'응급 지원':'전술 공격',[role==='def'?effect('shield','self',2.5):role==='sup'?effect('heal','ally',2.5):effect('damage','enemy',1.8)],8),ultimate:skill(old.name||'결전기',[legacy[old.kind]||effect('damage','enemies',1.7)],22,{initial:12})});
}
function effectSpec(e){
 if(!e.studio)return EFFECTS[e.type];
 const label=Studio.EFFECTS[e.type]?.name||EFFECTS[e.type][0];
 return [label,e.basis==='고정 수치'||e.type==='fixed'?'고정 수치':'%',0,['reduction','lifesteal','breakshield','resist','dodge','sacrifice','gauge','delay','penetration'].includes(e.type)?100:100000,100];
}
function defaultEffect(type='damage',extra={}){
 const good=(!OFFENSIVE.has(type)||type==='lifesteal')&&!['mark','consume'].includes(type);return normalizeEffect(Studio.effect(type,{target:good?'self':'enemy',priority:Studio.PRIORITY[1],value:['damage','multi','scatter','chain','extra','delayed','pierce','heal','shield','regen','support','follow','dot'].includes(type)?150:20,condition:'always',sourceSlot:'ultimate',status:type==='stun'?'기절':'독',...extra}));
}
function normalizeEffect(e){
 const spec=effectSpec(e),out={type:e.type,target:has(TARGETS,e.target)?e.target:'enemy',value:clamp(e.value,spec[2],spec[3],spec[4]),duration:clamp(e.duration,.1,180,5),chance:clamp(e.chance,1,100,100),stacks:Math.round(clamp(e.stacks,1,99,1)),condition:has(CONDITIONS,e.condition)?e.condition:'always'};
 if(e.studio)out.studio=true;
 const base=Studio.sample;
 for(const key of ['priority','basis','mark','stat','status','element','freeze','skillSlot','recordSource','conditionMark','reapply','owner','fallback','removable','role'])out[key]=text(e[key]??base[key],80).replace(/자동 액티브/g,'액티브');
 for(const [key,min,max,def] of [['hits',1,30,3],['decay',0,100,20],['interval',.1,180,2],['delay',.1,180,3],['maxStacks',1,99,5],['penetration',0,100,30],['cap',1,1000000,1000],['hpRemain',1,1000000,1],['count',1,10,1],['turns',.1,60,1],['threshold',1,100,50],['slot',1,4,1]])out[key]=clamp(e[key],min,max,def);
 if(!e.studio&&!e.priority)out.priority=e.target==='enemy'?'':Studio.PRIORITY[1];if(!e.studio&&e.interval===undefined)out.interval=1;
 out.targetCount=Math.round(clamp(e.targetCount??e.count,1,10,1));
 out.consume=e.consume!==false;out.sourceSlot=['passive','active','ultimate'].includes(e.sourceSlot)?e.sourceSlot:'ultimate';
 return out;
}
function normalize(input){
 const out={version:VERSION,ruleset:RULESET};
 for(const slot of Object.keys(SLOTS)){
  const s=input&&input[slot]||{},cooldown=clamp(s.cooldown,slot==='passive'?0:.17,180,slot==='ultimate'?22:8);
  out[slot]={name:text(s.name||SLOTS[slot],40).replace(/자동 액티브/g,'액티브'),description:text(s.description,240).replace(/자동 액티브/g,'액티브'),cooldown,initial:clamp(s.initial,0,180,cooldown),trigger:slot!=='ultimate'&&has(TRIGGERS,s.trigger)?s.trigger:'interval',triggerEvery:clamp(s.triggerEvery,1,100,1),threshold:clamp(s.threshold,1,100,s.trigger==='hp_below'?40:1),triggerMark:text(s.triggerMark||'낙인'),limit:Math.round(clamp(s.limit,0,100,0)),lockout:clamp(s.lockout,0,180,0),auto:s.auto!==false,fx:FX_TYPES.includes(s.fx)?s.fx:'효과별 자동',color:/^#[0-9a-f]{6}$/i.test(s.color||'')?s.color:'#d92f5a',colorMode:['effect','custom'].includes(s.colorMode)?s.colorMode:(!s.fx||s.fx==='효과별 자동'?'effect':'custom'),effects:(Array.isArray(s.effects)?s.effects:[]).slice(0,5).filter(e=>e&&has(EFFECTS,e.type)).map(normalizeEffect)};
 }
 return out;
}
function validate(input){
 const errors=[];
 if(!input||input.version!==2)errors.push('스킬 version은 2여야 합니다.');
 for(const slot of Object.keys(SLOTS)){
  const s=input&&input[slot];if(!s||!Array.isArray(s.effects)||!s.effects.length||s.effects.length>5){errors.push(SLOTS[slot]+': 효과를 1~5개 넣어 주세요.');continue;}
  if(!s.name||String(s.name).length>40)errors.push(SLOTS[slot]+': 이름은 1~40자입니다.');
  if(!Number.isFinite(s.cooldown)||s.cooldown<(slot==='passive'?0:.17)||s.cooldown>180)errors.push(SLOTS[slot]+': 재사용 시간을 확인하세요.');
  if(!Number.isFinite(s.initial)||s.initial<0||s.initial>180)errors.push(SLOTS[slot]+': 첫 사용 대기는 0~180초입니다.');
  if(slot!=='ultimate'&&!has(TRIGGERS,s.trigger))errors.push('알 수 없는 패시브 발동 조건입니다.');
  for(const [key,min,max] of [['triggerEvery',1,100],['threshold',1,100],['limit',0,100],['lockout',0,180]])if(s[key]!==undefined&&(!Number.isFinite(s[key])||s[key]<min||s[key]>max))errors.push('발동 조건 수치 범위를 확인하세요.');
  for(const e of s.effects){
   if(!e||typeof e!=='object'||Array.isArray(e)){errors.push('효과는 객체여야 합니다.');continue;}
   if(!has(EFFECTS,e.type)){errors.push('지원하지 않는 효과: '+text(e.type));continue;}
   const spec=effectSpec(e);
   if(!has(TARGETS,e.target))errors.push('지원하지 않는 대상입니다.');
   if(!has(CONDITIONS,e.condition))errors.push('지원하지 않는 효과 조건입니다.');
   if(!Number.isFinite(e.value)||e.value<spec[2]||e.value>spec[3])errors.push(`${spec[0]}: 수치는 ${spec[2]}~${spec[3]}입니다.`);
   if(!Number.isFinite(e.duration)||e.duration<.1||e.duration>180||!Number.isFinite(e.chance)||e.chance<1||e.chance>100||!Number.isInteger(e.stacks)||e.stacks<1||e.stacks>99)errors.push('지속 시간·확률·중첩 범위를 확인하세요.');
   const offensive=OFFENSIVE.has(e.type)&&!(e.type==='lifesteal'&&e.studio),enemy=['enemy','enemies','weak_enemy','strong_enemy','front_enemy','random_enemies','last_target','attacker','marked_enemies'].includes(e.target);
   if(!e.studio&&offensive&&!enemy)errors.push(spec[0]+': 적을 대상으로 선택하세요.');
   if(!e.studio&&!offensive&&e.type!=='revive'&&enemy)errors.push(spec[0]+': 아군을 대상으로 선택하세요.');
   if(e.type==='revive'&&(e.target!=='dead_ally'||slot!=='ultimate'))errors.push('부활은 필살기에서 쓰러진 아군에게만 가능합니다.');
   if(e.type==='cooldown'&&!e.studio&&slot==='ultimate')errors.push('필살기는 필살기 대기시간을 단축할 수 없습니다.');
   if(e.studio){
    for(const [key,values] of Object.entries({priority:Studio.PRIORITY,basis:Studio.BASIS,stat:Studio.STATS,skillSlot:['액티브','필살기','액티브와 필살기'],reapply:['지속시간 갱신','강한 효과만 유지','독립적으로 적용'],owner:['시전자별로 구분','아군끼리 공유'],fallback:['다른 대상 재선택','남은 효과 종료'],removable:['해제 가능','해제 불가']}))if(!values.includes(e[key]))errors.push('알 수 없는 설정: '+key);
    const ranges={hits:[1,30],decay:[0,100],interval:[.1,180],delay:[.1,180],maxStacks:[1,99],penetration:[0,100],cap:[1,1000000],hpRemain:[1,1000000],count:[1,10],turns:[.1,60],threshold:[1,100],slot:[1,4]};
    for(const key of new Set([...(Studio.EFFECTS[e.type]?.fields||[]),'threshold',...(e.target==='slot_ally'?['slot']:[])]))if(ranges[key]&&(!Number.isFinite(e[key])||e[key]<ranges[key][0]||e[key]>ranges[key][1]))errors.push('효과 세부 수치 범위 확인: '+key);
    if(['mark','consume','detonate','record','mode','replace'].includes(e.type)&&!String(e.mark||'').trim())errors.push('표식/기록/모드 이름을 입력하세요.');
    for(const key of ['hits','count','targetCount','maxStacks','slot'])if(e[key]!==undefined&&!Number.isInteger(e[key]))errors.push('횟수·중첩·슬롯은 정수여야 합니다.');
    if(e.targetCount!==undefined&&(!Number.isFinite(e.targetCount)||e.targetCount<1||e.targetCount>10))errors.push('대상 수는 1~10명입니다.');
    if(e.type==='replace'&&(!['passive','active','ultimate'].includes(e.sourceSlot)||e.skillSlot==='액티브와 필살기'||e.sourceSlot===(e.skillSlot==='필살기'?'ultimate':'active')))errors.push('스킬 교체는 대상과 다른 원본 슬롯 하나를 선택하세요.');
   }
  }
 }
 return [...new Set(errors)];
}
function fromDesign(design){
 if(!Array.isArray(design.skills)||design.skills.length!==3)throw new Error('세 슬롯 설계 파일이 필요해요.');
 const warnings=[],out={version:2};
 for(let i=0;i<3;i++){const s=design.skills[i];if(i===0&&s.trigger==='BURST 발동 시')throw new Error('BURST 발동 조건은 제거됐어요. 페이지에서 다른 발동 시점을 선택해 주세요.');if(!Array.isArray(s.effects)||s.effects.some(e=>!e||!has(Studio.EFFECTS,e.type)&&!['burst','burstgain','burstsuppress'].includes(e.type)))throw new Error('알 수 없는 효과가 들어 있어요.');out[Object.keys(SLOTS)[i]]={...s,trigger:TRIGGER_KEYS[Studio.TRIGGER.indexOf(String(s.trigger).replace(/자동 액티브/g,'액티브'))]||'interval',cooldown:i?Math.max(.17,s.cooldown*1.7):0,initial:i?s.initial*1.7:0,effects:s.effects.filter(e=>{if(['burst','burstgain','burstsuppress'].includes(e.type)){warnings.push('제거한 BURST 효과는 가져오지 않았어요.');return false;}return true;}).map(e=>normalizeEffect({...e,studio:true,target:TARGET_KEYS[Studio.TARGET.indexOf(e.target)]||'enemy',condition:CONDITION_KEYS[Studio.CONDITION.indexOf(e.condition)]||'always'}))};if(!out[Object.keys(SLOTS)[i]].effects.length)throw new Error('BURST만 있는 슬롯은 다른 효과를 먼저 추가해 주세요.');}
 return {kit:normalize(out),warnings};
}
// Conservative static budget catches runaway combinations before simulation.
function budget(kit){
 let score=0;
 for(const [slot,s] of Object.entries(kit)){if(!SLOTS[slot])continue;
  let cost=0;for(const e of s.effects){let v=e.studio?studioCost(e):e.value;
   if(!e.studio){if(['atk_up','def_up','spd_up','atk_down','def_down','spd_down','crit_up','vulnerable','reduction'].includes(e.type))v=v/20*e.duration/5*e.stacks;
   else if(['stun','silence','taunt'].includes(e.type))v*=1.7;
   else if(['dot','regen'].includes(e.type))v*=e.duration*e.stacks;
   else if(e.type==='heal_percent'||e.type==='revive')v/=4;
   else if(e.type==='cooldown')v*=1.5;else if(e.type==='sp')v/=5;}
   const coverage=e.target==='enemies'?5:e.target==='allies'?4:e.target==='other_allies'?3:['random_enemies','random_allies'].includes(e.target)?Math.min(e.target==='random_enemies'?5:4,Math.max(1,e.targetCount??e.count)):['same_element','same_faction','role_allies','marked_enemies'].includes(e.target)?4:1;
   cost+=v*coverage*e.chance/100;
  }
  score+=cost*(slot==='ultimate'?.8:1)/Math.max(3,s.cooldown)*8;
 }
 return score;
}
function bounded(input){
 const k=normalize(input);let changes=0;
 while(budget(k)>20&&changes++<16){for(const slot of Object.keys(SLOTS)){const s=k[slot];s.cooldown=Math.min(slot==='ultimate'?60:30,s.cooldown*1.1);for(const e of s.effects)e.value=Math.max(effectSpec(e)[2],e.value*.9);}}
 return k;
}
// Policy is enforced after AI output and after simulation; manual skills are never capped by it.
const GENERATIONS=[null,...[1,1.2,1.45,1.75,2.1].map(scale=>({passive:Math.round(1.5*scale*100)/100,active:Math.round(2.5*scale*100)/100,ultimate:Math.round(4*scale*100)/100}))];
function generation(c={}){return Math.round(clamp(c.generation,1,5,1));}
function slotCost(s,slot){return budget({[slot]:{...s,cooldown:slot==='ultimate'?20:slot==='passive'&&s.trigger==='always'?8:s.trigger==='interval'?Math.max(s.cooldown,s.triggerEvery):Math.max(3,s.cooldown,s.triggerEvery*1.7)}});}
const AI_SIMPLE=new Set(['damage','multi','heal','shield','regen','dot','buff','debuff','atk_up','def_up','spd_up','crit_up','atk_down','def_down','spd_down','reduction','stun','silence','taunt','cleanse','dispel','sp']);
// Complexity caps are independent of the numerical power budget. Later releases
// can still have one effect; these are ceilings, never required effect counts.
const AI_EFFECT_LIMITS=[null,{passive:1,active:1,ultimate:1},{passive:1,active:1,ultimate:2},{passive:1,active:2,ultimate:2},{passive:2,active:2,ultimate:3},{passive:2,active:3,ultimate:3}];
function aiLimits(c={}){return AI_EFFECT_LIMITS[generation(c)];}
function aiRole(c={}){return ['atk','def','sup'].includes(c.role)?c.role:'atk';}

// Delivery uses the same virtual clock in the headless simulator and renderer.

// These are visible generation inputs, never multipliers applied during combat.
const CHARACTER_BASE_STATS={atk:{hp:1000,atk:120,def:48,spd:108,sk:['dmg','aoe']},def:{hp:2400,atk:85,def:128,spd:82,sk:['shield']},sup:{hp:950,atk:100,def:46,spd:86,sk:['heal','buff','shield']}};
function generateBaseStats(c={},random=Math.random){
 const b=CHARACTER_BASE_STATS[c.role]||CHARACTER_BASE_STATS.atk,i=([1,2,3].includes(+c.rarity)?+c.rarity:1)-1,j=()=>.95+random()*.1;
 return {hp:Math.round(b.hp*[1,1.04,1.12][i]*j()/10)*10,atk:Math.round(b.atk*[1,1.15,1.4][i]*j()),def:Math.round(b.def*[1,1.1,1.12][i]*j()),spd:roleSpeed(c)};
}
function baseStats(c={}){const b=CHARACTER_BASE_STATS[c.role]||CHARACTER_BASE_STATS.atk;return {hp:clamp(c.hp,1,1e10,b.hp),def:clamp(c.def,0,1e8,b.def)};}
// Version lives on each character, so reload, project switch and backup import are idempotent.
function migrateBaseStats(c){
 if(c.baseStatsVersion>=1)return false;
 if(c.role==='def'){
  const before=baseStats(c);c.baseStatsMigration={version:1,hp:before.hp,def:before.def};
  c.hp=Math.round(before.hp*1.6);c.def=Math.round(before.def*1.5);c.skillBalance=null;
 }
 c.baseStatsVersion=1;return true;
}

const IMPACT=Object.freeze({wallPerSecond:230/DT,windup:.17,melee:.3,gap:DT,maxQueued:512});
function isRanged(u){const c=u.c||u,words=[c.weapon?.name,c.weapon?.desc,c.weaponName,c.skillConcept,c.concept,c.desc,c.profile,u.name].filter(x=>typeof x==='string').join(' ');return u.role==='sup'||/궁수|사수|저격|총|활|마법|마도|지팡이|소총|권총|archer|mage|rifle|sniper/i.test(words)||u.side==='e'&&!u.boss&&(u.role==='atk'||!u.role);}
function impactPlan(u,t,slot,visual={},basic=false){
 const s=u.kit?.[slot]||{},words=conceptText(u.c||u),ranged=isRanged(u),healing=['heal','heal_percent','regen','support','revive'].includes(visual.kind);
 let style=basic?(ranged?(/총|rifle|sniper/i.test(words)?'총탄':/활|archer/i.test(words)?'화살':'마력탄'):'참격'):Visuals.resolve(visual,s.fx).style;
 if(!basic&&s.fx==='효과별 자동'&&visual.kind==='damage'&&u.c)style=skillVisual(u.c,slot,{type:'damage'}).fx;
 const projectile=['마력탄','화살','총탄','화염구','빙결창','별빛 폭발','빛줄기','번개','연쇄 전격'].includes(style);
 const mode=u===t?'instant':healing||ranged||projectile||visual.kind==='follow'?'projectile':'melee',transport=projectile?style:healing||ranged?'마력탄':null;
 const ms=transport==='총탄'?440:transport==='화살'?620:transport==='빛줄기'?330:['번개','연쇄 전격'].includes(transport)?300:700;
 const index=visual.hitIndex||0,windup=basic?0:IMPACT.windup,travel=mode==='melee'?IMPACT.melee:mode==='projectile'?ms/IMPACT.wallPerSecond:0;
 const duration=Math.max(DT,Math.ceil((windup+travel+index*IMPACT.gap)/DT)*DT);
 return {mode,style,transport,windup:windup+index*IMPACT.gap,duration,index,total:['multi','scatter','chain'].includes(visual.kind)?visual.hitTotal||visual.hits||1:1,angle:[-38,36,-62,62,-15,18][index%6],curve:[-1,1,-.5,.5,-.8,.8][index%6]*Math.min(26,index?14+index*3:0)};
}
function queueImpact(sim,u,t,slot,visual,basic,commit){
 if(sim.impactJobs.length>=IMPACT.maxQueued)return 0;
 const id=++sim.impactSeq,plan=impactPlan(u,t,slot,visual,basic);
 plan.group=String(slot||'basic')+':'+String(visual.id??id);plan.startDelay=0;
 if(plan.mode==='melee'){
  if(u.meleeGroup!==plan.group){u.meleeGroup=plan.group;u.meleeDelay=Math.max(0,(u.meleeUntil||0)-sim.time);u.meleeUntil=sim.time+u.meleeDelay+plan.duration+IMPACT.gap*Math.max(0,plan.total-1)+.24;}
  plan.startDelay=u.meleeDelay||0;plan.duration+=plan.startDelay;plan.windup+=plan.startDelay;
 }
 const job={id,at:sim.time+plan.duration,source:u,target:t,plan,commit};sim.impactJobs.push(job);
 job.intent={type:'attackIntent',id,source:u,target:t,slot,basic,visual,plan,fx:plan.style,color:u.kit?.[slot]?.color};
 job.announced=sim.events.length<256;if(job.announced)emit(sim,job.intent);return id;
}
function commitImpact(sim,id){const i=sim.impactJobs.findIndex(j=>j.id===id);if(i<0||sim.winner)return;const job=sim.impactJobs.splice(i,1)[0];if(job.target.hp<=0||job.plan.mode==='melee'&&job.source.hp<=0)return;job.commit(job);}
function landImpact(sim,id){sim.events=[];commitImpact(sim,id);outcome(sim);return sim.events;}

function roleSpeed(c={}){let h=0;for(const x of String(c.name||'')+String(c.elem||''))h=(h*31+x.charCodeAt(0))>>>0;return ({atk:108,def:80,sup:86}[aiRole(c)])+h%7-3;}
function conceptText(c={}){return [c.skillConcept,c.name,c.profile,c.weapon?.name,c.weapon?.desc,c.intro].filter(Boolean).join(' ');}
function isHealer(c={}){return aiRole(c)==='sup'&&/힐러|치유|치료|회복|의사|성녀|healer|medic/i.test(conceptText(c));}
const AI_RECIPES={
 grace:{label:'아군에게 치유의 기운',type:'regen',value:20,target:'ally',roles:['sup'],slots:['passive'],extras:['def_up']},
 blessing:{label:'아군을 보호하는 축복',type:'shield',value:65,target:'ally',roles:['sup'],slots:['passive'],extras:['def_up']},
 focus:{label:'자기 공격 강화',type:'atk_up',value:12,target:'self',roles:['atk','sup'],slots:['passive'],extras:['crit_up']},
 armor:{label:'자기 방어 강화',type:'def_up',value:20,target:'self',roles:['def'],slots:['passive'],extras:['reduction']},
 strike:{label:'단일 공격',type:'damage',value:180,target:'enemy',roles:['atk','def'],slots:['active','ultimate'],extras:['def_down','atk_up']},
 volley:{label:'단일 연속 공격',type:'multi',value:65,target:'enemy',roles:['atk'],slots:['active','ultimate'],extras:['crit_up']},
 sweep:{label:'전체 공격',type:'damage',value:100,target:'enemies',roles:['atk'],slots:['ultimate'],extras:['def_down']},
 poison:{label:'지속 피해',type:'dot',value:35,target:'enemy',roles:['atk'],slots:['active'],extras:['spd_down']},
 guard:{label:'자기 보호막',type:'shield',value:220,target:'self',roles:['def'],slots:['active','ultimate'],extras:['def_up','reduction']},
 recover:{label:'자기 회복',type:'heal',value:170,target:'self',roles:['def'],slots:['active','ultimate'],extras:['def_up']},
 mend:{label:'저체력 아군 회복',type:'heal',value:220,target:'ally',roles:['sup'],slots:['active','ultimate'],extras:['def_up']},
 renewal:{label:'아군 지속 회복',type:'regen',value:45,target:'ally',roles:['sup'],slots:['active','ultimate'],extras:['def_up']},
 shelter:{label:'아군 보호막',type:'shield',value:220,target:'ally',roles:['sup'],slots:['active','ultimate'],extras:['def_up']},
 rally:{label:'아군 공격 강화',type:'atk_up',value:18,target:'ally',roles:['sup'],slots:['active','ultimate'],extras:['crit_up']},
 charge:{label:'아군 SP 지원',type:'sp',value:8,target:'ally',roles:['sup'],slots:['active'],minGeneration:3,extras:[]}
};
function aiRecipes(c,slot){return Object.fromEntries(Object.entries(AI_RECIPES).filter(([id,r])=>r.roles.includes(aiRole(c))&&r.slots.includes(slot)&&generation(c)>=(r.minGeneration||1)&&!(isHealer(c)&&['focus','rally','charge'].includes(id))));}
function skillVisual(c,slot,recipe,raw={}){
 const text=conceptText(c),healing=['heal','regen','heal_percent'].includes(recipe.type),shield=recipe.type==='shield';
 const theme=/화염|불꽃|불의|fire/i.test(text)?['화염구','#ff6b35']:/얼음|빙결|서리|냉기|ice|frost/i.test(text)?['빙결창','#4cc9f0']:/번개|전격|전기|lightning/i.test(text)?['번개','#ffd166']:/별빛|별의|성좌|star/i.test(text)?['별빛 폭발','#a878ff']:/저격|소총|권총|사격|총|rifle|gun/i.test(text)?['총탄','#ffd166']:/궁수|석궁|활|archer/i.test(text)?['화살','#a7e765']:/검|참격|도검|blade|sword/i.test(text)?['참격','#edf6ff']:['마력탄','#a878ff'];
 return {fx:FX_TYPES.includes(raw.fx)?raw.fx:healing?'회복 광휘':shield?'보호막':theme[0],color:/^#[0-9a-f]{6}$/i.test(raw.color||'')?raw.color:healing?'#39d9b0':shield?'#5688ff':theme[1]};
}
function aiDesign(c,slot,raw={}){
 const recipes=aiRecipes(c,slot),recipe=has(recipes,raw.recipe)?recipes[raw.recipe]:null;
 if(!recipe)throw new Error('이 역할·세대에서 지원하지 않는 설계: '+text(raw.recipe,60));
 const g=generation(c),power=clamp(raw.power,70,130,100)/100*[1,1.2,1.45,1.75,2.1][g-1],boost=slot==='ultimate'?1.65:1;
 let hash=0;for(const ch of String(c.name||'')+String(raw.name||recipe.label))hash=(hash*31+ch.charCodeAt(0))>>>0;
 const make=(type,target,value)=>type==='sp'?effect('sp',target,value):defaultEffect(type,{target,value,duration:slot==='passive'?8:6,interval:2,hits:3,stacks:1,condition:'always',priority:Studio.PRIORITY[1]});
 const main=make(recipe.type,recipe.target,recipe.value*power*boost),effects=[main];
 // Restrict support coverage rather than allowing a low-tier healer to solve
 // every defensive/offensive/resource problem in the same skill.
 if(aiRole(c)==='sup'&&slot==='ultimate'&&g>=2&&raw.target==='allies')main.target='allies';
 if(aiRole(c)==='atk'&&recipe.target==='enemy'&&['enemy','front_enemy','weak_enemy','strong_enemy'].includes(raw.target))main.target=raw.target;
 const extraValues={def_down:10,spd_down:10,atk_up:10,crit_up:8,def_up:15,reduction:6};
 const extras=Array.isArray(raw.extras)?raw.extras:[];
 for(const type of [...new Set(extras)])if(recipe.extras.includes(type)&&effects.length<aiLimits(c)[slot]&&!(type==='reduction'&&g<3))effects.push(make(type,OFFENSIVE.has(type)?main.target:aiRole(c)==='sup'?main.target:'self',extraValues[type]));
 let trigger=['after_basic','attack_hit','on_hit','critical','hp_below','interval'].includes(raw.trigger)?raw.trigger:slot==='passive'?'interval':aiRole(c)==='def'?'on_hit':['after_basic','interval','attack_hit'][hash%3];
 if(trigger==='on_hit'&&aiRole(c)!=='def'||trigger==='critical'&&g<3)trigger='after_basic';
 if(slot==='passive'&&isHealer(c))trigger='interval';
 const n=clamp(raw.triggerEvery,3,8,3+hash%4),cd=slot==='ultimate'?20:slot==='passive'?12:trigger==='interval'?clamp(raw.cooldown,7,20,7+hash%9):clamp(raw.cooldown,4,12,6);
 return skill(text(raw.name||recipe.label,40),effects,cd,{description:text(raw.description,180),trigger:slot==='ultimate'?'interval':trigger,triggerEvery:trigger==='interval'?cd:Math.round(n),initial:slot==='passive'?0:trigger==='interval'?clamp(raw.initial,1,12,4):0,threshold:clamp(raw.threshold,25,60,40),...skillVisual(c,slot,recipe,raw)});
}
function aiEffectAllowed(e,c,slot){
 if(!AI_SIMPLE.has(e.type))return false;
 const role=aiRole(c),g=generation(c),type=e.studio&&e.type==='buff'?({'공격력':'atk_up','방어력':'def_up','행동 속도':'spd_up','치명타 확률':'crit_up'}[e.stat]||'atk_up'):e.studio&&e.type==='debuff'?({'공격력':'atk_down','방어력':'def_down','행동 속도':'spd_down'}[e.stat]||'def_down'):e.type;
 if(slot==='passive')return (role==='def'?['def_up',...(g>=3?['reduction']:[])]:role==='sup'?isHealer(c)?['heal','regen','shield','def_up']:['heal','regen','shield','def_up','atk_up']:['atk_up','crit_up',...(g>=4?['spd_up']:[])]).includes(type);
 if(type==='sp')return role==='sup'&&slot==='active'&&g>=3;
 return (role==='atk'?['damage','multi','dot','atk_up','crit_up','def_down','spd_down',...(g>=3?['stun']:[])]:role==='def'?['shield','heal','damage','def_up','atk_down','taunt',...(g>=3?['reduction','stun']:[])]:['heal','regen','shield','atk_up','crit_up','def_up',...(g>=3?['cleanse']:[])]).includes(type);
}
function aiPolicy(input,c={},onlySlot){
 const k=normalize(input),g=generation(c),limits=GENERATIONS[g];
 for(const slot of Object.keys(SLOTS)){
  if(onlySlot&&onlySlot!==slot)continue;
  const s=k[slot];s.effects=s.effects.filter(e=>aiEffectAllowed(e,c,slot)).slice(0,aiLimits(c)[slot]);
  if(!s.effects.length)s.effects=aiDesign(c,slot,{recipe:Object.keys(aiRecipes(c,slot))[0]}).effects;
  // Damage dealers must keep a damage source; support and tanks keep their
  // specialty. Never turn a primary heal into a resource engine by accident.
  if(slot!=='passive'&&aiRole(c)==='atk'&&!s.effects.some(e=>['damage','multi','dot'].includes(e.type)))s.effects.unshift(defaultEffect('damage'));
  s.effects=s.effects.slice(0,aiLimits(c)[slot]);
  s.cooldown=Math.max(slot==='ultimate'?1:slot==='passive'&&s.trigger==='always'?0:4,s.cooldown);s.initial=Math.max(0,Math.min(s.initial,20));
  if(slot==='active'&&!['interval','after_basic','on_hit','attack_hit','critical','hp_below'].includes(s.trigger))s.trigger='interval';
  if(slot==='active'&&s.trigger==='interval'){let hash=0;for(const ch of String(c.name||'')+s.name)hash=(hash*31+ch.charCodeAt(0))>>>0;s.triggerEvery=Math.max(5,s.triggerEvery);if(s.cooldown===8)s.cooldown=7+hash%10;s.initial=Math.min(s.initial,2+hash%7);}
  if(slot==='active'&&['after_basic','on_hit','attack_hit','critical'].includes(s.trigger))s.triggerEvery=Math.max(3,s.triggerEvery);
  if(slot==='passive'&&!['battle_start','interval','after_basic','on_hit','hp_below'].includes(s.trigger))s.trigger='interval';
  if(slot==='passive'&&s.trigger==='battle_start')s.trigger='interval';
  const seen=new Set();s.effects=s.effects.filter(e=>{const key=e.type+':'+(e.type==='buff'||e.type==='debuff'?e.stat:'');if(seen.has(key))return false;seen.add(key);return true;});
  for(const e of s.effects){
   e.condition='always';if(OFFENSIVE.has(e.type)&&!['enemy','enemies','random_enemies','weak_enemy','strong_enemy','front_enemy'].includes(e.target))e.target='enemy';if(!OFFENSIVE.has(e.type)&&['enemy','enemies','attacker','last_target','marked_enemies','random_enemies'].includes(e.target))e.target='self';e.basis='시전자 공격력';e.stacks=1;e.hits=Math.min(3,e.hits);e.duration=Math.min(8,e.duration);e.reapply='강한 효과만 유지';
   if(e.type==='sp'){e.studio=false;e.target='ally';e.value=Math.min(15,e.value);if(slot==='ultimate'){e.type='heal';e.value=1;e.target='ally';}}
   if(slot==='passive'){e.target=aiRole(c)==='sup'&&['heal','regen','shield'].includes(e.type)?'ally':'self';if(isHealer(c))s.trigger='interval';s.cooldown=Math.max(10,s.cooldown);s.triggerEvery=s.trigger==='interval'?s.cooldown:Math.max(3,s.triggerEvery);}
   if(e.studio&&['damage','multi','heal','shield','dot','regen'].includes(e.type))e.value=Math.max(10,e.value);
   if(e.type==='reduction')e.value=Math.min(8,e.value);
   if(e.type==='sp')e.value=Math.min(10,e.value);
   if(['stun','silence'].includes(e.type)){e.duration=Math.min(1,e.duration);if(!e.studio)e.value=Math.min(1,e.value);}
   if(e.studio&&['buff','debuff'].includes(e.type)&&!['공격력','방어력','행동 속도','치명타 확률'].includes(e.stat))e.stat='공격력';
  }
  for(let i=0;i<160&&slotCost(s,slot)>limits[slot]+.001;i++)for(const e of s.effects){e.value=Math.max(effectSpec(e)[2],e.value*.9);if(['dot','regen','buff','debuff','stun','silence'].includes(e.type))e.duration=Math.max(.1,e.duration*.95);}
 }
 for(const slot of Object.keys(SLOTS))if(!onlySlot||onlySlot===slot)k[slot].description=k[slot].effects.map(e=>effectSpec(e)[0]).join(' · ');
 if(onlySlot)for(const slot of Object.keys(SLOTS))if(slot!==onlySlot&&input[slot])k[slot]=clone(input[slot]);
 return k;
}
function generationDefaults(c={}){const k=defaults(c),scale=[1,1.2,1.45,1.75,2.1][generation(c)-1];for(const slot of Object.keys(SLOTS))for(const e of k[slot].effects)e.value=Math.min(effectSpec(e)[3],e.value*scale);return aiPolicy(k,c);}
const SP={max:100,basic:10,hit:6,active:12,perSecond:1.5,hitGap:.5};
function gainSP(sim,u,n,source){if(u.hp<=0||u.trainingDummy)return;u.sp=clamp((u.sp||0)+n,0,SP.max);emit(sim,{type:'sp',source:source||u,target:u,value:n});}
function rng(seed){let a=seed>>>0;return ()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
function enemyPatterns(c){
 const keys=['aoe','snipe','charge','drain','barrier','curse','shift'];
 const custom=(Array.isArray(c.pattern)?c.pattern:String(c.pattern||'').split(/[, |]+/)).filter(k=>keys.includes(k));if(custom.length)return custom.slice(0,2);
 let h=0;for(const x of String(c.name||''))h=(h*31+x.charCodeAt(0))|0;return [keys[Math.abs(h)%keys.length]];
}
function enemyKit(c){
 const k=defaults({role:'atk'});k.passive=skill('광폭화',[effect('atk_up','self',30,{duration:15}),effect('spd_up','self',20,{duration:15})],30,{initial:0,trigger:'hp_below'});
 const patterns={aoe:effect('damage','enemies',.9),snipe:effect('damage','weak_enemy',2),charge:effect('damage','enemies',1.25),drain:effect('lifesteal','enemy',1.5),barrier:effect('shield','self',3),curse:effect('atk_down','allies',15),shift:effect('def_down','enemies',20)};
 // Enemy-relative targets: curse affects its opponents, never its own side.
 patterns.curse.target='enemies';
 const p=enemyPatterns(c);
 k.active=skill(c.boss?'보스 전술':'전술 공격',c.boss?p.map(key=>patterns[key]||patterns.aoe):[effect('damage','enemy',1.3)],c.boss?7:10);
 k.ultimate=skill('결전 공격',[effect('damage',c.boss?'enemies':'enemy',c.boss?1.3:2)],24,{initial:16});
 if(!c.boss)k.passive=skill('전투 태세',[effect('def_up','self',15,{duration:5})],15,{initial:0,trigger:'battle_start'});
 return normalize(k);
}
function studioCost(e){
 let v=e.value/100;
 if(['buff','debuff','atk_up','def_up','spd_up','crit_up','atk_down','def_down','spd_down','vulnerable','reduction','lifesteal','overheal','resist','dodge','threat','basic'].includes(e.type))v=e.value/20*e.duration/5;
 if(['multi','scatter','chain'].includes(e.type))v*=e.hits*(e.type==='chain'?Math.max(.25,1-e.decay/200):1);
 if(['dot','regen','support','follow'].includes(e.type))v*=e.duration/Math.max(.5,e.interval);
 if(['invincible','block','survive','ready','replace','immune'].includes(e.type))v=4;
 if(['gauge','delay','cooldown','cooldownUp','nextcool','sp'].includes(e.type))v=Math.max(.5,e.value/20+e.turns);
 if(['mark','consume','mode','record'].includes(e.type))v=.5;
 if(['stun','silence','confuse','noheal','taunt','focus'].includes(e.type))v=e.duration*.7;
 return Math.max(.1,v);
}
// One optional equipment passive modifies one saved passive/active effect at execution.
// The original kit and the pre-existing weapon stat / damage bonuses are untouched.
// Progression is owned-player data; saved skill designs always remain rank 1.
// Currency costs and XP requirements only; rewards and combat power are unchanged.
const GROWTH_COST_MULTIPLIER=3;
function growthCost(n){return Math.ceil(n*GROWTH_COST_MULTIPLIER);}
function levelExperience(level){return growthCost(level*100);}
function limitBreakCost(dup){return growthCost((dup+1)*5);}
function equipmentUpgradeCost(level){return {materials:growthCost(level?level*15:20),gold:growthCost((level+1)*2000)};}
const AFFINITY={step:100,max:999};
function migrateGrowthProgress(o){if(o.growthCostVersion>=1)return false;o.exp=Math.max(0,Number(o.exp)||0)*GROWTH_COST_MULTIPLIER;o.growthCostVersion=1;return true;}
const TRAINING={maxRank:7,maxMastery:3,rankMaterials:[0,10,15,20,30,40,60],rankGold:[0,1000,1500,2000,3000,4000,6000],masteryMaterials:[30,50,80],masteryGold:[5000,8000,12000],power:[1,1.04,1.08,1.12,1.16,1.20,1.25,1.32,1.40,1.50]};
function trainingState(raw={}){
 const rank=Math.round(clamp(raw?.rank,1,7,1)),mastery={};for(const slot of Object.keys(SLOTS))mastery[slot]=rank===7?Math.floor(clamp(raw?.mastery?.[slot],0,3,0)):0;return {rank,mastery};
}
function trainingLevel(raw,slot){const t=trainingState(raw);return t.rank+(t.mastery[slot]||0);}
function trainingPlan(raw,slot){
 const t=trainingState(raw),individual=!!SLOTS[slot],current=individual?t.mastery[slot]:t.rank,allowed=individual?t.rank===7&&current<3:current<7;
 return {kind:individual?'mastery':'rank',slot:individual?slot:null,current,next:allowed?current+1:current,allowed,materials:allowed?growthCost(individual?TRAINING.masteryMaterials[current]:TRAINING.rankMaterials[current]):0,gold:allowed?growthCost(individual?TRAINING.masteryGold[current]:TRAINING.rankGold[current]):0};
}
const INVINCIBILITY={durationScale:.5,maxDuration:2,minInterval:18,durationGrowth:.5,intervalReduction:1};
function invincibilityGrowth(training,slot){const progress=(trainingLevel(training,slot)-1)/9;return {progress,maxDuration:Math.round(INVINCIBILITY.maxDuration*(1+INVINCIBILITY.durationGrowth*progress)*1000)/1000,minInterval:Math.round((INVINCIBILITY.minInterval-INVINCIBILITY.intervalReduction*progress)*1000)/1000};}
const GROWTH_POWER=new Set(['damage','true_damage','multi','scatter','chain','dot','delayed','detonate','pierce','fixed','extra','basic','heal','heal_percent','regen','lifesteal','overheal','shield','follow','support']);
const GROWTH_STATS=new Set(['atk_up','def_up','atk_down','def_down','vulnerable','buff','debuff','resist','breakshield']);
const growthRound=n=>Math.round(n*1000000)/1000000;
// Small growth uses level progress, not a second multiplicative power curve.
function tinyGrowth(base,p,absolute,cap=Infinity){return growthRound(base+Math.max(0,Math.min(base*.05,absolute,cap-base))*p);}
// Only the four effects agreed for the automatic-generation progression table.
// Saved values are the Lv.10 endpoints. Apply this at every level, including Lv.1.
function endpointGrowthKind(e){
 if(e.type==='crit_up'||e.type==='buff'&&e.stat==='치명타 확률')return 'critical';
 if(e.type==='sp'||e.type==='reduction'||e.type==='spd_down'||e.type==='debuff'&&['받는 피해','행동 속도'].includes(e.stat))return 'double';
 return null;
}
function endpointGrowthValue(e,progress){return growthRound(e.value*(endpointGrowthKind(e)==='critical'?(2+progress)/3:(1+progress)/2));}
function growthValue(e,power,p){
 const base=e.value,spec=effectSpec(e);let cap=spec[3];
 const stat=['buff','debuff'].includes(e.type)?e.stat:'',mitigation=e.type==='reduction'||e.type==='dodge'||e.type==='debuff'&&stat==='받는 피해',speed=['spd_up','spd_down','crit_up'].includes(e.type)||['행동 속도','치명타 확률','치명타 피해'].includes(stat);
 if(e.type==='buff'&&stat==='받는 피해')return growthRound(base*(1-.05*p)); // Increasing damage received is a cost, not an upgrade.
 if(e.type==='lifesteal'&&e.studio||e.type==='overheal')return tinyGrowth(base,p,1,Math.min(spec[3],95));
 if(['sp','gauge','delay','revive','threat'].includes(e.type))return tinyGrowth(base,p,e.type==='sp'?.5:1,Math.min(spec[3],['gauge','delay'].includes(e.type)?95:spec[3]));
 if(e.type==='sacrifice')return growthRound(base*(1-.05*p));
 if(mitigation||speed){
  cap=Math.min(cap,30);
  // Keep existing high designs, but give them only up to 0.5 percentage points.
  if(base>=cap)return tinyGrowth(base,p,Math.min(.5,Math.max(0,(100-base)*.02)),Math.min(spec[3],95));
 }
 const finalFactor=mitigation?1.2:speed?1.1:GROWTH_STATS.has(e.type)?1.2:GROWTH_POWER.has(e.type)?1.5:1;
 const gain=Math.max(0,Math.min(Math.max(base,cap),base*finalFactor)-base);
 return growthRound(base+gain*(power-1)/.5);
}
function trainedSkill(input,slot,raw){
 const skill=clone(input),level=trainingLevel(raw,slot),power=TRAINING.power[level-1],p=(level-1)/9;
 const rotation=skill.effects.some(e=>['cleanse','dispel'].includes(e.type)),invincible=skill.effects.some(e=>e.type==='invincible');
 const timed=new Set(['block','survive','immune','element','stun','silence','taunt','focus','confuse','noheal','mark','mode','replace']);
 for(const e of skill.effects){
  if(e.type==='invincible'){const g=invincibilityGrowth(raw,slot);e.duration=Math.round(Math.max(.1,Math.min(INVINCIBILITY.maxDuration,e.duration*INVINCIBILITY.durationScale))*(1+INVINCIBILITY.durationGrowth*g.progress)*1000)/1000;e.invincibilityMaxDuration=g.maxDuration;e.invincibilityInterval=g.minInterval;}
  const endpoint=endpointGrowthKind(e);
  if(endpoint)e.value=endpointGrowthValue(e,p);
  if(level<=1)continue;
  if(!endpoint)e.value=growthValue(e,power,p);
  if(timed.has(e.type)&&!(slot==='passive'&&skill.trigger==='always')){
   // Control duration never grows across 90% of the repeating skill's time interval.
   const control=['stun','silence','taunt','confuse','noheal'].includes(e.type),cadence=Math.max(skill.cooldown,skill.trigger==='interval'?skill.triggerEvery:0,skill.lockout);
   const cap=control&&slot!=='ultimate'&&!['always','battle_start'].includes(skill.trigger)?Math.max(e.studio?e.duration:e.value,cadence*.9):180;
   if(!e.studio&&['stun','silence','taunt'].includes(e.type))e.value=tinyGrowth(input.effects[skill.effects.indexOf(e)].value,p,.1,Math.min(cap,effectSpec(e)[3]));
   else e.duration=tinyGrowth(e.duration,p,control?.1:.25,cap);
  }
  if(['cooldown','cooldownUp','nextcool'].includes(e.type)){
   if(e.studio)e.turns=tinyGrowth(e.turns,p,.1,60);else e.value=tinyGrowth(e.value,p,.1,effectSpec(e)[3]);
  }
  if(e.type==='record')e.cap=tinyGrowth(e.cap,p,50,1000000);
 }
 const repeating=slot!=='ultimate'&&!['always','battle_start'].includes(skill.trigger);
 // Pure cleanse keeps its count and gets the established 12% cadence improvement.
 // Mixed kits receive only a 2% cadence improvement; companions now grow normally.
 if(!invincible&&repeating&&(rotation||skill.effects.some(e=>['ready','consume'].includes(e.type)))){
  const pure=rotation&&skill.effects.every(e=>['cleanse','dispel'].includes(e.type)),rate=pure?[1,.99,.98,.96,.95,.94,.92,.91,.90,.88][level-1]:1-.02*p;
  const shorten=n=>growthRound(n-Math.min(n*(1-rate),pure?Infinity:.2));
  skill.cooldown=Math.max(DT,shorten(skill.cooldown));skill.initial=shorten(skill.initial);skill.lockout=shorten(skill.lockout);
  if(skill.trigger==='interval')skill.triggerEvery=Math.max(1,shorten(skill.triggerEvery));
 }
 if(invincible){const g=invincibilityGrowth(raw,slot),shorten=n=>Math.round((Math.max(n,INVINCIBILITY.minInterval)-INVINCIBILITY.intervalReduction*g.progress)*1000)/1000;skill.cooldown=shorten(skill.cooldown);skill.lockout=shorten(skill.lockout);if(skill.trigger==='interval')skill.triggerEvery=shorten(skill.triggerEvery);}
 return skill;
}
function trainedKit(input,raw){const base=normalize(input);return {...base,...Object.fromEntries(Object.keys(SLOTS).map(slot=>[slot,trainedSkill(base[slot],slot,raw)]))};}
function trainingInitialSP(raw){return growthRound((trainingLevel(raw,'ultimate')-1)*10/9);}
// Compare only fields consumed by this effect; changing unused JSON is not growth.
function trainingFingerprint(input,slot,raw){
 const s=trainedSkill(normalize(input)[slot],slot,raw),permanent=slot==='passive'&&s.trigger==='always',oneShot=permanent||s.trigger==='battle_start';
 return JSON.stringify({sp:slot==='ultimate'?trainingInitialSP(raw):0,cadence:oneShot?null:[s.initial,s.cooldown,s.lockout,s.trigger==='interval'?s.triggerEvery:0],effects:s.effects.map(e=>{
  const keys=e.studio?(Studio.EFFECTS[e.type]?.fields||['value']):['value',...(!['stun','silence','taunt'].includes(e.type)?['duration']:[])];
  return Object.fromEntries(keys.filter(k=>!(k==='duration'&&permanent&&e.type!=='invincible')).map(k=>[k,e[k]]));
 })});
}
function trainingChanges(input,before,after,slot){return (slot?[slot]:Object.keys(SLOTS)).some(k=>trainingFingerprint(input,k,before)!==trainingFingerprint(input,k,after));}

const EQUIPMENT_MODS={
 mark_stacks:{label:'표식 추가 중첩',min:1,max:1,step:1,unit:'중첩',value:1},
 hits:{label:'연속 공격 타수 추가',min:1,max:1,step:1,unit:'회',value:1},
 duration:{label:'효과 지속 시간 연장',min:.5,max:3,step:.5,unit:'초',value:1},
 potency:{label:'연계 효과 위력 증가',min:1,max:25,step:1,unit:'%',value:12},
 wounded:{label:'HP 50% 이하 대상에게 효과 강화',min:1,max:25,step:1,unit:'%',value:20},
 targets:{label:'무작위 적용 대상 추가',min:1,max:1,step:1,unit:'명',value:1},
 cleanse:{label:'해제하는 효과 수 추가',min:1,max:1,step:1,unit:'개',value:1}
};
function equipmentSkillSignature(input,slot){
 if(!['passive','active'].includes(slot))return '';
 const s=clone(normalize(input)[slot]);for(const key of ['name','description','fx','color','colorMode'])delete s[key];return JSON.stringify(s);
}
function equipmentChoices(c={}){
 const kit=normalize(c.skills||defaults(c)),out=[];
 for(const slot of ['passive','active'])kit[slot].effects.forEach((e,index)=>{
  const push=(modifier,score)=>out.push({sourceSlot:slot,effectIndex:index,modifier,score,...EQUIPMENT_MODS[modifier]});
  if(e.type==='mark'&&e.stacks<e.maxStacks)push('mark_stacks',100);
  if(e.studio&&['multi','scatter','chain'].includes(e.type)&&e.hits<30)push('hits',85);
  if(['random_enemies','random_allies'].includes(e.target)&&(e.targetCount||e.count)<(e.target==='random_enemies'?5:4))push('targets',70);
  const timed=['buff','debuff','atk_up','def_up','spd_up','crit_up','atk_down','def_down','spd_down','vulnerable','shield','dot','regen','support','stun','silence','taunt','mark','focus','resist'];
  if(timed.includes(e.type)&&e.duration<180&&!(slot==='passive'&&kit[slot].trigger==='always'))push('duration',['dot','regen','mark','buff','debuff'].includes(e.type)?75:55);
  if(['damage','true_damage','multi','scatter','chain','pierce','dot','heal','heal_percent','regen','shield','buff','debuff','atk_up','def_up','spd_up','crit_up','atk_down','def_down','spd_down','vulnerable','lifesteal','delayed','extra','detonate','fixed','follow','support'].includes(e.type)){
   push('potency',60);if(['damage','true_damage','multi','pierce','heal','heal_percent','shield'].includes(e.type))push('wounded',65);
  }
  if(['cleanse','dispel'].includes(e.type)&&(e.studio?e.count:e.value)<10)push('cleanse',75);
 });
 return out.sort((a,b)=>b.score-a.score||a.sourceSlot.localeCompare(b.sourceSlot)||a.effectIndex-b.effectIndex);
}
function equipmentValidate(c,raw){
 if(!raw||!['passive','active'].includes(raw.sourceSlot))return ['연계 스킬은 패시브 또는 액티브여야 합니다.'];
 const choice=equipmentChoices(c).find(x=>x.sourceSlot===raw.sourceSlot&&x.effectIndex===raw.effectIndex&&x.modifier===raw.modifier);
 if(!choice)return ['현재 연계 스킬에 적용할 수 없는 장비 효과입니다.'];
 if(!Number.isFinite(raw.value)||raw.value<choice.min||raw.value>choice.max||choice.step===1&&!Number.isInteger(raw.value))return ['장비 효과 수치는 '+choice.min+'~'+choice.max+choice.unit+' 범위입니다.'];
 return [];
}
function equipmentBind(c,raw){
 const errors=equipmentValidate(c,raw);if(errors.length)throw new Error(errors.join(' '));
 return {version:1,name:text(raw.name||'고유 공명',60),sourceSlot:raw.sourceSlot,effectIndex:raw.effectIndex,modifier:raw.modifier,value:raw.value,enabled:true,invalidated:false,sourceSignature:equipmentSkillSignature(c.skills||defaults(c),raw.sourceSlot),sourceRevision:c.skillRevisions?.[raw.sourceSlot]||0};
}
function equipmentDraft(c,choice=equipmentChoices(c)[0]){
 if(!choice)return null;const kit=normalize(c.skills||defaults(c));
 return equipmentBind(c,{...choice,name:text((c.weapon?.name||kit[choice.sourceSlot].name)+' · '+({mark_stacks:'새겨진 각인',hits:'이어지는 일격',duration:'남겨진 여운',potency:'깊어진 공명',wounded:'결정적 순간',targets:'퍼지는 기운',cleanse:'정화의 울림'}[choice.modifier]),60)});
}
function equipmentState(c={},level=1){
 const p=c.weapon?.passiveOption;if(!p)return {active:false,reason:'missing'};
 const changed=p.invalidated||p.sourceRevision!==(c.skillRevisions?.[p.sourceSlot]||0)||p.sourceSignature!==equipmentSkillSignature(c.skills||defaults(c),p.sourceSlot);
 if(changed)return {active:false,reason:'changed',needsReroll:true};
 const errors=equipmentValidate(c,p);if(errors.length)return {active:false,reason:'invalid',needsReroll:true,errors};
 return level>0?{active:true,reason:'active'}:{active:false,reason:'locked'};
}
function equipmentDescription(c,p=c.weapon?.passiveOption){
 if(!p)return '연계할 수 있는 패시브·액티브 효과가 없습니다.';
 const kit=normalize(c.skills||defaults(c)),s=kit[p.sourceSlot],e=s?.effects[p.effectIndex],n=Math.round(p.value*10)/10;
 const prefix=(p.sourceSlot==='passive'?'패시브':'액티브')+' 「'+(s?.name||'삭제된 스킬')+'」의 '+(e?effectSpec(e)[0]:'연계 효과');
 return prefix+'에 '+({mark_stacks:`표식 ${n}중첩 추가 (기존 최대 중첩 유지)`,hits:`타수 ${n}회 추가`,duration:`지속 시간 ${n}초 연장`,potency:`위력 ${n}% 증가`,wounded:`대상 HP 50% 이하일 때 위력 ${n}% 증가`,targets:`무작위 대상 ${n}명 추가`,cleanse:`해제 수 ${n}개 추가`}[p.modifier]||'알 수 없는 효과')+'.';
}
function equipmentEffect(u,e,slot,index,t){
 const p=u.gearOption;if(!p||slot==='ultimate'||p.sourceSlot!==slot||p.effectIndex!==index)return e;
 const out={...e},value=p.value;
 if(p.modifier==='mark_stacks')out.stacks=Math.min(e.maxStacks,e.stacks+value);
 if(p.modifier==='hits')out.hits=Math.min(30,e.hits+value);
 if(p.modifier==='duration'){if(!e.studio&&['stun','silence','taunt'].includes(e.type))out.value=Math.min(180,e.value+value);else out.duration=Math.min(180,e.duration+value);}
 if(p.modifier==='targets')out.targetCount=Math.min(e.target==='random_enemies'?5:4,(e.targetCount||e.count)+value);
 if(p.modifier==='cleanse'){if(e.studio)out.count=Math.min(10,e.count+value);else out.value=Math.min(10,e.value+value);}
 if(p.modifier==='potency'||p.modifier==='wounded'&&t.hp<=t.maxhp*.5)out.value=e.value*(1+value/100);
 return out;
}
function* inspectEquipment(character,option,options={}){
 const c=clone(character),errors=equipmentValidate(c,option);if(errors.length)throw new Error(errors.join(' '));
 const bound=equipmentBind(c,option),kit=normalize(c.skills||defaults(c)),gen=generation(c);let sum=0,baseSum=0,n=0;
 for(const lv of options.levels||[1,30,70])for(let scenario=0;scenario<3;scenario++)for(let seed=1;seed<=3;seed++){
  const allies=reference(lv,options.elems,gen),idx=c.role==='def'?0:c.role==='sup'?3:1,pool=reference(lv,options.elems,gen);if(scenario===2)pool.push({...pool[1]});
  const enemies=pool.slice(0,scenario===1?1:scenario===2?5:4).map((u,i)=>({...u,hp:u.hp*(scenario===1?7:1.7),atk:u.atk*(scenario===1?2.8:1.6),boss:scenario===1,skills:enemyKit({boss:scenario===1,name:'기준 적 '+i})})),m=1+.06*(lv-1);
  const unit={...allies[idx],hp:baseStats(c).hp*m,atk:clamp(c.atk,60,200,130)*m,def:baseStats(c).def*m,spd:clamp(c.spd,70,130,roleSpeed(c)),elem:c.elem||allies[idx].elem,faction:c.faction||'',skills:kit,skillRevisions:c.skillRevisions||{},skillTraining:trainingState(c.skillTraining),wlv:1};
  allies[idx]={...unit,weapon:{passiveOption:bound}};const a=run(allies,enemies,{seed,beats:options.beats});allies[idx]={...unit,weapon:{}};const b=run(allies,enemies,{seed,beats:options.beats});sum+=metric(a);baseSum+=metric(b);n++;yield {progress:n/((options.levels?.length||3)*9)};
 }
 const ratio=(sum+.2)/(baseSum+.2);return {option:bound,report:{trials:n,ratio:Math.round(ratio*100)/100,generation:gen,status:ratio>1.2?'strong':'within',note:'같은 스킬·능력치·장비 단계에서 고유 효과 유무만 비교한 파티 종합 성능입니다.'}};
}

function create(allies,enemies,options={}){
 const sim={allies,enemies,time:0,ticks:0,random:rng(options.seed||1),beats:options.beats||{},elems:options.elems||['홍','청','녹'],events:[],winner:null,auto:true,practice:options.practice===true,maxTime:options.practice===true?Infinity:options.maxTime||119,revivals:0,pending:[],depth:0,timedImpacts:options.timedImpacts===true,externalImpacts:options.externalImpacts===true,impactJobs:[],impactSeq:0};
 for(const [side,team] of [['a',allies],['e',enemies]])team.forEach((u,i)=>{
  u.side=side;u.slot=i;u.trainingDummy=sim.practice&&side==='e';u.maxhp=clamp(u.maxhp||u.hp,1,1e10,1000);u.hp=clamp(u.hp,0,u.maxhp,u.maxhp);u.atk=clamp(u.atk,1,1e8,100);u.def=clamp(u.def,0,1e8,50);u.spd=clamp(u.spd,10,300,100);u.mul=clamp(u.mul,.1,3,1);
  u.baseMaxhp=u.maxhp;u.baseElem=u.elem;u.faction=u.faction||u.c?.faction||'';
  u.sp=clamp(u.initialSP,0,100,0);u.lastSPHit=-Infinity;u.activeStarted=false;u.lastActiveProc=-1;u.g=sim.random()*400;u.sh=0;u.status=[];u.dmg=0;u.healing=0;u.revived=false;u.lastProc=-1;u.startedPassive=false;u.baseKit=normalize(u.skills||u.c?.skills||(side==='e'?enemyKit(u):defaults(u.c||u)));u.kit=trainedKit(u.baseKit,u.skillTraining);u.sp=Math.min(100,u.sp+trainingInitialSP(u.skillTraining));u.ready={};u.counts={};u.casts={passive:0,active:0,ultimate:0};u.lastCast={passive:-Infinity,active:-Infinity,ultimate:-Infinity};
  const owner=u.c||u;u.gearOption=equipmentState({...owner,skills:u.baseKit},u.wlv||0).active?clone(owner.weapon.passiveOption):null;
  u.meleeGroup=null;u.meleeUntil=0;u.meleeDelay=0;u.lastInvincibleAt=-Infinity;u.invincibilityReadyAt=-Infinity;u.lastDamageDealt=0;u.lastDamageTaken=0;u.lastHealing=0;u.lastBlocked=0;
  for(const slot of Object.keys(SLOTS))u.ready[slot]=slot==='ultimate'?0:u.kit[slot].initial;
 });
 outcome(sim);for(const u of [...allies,...enemies])if(['battle_start','always'].includes(u.kit.passive.trigger))cast(sim,u,'passive');
 outcome(sim);return sim;
}
function living(a){return a.filter(u=>u.hp>0);}
function teams(sim,u){return u.side==='a'?[sim.allies,sim.enemies]:[sim.enemies,sim.allies];}
function amount(u,type){return u.status.filter(s=>s.type===type).reduce((n,s)=>n+s.value,0);}
function bonus(u,name){return u.status.filter(s=>['buff','debuff'].includes(s.type)&&s.stat===name).reduce((n,s)=>n+s.value*(s.type==='debuff'?-1:1),0);}
function stat(u,name){const label={atk:'공격력',def:'방어력',spd:'행동 속도'}[name];return u[name]*Math.max(.2,Math.min(3,1+(amount(u,name+'_up')-amount(u,name+'_down')+bonus(u,label))/100));}
function isHarmful(s){return HARM.has(s.type);}
function syncUnit(u){
 const max=Math.max(1,Math.round(u.baseMaxhp*Math.max(.2,Math.min(3,1+bonus(u,'최대 HP')/100))));
 if(max!==u.maxhp){u.hp=Math.min(max,Math.max(u.hp>0?1:0,u.hp+max-u.maxhp));u.maxhp=max;}
 u.sh=Math.min(u.maxhp,u.status.filter(s=>s.type==='shield').reduce((n,s)=>n+s.value,0));
 u.elem=u.status.filter(s=>s.type==='element').slice(-1)[0]?.element||u.baseElem;
}
function markCount(u,name='낙인',caster=null,shared=true){return u.status.filter(s=>s.type==='mark'&&s.mark===name&&(shared||s.source===caster)).reduce((n,s)=>n+s.value,0);}
function consumeMarks(u,e,caster){let left=Math.floor(e.stacks),n=0;for(const s of u.status.filter(s=>s.type==='mark'&&s.mark===e.mark&&(e.owner==='아군끼리 공유'||s.source===caster))){const take=Math.min(left,s.value);s.value-=take;n+=take;left-=take;if(!left)break;}u.status=u.status.filter(s=>s.type!=='mark'||s.value>0);return n;}
function conditionPass(sim,u,t,e){
 const threshold=e.threshold??50,m=markCount(t,e.conditionMark||'낙인',u,e.owner==='아군끼리 공유');
 switch(e.condition){
 case 'self_low':return u.hp/u.maxhp*100<=threshold;
 case 'target_low':return t.hp/t.maxhp*100<=threshold;
 case 'has_mark':return m>0;case 'no_mark':return m===0;case 'mark_stacks':return m>=threshold;
 case 'has_shield':return t.sh>0;case 'no_shield':return t.sh<=0;
 case 'target_debuff':return t.status.some(isHarmful);case 'boss':return !!t.boss;
 case 'allies_below':return living(teams(sim,u)[0]).length<=threshold;
 case 'enemies_above':return living(teams(sim,u)[1]).length>=threshold;
 case 'self_mode':return u.status.some(s=>s.type==='mode'&&(!e.conditionMark||s.mark===e.conditionMark));
 default:return true;
 }
}
function sorted(sim,list,e){
 const a=[...list],p=e.priority||'HP 비율이 가장 낮은';
 const value=t=>p==='현재 HP가 가장 낮은'?-t.hp:p==='HP 비율이 가장 낮은'?-t.hp/t.maxhp:p==='HP 비율이 가장 높은'?t.hp/t.maxhp:p==='공격력이 가장 높은'?stat(t,'atk'):p==='방어력이 가장 높은'?stat(t,'def'):p==='속도가 가장 높은'?stat(t,'spd'):p==='표식 중첩이 가장 많은'?markCount(t,e.mark||'낙인'):0;
 if(p==='무작위'){for(let i=a.length-1;i>0;i--){const j=Math.floor(sim.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
 return a.sort((x,y)=>value(y)-value(x)||x.slot-y.slot);
}
function weighted(sim,pool){const taunts=pool.filter(t=>amount(t,'taunt')>0),focus=pool.filter(t=>amount(t,'focus')>0),a=taunts.length?taunts:focus.length?focus:pool;const weight=t=>(t.role==='def'?3:1)*(t.slot<2?2:1)*Math.max(.1,1+amount(t,'threat')/100);let r=sim.random()*a.reduce((n,t)=>n+weight(t),0);for(const t of a){r-=weight(t);if(r<=0)return [t];}return a.slice(-1);}
function targets(sim,u,e){
 const [friends,foes]=teams(sim,u),a=living(friends),confused=amount(u,'confuse')>0,b=confused?living(friends.filter(x=>x!==u)):living(foes);
 const one=list=>sorted(sim,list,e).slice(0,1),fallback=t=>t?.hp>0?[t]:e.fallback==='남은 효과 종료'?[]:one(e.target==='last_healed'?a:b);
 switch(e.target){
 case 'self':return u.hp>0?[u]:[];case 'allies':return a;case 'other_allies':return a.filter(t=>t!==u);case 'ally':return one(a);case 'dead_ally':return friends.filter(t=>t.hp<=0&&!t.revived).slice(0,1);case 'enemies':return b;
 case 'weak_enemy':return sorted(sim,b,{...e,priority:'HP 비율이 가장 낮은'}).slice(0,1);case 'strong_enemy':return [...b].sort((x,y)=>stat(y,'atk')-stat(x,'atk')).slice(0,1);case 'front_enemy':return b.slice(0,1);
 case 'random_enemies':return sorted(sim,b,{...e,priority:'무작위'}).slice(0,Math.floor(e.targetCount??e.count??1));case 'random_allies':return sorted(sim,a,{...e,priority:'무작위'}).slice(0,Math.floor(e.targetCount??e.count??1));
 case 'last_target':return fallback(u.lastTarget);case 'attacker':return fallback(u.lastAttacker);case 'last_healed':return fallback(u.lastHealed);
 case 'marked_enemies':return b.filter(t=>markCount(t,e.mark||e.conditionMark||'낙인',u,e.owner==='아군끼리 공유')>0);
 case 'same_element':return a.filter(t=>t.elem===u.elem);case 'same_faction':return a.filter(t=>t.faction===u.faction);
 case 'role_allies':return a.filter(t=>t.role===({'공격형':'atk','방어형':'def','지원형':'sup'}[e.role]||e.role));case 'slot_ally':return a.filter(t=>t.slot===e.slot-1);
 default:return e.priority?one(b):weighted(sim,b);
 }
}
function emit(sim,event){if(sim.events.length<256)sim.events.push(event);}
function proc(sim,u,type,ctx={}){
 if(u.hp<=0||sim.depth>=3)return;
 u.counts[type]=(u.counts[type]||0)+1;
 if(ctx.target)u.lastTarget=ctx.target;if(ctx.attacker)u.lastAttacker=ctx.attacker;
 if(type==='on_hit'&&sim.time-u.lastSPHit>=SP.hitGap){gainSP(sim,u,SP.hit);u.lastSPHit=sim.time;}
 for(const slot of ['passive','active']){
  const s=u.kit[slot];if(s.trigger!==type||slot==='active'&&type==='after_active')continue;
  if(['after_basic','attack_hit','on_hit','critical'].includes(type)&&u.counts[type]%Math.max(1,Math.round(s.triggerEvery))!==0)continue;
  const key=slot==='passive'?'lastProc':'lastActiveProc';if(u[key]===sim.ticks)continue;
  u[key]=sim.ticks;sim.depth++;try{cast(sim,u,slot);}finally{sim.depth--;}
 }
}
function record(u,label,value){for(const s of u.status)if(s.type==='record'&&s.recordSource===label)s.value=Math.min(s.cap,s.value+Math.max(0,value));}
function basisValue(sim,u,t,e){
 const records=()=>u.status.filter(s=>s.type==='record'&&(!e.mark||s.mark===e.mark)&&(e.basis==='기록한 회복량'?s.recordSource==='실제 회복량':e.basis==='기록한 방어량'?s.recordSource==='보호막이 막은 피해':['실제로 받은 HP 피해','실제로 준 HP 피해'].includes(s.recordSource))).reduce((n,s)=>n+s.value,0);
 switch(e.basis){case '시전자 방어력':return stat(u,'def');case '시전자 최대 HP':return u.maxhp;case '시전자 현재 HP':return u.hp;case '시전자 잃은 HP':return u.maxhp-u.hp;case '대상 최대 HP':return t.maxhp;case '대상 잃은 HP':return t.maxhp-t.hp;case '실제로 준 피해':return u.lastDamageDealt;case '실제로 받은 피해':return u.lastDamageTaken;case '기록한 피해량':case '기록한 회복량':case '기록한 방어량':return records();case '표식 중첩 수':return markCount(t,e.mark||'낙인',u,e.owner==='아군끼리 공유');case '고정 수치':return 100;default:return stat(u,'atk');}
}
function scaled(sim,u,t,e){return Math.max(0,basisValue(sim,u,t,e)*e.value/100);}
function removeStatus(u,s){const i=u.status.indexOf(s);if(i>=0)u.status.splice(i,1);syncUnit(u);}
function damage(sim,u,t,value,trueDamage=false,react=true,options={}){
 if(t.hp<=0)return 0;
 if(sim.timedImpacts&&!options.landed&&!options.periodic){
  const visual={...(options.visual||{kind:'damage',phase:'hit'}),flightOrigin:options.origin};
  const raw=options.raw??stat(u,'atk')*u.mul*value;
  queueImpact(sim,u,t,options.slot,visual,!!options.basic,job=>damage(sim,u,t,value,trueDamage,react,{...options,raw,landed:true,visual:{...visual,landed:true,intentStyle:job.plan.style,hitIndex:job.plan.index,slashAngle:job.plan.angle}}));return 0;
 }
 const el=sim.beats[u.elem]===t.elem?1.5:sim.beats[t.elem]===u.elem?.75:1;
 const crit=!options.periodic&&!options.fixed&&sim.random()<Math.max(0,Math.min(1,.1+(amount(u,'crit_up')+bonus(u,'치명타 확률'))/100));
 if(!options.periodic&&sim.random()<Math.min(1,amount(t,'dodge')/100)){emit(sim,{type:'status',source:u,target:t,label:'회피',visual:{kind:'dodge',phase:'proc'}});return 0;}
 let multiplier=options.fixed?1:1+(bonus(u,'주는 피해')+bonus(u,options.basic?'일반 공격 피해':options.slot==='ultimate'?'필살기 피해':options.slot==='active'?'액티브 피해':'')+(el>1?bonus(u,'약점 공격 피해'):0))/100;
 if(options.basic)multiplier*=1+amount(u,'basic')/100;
 let d=options.raw??stat(u,'atk')*u.mul*value;
 if(!options.periodic&&!options.fixed)d*=el*(crit?Math.max(1,1.5+bonus(u,'치명타 피해')/100):1)*(.9+sim.random()*.2);
 if(!trueDamage&&!options.periodic)d*=100/(100+stat(t,'def')*(1-(options.penetration||0)/100));
 d=Math.max(0,Math.round(d*Math.max(.1,multiplier)*Math.max(0,1+(Math.min(100,amount(t,'vulnerable'))+bonus(t,'받는 피해'))/100-Math.min(100,amount(t,'reduction'))/100)));
 if(options.bossCap)d=Math.min(d,t.maxhp*.25);
 const block=t.status.find(s=>s.type==='block'&&s.remaining>0);
 if(amount(t,'invincible')>0||block){if(block&&--block.remaining<=0)removeStatus(t,block);emit(sim,{type:'damage',source:u,target:t,value:0,crit:false,slot:options.slot,basic:!!options.basic,impact:!!options.landed,periodic:!!options.periodic,delayed:!!options.delayed,visual:options.visual,origin:options.origin,blocked:true,guard:amount(t,'invincible')?'invincible':'block'});return 0;}
 const shieldBefore=t.sh,blocked=Math.min(t.sh,d);d-=blocked;
 let left=blocked;for(const sh of t.status.filter(s=>s.type==='shield')){const n=Math.min(sh.value,left);sh.value-=n;left-=n;}syncUnit(t);
 u.lastBlocked=blocked;t.lastBlocked=blocked;record(t,'보호막이 막은 피해',blocked);
 if(shieldBefore>0&&t.sh<=0)proc(sim,t,'shield_break',{attacker:u});
 if(!t.trainingDummy&&d>=t.hp&&t.hp>0){proc(sim,t,'lethal',{attacker:u});const survive=t.status.find(s=>s.type==='survive'&&s.remaining>0);if(amount(t,'invincible')>0)d=0;else if(survive){emit(sim,{type:'visualProc',source:t,target:t,visual:{kind:'survive',phase:'proc'}});d=Math.max(0,t.hp-Math.min(t.maxhp,survive.hpRemain));if(--survive.remaining<=0)removeStatus(t,survive);}}
 const actual=t.trainingDummy?d:Math.min(t.hp,d);if(!t.trainingDummy)t.hp=Math.max(0,t.hp-d);u.dmg+=actual;u.lastDamageDealt=actual;t.lastDamageTaken=actual;u.lastTarget=t;t.lastAttacker=u;
 record(u,'실제로 준 HP 피해',actual);record(t,'실제로 받은 HP 피해',actual);emit(sim,{type:'damage',source:u,target:t,value:actual,crit,slot:options.slot,basic:!!options.basic,impact:!!options.landed,periodic:!!options.periodic,delayed:!!options.delayed,visual:options.visual,origin:options.origin,blocked:blocked,guard:blocked?'shield':null});
 if(options.legacyLifesteal&&u.hp>0)heal(sim,u,u,actual*.3,true,{...options.visual,kind:'lifesteal',phase:'return',origin:t});
 if(u.hp>0&&amount(u,'lifesteal')>0)heal(sim,u,u,actual*Math.min(100,amount(u,'lifesteal'))/100,false,{kind:'lifesteal',phase:'return',origin:t});
 if(t.hp<=0){emit(sim,{type:'down',target:t});if(react)proc(sim,u,'kill',{target:t});for(const f of teams(sim,t)[0])if(f!==t)proc(sim,f,'ally_down',{attacker:u});}
 else if(react&&actual+blocked>0)proc(sim,t,'on_hit',{attacker:u});
 if(react&&actual+blocked>0)for(const f of teams(sim,t)[0])if(f!==t)proc(sim,f,'ally_hit',{attacker:u});
 if(react&&actual+blocked>0){proc(sim,u,'attack_hit',{target:t});if(crit)proc(sim,u,'critical',{target:t});
  for(const f of teams(sim,u)[0])for(const s of [...f.status])if(s.type==='follow'&&s.next<=sim.time&&f.hp>0&&t.hp>0){s.next=sim.time+Math.max(DT,s.interval);damage(sim,s.source,t,0,false,false,{raw:s.value,slot:s.slot,visual:{kind:'follow',phase:'hit'}});}
 }
 return actual;
}
function heal(sim,u,t,h,react=true,visual=null){
 if(sim.timedImpacts&&visual&&!visual.landed&&visual.phase!=='tick'&&visual.phase!=='return'){
  queueImpact(sim,u,t,visual.slot,visual,false,job=>heal(sim,u,t,h,react,{...visual,landed:true,intentStyle:job.plan.style}));return 0;
 }
 if(t.hp<=0||amount(t,'noheal')>0)return 0;
 h=Math.max(0,Math.round(h*Math.max(.1,1+bonus(u,'주는 회복량')/100)*Math.max(.1,1+bonus(t,'받는 회복량')/100)));
 const n=Math.min(t.maxhp-t.hp,h),over=h-n;t.hp+=n;u.healing+=n;u.lastHealing=n;u.lastHealed=t;record(u,'실제 회복량',n);emit(sim,{type:'heal',source:u,target:t,value:n,visual});
 for(const s of t.status.filter(s=>s.type==='overheal'))if(over>0){const value=Math.min(s.cap,over*s.value/100);addStatus(sim,s.source,t,{...s.effect,type:'shield',basis:'고정 수치',value},s.slot,value);emit(sim,{type:'visualProc',source:s.source,target:t,visual:{kind:'overheal',phase:'convert'}});}
 if(react&&n>0){proc(sim,u,'heal_given',{target:t});proc(sim,t,'heal_received',{target:t});}return n;
}
function addStatus(sim,u,t,e,slot,value=e.value){
 if(e.type==='invincible'){
  const ready=t.invincibilityReadyAt??((t.lastInvincibleAt??-Infinity)+INVINCIBILITY.minInterval);if(sim.time+1e-6<ready)return;
  const interval=clamp(e.invincibilityInterval,INVINCIBILITY.minInterval-INVINCIBILITY.intervalReduction,INVINCIBILITY.minInterval,INVINCIBILITY.minInterval),cap=clamp(e.invincibilityMaxDuration,INVINCIBILITY.maxDuration,INVINCIBILITY.maxDuration*(1+INVINCIBILITY.durationGrowth),INVINCIBILITY.maxDuration);
  t.lastInvincibleAt=sim.time;t.invincibilityReadyAt=sim.time+interval;
  e={...e,duration:Math.min(cap,e.duration)};
 }
 const shared=e.owner==='아군끼리 공유',id=(shared?u.side:u.side+u.slot)+':'+slot+':'+e.type+':'+(e.mark||'')+':'+(e.stat||'')+':'+(e.skillSlot||'');
 const old=t.status.filter(s=>s.id===id),max=e.studio?(e.reapply==='독립적으로 적용'?Math.min(99,e.stacks||1):1):e.stacks;
 if(e.type==='mark'){
  const found=t.status.find(s=>s.type==='mark'&&s.mark===e.mark&&(shared||s.source===u));
  if(found){found.value=Math.min(e.maxStacks,found.value+e.stacks);found.until=sim.time+e.duration;proc(sim,t,'mark_threshold');if(t!==u)proc(sim,u,'mark_threshold',{target:t});return;}
  value=Math.min(e.maxStacks,e.stacks);
 }else if(old.length>=max){if(e.reapply==='강한 효과만 유지'&&old[0].value>value)return;t.status.splice(t.status.indexOf(old[0]),1);}
 if(t.status.length>=96)t.status.shift();
 const duration=!e.studio&&['stun','silence','taunt'].includes(e.type)?e.value:e.duration;
 t.status.push({id,type:e.type,value,until:slot==='passive'&&u.kit.passive.trigger==='always'&&e.type!=='invincible'?sim.maxTime+1:sim.time+duration,next:sim.time+Math.max(DT,e.interval||1),source:u,slot,mark:e.mark,stat:e.stat,status:e.status||e.type,remaining:Math.round(e.hits||1),hpRemain:e.hpRemain||1,cap:e.cap,recordSource:e.recordSource,skillSlot:e.skillSlot,sourceSlot:e.sourceSlot,element:typeof e.element==='string'&&e.element.includes('번째')?sim.elems[e.element.includes('첫')?0:e.element.includes('두')?1:2]||u.baseElem:e.element,freeze:e.freeze,removable:e.removable!=='해제 불가',interval:e.interval||1,effect:clone(e)});
 syncUnit(t);emit(sim,{type:'status',source:u,target:t,label:Studio.EFFECTS[e.type]?.name||EFFECTS[e.type][0]});
 if(e.type==='mark'){proc(sim,t,'mark_threshold');if(t!==u)proc(sim,u,'mark_threshold',{target:t});}
}
function skillSlots(e){return e.skillSlot==='액티브와 필살기'?['active','ultimate']:e.skillSlot==='액티브'?['active']:['ultimate'];}
function statusBlocked(sim,u,t,e){
 if(!HARM.has(e.type))return false;
 const status=['dot','stun'].includes(e.type)?e.status:e.type==='confuse'?'혼란':e.type;
 const matches=s=>s.status==='전체 상태이상'||s.status===status;
 return t.status.some(s=>s.type==='immune'&&matches(s))||sim.random()*100<Math.min(100,t.status.filter(s=>s.type==='resist'&&matches(s)).reduce((n,s)=>n+s.value,0));
}
function apply(sim,u,t,e,slot,effectIndex=-1){
 e=equipmentEffect(u,e,slot,effectIndex,t);
 if(sim.random()*100>=e.chance||!conditionPass(sim,u,t,e)||statusBlocked(sim,u,t,e))return;
 const visual={slot,id:(sim.visualSeq=(sim.visualSeq||0)+1),kind:e.type,status:e.status,stat:e.stat,mark:e.mark,hits:e.hits,targetRule:e.target,trigger:u.kit[slot].trigger,phase:e.type==='delayed'?'prepare':'apply'};
 emit(sim,{type:'effect',source:u,target:t,slot,...visual,visual,fx:u.kit[slot].fx,color:u.kit[slot].color});
 let v=e.value;
 if(e.studio){
  const raw=()=>scaled(sim,u,t,e),hit=(target=t,factor=1,extra={})=>damage(sim,u,target,0,e.type==='fixed',slot!=='passive',{raw:(e.type==='fixed'?v:scaled(sim,u,target,e))*factor,fixed:e.type==='fixed',penetration:e.type==='pierce'?e.penetration:0,slot,visual,...extra,bossCap:e.basis==='대상 최대 HP'&&t.boss});
  switch(e.type){
  case 'damage':case 'extra':case 'pierce':case 'fixed':hit();return;
  case 'multi':case 'scatter':case 'chain':{
   let previous=u;const selected=new Set();for(let i=0;i<Math.round(e.hits);i++){
    let target=t;if(e.type==='scatter')target=targets(sim,u,e)[0];else if(e.type==='chain')target=sorted(sim,living(teams(sim,u)[1]).filter(x=>!selected.has(x)),e)[0];
    if(!target||target.hp<=0){if(e.fallback==='남은 효과 종료')return false;target=targets(sim,u,{...e,target:'enemy'})[0];}if(!target)break;selected.add(target);hit(target,e.type==='chain'?Math.pow(1-e.decay/100,i):1,{visual:{...visual,phase:'hit',hitIndex:i,hitTotal:Math.round(e.hits)},origin:e.type==='chain'?previous:u});previous=target;if(u.hp<=0)break;
   }return;}
  case 'delayed':if(sim.pending.length<256)sim.pending.push({at:sim.time+e.delay,source:u,target:t,e:clone(e),slot,visual});return;
  case 'detonate':{const n=e.consume===false?Math.min(e.stacks,markCount(t,e.mark,u,e.owner==='아군끼리 공유')):consumeMarks(t,e,u);if(n)hit(t,n);return;}
  case 'consume':consumeMarks(t,e,u);return;
  case 'heal':heal(sim,u,t,raw(),true,visual);return;
  case 'dot':case 'regen':case 'support':case 'follow':addStatus(sim,u,t,e,slot,raw());return;
  case 'shield':addStatus(sim,u,t,e,slot,Math.min(t.maxhp,raw()*Math.max(.1,1+bonus(u,'보호막 생성량')/100)));return;
  case 'sp':gainSP(sim,t,v,u);return;
  case 'gauge':t.g=Math.min(1999,t.g+v*10);return;case 'delay':t.g=Math.max(0,t.g-v*10);return;
  case 'cooldown':case 'cooldownUp':case 'ready':for(const key of skillSlots(e))if(key==='ultimate'){gainSP(sim,t,e.type==='ready'?100:(e.type==='cooldownUp'?-1:1)*e.turns*5,u);}else t.ready[key]=e.type==='ready'?sim.time:Math.max(sim.time,t.ready[key]+e.turns*(e.type==='cooldown'?-1:1));return;
  case 'breakshield':{const before=t.sh;for(const s of t.status.filter(s=>s.type==='shield'))s.value*=1-v/100;syncUnit(t);if(before>0&&t.sh<=0)proc(sim,t,'shield_break',{attacker:u});return;}
  case 'cleanse':case 'dispel':{let n=Math.round(e.count);const before=t.sh;t.status=t.status.filter(s=>!(s.removable!==false&&(e.type==='cleanse'?isHarmful(s):!isHarmful(s))&&n-->0));syncUnit(t);if(before>0&&t.sh<=0)proc(sim,t,'shield_break',{attacker:u});return;}
  case 'sacrifice':{const n=Math.min(Math.max(0,u.hp-1),u.hp*v/100);u.hp-=Math.round(n);return;}
  case 'mark':case 'record':addStatus(sim,u,t,e,slot,e.type==='record'?0:e.stacks);return;
  case 'invincible':case 'block':case 'survive':case 'mode':case 'immune':case 'taunt':case 'focus':case 'confuse':case 'noheal':case 'silence':case 'stun':case 'element':case 'replace':addStatus(sim,u,t,e,slot,1);return;
  default:addStatus(sim,u,t,e,slot);return;
  }
 }
 switch(e.type){
 case 'damage':case 'true_damage':damage(sim,u,t,v,e.type==='true_damage',slot!=='passive',{slot,visual});break;
 case 'lifesteal':{const d=damage(sim,u,t,v,false,slot!=='passive',{slot,visual,legacyLifesteal:sim.timedImpacts});if(!sim.timedImpacts&&u.hp>0)heal(sim,u,u,d*.3,true,{...visual,phase:'return',origin:t});break;}
 case 'heal':heal(sim,u,t,stat(u,'atk')*v,true,visual);break;
 case 'heal_percent':heal(sim,u,t,t.maxhp*v/100,true,visual);break;
 case 'cleanse':case 'dispel':{let n=Math.round(v);t.status=t.status.filter(s=>!(s.removable!==false&&(e.type==='cleanse'?isHarmful(s):!isHarmful(s))&&n-->0));break;}
 case 'sp':gainSP(sim,t,v,u);break;
 case 'cooldown':gainSP(sim,t,v*SP.max/20,u);break;
 case 'revive':if(t.hp<=0&&!t.revived){t.hp=t.maxhp*v/100;t.revived=true;t.status=[];t.sh=0;sim.revivals++;emit(sim,{type:'revive',source:u,target:t,visual});}break;
 default:if(e.type==='shield')v=Math.min(t.maxhp,stat(u,'atk')*v);if(e.type==='dot'||e.type==='regen')v=stat(u,'atk')*v;addStatus(sim,u,t,e,slot,v);
 }
 syncUnit(t);
}
function isSilenced(u,slot){return u.status.some(s=>s.type==='silence'&&(!s.effect?.studio||skillSlots(s.effect).includes(slot)));}
function cast(sim,u,slot){
 if(u.trainingDummy||u.hp<=0||sim.winner||sim.time+1e-6<u.ready[slot]||amount(u,'stun')||isSilenced(u,slot))return false;
 const s=u.kit[slot];
 if(slot==='ultimate'&&((u.sp||0)<SP.max||sim.time-u.lastCast.ultimate<1))return false;
 if(s.limit&&u.casts[slot]>=s.limit||sim.time-u.lastCast[slot]+1e-6<s.lockout)return false;
 if(slot!=='ultimate'&&['battle_start','always'].includes(s.trigger)&&(slot==='passive'?u.startedPassive:u.activeStarted))return false;
 if(slot!=='ultimate'&&s.trigger==='hp_below'&&u.hp/u.maxhp*100>s.threshold)return false;
 if(slot!=='ultimate'&&s.trigger==='mark_threshold'&&Math.max(markCount(u,s.triggerMark),u.lastTarget?markCount(u.lastTarget,s.triggerMark):0)<s.threshold)return false;
 if(slot==='ultimate')u.sp=0;
 u.ready[slot]=sim.time+(slot==='ultimate'?1:Math.max(DT,s.cooldown,s.trigger==='interval'?s.triggerEvery:0));
 if(slot==='active'&&['battle_start','always'].includes(s.trigger))u.activeStarted=true;
 u.lastCast[slot]=sim.time;u.casts[slot]++;if(slot==='passive'&&['battle_start','always'].includes(s.trigger))u.startedPassive=true;
 for(const next of [...u.status])if(next.type==='nextcool'&&skillSlots(next.effect).includes(slot)&&next.remaining>0){if(slot==='ultimate')gainSP(sim,u,Math.min(30,next.effect.turns*5));else u.ready[slot]=Math.max(sim.time+DT,u.ready[slot]-next.effect.turns);if(--next.remaining<=0)removeStatus(u,next);}
 emit(sim,{type:'cast',source:u,slot,name:s.name,fx:s.fx,color:s.color});
 if(slot==='ultimate')record(u,'필살기 사용 횟수',1);
 const replacement=u.status.filter(x=>x.type==='replace'&&skillSlots(x.effect).includes(slot)).slice(-1)[0];
 const effects=replacement?u.kit[replacement.sourceSlot].effects.filter(e=>e.type!=='replace'):s.effects;
 effectLoop:for(const [effectIndex,e] of effects.entries()){if(u.hp<=0)break;const targeting=!replacement&&u.gearOption?.modifier==='targets'?equipmentEffect(u,e,slot,effectIndex,u):e;const list=targets(sim,u,targeting);if(!list.length&&e.fallback==='남은 효과 종료')break;for(const t of list){if(u.hp<=0)break;if(t.hp<=0&&e.type!=='revive')continue;if(apply(sim,u,t,['damage','true_damage','multi','scatter','chain','pierce','delayed','extra','detonate'].includes(e.type)?{...e,value:e.value*(1+.05*(u.wlv||0))}:e,slot,replacement?-1:effectIndex)===false)break effectLoop;}}
 if(slot==='active'){gainSP(sim,u,SP.active);proc(sim,u,'after_active');}
 if(slot==='ultimate'){proc(sim,u,'after_ultimate');for(const ally of teams(sim,u)[0])if(ally!==u)proc(sim,ally,'ally_ultimate');}
 return true;
}
function outcome(sim){if(sim.impactJobs.length&&sim.time<sim.maxTime&&(!living(sim.allies).length||!living(sim.enemies).length))return;if(!living(sim.allies).length)sim.winner='enemies';else if(!living(sim.enemies).length)sim.winner='allies';else if(sim.time>=sim.maxTime)sim.winner='timeout';}
function step(sim,auto=true){
 sim.events=[];if(sim.winner)return sim.events;sim.time+=DT;sim.ticks++;
 if(sim.externalImpacts){for(const job of sim.impactJobs)if(!job.announced&&sim.events.length<256){emit(sim,job.intent);job.announced=true;}}
 else if(sim.timedImpacts)for(const job of [...sim.impactJobs])if(job.at<=sim.time+1e-6)commitImpact(sim,job.id);
 const due=sim.pending.filter(x=>x.at<=sim.time);sim.pending=sim.pending.filter(x=>x.at>sim.time);
 for(const job of due){const t=job.target.hp>0?job.target:job.e.fallback==='남은 효과 종료'?null:targets(sim,job.source,{...job.e,target:'enemy'})[0];if(t)damage(sim,job.source,t,0,false,false,{raw:scaled(sim,job.source,t,job.e),slot:job.slot,delayed:true,visual:{...job.visual,phase:'hit'}});}
 for(const u of [...sim.allies,...sim.enemies]){
  if(u.hp<=0)continue;
  const expired=u.status.filter(s=>s.until<=sim.time);u.status=u.status.filter(s=>s.until>sim.time);syncUnit(u);
  for(const s of expired)proc(sim,u,'status_expired');
  for(const s of [...u.status])if(['dot','regen','support'].includes(s.type)&&s.next<=sim.time){s.next+=Math.max(DT,s.interval);if(s.type==='dot'){damage(sim,s.source,u,0,true,false,{raw:s.value,periodic:true,slot:s.slot,visual:{kind:'dot',status:s.effect?.status,phase:'tick'}});}if(['regen','support'].includes(s.type))heal(sim,s.source,u,s.value,true,{kind:s.type,phase:'tick'});if(u.hp<=0)break;}
  if(u.hp<=0)continue;
  if(u.trainingDummy)continue;
  gainSP(sim,u,SP.perSecond*DT);
  const stopped=amount(u,'stun')>0,freeze=u.status.some(s=>s.type==='stun'&&s.freeze==='게이지 충전도 정지');
  if(!freeze)u.g=Math.min(1999,u.g+stat(u,'spd'));
  if(stopped)continue;
  if(['interval','hp_below','battle_start','always'].includes(u.kit.passive.trigger))cast(sim,u,'passive');
  if(['interval','hp_below','battle_start','always'].includes(u.kit.active.trigger))cast(sim,u,'active');if((auto&&u.kit.ultimate.auto)||u.side==='e')cast(sim,u,'ultimate');
  if(u.hp<=0)continue;
  if(u.g>=1000){
   u.g-=1000;proc(sim,u,'action_start');
   if(u.hp>0&&!amount(u,'stun')){gainSP(sim,u,SP.basic);record(u,'일반 공격 횟수',1);const t=targets(sim,u,{target:'enemy'})[0];if(t){if(u.hp>0&&t.hp>0)damage(sim,u,t,1,false,true,{basic:true});if(u.hp>0)proc(sim,u,'after_basic',{target:t});for(const s of [...u.status])if(s.type==='basic'&&--s.remaining<=0)removeStatus(u,s);}}
   proc(sim,u,'action_end');
  }
  outcome(sim);if(sim.winner)break;
 }
 outcome(sim);return sim.events;
}
function run(a,e,options={}){const sim=create(clone(a),clone(e),{timedImpacts:true,...options});while(!sim.winner)step(sim,true);return {win:sim.winner==='allies',time:sim.time,survival:sim.allies.reduce((n,u)=>n+u.hp/u.maxhp,0)/Math.max(1,a.length),damage:sim.allies.reduce((n,u)=>n+u.dmg,0),damageProgress:Math.min(1,sim.allies.reduce((n,u)=>n+u.dmg,0)/Math.max(1,sim.enemies.reduce((n,u)=>n+u.maxhp,0))),timeout:sim.winner==='timeout'};}
function reference(level=1,elems=['홍','청','녹'],gen=1){const m=1+.06*(level-1);return ['def','atk','atk','sup'].map((role,i)=>({name:'기준 '+role,role,elem:elems[i%elems.length],hp:Math.round((role==='def'?2560:1100)*m),atk:Math.round((role==='atk'?150:110)*m),def:Math.round((role==='def'?143:50)*m),spd:roleSpeed({name:'기준 '+role,role,elem:elems[i%elems.length]}),generation:gen,skills:generationDefaults({role,generation:gen})}));}
function metric(r){return (r.damageProgress||0)*.4+(r.win?1:0)+r.survival*.5+(r.win?Math.max(0,1-r.time/119)*.25:0);}
function* inspectSkill(character,options={}){
 const kit=normalize(character.skills||defaults(character)), base=generationDefaults(character), levels=options.levels||[1,30,70];let sum=0,baseSum=0,wins=0,baseWins=0,n=0;
 for(const lv of levels){for(let scenario=0;scenario<3;scenario++){for(let seed=1;seed<=3;seed++){
  const a=reference(lv,options.elems,generation(character)),idx=character.role==='def'?0:character.role==='sup'?3:1;
  const pool=reference(lv,options.elems,generation(character));if(scenario===2)pool.push({...pool[1]});const e=pool.slice(0,scenario===1?1:scenario===2?5:4).map((u,i)=>({...u,hp:u.hp*(scenario===1?7:1.7),atk:u.atk*(scenario===1?2.8:1.6),boss:scenario===1,skills:enemyKit({boss:scenario===1,name:'기준 적 '+i})}));
  const m=1+.06*(lv-1);const candidate={...a[idx],faction:character.faction||'',hp:baseStats(character).hp*m,atk:clamp(character.atk,60,200,130)*m,def:baseStats(character).def*m,spd:clamp(character.spd,70,130,roleSpeed(character)),elem:character.elem||a[idx].elem,skills:kit};
  a[idx]=candidate;const r=run(a,e,{seed,beats:options.beats});a[idx]={...candidate,skills:SLOTS[options.referenceSlot]?{...kit,[options.referenceSlot]:base[options.referenceSlot]}:base};const b=run(a,e,{seed,beats:options.beats});sum+=metric(r);baseSum+=metric(b);wins+=+r.win;baseWins+=+b.win;n++;yield {progress:n/27};
 }}}
 const ratio=(sum+.2)/(baseSum+.2),checked=SLOTS[options.referenceSlot]?[options.referenceSlot]:Object.keys(SLOTS);return {kit,report:{version:VERSION,ruleset:RULESET,trials:n,ratio:Math.round(ratio*100)/100,winRate:wins/n,referenceWinRate:baseWins/n,generation:generation(character),slotBudgets:GENERATIONS[generation(character)],slotCosts:Object.fromEntries(Object.keys(SLOTS).map(slot=>[slot,slotCost(kit[slot],slot)])),budget:Math.round(budget(kit)*10)/10,status:ratio>1.3||checked.some(slot=>slotCost(kit[slot],slot)>GENERATIONS[generation(character)][slot]*1.05)?'strong':ratio<.7?'weak':'within',note:options.referenceSlot?'다른 두 스킬은 동일하게 두고 선택 슬롯을 비교합니다. 역할별 기준 편성·세대·고정 난수의 추정치입니다.':'선택 세대 기준 편성·레벨·고정 난수 비교. 모든 조합의 균형을 보장하지 않습니다.'}};
}
function weakenGeneratedSkill(s,factor){
 for(const e of s.effects){
  e.value=clamp(e.value*factor,effectSpec(e)[2],effectSpec(e)[3],e.value);
  if(VALUELESS_CONTROL.has(e.type))e.duration=Math.max(.1,e.duration*factor);
  else if(['buff','debuff','atk_up','def_up','spd_up','crit_up','reduction','dot','regen','shield'].includes(e.type))e.duration=Math.max(.1,e.duration*.85);
 }
 s.cooldown=Math.min(60,Math.max(4,s.cooldown)*1.15);if(s.trigger==='interval')s.triggerEvery=Math.min(60,Math.max(s.cooldown,s.triggerEvery));
}
const VALUELESS_CONTROL=new Set(['stun','silence','taunt','cleanse','dispel']);
function* balanceSkill(character,options={}){
 const c=clone(character);let result,beforeRatio,nerfPasses=0;c.skills=aiPolicy(c.skills||defaults(c),c);
 for(let pass=0;pass<6;pass++){
  c.skills=aiPolicy(c.skills,c);result=yield* inspectSkill(c,options);beforeRatio??=result.report.ratio;
  if(result.report.status!=='strong')break;
  if(pass<5){nerfPasses++;const factor=Math.max(.3,Math.min(.75,1.1/Math.max(1,result.report.ratio)));for(const slot of Object.keys(SLOTS))weakenGeneratedSkill(c.skills[slot],factor);}
 }
 if(result.report.status==='strong'){
  c.skills=generationDefaults(c);result=yield* inspectSkill(c,options);result.report.fallbackReason='너프 후에도 세대 기준을 초과하여 같은 세대의 기본 설계로 재구성했습니다.';
 }
 result.report.beforeRatio=beforeRatio;result.report.nerfPasses=nerfPasses;return result;
}
// Compare against the same partners, and only weaken the requested generated slot.
function* balanceSlot(character,slot,options={}){
 if(!SLOTS[slot])throw new Error('알 수 없는 스킬 슬롯입니다.');
 const c=clone(character),original=clone(c.skills),passes=options.aiPolicy?6:3;let result,beforeRatio,nerfPasses=0;
 for(let pass=0;pass<passes;pass++){
  if(options.aiPolicy)c.skills=aiPolicy(c.skills,c,slot);
  const g=inspectSkill(c,{...options,referenceSlot:slot});let stepResult;
  do{stepResult=g.next();if(!stepResult.done)yield {...stepResult.value,pass:pass+1,passes};}while(!stepResult.done);
  result=stepResult.value;beforeRatio??=result.report.ratio;result.kit={...clone(original),[slot]:clone(c.skills[slot])};result.report.slot=slot;result.report.tuningPasses=pass+1;
  if(result.report.status!=='strong'||pass===passes-1)break;
  nerfPasses++;weakenGeneratedSkill(c.skills[slot],Math.max(.3,Math.min(.75,1.1/Math.max(1,result.report.ratio))));
 }
 result.report.beforeRatio=beforeRatio;result.report.nerfPasses=nerfPasses;return result;
}
function* balanceEncounter(enemies,level,options={}){
 if(!enemies.length)return {enemies:[],report:{skipped:true}};
 const original=clone(enemies),a=reference(level,options.elems,options.generation||1);let lo=.08,hi=8,best=null;
 for(let iteration=0;iteration<9;iteration++){
  const scale=(lo+hi)/2,e=original.map(u=>u.manual?u:{...u,hp:Math.max(100,Math.round(u.hp*scale)),atk:Math.max(10,Math.round(u.atk*scale)),def:Math.max(0,Math.round(u.def*scale))});
  let wins=0,survival=0,time=0;
  for(let seed=1;seed<=8;seed++){const r=run(a,e,{seed:seed+41,beats:options.beats});wins+=+r.win;survival+=r.survival;time+=r.time;yield {iteration,progress:(iteration*8+seed)/72};}
  const rate=wins/8,score=Math.abs(rate-.625)+Math.abs(survival/8-.25)*.15;
  if(!best||score<best.score)best={score,enemies:e,report:{version:2,ruleset:RULESET,trials:8,searchTrials:(iteration+1)*8,level,winRate:rate,survival:survival/8,seconds:time/8,scale,manual:original.filter(e=>e.manual).length}};
  if(rate>.625)lo=scale;else hi=scale;
 }
 best.report.searchTrials=72;best.report.targetReached=best.report.winRate>=.5&&best.report.winRate<=.75;return best;
}
function prompt(){return `스킬 JSON은 skills:{version:2,passive,active,ultimate}. 슬롯은 {name,description,cooldown,initial,trigger,triggerEvery,threshold,triggerMark,limit,lockout,auto,fx,color,effects:[...]}. 시간은 초 기준, active는 interval,after_basic,on_hit,attack_hit,critical,hp_below 중 선택. ultimate는 SP100 충전 발동. passive 조건 ${JSON.stringify(TRIGGERS)}. 추가 효과 sp는 studio:false, value1~30 SP를 아군에게 회복. AI 효과 1~3개, 단순한 주효과와 보조효과만. 무한 자원/피해 비례 증폭/기록 연계 금지. ${JSON.stringify(Studio.EFFECTS)}. 효과 기본 형식 ${JSON.stringify(defaultEffect())}. target ${JSON.stringify(TARGETS)}, priority ${JSON.stringify(Studio.PRIORITY)}, condition ${JSON.stringify(CONDITIONS)}, basis ${JSON.stringify(Studio.BASIS)}, stat ${JSON.stringify(Studio.STATS)}. studio:true 필수, value는 기준값의 백분율(고정 수치 기준이면 절대값). duration .1~180초, chance1~100, stacks1~99,hits1~30, interval .1~180초, cooldown .17~180초(패시브0가능). skillSlot은 액티브|필살기|액티브와 필살기. replace는 sourceSlot passive|active|ultimate에서 대상 슬롯과 다른 하나를 선택. mark/record/mode 이름과 조건 이름을 일치시켜 연계. 공격은 적, 지원은 아군 대상. BURST는 제거됐으므로 생성 금지. 예시 ${JSON.stringify(defaults())}`;}
const api={GROWTH_COST_MULTIPLIER,growthCost,levelExperience,limitBreakCost,equipmentUpgradeCost,AFFINITY,migrateGrowthProgress,CHARACTER_BASE_STATS,generateBaseStats,baseStats,migrateBaseStats,IMPACT,isRanged,impactPlan,landImpact,endpointGrowthKind,trainingChanges,trainingFingerprint,invincibilityGrowth,INVINCIBILITY,TRAINING,trainingState,trainingLevel,trainingPlan,trainedSkill,trainedKit,trainingInitialSP,EQUIPMENT_MODS,equipmentSkillSignature,equipmentChoices,equipmentValidate,equipmentBind,equipmentDraft,equipmentState,equipmentDescription,inspectEquipment,Visuals,skillVisual,FX_TYPES,FX_COLORS,roleSpeed,conceptText,isHealer,AI_EFFECT_LIMITS,aiLimits,aiRole,aiRecipes,aiDesign,GENERATIONS,generation,slotCost,aiPolicy,generationDefaults,SP,gainSP,VERSION,RULESET,DT,SLOTS,TARGETS,TRIGGERS,CONDITIONS,EFFECTS,Studio,OFFENSIVE,effectSpec,defaultEffect,fromDesign,isSilenced,targets,conditionPass,basisValue,clone,normalize,validate,defaults,budget,bounded,enemyPatterns,enemyKit,create,step,cast,run,reference,inspectSkill,balanceSkill,balanceSlot,balanceEncounter,prompt};
root.GGMCombat=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
