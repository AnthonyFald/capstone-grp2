// Public aggregate data only. No benchmark input or answer labels are loaded.
export function validateBenchmarkReport(value){
  if(!value||typeof value!=='object'||!Array.isArray(value.runs)||value.runs.length>12)throw Error('Invalid benchmark summary.');
  const string=(text,max=500)=>{if(typeof text!=='string'||text.length>max)throw Error('Invalid benchmark label.');return text;};
  const number=(v,integer=true)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<0||(integer&&!Number.isInteger(v)))throw Error('Invalid benchmark measurement.');return v;};
  const optionalCounts=['routeCorrect','routeTotal','completeRequirements','requirements','incorrectMerges','omittedRequirements','incorrectAnsweredRequests','fullyPassingCases','groupingChecksPassed','groupingChecks','separationChecksPassed','separationChecks'];
  const runs=value.runs.map(run=>{
    const output={label:string(run.label,160),phase:string(run.phase||'development',80),pipelineVersion:string(run.pipelineVersion||'Not recorded',100),cases:number(run.cases),checksPassed:number(run.checksPassed),checksTotal:number(run.checksTotal)};
    if(output.checksPassed>output.checksTotal)throw Error('Benchmark numerator exceeds its denominator.');
    for(const field of optionalCounts)if(run[field]!==undefined&&run[field]!==null)output[field]=number(run[field]);
    for(const field of ['medianSeconds','totalSeconds'])if(run[field]!==undefined&&run[field]!==null)output[field]=number(run[field],false);
    for(const [part,total]of [['routeCorrect','routeTotal'],['completeRequirements','requirements']])if(output[part]!==undefined&&output[total]!==undefined&&output[part]>output[total])throw Error('Benchmark numerator exceeds its denominator.');
    for(const [part,total]of [['groupingChecksPassed','groupingChecks'],['separationChecksPassed','separationChecks']]){
      if((output[part]===undefined)!==(output[total]===undefined))throw Error('Benchmark grouping and separation measurements need both a numerator and denominator.');
      if(output[part]!==undefined&&output[part]>output[total])throw Error('Benchmark numerator exceeds its denominator.');
    }
    if(output.fullyPassingCases!==undefined&&output.fullyPassingCases>output.cases)throw Error('Fully passing cases exceed the case count.');
    if(run.note)output.note=string(run.note,1500);return output;
  });
  const limitations=value.limitations||[];if(!Array.isArray(limitations)||limitations.length>12)throw Error('Invalid benchmark limitations.');
  return{generatedAt:string(value.generatedAt||'',100),model:string(value.model||'Not recorded',160),hardware:string(value.hardware||'Not recorded',200),limitations:limitations.map(line=>string(line,1500)),runs};
}
export function benchmarkRatio(passed,total){return typeof passed==='number'&&typeof total==='number'&&total>0?passed+' / '+total+' · '+(100*passed/total).toFixed(1)+'%':'Not assessed';}
export function benchmarkQualitySummary(run){return 'Fully passing cases: '+benchmarkRatio(run.fullyPassingCases,run.cases)+'. Shared-group checks: '+benchmarkRatio(run.groupingChecksPassed,run.groupingChecks)+'. Distinct-work separation: '+benchmarkRatio(run.separationChecksPassed,run.separationChecks)+'.';}
export function benchmarkTime(seconds){if(typeof seconds!=='number')return'Not recorded';return seconds<60?seconds.toFixed(1)+'s':Math.floor(seconds/60)+'m '+(seconds%60).toFixed(1)+'s';}
