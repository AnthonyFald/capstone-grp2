'use strict';

// Separate unused transfer suite. Do not rebuild after its first inference.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const DIR=__dirname,VERSION='consolidation-transfer-1',stamp='2026-11-04T09:00:00Z';
const doc=(id,title,text,options={})=>({id,title,kind:'request',revision:'1',issuedAt:'2026-11-05',approval:'draft',current:true,text,...options});
const ref=(id,title,text,options={})=>doc(id,title,text,{kind:'reference',approval:'approved',...options});
const link=(documentId,quote)=>({jobId:'prior-intake',itemId:documentId+'-entry',documentId,quote,relationship:'origin'});
const task=(id,title,requirement,options={})=>({id,type:'task',title,requirement,location:'',discipline:'',revision:'1',parentId:null,status:'open',sources:[],answer:'',resolutionCitations:[],createdAt:stamp,updatedAt:stamp,...options});
const board=(tasks=[],documents=[],version=0)=>({version,tasks,documents});
const fact=(name,...patterns)=>({name,patterns});
const expected=(id,sourceDocumentId,actions,options={})=>({id,sourceDocumentId,actions:Array.isArray(actions)?actions:[actions],requiredFacts:[],requiredCitationDocumentIds:[],...options});
const cases=[];
const add=(id,documents,existing,items,options={})=>cases.push({input:{id,payload:{mode:'consolidation',documents,board:existing}},reference:{id,items,groupSets:[],differentTasks:[],...options}});

{
 const old=doc('TR1-OLD','P-312 test line-up','P3: P-312 isolation valve V-312 position for the hydrotest is not shown on P-301 revision D. Confirm the required position.',{issuedAt:'2026-11-03'});
 const g=task('GRP-P3-COMMISSION','Plant room P3 commissioning','Coordinate test setup, witnessing and completion records for the pumps in plant room P3.',{type:'group',location:'plant room P3'});
 const t=task('TASK-P312-VALVE','P-312 hydrotest valve position',old.text,{parentId:g.id,location:'plant room P3 / P-312 / V-312',sources:[link(old.id,old.text)]});
 add('TRANSFER-01',[
  doc('TR1-R1','P3 morning field query','P3 / P-312 / V-312 — open or shut for hydrotest? P-301 D. Test booked 07:00 November 6; need the line-up confirmed by 14:00 November 5.'),
  doc('TR1-R2','P-313 line-up','P3 / P-313 / V-313 — required valve position for hydrotest on P-302 D?'),
  doc('TR1-R3','P-312 witness','P3 / P-312: who is attending the hydrotest as witness, and what is their contact number?')
 ],board([g,t],[old],5),[
  expected('tr1-valve','TR1-R1','link_duplicate',{targetTaskId:t.id,requiredFacts:[fact('response deadline time','14:00','2[:.]?00\\s*p'),fact('response deadline date','November 5','5 November','2026-11-05','Nov[.]? 5'),fact('test appointment','07:00','7[:.]?00\\s*a')]}),
  expected('tr1-p313','TR1-R2','add_subtask',{targetTaskId:g.id,requiredFacts:[fact('pump identity','P-313'),fact('valve identity','V-313')]}),
  expected('tr1-witness','TR1-R3','add_subtask',{targetTaskId:g.id,requiredFacts:[fact('witness','witness'),fact('contact','contact','phone','number')]})
 ],{differentTasks:[['tr1-valve','tr1-p313'],['tr1-valve','tr1-witness']]});
}

{
 const old=ref('TR2-A2','Door D-14 approved access detail','Door D-14 at Laboratory L4: provide a 900 mm clear opening with hardware set H-12.',{revision:'2',issuedAt:'2026-10-27'});
 const t=task('TASK-D14-CLEARANCE','Laboratory L4 D-14 clear opening','Confirm the required clear opening for Laboratory L4 door D-14.',{location:'Laboratory L4 / D-14',status:'resolved',answer:'D-14 requires a 900 mm clear opening.',resolutionCitations:[{documentId:old.id,quote:old.text}]});
 add('TRANSFER-02',[
  doc('TR2-R1','D-14 opening after hardware change','L4 / D-14: schedule now says H-19. Does the 900 mm clear opening still apply?'),
  doc('TR2-R2','D-15 opening','L4 / D-15 with hardware H-19: required clear opening?'),
  doc('TR2-R3','Opening follow-up','Can somebody confirm the opening width?'),
  ref('TR2-A3','Approved laboratory door schedule','D-14, Laboratory L4: hardware set H-19 replaces H-12. Clear opening remains 900 mm. D-15, Laboratory L4: hardware set H-19; clear-opening dimension is awaiting the access consultant response.',{revision:'3',issuedAt:'2026-11-04'})
 ],board([t],[old],8),[
  expected('tr2-d14','TR2-R1','already_answered',{requiredCitationDocumentIds:['TR2-A3'],answerFacts:[fact('900 mm opening','900\\s*mm','900 millimet')]}),
  expected('tr2-d15','TR2-R2','create_task',{requiredFacts:[fact('D-15 identity','D-15'),fact('clear opening','clear.opening','clearance','opening')]}),
  expected('tr2-unknown','TR2-R3','needs_review',{requiredFacts:[fact('opening width','width','opening')]})
 ],{differentTasks:[['tr2-d14','tr2-d15']]});
}

{
 const old=doc('TR3-OLD','RH-2 overflow outlet','Roof RH-2: confirm the overflow scupper invert elevation.',{issuedAt:'2026-11-02'});
 const g=task('GRP-RH2','Roof RH-2 coordination','Coordinate RH-2 roof drainage, envelope interfaces and inspection records.',{type:'group',location:'Roof RH-2'});
 const t=task('TASK-RH2-SCUPPER','RH-2 overflow scupper invert',old.text,{parentId:g.id,location:'Roof RH-2',sources:[link(old.id,old.text)]});
 add('TRANSFER-03',[
  doc('TR3-R1','Roof RH-2 field email','RH-2: overflow scupper invert? We also need the curb-flashing termination detail at hatch H-9. Please get the signed roof flood-test sheet to the GC before 15:00 Friday.'),
  ref('TR3-REPORT','Approved RH-2 daily report','Roof RH-2 flood test completed on November 4, 2026. No leakage was observed.',{issuedAt:'2026-11-04'})
 ],board([g,t],[old],6),[
  expected('tr3-scupper','TR3-R1','link_duplicate',{sourceAnchor:'overflow scupper invert',targetTaskId:t.id,requiredFacts:[fact('scupper invert','scupper','invert')]}),
  expected('tr3-flashing','TR3-R1','add_subtask',{sourceAnchor:'curb-flashing termination',targetTaskId:g.id,requiredFacts:[fact('termination detail','termination','flashing'),fact('hatch identity','H-9')]}),
  expected('tr3-sheet','TR3-R1','add_subtask',{sourceAnchor:'signed roof flood-test sheet',targetTaskId:g.id,requiredFacts:[fact('signed record','signed'),fact('recipient','GC','general contractor'),fact('deadline time','15:00','3[:.]?00\\s*p'),fact('deadline day','Friday','November 6','6 November','2026-11-06')]})
 ],{differentTasks:[['tr3-scupper','tr3-flashing'],['tr3-flashing','tr3-sheet'],['tr3-scupper','tr3-sheet']]});
}

{
 const old=ref('TR4-DETAIL','Approved EC-2 rail installation detail','Cladding zone EC-2: rail screws at 300 mm centres.',{revision:'2',issuedAt:'2026-10-28'});
 const t=task('TASK-EC2-PITCH','EC-2 rail screw centres','Confirm the rail screw centres in cladding zone EC-2.',{location:'cladding zone EC-2',status:'resolved',answer:'EC-2 rail screws at 300 mm centres.',resolutionCitations:[{documentId:old.id,quote:old.text}]});
 add('TRANSFER-04',[
  doc('TR4-R1','EC-2 rail fixing','EC-2 rails: the signed response gives 250 centres; the installation pack has 300. Which do we follow?'),
  doc('TR4-R2','EC-3 rail screws','EC-3 rail screw centres?'),
  doc('TR4-R3','EC-3 field reminder','Need the EC-3 rail fastener pitch confirmed by 09:00 November 9 so the setting-out crew can proceed.'),
  ref('TR4-RESPONSE','Signed design response for EC-2','Cladding zone EC-2: rail screws at 250 mm centres. This response does not list any superseded document.',{revision:'1',issuedAt:'2026-11-05'})
 ],board([t],[old],10),[
  expected('tr4-ec2','TR4-R1','flag_conflict',{targetTaskId:t.id,requiredCitationDocumentIds:['TR4-DETAIL','TR4-RESPONSE'],requiredFacts:[fact('zone identity','EC-2'),fact('different dimensions','250'),fact('other dimension','300')]}),
  expected('tr4-ec3','TR4-R2',['create_task','add_subtask'],{requiredFacts:[fact('zone identity','EC-3'),fact('spacing','centres','centers','spacing','pitch')]}),
  expected('tr4-repeat','TR4-R3','link_duplicate',{duplicateOf:'tr4-ec3',requiredFacts:[fact('deadline time','09:00','9[:.]?00\\s*a'),fact('deadline date','November 9','9 November','2026-11-09','Nov[.]? 9'),fact('work impact','setting.out','crew')]})
 ],{differentTasks:[['tr4-ec2','tr4-ec3']]});
}

const write=(name,value)=>fs.writeFileSync(path.join(DIR,name),JSON.stringify(value,null,2)+'\n');
write('transfer.inputs.json',{version:VERSION,split:'transfer',synthetic:true,cases:cases.map(c=>c.input)});
write('transfer.references.json',{version:VERSION,split:'transfer',synthetic:true,independentHumanValidation:false,labelOrigin:'Separate assistant-authored transfer scenarios, frozen before first inference; fewer explicit relationship hints. No field or independent human validation.',cases:cases.map(c=>c.reference)});
const files=['transfer.inputs.json','transfer.references.json'];
write('transfer.freeze.json',{version:VERSION,frozenAt:new Date().toISOString(),synthetic:true,independentHumanValidation:false,counts:{transferCases:cases.length,transferRequirements:cases.reduce((n,c)=>n+c.reference.items.length,0)},sha256:Object.fromEntries(files.map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(DIR,name))).digest('hex')]))});
console.log(JSON.stringify({version:VERSION,cases:cases.length,requirements:cases.reduce((n,c)=>n+c.reference.items.length,0),originalFreezeModified:false}));
