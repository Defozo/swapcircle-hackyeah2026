import type {TransactionProgress} from '@swapcircle/sdk';

export interface RecoveryJournal {
 signature?:string;confirmation?:string;progress?:TransactionProgress;
 cycleAddress?:string;operation?:string;leg?:number;genesisHash?:string;programId?:string;
 [key:string]:unknown;
}

/** A confirmed operation is reconciled, never silently replaced by another send. */
export function assertRecoveryRetryAllowed(prior:RecoveryJournal,status:TransactionProgress,options:{expired:boolean;retryAfterCheck:boolean;newOperation:boolean}):void {
 if(status.phase==='confirmed'||status.phase==='finalized'){
  if(options.newOperation&&prior.operation==='surplus')return;
  throw new Error(`Previous transaction is already ${status.phase}: ${prior.signature}. Verify its existing result with --check-signature. Only a new surplus claim permits --new-operation.`);
 }
 if(status.phase==='failed')return;
 if(status.phase==='unknown'&&options.expired&&options.retryAfterCheck)return;
 throw new Error(`Previous transaction is ${status.phase}: ${prior.signature}. Check its signature and live cycle. An expired, still unknown transaction requires explicit --retry-after-check.`);
}

/** Keep confirmed transport success separate from verified financial readback. */
export async function completeRecoveryReceipt(receipt:RecoveryJournal,result:{signature:string;status:'confirmed'|'finalized'},verify:()=>Promise<Record<string,unknown>>,persist:(receipt:RecoveryJournal)=>void):Promise<RecoveryJournal>{
 Object.assign(receipt,{signature:result.signature,confirmation:result.status,balanceVerified:false});persist(receipt);
 try{Object.assign(receipt,await verify(),{readbackVerifiedAt:new Date().toISOString()});persist(receipt);return receipt;}
 catch(error){Object.assign(receipt,{balanceVerified:false,verificationError:error instanceof Error?error.message:String(error)});persist(receipt);throw new Error(`Transaction ${result.signature} is ${result.status}, but readback failed. Its signature is preserved. Check the existing transaction before another operation.`);}
}
