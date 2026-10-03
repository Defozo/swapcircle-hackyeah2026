import assert from 'node:assert/strict';
import {PublicKey,Transaction,sendAndConfirmTransaction} from '@solana/web3.js';
import {AuthorityType,getAssociatedTokenAddressSync,setAuthority} from '@solana/spl-token';
import {SwapCircleClient,type BuiltTransaction,type Leg} from '@swapcircle/sdk';
import {flag,key,loadManifest,network,writeJson} from './common';
const manifest=loadManifest(),{connection}=await network(manifest.cluster,flag('rpc',manifest.rpcUrl));const client=new SwapCircleClient(connection,manifest);
await client.verifyNetwork();
const alice=key('SWAPCIRCLE_DEVNET_ALICE_KEY'),bob=key('SWAPCIRCLE_DEVNET_BOB_KEY'),celine=key('SWAPCIRCLE_DEVNET_CELINE_KEY'),helper=key('SWAPCIRCLE_DEVNET_RECOVERY_KEY');
const actors=[alice,bob,celine,helper];const byOwner=new Map(actors.map(k=>[k.publicKey.toBase58(),k]));
const mint=(symbol:string)=>{const value=manifest.mints.find(x=>x.symbol===symbol);if(!value)throw new Error('Missing demo mint '+symbol);return value;};
const leg=(owner:typeof alice,symbol:string,amount:string):Leg=>({owner:owner.publicKey.toBase58(),mint:mint(symbol).mint,decimals:mint(symbol).decimals,amount});
const examples:Leg[][]=[
 [leg(alice,'dX','100'),leg(bob,'dY','40')],
 [leg(alice,'dX','100'),leg(celine,'dZ','250'),leg(bob,'dY','40')],
 [leg(alice,'dX','100'),leg(bob,'dY','40'),leg(celine,'dZ','250'),leg(helper,'dSIX','1250000')]
];
const report:any={network:manifest.cluster,genesisHash:await connection.getGenesisHash(),programId:manifest.programId,artifactHash:manifest.artifactHash,startedAt:new Date().toISOString(),transactions:[],cycles:[],refund:null,authority:await client.readProgramAuthority(),complete:false};
const save=()=>writeJson(`docs/evidence/${manifest.cluster}-flows.json`,report);
async function execute(label:string,built:BuiltTransaction,payer=alice){
 const block=await connection.getLatestBlockhash('confirmed');built.transaction.feePayer=payer.publicKey;built.transaction.recentBlockhash=block.blockhash;
 const bytes=built.transaction.serialize({requireAllSignatures:false,verifySignatures:false}).length;assert(bytes<=1232,`Legacy transaction ${label} exceeds 1232 bytes`);
 const started=Date.now();const signature=await sendAndConfirmTransaction(connection,built.transaction,[payer,...built.signers],{commitment:'confirmed'});const confirmedMs=Date.now()-started;
 const finalized=await connection.confirmTransaction({...block,signature},'finalized');assert.equal(finalized.value.err,null);
 const result=await connection.getTransaction(signature,{commitment:'finalized',maxSupportedTransactionVersion:0});assert(result?.meta&&!result.meta.err,'Finalized execution must succeed');
 const measurement={label,signature,bytes,feeLamports:result.meta.fee,computeUnits:result.meta.computeUnitsConsumed,confirmedMs,finalizedMs:Date.now()-started,slot:result.slot,status:'finalized'};report.transactions.push(measurement);save();console.log(JSON.stringify(measurement));return signature;
}
async function total(owner:string,mintAddress:string){return (await client.readBalances(owner)).filter(x=>x.mint===mintAddress).reduce((sum,x)=>sum+BigInt(x.amount),0n);}
for(const legs of examples){
 const before=await Promise.all(legs.map(l=>total(l.owner,l.mint)));
 const receivingBefore=await Promise.all(legs.map((l,i)=>total(legs[(i+1)%legs.length].owner,l.mint)));
 const create=await client.buildCreate({creator:alice.publicKey.toBase58(),deadline:Math.floor(Date.now()/1000)+900,legs});await execute(`${legs.length}-create`,create);
 const address=create.cycleAddress;const prep=await client.prepareDestinations(address,alice.publicKey.toBase58());if(prep.transaction.instructions.length)await execute(`${legs.length}-prepare-ATAs`,prep);
 const order=legs.map((_,i)=>i).reverse();
 for(let j=0;j<order.length;j++){
  const i=order[j];await execute(`${legs.length}-fund-${i}`,await client.buildFund(address,i,legs[i].owner),byOwner.get(legs[i].owner)!);
  const current=await client.readCycle(address);assert.equal(current.state,j===order.length-1?'Settled':'Funding');
  if(j<order.length-1){for(let k=0;k<legs.length;k++)assert.equal(await total(legs[(k+1)%legs.length].owner,legs[k].mint),receivingBefore[k],'No recipient paid before final funding');}
 }
 for(let i=0;i<legs.length;i++){assert.equal(await total(legs[i].owner,legs[i].mint),before[i]-BigInt(legs[i].amount));assert.equal(await total(legs[(i+1)%legs.length].owner,legs[i].mint),receivingBefore[i]+BigInt(legs[i].amount));}
 const state=await client.readCycle(address);assert.equal(state.fundedMask,(1<<legs.length)-1);report.cycles.push({address,legs:legs.length,state:state.state,balancesVerified:true,termsHash:state.termsHash});save();
 for(let i=0;i<legs.length;i++)await execute(`${legs.length}-close-${i}`,await client.buildClose(address,i),helper);
 assert.equal((await client.readCycle(address)).closedMask,(1<<legs.length)-1);
}
// Recovery uses only one leg's accounts and a third-party fee payer. The first ATA's
// authority is deliberately changed, then restored after proving fresh-account recovery.
const legs=examples[1],deadline=Math.floor(Date.now()/1000)+Number(flag('refund-delay','75'));
const create=await client.buildCreate({creator:alice.publicKey.toBase58(),deadline,legs});await execute('refund-create',create);const address=create.cycleAddress;
for(const i of [0,2])await execute('refund-fund-'+i,await client.buildFund(address,i,legs[i].owner),byOwner.get(legs[i].owner)!);
const damaged=getAssociatedTokenAddressSync(new PublicKey(legs[0].mint),alice.publicKey);
const mutation=await setAuthority(connection,helper,damaged,alice,AuthorityType.AccountOwner,helper.publicKey);report.changedAta={address:damaged.toBase58(),signature:mutation};save();
console.log(JSON.stringify({waitingForDeadline:deadline,cycle:address}));
while(true){const slot=await connection.getSlot('confirmed');const time=await connection.getBlockTime(slot);if(time!==null&&time>=deadline)break;await new Promise(r=>setTimeout(r,2000));}
const recoveredBefore=await total(alice.publicKey.toBase58(),legs[0].mint);
const recovery=await client.buildRefund(address,0,helper.publicKey.toBase58(),{freshAccount:true});const refundSignature=await execute('refund-fresh-account-third-party',recovery,helper);
assert.equal(await total(alice.publicKey.toBase58(),legs[0].mint),recoveredBefore+100n);assert.equal((await client.readCycle(address)).state,'Refunding');
const secondBefore=await total(bob.publicKey.toBase58(),legs[2].mint);await execute('refund-independent-second',await client.buildRefund(address,2,helper.publicKey.toBase58()),helper);assert.equal(await total(bob.publicKey.toBase58(),legs[2].mint),secondBefore+40n);assert.equal((await client.readCycle(address)).state,'Refunded');
await setAuthority(connection,helper,damaged,helper,AuthorityType.AccountOwner,alice.publicKey);
report.refund={address,state:'Refunded',independent:true,ownerAbsent:true,freshAccount:recovery.destination,signature:refundSignature,balancesVerified:true};save();
for(let i=0;i<legs.length;i++)await execute('refund-close-'+i,await client.buildClose(address,i),helper);
report.complete=true;report.completedAt=new Date().toISOString();save();console.log(JSON.stringify({complete:true,network:manifest.cluster,successCycles:report.cycles.length,refund:report.refund}));
