import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBenchmarkReport,benchmarkRatio,benchmarkTime,benchmarkQualitySummary} from './benchmark-model.mjs';
const report=()=>({generatedAt:'2026-11-02T00:00:00Z',model:'Local test model',hardware:'Test hardware',limitations:['Synthetic cases.'],runs:[{label:'Fixture only',phase:'development',pipelineVersion:'test',cases:2,checksPassed:3,checksTotal:4,routeCorrect:4,routeTotal:4,medianSeconds:1.2}]});
test('aggregate display keeps scoring units and missing measurements explicit',()=>{const data=validateBenchmarkReport(report());assert.equal(benchmarkRatio(data.runs[0].checksPassed,data.runs[0].checksTotal),'3 / 4 · 75.0%');assert.equal(data.runs[0].incorrectMerges,undefined);assert.equal(benchmarkTime(undefined),'Not recorded');assert.equal(benchmarkRatio(0,0),'Not assessed');});
test('impossible benchmark totals are not presented as performance claims',()=>{for(const edit of [v=>v.runs[0].checksPassed=5,v=>v.runs[0].routeCorrect=6,v=>v.runs[0].cases=-1,v=>v.runs[0].medianSeconds=Infinity]){const value=report();edit(value);assert.throws(()=>validateBenchmarkReport(value));}});
test('only aggregate fields are returned; stray benchmark inputs cannot reach the view',()=>{const value=report();value.inputs=['hidden question'];value.runs[0].expectedAnswers=['hidden answer'];const data=validateBenchmarkReport(value);assert.equal(Object.hasOwn(data,'inputs'),false);assert.equal(Object.hasOwn(data.runs[0],'expectedAnswers'),false);});
test('perfect requirement checks cannot conceal incomplete grouping, separation, or whole-case results',()=>{
  const value=report();Object.assign(value.runs[0],{checksPassed:4,fullyPassingCases:1,groupingChecksPassed:1,groupingChecks:2,separationChecksPassed:2,separationChecks:3});
  const run=validateBenchmarkReport(value).runs[0];assert.equal(benchmarkRatio(run.checksPassed,run.checksTotal),'4 / 4 · 100.0%');
  assert.equal(benchmarkQualitySummary(run),'Fully passing cases: 1 / 2 · 50.0%. Shared-group checks: 1 / 2 · 50.0%. Distinct-work separation: 2 / 3 · 66.7%.');
});
test('whole-case and grouping totals must be valid, complete count pairs',()=>{
  for(const patch of [{fullyPassingCases:3},{fullyPassingCases:0.5},{groupingChecksPassed:2,groupingChecks:1},{separationChecksPassed:1,separationChecks:0},{groupingChecksPassed:1},{separationChecks:2}]){
    const value=report();Object.assign(value.runs[0],patch);assert.throws(()=>validateBenchmarkReport(value));
  }
});
test('unassessed grouping and separation remain explicit rather than becoming perfect scores',()=>{
  const value=report();Object.assign(value.runs[0],{fullyPassingCases:0,groupingChecksPassed:0,groupingChecks:0,separationChecksPassed:0,separationChecks:0});
  assert.equal(benchmarkQualitySummary(validateBenchmarkReport(value).runs[0]),'Fully passing cases: 0 / 2 · 0.0%. Shared-group checks: Not assessed. Distinct-work separation: Not assessed.');
  assert.match(benchmarkQualitySummary(validateBenchmarkReport(report()).runs[0]),/Fully passing cases: Not assessed/);
});
