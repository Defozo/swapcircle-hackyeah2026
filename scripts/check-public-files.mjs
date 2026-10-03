import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

// Run immediately before publishing. Only the file path and category are printed.
// psst may inject project secrets so their exact representations can be checked.
const result=spawnSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8',windowsHide:true});
if(result.status!==0)throw new Error('Cannot enumerate public project files');
const files=[...new Set(result.stdout.split('\0').filter(Boolean))];
const needles=[];
for(const [name,value] of Object.entries(process.env)){
 if(!name.startsWith('SWAPCIRCLE_')||!/(KEY|TOKEN|SECRET)$/.test(name)||!value)continue;
 needles.push(Buffer.from(value));
 try{const parsed=JSON.parse(value);if(Array.isArray(parsed)){needles.push(Buffer.from(JSON.stringify(parsed)));needles.push(Buffer.from(parsed.join(', ')));}}catch{}
}
const findings=[];
for(const file of files){
 const bytes=readFileSync(file);
 if(needles.some(needle=>needle.length>=20&&bytes.includes(needle)))findings.push({file,reason:'contains an injected secret'});
 if(/(?:^|\/)\.env(?:\.|$)/.test(file)&&!file.endsWith('.env.example'))findings.push({file,reason:'environment file is publishable'});
 if(/(?:^|\/)(?:.*-keypair|.*\.keypair)\.json$/.test(file))findings.push({file,reason:'keypair filename is publishable'});
 if(bytes.length<5_000_000&&!bytes.includes(0)){
  const text=bytes.toString('utf8');
  if(/(?:gh[pousr]_[A-Za-z0-9]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|sk-(?:proj-|ant-)?[A-Za-z0-9_-]{30,})/.test(text))findings.push({file,reason:'credential-like literal'});
 }
}
console.log(JSON.stringify({filesChecked:files.length,exactSecretRepresentationsChecked:needles.length,ok:findings.length===0,findings},null,2));
if(findings.length)process.exitCode=1;
