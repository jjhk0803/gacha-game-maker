/* Personal test channel. Credentials stay on the device, never in the APK. */
let TEST_UPDATE_BUSY=false;
async function testUpdateCheck(manual=false){
 const config=window.__TEST_UPDATE_CONFIG__;if(!config||TEST_UPDATE_BUSY)return;
 const options=LV();if(!manual&&options.auto===false)return;
 if(!options.token){if(manual)toast('읽기 전용 GitHub 토큰을 입력하고 저장해 주세요.');return;}
 TEST_UPDATE_BUSY=true;
 try{
  const headers={Accept:'application/vnd.github+json',Authorization:'Bearer '+options.token.trim(),'X-GitHub-Api-Version':'2022-11-28'};
  const base='https://api.github.com/repos/'+config.repo;
  const meta=okJSON(await http(base+'/contents/'+config.path+'?ref='+encodeURIComponent(config.branch),{headers,timeout:30000}));
  if(meta.type!=='file'||!meta.sha||!/^[0-9a-f]{40}$/.test(meta.sha))throw new Error('invalid_metadata');
  if(meta.sha===options.sha&&options.on&&localStorage.getItem('starfall-live-html')){if(manual)toast('이미 받은 최신 패치예요. 앱을 다시 실행하면 적용돼요.');return;}
  // Fetch the immutable blob, avoiding a race if another commit lands between requests.
  const blob=okJSON(await http(base+'/git/blobs/'+meta.sha,{headers,timeout:60000}));
  if(blob.encoding!=='base64'||typeof blob.content!=='string')throw new Error('invalid_blob');
  const bytes=b64ToBytes(blob.content.replace(/\s/g,''));
  if(bytes.length>8*1024*1024)throw new Error('too_large');
  const prefix=new TextEncoder().encode('blob '+bytes.length+'\0'),input=new Uint8Array(prefix.length+bytes.length);input.set(prefix);input.set(bytes,prefix.length);
  const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-1',input))].map(b=>b.toString(16).padStart(2,'0')).join('');
  if(sha!==meta.sha)throw new Error('hash_mismatch');
  const html=new TextDecoder().decode(bytes),marker='window.__TEST_UPDATE_CONFIG__='+JSON.stringify(config)+';';
  const build=(html.match(/var BUILT='([^']+)'/)||[])[1];
  if(!html.includes(marker)||!html.includes('ggm-combat-core')||!/<\/html>/i.test(html)||!build)throw new Error('wrong_channel');
  options.checked=Date.now();saveLV(options);
  if(verCmp(build,APP_BUILD)<=0){if(manual)toast('이미 최신 테스트 버전이에요 ('+APP_BUILD+').');return;}
  if(build===options.badBuild&&!manual)return;
  if(options.mode==='ask'&&!confirm('새 테스트 버전 '+build+'을 받을까요? 다음 실행부터 적용돼요.'))return;
  // Recheck settings after download; never stage a response for an obsolete token/config.
  const latest=LV();if(latest.token!==options.token||(!manual&&latest.auto===false))return;
  const current=localStorage.getItem('starfall-live-html');
  if(current)localStorage.setItem('starfall-live-prev',current);
  localStorage.setItem('starfall-live-html',html);
  Object.assign(latest,{on:true,sha:meta.sha,build,prevBuild:window.__LIVE__||APP_BUILD,boots:0,failed:false,at:Date.now(),channelRepo:config.repo});
  if(latest.badBuild===build)delete latest.badBuild;saveLV(latest);await flush();
  toast('테스트 패치 '+build+'을 받았어요. 앱을 완전히 종료하고 다시 열면 적용돼요.');
 }catch(e){
  if(manual){const messages={wrong_channel:'이 파일은 전용 테스트 패치가 아니에요. 새 업로드 묶음의 www/index.html을 올려 주세요.',hash_mismatch:'받은 파일 검증에 실패했어요. 다시 확인해 주세요.',too_large:'패치 파일이 너무 커요.'};toast(messages[e.message]||'업데이트 확인 실패. 토큰의 저장소·Contents 읽기 권한, 만료일, 파일 경로와 인터넷 연결을 확인해 주세요.');}
 }finally{TEST_UPDATE_BUSY=false;}
}
// Only check while visible; downloading never interrupts a battle or reloads the app.
function testUpdatePoll(){if(window.__TEST_UPDATE_CONFIG__&&document.visibilityState==='visible')testUpdateCheck(false);}
setTimeout(testUpdatePoll,5000);
setInterval(testUpdatePoll,5*60*1000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')testUpdatePoll();});
