import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {Connection,Keypair,Transaction,sendAndConfirmTransaction} from '@solana/web3.js';
import {DEVNET_GENESIS,MAINNET_GENESIS,type Manifest,type BuiltTransaction} from '@swapcircle/sdk';
export function flag(name:string,fallback?:string){const index=process.argv.indexOf('--'+name);return index<0?fallback:process.argv[index+1];}
export function has(name:string){return process.argv.includes('--'+name);}
export function loadManifest(path=flag('manifest',`deployments/${flag('cluster','devnet')}.json`)!):Manifest{return JSON.parse(readFileSync(path,'utf8'));}
export function writeJson(path:string,value:unknown){mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');}
export function key(name='SWAPCIRCLE_DEVNET_DEPLOYER_KEY'):Keypair {const json=process.env[name];if(!json)throw new Error(`Inject ${name} using psst. Never put a private key in command-line arguments.`);const bytes=JSON.parse(json);if(!Array.isArray(bytes)||bytes.length!==64)throw new Error('Invalid keypair secret');return Keypair.fromSecretKey(Uint8Array.from(bytes));}
export async function network(cluster=flag('cluster','devnet')!,url=flag('rpc',cluster==='localnet'?'http://127.0.0.1:8899':'https://api.devnet.solana.com')!){
 if(!['devnet','localnet'].includes(cluster))throw new Error('Mainnet is disabled');
 if(cluster==='localnet'&&!['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname))throw new Error('Localnet requires an explicit loopback RPC');
 const connection=new Connection(url,'confirmed'),genesisHash=await connection.getGenesisHash();
 if(genesisHash===MAINNET_GENESIS||cluster==='devnet'&&genesisHash!==DEVNET_GENESIS)throw new Error('Unexpected genesis hash');return {connection,genesisHash,cluster:cluster as 'devnet'|'localnet',rpcUrl:url};
}
export async function send(connection:Connection,built:BuiltTransaction,payer:Keypair):Promise<string>{
 if(!built.transaction.instructions.length)throw new Error('Nothing to send');
 return sendAndConfirmTransaction(connection,built.transaction,[payer,...built.signers],{commitment:'confirmed',preflightCommitment:'confirmed'});
}
