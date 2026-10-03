import {describe,it,expect,vi} from 'vitest';
import {Keypair,Connection} from '@solana/web3.js';
import {assertSafeTokenAccount,SwapCircleClient,MAINNET_GENESIS,DEVNET_GENESIS,type Manifest} from '@swapcircle/sdk';
const owner=Keypair.generate().publicKey,mint=Keypair.generate().publicKey,other=Keypair.generate().publicKey;
const account={address:Keypair.generate().publicKey,mint,owner,amount:1n,delegate:null,delegatedAmount:0n,isInitialized:true,isFrozen:false,isNative:false,rentExemptReserve:null,closeAuthority:null,tlvData:Buffer.alloc(0)};
describe('recovery account ownership',()=>{
 it('accepts an ordinary non-ATA account controlled by the owner',()=>expect(()=>assertSafeTokenAccount(account,owner,mint)).not.toThrow());
 it.each([{owner:other},{mint:other},{isFrozen:true},{delegate:other},{closeAuthority:other},{isNative:true},{isInitialized:false}])('rejects unsafe fields %j',change=>expect(()=>assertSafeTokenAccount({...account,...change},owner,mint)).toThrow());
 it('accepts explicit self close authority',()=>expect(()=>assertSafeTokenAccount({...account,closeAuthority:owner},owner,mint)).not.toThrow());
});
describe('network guard',()=>{
 const manifest:Manifest={version:1,cluster:'devnet',rpcUrl:'https://api.devnet.solana.com',programId:other.toBase58(),genesisHash:DEVNET_GENESIS,idlVersion:'0.1.0',mints:[]};
 it('rejects mainnet even if the supplied manifest also claims its genesis',async()=>{const c=new SwapCircleClient({getGenesisHash:vi.fn().mockResolvedValue(MAINNET_GENESIS)} as unknown as Connection,{...manifest,genesisHash:MAINNET_GENESIS});await expect(c.verifyNetwork()).rejects.toThrow('network');});
 it('rejects a stale local or wrong network endpoint',async()=>{const c=new SwapCircleClient({getGenesisHash:vi.fn().mockResolvedValue('other-genesis')} as unknown as Connection,manifest);await expect(c.verifyNetwork()).rejects.toThrow('network');});
});
