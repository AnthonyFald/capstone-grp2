// Always a local build. This entry cannot deploy or create cloud resources.
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const directory=path.dirname(fileURLToPath(import.meta.url));
const state=path.resolve(directory,'../../desktop-build/demo3/.private');
await mkdir(state,{recursive:true});
const env={...process.env,WRANGLER_SEND_METRICS:'false',XDG_CONFIG_HOME:path.join(state,'wrangler-home')};
for(const key of ['CLOUDFLARE_API_TOKEN','CLOUDFLARE_API_KEY','CLOUDFLARE_ACCOUNT_ID','CLOUDFLARE_EMAIL'])delete env[key];
const child=spawn(process.execPath,[path.join(directory,'node_modules/wrangler/bin/wrangler.js'),'deploy','--dry-run','--config',path.join(directory,'wrangler.jsonc'),'--outdir',path.join(state,'worker-dry-run')],{cwd:directory,env,stdio:'inherit',windowsHide:true});
child.on('error',()=>{console.error('Install the pinned local build dependencies before running this build.');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
