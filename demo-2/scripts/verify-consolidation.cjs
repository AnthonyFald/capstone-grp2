// Mechanical provenance audit only. This does not score relevance, scope, status truth or accuracy.
// Usage: node demo-2/scripts/verify-consolidation.cjs [--paths] RUN.json ... [--out AUDIT.json]
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const C=require('../core.js'),E=require('../engine.js'),D=require('../docs/input-history/engine-v18d-frozen.js');
const VERSION='consolidation-audit-11';
const ANNOTATIONS=['report_completeness','ground_truth_issue_ids','ground_truth_notes'];
const REMOVAL_REASONS=new Set(['routine_completed_work','no_material_concern']);
const list=value=>Array.isArray(value)?value:[];
const ids=item=>[...new Set([...list(item?.facts),...list(item?.latest)])];
const equalSets=(a,b)=>a.length===b.length&&a.every(value=>b.includes(value));
const sourceKey=value=>JSON.stringify([value?.report_id,value?.field,value?.quote]);
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const sameObject=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));

function auditRun(run,{file=null,index=0}={}){
  const promptVersion=run?.promptVersion||run?.diagnostics?.promptVersion||null;
  const requiresBasis=/daily-review-18[c-z]/.test(promptVersion||''),requiresSubjects=/daily-review-18[d-z]/.test(promptVersion||''),labels=/daily-review-18[e-z]/.test(promptVersion||'');
  const scopeNormalization=/daily-review-18[f-z]/.test(promptVersion||'');
  const obligationCoverage=/daily-review-18[g-z]/.test(promptVersion||'');
  const typedObligationCritic=/daily-review-18[h-z]/.test(promptVersion||'');
  const boundedAssignmentRepair=/daily-review-18[i-z]/.test(promptVersion||'');
  const smallObligationCritic=/daily-review-18[j-z]/.test(promptVersion||'');
  const fullAssignmentRepair=/daily-review-18[j-z]/.test(promptVersion||'');
  const boundedAdditionRepair=/daily-review-18[k-z]/.test(promptVersion||'');
  const novelSourceAttachments=/daily-review-18[m-z]/.test(promptVersion||'');
  const finalProductGate=/daily-review-18[n-z]/.test(promptVersion||'');
  const productReview=finalProductGate?run?.sourceObligationAudit?.finalProductReview:null;
  const savedCandidateOnly=['saved-candidate-consolidation-only','staged-saved-candidate-consolidation'].includes(run?.method);
  const algorithm=labels?E:D,subjectKey=labels?'label':'text',subjectProperty=labels?'subjectLabel':'subjectText';
  const errors=[],counts={reports:0,sourcePassages:0,findings:0,originalFindings:0,renderedEvidenceQuotes:0,originalEvidenceQuotes:0,evidenceQuoteChecks:0,concerns:0,consolidationStages:0,assignmentRepairCalls:0,repairedAssignmentLinks:0,rawScopeResponsesVerified:0,pointerNormalizations:0,partitionCandidates:0,partitionGroups:0,preservedMemberPassages:0,finalPreservedCandidatePassages:0,materialityReviews:0,materialityReconsiderations:0,restoredCandidates:0,confirmedRoutineCandidates:0,explicitRemovals:0,removedCandidates:0,obligationSources:0,obligationComponents:0,obligationRepresentedComponents:0,obligationAddedComponents:0,obligationClosedComponents:0,obligationCompletedComponents:0,obligationRoutineComponents:0,coverageAddedCandidates:0,rawInitialObligationResponsesVerified:0,rawObligationResponsesVerified:0,obligationLedgerCorrections:0,obligationAdditionRepairs:0,removedOrphanAdditions:0,rawAdditionRepairResponsesVerified:0,attachmentCases:0,attachmentDecisions:0,rawAttachmentResponsesVerified:0,preservedEarlierConcerns:0,txtQuotedPassages:0,txtCharacters:0};
  const meta={file,index,runId:run?.runId||null,pipeline:run?.pipeline||null,promptVersion,method:run?.method||null,timingMode:run?.timingMode||null,freshInferenceCalls:Number.isFinite(run?.freshInferenceCalls)?run.freshInferenceCalls:null,subjectGrounding:requiresSubjects?(labels?'AI grouping label with source pointer and typed role':'Exact source phrase with source pointer and typed role'):null,datasetId:run?.evaluationDatasetId||run?.datasetId||null,inputSha256:run?.inputSha256||null};
  const fail=(code,at,details={})=>errors.push({code,at,...details});
  if(run?.status==='failed')return {...meta,status:'skipped_failed_inference',ok:null,counts,errors:[]};
  if(!run||!/^daily-reports-v18(?:\b|[a-z])/.test(run.pipeline||''))fail('UNSUPPORTED_PIPELINE','pipeline');
  let rows=[];
  try{rows=C.reports(run?.reports);}catch{fail('INVALID_SOURCE_REPORTS','reports');}
  counts.reports=rows.length;
  for(const [i,row] of list(run?.reports).entries()){
    if(Object.keys(row).some(key=>!C.FIELDS.includes(key)))fail('NON_SOURCE_INPUT_COLUMN','reports['+i+']');
    if(ANNOTATIONS.some(key=>Object.hasOwn(row,key)))fail('ANSWER_ANNOTATION_IN_INPUT','reports['+i+']');
  }
  const byReport=new Map(rows.map(row=>[row.report_id,row]));
  if(run?.inputSha256&&rows.length&&sha(JSON.stringify(rows))!==run.inputSha256)fail('INPUT_HASH_MISMATCH','inputSha256');
  const inventory=list(run?.sourceInventory),byId=new Map();counts.sourcePassages=inventory.length;
  const checkSource=(passage,at,{date=false,author=false}={})=>{
    const report=byReport.get(passage?.report_id);
    if(!report||!C.FIELDS.includes(passage?.field)||typeof passage?.quote!=='string'||!passage.quote.trim()||!report[passage.field]?.includes(passage.quote))fail('SOURCE_QUOTE_MISMATCH',at);
    if(date&&report&&passage.report_date!==report.report_date)fail('SOURCE_DATE_MISMATCH',at);
    if(author&&report&&passage.report_author!==report.report_author)fail('SOURCE_AUTHOR_MISMATCH',at);
    return report;
  };
  for(const [i,passage] of inventory.entries()){
    if(!passage?.id||byId.has(passage.id))fail('DUPLICATE_OR_MISSING_SOURCE_ID','sourceInventory['+i+']');
    else byId.set(passage.id,passage);
    checkSource(passage,'sourceInventory['+i+']',{date:true,author:true});
  }
  if(rows.length&&!inventory.length)fail('MISSING_SOURCE_INVENTORY','sourceInventory');
  const checkIds=(selected,at)=>{
    if(!Array.isArray(selected))return fail('INVALID_SOURCE_ID_LIST',at);
    for(const id of selected)if(!byId.has(id))fail('UNKNOWN_SOURCE_ID',at,{sourceId:id});
  };
  const checkSubject=(subject,at,selected,aspect,{draft=false}={})=>{
    const value=subject?.[subjectKey];
    if(typeof value!=='string'||value.trim().length<2||value.length>120||/[\r\n<>]/.test(value)||!selected.includes(subject?.sourceId)||!byId.has(subject?.sourceId)||(labels?false:!byId.get(subject?.sourceId)?.quote.includes(value)))fail(labels?'INVALID_SUBJECT_LABEL_OR_SOURCE':'SUBJECT_NOT_EXACT_MEMBER_PHRASE',at);
    if(draft?!Object.values(algorithm.ASPECTS).some(spec=>spec.subjectRole===subject?.role):subject?.role!==algorithm.ASPECTS[aspect]?.subjectRole)fail('SUBJECT_ROLE_MISMATCH',at);
  };
  const checkAssignment=(assignment,candidate,candidates,assignments,index,at,{draft=false,allowCrossAspectLink=false}={})=>{
    const other=assignment?.same_as;
    if(!algorithm.ASPECTS[assignment?.aspect]||!Number.isInteger(other)||other<0||other>=candidates.length)fail('INVALID_ASPECT_LINK',at);
    else if(!draft&&!allowCrossAspectLink&&assignment.aspect!==assignments[other]?.aspect)fail('CROSS_ASPECT_LINK',at);
    if(boundedAdditionRepair&&!draft&&Number.isInteger(other)&&other>=0&&other<candidates.length&&(list(candidate.independentOfConcernIds).includes(candidates[other]?.concernId)||list(candidates[other]?.independentOfConcernIds).includes(candidate.concernId)))fail('INDEPENDENT_CONCERN_LINK_FORBIDDEN',at);
    if(!draft&&candidate.concernAspect&&candidate.concernAspect!==assignment?.aspect)fail('FIXED_ASPECT_CHANGED',at);
    // Earlier 18b outputs lack aspect grounding; 18c adds it and 18d also grounds subjects.
    if(requiresBasis&&(!Object.hasOwn(assignment||{},'basisSourceId')||!Object.hasOwn(assignment||{},'basisRole')))fail('MISSING_ASPECT_GROUNDING',at);
    if(Object.hasOwn(assignment||{},'basisSourceId')&&!ids(candidate).includes(assignment.basisSourceId))fail('ASPECT_BASIS_OUTSIDE_MEMBER',at);
    if(Object.hasOwn(assignment||{},'basisRole')&&(draft?!Object.values(algorithm.ASPECTS).some(spec=>spec.basisRole===assignment.basisRole):assignment.basisRole!==algorithm.ASPECTS[assignment.aspect]?.basisRole))fail('ASPECT_BASIS_ROLE_MISMATCH',at);
    if(requiresSubjects&&['subjectSourceId',subjectProperty,'subjectRole'].some(key=>!Object.hasOwn(assignment||{},key)))fail('MISSING_SUBJECT_GROUNDING',at);
    if(requiresSubjects||Object.hasOwn(assignment||{},'subjectSourceId'))checkSubject({sourceId:assignment?.subjectSourceId,[subjectKey]:assignment?.[subjectProperty],role:assignment?.subjectRole},at,ids(candidate),assignment?.aspect,{draft});
  };
  const priorAnchors=new Map();
  const checkConcern=(item,at)=>{
    const selected=ids(item);checkIds(item?.facts,at+'.facts');checkIds(item?.latest,at+'.latest');
    if(!selected.length||!list(item?.latest).length)fail('EMPTY_CONCERN_EVIDENCE',at);
    const dates=selected.map(id=>byId.get(id)?.report_date).filter(Boolean).sort(),latest=list(item?.latest).map(id=>byId.get(id)?.report_date);
    if(dates.length&&!latest.includes(dates.at(-1)))fail('LATEST_PREDATES_RETAINED_CONTEXT',at);
    if(!item?.concernId||!item?.sourceAnchor)fail('MISSING_CONCERN_IDENTITY',at);
    else{
      const report=checkSource(item.sourceAnchor,at+'.sourceAnchor',{date:true});
      if(report&&item.sourceAnchor.work_area!==report.work_area)fail('ANCHOR_AREA_MISMATCH',at+'.sourceAnchor');
      if(algorithm.stableConcernId(item.concernAspect||item.kind,item.sourceAnchor)!==item.concernId)fail('UNSTABLE_CONCERN_ID',at);
    }
    if(!item?.concernAspect||!algorithm.ASPECTS[item.concernAspect])fail('INVALID_CONCERN_ASPECT',at);
    if(requiresSubjects){
      const subjects=list(item?.subjectEvidence);
      if(!subjects.length)fail('MISSING_CONCERN_SUBJECT_EVIDENCE',at);
      for(const [i,subject] of subjects.entries())checkSubject(subject,at+'.subjectEvidence['+i+']',selected,item.concernAspect);
      const anchorSubject=item?.sourceAnchor?.[subjectProperty];
      if(typeof anchorSubject!=='string'||anchorSubject.trim().length<2||anchorSubject.length>120||/[\r\n<>]/.test(anchorSubject)||(!labels&&!item.sourceAnchor.quote?.includes(anchorSubject))||item?.[subjectProperty]!==anchorSubject||item.subjectRole!==algorithm.ASPECTS[item.concernAspect]?.subjectRole)fail('INVALID_CONCERN_SUBJECT_ANCHOR',at);
      if(!subjects.some(subject=>{const source=byId.get(subject.sourceId);return subject[subjectKey]===anchorSubject&&sourceKey(source)===sourceKey(item?.sourceAnchor);})&&!(obligationCoverage&&sameObject(priorAnchors.get(item.concernId),item.sourceAnchor)))fail('SUBJECT_ANCHOR_OUTSIDE_GROUNDED_SUBJECTS',at);
    }
  };
  const uniqueConcerns=(items,at)=>{
    const seen=new Set();for(const [i,item] of items.entries()){checkConcern(item,at+'['+i+']');if(seen.has(item.concernId))fail('DUPLICATE_CONCERN_ID',at+'['+i+']');seen.add(item.concernId);if(!priorAnchors.has(item.concernId))priorAnchors.set(item.concernId,structuredClone(item.sourceAnchor));}
  };
  const history=list(run?.consolidationHistory),normalizationTrace=[],repairStages=new Set();counts.consolidationStages=history.length;
  for(const [stageIndex,entry] of history.entries()){
    const at='consolidationHistory['+stageIndex+']',candidates=list(entry.inputCandidates),partition=list(entry.partition),concerns=list(entry.concerns),coverage=Array(candidates.length).fill(0);
    counts.partitionCandidates+=candidates.length;counts.partitionGroups+=partition.length;
    if(!Array.isArray(entry.inputCandidates)||!Array.isArray(entry.partition)||!Array.isArray(entry.concerns))fail('INCOMPLETE_CONSOLIDATION_HISTORY',at);
    uniqueConcerns(concerns,at+'.concerns');
    const maps=list(entry.candidateToConcern),mapping=new Map();
    for(const m of maps){if(!Number.isInteger(m?.index)||m.index<0||m.index>=candidates.length||mapping.has(m.index))fail('INVALID_CANDIDATE_MAP',at+'.candidateToConcern');else mapping.set(m.index,m.concernId);}
    if(mapping.size!==candidates.length)fail('INCOMPLETE_CANDIDATE_MAP',at+'.candidateToConcern');
    const assignments=entry.assignments||{},assignmentKeys=Object.keys(assignments);
    if(assignmentKeys.length!==candidates.length||candidates.some((_,i)=>!Object.hasOwn(assignments,String(i))))fail('INCOMPLETE_ASPECT_ASSIGNMENTS',at+'.assignments');
    for(const [candidateIndex,candidate] of candidates.entries()){
      checkIds(ids(candidate),at+'.inputCandidates['+candidateIndex+']');
      checkAssignment(assignments[candidateIndex],candidate,candidates,assignments,candidateIndex,at+'.assignments['+candidateIndex+']');
    }
    if(requiresSubjects||entry.initialAssignments){
      const initial=entry.initialAssignments||{};
      if(Array.isArray(initial)||Object.keys(initial).length!==candidates.length||candidates.some((_,i)=>!Object.hasOwn(initial,String(i))))fail('INCOMPLETE_INITIAL_ASSIGNMENTS',at+'.initialAssignments');
      for(const [i,candidate] of candidates.entries())checkAssignment(initial[i],candidate,candidates,initial,i,at+'.initialAssignments['+i+']',{draft:labels});
      const changes=candidates.flatMap((_,index)=>JSON.stringify(initial[index])===JSON.stringify(assignments[index])?[]:[{index,prior:initial[index],corrected:assignments[index]}]);
      if(!sameObject(entry.boundaryChanges,changes))fail('BOUNDARY_CORRECTION_TRACE_CHANGED',at+'.boundaryChanges');
    }
    if(boundedAssignmentRepair){
      const repair=entry.assignmentRepair,hasRepair=Object.hasOwn(entry,'assignmentRepair')||Object.hasOwn(entry,'boundaryAssignments'),boundary=hasRepair?entry.boundaryAssignments:assignments;
      const critic=list(run?.responses).filter(response=>response.stage===entry.stage+' · independently audit concern boundaries');
      if(critic.length!==1)fail('RAW_BOUNDARY_RESPONSE_MISSING_OR_AMBIGUOUS',at);
      else try{
        const text=critic[0].raw,answer=text.includes('</think>')?text.slice(text.lastIndexOf('</think>')+8):text,parsed=JSON.parse(answer.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));
        if(!sameObject(parsed.assignments,boundary))fail('RAW_BOUNDARY_ASSIGNMENT_TRACE_CHANGED',at);
      }catch{fail('RAW_BOUNDARY_RESPONSE_INVALID_JSON',at);}
      if(hasRepair){
        const repairAt=at+'.assignmentRepair',stage=entry.stage+(fullAssignmentRepair?' · repair invalid concern assignments':' · repair invalid cross-aspect links');repairStages.add(stage);counts.assignmentRepairCalls++;
        if(!repair||!boundary||Array.isArray(boundary)||Object.keys(boundary).length!==candidates.length||candidates.some((_,i)=>!Object.hasOwn(boundary,String(i))))fail('INCOMPLETE_ASSIGNMENT_REPAIR_INPUT',repairAt);
        for(const [i,candidate] of candidates.entries())checkAssignment(boundary?.[i],candidate,candidates,boundary||{},i,repairAt+'.inputAssignments['+i+']',{allowCrossAspectLink:true});
        const violations=candidates.flatMap((_,candidateIndex)=>{const assignment=boundary?.[candidateIndex],target=boundary?.[assignment?.same_as];return assignment&&target&&assignment.aspect!==target.aspect?[{candidateIndex,targetIndex:assignment.same_as,aspect:assignment.aspect,targetAspect:target.aspect}]:[];}),offending=new Set(violations.map(value=>value.candidateIndex));
        if(!violations.length||repair?.stage!==stage||repair?.reason!==(fullAssignmentRepair?'cross_aspect_assignment':'cross_aspect_same_as')||!sameObject(repair?.error,{code:'CROSS_ASPECT_ASSIGNMENT',message:'Different concern aspects cannot be merged.'})||!sameObject(repair?.violations,violations))fail('INVALID_ASSIGNMENT_REPAIR_TRIGGER',repairAt);
        if(!sameObject(repair?.inputAssignments,boundary)||!sameObject(repair?.assignments,assignments))fail('ASSIGNMENT_REPAIR_MAP_TRACE_CHANGED',repairAt);
        const changed=[];let rawExpected;
        if(fullAssignmentRepair){
          const reviews=repair?.assignmentReviews||{},keys=Object.keys(reviews),fields=Object.keys(algorithm.consolidationSchema(candidates).properties.assignments.properties['0'].properties),changedFields=[];
          if(Object.hasOwn(repair||{},'linkReviews')||Array.isArray(reviews)||keys.length!==candidates.length||candidates.some((_,i)=>!Object.hasOwn(reviews,String(i))))fail('INCOMPLETE_ASSIGNMENT_REPAIR_REVIEWS',repairAt+'.assignmentReviews');
          for(const [i] of candidates.entries()){
            const prior=boundary?.[i],review=reviews[i];
            if(!review||Array.isArray(review)||Object.keys(review).length!==fields.length||fields.some(field=>!Object.hasOwn(review,field)))fail('INVALID_ASSIGNMENT_REPAIR_FIELDS',repairAt+'.assignmentReviews['+i+']');
            if(!offending.has(i)&&!sameObject(review,prior))fail('ASSIGNMENT_REPAIR_CHANGED_VALID_CANDIDATE',repairAt+'.assignmentReviews['+i+']');
            if(!sameObject(review,assignments[i]))fail('ASSIGNMENT_REPAIR_MAP_TRACE_CHANGED',repairAt+'.assignmentReviews['+i+']');
            const fieldsChanged=Object.keys(assignments[i]||{}).filter(field=>assignments[i][field]!==prior?.[field]);
            if(fieldsChanged.length)changedFields.push({candidateIndex:i,fields:fieldsChanged,before:prior,after:assignments[i]});
            if(prior&&prior.same_as!==assignments[i]?.same_as)changed.push({candidateIndex:i,before:prior.same_as,after:assignments[i]?.same_as});
          }
          if(!sameObject(repair?.changedFields,changedFields))fail('ASSIGNMENT_REPAIR_FIELD_TRACE_CHANGED',repairAt+'.changedFields');
          rawExpected={assignments:reviews};
        }else{
          const links=repair?.linkReviews||{},keys=Object.keys(links);
          if(Object.hasOwn(repair||{},'assignmentReviews')||Object.hasOwn(repair||{},'changedFields')||Array.isArray(links)||keys.length!==candidates.length||candidates.some((_,i)=>!Object.hasOwn(links,String(i))))fail('INCOMPLETE_ASSIGNMENT_REPAIR_LINKS',repairAt+'.linkReviews');
          for(const [i] of candidates.entries()){
            const prior=boundary?.[i],link=links[i],selected=link?.same_as;
            if(!link||Object.keys(link).length!==1||!Object.hasOwn(link,'same_as')||!Number.isInteger(selected)||selected<0||selected>=candidates.length)fail('INVALID_ASSIGNMENT_REPAIR_LINK',repairAt+'.linkReviews['+i+']');
            if(!offending.has(i)&&selected!==prior?.same_as)fail('ASSIGNMENT_REPAIR_CHANGED_VALID_LINK',repairAt+'.linkReviews['+i+']');
            if(offending.has(i)&&boundary?.[selected]?.aspect!==prior?.aspect)fail('ASSIGNMENT_REPAIR_CROSSES_ASPECT',repairAt+'.linkReviews['+i+']');
            if(!sameObject(assignments[i],{...prior,same_as:selected}))fail('ASSIGNMENT_REPAIR_CHANGED_FIXED_FIELDS',repairAt+'.assignments['+i+']');
            if(prior&&prior.same_as!==selected)changed.push({candidateIndex:i,before:prior.same_as,after:selected});
          }
          rawExpected={links};
        }
        counts.repairedAssignmentLinks+=changed.length;
        if(!sameObject(repair?.changedLinks,changed))fail('ASSIGNMENT_REPAIR_CHANGE_TRACE_CHANGED',repairAt+'.changedLinks');
        const responses=list(run?.responses).filter(response=>response.stage===stage);
        if(responses.length!==1)fail('ASSIGNMENT_REPAIR_NOT_BOUNDED_TO_ONE_RESPONSE',repairAt);
        else try{
          const text=responses[0].raw,answer=text.includes('</think>')?text.slice(text.lastIndexOf('</think>')+8):text,parsed=JSON.parse(answer.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));
          if(!sameObject(parsed,rawExpected))fail('RAW_ASSIGNMENT_REPAIR_RESPONSE_CHANGED',repairAt);
        }catch{fail('RAW_ASSIGNMENT_REPAIR_RESPONSE_INVALID_JSON',repairAt);}
      }else if(list(run?.responses).some(response=>response.stage===entry.stage+' · repair invalid cross-aspect links'||response.stage===entry.stage+' · repair invalid concern assignments'))fail('UNTRACED_ASSIGNMENT_REPAIR_RESPONSE',at);
    }else if(entry.assignmentRepair||entry.boundaryAssignments)fail('UNSUPPORTED_ASSIGNMENT_REPAIR_VERSION',at);
    if(partition.length!==concerns.length)fail('PARTITION_CONCERN_COUNT_MISMATCH',at);
    if(scopeNormalization){
      const raw=entry.scopeReviews,normalized=entry.normalizedScopeReviews,traces=list(entry.pointerNormalizations),groupIds=partition.map(group=>'G'+Math.min(...list(group.members)));
      if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).length!==groupIds.length||groupIds.some(id=>!Object.hasOwn(raw,id)))fail('INCOMPLETE_RAW_SCOPE_REVIEWS',at+'.scopeReviews');
      if(!normalized||typeof normalized!=='object'||Array.isArray(normalized)||Object.keys(normalized).length!==groupIds.length||groupIds.some(id=>!Object.hasOwn(normalized,id)))fail('INCOMPLETE_NORMALIZED_SCOPE_REVIEWS',at+'.normalizedScopeReviews');
      if(!Array.isArray(entry.pointerNormalizations))fail('MISSING_POINTER_NORMALIZATION_RECORD',at+'.pointerNormalizations');
      for(const [i,trace] of traces.entries()){
        if(!groupIds.includes(trace.groupId)||trace.field!=='latest'||trace.reason!=='duplicate_source_pointer')fail('INVALID_POINTER_NORMALIZATION_TRACE',at+'.pointerNormalizations['+i+']');
        normalizationTrace.push({stage:entry.stage,...trace});counts.pointerNormalizations++;
      }
      for(const [i,group] of partition.entries()){
        const groupId=groupIds[i],groupAt=at+'.scopeReviews.'+groupId,original=raw?.[groupId],result=normalized?.[groupId],latest=original?.latest;
        if(!Array.isArray(latest)||!latest.length||latest.length>4||latest.some(id=>typeof id!=='string')){fail('INVALID_RAW_SCOPE_POINTERS',groupAt);continue;}
        const deduplicated=[...new Set(latest)],allowed=new Set(list(group.members).flatMap(member=>ids(candidates[member]))),matching=traces.filter(trace=>trace.groupId===groupId&&trace.field==='latest');
        checkIds(latest,groupAt+'.latest');
        for(const id of latest)if(!allowed.has(id))fail('SCOPE_POINTER_OUTSIDE_GROUP',groupAt,{sourceId:id});
        if(!sameObject(result,{...original,latest:deduplicated}))fail('NORMALIZED_SCOPE_CHANGED_MORE_THAN_REPEATS',at+'.normalizedScopeReviews.'+groupId);
        if(!sameObject(result?.latest,group.latest)||result?.topic!==group.topic||result?.status!==group.status)fail('NORMALIZED_SCOPE_PARTITION_DISAGREEMENT',at+'.partition['+i+']');
        if(deduplicated.length<latest.length){
          if(matching.length!==1)fail('MISSING_OR_REPEATED_POINTER_NORMALIZATION_TRACE',groupAt);
          else{
            if(!sameObject(matching[0].original,latest))fail('NORMALIZATION_ORIGINAL_MISMATCH',groupAt);
            if(!sameObject(matching[0].normalized,deduplicated))fail('NORMALIZATION_REMOVED_MORE_THAN_EXACT_REPEATS',groupAt);
          }
        }else if(matching.length)fail('NORMALIZATION_WITHOUT_DUPLICATE_POINTER',groupAt);
      }
      const responses=list(run?.responses).filter(response=>response.stage===entry.stage+' · verify each concern state');
      if(responses.length!==1)fail('RAW_SCOPE_RESPONSE_MISSING_OR_AMBIGUOUS',at);
      else{
        try{
          const rawText=responses[0].raw,answer=rawText.includes('</think>')?rawText.slice(rawText.lastIndexOf('</think>')+8):rawText;
          const parsed=JSON.parse(answer.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));
          if(!sameObject(parsed.reviews,raw))fail('RAW_SCOPE_HISTORY_CHANGED',at+'.scopeReviews');else counts.rawScopeResponsesVerified++;
        }catch{fail('RAW_SCOPE_RESPONSE_INVALID_JSON',at);}
      }
    }else for(const review of Object.values(entry.scopeReviews||{}))if(Array.isArray(review?.latest)&&new Set(review.latest).size!==review.latest.length)fail('UNTRACED_DUPLICATE_SCOPE_POINTER',at+'.scopeReviews');
    const assignedConcernIds=new Set();
    for(const [groupIndex,group] of partition.entries()){
      const groupAt=at+'.partition['+groupIndex+']',members=list(group.members);
      if(!members.length)fail('EMPTY_PARTITION_GROUP',groupAt);
      for(const member of members)if(!Number.isInteger(member)||member<0||member>=candidates.length)fail('INVALID_PARTITION_MEMBER',groupAt);else coverage[member]++;
      const validMembers=members.filter(member=>Number.isInteger(member)&&member>=0&&member<candidates.length),assignedIds=[...new Set(validMembers.map(member=>mapping.get(member)))];
      if(assignedIds.length!==1||!assignedIds[0])fail('GROUP_MEMBER_MAP_DISAGREEMENT',groupAt);
      const concern=concerns.find(item=>item.concernId===assignedIds[0]);
      if(!concern){fail('MISSING_GROUP_CONCERN',groupAt);continue;}
      if(assignedConcernIds.has(concern.concernId))fail('CONCERN_ASSIGNED_MULTIPLE_GROUPS',groupAt);assignedConcernIds.add(concern.concernId);
      const expected=[...new Set(validMembers.flatMap(member=>ids(candidates[member])))],actual=ids(concern);
      counts.preservedMemberPassages+=expected.length;
      if(!equalSets(expected,actual))fail('MEMBER_EVIDENCE_UNION_CHANGED',groupAt,{expectedCount:expected.length,actualCount:actual.length,missingSourceIds:expected.filter(id=>!actual.includes(id)),extraSourceIds:actual.filter(id=>!expected.includes(id))});
      const expectedMembers=[...new Set(validMembers.flatMap(member=>candidates[member].memberCandidateIndices||[member]))],actualMembers=list(concern.memberCandidateIndices);
      if(!equalSets(expectedMembers,actualMembers))fail('MEMBER_PROVENANCE_CHANGED',groupAt);
      if(validMembers.some(member=>assignments[member]?.aspect!==group.aspect)||concern.concernAspect!==group.aspect)fail('GROUP_ASPECT_DISAGREEMENT',groupAt);
      if(concern.status!==group.status||!equalSets(list(concern.latest),list(group.latest)))fail('GROUP_STATE_DISAGREEMENT',groupAt);
      if(obligationCoverage){
        const requirements=[...new Map(validMembers.flatMap(member=>list(candidates[member].coverageRequirements)).map(requirement=>[requirement.requirementId,requirement])).values()];
        const canonicalRequirements=values=>list(values).slice().sort((a,b)=>String(a.requirementId).localeCompare(String(b.requirementId)));
        if(!sameObject(canonicalRequirements(requirements),canonicalRequirements(concern.coverageRequirements)))fail('GROUP_COVERAGE_REQUIREMENTS_CHANGED',groupAt);
      }
      if(boundedAdditionRepair){
        const independent=[...new Set(validMembers.flatMap(member=>list(candidates[member].independentOfConcernIds)))];
        if(!sameObject(list(concern.independentOfConcernIds),independent))fail('GROUP_INDEPENDENCE_CONSTRAINTS_CHANGED',groupAt);
        if(validMembers.some(member=>validMembers.some(other=>list(candidates[member].independentOfConcernIds).includes(candidates[other]?.concernId))))fail('INDEPENDENT_CONCERN_MERGED_WITH_FORBIDDEN_GROUP',groupAt);
      }
      if(requiresSubjects){
        const expectedSubjects=validMembers.map(index=>({candidateIndex:index,sourceId:assignments[index]?.subjectSourceId,[subjectKey]:assignments[index]?.[subjectProperty],role:assignments[index]?.subjectRole}));
        const canonicalSubjects=subjects=>list(subjects).map(subject=>[subject.candidateIndex,subject.sourceId,subject[subjectKey],subject.role]).sort((a,b)=>a[0]-b[0]);
        if(JSON.stringify(canonicalSubjects(group.subjectEvidence))!==JSON.stringify(canonicalSubjects(expectedSubjects))||JSON.stringify(canonicalSubjects(concern.subjectEvidence))!==JSON.stringify(canonicalSubjects(expectedSubjects)))fail('GROUP_SUBJECT_PROVENANCE_CHANGED',groupAt);
      }
      for(const member of validMembers)if(!members.includes(assignments[member]?.same_as))fail('ASPECT_LINK_CROSSES_PARTITION',groupAt,{candidateIndex:member});
    }
    if(coverage.some(count=>count!==1))fail('CANDIDATE_NOT_PARTITIONED_EXACTLY_ONCE',at,{missingIndices:coverage.flatMap((n,i)=>n===0?[i]:[]),repeatedIndices:coverage.flatMap((n,i)=>n>1?[i]:[])});
    // The partition must equal the links' connected components, not merely share an aspect.
    const parent=candidates.map((_,i)=>i),find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
    for(let i=0;i<candidates.length;i++){const j=assignments[i]?.same_as;if(Number.isInteger(j)&&j>=0&&j<candidates.length){const a=find(i),b=find(j);parent[Math.max(a,b)]=Math.min(a,b);}}
    const linked=new Map();for(let i=0;i<candidates.length;i++){const root=find(i);if(!linked.has(root))linked.set(root,[]);linked.get(root).push(i);}
    const canonical=groups=>groups.map(group=>[...group].sort((a,b)=>a-b).join(',')).sort();
    if(JSON.stringify(canonical([...linked.values()]))!==JSON.stringify(canonical(partition.map(group=>list(group.members)))))fail('PARTITION_DIFFERS_FROM_ASPECT_LINKS',at);
  }
  if(scopeNormalization&&(!Array.isArray(run?.pointerNormalizations)||!sameObject(run.pointerNormalizations,normalizationTrace)))fail('FLAT_POINTER_NORMALIZATION_TRACE_CHANGED','pointerNormalizations');
  if(boundedAssignmentRepair&&list(run?.responses).some(response=>(response.stage?.endsWith(' · repair invalid cross-aspect links')||response.stage?.endsWith(' · repair invalid concern assignments'))&&!repairStages.has(response.stage)))fail('ORPHAN_ASSIGNMENT_REPAIR_RESPONSE','responses');
  const items=list(run?.items),findings=list(run?.findings),original=list(run?.originalFindings);counts.concerns=items.length;counts.findings=findings.length;counts.originalFindings=original.length;
  if(!Array.isArray(run?.items)||!Array.isArray(run?.findings))fail('MISSING_FINAL_OUTPUT','items/findings');
  uniqueConcerns(items,'items');
  if(items.length&&!history.length)fail('MISSING_CONSOLIDATION_HISTORY','consolidationHistory');
  for(const [collection,values] of [['findings',findings],['originalFindings',original]]){
    const seen=new Set();
    for(const [i,finding] of values.entries()){
      const at=collection+'['+i+']';
      if(seen.has(finding.concernId))fail('DUPLICATE_FINDING_CONCERN_ID',at);seen.add(finding.concernId);
      const item=items.find(value=>value.concernId===finding.concernId);
      if(!item){fail('FINDING_WITHOUT_CONCERN',at);continue;}
      checkIds(finding.sourceFactIds,at+'.sourceFactIds');checkIds(finding.latestFactIds,at+'.latestFactIds');
      if(!equalSets(ids(item),list(finding.sourceFactIds)))fail('RENDERED_SOURCE_IDS_CHANGED',at);
      if(!equalSets(list(item.latest),list(finding.latestFactIds)))fail('RENDERED_LATEST_IDS_CHANGED',at);
      if(item.status!==finding.status||item.concernAspect!==finding.concernAspect)fail('RENDERED_SCOPE_OR_STATUS_CHANGED',at);
      if(item.scopeQuestion!==finding.scopeQuestion)fail('RENDERED_QUESTION_CHANGED',at);
      if(requiresSubjects&&(item[subjectProperty]!==finding[subjectProperty]||item.subjectRole!==finding.subjectRole||!sameObject(item.subjectEvidence,finding.subjectEvidence)))fail('RENDERED_SUBJECT_CHANGED',at);
      if(obligationCoverage&&!sameObject(list(item.coverageRequirements),list(finding.coverageRequirements)))fail('RENDERED_COVERAGE_REQUIREMENTS_CHANGED',at);
      const quotes=list(finding.evidence);counts.evidenceQuoteChecks+=quotes.length;
      counts[collection==='findings'?'renderedEvidenceQuotes':'originalEvidenceQuotes']+=quotes.length;
      for(const [j,quote] of quotes.entries())checkSource(quote,at+'.evidence['+j+']');
      const expectedQuotes=list(finding.sourceFactIds).map(id=>sourceKey(byId.get(id))),actualQuotes=quotes.map(sourceKey);
      if(!equalSets([...new Set(expectedQuotes)],[...new Set(actualQuotes)]))fail('RENDERED_EVIDENCE_CHANGED',at);
      const order=new Map(inventory.map((source,index)=>[source.id,index])),latest=new Set(list(finding.latestFactIds)),scopedPrefix=requiresBasis&&finding.scopeQuestion;
      const expectedObservation=list(finding.sourceFactIds).slice().sort((a,b)=>order.get(a)-order.get(b)).map(id=>byId.get(id)).filter(Boolean).map(source=>(latest.has(source.id)?(scopedPrefix?'Latest cited update for this question':'Latest cited update'):(scopedPrefix?'Retained source context':'Reported context'))+' · '+source.report_date+' · '+source.report_id+' · '+source.report_author+': “'+source.quote+'”').join('\n');
      if(finding.observation!==expectedObservation)fail('RENDERED_OBSERVATION_CHANGED',at+'.observation');
    }
    if(values.length!==items.length)fail('FINAL_OUTPUT_COUNT_MISMATCH',collection);
  }
  const pre=list(run?.preConsolidationCandidates),reviews=list(run?.materialityReviews),removals=list(run?.materialityRemovals),reconsiderations=list(run?.materialityReconsiderations);
  counts.materialityReviews=reviews.length;counts.explicitRemovals=removals.length;counts.materialityReconsiderations=reconsiderations.length;
  const reviewMap=new Map(),reconsiderationMap=new Map(),acceptedByIndex=new Map();
  const atomicVerification=requiresSubjects&&(reviews.length>0||(!savedCandidateOnly&&(run?.thorough===true||list(run?.timings).some(timing=>timing.stage?.startsWith('Checking explicitly remaining closeout tasks')))));
  const checkVerdictSelection=(review,at)=>{
    if(!['supported','routine'].includes(review?.verdict)||(review?.verdict==='supported'&&review.reasonCode!=='material_concern')||(review?.verdict==='routine'&&!REMOVAL_REASONS.has(review.reasonCode)))fail('INVALID_MATERIALITY_VERDICT',at);
    if(!C.STATUSES.includes(review?.status))fail('INVALID_MATERIALITY_STATUS',at);
    checkIds(review?.facts,at+'.facts');checkIds(review?.latest,at+'.latest');
    const selected=ids(review),dates=selected.map(id=>byId.get(id)?.report_date).filter(Boolean).sort();
    if(!list(review?.facts).length||!list(review?.latest).length)fail('EMPTY_MATERIALITY_EVIDENCE',at);
    if(dates.length&&!list(review?.latest).some(id=>byId.get(id)?.report_date===dates.at(-1)))fail('MATERIALITY_LATEST_PREDATES_CONTEXT',at);
  };
  if(atomicVerification){
    for(const [i,review] of reviews.entries()){
      const at='materialityReviews['+i+']',prior=pre[review.index];
      if(!Number.isInteger(review.index)||review.index<0||!prior||reviewMap.has(review.index))fail('INVALID_ATOMIC_REVIEW_INDEX',at);else reviewMap.set(review.index,review);
      checkVerdictSelection(review,at);
      if(prior&&(review.topic!==prior.topic||review.kind!==prior.kind||!equalSets(list(review.memberCandidateIndices),prior.memberCandidateIndices||[review.index])))fail('ATOMIC_REVIEW_CHANGED_CANDIDATE_IDENTITY',at);
      if(prior&&review.verdict==='supported')acceptedByIndex.set(review.index,[...new Set([...ids(prior),...ids(review)])]);
    }
    if(reviewMap.size!==pre.length)fail('INCOMPLETE_ATOMIC_MATERIALITY_REVIEWS','materialityReviews',{expectedCount:pre.length,actualCount:reviewMap.size});
  }
  for(const [i,reconsideration] of reconsiderations.entries()){
    const at='materialityReconsiderations['+i+']',index=reconsideration.index,prior=pre[index],initial=reviewMap.get(index)||reviews.find(review=>review.index===index);
    if(!Number.isInteger(index)||index<0||!prior||reconsiderationMap.has(index))fail('INVALID_RECONSIDERATION_INDEX',at);else reconsiderationMap.set(index,reconsideration);
    if(!initial||initial.verdict!=='routine'||!sameObject(reconsideration.initialReview,initial))fail('RECONSIDERATION_INITIAL_TRACE_CHANGED',at);
    if(!prior||!equalSets(list(reconsideration.memberCandidateIndices),prior.memberCandidateIndices||[index])||!equalSets(list(reconsideration.retainedSourceFactIds),ids(prior)))fail('RECONSIDERATION_ORIGINAL_EVIDENCE_CHANGED',at);
    if(typeof reconsideration.explanation!=='string'||!reconsideration.explanation.trim())fail('UNEXPLAINED_RECONSIDERATION',at);
    checkIds(reconsideration.retainedSourceFactIds,at+'.retainedSourceFactIds');checkIds(reconsideration.acceptedSourceFactIds,at+'.acceptedSourceFactIds');checkVerdictSelection(reconsideration.review,at+'.review');
    if(reconsideration.review?.index!==index)fail('RECONSIDERATION_VERDICT_INDEX_CHANGED',at);
    const restored=reconsideration.review?.verdict==='supported',expectedOutcome=restored?'restored':'confirmed_routine';
    if(reconsideration.outcome!==expectedOutcome)fail('RECONSIDERATION_OUTCOME_DISAGREEMENT',at);
    if(restored){
      const expected=[...new Set([...ids(prior),...ids(reconsideration.review)])];
      if(!equalSets(expected,list(reconsideration.acceptedSourceFactIds)))fail('RESTORED_EVIDENCE_UNION_CHANGED',at);
      if(removals.some(removal=>removal.index===index))fail('RESTORED_CANDIDATE_STILL_REMOVED',at);
      acceptedByIndex.set(index,expected);counts.restoredCandidates++;
    }else{
      if(list(reconsideration.acceptedSourceFactIds).length)fail('ROUTINE_RECONSIDERATION_HAS_ACCEPTED_EVIDENCE',at);
      if(!removals.some(removal=>removal.index===index))fail('CONFIRMED_ROUTINE_WITHOUT_REMOVAL_RECORD',at);
      counts.confirmedRoutineCandidates++;
    }
  }
  if(labels)for(const [i,review] of reviews.entries())if(review.verdict==='routine'&&!reconsiderationMap.has(review.index))fail('MISSING_INDEPENDENT_REMOVAL_REVIEW','materialityReviews['+i+']');
  const removedIndices=[];
  for(const [i,removal] of removals.entries()){
    const at='materialityRemovals['+i+']';
    if(removal.verdict!=='routine'||!REMOVAL_REASONS.has(removal.reasonCode)||typeof removal.explanation!=='string'||!removal.explanation.trim())fail('UNEXPLAINED_MATERIALITY_REMOVAL',at);
    if(!list(removal.memberCandidateIndices).length)fail('REMOVAL_WITHOUT_CANDIDATE_PROVENANCE',at);
    removedIndices.push(...list(removal.memberCandidateIndices));
    checkIds(removal.retainedSourceFactIds,at+'.retainedSourceFactIds');checkIds(removal.reviewedSourceFactIds,at+'.reviewedSourceFactIds');
    const initial=reviews.find(value=>value.index===removal.index&&value.verdict==='routine'),reconsideration=reconsiderationMap.get(removal.index),review=labels?reconsideration?.review:initial;
    if(!review||review.verdict!=='routine'||review.reasonCode!==removal.reasonCode)fail('REMOVAL_WITHOUT_MATCHING_REVIEW',at);
    if(labels&&(!removal.adjudicated||removal.initialReasonCode!==initial?.reasonCode||reconsideration?.outcome!=='confirmed_routine'))fail('REMOVAL_WITHOUT_ADJUDICATION_TRACE',at);
    if(review?.facts&&(!equalSets(ids(review),list(removal.reviewedSourceFactIds))))fail('REMOVAL_VERDICT_EVIDENCE_CHANGED',at);
    // In 18d atomic verification precedes identity; its null-ID removals refer to original pre-pool indices.
    const atomic=removal.concernId===null,prior=atomic?pre[removal.index]:history.flatMap(entry=>list(entry.concerns)).find(value=>value.concernId===removal.concernId);
    if(!prior||!equalSets(ids(prior),list(removal.retainedSourceFactIds)))fail('REMOVED_EVIDENCE_NOT_RETAINED_IN_AUDIT',at);
    if(atomic&&(!Number.isInteger(removal.index)||removal.index<0||!prior||!equalSets(list(removal.memberCandidateIndices),prior.memberCandidateIndices||[removal.index])))fail('ATOMIC_REMOVAL_INDEX_MISMATCH',at);
  }
  for(const [i,review] of reviews.entries())if(review.verdict==='routine'){
    const reconsideration=reconsiderationMap.get(review.index),restored=labels&&reconsideration?.outcome==='restored';
    if(!restored&&!removals.some(value=>value.index===review.index&&(!labels?value.reasonCode===review.reasonCode:true)))fail('SILENT_ROUTINE_REMOVAL','materialityReviews['+i+']');
  }
  counts.removedCandidates=removedIndices.length;
  const coverageAdded=list(run?.coverageAddedCandidates),fullAdded=finalProductGate?list(productReview?.preEntailmentAddedCandidates):coverageAdded,additionRemovals=finalProductGate?list(productReview?.additionRemovals):[],allCandidates=[...pre,...fullAdded],accounting=Array(allCandidates.length).fill(0);
  counts.coverageAddedCandidates=coverageAdded.length;
  for(const [i,candidate] of fullAdded.entries()){
    checkIds(ids(candidate),'fullCoverageAddedCandidates['+i+']');
    if(!obligationCoverage||!equalSets(list(candidate.memberCandidateIndices),[pre.length+i])||candidate.origin!=='source-obligation-audit')fail('INVALID_COVERAGE_CANDIDATE_INDEX','fullCoverageAddedCandidates['+i+']');
  }
  for(const [i,candidate] of coverageAdded.entries())if(!fullAdded.some(prior=>prior.coverageKey===candidate.coverageKey&&sameObject(prior,candidate)))fail('ACCEPTED_COVERAGE_CANDIDATE_CHANGED_OR_RENUMBERED','coverageAddedCandidates['+i+']');
  for(const [i,removal] of additionRemovals.entries()){
    const prior=fullAdded.find(candidate=>candidate.coverageKey===removal.coverageKey);
    if(!prior||removal.reasonCode!=='unverified_product_change'||!sameObject(removal.memberCandidateIndices,prior.memberCandidateIndices)||!sameObject(removal.sourceFactIds,ids(prior))||coverageAdded.some(candidate=>candidate.coverageKey===removal.coverageKey))fail('INVALID_PRODUCT_ADDITION_REMOVAL','additionRemovals['+i+']');
  }
  for(const index of [...items.flatMap(item=>list(item.memberCandidateIndices)),...removedIndices,...additionRemovals.flatMap(removal=>list(removal.memberCandidateIndices))])if(!Number.isInteger(index)||index<0||index>=allCandidates.length)fail('INVALID_ORIGINAL_CANDIDATE_ACCOUNTING','preConsolidationCandidates');else accounting[index]++;
  if(accounting.some(n=>n!==1))fail('ORIGINAL_CANDIDATE_NOT_ACCOUNTED_EXACTLY_ONCE','preConsolidationCandidates',{missingIndices:accounting.flatMap((n,i)=>n===0?[i]:[]),repeatedIndices:accounting.flatMap((n,i)=>n>1?[i]:[])});
  for(const [i,item] of items.entries()){
    const expected=[...new Set(list(item.memberCandidateIndices).filter(index=>allCandidates[index]).flatMap(index=>ids(allCandidates[index])))],actual=ids(item);
    counts.finalPreservedCandidatePassages+=expected.length;
    if(expected.some(id=>!actual.includes(id)))fail('ORIGINAL_MEMBER_EVIDENCE_LOST_BEFORE_FINAL_OUTPUT','items['+i+']',{missingSourceIds:expected.filter(id=>!actual.includes(id))});
    const verdictEvidence=[...new Set(list(item.memberCandidateIndices).flatMap(index=>acceptedByIndex.get(index)||[]))];
    if(verdictEvidence.some(id=>!actual.includes(id)))fail('SUPPORTED_VERDICT_EVIDENCE_LOST_BEFORE_FINAL_OUTPUT','items['+i+']',{missingSourceIds:verdictEvidence.filter(id=>!actual.includes(id))});
  }
  for(const [i,removal] of removals.entries()){
    const expected=[...new Set(list(removal.memberCandidateIndices).filter(index=>pre[index]).flatMap(index=>ids(pre[index])))],retained=list(removal.retainedSourceFactIds);
    if(expected.some(id=>!retained.includes(id)))fail('ORIGINAL_REMOVED_EVIDENCE_NOT_RETAINED_IN_AUDIT','materialityRemovals['+i+']',{missingSourceIds:expected.filter(id=>!retained.includes(id))});
  }
  if(obligationCoverage&&!savedCandidateOnly){
    const audit=run?.sourceObligationAudit,at='sourceObligationAudit';
    if(!audit||audit.version!==(finalProductGate?'source-obligation-coverage-6':novelSourceAttachments?'source-obligation-coverage-5':boundedAdditionRepair?'source-obligation-coverage-4':smallObligationCritic?'source-obligation-coverage-3':typedObligationCritic?'source-obligation-coverage-2':'source-obligation-coverage-1'))fail('MISSING_SOURCE_OBLIGATION_AUDIT',at);
    else{
      const expectedSources=inventory.filter(source=>['action_required','schedule_status'].includes(source.field)||/\b(?:until|before|after|pending|remain(?:s|ing)?|require(?:d|s)?|must|shall|unless|follow[- ]?up|protect(?:ion)?|curing|handoff|not yet|await(?:s|ing)?)\b/i.test(source.quote)).map(source=>source.id);
      const before=list(audit.beforeConcerns),coveredBefore=new Set(before.flatMap(ids)),expectedUncited=expectedSources.filter(id=>!coveredBefore.has(id)),ledgers=list(audit.rawLedgers),postOrphanLedgers=boundedAdditionRepair?list(audit.postOrphanLedgers):ledgers,appliedLedgers=boundedAdditionRepair?list(audit.appliedLedgers):ledgers,preEntailmentLedgers=finalProductGate?list(productReview?.preEntailmentLedgers):appliedLedgers,preEntailmentConcerns=finalProductGate?list(productReview?.preEntailmentConcerns):items,entries=list(audit.entries),addedByKey=new Map(coverageAdded.map(candidate=>[candidate.coverageKey,candidate]));
      counts.obligationSources=expectedSources.length;
      if(!sameObject(audit.checkedSourceFactIds,expectedSources)||!sameObject(audit.uncitedSourceFactIds,expectedUncited))fail('OBLIGATION_SOURCE_SET_CHANGED',at);
      if(audit.candidateStartIndex!==pre.length)fail('OBLIGATION_CANDIDATE_BOUNDARY_CHANGED',at);
      if(!sameObject(audit.afterConcerns,items))fail('OBLIGATION_FINAL_SNAPSHOT_CHANGED',at+'.afterConcerns');
      if(!sameObject(audit.addedCandidateKeys,coverageAdded.map(candidate=>candidate.coverageKey))||addedByKey.size!==coverageAdded.length)fail('OBLIGATION_ADDED_CANDIDATE_KEYS_CHANGED',at);
      const reconsolidations=history.filter(entry=>Array.isArray(entry.preservedConcernIds)),earlier=history.filter(entry=>!Array.isArray(entry.preservedConcernIds));
      if(!sameObject(before,earlier.at(-1)?.concerns||[]))fail('OBLIGATION_BEFORE_SNAPSHOT_NOT_PRIOR_OUTPUT',at+'.beforeConcerns');
      if(audit.reconsolidated!==(fullAdded.length>0)||reconsolidations.length!==(fullAdded.length?1:0))fail('OBLIGATION_RECONSOLIDATION_ACCOUNTING_CHANGED',at);
      for(const [i,old] of before.entries()){
        const matches=items.filter(item=>item.concernId===old.concernId),preserved=matches[0];
        if(matches.length!==1||preserved.status!==old.status||preserved.scopeQuestion!==old.scopeQuestion||preserved.concernAspect!==old.concernAspect||!sameObject(preserved.sourceAnchor,old.sourceAnchor)||ids(old).some(id=>!ids(preserved).includes(id)))fail('OBLIGATION_CHANGED_PRESERVED_CONCERN',at+'.beforeConcerns['+i+']');else counts.preservedEarlierConcerns++;
      }
      const ledgerIds=ledgers.flatMap(ledger=>list(ledger.checkingSourceFactIds));
      if(!sameObject(ledgerIds,expectedSources))fail('OBLIGATION_LEDGER_SOURCE_ACCOUNTING_CHANGED',at+'.rawLedgers');
      if(typedObligationCritic){
        const initial=list(audit.initialRawLedgers),corrections=list(audit.ledgerCorrections);
        if(!Array.isArray(audit.initialRawLedgers)||(!smallObligationCritic&&initial.length!==ledgers.length)||!sameObject(initial.flatMap(ledger=>list(ledger.checkingSourceFactIds)),expectedSources))fail('INITIAL_OBLIGATION_LEDGER_ACCOUNTING_CHANGED',at+'.initialRawLedgers');
        if(smallObligationCritic){
          const chunks=size=>Array.from({length:Math.ceil(expectedSources.length/size)},(_,index)=>expectedSources.slice(index*size,(index+1)*size));
          if(audit.draftBatchSize!==30||audit.criticBatchSize!==4||!sameObject(initial.map(ledger=>ledger.checkingSourceFactIds),chunks(30))||!sameObject(ledgers.map(ledger=>ledger.checkingSourceFactIds),chunks(4)))fail('OBLIGATION_BATCH_PARTITION_CHANGED',at);
        }
        const expectedCorrections=ledgers.map((ledger,index)=>{
          const sourceIds=list(ledger.checkingSourceFactIds);
          if(!smallObligationCritic)return {checkingSourceFactIds:ledger.checkingSourceFactIds,sourceComponents:sourceIds.map(sourceFactId=>({sourceFactId,before:initial[index]?.coverage?.[sourceFactId]??null,after:ledger.coverage?.[sourceFactId]??null})),beforeAdditions:initial[index]?.additions??null,afterAdditions:ledger.additions??null};
          const draftLedgerIndices=initial.flatMap((draft,i)=>sourceIds.some(id=>list(draft.checkingSourceFactIds).includes(id))?[i]:[]),drafts=draftLedgerIndices.map(i=>initial[i]);
          return {checkingSourceFactIds:ledger.checkingSourceFactIds,draftLedgerIndices,sourceComponents:sourceIds.map(sourceFactId=>({sourceFactId,before:initial.find(draft=>list(draft.checkingSourceFactIds).includes(sourceFactId))?.coverage?.[sourceFactId]??null,after:ledger.coverage?.[sourceFactId]??null})),beforeAdditions:drafts.every(draft=>Array.isArray(draft.additions))?drafts.flatMap(draft=>draft.additions):null,afterAdditions:ledger.additions??null};
        });
        if(!Array.isArray(audit.ledgerCorrections)||!sameObject(corrections,expectedCorrections))fail('OBLIGATION_LEDGER_CORRECTION_TRACE_CHANGED',at+'.ledgerCorrections');
        counts.obligationLedgerCorrections=corrections.length;
        const drafts=list(run?.responses).filter(response=>response.stage==='Checking every remaining source obligation');
        if(drafts.length!==initial.length)fail('RAW_INITIAL_OBLIGATION_RESPONSE_COUNT_CHANGED',at+'.initialRawLedgers');
        else for(const [i,response] of drafts.entries()){
          try{
            const answer=response.raw.includes('</think>')?response.raw.slice(response.raw.lastIndexOf('</think>')+8):response.raw,parsed=JSON.parse(answer.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));
            if(!sameObject(parsed,{coverage:initial[i].coverage,additions:initial[i].additions}))fail('RAW_INITIAL_OBLIGATION_RESPONSE_HISTORY_CHANGED',at+'.initialRawLedgers['+i+']');else counts.rawInitialObligationResponsesVerified++;
          }catch{fail('RAW_INITIAL_OBLIGATION_RESPONSE_INVALID_JSON',at+'.initialRawLedgers['+i+']');}
        }
      }
      if(boundedAdditionRepair){
        const stage='Repairing unlinked obligation additions',repairs=list(audit.additionRepairs),expectedRepairs=[],responses=list(run?.responses).filter(response=>response.stage===stage),rawResponses=list(run?.responses).filter(response=>response.stage==='Independently verifying source-obligation coverage');
        if(!Array.isArray(audit.postOrphanLedgers)||postOrphanLedgers.length!==ledgers.length||!Array.isArray(audit.appliedLedgers)||appliedLedgers.length!==ledgers.length||!Array.isArray(audit.additionRepairs))fail('MISSING_APPLIED_OBLIGATION_LEDGER_TRACE',at);
        for(const [index,ledger] of ledgers.entries()){
          for(const addition of list(ledger.additions))if(!new RegExp('^A'+index+'-(?:[0-9]|1[0-9]|2[0-3])$').test(addition?.key))fail('INVALID_OBLIGATION_ADDITION_KEY',at+'.rawLedgers['+index+']');
          const referenced=new Set(list(ledger.checkingSourceFactIds).flatMap(id=>list(ledger.coverage?.[id])).filter(component=>component?.disposition==='add').map(component=>component.additionKey)),orphanAdditionKeys=list(ledger.additions).filter(addition=>!referenced.has(addition?.key)).map(addition=>addition?.key),additions=list(ledger.additions).filter(addition=>referenced.has(addition?.key));
          if(!orphanAdditionKeys.length){if(!sameObject(postOrphanLedgers[index],ledger))fail('VALID_OBLIGATION_LEDGER_CHANGED',at+'.postOrphanLedgers['+index+']');continue;}
          let code=null;try{E.applyObligationCoverage(before,[ledger],{facts:inventory},rows,pre.length,{typed:true});}catch(error){code=error.code;}
          if(code!=='ORPHAN_OBLIGATION_ADDITION')fail('INVALID_OBLIGATION_ADDITION_REPAIR_TRIGGER',at+'.rawLedgers['+index+']');
          const after={...ledger,additions};
          if(!sameObject(postOrphanLedgers[index],after))fail('OBLIGATION_ADDITION_REPAIR_CHANGED_FROZEN_FIELDS',at+'.postOrphanLedgers['+index+']');
          expectedRepairs.push({stage,checkingSourceFactIds:ledger.checkingSourceFactIds,orphanAdditionKeys,error:{code:'ORPHAN_OBLIGATION_ADDITION',message:'An obligation addition has no ledger component.'},before:ledger,response:{additions},after});
          counts.removedOrphanAdditions+=orphanAdditionKeys.length;
        }
        if(!sameObject(repairs,expectedRepairs))fail('OBLIGATION_ADDITION_REPAIR_TRACE_CHANGED',at+'.additionRepairs');
        counts.obligationAdditionRepairs=repairs.length;
        if(responses.length!==expectedRepairs.length)fail('RAW_ADDITION_REPAIR_RESPONSE_COUNT_CHANGED',at+'.additionRepairs');
        else for(const [index,response] of responses.entries())try{
          const text=response.raw,answer=text.includes('</think>')?text.slice(text.lastIndexOf('</think>')+8):text,parsed=JSON.parse(answer.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));
          if(!sameObject(parsed,expectedRepairs[index].response))fail('RAW_ADDITION_REPAIR_RESPONSE_CHANGED',at+'.additionRepairs['+index+']');else counts.rawAdditionRepairResponsesVerified++;
        }catch{fail('RAW_ADDITION_REPAIR_RESPONSE_INVALID_JSON',at+'.additionRepairs['+index+']');}
        if(responses.length&&rawResponses.some(response=>list(run?.responses).indexOf(response)>list(run?.responses).indexOf(responses[0])))fail('ADDITION_REPAIR_PRECEDED_ORIGINAL_CRITICS',at+'.additionRepairs');
        const cases=[],batches=list(audit.attachmentReviewBatches),decisions=[],reviewed=new Map(),attachmentStage='Independently verifying requirement attachments',attachmentResponses=list(run?.responses).filter(response=>response.stage===attachmentStage);
        for(const [ledgerIndex,ledger] of postOrphanLedgers.entries())for(const sourceFactId of list(ledger.checkingSourceFactIds)){
          const components=list(ledger.coverage?.[sourceFactId]);
          if(novelSourceAttachments){
            const componentIndices=components.flatMap((component,index)=>component?.disposition==='represented'&&!ids(before.find(item=>item.concernId===component.targetConcernId)).includes(sourceFactId)?[index]:[]);
            if(componentIndices.length)cases.push({caseId:'L'+cases.length,ledgerIndex,sourceFactId,componentIndices,proposedComponents:componentIndices.map(index=>components[index])});
          }else for(const [componentIndex,component] of components.entries())if(component?.disposition==='represented')cases.push({caseId:'L'+cases.length,ledgerIndex,sourceFactId,componentIndex,proposedComponent:component});
        }
        const attachmentBatchSize=novelSourceAttachments?1:4,caseChunks=Array.from({length:Math.ceil(cases.length/attachmentBatchSize)},(_,index)=>cases.slice(index*attachmentBatchSize,(index+1)*attachmentBatchSize).map(value=>value.caseId));
        if(audit.attachmentBatchSize!==attachmentBatchSize||(novelSourceAttachments&&(audit.attachmentSelection!=='novel-original-evidence-only'||audit.attachmentReviewScope!=='Only new source quotations are independently matched; already-cited component labels remain unverified AI metadata.'))||!Array.isArray(audit.attachmentCases)||!sameObject(audit.attachmentCases,cases)||!Array.isArray(audit.attachmentReviewBatches)||!sameObject(batches.map(batch=>batch.checkingCaseIds),caseChunks))fail('ATTACHMENT_CASE_ACCOUNTING_CHANGED',at+'.attachmentCases');
        counts.attachmentCases=cases.length;
        for(const [index,batch] of batches.entries()){
          const keys=list(batch.checkingCaseIds),reviews=batch.reviews;
          if(!reviews||typeof reviews!=='object'||Array.isArray(reviews)||Object.keys(reviews).length!==keys.length||keys.some(key=>!Object.hasOwn(reviews,key)))fail('INCOMPLETE_ATTACHMENT_REVIEWS',at+'.attachmentReviewBatches['+index+']');
          for(const key of keys){if(reviewed.has(key))fail('REPEATED_ATTACHMENT_REVIEW',at+'.attachmentReviewBatches['+index+']');reviewed.set(key,reviews?.[key]);}
        }
        for(const item of cases){
          const replacement=reviewed.get(item.caseId),after=[],addedAdditions=[],componentAt=at+'.attachmentDecisions.'+item.caseId;
          if(!Array.isArray(replacement)||!replacement.length||replacement.length>6)fail('INVALID_ATTACHMENT_COMPONENT_LIST',componentAt);
          for(const [index,component] of list(replacement).entries()){
            const expected=['componentLabel','aspect','disposition','reasonCode','evidenceRole','targetConcernId','closureSourceId',component?.disposition==='add'?'addition':'additionKey'];
            if(!component||Array.isArray(component)||Object.keys(component).length!==expected.length||expected.some(key=>!Object.hasOwn(component,key))||!algorithm.ASPECTS[component?.aspect]){fail('INVALID_ATTACHMENT_COMPONENT_FIELDS',componentAt);continue;}
            if(component.disposition!=='add'){after.push(component);continue;}
            const addition=component.addition;
            if(!addition||Array.isArray(addition)||Object.keys(addition).length!==4||['topic','status','facts','latest'].some(key=>!Object.hasOwn(addition,key))||!['open','needs_verification'].includes(addition.status)){fail('INVALID_ATTACHMENT_ADDITION',componentAt);continue;}
            try{
              const checked=algorithm.validateItems([{...addition,kind:algorithm.ASPECTS[component.aspect].kind}],inventory)[0],key='R-'+item.caseId+'-'+index;
              if(!ids(checked).includes(item.sourceFactId))fail('ATTACHMENT_ADDITION_OMITTED_OWN_SOURCE',componentAt);
              addedAdditions.push({key,aspect:component.aspect,topic:checked.topic,status:checked.status,facts:checked.facts,latest:checked.latest,independentOfConcernIds:before.map(concern=>concern.concernId)});
              const {addition:ignored,...normalized}=component;after.push({...normalized,additionKey:key});
            }catch{fail('INVALID_ATTACHMENT_ADDITION',componentAt);}
          }
          decisions.push({caseId:item.caseId,before:novelSourceAttachments?item.proposedComponents:item.proposedComponent,after,addedAdditions});
        }
        if(!Array.isArray(audit.attachmentDecisions)||!sameObject(audit.attachmentDecisions,decisions))fail('ATTACHMENT_DECISION_TRACE_CHANGED',at+'.attachmentDecisions');
        counts.attachmentDecisions=decisions.length;
        const byCase=new Map(decisions.map(decision=>[decision.caseId,decision])),caseByPosition=new Map(cases.flatMap(item=>(novelSourceAttachments?item.componentIndices:[item.componentIndex]).map(index=>[item.ledgerIndex+'|'+item.sourceFactId+'|'+index,item.caseId]))),firstPosition=new Map(cases.map(item=>[item.caseId,novelSourceAttachments?item.componentIndices[0]:item.componentIndex]));
        const expectedApplied=postOrphanLedgers.map((ledger,ledgerIndex)=>({...ledger,coverage:Object.fromEntries(list(ledger.checkingSourceFactIds).map(sourceFactId=>[sourceFactId,list(ledger.coverage?.[sourceFactId]).flatMap((component,componentIndex)=>{const caseId=caseByPosition.get(ledgerIndex+'|'+sourceFactId+'|'+componentIndex);return caseId?(firstPosition.get(caseId)===componentIndex?byCase.get(caseId).after:[]):[component];})])),additions:[...list(ledger.additions),...cases.filter(item=>item.ledgerIndex===ledgerIndex).flatMap(item=>byCase.get(item.caseId).addedAdditions)]}));
        if(!sameObject(preEntailmentLedgers,expectedApplied))fail('ATTACHMENT_APPLICATION_CHANGED_UNREVIEWED_FIELDS',at+'.preEntailmentLedgers');
        if(attachmentResponses.length!==batches.length)fail('RAW_ATTACHMENT_RESPONSE_COUNT_CHANGED',at+'.attachmentReviewBatches');
        else for(const [index,response] of attachmentResponses.entries())try{
          const text=response.raw,answer=text.includes('</think>')?text.slice(text.lastIndexOf('</think>')+8):text,parsed=JSON.parse(answer.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));
          if(!sameObject(parsed,{reviews:batches[index].reviews}))fail('RAW_ATTACHMENT_RESPONSE_CHANGED',at+'.attachmentReviewBatches['+index+']');else counts.rawAttachmentResponsesVerified++;
        }catch{fail('RAW_ATTACHMENT_RESPONSE_INVALID_JSON',at+'.attachmentReviewBatches['+index+']');}
        if(attachmentResponses.length&&[...rawResponses,...responses].some(response=>list(run?.responses).indexOf(response)>list(run?.responses).indexOf(attachmentResponses[0])))fail('ATTACHMENT_REVIEW_PRECEDED_ORIGINAL_LEDGERS',at+'.attachmentReviewBatches');
      }
      const reasonFor={routine:'ordinary_plan',closed:'explicit_later_closure',represented:'same_open_concern',add:'independent_unclosed_requirement',...(typedObligationCritic?{already_completed_state:'source_reports_completed_state'}:{}),...(finalProductGate?{unresolved:'unverified_association'}:{})},flattened=[];
      for(const [batch,ledger] of appliedLedgers.entries()){
        const sources=list(ledger.checkingSourceFactIds),coverage=ledger.coverage;
        if(!coverage||Array.isArray(coverage)||Object.keys(coverage).length!==sources.length||sources.some(id=>!Object.hasOwn(coverage,id)))fail('INCOMPLETE_OBLIGATION_COMPONENT_LEDGER',at+'.rawLedgers['+batch+']');
        for(const addition of list(ledger.additions))if(!new RegExp('^A'+batch+'-(?:[0-9]|1[0-9]|2[0-3])$').test(addition.key)&&!(boundedAdditionRepair&&/^R-L[0-9]+-[0-5]$/.test(addition.key)))fail('INVALID_OBLIGATION_ADDITION_KEY',at+'.rawLedgers['+batch+']');
        for(const sourceFactId of sources){
          const fact=byId.get(sourceFactId),components=list(coverage?.[sourceFactId]);
          if(!fact||!components.length||components.length>6)fail('INVALID_OBLIGATION_COMPONENT_LIST',at+'.rawLedgers['+batch+']',{sourceId:sourceFactId});
          const normalized=[];
          for(const [componentIndex,component] of components.entries()){
            const componentAt=at+'.rawLedgers['+batch+'].coverage.'+sourceFactId+'['+componentIndex+']',requirementId='O-'+sourceFactId+'-'+componentIndex;
            counts.obligationComponents++;
            if(!algorithm.ASPECTS[component.aspect]||component.reasonCode!==reasonFor[component.disposition]||typeof component.componentLabel!=='string'||component.componentLabel.trim().length<2||component.componentLabel.length>140||/[\r\n<>]/.test(component.componentLabel))fail('INVALID_OBLIGATION_COMPONENT_DISPOSITION',componentAt);
            if(typedObligationCritic&&component.evidenceRole!==(component.disposition==='unresolved'&&finalProductGate?'unresolved_association_for_review':E.OBLIGATION_ROLES[component.disposition]))fail('INVALID_OBLIGATION_EVIDENCE_ROLE',componentAt);
            if(component.disposition==='closed'){
              const closure=byId.get(component.closureSourceId);counts.obligationClosedComponents++;
              if(component.targetConcernId!=='none'||component.additionKey!=='none'||!closure||closure.id===sourceFactId||closure.report_date<fact?.report_date)fail('OBLIGATION_CLOSURE_POINTER_INVALID',componentAt);
            }else if(component.disposition==='already_completed_state'){
              counts.obligationCompletedComponents++;
              if(!typedObligationCritic||component.targetConcernId!=='none'||component.additionKey!=='none'||component.closureSourceId!==sourceFactId)fail('OBLIGATION_COMPLETED_STATE_POINTER_INVALID',componentAt);
            }else{
              if(component.closureSourceId!=='none')fail('OBLIGATION_INVENTED_CLOSURE_POINTER',componentAt);
              if(component.disposition==='routine'||(finalProductGate&&component.disposition==='unresolved')){
                if(component.disposition==='routine')counts.obligationRoutineComponents++;
                if(component.targetConcernId!=='none'||component.additionKey!=='none')fail('ROUTINE_OBLIGATION_CHANGED_CONCERN',componentAt);
              }else if(component.disposition==='represented'){
                counts.obligationRepresentedComponents++;
                const old=before.find(item=>item.concernId===component.targetConcernId),target=items.find(item=>item.concernId===component.targetConcernId);
                if(!old||!target||!['open','needs_verification'].includes(old.status)||old.concernAspect!==component.aspect||component.additionKey!=='none'||!ids(target).includes(sourceFactId)||!list(target.coverageRequirements).some(requirement=>requirement.requirementId===requirementId))fail('REPRESENTED_OBLIGATION_NOT_PRESERVED',componentAt);
              }else if(component.disposition==='add'){
                counts.obligationAddedComponents++;
                const candidate=addedByKey.get(component.additionKey),owner=items.find(item=>list(item.memberCandidateIndices).includes(candidate?.memberCandidateIndices?.[0]));
                if(component.targetConcernId!=='none'||!candidate||candidate.concernAspect!==component.aspect||!['open','needs_verification'].includes(candidate.status)||!ids(candidate).includes(sourceFactId)||!owner||!['open','needs_verification'].includes(owner.status)||!list(owner.coverageRequirements).some(requirement=>requirement.requirementId===requirementId))fail('ADDED_OBLIGATION_NOT_ACCOUNTED',componentAt);
              }
            }
            normalized.push({...component,componentIndex,requirementId,sourceFactId,quote:fact?.quote});
          }
          flattened.push({sourceFactId,components:normalized});
        }
      }
      if(!sameObject(entries,flattened))fail('NORMALIZED_OBLIGATION_LEDGER_CHANGED',at+'.entries');
      for(const [i,item] of items.entries())for(const [j,requirement] of list(item.coverageRequirements).entries()){
        const requirementAt='items['+i+'].coverageRequirements['+j+']';
        checkSource(requirement,requirementAt,{date:true,author:true});
        if(!byId.has(requirement.sourceFactId)||sourceKey(byId.get(requirement.sourceFactId))!==sourceKey(requirement)||!ids(item).includes(requirement.sourceFactId))fail('OBLIGATION_REQUIREMENT_SOURCE_CHANGED',requirementAt);
      }
      const rawResponses=list(run?.responses).filter(response=>response.stage===(typedObligationCritic?'Independently verifying source-obligation coverage':'Checking every remaining source obligation'));
      if(rawResponses.length!==ledgers.length)fail('RAW_OBLIGATION_RESPONSE_COUNT_CHANGED',at);
      else for(const [i,response] of rawResponses.entries()){
        try{
          const answer=response.raw.includes('</think>')?response.raw.slice(response.raw.lastIndexOf('</think>')+8):response.raw,parsed=JSON.parse(answer.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));
          if(!sameObject(parsed,{coverage:ledgers[i].coverage,additions:ledgers[i].additions}))fail('RAW_OBLIGATION_RESPONSE_HISTORY_CHANGED',at+'.rawLedgers['+i+']');else counts.rawObligationResponsesVerified++;
        }catch{fail('RAW_OBLIGATION_RESPONSE_INVALID_JSON',at+'.rawLedgers['+i+']');}
      }
      if(finalProductGate){
        const reviewAt=at+'.finalProductReview',stage='Independently checking final product changes',cases=[],originalById=new Map(before.map(item=>[item.concernId,item])),rawReviews=list(productReview?.rawReviews),decisions=[],abstentions=[];
        for(const [ledgerIndex,ledger] of preEntailmentLedgers.entries())for(const sourceFactId of list(ledger.checkingSourceFactIds))for(const [componentIndex,component] of list(ledger.coverage?.[sourceFactId]).entries()){
          const target=originalById.get(component?.targetConcernId);
          if(component?.disposition==='represented'&&target&&!ids(target).includes(sourceFactId))cases.push({caseId:'P'+cases.length,type:'attachment',ledgerIndex,sourceFactId,componentIndex,componentLabel:component.componentLabel,originalConcernId:target.concernId,proposedConcernId:null,sourceFactIds:[sourceFactId]});
        }
        for(const item of preEntailmentConcerns.filter(item=>!originalById.has(item.concernId))){
          const members=new Set(list(item.memberCandidateIndices)),candidates=fullAdded.filter(candidate=>list(candidate.memberCandidateIndices).some(index=>members.has(index)));
          if(!candidates.length)fail('PRODUCT_CHANGE_WITHOUT_ADDITION_LINEAGE',reviewAt);
          cases.push({caseId:'P'+cases.length,type:'new_concern',originalConcernId:null,proposedConcernId:item.concernId,sourceFactIds:ids(item),additionKeys:candidates.map(candidate=>candidate.coverageKey),memberCandidateIndices:item.memberCandidateIndices});
        }
        if(productReview?.version!=='product-change-entailment-1'||productReview?.stage!==stage||productReview?.batchSize!==1||!sameObject(productReview?.cases,cases)||!sameObject(rawReviews.map(batch=>batch.checkingCaseIds),cases.map(item=>[item.caseId])))fail('FINAL_PRODUCT_CASE_ACCOUNTING_CHANGED',reviewAt);
        counts.finalProductCases=cases.length;counts.rawProductResponsesVerified=0;
        for(const [index,item] of cases.entries()){
          const batch=rawReviews[index],reviews=batch?.reviews,review=reviews?.[item.caseId],fields=['verdict','reasonCode','sourceProofId','sourceSpan','targetProofId','targetSpan','chronologySourceIds','overlappingConcernId'],chronology=list(review?.chronologySourceIds),reviewCaseAt=reviewAt+'.rawReviews['+index+']';
          if(!reviews||Array.isArray(reviews)||Object.keys(reviews).length!==1||!Object.hasOwn(reviews,item.caseId)||!review||Array.isArray(review)||Object.keys(review).length!==fields.length||fields.some(field=>!Object.hasOwn(review,field))||!chronology.length||chronology.length>8||new Set(chronology).size!==chronology.length||chronology.some(id=>!byId.has(id))){fail('INVALID_FINAL_PRODUCT_REVIEW',reviewCaseAt);continue;}
          let effectiveVerdict=review.verdict,reasonCode=review.reasonCode,subjectSupport=null;
          if(review.verdict==='retain'){
            const target=(item.type==='attachment'?before:preEntailmentConcerns).find(concern=>concern.concernId===(item.originalConcernId||item.proposedConcernId)),sourceProof=byId.get(review.sourceProofId),targetProof=byId.get(review.targetProofId),reports=new Set(item.sourceFactIds.map(id=>byId.get(id)?.report_id));
            if(review.reasonCode!=='source_scope_and_current_state_supported'||review.overlappingConcernId!=='none'||!sourceProof||!reports.has(sourceProof.report_id)||!ids(target).includes(review.targetProofId)||typeof review.sourceSpan!=='string'||review.sourceSpan.length<2||review.sourceSpan.length>300||!sourceProof?.quote.includes(review.sourceSpan)||typeof review.targetSpan!=='string'||review.targetSpan.length<2||review.targetSpan.length>300||!targetProof?.quote.includes(review.targetSpan))fail('PRODUCT_RETAIN_WITHOUT_EXACT_GROUNDING',reviewCaseAt);
            if(item.type==='attachment'&&target){subjectSupport=E.subjectDisambiguation(target,before,{facts:inventory},item.sourceFactId);if(!subjectSupport.passed){effectiveVerdict='abstain';reasonCode='subject_scope_not_explicit';}}
          }else{
            if(review.sourceProofId!=='none'||review.targetProofId!=='none'||review.sourceSpan!==''||review.targetSpan!=='')fail('PRODUCT_ABSTENTION_INVENTED_GROUNDING',reviewCaseAt);
            if(review.verdict==='abstain'){
              if(!['ambiguous_subject','unsupported_task','unverified_remaining_state'].includes(review.reasonCode)||review.overlappingConcernId!=='none')fail('INVALID_PRODUCT_ABSTENTION_REASON',reviewCaseAt);
            }else if(review.verdict==='historical_overlap'){
              const overlap=originalById.get(review.overlappingConcernId),date=item.sourceFactIds.map(id=>byId.get(id)?.report_date).filter(Boolean).sort()[0];
              if(review.reasonCode!=='historical_scope_already_represented'||!overlap||!['resolved','historical'].includes(overlap.status)||!chronology.some(id=>ids(overlap).includes(id)&&byId.get(id)?.report_date>=date))fail('PRODUCT_HISTORY_WITHOUT_DATED_EXISTING_SCOPE',reviewCaseAt);
            }else fail('INVALID_PRODUCT_VERDICT',reviewCaseAt);
          }
          decisions.push({caseId:item.caseId,rawVerdict:review.verdict,effectiveVerdict,reasonCode,subjectSupport});
          if(effectiveVerdict!=='retain')abstentions.push({caseId:item.caseId,type:item.type,sourceFactIds:item.sourceFactIds,reasonCode,originalConcernId:item.originalConcernId,proposedConcernId:item.proposedConcernId});
        }
        counts.productAbstentions=abstentions.length;counts.productAdditionRemovals=additionRemovals.length;
        if(!sameObject(productReview?.decisions,decisions)||!sameObject(productReview?.abstentions,abstentions))fail('PRODUCT_DECISION_OR_ABSTENTION_TRACE_CHANGED',reviewAt);
        const accepted=new Map(decisions.map(decision=>[decision.caseId,decision])),rejectedLinks=new Set(cases.filter(item=>item.type==='attachment'&&accepted.get(item.caseId)?.effectiveVerdict!=='retain').map(item=>item.ledgerIndex+'|'+item.sourceFactId+'|'+item.componentIndex)),removedKeys=new Set(cases.filter(item=>item.type==='new_concern'&&accepted.get(item.caseId)?.effectiveVerdict!=='retain').flatMap(item=>item.additionKeys));
        const unresolved=component=>({componentLabel:component.componentLabel,aspect:component.aspect,disposition:'unresolved',reasonCode:'unverified_association',evidenceRole:'unresolved_association_for_review',targetConcernId:'none',additionKey:'none',closureSourceId:'none'}),expectedFinalLedgers=preEntailmentLedgers.map((ledger,ledgerIndex)=>({...ledger,coverage:Object.fromEntries(list(ledger.checkingSourceFactIds).map(sourceFactId=>[sourceFactId,list(ledger.coverage?.[sourceFactId]).map((component,componentIndex)=>rejectedLinks.has(ledgerIndex+'|'+sourceFactId+'|'+componentIndex)||(component.disposition==='add'&&removedKeys.has(component.additionKey))?unresolved(component):component)])),additions:list(ledger.additions).filter(addition=>!removedKeys.has(addition.key))})),expectedRemovals=fullAdded.filter(candidate=>removedKeys.has(candidate.coverageKey)).map(candidate=>({coverageKey:candidate.coverageKey,memberCandidateIndices:candidate.memberCandidateIndices,sourceFactIds:ids(candidate),reasonCode:'unverified_product_change'}));
        if(!sameObject(appliedLedgers,expectedFinalLedgers)||!sameObject(additionRemovals,expectedRemovals))fail('PRODUCT_REVIEW_CHANGED_UNAUTHORIZED_FIELDS',reviewAt);
        const productResponses=list(run?.responses).filter(response=>response.stage===stage);
        if(productResponses.length!==cases.length)fail('RAW_PRODUCT_RESPONSE_COUNT_CHANGED',reviewAt);
        else for(const [index,response] of productResponses.entries())try{
          const text=response.raw,answer=text.includes('</think>')?text.slice(text.lastIndexOf('</think>')+8):text,parsed=JSON.parse(answer.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));
          if(!sameObject(parsed,{reviews:rawReviews[index]?.reviews}))fail('RAW_PRODUCT_RESPONSE_CHANGED',reviewAt+'.rawReviews['+index+']');else counts.rawProductResponsesVerified++;
        }catch{fail('RAW_PRODUCT_RESPONSE_INVALID_JSON',reviewAt+'.rawReviews['+index+']');}
        if(productResponses.length&&list(run?.responses).slice(list(run.responses).indexOf(productResponses[0])).some(response=>response.stage!==stage))fail('PRODUCT_REVIEW_NOT_FINAL_INFERENCE_STAGE',reviewAt);
      }
      try{
        // Reproduce the documented application operations, in addition to the independent
        // source/disposition/conservation checks above. This cannot validate semantic relevance.
        const priorApplied=E.applyObligationCoverage(before,preEntailmentLedgers,{facts:inventory},rows,pre.length,{typed:typedObligationCritic});
        if(!sameObject(priorApplied.coverageAddedCandidates,fullAdded))fail('PRE_PRODUCT_ADDITION_POOL_CHANGED',at);
        if(fullAdded.length){
          const expected=[...priorApplied.items.map(item=>({...item,coverageLock:{concernId:item.concernId,scopeQuestion:item.scopeQuestion,status:item.status}})),...fullAdded],stage=reconsolidations[0];
          if(!stage||!sameObject(stage.inputCandidates,expected)||!equalSets(list(stage.preservedConcernIds),before.map(item=>item.concernId))||!sameObject(stage.concerns,preEntailmentConcerns))fail('OBLIGATION_RECONSOLIDATION_LINEAGE_CHANGED',at);
        }else if(!sameObject(priorApplied.items,preEntailmentConcerns))fail('OBLIGATION_PRE_PRODUCT_OUTPUT_CHANGED',at);
        const applied=finalProductGate?E.applyProductChangeReviews(before,preEntailmentConcerns,fullAdded,preEntailmentLedgers,list(productReview?.cases),list(productReview?.rawReviews),{facts:inventory},rows,pre.length):priorApplied;
        if(!sameObject(applied.coverageAddedCandidates,coverageAdded)||!sameObject(applied.entries,entries)||!sameObject(applied.appendOperations,audit.representedAdditions)||!sameObject(applied.latestPointerAdjustments,audit.latestPointerAdjustments))fail('OBLIGATION_APPLICATION_TRACE_CHANGED',at);
        if((finalProductGate||!fullAdded.length)&&!sameObject(applied.items,items))fail('OBLIGATION_REPRESENTED_OUTPUT_CHANGED',at);
      }catch{fail('OBLIGATION_APPLICATION_INVALID',at);}
    }
  }
  try{
    const text=C.textReport(run);counts.txtCharacters=text.length;
    if(ANNOTATIONS.some(column=>text.includes(column)))fail('ANSWER_ANNOTATION_IN_TXT','textReport');
    if(finalProductGate&&list(productReview?.abstentions).length&&(!C.reviewCaution?.(run)||!text.includes(C.reviewCaution(run))))fail('PRODUCT_ABSTENTION_NOTICE_MISSING_FROM_TXT','textReport');
    for(const [i,finding] of findings.entries()){
      const section=C.textReport({...run,findings:[finding]});
      for(const passage of list(finding.sourceFactIds).map(id=>byId.get(id)).filter(Boolean)){
        if(!text.includes('"'+passage.quote+'"')||!section.includes('"'+passage.quote+'"'))fail('SOURCE_QUOTATION_MISSING_FROM_TXT','findings['+i+']',{sourceId:passage.id});
        else counts.txtQuotedPassages++;
        for(const value of [passage.report_date,passage.report_id,passage.report_author].filter(Boolean))if(!section.includes(value))fail('SOURCE_PROVENANCE_MISSING_FROM_TXT','findings['+i+']',{sourceId:passage.id});
      }
      if(finding.scopeQuestion&&!section.includes(finding.scopeQuestion))fail('SCOPE_QUESTION_MISSING_FROM_TXT','findings['+i+']');
      if(finding.correction&&!section.includes(finding.correction))fail('REVIEWER_NOTE_MISSING_FROM_TXT','findings['+i+']');
    }
  }catch{fail('TXT_EXPORT_FAILED','textReport');}
  return {...meta,status:errors.length?'failed':'passed',ok:errors.length===0,counts,errors};
}

function auditFiles(paths){
  const results=[];
  for(const requested of paths){
    const file=path.resolve(requested);
    try{
      const parsed=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'')),runs=Array.isArray(parsed.runs)?parsed.runs:[parsed];
      for(const [index,run] of runs.entries())results.push(auditRun(run,{file:path.basename(file),index}));
    }catch(error){results.push({file:path.basename(file),status:'failed',ok:false,errors:[{code:'INPUT_READ_OR_PARSE_FAILED',type:error.name}]});}
  }
  const passed=results.filter(r=>r.status==='passed').length,failed=results.filter(r=>r.status==='failed').length,skipped=results.filter(r=>r.status==='skipped_failed_inference').length;
  return {version:VERSION,generatedAt:new Date().toISOString(),scope:'Mechanical evidence, identity, partition/accounting, materiality-verdict trace, duplicate-pointer normalization, source-obligation/critic/product-review provenance, explicit unresolved abstentions and TXT export checks only. No reference answers are read. Labels, obligation dispositions, grouping questions, proof relevance and statuses remain AI interpretations. Passing does not establish correct issue coverage, merge semantics, closure truth or model accuracy.',hashDefinition:'inputSha256 hashes JSON.stringify(DailyCore.reports(input)). Retained benchmark file hashes describe the original execution bytes; freeze canonicalUtf8LfFiles separately describes UTF-8/LF Git publication. Published LF archives need not match original Windows byte hashes. Whole-request hashes verify complete generated request objects separately; historical execution hashes are never recomputed from published transport bytes.',ok:passed>0&&failed===0,files:paths.length,passed,failed,skippedFailedInference:skipped,results};
}

if(require.main===module){
  const args=process.argv.slice(2),paths=[];let out=null;
  for(let i=0;i<args.length;i++){
    if(args[i]==='--paths')continue;
    if(args[i]==='--out'){out=args[++i];if(!out)throw Error('--out needs a path.');continue;}
    if(args[i]==='--help'||args[i]==='-h'){console.log('Usage: node demo-2/scripts/verify-consolidation.cjs [--paths] RUN.json ... [--out AUDIT.json]');process.exit(0);}
    if(args[i].startsWith('--'))throw Error('Unknown option: '+args[i]);
    paths.push(args[i]);
  }
  if(!paths.length)throw Error('Supply one or more run JSON files as positional paths or after --paths.');
  const result=auditFiles(paths),json=JSON.stringify(result,null,2)+'\n';
  if(out){fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});fs.writeFileSync(out,json);}
  process.stdout.write(json);if(!result.ok)process.exitCode=1;
}
module.exports={VERSION,auditRun,auditFiles};
