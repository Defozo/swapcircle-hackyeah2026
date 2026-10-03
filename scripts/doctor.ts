import {readFileSync,existsSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
import {Connection,PublicKey} from '@solana/web3.js';
import {SwapCircleClient,type Manifest} from '@swapcircle/sdk';
import {flag,has,loadManifest,writeJson} from './common';

const releasePath=flag('release');
const release=releasePath?JSON.parse(readFileSync(releasePath,'utf8')):undefined;
const releaseDir=releasePath?dirname(releasePath):undefined;
const manifest:Manifest=flag('manifest')||!release?loadManifest():{
 version:1,cluster:'devnet',rpcUrl:flag('rpc','https://api.devnet.solana.com')!,
 genesisHash:release.genesisHash,programId:release.programId,idlVersion:'0.1.0',
 artifactHash:release.artifactHash,mints:[],programData:release.programData,
 ...(release.status==='prepared'?{}:{upgradeAuthority:release.upgradeAuthority})
};
const errors:string[]=[];
const sourceRoot=releaseDir?join(releaseDir,'source'):'.';
const idlPath=releaseDir?join(releaseDir,release.idl):'packages/sdk/idl/swapcircle.json';
const artifactPath=releaseDir?join(releaseDir,release.artifact):'target/deploy/swapcircle.so';
const sha=(value:Uint8Array)=>createHash('sha256').update(value).digest('hex');
if(release&&(release.version!==1||release.cluster!=='devnet'||release.programId!==manifest.programId||release.genesisHash!==manifest.genesisHash))errors.push('Release and manifest identity mismatch');
for(const path of [join(sourceRoot,'Anchor.toml'),join(sourceRoot,'programs/swapcircle/src/lib.rs')]){
 if(!existsSync(path))errors.push('Missing '+path);else if(!readFileSync(path,'utf8').includes(manifest.programId))errors.push('Program ID mismatch '+path);
}
if(!existsSync(idlPath))errors.push('Missing '+idlPath);
else{
 const idl=JSON.parse(readFileSync(idlPath,'utf8'));
 if(idl.address!==manifest.programId)errors.push('IDL Program ID mismatch');
 if(release&&sha(readFileSync(idlPath))!==release.idlHash)errors.push('Release IDL hash mismatch');
}
const artifact=existsSync(artifactPath)?readFileSync(artifactPath):null;
if(!artifact)errors.push('Missing artifact '+artifactPath);
else if(manifest.artifactHash&&sha(artifact)!==manifest.artifactHash)errors.push('Artifact hash does not match manifest');
if(artifact&&release&&sha(artifact)!==release.artifactHash)errors.push('Release artifact hash mismatch');
let authority:{programData?:string;upgradeAuthority:string|null}|undefined;
if(!has('offline')){try{
 const connection=new Connection(flag('rpc',manifest.rpcUrl)!,'confirmed'),client=new SwapCircleClient(connection,manifest);
 await client.verifyNetwork();authority=await client.readProgramAuthority();
 if(manifest.programData&&authority.programData!==manifest.programData)errors.push('ProgramData mismatch');
 if(manifest.upgradeAuthority!==undefined&&manifest.upgradeAuthority!==authority.upgradeAuthority)errors.push('Upgrade authority mismatch');
 if(artifact){
  const code=await connection.getAccountInfo(new PublicKey(authority.programData??manifest.programId),'confirmed');
  if(!code)errors.push('Deployed program bytes missing');
  else{const offset=authority.programData?45:0;const onchain=code.data.subarray(offset,offset+artifact.length);if(sha(onchain)!==sha(artifact)||code.data.subarray(offset+artifact.length).some(byte=>byte!==0))errors.push('Deployed bytes do not match artifact');}
 }
 for(const mint of manifest.mints){const live=await client.readMint(mint.mint);if(live.decimals!==mint.decimals)errors.push('Decimals mismatch '+mint.symbol);if(live.mintAuthority)errors.push('Demo mint authority still enabled '+mint.symbol);}
}catch(error){errors.push(String(error));}}
const report={checkedAt:new Date().toISOString(),mode:has('offline')?'offline':'live',network:manifest.cluster,programId:manifest.programId,release:releasePath??null,artifactHash:artifact?sha(artifact):null,...authority,ok:errors.length===0,errors};
writeJson(flag('out','docs/evidence/doctor.json')!,report);console.log(JSON.stringify(report,null,2));if(errors.length)process.exitCode=1;
