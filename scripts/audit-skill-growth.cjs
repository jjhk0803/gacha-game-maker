#!/usr/bin/env node
// Reproducible catalog-wide audit. This is not a dump of the user's device roster.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),C=require('../www/combat/core');
const out=path.join(__dirname,'../validation');fs.mkdirSync(out,{recursive:true});
const t=lv=>({rank:Math.min(lv,7),mastery:Object.fromEntries(Object.keys(C.SLOTS).map(k=>[k,Math.max(0,lv-7)]))}),round=n=>Math.round(n*100)/100;
const modes=[['passive','interval'],['passive','always'],['passive','battle_start'],['active','interval'],['active','after_basic'],['ultimate','interval']];
const variants=[...Object.keys(C.Studio.EFFECTS).map(type=>({type,studio:true})),...Object.keys(C.EFFECTS).filter(type=>!['burst','burstgain','burstsuppress'].includes(type)&&C.EFFECTS[type][3]<100000).map(type=>({type,studio:false}))];
const rows=[],all=[];let comparisons=0;
for(const variant of variants){
 const effect=C.defaultEffect(variant.type,{studio:variant.studio,value:variant.studio?20:C.EFFECTS[variant.type][4],duration:4,turns:2,hits:1,count:1});if(!variant.studio)delete effect.studio;
 const row={...variant,label:C.effectSpec(effect)[0],noChange:[],changes:[]};
 for(const [slot,trigger]of modes){const k=C.defaults();Object.assign(k[slot],{effects:[effect],trigger,cooldown:10,triggerEvery:trigger==='after_basic'?3:10,initial:0,lockout:0});const no=[];
  for(let lv=1;lv<10;lv++){comparisons++;if(!C.trainingChanges(k,t(lv),t(lv+1),slot))no.push(lv+'→'+(lv+1));}
  const a=C.trainedKit(k,t(1))[slot],b=C.trainedKit(k,t(10))[slot],fields=Object.keys(b.effects[0]).filter(key=>a.effects[0][key]!==b.effects[0][key]);
  const entry={...variant,slot,trigger,noChangeSteps:no,changes:fields.map(key=>({field:key,from:a.effects[0][key],to:b.effects[0][key]})),cooldown:[a.cooldown,b.cooldown],startSP:slot==='ultimate'?[0,10]:null};all.push(entry);
  if(no.length)row.noChange.push(slot+'/'+trigger+' ('+no.join(', ')+')');if(slot==='active'&&trigger==='interval')row.changes=[...entry.changes.map(v=>`${v.field}: ${round(v.from)}→${round(v.to)}`),...(a.cooldown!==b.cooldown?[`cooldown: ${a.cooldown}→${b.cooldown}`]:[])];
 }
 rows.push(row);
}
// Numeric boundaries are separate from the nominal full-catalog table above.
const boundaries=[];
for(const variant of variants)for(const valueCase of ['min','nominal','max'])for(const duration of [.1,4,180]){
 const e=C.defaultEffect(variant.type,{studio:variant.studio,duration});if(!variant.studio)delete e.studio;const spec=C.effectSpec(e);e.value=valueCase==='min'?spec[2]:valueCase==='max'?spec[3]:variant.studio?20:spec[4];
 const k=C.defaults();Object.assign(k.active,{trigger:'interval',cooldown:10,triggerEvery:10,initial:0,effects:[e]});const no=[];
 for(let lv=1;lv<10;lv++){if(!C.trainingChanges(k,t(lv),t(lv+1),'active'))no.push(lv+'→'+(lv+1));const grown=C.trainedKit(k,t(lv+1)).active.effects[0];for(const v of Object.values(grown))if(typeof v==='number')assert.ok(Number.isFinite(v));assert.ok(grown.value<=spec[3]);assert.ok(grown.duration<=180);assert.equal(grown.chance,e.chance);assert.equal(grown.hits,e.hits);}
 boundaries.push({...variant,valueCase,value:e.value,duration,noChangeSteps:no});
}
// Scan default kits and every role/generation recipe with permitted extras.
const recipes=[];let battles=0;
for(let gen=1;gen<=5;gen++)for(const role of ['atk','def','sup','healer']){
 const c={name:'조사 '+gen+' '+role,role:role==='healer'?'sup':role,profile:role==='healer'?'동료를 치료하는 치유사':'',generation:gen},base=C.generationDefaults(c);
 for(const slot of Object.keys(C.SLOTS))for(const [id,recipe]of [['default',null],...Object.entries(C.aiRecipes(c,slot))]){
  let k=C.clone(base);if(recipe)k[slot]=C.aiDesign(c,slot,{recipe:id,power:100,extras:recipe.extras});k=C.aiPolicy(k,c,slot);
  const no=[];for(let lv=1;lv<10;lv++)if(!C.trainingChanges(k,t(lv),t(lv+1),slot))no.push(lv+'→'+(lv+1));
  const result={gen,role,slot,recipe:id,noChangeSteps:no,wins:[0,0],timeouts:[0,0],meanSeconds:[0,0]};
  for(const [index,training]of [t(1),t(10)].entries())for(let seed=1;seed<=3;seed++){
   const team=C.reference(30,undefined,gen),i=c.role==='def'?0:c.role==='sup'?3:1;team[i].skills=k;team[i].skillTraining=training;
   const r=C.run(team,C.reference(30,undefined,gen),{seed,maxTime:60});assert.ok(Number.isFinite(r.time)&&Number.isFinite(r.damage));result.wins[index]+=+r.win;result.timeouts[index]+=+r.timeout;result.meanSeconds[index]+=r.time/3;battles++;
  }
  recipes.push(result);
 }
}
// Reproduce two pre-existing manual-design hazards without changing the user's designs.
const unit=skills=>({name:'audit',hp:10000,atk:100,def:0,skills});
let k=C.defaults();k.passive.trigger='always';k.passive.effects=[C.defaultEffect('stun',{target:'enemy',duration:1,status:'기절'})];let sim=C.create([unit(k)],[unit(C.defaults())],{maxTime:60});const permanentControl=sim.enemies[0].status.find(s=>s.type==='stun');
k=C.defaults();k.passive.trigger='always';k.passive.effects=[C.defaultEffect('reduction',{target:'allies',value:60})];sim=C.create([unit(k),unit(k)],[unit(C.defaults())],{maxTime:60});const stackedReduction=sim.allies[0].status.filter(s=>s.type==='reduction').reduce((n,s)=>n+s.value,0);
assert.ok(permanentControl?.until>60);assert.equal(stackedReduction,120);
const data={version:'2026.10.17.13',variants:variants.length,effectTypes:Object.keys(C.EFFECTS).length,comparisons,boundaryCases:boundaries.length,boundaries,cases:all,recipeCases:recipes.length,battles,recipeNoGrowth:recipes.filter(r=>r.noChangeSteps.length),recipes,risks:{permanentControl:{durationConfigured:1,actualUntil:permanentControl.until},stackedReduction:{sum:stackedReduction,effectiveCap:100}}};
fs.writeFileSync(path.join(out,'skill-growth-audit.json'),JSON.stringify(data,null,2)+'\n');
const labels={value:'위력/비율',duration:'지속시간',turns:'대기 조절량',cap:'기록 상한',invincibilityMaxDuration:'무적 상한',invincibilityInterval:'무적 제한'};
const table=rows.map(r=>`| ${r.type} (${r.studio?'현행':'구형'}) | ${r.label} | ${r.changes.map(s=>s.replace(/^(\w+):/,(_,k)=>(labels[k]||k)+':')).join('; ')||'효과 고정'} | ${r.noChange.length?r.noChange.map(s=>s.replace(/ \(.*\)/,'')).join(', '):'없음'} |`).join('\n');
const md=`# 스킬 성장 전수 점검 · 2026.10.17.13

## 조사 범위와 한계

현행 효과 ${Object.keys(C.Studio.EFFECTS).length}종과 구형 저장 형식의 수치 효과를 함께 조사했습니다. 총 ${variants.length}개 형식, 6개 슬롯/발동 구성, 인접한 9개 레벨 구간으로 ${comparisons}회 비교했습니다. 구형/현행이 겹치므로 형식 수와 효과 종류 수는 다릅니다. 추가로 최소/기본/최대 수치와 지속 0.1/4/180초를 조합한 ${boundaries.length}개 경계 구성도 검사해 유한한 값·상한·고정 확률/타수를 확인했습니다. 전체 엔진 효과 키는 ${Object.keys(C.EFFECTS).length}개입니다. 구형 전용 유형을 현행 효과로 잘못 취급하지 않았습니다.

사용자 휴대전화에 저장된 캐릭터 목록은 제공되지 않았습니다. 이 문서는 엔진이 지원하는 효과 전체와 내장 AI 설계 메뉴의 조사입니다. 임의의 5개 효과·장비·파티 조합 전부를 완전 탐색한 결과는 아닙니다.

수치 비교는 실제 실행에 쓰이는 필드, 스킬 주기, 궁극기 시작 SP를 비교했습니다. 상시 패시브의 의미 없는 지속시간 변화는 제외했습니다. 시간은 엔진의 0.17초 단위로 처리되고 피해·회복은 정수로 계산되므로 아주 작은 성장이 매 타격/매 전투의 결과를 반드시 바꾸지는 않습니다. 조건을 만족하지 못하거나 표식 등 연계 대상이 없는 스킬은 별도로 실효성이 없을 수 있습니다.

## 이번 변경

- 스킬 설명·수치 입력·강화 전후·시작 SP·상태 잔여시간을 소수점 둘째 자리까지 반올림해 표시합니다. 끝의 불필요한 0은 생략합니다. 예: 435.599999999%→435.6%, 1.234초→1.23초. 내부 계산값은 표시용으로 반올림하지 않습니다.
- 피해·회복·보호막의 위력 성장은 기존 최대 50%를 유지합니다. 지속 피해/회복은 지속시간·주기·타수를 늘리지 않습니다.
- 정화·해제 개수는 고정합니다. 단독 구성은 기존 최대 12% 사용 주기 단축을 유지합니다. 복합 구성은 동반 효과가 정상 성장하며, 주기는 최대 2%·0.2초만 단축합니다. 이벤트 조건의 평타/피격 필요 횟수는 고정합니다.
- SP 지원은 최대 5%·0.5 SP 중 작은 값, 행동 게이지는 최대 5%·1%p 중 작은 값만 증가합니다.
- 흡혈 비율·초과 회복 전환·부활 회복량·피격 우선도는 최대 5%·1%p 중 작은 값만 증가합니다. 부활 횟수는 늘리지 않습니다.
- 기절·침묵·도발·혼란·회복 차단은 최대 5%·0.1초만 늘립니다. 반복형은 성장으로 지속시간이 자체 시간 간격의 90%를 넘지 않게 제한합니다. 이는 다른 시전자와의 제어 연계나 사건 기반 발동의 실제 주기를 보장하는 규칙은 아닙니다.
- 횟수형 피해 무효·생존·면역·속성 변경·집중 공격·표식·모드·스킬 교체는 횟수/종류를 고정하고 지속시간만 최대 5%·0.25초 늘립니다. 상시 적용이라 의미 없는 지속시간은 늘리지 않습니다.
- 대기시간 조절은 조절량만 최대 5%·0.1초 증가합니다. 즉시 준비·표식 소모는 반복형에서 사용 주기를 최대 2%·0.2초만 단축합니다. 기록은 저장 상한만 최대 5%·50 증가합니다.
- HP 희생 및 받는 피해 증가라는 불이익은 레벨업으로 더 커지지 않도록 5% 줄입니다.
- 피해 감소/회피/속도/치명타가 이미 민감 구간에 있으면 추가 증가를 최대 0.5%p로 제한합니다. 80%는 80.4%, 치명타 31.5%는 32%가 됩니다. 상한에 일찍 닿아 중간 레벨이 낭비되지 않도록 최종 도달값까지 분배합니다. 이미 하드캡 이상인 수동 설계는 더 높이지 않습니다.
- 궁극기 시작 SP는 Lv.1의 0에서 Lv.10의 10까지 매 단계 증가합니다. 전문화 1·2단계의 빈 구간이 사라집니다. 사용 비용은 여전히 SP 100입니다.
- 무적은 이전 합의 그대로 Lv.1 최대 2초/최소 18초→Lv.10 최대 3초/최소 17초입니다. 대상별 재적용 제한도 유지합니다.
- 실제 실행 필드가 달라지지 않는 전문화는 '추가 성장 없음'으로 막고, 확인 직전에도 재검사해 재료를 소비하지 않습니다. 공통 레벨은 다른 스킬과 시작 SP가 성장할 수 있으므로 개별 효과가 고정이어도 진행 가능합니다.

## 여전히 성장하지 않을 수 있는 경우

1. 상시 면역·상시 속성/모드/표식 등 이미 영구인 이진 상태: 지속을 늘려도 이득이 없습니다.
2. 전투 시작에 단 한 번 발동하는 정화/해제/즉시 준비/소모: 횟수 증가 없이 늘릴 수치나 반복 주기가 없습니다. 동반 회복·버프가 있으면 그 부분은 성장합니다.
3. 이미 최대 회복 비율, 자원 상한, 피해 계수 하드캡 등에 닿은 수동 설정: 더 올리지 않습니다.
4. 단순히 '자신의 표식을 소모'하는 것만 있는 스킬처럼 성장을 수치화해도 도움이 없는 설계: 연계 효과가 없으면 여전히 의미가 없습니다. 조건/표식 이름을 맞춰야 합니다.
5. 제어 지속이 이미 반복 간격의 90% 이상인 설정: 지속 추가 성장은 막습니다. 원래 긴 지속 자체는 유지합니다.
6. 표시가 0.01 미만으로 변하는 매우 작은 시작값, 혹은 0.17초 전투 갱신 단위보다 작은 변화: 내부 수치는 달라도 화면이나 실제 발동 시점이 같은 단계가 있을 수 있습니다.

## 내장 AI 설계 검사

1~5세대, 공격/방어/지원/치유 컨셉, 각 슬롯의 기본값 및 허용 레시피/보조효과를 ${recipes.length}개 구성으로 비교했습니다. 정상 표본의 변화 없는 구성은 ${all.filter(x=>x.noChangeSteps.length).length}개(상시 상태 또는 시작 1회 이진 효과)이며 상세 표에 표시했습니다. 인접 레벨에서 변화 없는 기본/레시피 구성은 ${data.recipeNoGrowth.length}개입니다. 각 구성에 대해 캐릭터 레벨 30·동세대 기준 파티를 사용해 스킬 Lv.1/Lv.10, 고정 난수 3개씩 ${battles}회 전투를 실행했고 유한한 수치로 종료했습니다. 적은 동일 세대 기준 파티, 시간 제한은 60초입니다. 이는 스킬 성장 적용과 실행 안정성 검사이며, 승률이나 누적 피해 비율을 캐릭터의 보편적 강함으로 해석하면 안 됩니다. 실제 외부 AI 서비스 호출은 하지 않았습니다.

## 확인된 밸런스 위험

| 중요도 | 실제 코드에서 확인한 위험 | 이번 처리와 남은 일 |
|---|---|---|
| 높음 | 수동으로 두 시전자가 피해 감소 60%를 상시 제공하면 합계 120%가 되어 최종 계산의 100% 상한까지 도달합니다. | 재현 확인. 훈련 증가량은 억제했지만 기존 수동 스킬의 중첩 상한은 이번에 변경하지 않았습니다. 파티 합산 피해 감소 상한 설계가 필요합니다. |
| 높음 | 상시 패시브에 적 기절을 직접 넣으면 입력 1초여도 상태 종료가 전투 종료 이후로 설정됩니다. | 재현 확인. 내장 AI는 이런 상시 제어를 생성하지 않지만 수동 편집은 가능합니다. '상시' 허용 효과의 별도 제한이 필요합니다. |
| 높음 | 즉시 준비·대기 단축·SP 지원을 여러 명이 서로 제공하면 재사용/자원 순환이 가능합니다. | 작은 성장만 허용했습니다. 재귀 깊이 제한은 있지만 완전한 순환 방지 장치는 아닙니다. 내장 AI 레시피는 즉시 준비/교체/기록 조합을 생성하지 않습니다. |
| 높음 | 교체/추가 공격/기록·방출/대상 최대 HP 비례/고정 피해·방어 무시를 수동으로 크게 조합하면 공격력을 우회하거나 증폭할 수 있습니다. | 기존 수동 자유도 유지. 임의 조합의 파티 DPS/보스별 검사가 추가로 필요합니다. 모든 조합의 과성능을 해결했다고 볼 수 없습니다. |
| 중간 | 여러 시전자의 기절·침묵 연계는 개별 지속시간이 짧아도 연속 제어가 가능합니다. | 단일 스킬 성장 제한만 적용했습니다. 대상별 제어 저항/면역 시간이 아직 없습니다. 무적의 대상별 제한과는 다릅니다. |
| 중간 | 액티브가 게이지를 채우고 궁극기·피격·지원이 다시 발동 조건을 충족하는 파티는 단독 검사보다 강할 수 있습니다. | 시작 SP 상한 10, 지원의 작은 성장, 궁극기 비용 100 유지. 최상위 파티 조합 전수 검사는 미실시입니다. |
| 중간 | 강화 후 장비의 추가 타수/지속 증가가 더해지면 성장만 비교할 때보다 효율이 높아집니다. | 장비는 기존 검사 경로 유지. 전체 장비+파티 조합 탐색은 이번 조사에 포함하지 않았습니다. |

현재 보수적인 AI 메뉴의 성장에는 무변화 구간을 발견하지 못했다는 결과와, 수동으로 만들 수 있는 모든 OP 조합이 안전하다는 주장은 다릅니다. 위 위험은 대부분 기존 설계 자유도와 엔진 처리 방식에서 발생하며, 이번 소폭 성장만의 신규 현상은 아닙니다.

## 효과별 Lv.1→Lv.10 비교

현행은 기본 위력 20, 지속 4초, 대기 조절 2초, 스킬 주기 10초로 검사했습니다. 구형은 각 효과의 엔진 기본값입니다. 아래 '변화 없는 구성'은 9개 인접 구간 중 하나라도 무변화가 있는 구성입니다. 궁극기는 시작 SP가 항상 성장하므로 효과 수치가 같아도 스킬 전체는 성장으로 분류합니다. 표식 생성/소모처럼 외부 연계가 필요한 효과는 이 표만으로 실효성을 보장하지 않습니다.

| 효과·형식 | 이름 | 반복 액티브의 변화 | 변화 없는 구성 |
|---|---|---|---|
${table}

재현: \`node scripts/audit-skill-growth.cjs\`. 상세 원자료: \`validation/skill-growth-audit.json\`.
`;
fs.writeFileSync(path.join(__dirname,'../docs/SKILL_GROWTH_AUDIT.md'),md);
console.log(JSON.stringify({variants:variants.length,comparisons,recipeCases:recipes.length,battles,recipeNoGrowth:data.recipeNoGrowth,unvaryingCases:all.filter(x=>x.noChangeSteps.length).length,risks:data.risks},null,2));
