import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mergeTransactionUpdates,persistTransactionUpdates,retainTransactionHistory} from '../apps/web/src/transaction-journal.ts';

const initial={id:'operation',label:'Akceptuj i wpłać',operationKey:'fund',leg:1,networkKey:'genesis:program',cycle:'cycle',status:'awaiting-signature',createdAt:1};
function journal(){const entries=new Map();return {getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value)};}

test('a stale React snapshot cannot erase a signature persisted immediately before send',()=>{
 const storage=journal(),first=persistTransactionUpdates(storage,'tx',[initial])[0];
 const signed=persistTransactionUpdates(storage,'tx',[{...first,status:'sent',signature:'signed-receipt',blockhash:'valid-block',lastValidBlockHeight:200}])[0];
 const stale=persistTransactionUpdates(storage,'tx',[first])[0];
 assert.deepEqual(stale,signed);assert.equal(JSON.parse(storage.getItem('tx'))[0].signature,'signed-receipt');
});

test('delayed RPC reconciliation cannot replace a more recent SDK confirmation',()=>{
 const storage=journal(),first=persistTransactionUpdates(storage,'tx',[initial])[0];
 const pending=persistTransactionUpdates(storage,'tx',[{...first,status:'sent',signature:'signed-receipt'}])[0];
 const confirmed=persistTransactionUpdates(storage,'tx',[{...pending,status:'confirmed'}])[0];
 const later=persistTransactionUpdates(storage,'tx',[{...pending,status:'error',error:'old RPC timeout'}])[0];
 assert.deepEqual(later,confirmed);
});

test('legacy records keep signed metadata and observed confirmation through weaker reads',()=>{
 const legacy={...initial,status:'confirmed',signature:'signed-receipt',blockhash:'block',lastValidBlockHeight:200};
 assert.deepEqual(mergeTransactionUpdates([legacy],[initial]),[legacy]);
 const checked=mergeTransactionUpdates([legacy],[{...legacy,status:'unknown',error:'pruned RPC history',blockhash:undefined,lastValidBlockHeight:undefined}])[0];
 assert.equal(checked.status,'confirmed');assert.equal(checked.error,undefined);assert.equal(checked.blockhash,'block');assert.equal(checked.lastValidBlockHeight,200);
});

test('current reconciliation may finalize or record a definite failure without changing operation identity',()=>{
 const pending={...initial,status:'unknown',signature:'signed-receipt',journalRevision:3};
 const failed=mergeTransactionUpdates([pending],[{...pending,status:'error',error:'finalized expiry and checked cycle'}])[0];
 assert.equal(failed.status,'error');assert.equal(failed.journalRevision,4);assert.equal(failed.signature,pending.signature);
 const finalized=mergeTransactionUpdates([pending],[{...pending,status:'finalized'}])[0];
 assert.equal(finalized.status,'finalized');
 assert.throws(()=>mergeTransactionUpdates([pending],[{...pending,signature:'replacement'}]),/cannot replace/);
 assert.throws(()=>mergeTransactionUpdates([pending],[{...pending,networkKey:'other-network'}]),/cannot change/);
});

test('storage failure interrupts persistence instead of claiming a durable signed record',()=>{
 assert.throws(()=>persistTransactionUpdates({getItem:()=>null,setItem:()=>{throw new Error('quota');}},'tx',[initial]),/quota/);
});

test('retention preserves an old signed unknown after 101 later finalized transactions',()=>{
 const storage=journal(),pending={...initial,status:'unknown',signature:'old-signed-receipt',blockhash:'old-block',lastValidBlockHeight:200,createdAt:0};
 persistTransactionUpdates(storage,'tx',[pending]);
 const completed=Array.from({length:101},(_,i)=>({...initial,id:`completed-${i}`,status:'finalized',signature:`final-${i}`,createdAt:i+1}));
 const written=persistTransactionUpdates(storage,'tx',completed);
 assert.equal(written.length,101);assert.equal(written.filter(tx=>tx.status==='finalized').length,100);
 assert.equal(written.some(tx=>tx.id==='completed-0'),false);
 const restored=retainTransactionHistory(JSON.parse(storage.getItem('tx')));
 const surviving=restored.find(tx=>tx.id===pending.id);
 assert.equal(surviving.signature,pending.signature);assert.equal(surviving.status,'unknown');assert.equal(surviving.blockhash,pending.blockhash);assert.equal(surviving.lastValidBlockHeight,200);
 assert.deepEqual(restored,written);
});
