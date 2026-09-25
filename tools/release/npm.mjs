// Supported local POSIX hosts: use their installed npm executable without a shell.
import {spawnSync} from 'node:child_process';
import {dirname,delimiter} from 'node:path';

export function requireNpm({env=process.env}={}) {
  const environment={...env,PATH:dirname(process.execPath)+delimiter+(env.PATH??'')};
  const run=(args,options={})=>spawnSync('npm',args,{...options,env:environment,shell:false});
  const probe=run(['--version'],{encoding:'utf8',timeout:30000});
  if(probe.error||probe.status!==0)throw Error('A working npm executable is required on PATH before release preparation: '+(probe.error?.code??`exit ${probe.status}`));
  return run;
}
