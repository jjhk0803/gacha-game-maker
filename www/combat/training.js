/* Shared rank 1–7 and independent mastery 1–3. No writes to saved skill designs. */
function v2OwnedTraining(c){return GGMCombat.trainingState(own(c.id)?.skillTraining);}
function v2TrainingLabel(t,slot){const p=GGMCombat.trainingState(t),m=p.mastery[slot];return `Lv.${p.rank}${m?' · 전문화 '+m:''}`;}
function v2TrainingSummary(c){
 const t=v2OwnedTraining(c),o=own(c.id),plan=GGMCombat.trainingPlan(t);
 return `<div class="panel v2-training-panel"><h3>스킬 공통 레벨 · ${t.rank}/7</h3><button class="btn" data-act="v2train" data-id="${esc(c.id)}" ${!o||!plan.allowed?'disabled':''}>${!o?'캐릭터 획득 후 강화 가능':plan.allowed?'스킬 공통 레벨 강화':'공통 레벨 최대'}</button></div>`;
}
function v2TrainingHasGain(c,t,plan){return plan.allowed&&GGMCombat.trainingChanges(v2Ensure(c),t,v2TrainingNext(t,plan),plan.slot);}
function v2MasteryButton(c,slot){const t=v2OwnedTraining(c),o=own(c.id),plan=GGMCombat.trainingPlan(t,slot);return `<button class="btn sm" title="실제 효과가 달라지지 않는 단계는 재료를 사용하지 않습니다." data-act="v2train" data-id="${esc(c.id)}" data-slot="${slot}" ${!o||!plan.allowed||!v2TrainingHasGain(c,t,plan)?'disabled':''}>${t.rank<7?'공통 Lv.7에서 전문화':plan.allowed?(v2TrainingHasGain(c,t,plan)?'전문화 강화':'추가 성장 없음'):'전문화 최대'}</button>`;}
let V2TRAIN_CONFIRM=null;
function v2TrainingNext(t,plan){const next=GGMCombat.trainingState(t);if(plan.slot)next.mastery[plan.slot]++;else next.rank++;return next;}
function v2TrainingSlotText(c,slot,t){const s=GGMCombat.trainedKit(v2Ensure(c),t)[slot],sp=slot==='ultimate'?` · 전투 시작 SP ${Math.round(GGMCombat.trainingInitialSP(t)*100)/100}`:'';return `<b>${esc(GGMCombat.SLOTS[slot])} · ${esc(s.name)} · ${esc(v2TrainingLabel(t,slot))}</b><p>${esc(v2SkillText(s,slot))}${sp}</p>`;}
function v2OpenTraining(id,slot){
 const c=charById(id),o=c&&own(id);if(!c||!o)return;const t=v2OwnedTraining(c),plan=GGMCombat.trainingPlan(t,slot);if(!plan.allowed)return;if(!v2TrainingHasGain(c,t,plan)){toast('현재 스킬은 다음 단계에서 추가로 성장하지 않아 재료를 사용하지 않습니다.');return;}
 V2TRAIN_CONFIRM={id,slot:plan.slot,snapshot:JSON.stringify(t)};const next=v2TrainingNext(t,plan),aff=plan.slot?[plan.slot]:Object.keys(GGMCombat.SLOTS),enough=P().mat.wmat>=plan.materials&&P().gold>=plan.gold;
 openModal(`${head(esc(c.name)+' · '+(plan.slot?esc(GGMCombat.SLOTS[plan.slot])+' 전문화':'스킬 공통 레벨 강화'))}<div class="v2-training-comparison">${aff.map(k=>`<section><h3>${esc(GGMCombat.SLOTS[k])} 강화 전후</h3><div class="v2-training-before"><small>현재</small>${v2TrainingSlotText(c,k,t)}</div><div class="v2-training-after"><small>강화 후</small>${v2TrainingSlotText(c,k,next)}</div></section>`).join('')}</div><p class="muted">연계 장비 효과와 캐릭터 능력치는 유지됩니다. 진행 중인 전투에는 소급 적용하지 않고 다음 전투부터 반영합니다.</p><p class="muted">${plan.slot?'선택한 스킬만 전문화합니다.':'세 스킬의 공통 레벨이 함께 올라갑니다.'} 스킬 편집·AI 재생성 후에도 투자한 레벨과 전문화는 해당 슬롯에 유지됩니다.</p><div class="upc-cost"><div><span>${esc(T('wMat'))}</span><b>${plan.materials}개</b><i>보유 ${nf(P().mat.wmat)}개</i></div><div><span>${esc(T('gold'))}</span><b>${nf(plan.gold)}</b><i>보유 ${nf(P().gold)}</i></div></div><div class="row"><button class="btn" data-act="v2train-confirm" ${enough?'':'disabled'}>${enough?'재료를 사용해 강화':'재료가 부족해요'}</button><button class="btn ghost" data-act="char" data-id="${esc(id)}">취소</button></div>`);
}
function v2ConfirmTraining(){
 const pending=V2TRAIN_CONFIRM;if(!pending)return;V2TRAIN_CONFIRM=null;const c=charById(pending.id),o=c&&own(c.id);if(!o)return;
 const t=v2OwnedTraining(c);if(JSON.stringify(t)!==pending.snapshot){toast('스킬 레벨이 바뀌었어요. 다시 확인해 주세요.');openChar(c.id);return;}
 const plan=GGMCombat.trainingPlan(t,pending.slot);if(!plan.allowed||!v2TrainingHasGain(c,t,plan)||P().mat.wmat<plan.materials||P().gold<plan.gold){toast('강화 조건이나 재료를 다시 확인해 주세요.');openChar(c.id);return;}
 P().mat.wmat-=plan.materials;P().gold-=plan.gold;o.skillTraining=v2TrainingNext(t,plan);mark('prog');sfx('강화');openChar(c.id);toast(plan.slot?GGMCombat.SLOTS[plan.slot]+' 전문화 '+o.skillTraining.mastery[plan.slot]+'단계':'스킬 공통 Lv.'+o.skillTraining.rank);
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b||b.disabled)return;if(b.dataset.act==='v2train')v2OpenTraining(b.dataset.id,b.dataset.slot);else if(b.dataset.act==='v2train-confirm')v2ConfirmTraining();});
