const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
const config={repo:'example/maker-combat-test',branch:'main',path:'www/index.html',channel:'battle-private-v1'};
const source=fs.readFileSync(require('node:path').join(__dirname,'../www/combat/test-update.js'),'utf8');
const patch=(build='2026.10.16.2',channel=config)=>`<html><script>window.__TEST_UPDATE_CONFIG__=${JSON.stringify(channel)};var BUILT='${build}';</script><script id="ggm-combat-core"></script></html>`;
function harness(html=patch(),options={}){
 const store=new Map(),calls=[],messages=[],bytes=Buffer.from(html),sha=crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob '+bytes.length+'\0'),bytes])).digest('hex');
 let settings={token:'test-placeholder',auto:true,mode:'silent',...options};
 const c={window:{__TEST_UPDATE_CONFIG__:config},document:{visibilityState:'visible',addEventListener(){}},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},setTimeout(){},setInterval(){},crypto:crypto.webcrypto,TextEncoder,TextDecoder,Uint8Array,APP_BUILD:'2026.10.16.1',Date,console,
 LV:()=>({...settings}),saveLV:o=>{settings={...o};},toast:x=>messages.push(x),confirm:()=>true,flush:async()=>{},okJSON:x=>x,b64ToBytes:x=>new Uint8Array(Buffer.from(x,'base64')),
 verCmp:(a,b)=>a.localeCompare(b,undefined,{numeric:true}),http:async(url,args)=>{calls.push({url,args});return url.includes('/contents/')?{type:'file',sha}:{encoding:'base64',content:bytes.toString('base64')};}};
 vm.createContext(c);vm.runInContext(source,c);return {c,store,calls,messages,settings:()=>settings,run:()=>vm.runInContext('testUpdateCheck(true)',c)};
}
test('private updater stages verified immutable blob with no official-host fallback',async()=>{const h=harness();await h.run();assert.equal(h.store.get('starfall-live-html'),patch());assert.equal(h.settings().channelRepo,config.repo);assert.equal(h.settings().build,'2026.10.16.2');assert.equal(h.calls.length,2);assert.ok(h.calls.every(x=>x.url.startsWith('https://api.github.com/repos/'+config.repo+'/')));assert.ok(h.calls[1].url.includes('/git/blobs/'));assert.ok(!patch().includes('test-placeholder'));});
test('wrong channel and old build do not replace installed content',async()=>{for(const html of [patch('2026.10.16.2',{...config,repo:'other/repo'}),patch('2026.10.16.1')]){const h=harness(html);await h.run();assert.equal(h.store.has('starfall-live-html'),false);}});
test('missing token and disabled automatic checks make no network request',async()=>{const a=harness(patch(),{token:''});await a.run();assert.equal(a.calls.length,0);const b=harness(patch(),{auto:false});await vm.runInContext('testUpdateCheck(false)',b.c);assert.equal(b.calls.length,0);});
test('tampered download fails verification without overwriting cached game',async()=>{const h=harness();const http=h.c.http;h.c.http=async(...args)=>{const r=await http(...args);if(r.content)r.content=Buffer.from('tampered').toString('base64');return r;};h.store.set('starfall-live-html','previous');await h.run();assert.equal(h.store.get('starfall-live-html'),'previous');assert.ok(h.messages.some(x=>x.includes('검증')));});
test('bootstrap accepts matching private update and refuses another channel',()=>{
 const html=fs.readFileSync(require('node:path').join(__dirname,'../www/index.html'),'utf8'),boot=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
 for(const repo of [config.repo,'other/repo']){let written='';const meta={on:true,build:'2099.1.1.1',channelRepo:repo};const c={window:{__BATTLE_TEST__:true,__TEST_UPDATE_CONFIG__:config},location:{search:''},localStorage:{getItem:k=>k==='starfall-live'?JSON.stringify(meta):patch('2099.1.1.1'),setItem(){}},document:{write:x=>{written=x;}}};vm.createContext(c);vm.runInContext(boot,c);assert.equal(!!written,repo===config.repo);}
});
