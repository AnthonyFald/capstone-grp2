/* Deterministic synthetic fixtures. No real project correspondence is used. */
const fs = require('node:fs');
const path = require('node:path');
const repair = [
  'Maya (general contractor): This is a fictional repair coordination meeting on June 3, 2024. We are discussing the water-damaged concrete flooring in the east corridor.',
  'Maya (general contractor): We decided to keep the east corridor closed until the moisture results have been reviewed.',
  'Luis (flooring subcontractor): I will photograph the damaged floor and mark the removal boundary by June 4, 2024 at 10:00 AM.',
  'Priya (testing technician): I will send the moisture test results by June 5, 2024 at 2:00 PM.',
  'Maya (general contractor): I will issue the revised access plan by June 4, 2024 at 3:00 PM.',
  'Alex (electrician): I will isolate the corridor power before any demolition begins.',
  'Luis (flooring subcontractor): Can we reuse the existing adhesive, or do we need a new product? This is still unresolved.',
  'Maya (general contractor): The adhesive choice is pending designer confirmation. Do not treat it as approved.',
  'Priya (testing technician): We agreed to wait for written moisture clearance before installing replacement flooring.',
  'Maya (general contractor): I will ask the designer to confirm the adhesive specification by June 6, 2024.',
  'Luis (flooring subcontractor): Who is responsible for hauling away the removed concrete? No owner has been assigned.',
  'Alex (electrician): There is no approved date for restarting installation.',
  'Maya (general contractor): Thanks, everyone. These notes still need human review.'
];
const followup = [
  'Maya (general contractor): This is a fictional follow-up meeting on June 6, 2024.',
  'Luis (flooring subcontractor): The damage photographs were completed yesterday.',
  'Priya (testing technician): The west room is dry, but the east corridor still needs another test.',
  'Maya (general contractor): We decided to keep installation on hold in the east corridor.',
  'Priya (testing technician): I will retest the east corridor by June 7, 2024 at 9:00 AM.',
  'Luis (flooring subcontractor): I will update the material quantities by June 7, 2024.',
  'Maya (general contractor): The earlier removal estimate is withdrawn. We have no approved replacement date.',
  'Luis (flooring subcontractor): Someone needs to confirm the waste pickup. The owner and deadline are not assigned.',
  'Alex (electrician): Could the isolation work start on Monday? That is a proposal, not a confirmed date.',
  'Maya (general contractor): I will ask the designer whether the revised adhesive is acceptable.',
  'Priya (testing technician): We agreed that verbal clearance is not enough; written moisture clearance is required.',
  'Luis (flooring subcontractor): Who will approve the additional disposal cost? This remains unresolved.',
  'Maya (general contractor): The safety briefing is complete. No further action is needed.'
];
const ref=(kind,line,text,owner=null,due=null)=>({kind,line,text,owner,due});
const scenarios={
  repair:{title:'Water damage · repair coordination',transcript:repair.join('\n'),reference:[
    ref('decision',2,'Keep the east corridor closed until moisture results are reviewed.'),
    ref('action',3,'Photograph damage and mark the removal boundary.','Luis','June 4, 2024 at 10:00 AM'),
    ref('action',4,'Send moisture test results.','Priya','June 5, 2024 at 2:00 PM'),
    ref('action',5,'Issue the revised access plan.','Maya','June 4, 2024 at 3:00 PM'),
    ref('action',6,'Isolate corridor power.','Alex','before any demolition begins'),
    ref('question',7,'Confirm whether the existing adhesive can be reused.'),
    ref('question',8,'Adhesive choice needs designer confirmation; it is not approved.'),
    ref('decision',9,'Obtain written moisture clearance before replacement flooring.'),
    ref('action',10,'Ask the designer to confirm the adhesive specification.','Maya','June 6, 2024'),
    ref('question',11,'Assign an owner for concrete waste hauling.'),
    ref('question',12,'Confirm an installation restart date.')
  ]},
  followup:{title:'Follow-up · changes & uncertainty',transcript:followup.join('\n'),reference:[
    ref('decision',4,'Keep east corridor installation on hold.'),
    ref('action',5,'Retest the east corridor.','Priya','June 7, 2024 at 9:00 AM'),
    ref('action',6,'Update material quantities.','Luis','June 7, 2024'),
    ref('question',7,'Set a replacement removal date; the earlier estimate was withdrawn.'),
    ref('question',8,'Assign an owner and deadline for waste pickup.'),
    ref('question',9,'Confirm isolation start date; Monday is only a proposal.'),
    ref('action',10,'Ask the designer about the revised adhesive.','Maya',null),
    ref('decision',11,'Require written rather than verbal moisture clearance.'),
    ref('question',12,'Identify the approver for additional disposal cost.')
  ]}
};
const root=path.resolve(__dirname,'..');
fs.mkdirSync(path.join(root,'data'),{recursive:true});
fs.writeFileSync(path.join(root,'data/scenarios.js'),'/* Generated by scripts/generate-data.cjs. Synthetic data. */\nglobalThis.DEMO_SCENARIOS = '+JSON.stringify(scenarios,null,2)+';\n');
fs.writeFileSync(path.join(root,'data/reference-notes.json'),JSON.stringify(scenarios,null,2)+'\n');
for(const [id,scenario] of Object.entries(scenarios)) fs.writeFileSync(path.join(root,'data',id+'.txt'),scenario.transcript+'\n');
console.log('Generated 2 synthetic transcripts and their reference checklists.');
