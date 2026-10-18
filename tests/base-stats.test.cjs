const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),C=require('../www/combat/core');
const {JSDOM,VirtualConsole}=require('jsdom');
test('tank generation stores higher raw HP/DEF, retaining rarity and variance',()=>{
 assert.deepEqual(C.generateBaseStats({role:'def',rarity:1},()=>.5),{hp:2400,atk:85,def:128,spd:C.roleSpeed({role:'def',rarity:1})});
 const ssr=C.generateBaseStats({role:'def',rarity:3},()=>.5);assert.equal(ssr.hp,2690);assert.equal(ssr.def,143);
 for(const role of ['atk','sup']){const b=C.CHARACTER_BASE_STATS[role],s=C.generateBaseStats({role,rarity:1},()=>.5);assert.equal(s.hp,b.hp);assert.equal(s.def,b.def);}
 for(const rarity of [1,2,3]){const lo=C.generateBaseStats({role:'def',rarity},()=>0),hi=C.generateBaseStats({role:'def',rarity},()=>1);assert.ok(lo.hp<=hi.hp&&lo.def<=hi.def);assert.ok(lo.hp>=2280&&hi.hp<=2820);assert.ok(lo.def>=122&&hi.def<=151);}
});
test('legacy migration changes saved tank fields once and preserves original values',()=>{
 const tank={role:'def',hp:1500,def:85,atk:90,spd:80,skills:C.defaults(),weapon:{name:'old'},skillBalance:{ratio:1.2}},skills=JSON.stringify(tank.skills);
 assert.equal(C.migrateBaseStats(tank),true);assert.equal(tank.hp,2400);assert.equal(tank.def,128);assert.deepEqual(tank.baseStatsMigration,{version:1,hp:1500,def:85});assert.equal(tank.atk,90);assert.equal(tank.spd,80);assert.equal(tank.skillBalance,null);assert.equal(JSON.stringify(tank.skills),skills);
 const saved=JSON.stringify(tank);assert.equal(C.migrateBaseStats(tank),false);const imported=JSON.parse(saved);assert.equal(C.migrateBaseStats(imported),false);assert.equal(JSON.stringify(imported),saved);
});
test('non-tanks and later role changes never receive an automatic stat multiplier',()=>{
 const c={role:'atk',hp:1000,def:48};C.migrateBaseStats(c);assert.equal(c.hp,1000);assert.equal(c.def,48);c.role='def';assert.equal(C.migrateBaseStats(c),false);assert.deepEqual(C.baseStats(c),{hp:1000,def:48});
 const manual={role:'def',baseStatsVersion:1,hp:4800,def:250};assert.deepEqual(C.baseStats(manual),{hp:4800,def:250});C.migrateBaseStats(manual);assert.equal(manual.hp,4800);const sim=C.create([manual],[{hp:99999,atk:1}],{practice:true});assert.equal(sim.allies[0].maxhp,4800);assert.equal(sim.allies[0].def,250);
});
function boot(){const vc=new VirtualConsole();return new JSDOM(fs.readFileSync(path.join(__dirname,'../www/index.html'),'utf8'),{url:'https://localhost/?builtin=1',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){w.fetch=()=>Promise.reject(new Error('Offline'));w.matchMedia=()=>({matches:false,addEventListener(){},addListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}};w.confirm=()=>true;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollTo=()=>{};w.URL.createObjectURL=()=>{throw new Error('fallback');};}});}
test('saved raw stats match editor, manual edits, reloads and real battle inputs',async t=>{
 const dom=boot();t.after(()=>dom.window.close());const w=dom.window;await new Promise(r=>setTimeout(r,30));
 const r=w.eval(`(()=>{const c=G.chars[0];c.role='def';c.hp=1500;c.def=85;delete c.baseStatsVersion;delete c.baseStatsMigration;G=fix(G);P().owned[c.id]={lv:1,dup:0,wlv:0,exp:0};openCharEdit(c.id);const hp=+document.querySelector('#f_hp').value,def=+document.querySelector('#f_def').value;const base=stats(c);document.querySelector('#f_hp').value='4000';document.querySelector('#f_def').value='200';readCharForm(c);const manual=stats(c),saved=JSON.stringify(G);G=fix(JSON.parse(saved));const again=charById(c.id),restored=stats(again);return {hp,def,base,manual,restored,rawHP:again.hp,rawDEF:again.def,mul:RMUL[c.rarity]||1,migration:again.baseStatsMigration};})()`);
 assert.equal(r.hp,2400);assert.equal(r.def,128);assert.equal(r.base.hp,Math.round(2400*r.mul));assert.equal(r.base.def,Math.round(128*r.mul));assert.equal(r.rawHP,4000);assert.equal(r.rawDEF,200);assert.equal(r.manual.hp,Math.round(4000*r.mul));assert.equal(r.manual.def,Math.round(200*r.mul));assert.equal(r.restored.hp,r.manual.hp);assert.equal(r.restored.def,r.manual.def);assert.equal(r.migration.hp,1500);
 const generation=w.eval(`(()=>{const old=Math.random;Math.random=()=>.5;try{const c=cleanChar0({name:'새 탱커',role:'def',rarity:1,hp:900,def:30});const initial={hp:c.hp,def:c.def,version:c.baseStatsVersion};sysStats(c);return {initial,hp:c.hp,def:c.def,migrated:GGMCombat.migrateBaseStats(c),schema:charSchema()};}finally{Math.random=old;}})()`);
 assert.equal(generation.initial.hp,2400);assert.equal(generation.initial.def,128);assert.equal(generation.initial.version,1);assert.equal(generation.hp,2400);assert.equal(generation.def,128);assert.equal(generation.migrated,false);assert.match(generation.schema,/방어형은2280~2820/);
});
