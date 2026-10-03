import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Keypair,PublicKey,SystemProgram,Transaction,sendAndConfirmTransaction} from '@solana/web3.js';
import {AuthorityType,createMint,getOrCreateAssociatedTokenAccount,mintTo,setAuthority,getMint} from '@solana/spl-token';
import {SwapCircleClient,type Manifest} from '@swapcircle/sdk';
import {flag,key,network,writeJson,loadManifest} from './common';
const net=await network(),{connection,cluster}=net,payer=key();const actors=[['Alicja','ALICE'],['Bartek','BOB'],['Celina','CELINE'],['Recovery','RECOVERY']] as const;
const participants=actors.map(([name,suffix])=>({name,keypair:key(`SWAPCIRCLE_DEVNET_${suffix}_KEY`)}));
if(cluster==='localnet'&&await connection.getBalance(payer.publicKey)<10_000_000_000){const sig=await connection.requestAirdrop(payer.publicKey,50_000_000_000);await connection.confirmTransaction(sig,'confirmed');}
for(const p of participants){const balance=await connection.getBalance(p.keypair.publicKey);if(balance<30_000_000)await sendAndConfirmTransaction(connection,new Transaction().add(SystemProgram.transfer({fromPubkey:payer.publicKey,toPubkey:p.keypair.publicKey,lamports:50_000_000-balance})),[payer],{commitment:'confirmed'});}
const programId=new PublicKey(flag('program-id',JSON.parse(readFileSync('packages/sdk/idl/swapcircle.json','utf8')).address)!).toBase58();
const path=`deployments/${cluster}.json`;const prior=existsSync(path)?loadManifest(path):undefined;
let mints:Manifest['mints']=[];
if(prior?.mints.length&&prior.genesisHash===net.genesisHash){for(const m of prior.mints){const state=await getMint(connection,new PublicKey(m.mint));if(state.mintAuthority||state.freezeAuthority)throw new Error('Existing demo mint still has authority');mints.push(m);}}
else{for(const [symbol,decimals] of [['dX',0],['dY',0],['dZ',0],['dSIX',6]] as const){
 // Deterministic dedicated devnet mint addresses survive a crash between the
 // transaction confirmation and checkpoint write. This key has no mint authority.
 const seed=createHash('sha256').update('SwapCircle:demo-mint:v1').update(payer.secretKey.subarray(0,32)).update(net.genesisHash).update(symbol).digest();
 const mintKey=Keypair.fromSeed(seed),mint=mintKey.publicKey;
 if(!await connection.getAccountInfo(mint))await createMint(connection,payer,payer.publicKey,null,decimals,mintKey);
 const initial=await getMint(connection,mint);if(initial.decimals!==decimals||initial.freezeAuthority)throw new Error('Unexpected existing demo mint');
 if(initial.mintAuthority){
  if(!initial.mintAuthority.equals(payer.publicKey))throw new Error('Unexpected mint authority');
  for(const p of participants){const account=await getOrCreateAssociatedTokenAccount(connection,payer,mint,p.keypair.publicKey);const target=1_000_000n*10n**BigInt(decimals);if(account.amount<target)await mintTo(connection,payer,mint,account.address,payer,target-account.amount);}
  await setAuthority(connection,payer,mint,payer,AuthorityType.MintTokens,null);
 }
 const check=await getMint(connection,mint);if(check.mintAuthority||check.freezeAuthority)throw new Error('Authority removal failed');mints.push({symbol,mint:mint.toBase58(),decimals});
 writeJson(`deployments/${cluster}-seed-progress.json`,{genesisHash:net.genesisHash,programId,mints,participants:participants.map(x=>({name:x.name,owner:x.keypair.publicKey.toBase58()}))});
}}
const manifest:Manifest={version:1,cluster,rpcUrl:net.rpcUrl,genesisHash:net.genesisHash,programId,idlVersion:'0.1.0',mints,participants:participants.map(x=>({name:x.name,owner:x.keypair.publicKey.toBase58()})),deployed:false,convexUrl:prior?.convexUrl};
const artifactPath=flag('artifact-path','target/deploy/swapcircle.so')!;
if(existsSync(artifactPath))manifest.artifactHash=createHash('sha256').update(readFileSync(artifactPath)).digest('hex');
try{const client=new SwapCircleClient(connection,manifest);Object.assign(manifest,await client.readProgramAuthority(),{deployed:true});}catch{}
writeJson(path,manifest);writeJson(`apps/web/public/deployments/${cluster}.json`,manifest);console.log(JSON.stringify(manifest,null,2));
