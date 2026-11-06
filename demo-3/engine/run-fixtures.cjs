'use strict';

// Explicit local-only development evaluation. Reference labels are read for
// scoring only after generation; generate receives only each validated payload.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Engine=require('./rfi-engine.cjs');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
async function main(){
  if(!process.argv.includes('--run-local')) throw new Error('Local inference is opt-in: add --run-local.');
  const outputIndex=process.argv.indexOf('--output');
  const output=path.resolve(outputIndex>=0?process.argv[outputIndex+1]:path.join(__dirname,'../../../desktop-build/demo3/rfi-initial'));
  const workspace=path.resolve(__dirname,'../../..');
  if(!output.startsWith(workspace+path.sep)) throw new Error('Evaluation output must stay inside the Capstone workspace.');
  fs.mkdirSync(output,{recursive:true});
  const fixtureDir=path.resolve(__dirname,'../fixtures');
  const freeze=JSON.parse(fs.readFileSync(path.join(fixtureDir,'freeze.json'),'utf8'));
  for(const filename of ['inputs.json','references.json']) if(hash(fs.readFileSync(path.join(fixtureDir,filename)))!==freeze.sha256[filename]) throw new Error('Fixture freeze mismatch: '+filename);
  const inputs=JSON.parse(fs.readFileSync(path.join(fixtureDir,'inputs.json'),'utf8'));
  const caseIndex=process.argv.indexOf('--cases');
  const selectedIds=caseIndex>=0?process.argv[caseIndex+1]?.split(','):null;
  if(selectedIds && (!selectedIds.length || selectedIds.some(id=>!inputs.cases.some(item=>item.id===id))))throw new Error('Unknown or empty --cases selection.');
  const selectedCases=selectedIds?inputs.cases.filter(item=>selectedIds.includes(item.id)):inputs.cases;
  const manifest={startedAt:new Date().toISOString(),engineVersion:Engine.VERSION,fixtureVersion:inputs.version,freeze,developmentOnly:true,selectedCaseIds:selectedCases.map(item=>item.id),lessons:[],cases:[]};
  const manifestPath=path.join(output,'manifest.json');
  fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  for(const item of selectedCases){
    const startedAt=new Date().toISOString(),started=performance.now();
    console.log(JSON.stringify({event:'started',id:item.id,startedAt}));
    const callsPath=path.join(output,item.id+'.calls.jsonl');
    try{
      const response=await Engine.generate(item.payload,{progress:event=>console.log(JSON.stringify({id:item.id,...event})),record:event=>fs.appendFileSync(callsPath,JSON.stringify(event)+'\n')});
      fs.writeFileSync(path.join(output,item.id+'.json'),JSON.stringify({id:item.id,startedAt,completedAt:new Date().toISOString(),...response},null,2)+'\n',{flag:'wx'});
      manifest.cases.push({id:item.id,success:true,outcome:response.result.outcome,totalMs:response.totalMs,inputSha256:response.inputSha256});
      console.log(JSON.stringify({event:'completed',...manifest.cases.at(-1)}));
    }catch(error){
      const failure={id:item.id,success:false,error:error.message,totalMs:performance.now()-started,diagnostics:error.diagnostics};
      fs.writeFileSync(path.join(output,item.id+'.error.json'),JSON.stringify(failure,null,2)+'\n',{flag:'wx'});
      manifest.cases.push({id:item.id,success:false,error:error.message,totalMs:failure.totalMs});
      console.log(JSON.stringify({event:'failed',...manifest.cases.at(-1)}));
    }
    fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
  }
  // References are separate from all engine inputs and read only for scoring.
  const references=JSON.parse(fs.readFileSync(path.join(fixtureDir,'references.json'),'utf8'));
  const score={scoredAt:new Date().toISOString(),labelVersion:references.version,developmentOnly:true,independentValidation:false,description:'Outcome and exact reference-fact checks are provisional automated checks. Human semantic review is still required. No RFI-submission reduction or total human-review-time claim is measured.',cases:[]};
  for(const item of manifest.cases){
    const reference=references.cases.find(r=>r.id===item.id);
    if(!item.success){score.cases.push({id:item.id,success:false,outcomeCorrect:false,error:item.error});continue;}
    const run=JSON.parse(fs.readFileSync(path.join(output,item.id+'.json'),'utf8'));
    const result=run.result,answer=result.draftAnswer.toLowerCase();
    const cited=new Set(result.citations.map(c=>c.documentId));
    score.cases.push({id:item.id,success:true,expectedOutcome:reference.expectedOutcome,observedOutcome:result.outcome,outcomeCorrect:result.outcome===reference.expectedOutcome,unsafeAnswerProposal:reference.expectedOutcome==='formal_clarification'&&result.outcome==='answer_from_records',humanDecisionPending:result.humanDecision==='pending',missingExactReferenceFacts:(reference.requiredFacts||[]).filter(f=>!answer.includes(f.toLowerCase())),missingExpectedCitationIds:reference.requiredCitationDocumentIds.filter(id=>!cited.has(id)),rejectedCitations:run.audit.validation.rejected.length,verificationIssues:run.audit.verification.issues,totalMs:run.totalMs,modelCalls:run.calls.length});
  }
  const completed=score.cases.filter(c=>c.success);
  score.summary={cases:score.cases.length,successfulRuns:completed.length,correctOutcomes:score.cases.filter(c=>c.outcomeCorrect).length,unsafeAnswerProposals:completed.length?score.cases.filter(c=>c.unsafeAnswerProposal).length:null,allHumanDecisionsPending:completed.length?completed.every(c=>c.humanDecisionPending):null,totalModelWorkflowMs:manifest.cases.reduce((sum,c)=>sum+c.totalMs,0)};
  manifest.completedAt=new Date().toISOString();
  fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
  fs.writeFileSync(path.join(output,'provisional-score.json'),JSON.stringify(score,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({event:'scored',...score.summary}));
  if(manifest.cases.some(c=>!c.success))process.exitCode=1;
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
