import {spawnSync} from 'node:child_process';
const result=spawnSync('docker',['exec','swapcircle-toolchain','bash','-lc','cd /workspace && cargo test -p swapcircle --lib'],{stdio:'inherit',windowsHide:true});
if(result.status!==0)process.exit(result.status??1);
const integration=spawnSync('docker',['exec','swapcircle-toolchain','bash','-lc','cd /workspace/tests/program && cargo test --locked -- --nocapture'],{stdio:'inherit',windowsHide:true});
process.exit(integration.status??1);
