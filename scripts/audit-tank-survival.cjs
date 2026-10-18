const C=require('../www/combat/core'),fs=require('fs');
function quiet(){const k=C.defaults();for(const s of Object.values(k))if(s&&typeof s==='object'){s.effects=[];s.initial=180;}return k;}
const report={scenario:'No defensive skills; tank raw HP1100/DEF60, healer ATK110 first heals at 8s, enemies HP10000/ATK150/DEF50/SPD100, 30 fixed seeds per group. Reach the first actual healing arrival, not cast.',results:[]};
for(const enemies of [3,4,5])for(const boosted of [false,true]){
 let reached=0,aliveAtEnd=0;
 for(let seed=1;seed<=30;seed++){
  const tank={name:'검 탱커',role:'def',hp:1100*(boosted?1.6:1),def:60*(boosted?1.5:1),atk:10,spd:10,skills:quiet()};
  const k=quiet();k.active={...k.active,initial:8,cooldown:180,triggerEvery:100,trigger:'interval',fx:'회복 광휘',effects:[{type:'heal',target:'ally',value:2.5,chance:100,condition:'always',studio:false}]};
  const healer={name:'회복 지원',role:'sup',hp:1200,def:60,atk:110,spd:10,skills:k};
  const foes=Array.from({length:enemies},()=>({name:'검 적',role:'atk',hp:10000,atk:150,def:50,spd:100,skills:quiet()}));
  const sim=C.create([tank,healer],foes,{seed,timedImpacts:true,maxTime:15});
  let received=false;while(!sim.winner&&sim.time<12){C.step(sim,false);if(tank.hp>0&&healer.healing>0)received=true;}
  if(received)reached++;if(tank.hp>0)aliveAtEnd++;
 }
 report.results.push({enemies,boosted,trials:30,reachedFirstHeal:reached,aliveAt12s:aliveAtEnd});
}
fs.writeFileSync(require('path').join(__dirname,'../validation/tank-survival-audit.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
