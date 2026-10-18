/* Practice uses the normal combat renderer and engine; session choices never replace the saved squad. */
let V2PRACTICE=null;
function v2OpenPractice(keep=false){
 if(B&&!B.over)return;
 if(!keep||!V2PRACTICE){const squad=(P().squad||[]).filter(charById).slice(0,4);V2PRACTICE={squad:squad.length?squad:G.chars.slice(0,4).map(c=>c.id),count:3,level:30,hp:100,auto:true,last:null};}
 const state=V2PRACTICE;state.count=Math.min(5,Math.max(1,Math.floor(Number(state.count)||3)));
 openModal(`${head('연습장','<span class="muted">파티 구성 · 스킬 · 공격 연출 시험</span>')}<p class="muted">허수아비는 반격하지 않고 쓰러지지 않습니다. 행동력·보상·경험치·전투 미션에 영향을 주지 않아요. 보유 캐릭터는 현재 성장·장비 상태, 미보유 캐릭터는 Lv.1 상태로 시험합니다.</p><div class="g2">${[0,1,2,3].map(i=>`<label class="f">파티 슬롯 ${i+1}<select class="in" data-practice-slot="${i}"><option value="">비움</option>${G.chars.map(c=>`<option value="${esc(c.id)}" ${state.squad[i]===c.id?'selected':''}>${esc(c.name)} · ${esc(ROLE[c.role])} · ${own(c.id)?'Lv.'+own(c.id).lv:'미보유 Lv.1'}</option>`).join('')}</select></label>`).join('')}</div>
 <div class="g2"><label class="f">허수아비 수 (1~5마리)<input class="in" type="number" id="v2-practice-count" min="1" max="5" step="1" value="${state.count}"></label><label class="f">허수아비 기준 레벨 (1~70)<input class="in" type="number" id="v2-practice-level" min="1" max="70" step="1" value="${state.level}"></label><label class="f">아군 시작 HP (%) · 회복 시험용<input class="in" type="number" id="v2-practice-hp" min="1" max="100" value="${state.hp}"></label><label class="f">필살기 사용<select class="in" id="v2-practice-auto"><option value="true" ${state.auto?'selected':''}>자동 (수동 전용 스킬 제외)</option><option value="false" ${!state.auto?'selected':''}>직접 눌러서 사용</option></select></label></div>
 <p class="muted">허수아비는 탱커 → 딜러 → 힐러 순으로 반복 배치합니다. 역할마다 기준 HP·공격력·방어력이 달라 대상 선택 우선순위도 시험할 수 있어요. 무제한 HP는 피해를 받아도 줄지 않는다는 뜻이며, 최대 HP 비례 효과는 기준 HP로 계산합니다. 피격·처치 조건은 반격·사망이 없어 시험할 수 없습니다.</p>
 ${state.last?`<div class="panel"><b>직전 연습 · ${state.last.time.toFixed(1)}초</b>${v2PracticeTable(state.last)}</div>`:''}<p class="muted">허수아비는 공격하지 않으므로 피격 횟수 액티브와 피격 SP는 이곳에서 발동하지 않습니다. 평타·액티브·시간·지원으로 SP를 채워 궁극기를 시험할 수 있어요.</p><p id="v2-practice-error" role="status"></p><div class="row"><button class="btn" data-act="v2practice-start">연습 시작</button><button class="btn ghost" data-act="close">닫기</button></div>`);
}
function v2ReadPractice(){
 const s=V2PRACTICE;if(!s)return false;
 const squad=Array.from(document.querySelectorAll('[data-practice-slot]')).map(e=>e.value).filter(Boolean);
 const count=Number(document.getElementById('v2-practice-count').value),level=Number(document.getElementById('v2-practice-level').value),hp=Number(document.getElementById('v2-practice-hp').value);
 let error=!squad.length?'캐릭터를 한 명 이상 선택해 주세요.':new Set(squad).size!==squad.length?'같은 캐릭터를 여러 슬롯에 넣을 수 없어요.':!Number.isInteger(count)||count<1||count>5?'허수아비 수는 1~5마리입니다.':!Number.isInteger(level)||level<1||level>70?'기준 레벨은 1~70입니다.':!Number.isFinite(hp)||hp<1||hp>100?'시작 HP는 1~100%입니다.':'';
 if(error){document.getElementById('v2-practice-error').textContent=error;return false;}
 Object.assign(s,{squad,count,level,hp,auto:document.getElementById('v2-practice-auto').value==='true'});return true;
}
function v2PracticeDummies(count,level){
 const m=1+.06*(level-1),roles=['def','atk','sup'],labels={def:'탱커',atk:'딜러',sup:'힐러'};
 count=Math.min(5,Math.max(1,Math.floor(Number(count)||1)));
 return Array.from({length:count},(_,i)=>{const role=roles[i%3];return {name:labels[role]+' 허수아비 '+(i+1),role,elem:ELEMS[i%ELEMS.length],hp:Math.round((role==='def'?2500:role==='sup'?1200:1500)*m),atk:Math.round((role==='atk'?180:role==='sup'?90:110)*m),def:Math.round((role==='def'?120:role==='sup'?40:70)*m),spd:100};});
}
async function v2StartPractice(read=true){
 if(read&&!v2ReadPractice())return;
 if(window.__v2PracticeStarting)return;window.__v2PracticeStarting=true;
 try{
  const state=V2PRACTICE;if(!state)return;
  if(B?.ctx.kind==='practice'){clearInterval(B.timer);B=null;closeOv();}
  const s={id:'practice',title:'파티 연습장',enemies:v2PracticeDummies(state.count,state.level),reward:0};
  closeModal();await startStage(s,{kind:'practice',squad:[...state.squad],prep:allies=>{for(const u of allies)u.hp=Math.max(1,Math.round(u.maxhp*state.hp/100));}});
  if(B?.ctx.kind==='practice'){B.auto=state.auto;document.querySelector('[data-act="bauto"]')?.classList.toggle('on',B.auto);v2UpdatePractice();}
 }catch(e){toast('연습장을 열지 못했어요: '+String(e.message||e));v2OpenPractice(true);}finally{window.__v2PracticeStarting=false;}
}
function v2PracticeSnapshot(){return {time:B.engine.time,rows:B.allies.map(u=>({name:u.name,damage:u.dmg||0,healing:u.healing||0,active:u.casts.active,ultimate:u.casts.ultimate}))};}
function v2PracticeTable(snapshot){return `<table><thead><tr><th>캐릭터</th><th>피해 / DPS</th><th>실제 회복</th><th>액티브 / 궁극기</th></tr></thead><tbody>${snapshot.rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${nf(r.damage)} / ${nf(r.damage/Math.max(GGMCombat.DT,snapshot.time))}</td><td>${nf(r.healing)}</td><td>${r.active} / ${r.ultimate}</td></tr>`).join('')}</tbody></table>`;}
function v2MountPractice(){
 const bt=document.querySelector('#ov > .bt');bt.classList.add('v2-practice');B.paused=false;
 B.enemies.forEach((u,i)=>{const el=document.getElementById('u_e'+i);const shape=el.querySelector('.shape,.en-img');if(shape){const art=document.createElement('div');art.className='v2-dummy-art';art.textContent=u.role==='def'?'🛡':u.role==='sup'?'✚':'⚔';shape.replaceWith(art);}const label=document.createElement('small');label.className='v2-dummy-label';label.textContent='HP ∞ · 기준 '+nf(u.maxhp);el.append(label);});
 const log=document.getElementById('bLog'),middle=document.createElement('div');middle.className='v2-practice-middle';log.replaceWith(middle);const hud=document.createElement('div');hud.className='v2-practice-hud';hud.innerHTML='<b id="v2-practice-time"></b><div id="v2-practice-metrics"></div><div class="row"><button class="btn sm ghost" data-act="v2practice-pause">일시정지</button><button class="btn sm ghost" data-act="v2practice-reset">처음부터</button><button class="btn sm ghost" data-act="v2practice-config">편성·허수아비 변경</button></div>';middle.append(hud,log);v2UpdatePractice();
}
function v2UpdatePractice(){
 if(B?.ctx.kind!=='practice')return;const s=v2PracticeSnapshot();const time=document.getElementById('v2-practice-time'),metrics=document.getElementById('v2-practice-metrics');if(time)time.textContent=`${B.paused?'일시정지 · ':''}연습 ${s.time.toFixed(1)}초 · 누적 피해 ${nf(s.rows.reduce((n,r)=>n+r.damage,0))}`;if(metrics)metrics.innerHTML=v2PracticeTable(s);
}
function v2StopPractice(){if(B?.ctx.kind!=='practice')return;V2PRACTICE.last=v2PracticeSnapshot();clearInterval(B.timer);B.over=true;B=null;closeOv();render();v2OpenPractice(true);}
document.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b)return;switch(b.dataset.act){
 case 'v2practice':v2OpenPractice();break;
 case 'v2practice-start':v2StartPractice();break;
 case 'v2practice-config':v2StopPractice();break;
 case 'v2practice-reset':v2StartPractice(false);break;
 case 'v2practice-pause':if(B?.ctx.kind==='practice'){B.paused=!B.paused;b.textContent=B.paused?'계속하기':'일시정지';v2UpdatePractice();}break;
}});
