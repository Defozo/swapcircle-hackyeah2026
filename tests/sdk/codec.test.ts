import {describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {Keypair,PublicKey} from '@solana/web3.js';
import {parseAmount,formatAmount,U64_MAX,computeTermsHash,cyclePda,u64,encodeLeg,validateLegs} from '@swapcircle/sdk';
describe('exact token amounts',()=>{
 it('preserves u64 values without float conversion',()=>{expect(parseAmount('18446744073709.551615',6)).toBe(U64_MAX);expect(formatAmount(U64_MAX,6)).toBe('18446744073709.551615');expect(parseAmount('100',0)).toBe(100n);expect(formatAmount(0n,6)).toBe('0');});
 it.each(['0','-1','1e6','1,23',' 1','1.0000001','18446744073709.551616','01'])('rejects ambiguous or invalid %s',value=>expect(()=>parseAmount(value,6)).toThrow());
 it('round-trips 1000 random exact values',()=>{let seed=17n;for(let i=0;i<1000;i++){seed=(seed*6364136223846793005n+1n)&U64_MAX;expect(parseAmount(formatAmount(seed||1n,6),6)).toBe(seed||1n);}});
});
describe('terms encoding',()=>{
 const program=new PublicKey(new Uint8Array(32).fill(9)).toBase58();const owners=[1,2,3].map(n=>Keypair.fromSeed(new Uint8Array(32).fill(n)).publicKey.toBase58());
 const legs=owners.map((owner,i)=>({owner,mint:new PublicKey(new Uint8Array(32).fill(11+i)).toBase58(),amount:['100','250','40'][i],decimals:0}));
 it('includes order, deadline, network program and account in immutable hash',()=>{const address=cyclePda(program,owners[0],42n).toBase58();const h=computeTermsHash(program,address,42n,1800000000,legs);expect(h).toHaveLength(64);expect(computeTermsHash(program,address,42n,1800000001,legs)).not.toBe(h);expect(computeTermsHash(program,address,42n,1800000000,[legs[1],legs[0],legs[2]])).not.toBe(h);
  const timestamp=Buffer.alloc(8);timestamp.writeBigInt64LE(1800000000n);const independent=createHash('sha256').update(Buffer.concat([Buffer.from('SwapCircle:terms:v1'),new PublicKey(program).toBuffer(),new PublicKey(address).toBuffer(),u64(42n),timestamp,Buffer.from([3]),...legs.map(encodeLeg)])).digest('hex');expect(h).toBe(independent);
 });
 it('rejects repeated owners, empty legs, oversized amounts',()=>{expect(()=>validateLegs([legs[0],legs[0]])).toThrow();expect(()=>validateLegs([legs[0]])).toThrow();expect(()=>encodeLeg({...legs[0],amount:(U64_MAX+1n).toString()})).toThrow();});
});
