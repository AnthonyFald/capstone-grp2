// Writes a deployable configuration ONLY after explicit free-account verification.
// Does not create resources, run Wrangler, access an account, or deploy anything.
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
// A public account identifier is not a credential. Keep deployment pinned to
// this one approved Capstone account without publishing unrelated account data.
export const CAPSTONE_ACCOUNT_ID='14b0eb074438a736ff74584493df40b7';
export function verifiedConfig(input,baseDirectory=path.dirname(fileURLToPath(import.meta.url))){
  if(input.project!=='capstone-team2-demo3')throw Error('Only the separate capstone-team2-demo3 project is allowed.');
  if(!/^[a-f0-9]{32}$/.test(input.accountId||''))throw Error('An explicitly verified FREE Capstone account ID is required.');
  if(input.accountId!==CAPSTONE_ACCOUNT_ID)throw Error('Every account except the approved Capstone account is forbidden.');
  if(input.accountPlan!=='workers-free'||input.verifiedFree!==true)throw Error('Independently verify Workers FREE before preparing deployment.');
  if(typeof input.accountName!=='string'||!/^capstone(?:\b|[-_])/i.test(input.accountName))throw Error('Use a clearly separate Capstone account.');
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(input.databaseId||''))throw Error('An existing Capstone D1 database ID is required.');
  return {name:'capstone-team2-demo3',main:path.join(baseDirectory,'entry.mjs'),account_id:input.accountId,compatibility_date:'2026-10-23',workers_dev:true,observability:{enabled:false},assets:{directory:path.resolve(baseDirectory,'../public'),binding:'ASSETS',run_worker_first:['/api/*']},d1_databases:[{binding:'CAPSTONE_DB',database_name:'capstone-team2-demo3',database_id:input.databaseId}],vars:{CAPSTONE_FREE_ACCOUNT_VERIFIED:'true'}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const values={};for(let i=2;i<process.argv.length;i+=2){const flag=process.argv[i],value=process.argv[i+1];if(!value)throw Error('Every option needs a value.');values[flag]=value;}const config=verifiedConfig({project:values['--project'],accountId:values['--account-id'],accountPlan:values['--account-plan'],accountName:values['--account-name'],databaseId:values['--database-id'],verifiedFree:values['--verified-free']==='true'});const out=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../desktop-build/demo3/.private/deployment');await mkdir(out,{recursive:true});await writeFile(path.join(out,'wrangler.json'),JSON.stringify(config,null,2)+'\n',{mode:0o600});console.log('Prepared Capstone-only configuration under desktop-build/demo3/.private/deployment. No resources were created and nothing was deployed.');}
  catch(error){console.error(error.message);process.exitCode=1;}
}
