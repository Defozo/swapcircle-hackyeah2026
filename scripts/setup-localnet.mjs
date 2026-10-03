import {spawnSync} from 'node:child_process';
import {copyFileSync,existsSync,mkdirSync,readFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {Connection,PublicKey} from '@solana/web3.js';

try {
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
const reset=process.argv.includes('--reset');
const programId=/declare_id!\("([^"]+)"\)/.exec(readFileSync('programs/swapcircle/src/lib.rs','utf8'))?.[1];
if(!programId)throw new Error('Cannot read program ID');
const run=(args,inherit=true)=>{const r=spawnSync('docker',args,{encoding:'utf8',stdio:inherit?'inherit':'pipe',windowsHide:true,maxBuffer:8*1024*1024});if(r.status!==0)throw new Error(`Docker command failed: ${args.slice(0,3).join(' ')} (exit ${r.status})`);return r.stdout;};
const inspect=name=>{const r=spawnSync('docker',['inspect',name],{encoding:'utf8',windowsHide:true});return r.status===0?JSON.parse(r.stdout)[0]:null;};
const norm=p=>p.replaceAll('\\','/').replace(/^\/host_mnt/,'').toLowerCase();
function assertOwned(container,destination,hostPath){const mount=container.Mounts.find(m=>m.Destination===destination);if(!mount||!norm(mount.Source).endsWith(norm(hostPath)))throw new Error(`Container ${container.Name} is not mounted to this project; refusing to change it`);}
let toolchain=inspect('swapcircle-toolchain');
if(toolchain){assertOwned(toolchain,'/workspace',root);if(!toolchain.State.Running)run(['start','swapcircle-toolchain']);}
else{
 run(['build','-t','swapcircle-dev:1.1.2','.devcontainer']);
 run(['run','--name','swapcircle-toolchain','--label','app=swapcircle','-d','-v',`${root}:/workspace`,'-v','swapcircle-cargo-registry:/root/.cargo/registry','-w','/workspace','swapcircle-dev:1.1.2','sleep','infinity']);
}
run(['exec','swapcircle-toolchain','bash','-lc','cd /workspace && anchor build --ignore-keys']);
mkdirSync('packages/sdk/idl',{recursive:true});
copyFileSync('target/idl/swapcircle.json','packages/sdk/idl/swapcircle.json');
if(existsSync('target/types/swapcircle.ts'))copyFileSync('target/types/swapcircle.ts','packages/sdk/idl/swapcircle.ts');
let validator=inspect('swapcircle-validator');
if(validator){
 assertOwned(validator,'/programs',join(root,'target/deploy'));
 if(reset){run(['rm','--force','swapcircle-validator']);validator=null;}
 else if(!validator.State.Running)run(['start','swapcircle-validator']);
}
if(!validator){
 const command=`solana-test-validator ${reset?'--reset ':''}--quiet --limit-ledger-size 1000000 --ledger /ledger --bind-address "$(hostname -i | awk '{print $1}')" --rpc-port 8899 --bpf-program ${programId} /programs/swapcircle.so`;
 // Local validator requires io_uring. Container ports remain loopback-only.
 run(['run','--name','swapcircle-validator','--label','app=swapcircle','-d','--security-opt','seccomp=unconfined','-p','127.0.0.1:8899:8899','-p','127.0.0.1:8900:8900','-v',`${join(root,'target/deploy')}:/programs:ro`,'-v','swapcircle-local-ledger:/ledger','quay.io/ottersec/anchor:v1.1.2@sha256:4ef4cf067fb1332ddd2b997a48ed05257854f51067ade342d63ebdc1039fe72e','bash','-lc',command]);
}
const connection=new Connection('http://127.0.0.1:8899','confirmed');
let live;
for(let attempt=0;attempt<60;attempt++){
 try{const r=await fetch('http://127.0.0.1:8899',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getHealth'}),signal:AbortSignal.timeout(2000)});if((await r.json()).result==='ok'){live=await connection.getAccountInfo(new PublicKey(programId));if(live?.executable)break;}}catch{}
 if(attempt%10===9)console.log(`Waiting for local validator health (${attempt+1}/60)`);
 await new Promise(r=>setTimeout(r,1000));
}
if(!live?.executable)throw new Error('Local validator did not expose the expected executable program. Inspect docker logs swapcircle-validator. Existing ledger is preserved.');
const sha=data=>createHash('sha256').update(data).digest('hex');
const artifact=readFileSync('target/deploy/swapcircle.so');
let deployed=live.data;
if(live.owner.toBase58()==='BPFLoaderUpgradeab1e11111111111111111111111'){
 const pd=await connection.getAccountInfo(new PublicKey(live.data.subarray(4,36)));if(!pd)throw new Error('ProgramData missing');deployed=pd.data.subarray(45,45+artifact.length);
}
if(sha(deployed)!==sha(artifact))throw new Error('Running local program differs from the rebuilt artifact. Ledger was preserved. Rerun setup:localnet -- --reset only when ready to replace the local ledger, then reseed.');
console.log(JSON.stringify({ready:true,rpc:'http://127.0.0.1:8899',programId,genesisHash:await connection.getGenesisHash(),artifactHash:sha(artifact),reset,seed:'Run pnpm seed:localnet with the psst wrapper.'},null,2));
} catch(error) { console.error(error instanceof Error?error.message:String(error));process.exitCode=1; }
