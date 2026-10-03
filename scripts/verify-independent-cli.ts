import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {Keypair,PublicKey,SystemProgram,Transaction,sendAndConfirmTransaction} from '@solana/web3.js';
import {AuthorityType,getOrCreateAssociatedTokenAccount,setAuthority,transferChecked,getAccount} from '@solana/spl-token';
import {SwapCircleClient} from '@swapcircle/sdk';
import {key,loadManifest,network,send,writeJson} from './common';

// A new owner isolates this scenario from browser/video tests using demo actors.
// Its secret exists only in this setup process. The recovery child gets only the
// unrelated fee payer, a public package and a separately selected RPC URL.
const root=resolve('.'),manifest=loadManifest(),{connection}=await network(manifest.cluster,manifest.rpcUrl);
const client=new SwapCircleClient(connection,manifest),payer=key(),donor=key('SWAPCIRCLE_DEVNET_ALICE_KEY'),helper=key('SWAPCIRCLE_DEVNET_RECOVERY_KEY');
const owner=Keypair.generate(),other=Keypair.generate();
const mx=manifest.mints.find(m=>m.symbol==='dX')!,my=manifest.mints.find(m=>m.symbol==='dY')!;
assert(mx&&my,'Seed demo mints first');
await sendAndConfirmTransaction(connection,new Transaction().add(SystemProgram.transfer({fromPubkey:payer.publicKey,toPubkey:owner.publicKey,lamports:50_000_000})),[payer],{commitment:'confirmed'});
const source=await getOrCreateAssociatedTokenAccount(connection,payer,new PublicKey(mx.mint),donor.publicKey);
const original=await getOrCreateAssociatedTokenAccount(connection,payer,new PublicKey(mx.mint),owner.publicKey);
await transferChecked(connection,payer,source.address,new PublicKey(mx.mint),original.address,donor,10n,mx.decimals);
const create=await client.buildCreate({creator:owner.publicKey.toBase58(),deadline:await client.readChainTime()+15,legs:[{owner:owner.publicKey.toBase58(),mint:mx.mint,amount:'10',decimals:mx.decimals},{owner:other.publicKey.toBase58(),mint:my.mint,amount:'40',decimals:my.decimals}]});
await send(connection,create,owner);
const address=create.cycleAddress!;
const preparation=await client.prepareDestinations(address,payer.publicKey.toBase58());
if(preparation.transaction.instructions.length)await send(connection,preparation,payer);
await send(connection,await client.buildFund(address,0,owner.publicKey.toBase58()),owner);
// Deliberately invalidate the canonical ATA. The recovery child has no owner key.
await setAuthority(connection,payer,original.address,owner,AuthorityType.AccountOwner,helper.publicKey);
const cycle=await client.readCycle(address),pack=client.recoveryPackage(cycle,0);
const cleanDirectory=mkdtempSync(join(tmpdir(),'swapcircle-public-recovery-'));
const packagePath=join(cleanDirectory,'recovery.json'),receiptPath=join(cleanDirectory,'receipt.json');
writeFileSync(packagePath,JSON.stringify(pack,null,2));
while(await client.readChainTime()<cycle.deadline)await new Promise(r=>setTimeout(r,1000));
const childEnv={...process.env};
for(const name of Object.keys(childEnv))if(/SWAPCIRCLE|CONVEX|^VITE_/.test(name))delete childEnv[name];
childEnv.SWAPCIRCLE_DEVNET_RECOVERY_KEY=process.env.SWAPCIRCLE_DEVNET_RECOVERY_KEY;
const recoveryRpc=manifest.cluster==='localnet'?manifest.rpcUrl.replace('127.0.0.1','localhost'):manifest.rpcUrl;
const args=['--import',pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href,resolve('scripts/recover.ts'),'--package',packagePath,'--rpc',recoveryRpc,'--execute','--fresh-account','--out',receiptPath];
const execution=await new Promise<{code:number|null;stdout:string;stderr:string}>(resolveRun=>{
 const child=spawn(process.execPath,args,{cwd:cleanDirectory,env:childEnv,windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';
 child.stdout.on('data',data=>{stdout+=data.toString();});child.stderr.on('data',data=>{stderr+=data.toString();});child.on('exit',code=>resolveRun({code,stdout,stderr}));
});
assert.equal(execution.code,0,'Standalone recovery failed: '+execution.stderr);
const receipt=JSON.parse(readFileSync(receiptPath,'utf8'));
assert.equal(receipt.cycle.state,'Refunded');assert.equal(receipt.after.amount,'10');assert.equal(receipt.balanceVerified,true);
const destination=await getAccount(connection,new PublicKey(receipt.destination));
assert(destination.owner.equals(owner.publicKey));assert(destination.mint.equals(new PublicKey(mx.mint)));assert.equal(destination.amount,10n);assert.equal(destination.delegate,null);assert.equal(destination.closeAuthority,null);
assert.notEqual(receipt.destination,original.address.toBase58());
const finalized=await connection.confirmTransaction(receipt.signature,'finalized');assert.equal(finalized.value.err,null);
const report={complete:true,network:manifest.cluster,genesisHash:manifest.genesisHash,programId:manifest.programId,verifiedAt:new Date().toISOString(),cycle:address,owner:owner.publicKey.toBase58(),payer:helper.publicKey.toBase58(),originalAta:original.address.toBase58(),destination:receipt.destination,signature:receipt.signature,confirmation:'finalized',amount:'10',packageOnly:true,separateProcess:true,noManifestFile:true,noOwnerKey:true,noFrontendOrBoardAccess:true,recoveryRpc,receipt};
writeJson(join(root,`docs/evidence/${manifest.cluster}-independent-cli.json`),report);
writeJson(join(root,`docs/evidence/${manifest.cluster}-recovery-package.json`),pack);
console.log(JSON.stringify(report,null,2));
