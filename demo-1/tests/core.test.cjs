const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../core.js');require('../data/scenarios.js');
test('both synthetic fixtures produce traceable rule-based output',()=>{for(const s of Object.values(DEMO_SCENARIOS)){const r=core.extractBasic(s.transcript);assert.equal(r.mode,'rules');assert.ok(r.items.length>5);for(const item of r.items)assert.equal(item.evidence,s.transcript.split('\n')[item.line-1]);}});
test('first-person actions preserve speaker and exact deadlines',()=>{const r=core.extractBasic('Priya (testing technician): I will send moisture results by June 5, 2024 at 2:00 PM.');assert.equal(r.items[0].owner,'Priya');assert.equal(r.items[0].due,'June 5, 2024 at 2:00 PM');});
test('unknown owners and missing dates stay unknown',()=>{const r=core.extractBasic('I will send the results.\nMaya: I will ask the designer.');assert.equal(r.items[0].owner,null);assert.equal(r.items[1].due,null);});
test('questions and tentative dates do not become confirmed actions',()=>{const r=core.extractBasic('Alex: Could we start Monday? It is a proposal, not a confirmed date.');assert.equal(r.items[0].kind,'question');assert.equal(r.items[0].due,null);});
test('completed work is not extracted as a new action',()=>{assert.equal(core.extractBasic('Luis: The photographs were completed yesterday.').items.length,0);});
test('invalid AI source lines are rejected and flagged in counts',()=>{const r=core.normalizeModelOutput({items:[{kind:'action',line:1,text:'Send report.',owner:'Maya',due:null},{kind:'decision',line:999,text:'Invented.'}]},'Maya: I will send the report.');assert.equal(r.items.length,1);assert.equal(r.rejected,1);assert.equal(r.items[0].evidence,'Maya: I will send the report.');});
test('AI malformed JSON and all fabricated citations fail clearly',()=>{assert.throws(()=>core.normalizeModelOutput('{bad','Maya: Hello'));assert.throws(()=>core.normalizeModelOutput({items:[{kind:'action',line:3,text:'Do it'}]},'Maya: Hello'));});
test('AI metadata absent from transcript receives review warnings',()=>{const r=core.normalizeModelOutput({items:[{kind:'action',line:1,text:'Send results.',owner:'Nobody',due:'July 10'}]},'Priya: I will send results.');assert.equal(r.items[0].flags.length,2);assert.equal(r.items[0].reviewed,false);});
test('comparison does not count one reference repeatedly',()=>{const ref=[{kind:'action',line:1}],items=[{kind:'action',line:1},{kind:'action',line:1},{kind:'question',line:2}];const c=core.compare(items,ref);assert.equal(c.found,1);assert.equal(c.unmatched.length,1);});
test('timing includes processing and requires real positive baseline',()=>{assert.equal(core.timing(0,10,2000),null);assert.equal(core.timing(100,20,5000).savings,75);assert.equal(core.timing(10,20,5000).savings,-150);});
test('exports disclose processing mode and incomplete review',()=>{const r={...core.extractBasic('Maya: I will write the access plan.'),elapsedMs:1};const text=core.exportMarkdown(r,'Test');assert.match(text,/rules, not AI/);assert.match(text,/- \[ \]/);assert.match(text,/Source line 1/);});
test('blank and oversized input are rejected',()=>{assert.throws(()=>core.validateTranscript(''));assert.throws(()=>core.validateTranscript('x'.repeat(24001)));});
test('source helpers fill explicit commitments but avoid multi-action ambiguity',()=>{const item={kind:'action',line:1,text:'Send plan.',owner:null,due:null};const one=core.normalizeModelOutput({items:[item]},'Maya: I will send the plan by Friday.').items[0];assert.equal(one.owner,'Maya');assert.equal(one.due,'Friday');assert.equal(one.flags.length,2);const mixed=core.normalizeModelOutput({items:[item]},'Maya: I will send the plan by Friday. Luis will photograph the floor by Tuesday.').items[0];assert.equal(mixed.owner,null);assert.equal(mixed.due,null);});
test('an inferred calendar suffix cannot erase a supported relative deadline',()=>{
  const text='Rae: I will send the access plan tomorrow afternoon.';
  const raw={format:'meeting-notes-v2',items:[{kind:'action',line:1,text:'Send the access plan.',owner:'Rae',due:'Tomorrow afternoon, May 23rd, 2024'}]};
  const item=core.normalizeModelOutput(raw,text).items[0];
  assert.equal(item.due,'Tomorrow afternoon');assert.match(item.flags[0],/calendar date removed/);
});
test('deadline article differences preserve the stated time without inferring a new date',()=>{
 const source='Rae: I will confirm the inspection by end of the day today.';
 const raw={format:'meeting-notes-v2',items:[{kind:'action',text:'Confirm the inspection.',line:1,owner:'Rae',due:'end of day today'}]};
 assert.equal(core.normalizeModelOutput(raw,source).items[0].due,'end of day today');
 raw.items[0].due='end of day tomorrow';assert.equal(core.normalizeModelOutput(raw,source).items[0].due,null);
});
function actionOwner(transcript,owner,line){
 return core.normalizeModelOutput({format:'meeting-notes-v2',items:[{kind:'action',text:'Send the plan.',line,owner,due:null}]},transcript).items[0];
}
test('attendee names and unique shortened speaker labels preserve the actual owner',()=>{
 const transcript='Rae Chen (Project Manager, North Construction)\nRae (GC): I will send the plan.';
 for(const owner of ['Rae','Rae Chen','Rae Chen (GC)']){
  const item=actionOwner(transcript,owner,2);assert.equal(item.owner,'Rae Chen');assert.deepEqual(item.flags,[]);
 }
});
test('full and short speaker labels resolve without inventing a surname',()=>{
 assert.equal(actionOwner('Rae Chen: Hello.\nRae: I will send the plan.','Rae Chen',2).owner,'Rae Chen');
 assert.equal(actionOwner('Rae: I will send the plan.','Rae Chen',1).owner,null);
});
test('ambiguous first names and substring matches do not authorize assignments',()=>{
 const transcript='Sam Chen (Architect)\nSam Ortiz (Engineer)\nSam: I will send the plan.';
 assert.equal(actionOwner(transcript,'Sam',3).owner,null);
 assert.equal(actionOwner(transcript,'Sam Chen',3).owner,null);
 assert.equal(actionOwner('Joanna: I will send the plan.','Anna',1).owner,null);
});
test('company assignments remain with the company rather than its manager',()=>{
 const transcript='Rae Chen (Project Manager, North Construction)\nNorth Construction will send the plan.';
 assert.equal(actionOwner(transcript,'North Construction',2).owner,'North Construction');
 assert.equal(actionOwner(transcript,'Rae Chen',2).owner,null);
});
test('identities elsewhere in the meeting cannot supply unrelated cited ownership',()=>{
 const transcript='Rae Chen (Architect)\nBo Patel (Engineer)\nBo: I will send the plan.';
 assert.equal(actionOwner(transcript,'Rae Chen',3).owner,null);
 assert.equal(actionOwner(transcript,'Bo Patel',3).owner,'Bo Patel');
});
test('canonical names do not bypass the check for an invented self-recipient',()=>{
 const transcript='Rae Chen (Architect)\nRae: I will email you the plan.';
 for(const recipient of ['Rae','Rae Chen']){
  const raw={format:'meeting-notes-v2',items:[{kind:'action',text:'Email '+recipient+' the plan.',line:2,owner:'Rae Chen',due:null}]};
  const item=core.normalizeModelOutput(raw,transcript).items[0];assert.equal(item.text,'Email the plan.');assert.equal(item.owner,'Rae Chen');
 }
});
