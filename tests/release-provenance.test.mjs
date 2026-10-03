import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {cpSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename,dirname,join,resolve} from 'node:path';
import {test} from 'node:test';
import {requireCleanCommit,sourceDigest,verifySourceCommit} from '../scripts/release-provenance.mjs';

function fixture(t){
 const temporary=mkdtempSync(join(tmpdir(),'swapcircle-provenance-'));
 t.after(()=>{if(dirname(resolve(temporary))!==resolve(tmpdir())||!basename(temporary).startsWith('swapcircle-provenance-'))throw new Error('Unsafe test cleanup path');rmSync(temporary,{recursive:true,force:true});});
 const root=join(temporary,'repository'),source=join(temporary,'prepared');mkdirSync(root);mkdirSync(source);
 const git=(...args)=>{const result=spawnSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr);return result.stdout.trim();};
 git('init','-q');git('config','user.name','Release provenance test');git('config','user.email','release-test@example.invalid');git('config','core.autocrlf','false');
 const put=(base,path,value)=>{mkdirSync(dirname(join(base,path)),{recursive:true});writeFileSync(join(base,path),value);};
 const files={'Anchor.toml':'[programs.devnet]\nswapcircle = "DevelopmentId"\n','Cargo.lock':'version = 4\n','Cargo.toml':'[workspace]\nmembers = ["programs/swapcircle"]\n','programs/swapcircle/Cargo.toml':'[package]\nname = "swapcircle"\n','programs/swapcircle/src/lib.rs':'declare_id!("DevelopmentId");\nconst MAX_LEGS: u8 = 4;\n'};
 for(const [path,value] of Object.entries(files))put(root,path,value);
 git('add','.');git('commit','-qm','Identifiable contract source');const commit=git('rev-parse','HEAD');
 for(const path of ['Anchor.toml','Cargo.lock','Cargo.toml','programs'])cpSync(join(root,path),join(source,path),{recursive:true});
 for(const path of ['Anchor.toml','programs/swapcircle/src/lib.rs'])put(source,path,readFileSync(join(source,path),'utf8').replaceAll('DevelopmentId','FinalId').replaceAll('\n','\r\n'));
 const release={commit:null,developmentProgramId:'DevelopmentId',programId:'FinalId',sourceHash:sourceDigest(source).sha256};
 return {root,source,release,commit,git,put};
}

test('prepare requires a committed repository with neither changed nor untracked files',t=>{
 const f=fixture(t);assert.equal(requireCleanCommit(f.root),f.commit);
 f.put(f.root,'Cargo.toml','changed\n');assert.throws(()=>requireCleanCommit(f.root),/clean committed/);
 f.git('checkout','--','Cargo.toml');f.put(f.root,'untracked.txt','not committed\n');assert.throws(()=>requireCleanCommit(f.root),/clean committed/);
});

test('existing snapshot binds to exact source commit with only ID and line-ending transforms',t=>{
 const f=fixture(t),binding=verifySourceCommit(f.root,f.source,f.release,f.commit);
 assert.equal(binding.commit,f.commit);assert.equal(binding.preparedSourceHash,f.release.sourceHash);assert.equal(binding.files.length,5);
 assert.equal(f.release.commit,null,'The original build provenance must not be invented');
 f.put(f.root,'Cargo.toml','uncommitted working-copy edit\n');
 assert.equal(verifySourceCommit(f.root,f.source,f.release,f.commit).commit,f.commit,'Explicit immutable Git source, not a mutable working copy, is compared');
 assert.throws(()=>verifySourceCommit(f.root,f.source,f.release,'main'),/complete 40-character/);
});

test('changed prepared bytes and semantic source changes cannot acquire provenance',t=>{
 const f=fixture(t);f.put(f.source,'programs/swapcircle/src/lib.rs','declare_id!("FinalId");\nconst MAX_LEGS: u8 = 5;\n');
 assert.throws(()=>verifySourceCommit(f.root,f.source,f.release,f.commit),/Prepared release source changed/);
 f.release.sourceHash=sourceDigest(f.source).sha256;
 assert.throws(()=>verifySourceCommit(f.root,f.source,f.release,f.commit),/Prepared source differs from commit/);
});

test('a commit with a different source inventory cannot identify the prepared artifact',t=>{
 const f=fixture(t);f.put(f.root,'programs/swapcircle/src/additional.rs','pub const EXTRA: u8 = 1;\n');f.git('add','.');f.git('commit','-qm','Additional source file');
 assert.throws(()=>verifySourceCommit(f.root,f.source,f.release,'HEAD'),/file inventories differ/);
 assert.equal(verifySourceCommit(f.root,f.source,f.release,f.commit).commit,f.commit);
});
