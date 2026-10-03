import {it,expect,vi} from 'vitest';
import {BorshInstructionCoder,BN,type Idl} from '@anchor-lang/core';
import {Connection,Keypair,PublicKey} from '@solana/web3.js';
import {SwapCircleClient,DEVNET_GENESIS,discriminator} from '@swapcircle/sdk';
import idl from '../../packages/sdk/idl/swapcircle.json';
it('SDK create bytes match the actual Anchor-generated IDL encoder',async()=>{
 const connection={getGenesisHash:vi.fn().mockResolvedValue(DEVNET_GENESIS)} as unknown as Connection;
 const client=new SwapCircleClient(connection,{version:1,cluster:'devnet',rpcUrl:'https://api.devnet.solana.com',genesisHash:DEVNET_GENESIS,programId:idl.address,idlVersion:'0.1.0',mints:[]});
 vi.spyOn(client,'readMint').mockResolvedValue({decimals:6} as any);
 vi.spyOn(client,'readChainTime').mockResolvedValue(Math.floor(Date.now()/1000));
 const creator=Keypair.generate().publicKey.toBase58(),legs=[0,1,2,3].map(()=>({owner:Keypair.generate().publicKey.toBase58(),mint:Keypair.generate().publicKey.toBase58(),amount:'18446744073709551615',decimals:6}));
 const deadline=Math.floor(Date.now()/1000)+3600,nonce=42n;
 const built=await client.buildCreate({creator,legs,deadline,nonce});
 const coder=new BorshInstructionCoder(idl as Idl);const encoded=coder.encode('create_cycle',{nonce:new BN(nonce.toString()),deadline:new BN(deadline),legs:legs.map(x=>({...x,owner:new PublicKey(x.owner),mint:new PublicKey(x.mint),amount:new BN(x.amount)}))});
 expect(built.transaction.instructions[0].data).toEqual(encoded);
 expect(built.transaction.instructions[0].keys).toHaveLength(12);
});
it('all SDK instruction discriminators match the generated program IDL',()=>{
 for(const instruction of idl.instructions)expect([...discriminator('global',instruction.name)]).toEqual(instruction.discriminator);
});
