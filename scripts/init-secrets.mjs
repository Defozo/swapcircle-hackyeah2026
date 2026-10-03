import {generateKeyPairSync} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const base58=(bytes)=>{const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=BigInt('0x'+bytes.toString('hex')),s='';while(n){s=alphabet[Number(n%58n)]+s;n/=58n;}for(const b of bytes){if(b)break;s='1'+s;}return s;};
const names=['SWAPCIRCLE_DEVNET_DEPLOYER_KEY','SWAPCIRCLE_DEVNET_PROGRAM_KEY','SWAPCIRCLE_DEVNET_FINAL_PROGRAM_KEY','SWAPCIRCLE_DEVNET_ALICE_KEY','SWAPCIRCLE_DEVNET_BOB_KEY','SWAPCIRCLE_DEVNET_CELINE_KEY','SWAPCIRCLE_DEVNET_RECOVERY_KEY'];
const run=(args,input)=>spawnSync(process.platform==='win32'?'cmd.exe':'psst',process.platform==='win32'?['/d','/s','/c','psst',...args]:args,{input,encoding:'utf8',windowsHide:true});
const inventory=run(['list','--json']);
if(inventory.status!==0)throw new Error('Cannot inspect psst');
for(const name of names){
 if(inventory.stdout.includes(name)){console.log(name+': already exists');continue;}
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const seed=privateKey.export({type:'pkcs8',format:'der'}).subarray(-32);
 const pub=publicKey.export({type:'spki',format:'der'}).subarray(-32);
 const result=run(['set',name,'--stdin','--tag','swapcircle-devnet'],JSON.stringify([...seed,...pub]));
 if(result.status!==0)throw new Error('Cannot save '+name+' in psst');
 console.log(name+': '+base58(pub));
}
