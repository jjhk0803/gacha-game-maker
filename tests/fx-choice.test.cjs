const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../www/combat/core'),V=require('../www/combat/visual-catalog');
test('every explicit selectable style is honored for every effect, including multi, chain, scatter and delayed hits',()=>{
 for(const kind of Object.keys(C.EFFECTS))for(const style of C.FX_TYPES.filter(s=>s!=='효과별 자동')){const p=V.resolve({kind},style,'#24a6a4');assert.equal(p.style,style,kind+' '+style);assert.equal(p.kind,kind);assert.equal(p.automatic,false);assert.equal(p.color,'#24a6a4');}
 for(const kind of ['multi','chain','scatter','delayed','detonate'])assert.equal(V.resolve({kind},'효과별 자동').style,V.profiles[kind].style);
});
test('cosmetic selection preserves atomic damage formulas (timed delivery is tested separately)',()=>{
 for(const kind of ['multi','chain','scatter','delayed','detonate']){
  const k=C.defaults();k.active.effects=[...(kind==='detonate'?[C.defaultEffect('mark',{target:'enemy',mark:'검증',stacks:1,maxStacks:3})]:[]),C.defaultEffect(kind,{target:'enemy',value:80,hits:3,mark:'검증',stacks:1,delay:.5})];
  const team=fx=>[{name:'test',hp:1000,atk:100,def:40,skills:{...k,active:{...k.active,fx}}}];const enemies=C.reference();const result=C.run(team('효과별 자동'),enemies,{seed:27,maxTime:30,timedImpacts:false});
  for(const fx of ['참격','화염구','총탄','빙결창','번개'])assert.deepEqual(C.run(team(fx),enemies,{seed:27,maxTime:30,timedImpacts:false}),result,kind+' '+fx);
 }
});
