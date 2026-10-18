#!/usr/bin/env node
// Keep editable modules and the upstream single-file web release in sync.
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),file=path.join(root,'www/index.html');
let html=fs.readFileSync(file,'utf8');
const bundle=['catalog','visual-catalog','core','effects','bridge','generation','equipment','training','practice','test-update'].map(name=>`<script id="ggm-combat-${name}">\n${fs.readFileSync(path.join(root,`www/combat/${name}.js`),'utf8').replace(/<\/script/gi,'<\\/script')}\n</script>`).join('\n');
const start='<!-- COMBAT_V2_BUNDLE -->',end='<!-- /COMBAT_V2_BUNDLE -->';
const regex=/<!-- COMBAT_V2_BUNDLE -->[\s\S]*?<!-- \/COMBAT_V2_BUNDLE -->/;
html=regex.test(html)?html.replace(regex,()=>start+'\n'+bundle+'\n'+end):html.replace(start,()=>start+'\n'+bundle+'\n'+end);
fs.writeFileSync(file,html);
const manifestPath=path.join(root,'version.json');
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
manifest.sha256=require('node:crypto').createHash('sha256').update(html).digest('hex');
fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
console.log('Combat modules embedded in www/index.html');
