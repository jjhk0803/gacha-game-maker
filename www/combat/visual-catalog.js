/* Complete, DOM-free vocabulary of combat visuals. No combat rules live here. */
(function(root){
'use strict';
const legacyGroups={
 '자동':['효과별 자동'],
 '공격 · 투사체':['빛줄기','타격 파동','마력탄','화살','총탄','화염구','빙결창','번개','참격','별빛 폭발','연속 참격','유도 산탄','연쇄 전격','관통 광창','시한 폭탄','낙인 파열'],
 '회복 · 방어':['회복 광휘','생명 순환','흡혈 궤적','보호막','방벽 전개','절대 방호','수호 날개','부활 기둥','보호막 파쇄'],
 '강화 · 약화':['상승 기운','쇠약 파문','정화 빛비','강화 박리','면역 결계','속성 전환','전투 각성','무기 잔상'],
 '지속 · 제어':['독 안개','화상 불씨','감전 잔류','빙결 감옥','속박 사슬','기절 별무리','침묵 봉인','회복 금지','혼란 소용돌이','회피 잔영','도발 신호','조준 표적'],
 '자원 · 연계':['SP 별조각','가속 시계','감속 시계','재장전 섬광','예약 시계','표식 각인','기록 마법진','표식 흡수','지원 궤도','생명 제물','스킬 전환']
};
const profiles={};
function put(keys,style,family,icon,color,motion){for(const kind of keys.split(' '))profiles[kind]={style,family,icon,color,motion};}
put('damage','마력탄','attack','✦','#a878ff','시전자에서 실제 피격 대상으로 전달');
put('true_damage fixed pierce','관통 광창','pierce','◇','#edf6ff','대상을 꿰뚫는 창과 갈라지는 타격선');
put('multi','연속 참격','combo','Ⅲ','#ff6b91','실제 타수에 맞춘 연속 타격');
put('scatter','유도 산탄','scatter','⋰','#ffba66','타격마다 실제 선택된 대상으로 분산 이동');
put('chain','연쇄 전격','chain','ϟ','#ffd166','직전 피격 대상에서 다음 대상으로 연결');
put('delayed','시한 폭탄','delayed','◷','#ffad66','예고 원과 남은 시간, 실제 발동 시 폭발');
put('detonate','낙인 파열','detonate','✹','#f783d2','중첩 표식이 안으로 수렴한 뒤 파열');
put('extra','별빛 폭발','extra','✧','#f783d2','일반 타격에 별 모양 추가 섬광');
put('dot','독 안개','dot','☁','#9bdc67','지속 상태와 실제 피해 주기의 작은 분출');
put('basic','무기 잔상','weapon','⚔','#ffd166','강화 오라와 남은 강화 공격 횟수');
put('heal heal_percent','회복 광휘','heal','+','#39d9b0','대상으로 모이는 빛과 상승하는 회복 십자');
put('regen','생명 순환','regen','✚','#39d9b0','순환 고리와 실제 회복 주기의 잎빛');
put('support','지원 궤도','support','◌','#4cc9f0','지원 위성과 주기 회복 파동');
put('lifesteal','흡혈 궤적','drain','♥','#ef476f','흡혈 준비 표시와 실제 회복 시 돌아오는 생명 구체');
put('overheal','방벽 전개','overheal','+◇','#39d9b0','회복광이 보호막의 윤곽으로 전환');
put('shield','보호막','shield','⬡','#5688ff','육각 장벽과 현재 흡수량');
put('reduction','방벽 전개','reduction','▰','#5688ff','겹쳐지는 방패와 방어 파문');
put('block','절대 방호','block','▣','#edf6ff','방어 판과 남은 무효화 횟수');
put('invincible','절대 방호','invincible','∞','#ffe39b','금색 방호 구와 무적 표시');
put('survive','수호 날개','survive','✥','#ffd166','수호 날개와 치명상 생존 순간의 섬광');
put('revive','부활 기둥','revive','↑✚','#ffe39b','상승하는 빛기둥과 회복 날개');
put('buff atk_up def_up spd_up crit_up','상승 기운','buff','↑','#ffce6b','능력치 문양과 위로 오르는 화살');
put('debuff atk_down def_down spd_down vulnerable','쇠약 파문','debuff','↓','#c191ff','능력치 문양과 아래로 내리는 파문');
put('cleanse','정화 빛비','cleanse','✧','#b1f3e8','위에서 떨어지는 빛비와 사라지는 상태 조각');
put('dispel','강화 박리','dispel','⌁','#ba99ff','바깥으로 벗겨져 흩어지는 강화 조각');
put('breakshield','보호막 파쇄','shatter','⬡╱','#ffba66','육각 장벽이 여러 조각으로 갈라짐');
put('immune resist','면역 결계','immune','◎','#4cc9f0','반격자 결계와 상태 저항 문양');
put('element','속성 전환','element','◈','#a878ff','새 속성색으로 바뀌는 프리즘');
put('stun','기절 별무리','stun','★','#ffd166','머리 위 별의 회전, 빙결·속박·마비는 별도 형태');
put('silence','침묵 봉인','silence','⊘','#ba99ff','스킬 문양을 가로막는 봉인 고리');
put('noheal','회복 금지','noheal','✚╱','#ef476f','회복 십자를 가로지르는 금지선');
put('confuse','혼란 소용돌이','confuse','?','#f783d2','서로 엇갈려 도는 물음표와 소용돌이');
put('dodge','회피 잔영','dodge','≋','#4cc9f0','옆으로 빠지는 반투명 잔상');
put('taunt threat','도발 신호','taunt','!','#ff6b35','시선을 끄는 신호파와 느낌표');
put('focus','조준 표적','focus','⊕','#ef476f','좁혀지는 조준선과 표적 고리');
put('sp','SP 별조각','sp','✦SP','#ffe39b','대상 궁극기 버튼 쪽으로 들어가는 금빛 조각');
put('gauge spd_up','가속 시계','haste','»','#4cc9f0','시곗바늘과 앞으로 움직이는 화살');
put('delay','감속 시계','slow','«','#ba99ff','뒤로 돌아가는 시곗바늘과 감속 고리');
put('cooldown','가속 시계','cooldown','◷−','#4cc9f0','줄어드는 대기 고리와 재충전 빛');
put('cooldownUp','감속 시계','cooldown_up','◷+','#c191ff','늘어나는 대기 고리와 억제 문양');
put('ready','재장전 섬광','ready','✓','#ffe39b','닫히는 준비 고리와 완성 섬광');
put('nextcool','예약 시계','nextcool','◷✓','#4cc9f0','다음 발동 예약 고리와 남은 횟수');
put('sacrifice','생명 제물','sacrifice','♥−','#ef476f','자신에게 수렴하는 붉은 조각');
put('mark','표식 각인','mark','⌖','#f783d2','표식 문양과 중첩 수');
put('consume','표식 흡수','consume','⌖−','#f783d2','표식 조각이 중심으로 흡수');
put('record','기록 마법진','record','▤','#4cc9f0','기록 룬과 누적 기록값');
put('mode','전투 각성','mode','✺','#ffd166','발밑 각성 원과 상승 오라');
put('replace','스킬 전환','replace','⇄','#a878ff','겹친 두 문양이 교차하며 전환');
put('follow','지원 궤도','follow','↗','#4cc9f0','연계 준비 궤도와 실제 추가 공격의 연결선');
const STATES={독:['독 안개','☁','#9bdc67'],화상:['화상 불씨','♨','#ff6b35'],감전:['감전 잔류','ϟ','#ffd166'],빙결:['빙결 감옥','❄','#4cc9f0'],속박:['속박 사슬','⛓','#ba99ff'],마비:['감전 잔류','ϟ','#ffd166'],기절:['기절 별무리','★','#ffd166']};
const STAT_ICONS={'공격력':'⚔','방어력':'⬡','최대 HP':'♥','행동 속도':'»','치명타 확률':'✧','치명타 피해':'✹','주는 피해':'✦','받는 피해':'◇','주는 회복량':'✚','받는 회복량':'♥','보호막 생성량':'▰','일반 공격 피해':'⚔','액티브 피해':'A','필살기 피해':'U','약점 공격 피해':'◎'};
const ATTACK=new Set(['damage','true_damage','multi','scatter','chain','delayed','detonate','pierce','fixed','extra']);
function resolve(e={},choice='효과별 자동',color){
 const p={...(profiles[e.kind||e.type]||profiles.damage)},kind=e.kind||e.type||'damage';
 if((kind==='dot'||kind==='stun'&&['빙결','속박','마비','기절'].includes(e.status))&&STATES[e.status]){const [style,icon,c]=STATES[e.status];Object.assign(p,{style,icon,color:c});}
 if(['buff','debuff'].includes(kind))p.icon=(STAT_ICONS[e.stat]||'✧')+(kind==='buff'?'↑':'↓');
 const legacyStat={atk_up:'공격력',def_up:'방어력',spd_up:'행동 속도',crit_up:'치명타 확률',atk_down:'공격력',def_down:'방어력',spd_down:'행동 속도',vulnerable:'받는 피해'}[kind];if(legacyStat)p.icon=STAT_ICONS[legacyStat]+(kind.endsWith('_down')?'↓':'↑');if(kind==='resist')p.icon='◎%';
 if(e.phase==='tick')p.tick=true;
 const automatic=!choice||choice==='효과별 자동';
 // Explicit appearance applies to every effect. Kind still controls hit count and targeting.
 if(!automatic&&STYLE_NAMES.includes(choice))p.style=choice;
 const styleFamily=Object.values(profiles).find(v=>v.style===p.style)?.family;
 if(/^#[0-9a-f]{6}$/i.test(color||''))p.color=color;
 return {...p,kind,automatic,styleFamily,signature:kind+':'+(e.stat||'')+':'+(e.status||'')};
}
const STYLE_NAMES=Object.values(legacyGroups).flat();
const groups={'자동':['효과별 자동'],'공격 · 투사체':['참격','타격 파동','마력탄','화살','총탄','화염구','빙결창','번개'],'회복 · 방어':['회복 광휘','보호막','정화 빛비','부활 기둥'],'강화 · 제어':['상승 기운','쇠약 파문','빙결 감옥','속박 사슬','침묵 봉인','독 안개'],'표식 · 자원':['SP 별조각','표식 각인','기록 마법진'],'특수 공격':['연쇄 전격','낙인 파열','시한 폭탄']};
const PRESET_NAMES=Object.values(groups).flat();
function preset(value){if(PRESET_NAMES.includes(value))return value;const p=Object.values(profiles).find(p=>p.style===value);if(!p)return '효과별 자동';return {pierce:'빙결창',combo:'참격',scatter:'총탄',extra:'타격 파동',weapon:'참격',regen:'회복 광휘',support:'회복 광휘',drain:'회복 광휘',overheal:'보호막',reduction:'보호막',block:'보호막',invincible:'보호막',survive:'보호막',immune:'보호막',element:'표식 각인',dodge:'타격 파동',confuse:'독 안개',focus:'표식 각인',taunt:'표식 각인',haste:'상승 기운',slow:'쇠약 파문',cooldown:'상승 기운',cooldown_up:'쇠약 파문',ready:'SP 별조각',nextcool:'SP 별조각',consume:'낙인 파열',mode:'상승 기운',replace:'표식 각인',follow:'연쇄 전격',sacrifice:'낙인 파열',shatter:'타격 파동'}[p.family]||'효과별 자동';}
const api={PRESET_NAMES,preset,groups,profiles,STATES,STAT_ICONS,STYLE_NAMES,ATTACK,resolve};root.GGMVisuals=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
