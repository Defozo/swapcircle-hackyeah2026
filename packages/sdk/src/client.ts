import {Connection,Keypair,PublicKey,SystemProgram,Transaction,TransactionInstruction,SYSVAR_CLOCK_PUBKEY} from '@solana/web3.js';
import {ACCOUNT_SIZE,ASSOCIATED_TOKEN_PROGRAM_ID,NATIVE_MINT,TOKEN_PROGRAM_ID,createAssociatedTokenAccountIdempotentInstruction,createInitializeAccountInstruction,getAssociatedTokenAddressSync,unpackAccount,unpackMint} from '@solana/spl-token';
import {Buffer} from 'buffer';
import type {BuiltTransaction,Cycle,Leg,Manifest,RecoveryPackage} from './types';
import {CYCLE_SIZE,computeTermsHash,cyclePda,decodeCycle,discriminator,encodeLeg,i64,u64,validateLegs,vaultPda} from './codec';
export const DEVNET_GENESIS='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export const MAINNET_GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const pk=(address:string)=>new PublicKey(address);
const meta=(pubkey:PublicKey,isWritable=false,isSigner=false)=>({pubkey,isWritable,isSigner});
function instruction(programId:PublicKey,name:string,args:Buffer,keys:ReturnType<typeof meta>[]):TransactionInstruction{return new TransactionInstruction({programId,keys,data:Buffer.concat([discriminator('global',name),args])});}
export function assertSafeTokenAccount(info:ReturnType<typeof unpackAccount>,owner:PublicKey,mint:PublicKey):void {
 if(!info.owner.equals(owner)||!info.mint.equals(mint)||!info.isInitialized||info.isFrozen||info.delegate||info.closeAuthority&&!info.closeAuthority.equals(owner)||info.isNative)throw new Error('Unsafe token account: owner, mint, frozen state, delegate or close authority');
}
export class SwapCircleClient {
 readonly programId:PublicKey;
 constructor(readonly connection:Connection,readonly manifest:Manifest){this.programId=pk(manifest.programId);if(manifest.version!==1||!['devnet','localnet'].includes(manifest.cluster))throw new Error('Only devnet and localnet are supported');}
 async verifyNetwork():Promise<void>{const genesis=await this.connection.getGenesisHash();if(genesis===MAINNET_GENESIS||genesis!==this.manifest.genesisHash||this.manifest.cluster==='devnet'&&genesis!==DEVNET_GENESIS)throw new Error('RPC network does not match the release manifest');}
 async readChainTime():Promise<number>{const clock=await this.connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY,'confirmed');if(!clock||clock.data.length!==40)throw new Error('Cannot read the Solana Clock sysvar');const timestamp=clock.data.readBigInt64LE(32);if(timestamp<0n||timestamp>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Invalid network timestamp');return Number(timestamp);}
 async readCycle(address:string):Promise<Cycle>{await this.verifyNetwork();const info=await this.connection.getAccountInfo(pk(address),'confirmed');if(!info||!info.owner.equals(this.programId))throw new Error('Cycle does not exist in this program');return decodeCycle(address,info.data,this.manifest.programId);}
 async listCycles(owner?:string):Promise<Cycle[]>{await this.verifyNetwork();const rows=await this.connection.getProgramAccounts(this.programId,{commitment:'confirmed',filters:[{dataSize:CYCLE_SIZE}]});return rows.map(x=>decodeCycle(x.pubkey.toBase58(),x.account.data,this.manifest.programId)).filter(x=>!owner||x.creator===owner||x.legs.some(l=>l.owner===owner)).sort((a,b)=>b.deadline-a.deadline);}
 async readBalances(owner:string):Promise<{mint:string;account:string;amount:string;decimals:number}[]>{
  await this.verifyNetwork();const rows=await this.connection.getParsedTokenAccountsByOwner(pk(owner),{programId:TOKEN_PROGRAM_ID},'confirmed');
  return rows.value.map(x=>{const i=x.account.data.parsed.info;return {mint:i.mint,account:x.pubkey.toBase58(),amount:i.tokenAmount.amount,decimals:i.tokenAmount.decimals};});
 }
 async readProgramAuthority():Promise<{programData?:string;upgradeAuthority:string|null}>{
  await this.verifyNetwork();const info=await this.connection.getAccountInfo(this.programId,'confirmed');
  const loader=new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
  if(!info||!info.executable)throw new Error('Program is not deployed');
  if(info.owner.equals(new PublicKey('BPFLoader2111111111111111111111111111111111'))||info.owner.equals(new PublicKey('BPFLoader1111111111111111111111111111111111')))return {upgradeAuthority:null};
  if(!info.owner.equals(loader)||info.data.readUInt32LE(0)!==2)throw new Error('Program uses an unsupported loader');
  const programData=new PublicKey(info.data.subarray(4,36)).toBase58();const d=await this.connection.getAccountInfo(pk(programData),'confirmed');
  if(!d||!d.owner.equals(loader)||d.data.readUInt32LE(0)!==3)throw new Error('Invalid ProgramData');
  return {programData,upgradeAuthority:d.data[12]===0?null:new PublicKey(d.data.subarray(13,45)).toBase58()};
 }
 async readMint(address:string){const key=pk(address);if(key.equals(NATIVE_MINT))throw new Error('Wrapped SOL is not supported');const info=await this.connection.getAccountInfo(key,'confirmed');if(!info)throw new Error('Mint does not exist');const mint=unpackMint(key,info,TOKEN_PROGRAM_ID);if(!mint.isInitialized||mint.freezeAuthority)throw new Error('Only classic SPL mints without freeze authority are supported');return mint;}
 async buildCreate(args:{creator:string;nonce?:bigint;deadline:number;legs:Leg[]}):Promise<BuiltTransaction & {cycleAddress:string}>{
  await this.verifyNetwork();validateLegs(args.legs);if(!Number.isSafeInteger(args.deadline)||args.deadline<=await this.readChainTime())throw new Error('Deadline must be in the future');
  for(const leg of args.legs){const mint=await this.readMint(leg.mint);if(mint.decimals!==leg.decimals)throw new Error('Mint decimals mismatch');}
  const nonce=args.nonce??Buffer.from(crypto.getRandomValues(new Uint8Array(8))).readBigUInt64LE();const address=cyclePda(this.programId,args.creator,nonce);
  const count=Buffer.alloc(4);count.writeUInt32LE(args.legs.length);
  const ix=instruction(this.programId,'create_cycle',Buffer.concat([u64(nonce),i64(args.deadline),count,...args.legs.map(encodeLeg)]),[
   meta(pk(args.creator),true,true),meta(address,true),meta(SystemProgram.programId),meta(TOKEN_PROGRAM_ID),
   ...args.legs.flatMap((leg,index)=>[meta(pk(leg.mint)),meta(vaultPda(this.programId,address,index),true)])
  ]);
  return {transaction:new Transaction().add(ix),signers:[],cycleAddress:address.toBase58()};
 }
 private leg(cycle:Cycle,index:number):Leg{if(!Number.isInteger(index)||index<0||index>=cycle.legs.length)throw new Error('Invalid leg index');return cycle.legs[index];}
 async prepareDestinations(address:string,payer:string):Promise<BuiltTransaction>{
  const cycle=await this.readCycle(address),transaction=new Transaction();
  for(let i=0;i<cycle.legs.length;i++){
   const mint=pk(cycle.legs[i].mint),owner=pk(cycle.legs[(i+1)%cycle.legs.length].owner),ata=getAssociatedTokenAddressSync(mint,owner);
   const info=await this.connection.getAccountInfo(ata,'confirmed');
   if(info)assertSafeTokenAccount(unpackAccount(ata,info,TOKEN_PROGRAM_ID),owner,mint);
   else transaction.add(createAssociatedTokenAccountIdempotentInstruction(pk(payer),ata,owner,mint,TOKEN_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID));
  }
  return {transaction,signers:[]};
 }
 async buildFund(address:string,index:number,owner:string):Promise<BuiltTransaction>{
  const cycle=await this.readCycle(address),leg=this.leg(cycle,index);if(leg.owner!==owner)throw new Error('Connect the wallet that owns this leg');
  if(cycle.state!=='Funding'||cycle.fundedMask&(1<<index))throw new Error('This leg cannot be funded');
  if(cycle.deadline<=await this.readChainTime())throw new Error('Deadline has passed');
  const accounts=await this.connection.getTokenAccountsByOwner(pk(owner),{mint:pk(leg.mint)},'confirmed');
  const source=accounts.value.find(x=>{try{const a=unpackAccount(x.pubkey,x.account,TOKEN_PROGRAM_ID);assertSafeTokenAccount(a,pk(owner),pk(leg.mint));return a.amount>=BigInt(leg.amount);}catch{return false;}});
  if(!source)throw new Error('Insufficient tokens in a safe token account');
  const remaining:ReturnType<typeof meta>[]=[];
  for(let i=0;i<cycle.legs.length;i++){
   const l=cycle.legs[i],recipient=pk(cycle.legs[(i+1)%cycle.legs.length].owner),mint=pk(l.mint),ata=getAssociatedTokenAddressSync(mint,recipient);
   const info=await this.connection.getAccountInfo(ata,'confirmed');if(!info)throw new Error('Prepare recipient token accounts before funding');assertSafeTokenAccount(unpackAccount(ata,info,TOKEN_PROGRAM_ID),recipient,mint);
   remaining.push(meta(mint),meta(vaultPda(this.programId,address,i),true),meta(ata,true));
  }
  return {transaction:new Transaction().add(instruction(this.programId,'fund_and_maybe_settle',Buffer.concat([Buffer.from([index]),Buffer.from(cycle.termsHash,'hex')]),[meta(pk(address),true),meta(pk(owner),false,true),meta(source.pubkey,true),meta(TOKEN_PROGRAM_ID),...remaining])),signers:[]};
 }
 private async destination(cycle:Cycle,index:number,payer:string,options:{freshAccount?:boolean;destination?:string}={}):Promise<BuiltTransaction & {destination:string}>{
  const leg=this.leg(cycle,index),owner=pk(leg.owner),mint=pk(leg.mint);const transaction=new Transaction();const signers:Keypair[]=[];
  const ata=getAssociatedTokenAddressSync(mint,owner);let destination=options.destination?pk(options.destination):ata;
  if(options.freshAccount){const account=Keypair.generate();destination=account.publicKey;signers.push(account);const lamports=await this.connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE);
   transaction.add(SystemProgram.createAccount({fromPubkey:pk(payer),newAccountPubkey:destination,lamports,space:ACCOUNT_SIZE,programId:TOKEN_PROGRAM_ID}),createInitializeAccountInstruction(destination,mint,owner,TOKEN_PROGRAM_ID));
  }else{const info=await this.connection.getAccountInfo(destination,'confirmed');if(info)assertSafeTokenAccount(unpackAccount(destination,info,TOKEN_PROGRAM_ID),owner,mint);
   else if(destination.equals(ata))transaction.add(createAssociatedTokenAccountIdempotentInstruction(pk(payer),ata,owner,mint));
   else throw new Error('Chosen recovery account does not exist; request a fresh account');}
  return {transaction,signers,destination:destination.toBase58()};
 }
 async buildRefund(address:string,index:number,payer:string,options:{freshAccount?:boolean;destination?:string}={}):Promise<BuiltTransaction>{
  const c=await this.readCycle(address);this.leg(c,index);if(c.state==='Settled'||!(c.fundedMask&(1<<index))||c.refundedMask&(1<<index))throw new Error('No refundable deposit on this leg');
  const built=await this.destination(c,index,payer,options);built.transaction.add(this.payoutInstruction('refund',c,index,built.destination));return built;
 }
 async buildSurplus(address:string,index:number,payer:string,options:{freshAccount?:boolean;destination?:string}={}):Promise<BuiltTransaction>{
  const c=await this.readCycle(address);this.leg(c,index);const built=await this.destination(c,index,payer,options);built.transaction.add(this.payoutInstruction('return_surplus',c,index,built.destination));return built;
 }
 private payoutInstruction(name:string,c:Cycle,index:number,destination:string){return instruction(this.programId,name,Buffer.from([index]),[meta(pk(c.address),true),meta(vaultPda(this.programId,c.address,index),true),meta(pk(c.legs[index].mint)),meta(pk(destination),true),meta(TOKEN_PROGRAM_ID)]);}
 async buildClose(address:string,index:number):Promise<BuiltTransaction>{const c=await this.readCycle(address);this.leg(c,index);return {transaction:new Transaction().add(instruction(this.programId,'close_empty_vault',Buffer.from([index]),[meta(pk(address),true),meta(vaultPda(this.programId,address,index),true),meta(pk(c.rentPayer),true),meta(TOKEN_PROGRAM_ID)])),signers:[]};}
 recoveryPackage(c:Cycle,index:number):RecoveryPackage {const l=this.leg(c,index);return {version:1,protocol:'SwapCircle',cluster:this.manifest.cluster,genesisHash:this.manifest.genesisHash,programId:this.manifest.programId,cycle:c.address,leg:index,owner:l.owner,mint:l.mint,amount:l.amount,decimals:l.decimals,deadline:c.deadline,termsHash:c.termsHash,sdkVersion:'0.1.0',idlVersion:this.manifest.idlVersion,command:`pnpm recover -- --package swapcircle-recovery-${c.address}-${index}.json --rpc ${this.manifest.rpcUrl}`};}
 async estimateCost(transaction:Transaction,payer:string):Promise<{feeLamports:number;accountRentLamports:number;bytes:number}>{
  transaction.feePayer=pk(payer);transaction.recentBlockhash=(await this.connection.getLatestBlockhash('confirmed')).blockhash;
  const message=transaction.compileMessage();const fee=(await this.connection.getFeeForMessage(message,'confirmed')).value;if(fee===null)throw new Error('Could not estimate transaction fee');
  let rent=0;for(const ix of transaction.instructions){if(ix.programId.equals(this.programId)&&ix.data.subarray(0,8).equals(discriminator('global','create_cycle'))){const count=ix.data.readUInt32LE(24);rent+=await this.connection.getMinimumBalanceForRentExemption(CYCLE_SIZE)+count*await this.connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE);}else if(ix.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)){if(!await this.connection.getAccountInfo(ix.keys[1].pubkey))rent+=await this.connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE);}else if(ix.programId.equals(SystemProgram.programId)&&ix.data.readUInt32LE(0)===0){rent+=Number(ix.data.readBigUInt64LE(4));}}
  return {feeLamports:fee,accountRentLamports:rent,bytes:transaction.serialize({requireAllSignatures:false,verifySignatures:false}).length};
 }
}
