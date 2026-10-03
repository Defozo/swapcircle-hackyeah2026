import {PublicKey} from '@solana/web3.js';
import {Buffer} from 'buffer';
import {sha256} from '@noble/hashes/sha256';
import type {Cycle,Leg} from './types';
export const U64_MAX=(1n<<64n)-1n;
export const CYCLE_SIZE=419;
export const TERMS_DOMAIN='SwapCircle:terms:v1';
export function u64(value:bigint|string):Buffer {const n=BigInt(value);if(n<0n||n>U64_MAX)throw new Error('Amount outside u64 range');const b=Buffer.alloc(8);b.writeBigUInt64LE(n);return b;}
export function i64(value:number|bigint):Buffer {const n=BigInt(value);if(n<-(1n<<63n)||n>(1n<<63n)-1n)throw new Error('Timestamp outside i64 range');const b=Buffer.alloc(8);b.writeBigInt64LE(n);return b;}
export function discriminator(namespace:string,name:string):Buffer{return Buffer.from(sha256(new TextEncoder().encode(`${namespace}:${name}`))).subarray(0,8);}
export function parseAmount(text:string,decimals:number):bigint {
 if(!Number.isInteger(decimals)||decimals<0||decimals>255||text.length>300)throw new Error('Unsupported decimals or amount size');
 if(!/^(0|[1-9]\d*)(\.\d+)?$/.test(text))throw new Error('Use a positive decimal amount without exponents or separators');
 const [whole,fraction='']=text.split('.');if(fraction.length>decimals)throw new Error('Too many decimal places');
 const value=BigInt(whole)*10n**BigInt(decimals)+BigInt(fraction.padEnd(decimals,'0')||'0');
 if(value<=0n||value>U64_MAX)throw new Error('Amount must be positive and fit u64');return value;
}
export function formatAmount(value:string|bigint,decimals:number):string {
 if(!Number.isInteger(decimals)||decimals<0||decimals>255)throw new Error('Invalid decimals');
 const n=BigInt(value);if(n<0n||n>U64_MAX)throw new Error('Amount outside u64 range');
 if(!decimals)return n.toString();const digits=n.toString().padStart(decimals+1,'0');const fractional=digits.slice(-decimals).replace(/0+$/,'');return digits.slice(0,-decimals)+(fractional?'.'+fractional:'');
}
export function encodeLeg(leg:Leg):Buffer {
 if(BigInt(leg.amount)<=0n||!Number.isInteger(leg.decimals)||leg.decimals<0||leg.decimals>255)throw new Error('Invalid leg');
 return Buffer.concat([new PublicKey(leg.owner).toBuffer(),new PublicKey(leg.mint).toBuffer(),u64(leg.amount),Buffer.from([leg.decimals])]);
}
export function validateLegs(legs:Leg[]):void {
 if(legs.length<2||legs.length>4)throw new Error('A cycle needs 2 to 4 participants');
 if(new Set(legs.map(x=>new PublicKey(x.owner).toBase58())).size!==legs.length)throw new Error('Each participant must have a different wallet');
 legs.forEach(encodeLeg);
}
export function cyclePda(programId:PublicKey|string,creator:PublicKey|string,nonce:bigint|string):PublicKey {
 return PublicKey.findProgramAddressSync([Buffer.from('cycle'),new PublicKey(creator).toBuffer(),u64(nonce)],new PublicKey(programId))[0];
}
export function vaultPda(programId:PublicKey|string,cycle:PublicKey|string,index:number):PublicKey {
 if(!Number.isInteger(index)||index<0||index>3)throw new Error('Invalid leg index');
 return PublicKey.findProgramAddressSync([Buffer.from('vault'),new PublicKey(cycle).toBuffer(),Buffer.from([index])],new PublicKey(programId))[0];
}
export function computeTermsHash(programId:string,cycle:string,nonce:bigint|string,deadline:number,legs:Leg[]):string {
 validateLegs(legs);
 return Buffer.from(sha256(Buffer.concat([Buffer.from(TERMS_DOMAIN),new PublicKey(programId).toBuffer(),new PublicKey(cycle).toBuffer(),u64(nonce),i64(deadline),Buffer.from([legs.length]),...legs.map(encodeLeg)]))).toString('hex');
}
export function decodeCycle(address:string,data:Uint8Array,programId?:string):Cycle {
 const b=Buffer.from(data);if(b.length!==CYCLE_SIZE||!b.subarray(0,8).equals(discriminator('account','Cycle')))throw new Error('Invalid Cycle account');
 let p=8;const byte=()=>b[p++];const key=()=>{const v=new PublicKey(b.subarray(p,p+32)).toBase58();p+=32;return v;};
 const version=byte(),creator=key(),rentPayer=key();const nonce=b.readBigUInt64LE(p).toString();p+=8;
 const termsHash=b.subarray(p,p+32).toString('hex');p+=32;const deadlineRaw=b.readBigInt64LE(p);p+=8;
 if(deadlineRaw>BigInt(Number.MAX_SAFE_INTEGER)||deadlineRaw<0n)throw new Error('Invalid deadline');
 const deadline=Number(deadlineRaw),count=byte();if(version!==1||count<2||count>4)throw new Error('Unsupported cycle format');
 const legs:Leg[]=[];for(let j=0;j<4;j++){const owner=key(),mint=key(),amount=b.readBigUInt64LE(p).toString();p+=8;const decimals=byte();if(j<count)legs.push({owner,mint,amount,decimals});}
 const stateIndex=byte();const state=(['Funding','Settled','Refunding','Refunded'] as const)[stateIndex];if(!state)throw new Error('Invalid cycle state');
 const cycle:Cycle={address,version,creator,rentPayer,nonce,termsHash,deadline,legs,state,fundedMask:byte(),refundedMask:byte(),closedMask:byte(),bump:byte()};
 if(programId){if(cyclePda(programId,creator,nonce).toBase58()!==address)throw new Error('Cycle PDA mismatch');if(computeTermsHash(programId,address,nonce,deadline,legs)!==termsHash)throw new Error('Terms hash mismatch');}
 return cycle;
}
