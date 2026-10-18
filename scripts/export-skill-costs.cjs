// Reproducible, illustrative prices from the real engine. Not empirical game data.
const fs=require('node:fs'),C=require('../www/combat/core');
const rows=[];
for(const [type,d] of Object.entries(C.Studio.EFFECTS)){
 const e=C.defaultEffect(type);const k=C.normalize({active:{cooldown:8,initial:0,trigger:'interval',triggerEvery:8,effects:[e]}});
 rows.push(`| ${type} | ${d.name} | ${e.value} | ${e.duration} | ${e.hits} | ${C.slotCost(k.active,'active').toFixed(3)} |`);
}
const text=`# 효과별 참고 비용표\n\n실제 엔진에서 내보낸 비교용 표입니다. 게임사 공식 점수나 조사한 캐릭터의 실측 통계가 아닙니다. 조건은 액티브 8초마다 1회, 확률 100%, 단일 기본 대상, 스킬메이커 기본값입니다. 값이 사용되지 않는 효과에도 공통 기본 필드가 보이며 그런 필드는 비용에 반영되지 않습니다. 표식·기록·교체처럼 별도 구성이 필요한 효과는 이 표만으로 가치를 평가하면 안 됩니다.\n\n효과의 값이나 종류를 바꾸면 비용이 다시 계산됩니다. 피해·회복·보호막의 기본 가격은 공격력 배율이고, 다중 타격은 타수만큼 더합니다. 일반 강화·약화는 (효과량÷20)×(지속시간÷5), 지속 효과는 배율×(지속시간÷주기), 제어는 지속시간×0.7, 무적·횟수무효·생존·즉시준비·스킬교체는 기본 4점입니다. 범위 비용은 아군 전체 4명·적 전체 5명·자신 외 아군 3명, 무작위는 지정 인원수(아군 최대4·적 최대5)를 기준으로 곱합니다. 같은 속성/진영/역할 및 표식 대상은 보수적으로 4명을 가정합니다. 확률은 확률/100을 곱합니다. 기존 studio 형식의 atk_up 등 별칭도 강화·약화 비용식을 적용합니다. 최종 슬롯 가격은 합계×8÷추정 간격이며 궁극기는 20초 기준과 0.8 계수를 사용합니다.\n\n횟수형 추정 간격은 max(3, 안전 대기, 요구 횟수×1.7초)입니다. 실전에서는 피격 빈도가 달라질 수 있어 시뮬레이션이 추가로 필요합니다. 패시브 항상 적용은 8초 기준으로 비교하는 근사치입니다. 대상·발동 조건에 대한 모든 상황을 정확하게 가격화한 것은 아닙니다.\n\n새 SP 지원은 5 SP당 기본 1점입니다. 옛 배율형 효과는 별도 호환 단위를 사용합니다. 기준값 전체는 core.js의 budget/studioCost/slotCost와 이 스크립트에서 확인할 수 있습니다.\n\n| 종류 키 | 효과 | 기본 value | duration(초) | hits | 참고 가격 |\n|---|---|---:|---:|---:|---:|\n${rows.join('\n')}\n\nAI가 사용하는 재료·중첩·지속시간 제한과 세대별 상한은 GENERATIONS_AND_SP.md를 참고하세요. 수동 편집은 예산을 넘길 수 있습니다.\n`;
fs.writeFileSync(require('node:path').join(__dirname,'../docs/SKILL_COST_REFERENCE.md'),text);
