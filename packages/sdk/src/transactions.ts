import {Connection,PublicKey,Transaction} from '@solana/web3.js';
import bs58 from 'bs58';
import type {BuiltTransaction,TransactionProgress} from './types';
export async function submitAndConfirm(connection:Connection,built:BuiltTransaction,payer:PublicKey,signTransaction:(transaction:Transaction)=>Promise<Transaction>,onStatus:(progress:TransactionProgress)=>void=()=>{}):Promise<{signature:string;status:'confirmed'|'finalized'}>{
 const emit=(phase:TransactionProgress['phase'],extra:Partial<TransactionProgress>={})=>onStatus({phase,at:Date.now(),...extra});
 const block=await connection.getLatestBlockhash('confirmed');const tx=built.transaction;tx.feePayer=payer;tx.recentBlockhash=block.blockhash;
 if(!tx.instructions.length)throw new Error('No instructions to send');if(built.signers.length)tx.partialSign(...built.signers);
 // Simulate without requiring the wallet signature. No state changes are made.
 const simulation=await connection.simulateTransaction(tx);if(simulation.value.err)throw new Error('Transaction simulation failed: '+JSON.stringify(simulation.value.err)+' '+(simulation.value.logs?.slice(-3).join(' ')??''));
 emit('awaiting-signature');let signed:Transaction;
 try{signed=await signTransaction(tx);}catch(error){emit('failed',{error:String(error)});throw error;}
 if(!signed.signature)throw new Error('Wallet returned an unsigned transaction');
 const signature=bs58.encode(signed.signature);const metadata={signature,blockhash:block.blockhash,lastValidBlockHeight:block.lastValidBlockHeight};
 // Persist the known signature before sending. A transport timeout does not erase it.
 emit('submitted',metadata);
 try{
  const returned=await connection.sendRawTransaction(signed.serialize(),{skipPreflight:false,maxRetries:2});if(returned!==signature)throw new Error('RPC signature mismatch');
  const confirmed=await connection.confirmTransaction({...block,signature},'confirmed');if(confirmed.value.err){emit('failed',{...metadata,error:JSON.stringify(confirmed.value.err)});throw new Error('Transaction failed: '+JSON.stringify(confirmed.value.err));}
  emit('confirmed',metadata);return {signature,status:'confirmed'};
 }catch(error){const status=(await connection.getSignatureStatuses([signature],{searchTransactionHistory:true}).catch(()=>null))?.value[0];
  if(status?.err){emit('failed',{...metadata,error:JSON.stringify(status.err)});throw error;}
  if(status?.confirmationStatus==='confirmed'||status?.confirmationStatus==='finalized'){emit(status.confirmationStatus,metadata);return {signature,status:status.confirmationStatus};}
  emit('unknown',{...metadata,error:String(error)});throw new Error(`Unknown transaction result. Check existing signature before requesting another signature: ${signature}`);
 }
}
export async function checkPendingTransaction(connection:Connection,signature:string):Promise<TransactionProgress>{const s=(await connection.getSignatureStatuses([signature],{searchTransactionHistory:true})).value[0];return {signature,at:Date.now(),phase:s?.err?'failed':s?.confirmationStatus==='finalized'?'finalized':s?.confirmationStatus==='confirmed'?'confirmed':'unknown',error:s?.err?JSON.stringify(s.err):undefined};}
export function explorerUrl(kind:'tx'|'address',value:string,cluster:'devnet'|'localnet'='devnet',rpcUrl='http://127.0.0.1:8899'):string{return `https://explorer.solana.com/${kind}/${encodeURIComponent(value)}?cluster=${cluster==='localnet'?'custom&customUrl='+encodeURIComponent(rpcUrl):'devnet'}`;}
