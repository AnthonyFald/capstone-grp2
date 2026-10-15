const test=require('node:test'),assert=require('node:assert/strict'),core=require('../core.js');
test('text export preserves reviewed corrections, action details, uncertainty and source references',()=>{
  const result={mode:'ai',model:'Qwen',elapsedMs:1200,createdAt:'2026-10-13T00:00:00.000Z',items:[
    {kind:'decision',text:'Keep the corridor closed.',line:2,evidence:'Maya: We decided to close the corridor.',reviewed:true,flags:[]},
    {kind:'action',text:'Send the corrected moisture report.',owner:'José',due:'Friday at 2 PM',line:4,evidence:'José: I will send the report by Friday at 2 PM.',reviewed:false,flags:['Confirm the deadline.']},
    {kind:'question',text:'Who will remove the concrete?',line:5,evidence:'Luis: Who will remove the concrete?',reviewed:false,flags:[]}
  ]};
  const text=core.exportPlainText(result,'Repair coordination');
  assert.match(text,/DECISIONS\r\n-+\r\n/);assert.match(text,/ACTION ITEMS\r\n-+\r\n/);assert.match(text,/OPEN QUESTIONS\r\n-+\r\n/);
  assert.match(text,/Send the corrected moisture report/);assert.match(text,/Owner: José/);assert.match(text,/Deadline: Friday at 2 PM/);
  assert.match(text,/Reviewed against source: 1 of 3/);assert.match(text,/Review: Pending/);assert.match(text,/Confirm the deadline/);
  assert.match(text,/Transcript line 4:\r\n  José: I will send the report by Friday at 2 PM/);
  assert.equal(text.replaceAll('\r\n','').includes('\n'),false);
});
test('text export never invents missing fields or hides empty sections',()=>{
  const result={...core.extractBasic('I will send the report.'),elapsedMs:5};
  const text=core.exportPlainText(result,'Custom meeting');
  assert.match(text,/rules, not AI/);assert.match(text,/Owner: Not specified/);assert.match(text,/Deadline: Not specified/);
  assert.equal(text.split('None extracted. Check the transcript for omissions.').length-1,3);
});
test('export uses current items only and wraps long notes without losing words',()=>{
  const text='Review the east corridor repairs and confirm access with the subcontractor before starting demolition. '.repeat(4).trim();
  const result={mode:'rules',items:[{kind:'decision',text,line:1,evidence:'Maya: '+text,reviewed:true}],originalItems:[{text:'Removed candidate'}]};
  const output=core.exportPlainText(result,'Long meeting');
  assert.doesNotMatch(output,/Removed candidate/);
  assert.ok(output.split('\r\n').every(line=>line.length<=80));
  assert.ok(output.replace(/\s+/g,' ').includes(text));
});
