import {spawnSync} from 'node:child_process';
import {readFileSync,readdirSync} from 'node:fs';
import {join,relative,sep} from 'node:path';
import {createHash} from 'node:crypto';

const sha=value=>createHash('sha256').update(value).digest('hex');
const sourcePaths=['Anchor.toml','Cargo.lock','Cargo.toml','programs'];
function git(root,args){const result=spawnSync('git',args,{cwd:root,windowsHide:true,maxBuffer:16*1024*1024});if(result.status!==0)throw new Error('Cannot verify release source against Git');return result.stdout;}
function commitId(root,ref){if(!/^(HEAD|[0-9a-f]{40})$/i.test(ref))throw new Error('Use HEAD or a complete 40-character source commit');return git(root,['rev-parse','--verify',`${ref}^{commit}`]).toString('utf8').trim();}
export function requireCleanCommit(root){const commit=commitId(root,'HEAD');if(git(root,['status','--porcelain','--untracked-files=all']).length)throw new Error('Prepare requires a clean committed repository, including untracked files');return commit;}

export function sourceDigest(directory){
 const files=[];
 const walk=path=>{for(const item of readdirSync(path,{withFileTypes:true})){if(['target','.git'].includes(item.name))continue;const child=join(path,item.name);if(item.isDirectory())walk(child);else files.push({path:relative(directory,child).split(sep).join('/'),sha256:sha(readFileSync(child))});}};
 walk(directory);files.sort((a,b)=>a.path.localeCompare(b.path));return {sha256:sha(JSON.stringify(files)),files};
}

/** Binds an existing immutable source snapshot to Git without pretending it was built then. */
export function verifySourceCommit(root,source,release,ref){
 const commit=commitId(root,ref);
 const prepared=sourceDigest(source);
 if(prepared.sha256!==release.sourceHash)throw new Error('Prepared release source changed');
 const paths=git(root,['ls-tree','-r','--name-only',commit,'--',...sourcePaths]).toString('utf8').trim().split('\n').filter(Boolean).filter(path=>!path.split('/').some(part=>['target','.git'].includes(part))).sort();
 if(JSON.stringify(paths)!==JSON.stringify(prepared.files.map(file=>file.path).sort()))throw new Error('Commit and prepared release source file inventories differ');
 const files=[];
 for(const entry of prepared.files){
  const original=git(root,['show',`${commit}:${entry.path}`]);
  let mapped=original;
  if(entry.path==='Anchor.toml')mapped=Buffer.from(original.toString('utf8').replaceAll(release.developmentProgramId,release.programId));
  if(entry.path==='programs/swapcircle/src/lib.rs')mapped=Buffer.from(original.toString('utf8').replace(`declare_id!("${release.developmentProgramId}")`,`declare_id!("${release.programId}")`));
  const actual=readFileSync(join(source,entry.path));
  // Git normalizes text on checkout. No other whitespace or source edits qualify.
  const textFile=/\.(rs|toml|lock|md|txt|json)$/.test(entry.path);
  const normalized=bytes=>textFile?Buffer.from(bytes.toString('utf8').replaceAll('\r\n','\n')):bytes;
  if(!normalized(mapped).equals(normalized(actual)))throw new Error(`Prepared source differs from commit: ${entry.path}`);
  files.push({path:entry.path,gitFileSha256:sha(original),preparedFileSha256:entry.sha256,normalizedPreparedSha256:sha(normalized(actual))});
 }
 return {version:1,commit,verifiedAt:new Date().toISOString(),preparedSourceHash:prepared.sha256,normalizedSourceHash:sha(JSON.stringify(files.map(file=>({path:file.path,sha256:file.normalizedPreparedSha256})))),transformations:['Development Program ID replaced by final Program ID only in declare_id and Anchor.toml','CRLF and LF compared equivalently for text files'],files};
}
