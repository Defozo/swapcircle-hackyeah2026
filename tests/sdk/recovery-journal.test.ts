import {describe,it,expect} from 'vitest';
import {assertRecoveryRetryAllowed,completeRecoveryReceipt,type RecoveryJournal} from '../../scripts/recovery-journal';

describe('recovery confirmation and financial readback',()=>{
 it('preserves confirmed signature on readback failure and prevents another send',async()=>{
  const receipt:RecoveryJournal={operation:'refund',cycleAddress:'cycle',leg:0};
  const writes:RecoveryJournal[]=[];
  await expect(completeRecoveryReceipt(receipt,{signature:'confirmed-signature',status:'confirmed'},async()=>{throw new Error('RPC readback unavailable');},r=>writes.push({...r}))).rejects.toThrow('signature is preserved');
  expect(writes.at(-1)).toMatchObject({signature:'confirmed-signature',confirmation:'confirmed',balanceVerified:false,verificationError:'RPC readback unavailable'});
  expect(()=>assertRecoveryRetryAllowed(writes.at(-1)!,{phase:'confirmed',signature:'confirmed-signature',at:0},{expired:true,retryAfterCheck:true,newOperation:false})).toThrow('already confirmed');
 });
 it('does not retry an unknown transaction until expiry and an explicit check',()=>{
  const prior={operation:'refund',signature:'pending'};const status={phase:'unknown' as const,at:0};
  expect(()=>assertRecoveryRetryAllowed(prior,status,{expired:false,retryAfterCheck:true,newOperation:false})).toThrow();
  expect(()=>assertRecoveryRetryAllowed(prior,status,{expired:true,retryAfterCheck:false,newOperation:false})).toThrow();
  expect(()=>assertRecoveryRetryAllowed(prior,status,{expired:true,retryAfterCheck:true,newOperation:false})).not.toThrow();
 });
 it('requires an explicit new operation for subsequent surplus only',()=>{
  const status={phase:'finalized' as const,at:0};const options={expired:true,retryAfterCheck:false,newOperation:true};
  expect(()=>assertRecoveryRetryAllowed({operation:'surplus'},status,options)).not.toThrow();
  expect(()=>assertRecoveryRetryAllowed({operation:'refund'},status,options)).toThrow();
 });
 it('marks balances verified only after successful readback',async()=>{
  const result=await completeRecoveryReceipt({operation:'surplus'},{signature:'ok',status:'finalized'},async()=>({balanceVerified:true,stateVerified:true,after:{amount:'120'}}),()=>{});
  expect(result).toMatchObject({confirmation:'finalized',signature:'ok',balanceVerified:true,stateVerified:true,after:{amount:'120'}});
 });
});
