import {spawnSync} from 'node:child_process';
import {cpSync,copyFileSync,existsSync,mkdirSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve,relative,join,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {Connection,Keypair,PublicKey} from '@solana/web3.js';
import {getMint} from '@solana/spl-token';
import bs58 from 'bs58';
import {assertReceiptDeploymentSlot,verifyAdditionalReleaseEvidence} from './release-evidence.ts';

try {
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');process.chdir(root);
const command=process.argv[2];
const flag=(name,fallback)=>{const i=process.argv.indexOf('--'+name);return i<0?fallback:process.argv[i+1];};
const sha=value=>createHash('sha256').update(value).digest('hex');
const json=path=>JSON.parse(readFileSync(path,'utf8'));
const write=(path,data)=>{mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(data,null,2)+'\n');};
const publicId=value=>new PublicKey(value).toBase58();
const genesis='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
const secret=name=>{if(!process.env[name])throw new Error(`Inject ${name} using psst`);try {const raw=JSON.parse(process.env[name]);if(!Array.isArray(raw)||raw.length!==64)throw new Error();return {json:JSON.stringify(raw),key:Keypair.fromSecretKey(Uint8Array.from(raw))};}catch{throw new Error('Invalid psst keypair secret');}};
function workspacePath(path){const absolute=resolve(path);if(absolute!==root&&!absolute.startsWith(root+sep))throw new Error('Release paths must remain inside the project');return absolute;}
const posix=path=>relative(root,path).split(sep).join('/');
function runDocker(args,{input,secretOutput=false}={}){const r=spawnSync('docker',args,{input,encoding:'utf8',stdio:secretOutput?'pipe':'inherit',windowsHide:true,maxBuffer:8*1024*1024});if(r.status!==0)throw new Error(secretOutput?'Solana release operation failed; raw output withheld because interrupted deployment may contain a buffer recovery phrase.':'Docker build command failed');return r.stdout;}
function sourceDigest(directory){const files=[];const walk=(path)=>{for(const item of readdirSync(path,{withFileTypes:true})){if(['target','.git'].includes(item.name))continue;const child=join(path,item.name);if(item.isDirectory())walk(child);else files.push({path:relative(directory,child).split(sep).join('/'),sha256:sha(readFileSync(child))});}};walk(directory);files.sort((a,b)=>a.path.localeCompare(b.path));return {sha256:sha(JSON.stringify(files)),files};}

if(command==='prepare'){
 const id=publicId(flag('program-id','Eof8Zk6Y6GkaeawM6grb3gQQFcXEikhEHuEnT4nLyzv4'));
 const output=workspacePath(flag('out',`target/releases/${id}`));const source=join(output,'source');
 // Never overwrite a prepared release. Its digest is an explicit review input.
 if(existsSync(join(output,'release.json')))throw new Error('Release already prepared. Choose a new --out path to retain the reviewed artifact.');
 mkdirSync(source,{recursive:true});
 for(const file of ['Cargo.toml','Cargo.lock','Anchor.toml'])copyFileSync(file,join(source,file));
 cpSync('programs',join(source,'programs'),{recursive:true,filter:path=>!path.split(sep).includes('target')});
 const lib=join(source,'programs/swapcircle/src/lib.rs'),original=readFileSync(lib,'utf8');
 const old=/declare_id!\("([^"]+)"\)/.exec(original)?.[1];if(!old)throw new Error('Missing original declare_id');
 writeFileSync(lib,original.replace(`declare_id!("${old}")`,`declare_id!("${id}")`));
 const anchor=join(source,'Anchor.toml');writeFileSync(anchor,readFileSync(anchor,'utf8').replaceAll(old,id));
 // Public base58 output paths only; no signer material is passed to this build.
 runDocker(['exec','-w','/workspace/'+posix(source),'swapcircle-toolchain','anchor','build','--ignore-keys']);
 copyFileSync(join(source,'target/deploy/swapcircle.so'),join(output,'swapcircle.so'));
 copyFileSync(join(source,'target/idl/swapcircle.json'),join(output,'swapcircle.json'));
 copyFileSync(join(source,'target/types/swapcircle.ts'),join(output,'swapcircle.ts'));
 const digest=sourceDigest(source);
 const commit=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true});
 const release={version:1,cluster:'devnet',genesisHash:genesis,programId:id,developmentProgramId:old,preparedAt:new Date().toISOString(),commit:commit.status===0?commit.stdout.trim():null,artifact:'swapcircle.so',artifactHash:sha(readFileSync(join(output,'swapcircle.so'))),idl:'swapcircle.json',idlHash:sha(readFileSync(join(output,'swapcircle.json'))),sourceHash:digest.sha256,sourceFiles:digest.files,status:'prepared',deployed:false,upgradeAuthority:null,immutabilityVerified:false};
 write(join(output,'release.json'),release);
 console.log(JSON.stringify({prepared:true,release:posix(join(output,'release.json')),programId:id,artifactHash:release.artifactHash,next:'Deploy mutable final program, run full devnet acceptance, inspect release, then explicitly finalize.'},null,2));
}else if(command==='deploy'||command==='finalize'||command==='publish'){
 const releasePath=workspacePath(flag('release',`target/releases/Eof8Zk6Y6GkaeawM6grb3gQQFcXEikhEHuEnT4nLyzv4/release.json`));
 const directory=dirname(releasePath),release=json(releasePath),id=publicId(release.programId);
 if(release.version!==1||release.cluster!=='devnet'||release.genesisHash!==genesis)throw new Error('Only a prepared devnet release is allowed');
 const artifactPath=workspacePath(join(directory,release.artifact)),artifact=readFileSync(artifactPath);
 if(sha(artifact)!==release.artifactHash||sha(readFileSync(join(directory,release.idl)))!==release.idlHash||json(join(directory,release.idl)).address!==id)throw new Error('Prepared release artifacts changed');
 if(sourceDigest(join(directory,'source')).sha256!==release.sourceHash)throw new Error('Prepared release source changed');
 const rpc=flag('rpc','https://api.devnet.solana.com'),connection=new Connection(rpc,'finalized');
 if(await connection.getGenesisHash()!==genesis)throw new Error('RPC is not Solana devnet');
 const loader=new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
 async function inspectProgram(){
  const account=await connection.getAccountInfo(new PublicKey(id),'finalized');
  if(!account?.executable||!account.owner.equals(loader)||account.data.length<36||account.data.readUInt32LE(0)!==2)throw new Error('Expected upgradeable-loader executable program not deployed');
  const dataAddress=new PublicKey(account.data.subarray(4,36));const data=await connection.getAccountInfo(dataAddress,'finalized');
  if(!data||!data.owner.equals(loader)||data.data.length<45+artifact.length||data.data.readUInt32LE(0)!==3)throw new Error('ProgramData invalid');
  if(sha(data.data.subarray(45,45+artifact.length))!==release.artifactHash||data.data.subarray(45+artifact.length).some(byte=>byte!==0))throw new Error('Deployed program bytes differ from reviewed artifact');
  if(data.data[12]!==0&&data.data[12]!==1)throw new Error('Invalid authority option');
  const deploymentSlot=Number(data.data.readBigUInt64LE(4));if(!Number.isSafeInteger(deploymentSlot))throw new Error('ProgramData deployment slot is invalid');
  return {programData:dataAddress.toBase58(),deploymentSlot,upgradeAuthority:data.data[12]===0?null:new PublicKey(data.data.subarray(13,45)).toBase58(),artifactHash:release.artifactHash,verifiedAt:new Date().toISOString()};
 }
 async function verifyAcceptance(evidence,deploymentSlot){
  if(evidence.programId!==id||evidence.network!=='devnet'||evidence.complete!==true||evidence.genesisHash!==genesis||evidence.artifactHash!==release.artifactHash)throw new Error('Complete acceptance must identify this final program, genesis and artifact');
  if(![2,3,4].every(n=>evidence.cycles?.some(c=>c.legs===n&&c.state==='Settled'&&c.balancesVerified))||evidence.refund?.state!=='Refunded'||!evidence.refund.independent||!evidence.refund.ownerAbsent||!evidence.refund.balancesVerified||!evidence.refund.freshAccount)throw new Error('Complete final-program devnet success and independent fallback recovery evidence is required');
  if(!Array.isArray(evidence.transactions)||evidence.transactions.length===0||evidence.transactions.length>512)throw new Error('Acceptance transaction receipts missing or oversized');
  const calls=[];
  const disc=name=>createHash('sha256').update('global:'+name).digest().subarray(0,8);
  for(const entry of evidence.transactions){
   const tx=await connection.getTransaction(entry.signature,{commitment:'finalized',maxSupportedTransactionVersion:0});
   if(!tx?.meta||tx.meta.err)throw new Error('Acceptance transaction lacks a successful finalized receipt');
   assertReceiptDeploymentSlot(tx.slot,deploymentSlot);
   const message=tx.transaction.message,keys=message.staticAccountKeys??message.accountKeys;
   const allKeys=[...keys,...(tx.meta.loadedAddresses?.writable??[]),...(tx.meta.loadedAddresses?.readonly??[])];
   for(const instruction of message.compiledInstructions??message.instructions){
    if(allKeys[instruction.programIdIndex]?.toBase58()!==id)continue;
    const bytes=typeof instruction.data==='string'?Buffer.from(bs58.decode(instruction.data)):Buffer.from(instruction.data);
    const accounts=instruction.accountKeyIndexes??instruction.accounts;
    for(const name of ['create_cycle','fund_and_maybe_settle','refund'])if(bytes.subarray(0,8).equals(disc(name)))calls.push({name,cycle:allKeys[accounts[name==='create_cycle'?1:0]]?.toBase58(),leg:bytes[8]});
   }
  }
  for(const entry of [...evidence.cycles,{address:evidence.refund.address,state:'Refunded'}]){
   const key=new PublicKey(entry.address),account=await connection.getAccountInfo(key,'finalized');
   const expectedState=entry.state==='Settled'?1:3;
   const cycleDiscriminator=createHash('sha256').update('account:Cycle').digest().subarray(0,8);
   if(!account||!account.owner.equals(new PublicKey(id))||account.data.length!==419||!account.data.subarray(0,8).equals(cycleDiscriminator)||account.data[414]!==expectedState)throw new Error('Acceptance cycle differs from live final program state');
   const n=account.data[121],funded=account.data[415],refunded=account.data[416],full=(1<<n)-1;
   if(n<2||n>4||entry.legs!==undefined&&entry.legs!==n||funded===0||funded&~full||refunded&~funded)throw new Error('Acceptance cycle has inconsistent legs or bitmaps');
   if(expectedState===1&&(funded!==full||refunded!==0)||expectedState===3&&funded!==refunded)throw new Error('Acceptance cycle liabilities remain unresolved');
   const creator=account.data.subarray(9,41),nonce=account.data.subarray(73,81);
   if(!PublicKey.findProgramAddressSync([Buffer.from('cycle'),creator,nonce],new PublicKey(id))[0].equals(key))throw new Error('Acceptance cycle PDA mismatch');
   const ownCalls=calls.filter(call=>call.cycle===entry.address);
   if(!ownCalls.some(call=>call.name==='create_cycle'))throw new Error('Acceptance lacks the actual final-program create instruction');
   for(let leg=0;leg<n;leg++)if(funded&(1<<leg)){
    if(!ownCalls.some(call=>call.name==='fund_and_maybe_settle'&&call.leg===leg))throw new Error('Acceptance lacks a funded leg instruction');
    if(expectedState===3&&!ownCalls.some(call=>call.name==='refund'&&call.leg===leg))throw new Error('Acceptance lacks an independently refunded leg instruction');
   }
  }
 }
 const execute=process.argv.includes('--execute');
 if(command==='deploy'){
  const payer=secret('SWAPCIRCLE_DEVNET_DEPLOYER_KEY'),program=secret('SWAPCIRCLE_DEVNET_FINAL_PROGRAM_KEY');
  if(program.key.publicKey.toBase58()!==id||id===release.developmentProgramId)throw new Error('Final program key must match the separate prepared program');
  const balance=await connection.getBalance(payer.key.publicKey);
  const rent=await connection.getMinimumBalanceForRentExemption(45+artifact.length*2);
  console.log(JSON.stringify({action:'deploy-mutable-final-program',execute,programId:id,artifactHash:release.artifactHash,payer:payer.key.publicKey.toBase58(),balanceLamports:balance,estimatedProgramDataRentLamports:rent},null,2));
  if(execute){
   if(balance<rent+5_000_000)throw new Error('Insufficient devnet SOL for program rent and fees');
   const script=`set -euo pipefail\numask 077\nSC_TMP=$(mktemp -d /tmp/swapcircle-release.XXXXXX)\ntrap 'rm -f "$SC_TMP/payer.json" "$SC_TMP/program.json"; rmdir "$SC_TMP"' EXIT\nIFS= read -r SC_PAYER\nIFS= read -r SC_PROGRAM\nprintf '%s' "$SC_PAYER" > "$SC_TMP/payer.json"\nprintf '%s' "$SC_PROGRAM" > "$SC_TMP/program.json"\nunset SC_PAYER SC_PROGRAM\nsolana program deploy "$1" --program-id "$SC_TMP/program.json" --keypair "$SC_TMP/payer.json" --url "$2" --output json\n`;
   runDocker(['exec','-i','swapcircle-toolchain','bash','-c',script,'release','/workspace/'+posix(artifactPath),rpc],{input:payer.json+'\n'+program.json+'\n',secretOutput:true});
   const inspection=await inspectProgram();if(inspection.upgradeAuthority!==payer.key.publicKey.toBase58())throw new Error('Unexpected deployed authority');
   Object.assign(release,inspection,{status:'deployed-mutable',deployed:true,immutabilityVerified:false});write(releasePath,release);console.log(JSON.stringify(release,null,2));
  }
 }else{
  const inspection=await inspectProgram();
  const evidencePath=workspacePath(flag('evidence','docs/evidence/devnet-flows.json')),evidence=json(evidencePath);
  await verifyAcceptance(evidence,inspection.deploymentSlot);
  const recoveryPath=workspacePath(flag('recovery-evidence','docs/evidence/devnet-independent-cli.json'));
  const walletsPath=workspacePath(flag('wallet-evidence','docs/evidence/devnet-browser-wallets.json'));
  const recoveryEvidence=json(recoveryPath),walletEvidence=json(walletsPath);
  await verifyAdditionalReleaseEvidence(connection,{programId:id,genesisHash:genesis,artifactHash:release.artifactHash,deploymentSlot:inspection.deploymentSlot},recoveryEvidence,walletEvidence,command==='publish'?release.finalizedAt:undefined);
  const publicApp=await fetch(walletEvidence.publicAppUrl,{signal:AbortSignal.timeout(15000),redirect:'error'});
  if(!publicApp.ok||!publicApp.headers.get('content-type')?.includes('text/html'))throw new Error('Accepted public frontend is unavailable without redirects');
  const additionalEvidenceHashes={independentCli:sha(readFileSync(recoveryPath)),browserWallets:sha(readFileSync(walletsPath))};
  if(command==='publish'){
   if(inspection.upgradeAuthority!==null||!release.immutabilityVerified||!release.finalizedAt)throw new Error('Final program immutability has not been verified');
   const began=Date.parse(evidence.startedAt),finalizedAt=Date.parse(release.finalizedAt);
   if(!Number.isFinite(began)||!Number.isFinite(finalizedAt)||began<=finalizedAt||evidence.authority?.upgradeAuthority!==null)throw new Error('Acceptance must be repeated after authority removal');
   const manifestPath=workspacePath(flag('manifest','deployments/devnet.json')),manifest=json(manifestPath);
   if(manifest.programId!==id||manifest.genesisHash!==genesis||manifest.cluster!=='devnet'||manifest.mints.length<3)throw new Error('Seed the final program manifest before publication');
   for(const entry of manifest.mints){const mint=await getMint(connection,new PublicKey(entry.mint),'finalized');if(mint.decimals!==entry.decimals||mint.mintAuthority||mint.freezeAuthority)throw new Error('Final demo mint retains authority or differs from manifest');}
   console.log(JSON.stringify({action:'publish-verified-final-manifest',execute,programId:id,artifactHash:release.artifactHash,evidenceHash:sha(readFileSync(evidencePath)),upgradeAuthority:null},null,2));
   if(execute){
    Object.assign(manifest,{programData:inspection.programData,upgradeAuthority:null,artifactHash:release.artifactHash,commit:release.commit??undefined,deployed:true,verifiedAt:new Date().toISOString()});
    write('deployments/devnet.json',manifest);write('apps/web/public/deployments/devnet.json',manifest);
    Object.assign(release,{status:'verified-immutable-release',postFinalizationEvidenceHash:sha(readFileSync(evidencePath)),postFinalizationAdditionalEvidenceHashes:additionalEvidenceHashes,publishedAt:new Date().toISOString()});write(releasePath,release);
    const publicDir=join(root,'deployments/releases',id);mkdirSync(publicDir,{recursive:true});
    copyFileSync(artifactPath,join(publicDir,'swapcircle.so'));copyFileSync(join(directory,release.idl),join(publicDir,'swapcircle.json'));write(join(publicDir,'release.json'),release);copyFileSync(evidencePath,join(publicDir,'acceptance.json'));
    copyFileSync(recoveryPath,join(publicDir,'independent-cli.json'));copyFileSync(walletsPath,join(publicDir,'browser-wallets.json'));
    console.log(JSON.stringify({published:true,manifest:'deployments/devnet.json',release:posix(join(publicDir,'release.json'))},null,2));
   }
  }else{
  console.log(JSON.stringify({action:'irreversibly-remove-upgrade-authority',execute,programId:id,...inspection,evidenceHash:sha(readFileSync(evidencePath)),warning:'After finalization no key can repair or upgrade this program. New versions require a new program address.'},null,2));
  if(execute){
   if(flag('confirm-immutable')!==id)throw new Error('Finalization requires --confirm-immutable with the exact reviewed final Program ID');
   if(inspection.upgradeAuthority===null)throw new Error('Program is already immutable; no transaction sent');
   const payer=secret('SWAPCIRCLE_DEVNET_DEPLOYER_KEY');if(inspection.upgradeAuthority!==payer.key.publicKey.toBase58())throw new Error('Deployer is not the current upgrade authority');
   const script=`set -euo pipefail\numask 077\nSC_TMP=$(mktemp -d /tmp/swapcircle-finalize.XXXXXX)\ntrap 'rm -f "$SC_TMP/payer.json"; rmdir "$SC_TMP"' EXIT\nIFS= read -r SC_PAYER\nprintf '%s' "$SC_PAYER" > "$SC_TMP/payer.json"\nunset SC_PAYER\nsolana program set-upgrade-authority "$1" --final --upgrade-authority "$SC_TMP/payer.json" --keypair "$SC_TMP/payer.json" --url "$2" --commitment finalized --output json\nsolana program show "$1" --url "$2" --commitment finalized --output json\n`;
   const cli=runDocker(['exec','-i','swapcircle-toolchain','bash','-c',script,'finalize',id,rpc],{input:payer.json+'\n',secretOutput:true});
   const after=await inspectProgram();if(after.upgradeAuthority!==null)throw new Error('Finalization did not remove authority');
   Object.assign(release,after,{status:'immutable-awaiting-post-finalization-acceptance',immutabilityVerified:true,finalizedAt:new Date().toISOString(),preFinalizationEvidenceHash:sha(readFileSync(evidencePath)),preFinalizationAdditionalEvidenceHashes:additionalEvidenceHashes});write(releasePath,release);
   write(join(directory,'finalization-receipt.json'),{...after,programId:id,cliOutput:cli.trim(),requiredNext:'Rerun complete final-program acceptance after authority removal before publishing final manifest.'});
   console.log(JSON.stringify({immutable:true,programId:id,programData:after.programData,next:'Rerun complete acceptance and publish final manifest.'},null,2));
  }
  }
 }
}else throw new Error('Usage: node scripts/release.mjs prepare|deploy|finalize|publish [--release path] [--execute]. Finalize also requires --confirm-immutable <Program ID>.');
} catch(error) {console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
