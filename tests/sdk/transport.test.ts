import {describe,it,expect,vi} from 'vitest';
import {Connection,Keypair,SystemProgram,Transaction} from '@solana/web3.js';
import {submitAndConfirm,checkPendingTransaction,type TransactionProgress} from '@swapcircle/sdk';
const payer=Keypair.fromSeed(new Uint8Array(32).fill(21));
function scenario(){
 const connection={getLatestBlockhash:vi.fn().mockResolvedValue({blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:100}),simulateTransaction:vi.fn().mockResolvedValue({value:{err:null}}),sendRawTransaction:vi.fn(),confirmTransaction:vi.fn().mockResolvedValue({value:{err:null}}),getSignatureStatuses:vi.fn().mockResolvedValue({value:[null]})};
 const statuses:TransactionProgress[]=[];const sign=vi.fn(async(tx:Transaction)=>{tx.partialSign(payer);return tx;});
 const built={transaction:new Transaction().add(SystemProgram.transfer({fromPubkey:payer.publicKey,toPubkey:Keypair.generate().publicKey,lamports:1})),signers:[]};
 return {connection,statuses,sign,built,run:()=>submitAndConfirm(connection as unknown as Connection,built,payer.publicKey,sign,x=>statuses.push(x))};
}
describe('submission uncertainty',()=>{
 it('persists the signed identifier before transport, reconciles an RPC timeout without another signature',async()=>{const s=scenario();s.connection.sendRawTransaction.mockImplementation(async()=>{expect(s.statuses.at(-1)?.signature).toBeTruthy();throw new Error('timeout');});s.connection.getSignatureStatuses.mockResolvedValue({value:[{err:null,confirmationStatus:'confirmed'}]});const result=await s.run();expect(result.status).toBe('confirmed');expect(s.sign).toHaveBeenCalledTimes(1);expect(s.connection.sendRawTransaction).toHaveBeenCalledTimes(1);expect(s.statuses.map(x=>x.phase)).toEqual(['awaiting-signature','submitted','confirmed']);});
 it('keeps an unknown result and its signature when RPC cannot prove execution',async()=>{const s=scenario();s.connection.sendRawTransaction.mockRejectedValue(new Error('HTTP429'));await expect(s.run()).rejects.toThrow('Unknown transaction result');expect(s.statuses.at(-1)?.phase).toBe('unknown');expect(s.statuses.at(-1)?.signature).toBeTruthy();expect(s.sign).toHaveBeenCalledTimes(1);});
 it('does not request a wallet signature after a failed simulation',async()=>{const s=scenario();s.connection.simulateTransaction.mockResolvedValue({value:{err:{InstructionError:[0,'Custom']},logs:['deadline exceeded']}});await expect(s.run()).rejects.toThrow('simulation failed');expect(s.sign).not.toHaveBeenCalled();expect(s.connection.sendRawTransaction).not.toHaveBeenCalled();});
 it('reports user rejection without sending a transaction',async()=>{const s=scenario();s.sign.mockRejectedValue(new Error('User rejected'));await expect(s.run()).rejects.toThrow('User rejected');expect(s.statuses.at(-1)?.phase).toBe('failed');expect(s.connection.sendRawTransaction).not.toHaveBeenCalled();});
 it('does not turn a chain execution error into a success',async()=>{const s=scenario();s.connection.sendRawTransaction.mockRejectedValue(new Error('preflight'));s.connection.getSignatureStatuses.mockResolvedValue({value:[{err:{InstructionError:[0,6007]},confirmationStatus:'confirmed'}]});await expect(s.run()).rejects.toThrow();expect(s.statuses.at(-1)?.phase).toBe('failed');});
 it('reconciles finalized receipts on page reload',async()=>{const s=scenario();s.connection.getSignatureStatuses.mockResolvedValue({value:[{err:null,confirmationStatus:'finalized'}]});expect((await checkPendingTransaction(s.connection as unknown as Connection,'signature')).phase).toBe('finalized');});
});
