import {createHash} from 'node:crypto';
import {PublicKey,type Connection} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID,unpackAccount} from '@solana/spl-token';
import bs58 from 'bs58';

type EvidenceRpc=Pick<Connection,'getTransaction'|'getAccountInfo'>;
export interface ReleaseIdentity {programId:string;genesisHash:string;artifactHash:string;deploymentSlot:number}
type Document=Record<string,any>;
const discriminator=(name:string)=>createHash('sha256').update(name).digest().subarray(0,8);
function required(condition:unknown,message:string):asserts condition{if(!condition)throw new Error(message);}

/** Observed results must belong to the currently deployed ELF, not an earlier upgrade. */
export function assertReceiptDeploymentSlot(slot:number,deploymentSlot:number):void {
 required(Number.isSafeInteger(slot)&&Number.isSafeInteger(deploymentSlot)&&deploymentSlot>=0&&slot>deploymentSlot,'Acceptance receipt predates or shares the current program deployment slot');
}

export function validateEvidenceHeader(value:unknown,identity:ReleaseIdentity,kind:string,after?:string):Document {
 const doc=value as Document;
 required(doc&&doc.version===1&&doc.kind===kind&&doc.complete===true&&doc.network==='devnet','Required release evidence is incomplete or has an unsupported format');
 required(doc.programId===identity.programId&&doc.genesisHash===identity.genesisHash&&doc.artifactHash===identity.artifactHash,'Release evidence identity differs from the reviewed deployment');
 const started=Date.parse(doc.startedAt),completed=Date.parse(doc.completedAt);
 required(Number.isFinite(started)&&Number.isFinite(completed)&&completed>=started&&completed<=Date.now()+60_000,'Release evidence timestamps are invalid');
 if(after)required(started>Date.parse(after),'All acceptance must be repeated after authority removal');
 return doc;
}

function decodeInstructions(tx:any,programId:string){
 const message=tx.transaction.message;
 const keys:PublicKey[]=[...(message.staticAccountKeys??message.accountKeys),...(tx.meta.loadedAddresses?.writable??[]),...(tx.meta.loadedAddresses?.readonly??[])];
 const instructions=(message.compiledInstructions??message.instructions).map((instruction:any)=>({
  program:keys[instruction.programIdIndex].toBase58(),
  accounts:(instruction.accountKeyIndexes??instruction.accounts).map((index:number)=>keys[index].toBase58()),
  data:typeof instruction.data==='string'?Buffer.from(bs58.decode(instruction.data)):Buffer.from(instruction.data)
 }));
 return {keys,instructions,signers:keys.slice(0,message.header.numRequiredSignatures).map(key=>key.toBase58()),calls:instructions.filter((instruction:any)=>instruction.program===programId)};
}

async function receipt(rpc:EvidenceRpc,identity:ReleaseIdentity,signature:string){
 let bytes:Uint8Array;try{bytes=bs58.decode(signature);}catch{throw new Error('Invalid acceptance signature');}
 required(bytes.length===64,'Invalid acceptance signature');
 const tx=await rpc.getTransaction(signature,{commitment:'finalized',maxSupportedTransactionVersion:0});
 required(tx?.meta&&!tx.meta.err,'Acceptance requires an available successful finalized receipt');
 assertReceiptDeploymentSlot(tx.slot,identity.deploymentSlot);
 return {tx,...decodeInstructions(tx,identity.programId)};
}

async function cycle(rpc:EvidenceRpc,identity:ReleaseIdentity,address:string){
 const key=new PublicKey(address),account=await rpc.getAccountInfo(key,'finalized');
 required(account&&account.owner.equals(new PublicKey(identity.programId))&&account.data.length===419&&account.data.subarray(0,8).equals(discriminator('account:Cycle')),'Acceptance cycle is not a live program receipt');
 const data=account.data,n=data[121];
 required(data[8]===1&&n>=2&&n<=4,'Acceptance cycle version or leg count is invalid');
 required(PublicKey.findProgramAddressSync([Buffer.from('cycle'),data.subarray(9,41),data.subarray(73,81)],new PublicKey(identity.programId))[0].equals(key),'Acceptance cycle PDA differs');
 return {state:data[414],funded:data[415],refunded:data[416],legs:Array.from({length:n},(_,i)=>({owner:new PublicKey(data.subarray(122+i*73,154+i*73)).toBase58(),mint:new PublicKey(data.subarray(154+i*73,186+i*73)).toBase58(),amount:data.readBigUInt64LE(186+i*73)}))};
}

/** Checks independent CLI and human wallet acceptance, never inferred from test adapters. */
export async function verifyAdditionalReleaseEvidence(rpc:EvidenceRpc,identity:ReleaseIdentity,recoveryValue:unknown,walletValue:unknown,after?:string):Promise<void>{
 const recovery=validateEvidenceHeader(recoveryValue,identity,'swapcircle-independent-cli',after);
 required(recovery.packageOnly&&recovery.separateProcess&&recovery.noManifestFile&&recovery.noOwnerKey&&recovery.noFrontendOrBoardAccess&&recovery.confirmation==='finalized','Independent CLI evidence must exclude the owner key, manifest, frontend and board');
 required(typeof recovery.recoveryRpc==='string'&&new URL(recovery.recoveryRpc).protocol==='https:'&&typeof recovery.sourceRpc==='string'&&recovery.recoveryRpc!==recovery.sourceRpc,'Independent devnet recovery requires a separately selected HTTPS RPC');
 const recovered=await cycle(rpc,identity,recovery.cycle),legIndex=recovery.receipt?.leg,leg=recovered.legs[legIndex];
 required(leg&&recovered.refunded&(1<<legIndex),'Independent CLI evidence does not identify a refunded leg');
 required(recovery.owner===leg.owner&&recovery.amount===leg.amount.toString()&&recovery.payer!==leg.owner&&recovery.destination!==recovery.originalAta,'Independent recovery beneficiary, amount or fallback differs');
 const recoveryTx=await receipt(rpc,identity,recovery.signature);
 required(recoveryTx.signers[0]===recovery.payer&&!recoveryTx.signers.includes(leg.owner),'Independent recovery must be paid without the owner signature');
 required(recoveryTx.calls.some((call:any)=>call.data.subarray(0,8).equals(discriminator('global:refund'))&&call.data[8]===legIndex&&call.accounts[0]===recovery.cycle&&call.accounts[3]===recovery.destination),'Independent recovery receipt lacks the claimed refund instruction');
 required(recoveryTx.signers.includes(recovery.destination)&&recoveryTx.instructions.some((call:any)=>call.program==='11111111111111111111111111111111'&&call.accounts[0]===recovery.payer&&call.accounts[1]===recovery.destination&&call.data.length===52&&call.data.readUInt32LE(0)===0&&call.data.readBigUInt64LE(12)===165n&&new PublicKey(call.data.subarray(20,52)).equals(TOKEN_PROGRAM_ID)),'Recovery receipt must atomically create the fresh SPL account with the independent fee payer');
 required(recoveryTx.instructions.some((call:any)=>call.program===TOKEN_PROGRAM_ID.toBase58()&&call.data[0]===18&&call.accounts[0]===recovery.destination&&call.accounts[1]===leg.mint&&call.data.length===33&&new PublicKey(call.data.subarray(1)).toBase58()===leg.owner),'Recovery receipt must initialize the fresh account for the original owner');
 const destinationIndex=recoveryTx.keys.findIndex(key=>key.toBase58()===recovery.destination);
 const pre=recoveryTx.tx.meta!.preTokenBalances?.find(balance=>balance.accountIndex===destinationIndex);
 const post=recoveryTx.tx.meta!.postTokenBalances?.find(balance=>balance.accountIndex===destinationIndex);
 required(post&&post.owner===leg.owner&&post.mint===leg.mint&&BigInt(post.uiTokenAmount.amount)-BigInt(pre?.uiTokenAmount.amount??'0')===leg.amount,'Independent recovery receipt does not prove the exact owner balance delta');
 const destination=new PublicKey(recovery.destination),destinationInfo=await rpc.getAccountInfo(destination,'finalized');
 required(destinationInfo,'Recovery token account is missing');
 const token=unpackAccount(destination,destinationInfo,TOKEN_PROGRAM_ID);
 required(token.isInitialized&&!token.isFrozen&&!token.isNative&&token.owner.toBase58()===leg.owner&&token.mint.toBase58()===leg.mint&&!token.delegate&&(!token.closeAuthority||token.closeAuthority.equals(token.owner)),'Recovery account has unsafe current authority');

 const wallets=validateEvidenceHeader(walletValue,identity,'swapcircle-browser-wallets',after);
 required(wallets.manual===true&&typeof wallets.observedBy==='string'&&wallets.observedBy.trim().length>0,'Real wallet acceptance requires a named human observer');
 const app=new URL(wallets.publicAppUrl);
 required(app.protocol==='https:'&&!app.username&&!app.password&&!['localhost','127.0.0.1','[::1]'].includes(app.hostname),'Wallet acceptance requires the public HTTPS frontend');
 required(wallets.offersImported&&wallets.matchingVerified&&wallets.refreshVerified&&wallets.creatorSessionClosedBeforeFinalFund,'Public frontend offer, matching, refresh and absent creator checks are missing');
 required(Array.isArray(wallets.runs)&&wallets.runs.length>=4&&wallets.runs.length<=32,'Real wallet acceptance runs are missing');
 const settlement=await cycle(rpc,identity,wallets.settlementCycle),full=(1<<settlement.legs.length)-1;
 required(settlement.legs.length>=3&&settlement.state===1&&settlement.funded===full&&settlement.refunded===0,'Wallet acceptance requires a settled cycle with at least three separate owners');
 const creation=await receipt(rpc,identity,wallets.creationSignature);
 required(creation.calls.some((call:any)=>call.data.subarray(0,8).equals(discriminator('global:create_cycle'))&&call.accounts[1]===wallets.settlementCycle),'Browser creation receipt does not create the accepted cycle');
 const profiles=new Set<string>(),funded=new Set<number>(),walletNames=new Set<string>();let sawRefund=false;
 for(const run of wallets.runs){
  required(['Phantom','Solflare'].includes(run.wallet)&&typeof run.walletVersion==='string'&&run.walletVersion.trim()&&typeof run.browserProfile==='string'&&run.browserProfile.trim()&&run.balancesVerified===true,'Each wallet run requires actual wallet/version/profile and balance readback');
  const operation=run.operation;
  required(operation==='fund'||operation==='refund','Wallet run operation is unsupported');
  const state=run.cycle===wallets.settlementCycle?settlement:await cycle(rpc,identity,run.cycle),ownLeg=state.legs[run.leg];
  required(ownLeg&&Number.isInteger(run.leg)&&run.owner===ownLeg.owner,'Wallet run owner differs from immutable terms');
  const result=await receipt(rpc,identity,run.signature),name=operation==='fund'?'fund_and_maybe_settle':'refund';
  required(result.signers.includes(run.owner),'Real participant wallet did not sign this accepted operation');
  required(result.calls.some((call:any)=>call.data.subarray(0,8).equals(discriminator('global:'+name))&&call.data[8]===run.leg&&call.accounts[0]===run.cycle),'Wallet receipt lacks the claimed program instruction');
  walletNames.add(run.wallet);
  if(operation==='fund'){
   required(run.cycle===wallets.settlementCycle&&!funded.has(run.leg)&&!profiles.has(run.browserProfile),'Wallet settlement must use separate profiles and distinct legs');
   profiles.add(run.browserProfile);funded.add(run.leg);
  }else{required(state.refunded&(1<<run.leg),'Wallet refund is not reflected by live state');sawRefund=true;}
 }
 required(funded.size===settlement.legs.length&&walletNames.has('Phantom')&&walletNames.has('Solflare')&&sawRefund,'Acceptance must exercise every settlement leg, Phantom, Solflare and a wallet refund');
}
