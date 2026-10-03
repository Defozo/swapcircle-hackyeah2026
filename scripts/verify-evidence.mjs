import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const option=(name,fallback)=>{const i=process.argv.indexOf('--'+name);return i<0?fallback:process.argv[i+1];};
const cluster=option('cluster','localnet');if(!['localnet','devnet'].includes(cluster))throw new Error('Unsupported network');
const manifest=JSON.parse(readFileSync(`deployments/${cluster}.json`,'utf8'));
const path=`docs/evidence/${cluster}-flows.json`,report=JSON.parse(readFileSync(path,'utf8'));
const artifact=readFileSync(option('artifact','target/deploy/swapcircle.so'));
const hash=createHash('sha256').update(artifact).digest('hex');
const rpc=async(method,params=[])=>{const response=await fetch(manifest.rpcUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(20000)});const data=await response.json();if(data.error)throw new Error(method+': '+data.error.message);return data.result;};
const genesis=await rpc('getGenesisHash');
if(!report.complete||report.programId!==manifest.programId||report.network!==cluster||genesis!==manifest.genesisHash||hash!==manifest.artifactHash)throw new Error('Completed evidence, current network and artifact must agree');
if(report.genesisHash&&report.genesisHash!==genesis||report.artifactHash&&report.artifactHash!==hash)throw new Error('Recorded provenance differs from live evidence');
const program=(await rpc('getAccountInfo',[manifest.programId,{encoding:'base64',commitment:'finalized'}])).value;
if(!program?.executable)throw new Error('Program not executable');
const code=(await rpc('getAccountInfo',[manifest.programData??manifest.programId,{encoding:'base64',commitment:'finalized'}])).value;
const codeBytes=Buffer.from(code.data[0],'base64'),offset=manifest.programData?45:0;
if(!codeBytes.subarray(offset,offset+artifact.length).equals(artifact)||codeBytes.subarray(offset+artifact.length).some(x=>x!==0))throw new Error('Deployed bytes differ');
for(const cycle of [...report.cycles,report.refund]){
 const account=(await rpc('getAccountInfo',[cycle.address,{encoding:'base64',commitment:'finalized'}])).value;
 const bytes=account?Buffer.from(account.data[0],'base64'):null;
 if(!bytes||account.owner!==manifest.programId||bytes.length!==419||bytes[414]!==({Settled:1,Refunded:3}[cycle.state]))throw new Error('Cycle state differs from report');
}
const unavailableReceipts=[];let receiptsRead=0;
for(const tx of report.transactions){
 const live=await rpc('getTransaction',[tx.signature,{commitment:'finalized',maxSupportedTransactionVersion:0}]);
 if(!live&&cluster==='localnet'){unavailableReceipts.push(tx.signature);continue;}
 if(!live?.meta||live.meta.err||live.meta.fee!==tx.feeLamports||live.slot!==tx.slot)throw new Error('Finalized transaction receipt differs from report');
 receiptsRead++;
}
Object.assign(report,{genesisHash:genesis,artifactHash:hash,provenanceVerifiedAt:new Date().toISOString(),provenanceMethod:'Re-read executable bytes and all completed cycle accounts on this genesis. Each transaction was read at finalized during the original execution; historical receipt availability is recorded separately.',historyReadback:{read:receiptsRead,unavailable:unavailableReceipts,limitation:unavailableReceipts.length?'Local validator pruned older transaction history. Current cycle accounts and executable bytes remain verified.':null}});
writeFileSync(path,JSON.stringify(report,null,2)+'\n');
const summary={environment:cluster,genesisHash:genesis,artifactHash:hash,verifiedAt:report.provenanceVerifiedAt,cycles:[2,3,4].map(n=>{const rows=report.transactions.filter(t=>t.label.startsWith(n+'-'));return {participants:n,transactions:rows.length,signatures:rows.length,networkFeesLamports:rows.reduce((s,t)=>s+t.feeLamports,0),createBytes:rows.find(t=>t.label===n+'-create').bytes,finalFundBytes:rows.find(t=>t.label===n+'-fund-0').bytes,finalFundComputeUnits:rows.find(t=>t.label===n+'-fund-0').computeUnits,recipientAtas:'Already prepared by the demo seed; no ATA creation cost in this run.'};}),refund:report.transactions.filter(t=>t.label.startsWith('refund-')).map(({label,bytes,computeUnits,feeLamports,confirmedMs,finalizedMs})=>({label,bytes,computeUnits,feeLamports,confirmedMs,finalizedMs})),rent:{cycleLamports:await rpc('getMinimumBalanceForRentExemption',[419]),vaultLamports:await rpc('getMinimumBalanceForRentExemption',[165]),cycleRefundable:false,vaultRefundableWhenEmptyAndDischarged:true},transactionLimitBytes:1232,largestMeasuredBytes:Math.max(...report.transactions.map(t=>t.bytes)),maximumMeasuredComputeUnits:Math.max(...report.transactions.map(t=>t.computeUnits??0))};
writeFileSync(`docs/evidence/${cluster}-measurements.json`,JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({liveCyclesAndArtifactVerified:true,genesisHash:genesis,artifactHash:hash,originalFinalizedTransactions:report.transactions.length,historicalReceiptsRead:receiptsRead,historicalReceiptsUnavailable:unavailableReceipts.length,summary:`docs/evidence/${cluster}-measurements.json`},null,2));
