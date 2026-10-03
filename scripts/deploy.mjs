import {spawnSync} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import {Keypair,Connection} from '@solana/web3.js';
const cluster=process.argv[process.argv.indexOf('--cluster')+1];if(cluster!=='devnet')throw new Error('Deployment wrapper permits devnet only');
const payer=process.env.SWAPCIRCLE_DEVNET_DEPLOYER_KEY,program=process.env.SWAPCIRCLE_DEVNET_PROGRAM_KEY;
if(!payer||!program)throw new Error('Inject SWAPCIRCLE_DEVNET_DEPLOYER_KEY and SWAPCIRCLE_DEVNET_PROGRAM_KEY using psst');
const publicId=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(program))).publicKey.toBase58();
if(!readFileSync('programs/swapcircle/src/lib.rs','utf8').includes(publicId))throw new Error('Key does not match declare_id');
if(!existsSync('target/deploy/swapcircle.so'))throw new Error('Build the program first');
const rpc='https://api.devnet.solana.com';const connection=new Connection(rpc,'confirmed');if(await connection.getGenesisHash()!=='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG')throw new Error('Devnet genesis mismatch');
const balance=await connection.getBalance(Keypair.fromSecretKey(Uint8Array.from(JSON.parse(payer))).publicKey);console.log(JSON.stringify({programId:publicId,network:cluster,deployerLamports:balance}));
// Secrets travel on stdin into a mode-0700 temporary directory inside the container.
// Neither shell arguments, Docker environment metadata nor the repository contain keys.
const script=`set -euo pipefail
umask 077
SC_TMP=$(mktemp -d /tmp/swapcircle-deploy.XXXXXX)
trap 'rm -f "$SC_TMP/payer.json" "$SC_TMP/program.json"; rmdir "$SC_TMP"' EXIT
IFS= read -r SC_PAYER
IFS= read -r SC_PROGRAM
printf '%s' "$SC_PAYER" > "$SC_TMP/payer.json"
printf '%s' "$SC_PROGRAM" > "$SC_TMP/program.json"
unset SC_PAYER SC_PROGRAM
solana program deploy /workspace/target/deploy/swapcircle.so --program-id "$SC_TMP/program.json" --keypair "$SC_TMP/payer.json" --url https://api.devnet.solana.com --output json
`;
const result=spawnSync('docker',['exec','-i','swapcircle-toolchain','bash','-c',script],{input:payer+'\n'+program+'\n',encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});
// CLI output may contain recovery phrases on an interrupted deploy. Never print raw output.
if(result.status!==0){console.error('Deployment failed. Exit '+result.status+'. Inspect balance, RPC and program state. Raw CLI output was withheld because it may include a temporary buffer recovery phrase.');process.exitCode=1;}
else{const info=await connection.getAccountInfo(new (await import('@solana/web3.js')).PublicKey(publicId));if(!info?.executable)throw new Error('Deploy returned without an executable program');console.log(JSON.stringify({deployed:true,programId:publicId,network:cluster}));}
