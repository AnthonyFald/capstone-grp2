const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const C=require('../core.js'),E=require('../engine.js');
const data=name=>JSON.parse(fs.readFileSync(path.join(__dirname,'../data',name+'.json'),'utf8'));
const rows=C.reports(data('reports-a'));
test('blind normalization drops label leakage, preserves missing values and sorts chronology',()=>{const x=C.reports([{...rows[1],ground_truth_notes:'SECRET',ground_truth_issue_ids:'ISS-99',report_completeness:'answer'},rows[0]]);assert.equal(x[0].report_id,'DR-A01');assert.ok(!JSON.stringify(x).includes('SECRET'));assert.ok(!JSON.stringify(x).includes('ground_truth'));assert.equal(C.reports(data('reports-a'))[5].weather,'');});
test('CSV round trip handles quotes, multiline fields and a BOM',()=>{const r={...rows[0],issue_or_update:'Quoted "release",\nnot received.'};const csv=C.csv([r]);assert.deepEqual(C.parseCSV('\uFEFF'+csv),[r]);});
test('reject malformed CSV and invalid/duplicate identities and calendar dates',()=>{assert.throws(()=>C.parseCSV('report_id,report_date\n"oops'));assert.throws(()=>C.parseCSV('report_id,report_date\nA,2026-01-01,extra'));assert.throws(()=>C.reports([rows[0],rows[0]]));assert.throws(()=>C.reports([{...rows[0],report_date:'2026-02-30'}]));assert.throws(()=>C.reports([{...rows[0],report_id:'<script>'}]));});
test('import bounds prevent unbounded local inference input',()=>{assert.throws(()=>C.reports(Array.from({length:31},(_,i)=>({...rows[0],report_id:'R'+i}))));assert.throws(()=>C.reports([{...rows[0],issue_or_update:'x'.repeat(5001)}]));});
const finding={title:'Water source unknown',category:'unresolved',status:'open',observation:'The source is not confirmed.',consequence:'Further investigation may be needed.',action:'Confirm the source.',owner:null,due:null,uncertainty:'No cause established.',evidence:[{report_id:'DR-A01',field:'issue_or_update',quote:'The source has not been confirmed.'}]};
test('source validation rejects fabricated quotes, report IDs and nonexistent fields',()=>{assert.equal(C.validate({findings:[finding]},rows).findings.length,1);for(const evidence of [[{...finding.evidence[0],report_id:'MISSING'}],[{...finding.evidence[0],quote:'The test failed.'}],[{...finding.evidence[0],field:'ground_truth_notes'}]])assert.throws(()=>C.validate({findings:[{...finding,evidence}]},rows));});
test('empty findings valid; incomplete object rejected',()=>{assert.deepEqual(C.validate({findings:[]},rows),{findings:[]});assert.throws(()=>C.validate({findings:[{...finding,action:null}]},rows));});
test('field references retrieve exact text without generated quotations',()=>{const r=C.validate({findings:[{...finding,evidence:[{report_id:'DR-A01',field:'issue_or_update'}]}]},rows);assert.equal(r.findings[0].evidence[0].quote,rows[0].issue_or_update);});
test('optional assignments are withheld unless the exact source action and metadata match',()=>{for(const f of [{...finding,owner:'Invented Inspector',due:'2030-12-31'},{...finding,owner:'General Contractor',due:'2026-05-12'}]){const out=C.validate({findings:[f]},rows).findings[0];assert.equal(out.owner,null);assert.equal(out.due,null);assert.deepEqual(out.withheldFields,['owner','due']);}const direct={...finding,action:rows[0].action_required,owner:'General Contractor',due:'2026-05-12'},out=C.validate({findings:[direct]},rows).findings[0];assert.equal(out.owner,'General Contractor');assert.equal(out.due,'2026-05-12');assert.equal(out.withheldFields.length,0);assert.deepEqual(C.validate({findings:[C.validate({findings:[{...finding,owner:'Borrowed',due:null}]},rows).findings[0]]},rows).findings[0].withheldFields,['owner']);});
test('scoring keeps partial as missed and cannot declare unscored output accurate',()=>{const issues=[{issue_id:'1'},{issue_id:'2'}],findings=[{id:'F1'},{id:'F2'}];let s=C.score(issues,{'1':{rating:'found',findingId:'F1'},'2':{rating:'partial'}},findings,{F1:'supported',F2:'unsupported'});assert.equal(s.recall,.5);assert.equal(s.precision,.5);assert.equal(s.fn,1);s=C.score(issues,{'1':{rating:'found'}},findings,{});assert.equal(s.complete,false);assert.equal(s.recall,null);});
test('zero-case denominators and missing human measurements are not invented',()=>{const s=C.score([],{},[],{});assert.equal(s.recall,null);assert.equal(s.precision,null);assert.equal(C.reduction(0,0),null);assert.equal(C.reduction(null,1),null);assert.equal(C.reduction(100,null),null);assert.equal(C.reduction(100,75),.25);});
test('CSV export neutralizes formulas including whitespace-prefixed ones',()=>{for(const value of ['=SUM(1,2)','\t=SUM(1,2)','  +1','@command'])assert.ok(C.csv([{text:value}]).includes('"\''+value+'"'));});
test('all bundled datasets are valid and answer keys are excluded',()=>{for(const name of ['reports-a','reports-b','reports-clean']){const input=C.reports(data(name));assert.ok(input.length);assert.equal(Object.keys(input[0]).length,18);assert.ok(!JSON.stringify(input).includes('expected_interpretation'));}});
test('rules are explicitly distinct from AI and preserve evidence',()=>{const r=C.baseline(rows);assert.ok(r.findings.length>0);assert.match(r.findings[0].uncertainty,/Rules/);assert.doesNotThrow(()=>C.validate(r,rows));});
const inventory=E.inventory(rows),sourceId=(report,field,contains)=>inventory.facts.find(f=>f.report_id===report&&f.field===field&&f.quote.includes(contains)).id;
const selected={kind:'cause',status:'needs_verification',facts:[sourceId('DR-A01','issue_or_update','Water damage')],latest:[sourceId('DR-A01','issue_or_update','not been confirmed')]};
const response=data=>({choices:[{message:{content:JSON.stringify(data)},finish_reason:'stop'}]});
const fakeEngine=responses=>({resetChat:async()=>{},chat:{completions:{create:async request=>{responses.calls.push(request);return response(responses.shift());}}}});
test('source inventory preserves every field sentence, decimals and deterministic authors',()=>{const f=inventory.facts.find(f=>f.report_id==='DR-A09'&&f.field==='quantity_or_measurement');assert.match(f.quote,/4\.2 m3/);assert.equal(f.report_author,'General Contractor - Site Superintendent');for(const fact of inventory.facts)assert.ok(rows.find(r=>r.report_id===fact.report_id)[fact.field].includes(fact.quote));assert.ok(inventory.facts.some(f=>f.field==='schedule_status'&&/strength-test/.test(f.quote)));});
test('source validation is idempotent for short exact reference IDs',()=>{const f={...finding,evidence:[{report_id:'DR-A04',field:'rfi_change_order_refs',quote:'RFI-017'}]},once=C.validate({findings:[f]},rows);assert.deepEqual(C.validate(once,rows),once);});
test('generation selects IDs from blind sources and renders original passages without invented prose',async()=>{const queue=[{items:[{...selected,observation:'Invented cause'}]}];queue.calls=[];const out=await E.generate(fakeEngine(queue),rows,C,{thorough:false});assert.equal(out.findings.length,1);assert.equal(queue.calls.length,1);assert.ok(!JSON.stringify(queue.calls[0].messages).includes('ISS-'));assert.ok(!JSON.stringify(queue.calls[0].messages).includes('ground_truth'));assert.match(queue.calls[0].messages[0].content,/untrusted source data/);assert.ok(!JSON.stringify(out.findings).includes('Invented cause'));assert.match(out.findings[0].observation,/The source has not been confirmed/);assert.equal(out.findings[0].owner,null);});
test('coverage audit applies targeted edits and additions without rewriting unchanged items',async()=>{const addition={kind:'closeout',status:'open',facts:[sourceId('DR-A09','schedule_status','curing')],latest:[sourceId('DR-A09','schedule_status','curing')]};const queue=[{items:[selected]},{edits:[],additional:[addition]},{items:[]},{items:[]},{items:[]},{items:[]},{reviews:[{index:0,verdict:'supported',...selected},{index:1,verdict:'supported',...addition}]}];queue.calls=[];const out=await E.generate(fakeEngine(queue),rows,C,{thorough:true});assert.equal(queue.calls.length,7);assert.equal(out.findings.length,2);assert.deepEqual(out.items[0],selected);for(const call of queue.calls)assert.equal(JSON.parse(call.messages[1].content).reports.length,10);});
test('invalid pointers reject the result locally and retain diagnostics without a global rewrite',async()=>{const queue=[{items:[{...selected,latest:['S999999']}]}];queue.calls=[];await assert.rejects(()=>E.generate(fakeEngine(queue),rows,C,{thorough:false}),e=>/does not exist/.test(e.message)&&e.diagnostics.responses.length===1);assert.equal(queue.calls.length,1);});
test('truncated model selection fails rather than becoming a partial result',async()=>{const fake={resetChat:async()=>{},chat:{completions:{create:async()=>({choices:[{message:{content:'{"items":[]}'},finish_reason:'length'}]})}}};await assert.rejects(()=>E.generate(fake,rows,C),/output space/);});
test('empty control still receives coverage and remaining-task checks without forced findings',async()=>{const queue=[{items:[]},{edits:[],additional:[]},{items:[]},{items:[]},{items:[]},{items:[]}];queue.calls=[];const out=await E.generate(fakeEngine(queue),C.reports(data('reports-clean')),C,{thorough:true});assert.equal(queue.calls.length,6);assert.deepEqual(out.findings,[]);});
test('a later unrelated completion does not change selected factual text or overwrite its author',()=>{const out=E.render([selected],inventory.facts,rows,C);assert.match(out.findings[0].observation,/not been confirmed/);assert.ok(!out.findings[0].observation.includes('Concrete placement completed'));const changed=rows.map(r=>({...r,report_id:'X'+r.report_id,report_author:'Renamed '+r.report_author})),inv=E.inventory(changed),rendered=E.render([selected],inv.facts,changed,C);assert.ok(rendered.findings[0].evidence.every(e=>e.report_id.startsWith('X')));assert.equal(inv.facts[0].report_author,'Renamed '+rows[0].report_author);});

test('a compound reference can link several supported findings but cannot hide an unsupported part',()=>{const issues=[{issue_id:'1'}],findings=[{id:'F1'},{id:'F2'}],judgments={'1':{rating:'found',findingIds:['F1','F2']}};assert.equal(C.score(issues,judgments,findings,{F1:'supported',F2:'supported'}).recall,1);assert.equal(C.score(issues,judgments,findings,{F1:'supported',F2:'unsupported'}).complete,false);});
test('latest evidence cannot predate selected later context',()=>{const old=sourceId('DR-A01','issue_or_update','not been confirmed'),later=sourceId('DR-A09','schedule_status','curing');assert.throws(()=>E.validateItems([{...selected,facts:[later],latest:[old]}],inventory.facts),/predates/);});
test('identical evidence cannot silently retain contradictory model statuses',()=>{assert.throws(()=>E.render([selected,{...selected,status:'resolved'}],inventory.facts,rows,C),/conflicting/);});

function materialityQueue(items,reviews){const queue=[{items},{edits:[],additional:[]},{items:[]},{items:[]},{items:[]},{items:[]},{reviews}];queue.calls=[];return queue;}
const closeoutSelection={kind:'closeout',status:'open',facts:[sourceId('DR-A09','schedule_status','curing')],latest:[sourceId('DR-A09','schedule_status','curing')]};

test('materiality decisions must cover every candidate exactly once and preserve failure evidence',async()=>{
  for(const [reviews,message] of [
    [[{index:0,verdict:'supported',...selected}],/incomplete/],
    [[{index:0,verdict:'supported',...selected},{index:0,verdict:'supported',...closeoutSelection}],/Invalid materiality/],
    [[{index:0,verdict:'supported',...selected},{index:2,verdict:'supported',...closeoutSelection}],/Invalid materiality/]
  ]){
    const queue=materialityQueue([selected,closeoutSelection],reviews);
    await assert.rejects(()=>E.generate(fakeEngine(queue),rows,C,{thorough:true}),error=>{
      assert.match(error.message,message);
      assert.equal(error.diagnostics.responses.length,7);
      assert.match(error.diagnostics.responses.at(-1).stage,/Verifying relevance/);
      assert.deepEqual(JSON.parse(error.diagnostics.responses.at(-1).raw).reviews,reviews);
      assert.deepEqual(error.diagnostics.sourceInventory,inventory.facts);
      return true;
    });
    assert.equal(queue.calls.length,7);
  }
});

test('routine decisions discard their candidates without changing supported source passages',async()=>{
  const queue=materialityQueue([selected,closeoutSelection],[{index:0,verdict:'routine',...selected},{index:1,verdict:'supported',...closeoutSelection}]);
  const out=await E.generate(fakeEngine(queue),rows,C,{thorough:true});
  assert.equal(out.findings.length,1);
  assert.equal(out.findings[0].kind,'closeout');
  assert.deepEqual(out.items,[closeoutSelection]);
  assert.equal(out.materialityReviews.length,2);
  assert.equal(out.materialityReviews[0].verdict,'routine');
  for(const evidence of out.findings[0].evidence){assert.ok(rows.find(r=>r.report_id===evidence.report_id)[evidence.field].includes(evidence.quote));assert.ok(out.findings[0].observation.includes(evidence.quote));}
});

test('supported materiality decisions require complete and existing source pointers',async()=>{
  for(const altered of [{facts:null},{latest:[]},{facts:['S999999']}]){
    const queue=materialityQueue([selected],[{index:0,verdict:'supported',...selected,...altered}]);
    await assert.rejects(()=>E.generate(fakeEngine(queue),rows,C,{thorough:true}),error=>/does not exist/.test(error.message)&&error.diagnostics.responses.length===7);
  }
});

test('a final audit cannot introduce a nonexistent pointer or display its internal topic as fact',async()=>{
  const invalid=materialityQueue([selected],[{index:0,verdict:'supported',...selected,latest:['S999999']}]);
  await assert.rejects(()=>E.generate(fakeEngine(invalid),rows,C,{thorough:true}),error=>/does not exist/.test(error.message)&&error.diagnostics.responses.length===7);
  const internal='Untrusted invented cause that must never appear in displayed findings';
  const valid=materialityQueue([selected],[{index:0,verdict:'supported',...selected,topic:internal}]);
  const out=await E.generate(fakeEngine(valid),rows,C,{thorough:true});
  assert.ok(!JSON.stringify(out.findings).includes(internal));
  assert.equal(out.items[0].topic,internal);
  assert.ok(out.findings[0].evidence.every(e=>rows.find(r=>r.report_id===e.report_id)[e.field].includes(e.quote)));
});

test('the remaining-task scan can recover a sole explicit task after every prior pass returned empty',async()=>{
  const taskRows=C.reports([{report_id:'SOLE_TASK',report_date:'2026-08-03',work_completed:'Installation completed.',schedule_status:'Strength-test follow-up remains in progress.'}]);
  const taskFact=E.inventory(taskRows).facts.find(f=>f.field==='schedule_status');
  const task={kind:'closeout',status:'open',facts:[taskFact.id],latest:[taskFact.id]};
  const queue=[{items:[]},{edits:[],additional:[]},{items:[]},{items:[task]},{items:[]},{items:[]},{reviews:[{index:0,verdict:'supported',...task}]}];queue.calls=[];
  const out=await E.generate(fakeEngine(queue),taskRows,C,{thorough:true});
  assert.equal(queue.calls.length,7);
  assert.match(queue.calls[3].messages[0].content,/explicit end-of-record remaining/);
  assert.equal(out.findings.length,1);
  assert.equal(out.findings[0].status,'open');
  assert.equal(out.findings[0].evidence[0].quote,taskRows[0].schedule_status);
  assert.ok(!out.findings[0].observation.includes('Installation completed.'));
});

test('conflicting duplicate selections trigger one source-based adjudication without rewriting another concern',async()=>{
  const conflicting={...selected,status:'resolved'};
  const queue=[{items:[conflicting,closeoutSelection,selected]},{items:[selected]}];queue.calls=[];
  const out=await E.generate(fakeEngine(queue),rows,C,{thorough:false});
  assert.equal(queue.calls.length,2);
  assert.equal(out.findings.length,2);
  assert.equal(out.findings[0].status,'needs_verification');
  assert.deepEqual(out.items,[selected,closeoutSelection]);
  assert.deepEqual(out.duplicateReviews,[{indices:[0,2],replacement:selected}]);
  assert.equal(out.responses.length,2);
  assert.match(out.responses[1].stage,/Reconciling duplicate status/);
  assert.deepEqual(JSON.parse(out.responses[0].raw).items,[conflicting,closeoutSelection,selected]);
  const payload=JSON.parse(queue.calls[1].messages[1].content);
  assert.equal(payload.reports.length,rows.length);
  assert.deepEqual(payload.candidates,[conflicting,selected]);
  const format=JSON.parse(queue.calls[1].response_format.schema);
  assert.equal(format.properties.items.minItems,1);
  assert.equal(format.properties.items.maxItems,1);
  for(const finding of out.findings)for(const evidence of finding.evidence)assert.ok(rows.find(r=>r.report_id===evidence.report_id)[evidence.field].includes(evidence.quote));
});

test('identical duplicate interpretations collapse without spending another model request',async()=>{
  const queue=[{items:[selected,{...selected}]}];queue.calls=[];
  const out=await E.generate(fakeEngine(queue),rows,C,{thorough:false});
  assert.equal(queue.calls.length,1);
  assert.equal(out.findings.length,1);
  assert.deepEqual(out.duplicateReviews,[]);
});

test('invalid duplicate adjudication fails once and retains the disputed sources and raw response',async()=>{
  for(const [items,pattern] of [[[],/one concern/],[[selected,selected],/one concern/],[[{...selected,latest:['S999999']}],/does not exist/]]){
    const candidates=[{...selected,status:'resolved'},selected];
    const queue=[{items:candidates},{items}];queue.calls=[];
    await assert.rejects(()=>E.generate(fakeEngine(queue),rows,C,{thorough:false}),error=>{
      assert.match(error.message,pattern);
      assert.equal(error.diagnostics.responses.length,2);
      assert.match(error.diagnostics.responses.at(-1).stage,/Reconciling duplicate status/);
      assert.deepEqual(JSON.parse(error.diagnostics.responses[0].raw).items,candidates);
      assert.deepEqual(JSON.parse(error.diagnostics.responses[1].raw).items,items);
      assert.deepEqual(error.diagnostics.sourceInventory,inventory.facts);
      return true;
    });
    assert.equal(queue.calls.length,2);
  }
});

test('either independent chronology scan rejects nonexistent source pointers and retains diagnostics',async()=>{
  for(const scan of [0,1])for(const altered of [{facts:['S999999']},{latest:['S999999']}]){
    const invalid={...selected,...altered};
    const focused=scan===0?[{items:[invalid]}]:[{items:[]},{items:[invalid]}];
    const queue=[{items:[selected]},{edits:[],additional:[]},{items:[]},{items:[]},...focused];queue.calls=[];
    await assert.rejects(()=>E.generate(fakeEngine(queue),rows,C,{thorough:true}),error=>{
      assert.match(error.message,/does not exist/);
      assert.equal(error.diagnostics.responses.length,5+scan);
      assert.match(error.diagnostics.responses.at(-1).stage,scan===0?/Checking historical work/:/Checking opposing release/);
      assert.deepEqual(JSON.parse(error.diagnostics.responses.at(-1).raw).items,[invalid]);
      assert.deepEqual(error.diagnostics.sourceInventory,inventory.facts);
      return true;
    });
    assert.equal(queue.calls.length,5+scan);
  }
});

test('focused chronology retrieval sees sources without a draft and adds candidates without replacing prior concerns',async()=>{
  const history={kind:'progress',status:'historical',facts:[sourceId('DR-A05','schedule_status','Pour postponed')],latest:[sourceId('DR-A09','work_completed','Concrete placement completed')]};
  const queue=[{items:[selected,closeoutSelection]},{edits:[],additional:[]},{items:[]},{items:[]},{items:[history]},{items:[]},{reviews:[{index:0,verdict:'supported',...selected},{index:1,verdict:'supported',...closeoutSelection},{index:2,verdict:'supported',...history}]}];queue.calls=[];
  const out=await E.generate(fakeEngine(queue),rows,C,{thorough:true});
  assert.equal(queue.calls.length,7);
  assert.deepEqual(out.items,[selected,closeoutSelection,history]);
  assert.match(out.responses[4].stage,/Checking historical work/);
  assert.match(out.responses[5].stage,/Checking opposing release/);
  for(const call of queue.calls.slice(4,6)){
    const payload=JSON.parse(call.messages[1].content);
    assert.deepEqual(Object.keys(payload),['reports']);
    assert.deepEqual(payload.reports,inventory.reports);
    assert.ok(!JSON.stringify(payload).includes('expected_interpretation'));
    const format=JSON.parse(call.response_format.schema);
    assert.deepEqual(Object.keys(format.properties),['items']);
    assert.ok(!call.messages[0].content.includes('Return updates'));
  }
  const materiality=JSON.parse(queue.calls[6].messages[1].content);
  assert.deepEqual(materiality.all_candidates,[selected,closeoutSelection,history].map((item,index)=>({index,...item})));
  for(const finding of out.findings)for(const evidence of finding.evidence)assert.ok(rows.find(r=>r.report_id===evidence.report_id)[evidence.field].includes(evidence.quote));
});

test('supported materiality corrections preserve prior context and latest passages while correcting kind and status',async()=>{
  const earlier=sourceId('DR-A03','issue_or_update','Crew was told verbally'),missing=sourceId('DR-A03','issue_or_update','No written release'),passed=sourceId('DR-A04','work_completed','Inspection passed');
  const inspection=sourceId('DR-A07','work_completed','Inspection completed'),acceptance=sourceId('DR-A07','work_completed','Substrate accepted');
  const prior={kind:'release',status:'needs_verification',facts:[earlier,missing],latest:[passed]};
  const corrected={kind:'acceptance',status:'resolved',facts:[inspection],latest:[acceptance]};
  const queue=materialityQueue([prior],[{index:0,verdict:'supported',...corrected}]);
  const out=await E.generate(fakeEngine(queue),rows,C,{thorough:true});
  assert.deepEqual(out.items,[{...corrected,facts:[earlier,missing,passed,inspection]}]);
  assert.equal(out.findings[0].kind,'acceptance');
  assert.equal(out.findings[0].status,'resolved');
  assert.deepEqual(out.findings[0].latestFactIds,[acceptance]);
  for(const id of [earlier,missing,passed,inspection,acceptance])assert.ok(out.findings[0].observation.includes(inventory.facts.find(f=>f.id===id).quote));
  assert.deepEqual(out.materialityReviews[0].facts,[inspection]);
  assert.deepEqual(JSON.parse(out.responses[0].raw).items,[prior]);
});

test('preserved chronology accepts twenty context passages and four latest citations while enforcing the bounds',()=>{
  const facts=inventory.facts.slice(0,20).map(f=>f.id),latest=inventory.facts.slice(-4).map(f=>f.id),expanded={...selected,facts,latest};
  assert.deepEqual(E.validateItems([expanded],inventory.facts),[expanded]);
  const out=E.render([expanded],inventory.facts,rows,C);
  assert.equal(out.findings[0].evidence.length,24);
  assert.doesNotThrow(()=>C.validate(out,rows));
  assert.throws(()=>E.validateItems([{...expanded,facts:inventory.facts.slice(0,21).map(f=>f.id)}],inventory.facts),/does not exist/);
  assert.throws(()=>C.validate({findings:[{...out.findings[0],evidence:[...out.findings[0].evidence,out.findings[0].evidence[0]]}]},rows),/source evidence/);
});
