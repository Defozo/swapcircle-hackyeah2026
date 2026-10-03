import type { Keypair, Transaction } from '@solana/web3.js';
export interface Leg {owner:string;mint:string;amount:string;decimals:number}
export interface Manifest {
 version:1;cluster:'devnet'|'localnet';rpcUrl:string;genesisHash:string;programId:string;
 programData?:string;upgradeAuthority?:string|null;idlVersion:string;artifactHash?:string;commit?:string;
 mints:{symbol:string;mint:string;decimals:number}[];participants?:{name:string;owner:string}[];
 convexUrl?:string;deployed?:boolean;verifiedAt?:string;
}
export interface Cycle {
 address:string;version:number;creator:string;rentPayer:string;nonce:string;termsHash:string;deadline:number;
 legs:Leg[];state:'Funding'|'Settled'|'Refunding'|'Refunded';fundedMask:number;refundedMask:number;closedMask:number;bump:number;
}
export interface BuiltTransaction {transaction:Transaction;signers:Keypair[];destination?:string;cycleAddress?:string}
export interface RecoveryPackage {
 version:1;protocol:'SwapCircle';cluster:'devnet'|'localnet';genesisHash:string;programId:string;cycle:string;leg:number;
 owner:string;mint:string;amount:string;decimals:number;deadline:number;termsHash:string;sdkVersion:string;idlVersion:string;command:string;
}
export type TransactionPhase='awaiting-signature'|'submitted'|'confirmed'|'finalized'|'failed'|'unknown';
export interface TransactionProgress {phase:TransactionPhase;signature?:string;error?:string;blockhash?:string;lastValidBlockHeight?:number;at:number}
