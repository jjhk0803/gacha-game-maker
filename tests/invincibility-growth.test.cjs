const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../www/combat/core');
function progress(n,slot='active'){return {rank:Math.min(7,n),mastery:{[slot]:Math.max(0,n-7)}};}
function kit(slot='active',duration=9,cooldown=10){const k=C.defaults();for(const s of Object.keys(C.SLOTS)){k[s].effects=[];k[s].initial=180;k[s].trigger='interval';}Object.assign(k[slot],{initial:0,cooldown,triggerEvery:cooldown,effects:[C.defaultEffect('invincible',{target:'self',duration})]});return k;}
const unit=(skills,t)=>({hp:100000,atk:1,def:0,spd:10,skills,skillTraining:t});
test('all ten ranks slightly increase invincibility and reduce cooldown on each slot without mutating source',()=>{
 for(const slot of Object.keys(C.SLOTS)){const raw=kit(slot),before=JSON.stringify(raw);let lastDuration=0,lastCD=Infinity;for(let lv=1;lv<=10;lv++){const s=C.trainedKit(raw,progress(lv,slot))[slot];assert.ok(s.effects[0].duration>lastDuration);assert.ok(s.cooldown<lastCD);assert.ok(s.effects[0].duration<=3);assert.ok(s.cooldown>=17);assert.equal(s.lockout,s.cooldown);lastDuration=s.effects[0].duration;lastCD=s.cooldown;}assert.equal(lastDuration,3);assert.equal(lastCD,17);assert.equal(JSON.stringify(raw),before);}
});
test('short original invincibility only grows fifty percent and long cooldown only loses one second',()=>{
 const m=C.trainedKit(kit('active',1,30),progress(10)).active;assert.equal(m.effects[0].duration,.75);assert.equal(m.cooldown,29);assert.equal(m.triggerEvery,29);assert.equal(m.lockout,17);
});
test('target remembers the previously applied rank interval so a stronger next caster cannot shorten it',()=>{
 const a=unit(kit(),progress(1)),b=unit(kit(),progress(10));b.skills.active.effects[0].target='slot_ally';b.skills.active.effects[0].slot=1;const enemy=unit(C.defaults(),{}),sim=C.create([a,b],[enemy],{practice:true});C.cast(sim,a,'active');b.ready.active=180;assert.equal(a.invincibilityReadyAt,18);sim.time=17.1;a.status=[];b.ready.active=0;C.cast(sim,b,'active');assert.equal(a.status.some(s=>s.type==='invincible'),false);assert.equal(a.invincibilityReadyAt,18);sim.time=18.1;b.lastCast.active=-Infinity;b.ready.active=0;C.cast(sim,b,'active');assert.equal(a.lastInvincibleAt,18.1);assert.equal(a.invincibilityReadyAt,35.1);assert.ok(Math.abs(a.status.find(s=>s.type==='invincible').until-21.1)<1e-8);
});
test('max-rank invincibility cannot exceed its cap after duration changes or readiness reset',()=>{
 const a=unit(kit(),progress(10)),sim=C.create([a],[unit(C.defaults(),{})],{practice:true});a.kit.active.effects[0].duration=180;C.cast(sim,a,'active');assert.equal(a.status[0].until,3);assert.equal(a.invincibilityReadyAt,17);a.status=[];a.lastCast.active=-Infinity;a.ready.active=0;sim.time=16.9;assert.ok(C.cast(sim,a,'active'));assert.equal(a.status.length,0);assert.equal(a.invincibilityReadyAt,17);sim.time=17;a.lastCast.active=-Infinity;a.ready.active=0;assert.ok(C.cast(sim,a,'active'));assert.equal(a.lastInvincibleAt,17);
});

test('mixed cleanse and invincibility do not receive two cooldown growth bonuses',()=>{const k=kit('active',9,30);k.active.effects.push(C.defaultEffect('cleanse',{count:1}));const s=C.trainedKit(k,progress(10)).active;assert.equal(s.cooldown,29);assert.equal(s.triggerEvery,29);assert.equal(s.effects[1].count,1);});

test('descriptions show small duration increases and percentage precision to two decimals',()=>{const s=C.trainedKit(kit(),progress(2)).active;assert.match(C.Studio.describe(s.effects[0]),/2\.11초 동안/);assert.match(C.Studio.describe(C.defaultEffect('damage',{value:435.6})),/435\.6%/);});
