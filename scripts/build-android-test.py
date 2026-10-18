#!/usr/bin/env python3
"""Repackage the official native shell with this checkout's web assets.
Requires Java 17+, Node, apktool 3.0.3 and uber-apk-signer 1.3.0.
Native dex is preserved; this is a separately signed, personal test build.
"""
import argparse, hashlib, json, pathlib, shutil, subprocess, tempfile, xml.etree.ElementTree as ET
ROOT=pathlib.Path(__file__).resolve().parents[1]
P=argparse.ArgumentParser()
P.add_argument('--original',required=True,type=pathlib.Path)
P.add_argument('--apktool',required=True,type=pathlib.Path)
P.add_argument('--signer',required=True,type=pathlib.Path)
P.add_argument('--output',required=True,type=pathlib.Path)
P.add_argument('--build',default='2026.10.18.3')
P.add_argument('--version-code',type=int,help='Monotonic Android update number; independent of the date/build suffix')
P.add_argument('--private-repo',required=True,help='Personal test update repository, OWNER/REPO (never used by the official web build)')
P.add_argument('--update-dir',type=pathlib.Path,default=ROOT/'artifacts/private-update')
a=P.parse_args()
import re
if not re.fullmatch(r'[0-9]+(?:\.[0-9]+){3}',a.build):P.error('--build must be four numeric components')
if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+',a.private_repo):P.error('Invalid repository')
for key in ('original','apktool','signer','output'):setattr(a,key,getattr(a,key).resolve())
def run(*cmd):subprocess.run([str(x) for x in cmd],check=True)
run('node',ROOT/'scripts/build-combat.cjs')
with tempfile.TemporaryDirectory(prefix='maker-battle-') as work:
 work=pathlib.Path(work);decoded=work/'decoded'
 run('java','-jar',a.apktool,'d','-s','-f',a.original,'-o',decoded)
 android='http://schemas.android.com/apk/res/android';ET.register_namespace('android',android)
 manifest=decoded/'AndroidManifest.xml';tree=ET.parse(manifest);root=tree.getroot()
 old=root.attrib['package'];new=old+'.battletest';root.set('package',new)
 for el in root.iter():
  for key,value in list(el.attrib.items()):
   if key==f'{{{android}}}authorities' or (el.tag in ('permission','uses-permission') and key==f'{{{android}}}name'):
    el.set(key,value.replace(old,new))
   if key==f'{{{android}}}name' and el.tag in ('activity','service','receiver','application') and value.startswith('.'):
    el.set(key,old+value)
 tree.write(manifest,encoding='utf-8',xml_declaration=True)
 strings=decoded/'res/values/strings.xml';tree=ET.parse(strings)
 for el in tree.getroot():
  if el.attrib.get('name') in ('app_name','title_activity_main'):el.text='메이커 전투 테스트'
  elif el.attrib.get('name') in ('package_name','custom_url_scheme'):el.text=new
 tree.write(strings,encoding='utf-8',xml_declaration=True)
 cfg=decoded/'assets/capacitor.config.json';config=json.loads(cfg.read_text());config.update(appId=new,appName='메이커 전투 테스트');cfg.write_text(json.dumps(config,ensure_ascii=False))
 assets=decoded/'assets/public';shutil.copytree(ROOT/'www',assets,dirs_exist_ok=True)
 html=assets/'index.html';s=html.read_text();s=re.sub(r'window\.__BATTLE_TEST__=true;\s*','',s,count=1);s=re.sub(r'window\.__TEST_UPDATE_CONFIG__=\{[^\n]*\};\s*','',s,count=1);channel={'repo':a.private_repo,'branch':'main','path':'www/index.html','channel':'battle-private-v1'}
 s=s.replace('(function(){','window.__BATTLE_TEST__=true;\nwindow.__TEST_UPDATE_CONFIG__='+json.dumps(channel,separators=(',',':'))+';\n(function(){',1)
 s=re.sub(r"var BUILT='[^']+'", "var BUILT='"+a.build+"'",s,count=1)
 s=s.replace('<title>가챠 게임 메이커</title>','<title>메이커 전투 테스트</title>');html.write_text(s)
 update=a.update_dir.resolve();(update/'www').mkdir(parents=True,exist_ok=True);(update/'www/index.html').write_text(s)
 (update/'version.json').write_text(json.dumps({'build':a.build,'html':'www/index.html','sha256':hashlib.sha256(s.encode()).hexdigest(),'notes':['비공개 테스트 채널 자동 패치']},ensure_ascii=False,indent=2)+'\n')
 webmanifest=assets/'manifest.webmanifest';m=json.loads(webmanifest.read_text());m.update(name='메이커 전투 테스트',short_name='전투 테스트');webmanifest.write_text(json.dumps(m,ensure_ascii=False))
 yml=decoded/'apktool.yml';version_code=a.version_code if a.version_code is not None else json.loads((ROOT/'version.json').read_text()).get('androidVersionCode',int(a.build.split('.')[-1])+1)
 if version_code<1:P.error('--version-code must be positive')
 yml.write_text(re.sub(r'(?m)^(\s*versionCode:)\s*\S+',lambda m:m[1]+' '+str(version_code),re.sub(r'(?m)^(\s*versionName:)\s*[^\n]+',lambda m:m[1]+' '+a.build,yml.read_text())))
 unsigned=work/'maker-battle-test.apk';run('java','-jar',a.apktool,'b',decoded,'-o',unsigned)
 signed=work/'signed';run('java','-jar',a.signer,'--apks',unsigned,'--out',signed)
 apks=list(signed.glob('*-aligned-debugSigned.apk'))
 if len(apks)!=1:raise RuntimeError('Expected exactly one signed test APK')
 a.output.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(apks[0],a.output)
 run('java','-jar',a.signer,'--apks',a.output,'--onlyVerify')
 print(json.dumps({'apk':str(a.output),'package':new,'sha256':hashlib.sha256(a.output.read_bytes()).hexdigest()},ensure_ascii=False))
