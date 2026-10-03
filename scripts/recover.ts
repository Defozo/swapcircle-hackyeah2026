import {existsSync,readFileSync} from 'node:fs';
import {Connection,PublicKey} from '@solana/web3.js';
import {getAccount} from '@solana/spl-token';
import {SwapCircleClient,assertSafeTokenAccount,vaultPda,checkPendingTransaction,submitAndConfirm,type RecoveryPackage,type Manifest} from '@swapcircle/sdk';
import {flag,has,key,loadManifest,writeJson} from './common';
import {assertRecoveryRetryAllowed,completeRecoveryReceipt,type RecoveryJournal} from './recovery-journal';
const pack=flag('package')?JSON.parse(readFileSync(flag('package')!,'utf8')) as RecoveryPackage:undefined;
if(pack&&(pack.version!==1||pack.protocol!=='SwapCircle'||!['devnet','localnet'].includes(pack.cluster)||!Number.isInteger(pack.leg)||pack.leg<0||pack.leg>3||!Number.isSafeInteger(pack.deadline)||!Number.isInteger(pack.decimals)||pack.decimals<0||pack.decimals>255||!/^[0-9a-f]{64}$/.test(pack.termsHash)))throw new Error('Invalid public recovery package');
const manifest:Manifest=pack&&!flag('manifest')?{version:1,cluster:pack.cluster,rpcUrl:flag('rpc',pack.cluster==='localnet'?'http://127.0.0.1:8899':'https://api.devnet.solana.com')!,genesisHash:pack.genesisHash,programId:pack.programId,idlVersion:pack.idlVersion,mints:[{symbol:'Recovered token',mint:pack.mint,decimals:pack.decimals}]}:loadManifest();
const connection=new Connection(flag('rpc',manifest.rpcUrl)!,'confirmed'),client=new SwapCircleClient(connection,manifest);
const address=flag('cycle',pack?.cycle);if(!address)throw new Error('Supply --cycle <PDA> or --package <public.json>');
const index=Number(flag('leg',pack?.leg.toString()??'0')),cycle=await client.readCycle(address);
if(pack&&(pack.programId!==manifest.programId||pack.genesisHash!==manifest.genesisHash||pack.termsHash!==cycle.termsHash||pack.deadline!==cycle.deadline||pack.decimals!==cycle.legs[index]?.decimals||pack.owner!==cycle.legs[index]?.owner||pack.mint!==cycle.legs[index]?.mint||pack.amount!==cycle.legs[index]?.amount))throw new Error('Recovery package does not match live immutable terms');
const operation=flag('operation','refund');
const output=flag('out',`docs/evidence/recovery-${address}-${index}.json`)!;
const checkSignature=flag('check-signature');
if(checkSignature){console.log(JSON.stringify({transaction:await checkPendingTransaction(connection,checkSignature),cycle},null,2));}
else if(operation==='read'||!has('execute')){console.log(JSON.stringify({cycle,recovery:client.recoveryPackage(cycle,index),executeHint:'Add --execute and inject SWAPCIRCLE_DEVNET_RECOVERY_KEY via psst to send the recovery transaction.'},null,2));}
else{
 if(existsSync(output)){
  const prior=JSON.parse(readFileSync(output,'utf8')) as RecoveryJournal;
  if(prior.signature&&prior.cycleAddress===address&&prior.operation===operation&&(prior.leg===undefined||prior.leg===index)&&(!prior.genesisHash||prior.genesisHash===manifest.genesisHash)&&(!prior.programId||prior.programId===manifest.programId)&&['submitted','unknown','confirmed','finalized'].includes(prior.confirmation??'')){
   const checked=await checkPendingTransaction(connection,prior.signature);
   // A transient RPC omission must not erase a previously observed confirmation.
   const old=checked.phase==='unknown'&&['confirmed','finalized'].includes(prior.confirmation??'')?{...checked,phase:prior.confirmation as 'confirmed'|'finalized'}:checked;
   const expired=prior.progress?.lastValidBlockHeight!==undefined&&await connection.getBlockHeight('finalized')>prior.progress.lastValidBlockHeight;
   assertRecoveryRetryAllowed(prior,old,{expired,retryAfterCheck:has('retry-after-check'),newOperation:has('new-operation')});
  }
 }
 const payer=key(flag('payer-env','SWAPCIRCLE_DEVNET_RECOVERY_KEY'));const options={freshAccount:has('fresh-account'),destination:flag('destination')};
 const built=operation==='refund'?await client.buildRefund(address,index,payer.publicKey.toBase58(),options):operation==='surplus'?await client.buildSurplus(address,index,payer.publicKey.toBase58(),options):operation==='close'?await client.buildClose(address,index):operation==='prepare'?await client.prepareDestinations(address,payer.publicKey.toBase58()):operation==='fund'?await client.buildFund(address,index,payer.publicKey.toBase58()):undefined;
 if(!built)throw new Error('Unknown operation');
 const destination=built.destination?new PublicKey(built.destination):null;
 const before=destination&&await connection.getAccountInfo(destination)?await connection.getTokenAccountBalance(destination):null;
 const expectedPayout=operation==='refund'?BigInt(cycle.legs[index].amount):operation==='surplus'?(await getAccount(connection,vaultPda(client.programId,address,index),'confirmed')).amount:undefined;
 const receipt:RecoveryJournal={operation,cycleAddress:address,leg:index,genesisHash:manifest.genesisHash,programId:manifest.programId,payer:payer.publicKey.toBase58(),destination:built.destination,before:before?.value??null,expectedPayout:expectedPayout?.toString(),balanceVerified:false};
 const result=await submitAndConfirm(connection,built,payer.publicKey,async tx=>{tx.partialSign(payer);return tx;},progress=>{
  Object.assign(receipt,{confirmation:progress.phase,progress,...(progress.signature?{signature:progress.signature}:{})});
  // This public journal is flushed before sendRawTransaction. It contains no keys.
  writeJson(output,receipt);
 });
 await completeRecoveryReceipt(receipt,result,async()=>{
  const afterCycle=await client.readCycle(address);
  const balance=destination?await connection.getTokenAccountBalance(destination,'confirmed'):null;
  let readbackAmount=balance?.value.amount;
  if(operation==='refund'&&!(afterCycle.refundedMask&(1<<index)))throw new Error('Refund bitmap was not confirmed by readback');
  if(operation==='fund'&&!(afterCycle.fundedMask&(1<<index)))throw new Error('Funding bitmap was not confirmed by readback');
  if(operation==='close'&&!(afterCycle.closedMask&(1<<index)))throw new Error('Vault closure bitmap was not confirmed by readback');
  if(expectedPayout!==undefined){
   if(!destination||!balance)throw new Error('Payout destination balance is missing');
   const actual=await getAccount(connection,destination,'confirmed');
   assertSafeTokenAccount(actual,new PublicKey(cycle.legs[index].owner),new PublicKey(cycle.legs[index].mint));
   if(actual.amount-BigInt(before?.value.amount??'0')<expectedPayout)throw new Error('Payout balance delta does not match the expected transfer');
   readbackAmount=actual.amount.toString();
  }
  return {after:balance?{...balance.value,amount:readbackAmount}:null,cycle:afterCycle,stateVerified:true,balanceVerified:expectedPayout!==undefined,...(expectedPayout!==undefined?{destinationOwner:cycle.legs[index].owner,destinationMint:cycle.legs[index].mint}:{})};
 },value=>writeJson(output,value));
 console.log(JSON.stringify(receipt,null,2));
}
