import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,copyFileSync,writeFileSync,readFileSync,readdirSync,rmSync,realpathSync,constants} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
test('release commands support split Node/npm and fail before writes without npm',async t=>{
  const directory=realpathSync(mkdtempSync(join(tmpdir(),'continuity-npm-path-')));
  const nodeDir=join(directory,'node only'),npmDir=join(directory,'npm tools');
  mkdirSync(nodeDir);mkdirSync(npmDir);
  const node=join(nodeDir,'node');copyFileSync(process.execPath,node,constants.COPYFILE_FICLONE);
  const helper=new URL('./npm.mjs',import.meta.url).href;
  const run=(args,path=npmDir)=>spawnSync(node,args,{cwd:root,encoding:'utf8',env:{...process.env,PATH:path}});
  try{
    // Executable npm can live outside Node's installation; its env shebang must
    // still find this selected Node. Arguments remain literal, including spaces.
    writeFileSync(join(npmDir,'npm'),'#!/usr/bin/env node\nconsole.log(process.argv[2]==="--version"?"fixture":JSON.stringify({node:process.execPath,args:process.argv.slice(2)}));\n',{mode:0o755});
    await t.test('PATH npm uses the selected Node and literal argument vector',()=>{
      const args=['pack','--ignore-scripts','a path with spaces','$(do-not-execute); &'];
      const result=run(['--input-type=module','-e',`import {requireNpm} from ${JSON.stringify(helper)}; const result=requireNpm()(${JSON.stringify(args)},{encoding:'utf8'});if(result.error||result.status)throw Error('npm failed');process.stdout.write(result.stdout);`]);
      assert.equal(result.status,0,result.stderr);
      assert.deepEqual(JSON.parse(result.stdout),{node,args});
    });
    await t.test('missing npm leaves the consumer empty',()=>{
      const consumer=join(directory,'consumer');mkdirSync(consumer);
      const result=run(['tools/duty-release/install.mjs',consumer],nodeDir);
      assert.notEqual(result.status,0);assert.match(result.stderr,/working npm executable is required on PATH/);
      assert.deepEqual(readdirSync(consumer),[]);
    });
    await t.test('missing npm fails before replacing prepared packages',()=>{
      const index=join(root,'sdk/duty-release/RELEASE-PACKAGES.json'),before=readFileSync(index);
      const result=run(['tools/duty-release/build.mjs'],nodeDir);
      assert.notEqual(result.status,0);assert.match(result.stderr,/working npm executable is required on PATH/);
      assert.deepEqual(readFileSync(index),before);
    });
  }finally{rmSync(directory,{recursive:true,force:true});}
});
