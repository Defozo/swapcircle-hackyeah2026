const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const encode=bytes=>{let n=BigInt('0x'+Buffer.from(bytes).toString('hex')),result='';while(n){result=alphabet[Number(n%58n)]+result;n/=58n;}for(const byte of bytes){if(byte)break;result='1'+result;}return result;};
const addresses={};
for(const name of ['SWAPCIRCLE_DEVNET_DEPLOYER_KEY','SWAPCIRCLE_DEVNET_PROGRAM_KEY','SWAPCIRCLE_DEVNET_FINAL_PROGRAM_KEY','SWAPCIRCLE_DEVNET_ALICE_KEY','SWAPCIRCLE_DEVNET_BOB_KEY','SWAPCIRCLE_DEVNET_CELINE_KEY','SWAPCIRCLE_DEVNET_RECOVERY_KEY']){
 if(!process.env[name])continue;
 const raw=JSON.parse(process.env[name]);if(!Array.isArray(raw)||raw.length!==64||raw.some(x=>!Number.isInteger(x)||x<0||x>255))throw new Error('Invalid key shape: '+name);
 addresses[name]=encode(raw.slice(32));
}
if(!Object.keys(addresses).length)throw new Error('Inject the requested project keys using psst. Only their public addresses will be printed.');
console.log(JSON.stringify(addresses,null,2));
