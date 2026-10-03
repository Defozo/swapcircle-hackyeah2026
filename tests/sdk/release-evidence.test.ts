import {describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {PublicKey,type Connection} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID} from '@solana/spl-token';
import bs58 from 'bs58';
import {assertReceiptDeploymentSlot,validateEvidenceHeader,verifyAdditionalReleaseEvidence} from '../../scripts/release-evidence';

const key=(byte:number)=>new PublicKey(new Uint8Array(32).fill(byte));
const disc=(name:string)=>createHash('sha256').update(name).digest().subarray(0,8);
const signature=(byte:number)=>bs58.encode(new Uint8Array(64).fill(byte));
function fixture(){
 const id=key(20),owners=[key(1),key(2),key(3)],mints=[key(11),key(12),key(13)],helper=key(4),destination=key(5);
 const identity={programId:id.toBase58(),genesisHash:key(21).toBase58(),artifactHash:'a'.repeat(64),deploymentSlot:100};
 const accounts=new Map<string,any>(),transactions=new Map<string,any>();
 function state(nonce:number,count:number,state:number,funded:number,refunded:number){
  const data=Buffer.alloc(419),nonceBytes=Buffer.alloc(8);nonceBytes.writeBigUInt64LE(BigInt(nonce));
  const [address,bump]=PublicKey.findProgramAddressSync([Buffer.from('cycle'),owners[0].toBuffer(),nonceBytes],id);
  disc('account:Cycle').copy(data);data[8]=1;owners[0].toBuffer().copy(data,9);nonceBytes.copy(data,73);data[121]=count;
  for(let i=0;i<count;i++){owners[i].toBuffer().copy(data,122+i*73);mints[i].toBuffer().copy(data,154+i*73);data.writeBigUInt64LE(10n,186+i*73);}
  data[414]=state;data[415]=funded;data[416]=refunded;data[418]=bump;
  accounts.set(address.toBase58(),{owner:id,data,lamports:1,executable:false,rentEpoch:0});return address.toBase58();
 }
 const settlement=state(1,3,1,7,0),recovered=state(2,2,3,1,1),walletRefund=state(3,2,3,1,1);
 type Ix={program:PublicKey;accounts:string[];data:Buffer};
 const instruction=(name:string,cycle:string,index=0):Ix=>({program:id,accounts:[cycle,key(30).toBase58(),mints[index].toBase58(),destination.toBase58(),TOKEN_PROGRAM_ID.toBase58()],data:Buffer.concat([disc('global:'+name),Buffer.from([index])])});
 function transaction(sig:string,signers:PublicKey[],instructions:Ix[],withBalance=false){
  const keys=Array.from(new Set([...signers.map(s=>s.toBase58()),...instructions.flatMap(ix=>[ix.program.toBase58(),...ix.accounts])])).map(value=>new PublicKey(value));
  const destinationIndex=keys.findIndex(k=>k.equals(destination));
  transactions.set(sig,{slot:101,meta:{err:null,preTokenBalances:[],postTokenBalances:withBalance?[{accountIndex:destinationIndex,mint:mints[0].toBase58(),owner:owners[0].toBase58(),uiTokenAmount:{amount:'10',decimals:0}}]:[]},transaction:{message:{header:{numRequiredSignatures:signers.length},accountKeys:keys,instructions:instructions.map(ix=>({programIdIndex:keys.findIndex(k=>k.equals(ix.program)),accounts:ix.accounts.map(a=>keys.findIndex(k=>k.toBase58()===a)),data:bs58.encode(ix.data)}))}}});
 }
 const createAccount=Buffer.alloc(52);createAccount.writeBigUInt64LE(165n,12);TOKEN_PROGRAM_ID.toBuffer().copy(createAccount,20);
 transaction(signature(50),[helper,destination],[{program:PublicKey.default,accounts:[helper.toBase58(),destination.toBase58()],data:createAccount},{program:TOKEN_PROGRAM_ID,accounts:[destination.toBase58(),mints[0].toBase58()],data:Buffer.concat([Buffer.from([18]),owners[0].toBuffer()])},instruction('refund',recovered)],true);
 const token=Buffer.alloc(165);mints[0].toBuffer().copy(token,0);owners[0].toBuffer().copy(token,32);token.writeBigUInt64LE(10n,64);token[108]=1;
 accounts.set(destination.toBase58(),{data:token,owner:TOKEN_PROGRAM_ID,lamports:2039280,executable:false,rentEpoch:0});
 transaction(signature(51),[owners[0]],[{program:id,accounts:[owners[0].toBase58(),settlement],data:disc('global:create_cycle')}]);
 for(let i=0;i<3;i++)transaction(signature(52+i),[owners[i]],[instruction('fund_and_maybe_settle',settlement,i)]);
 transaction(signature(55),[owners[0]],[instruction('refund',walletRefund)]);
 const header={version:1,complete:true,network:'devnet',...identity,startedAt:'2026-01-01T00:00:00Z',completedAt:'2026-01-01T00:05:00Z'};
 const recovery={...header,kind:'swapcircle-independent-cli',packageOnly:true,separateProcess:true,noManifestFile:true,noOwnerKey:true,noFrontendOrBoardAccess:true,confirmation:'finalized',sourceRpc:'https://rpc-a.example',recoveryRpc:'https://rpc-b.example',cycle:recovered,receipt:{leg:0},owner:owners[0].toBase58(),payer:helper.toBase58(),amount:'10',destination:destination.toBase58(),originalAta:key(31).toBase58(),signature:signature(50)};
 const wallets={...header,kind:'swapcircle-browser-wallets',manual:true,observedBy:'Human reviewer',publicAppUrl:'https://example.org/swapcircle/',offersImported:true,matchingVerified:true,refreshVerified:true,creatorSessionClosedBeforeFinalFund:true,settlementCycle:settlement,creationSignature:signature(51),runs:[...owners.map((owner,i)=>({wallet:i===1?'Solflare':'Phantom',walletVersion:'1.0',browserProfile:'profile-'+i,owner:owner.toBase58(),operation:'fund',cycle:settlement,leg:i,signature:signature(52+i),balancesVerified:true})),{wallet:'Phantom',walletVersion:'1.0',browserProfile:'profile-0',owner:owners[0].toBase58(),operation:'refund',cycle:walletRefund,leg:0,signature:signature(55),balancesVerified:true}]};
 const rpc={getAccountInfo:async(address:PublicKey)=>accounts.get(address.toBase58())??null,getTransaction:async(sig:string)=>transactions.get(sig)??null} as unknown as Pick<Connection,'getAccountInfo'|'getTransaction'>;
 return {identity,recovery,wallets,rpc,transactions,accounts,destination};
}

describe('release evidence gates (RPC fixtures test validation, not chain execution)',()=>{
 it('accepts complete independent refund and three real-wallet instruction records',async()=>{const f=fixture();await expect(verifyAdditionalReleaseEvidence(f.rpc,f.identity,f.recovery,f.wallets)).resolves.toBeUndefined();});
 it('rejects previous-deployment receipts even if success booleans are true',async()=>{const f=fixture();f.transactions.get(f.recovery.signature).slot=99;await expect(verifyAdditionalReleaseEvidence(f.rpc,f.identity,f.recovery,f.wallets)).rejects.toThrow('predates');});
 it('rejects an unavailable finalized receipt',async()=>{const f=fixture();f.transactions.delete(f.recovery.signature);await expect(verifyAdditionalReleaseEvidence(f.rpc,f.identity,f.recovery,f.wallets)).rejects.toThrow('available successful');});
 it('rejects a refund whose owner had to sign',async()=>{const f=fixture();const tx=f.transactions.get(f.recovery.signature);tx.transaction.message.accountKeys[0]=new PublicKey(f.recovery.owner);await expect(verifyAdditionalReleaseEvidence(f.rpc,f.identity,f.recovery,f.wallets)).rejects.toThrow('without the owner');});
 it('requires the actual beneficiary delta, not only receipt balanceVerified',async()=>{const f=fixture();f.transactions.get(f.recovery.signature).meta.postTokenBalances[0].uiTokenAmount.amount='9';await expect(verifyAdditionalReleaseEvidence(f.rpc,f.identity,f.recovery,f.wallets)).rejects.toThrow('exact owner balance');});
 it('rejects test-wallet attestation and a missing second wallet',async()=>{const f=fixture();f.wallets.manual=false;await expect(verifyAdditionalReleaseEvidence(f.rpc,f.identity,f.recovery,f.wallets)).rejects.toThrow('human observer');f.wallets.manual=true;f.wallets.runs.forEach(run=>run.wallet='Phantom');await expect(verifyAdditionalReleaseEvidence(f.rpc,f.identity,f.recovery,f.wallets)).rejects.toThrow('Phantom, Solflare');});
 it('rejects reused browser profile for separate participants',async()=>{const f=fixture();f.wallets.runs[1].browserProfile=f.wallets.runs[0].browserProfile;await expect(verifyAdditionalReleaseEvidence(f.rpc,f.identity,f.recovery,f.wallets)).rejects.toThrow('separate profiles');});
 it('requires all supplemental evidence to be repeated after finalization',()=>{const f=fixture();expect(()=>validateEvidenceHeader(f.recovery,f.identity,'swapcircle-independent-cli','2026-01-01T00:01:00Z')).toThrow('repeated');expect(()=>validateEvidenceHeader({...f.recovery,artifactHash:'bad'},f.identity,'swapcircle-independent-cli')).toThrow('identity');});
 it('requires a later slot to exclude ambiguous ordering within the deployment slot',()=>{expect(()=>assertReceiptDeploymentSlot(101,100)).not.toThrow();expect(()=>assertReceiptDeploymentSlot(100,100)).toThrow();expect(()=>assertReceiptDeploymentSlot(99,100)).toThrow();expect(()=>assertReceiptDeploymentSlot(Number.NaN,100)).toThrow();});
});
