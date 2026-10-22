(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DailyCore=api;})(typeof self==='object'?self:globalThis,()=>{
  'use strict';
  const VERSION='daily-reports-v18';
  const FIELDS=['report_id','report_date','report_author','work_area','shift','weather','crew_count','work_planned','work_completed','materials_equipment','issue_or_update','schedule_status','rfi_change_order_refs','action_required','responsible_party','due_date','quantity_or_measurement','supporting_evidence'];
  const STATUSES=['open','resolved','historical','needs_verification'];
  const clean=v=>v==null?'':String(v).trim();
  function reports(input){
    const rows=Array.isArray(input)?input:input?.reports;
    if(!Array.isArray(rows)||!rows.length||rows.length>30)throw Error('Use 1–30 daily reports per run.');
    const ids=new Set();
    const result=rows.map(row=>{
      const r=Object.fromEntries(FIELDS.map(k=>[k,clean(row[k])]));
      if(!/^[A-Za-z0-9_-]{1,40}$/.test(r.report_id)||ids.has(r.report_id))throw Error('Each report needs a unique report_id (letters, numbers, dash or underscore).');
      ids.add(r.report_id);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(r.report_date)||!Number.isFinite(Date.parse(r.report_date))||new Date(r.report_date).toISOString().slice(0,10)!==r.report_date)throw Error('Each report needs a valid report_date in YYYY-MM-DD format.');
      if(!r.issue_or_update&&!r.work_completed)throw Error('Each report needs work_completed or issue_or_update.');
      if(Object.values(r).some(v=>v.length>5000))throw Error('A report field exceeds 5,000 characters.');
      return r;
    }).sort((a,b)=>a.report_date.localeCompare(b.report_date)||a.report_id.localeCompare(b.report_id));
    if(JSON.stringify(result).length>42000)throw Error('This batch is too long. Split it into smaller chronological batches.');
    return result;
  }
  function parseCSV(text){
    const rows=[];let row=[],field='',quoted=false;
    text=String(text).replace(/^\uFEFF/,'');
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else if(!quoted&&field)throw Error('Invalid quote in CSV.');else quoted=!quoted;}
      else if(c===','&&!quoted){row.push(field);field='';}
      else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(v=>v.trim()))rows.push(row);row=[];field='';}
      else field+=c;
    }
    if(quoted)throw Error('CSV has an unclosed quoted field.');
    row.push(field);if(row.some(v=>v.trim()))rows.push(row);
    const header=rows.shift()?.map(x=>x.trim());
    if(!header?.includes('report_id')||!header.includes('report_date')||new Set(header).size!==header.length)throw Error('CSV needs unique column headings including report_id and report_date.');
    return reports(rows.map(r=>{if(r.length!==header.length)throw Error('CSV row has a different number of columns from its header.');return Object.fromEntries(header.map((k,i)=>[k,r[i]]));}));
  }
  function parseInput(text){if(text.length>150000)throw Error('Input is too large. Use a smaller batch.');return /^[\s]*[\[{]/.test(text)?reports(JSON.parse(text)):parseCSV(text);}
  function validate(value,rows){
    if(!value||!Array.isArray(value.findings)||value.findings.length>24)throw Error('Model did not return a valid findings list.');
    const issues=value.findings.map((f,i)=>{
      if(!f||!STATUSES.includes(f.status)||!['delay','conflict','unresolved','communication','update'].includes(f.category))throw Error('Model returned an invalid status or category.');
      for(const k of ['title','observation','consequence','action','uncertainty'])if(typeof f[k]!=='string'||f[k].length>(k==='observation'?100000:1600)||!f[k].trim())throw Error('Model returned an incomplete finding.');
      if(!Array.isArray(f.evidence)||!f.evidence.length||f.evidence.length>512)throw Error('Every finding needs source evidence.');
      const evidence=f.evidence.map(e=>{
        const source=rows.find(r=>r.report_id===e.report_id);
        if(!source||!FIELDS.includes(e.field)||!source[e.field]||(e.quote!==undefined&&(typeof e.quote!=='string'||!e.quote.trim().length||!source[e.field].includes(e.quote))))throw Error('An evidence quote does not match its source. No unverified result was accepted.');
        return {report_id:e.report_id,field:e.field,quote:e.quote??source[e.field]};
      });
      for(const k of ['owner','due'])if(f[k]!==null&&(typeof f[k]!=='string'||f[k].length>220))throw Error('Invalid owner or deadline.');
      const cited=rows.filter(r=>evidence.some(e=>e.report_id===r.report_id));
      const exact=s=>clean(s).replace(/\s+/g,' ').toLowerCase();
      const assigned=cited.filter(r=>r.action_required&&exact(r.action_required)===exact(f.action));
      const withheldFields=Array.isArray(f.withheldFields)?f.withheldFields.filter(k=>['owner','due'].includes(k)):[];
      const owner=f.owner!==null&&f.owner.split(/\s*[/;,]\s*/).every(part=>part&&assigned.some(r=>r.responsible_party.split(/\s*[/;,]\s*/).includes(part)))?f.owner:null;
      const due=f.due!==null&&assigned.some(r=>r.due_date===f.due)?f.due:null;
      if(f.owner!==null&&owner===null)withheldFields.push('owner');
      if(f.due!==null&&due===null)withheldFields.push('due');
      return {id:'F'+(i+1),...Object.fromEntries(['title','category','status','observation','consequence','action','uncertainty'].map(k=>[k,f[k]])),owner,due,withheldFields:[...new Set(withheldFields)],evidence,review:'pending',correction:''};
    });
    return {findings:issues};
  }
  function baseline(rows){
    return {findings:rows.filter(r=>/pending|unclear|not confirmed|no written|not attached|postponed|not.*received|no formal|does not|not.*transmitted/i.test(r.issue_or_update+' '+r.schedule_status)).map((r,i)=>({id:'F'+(i+1),title:'Keyword alert · '+r.report_id,category:'unresolved',status:'needs_verification',observation:r.issue_or_update,consequence:'Not assessed by this keyword baseline.',action:r.action_required||'Review this report.',owner:r.responsible_party||null,due:r.due_date||null,uncertainty:'Rules do not reconcile later updates or distinguish negation. This alert may be a false alarm.',evidence:[{report_id:r.report_id,field:'issue_or_update',quote:r.issue_or_update}],review:'pending',correction:''}))};
  }
  function score(issues,judgments,findings,assessments){
    const complete=issues.every(i=>{const j=judgments[i.issue_id],ids=j?.findingIds||[j?.findingId].filter(Boolean);return ['found','partial','missed'].includes(j?.rating)&&(j.rating!=='found'||Array.isArray(ids)&&ids.length>0&&ids.every(id=>findings.some(f=>f.id===id)&&assessments[id]==='supported'));})&&findings.every(f=>['supported','unsupported','duplicate'].includes(assessments[f.id]));
    const tp=issues.filter(i=>judgments[i.issue_id]?.rating==='found').length,fp=findings.filter(f=>assessments[f.id]==='unsupported').length;
    const supported=findings.filter(f=>assessments[f.id]==='supported').length,duplicates=findings.filter(f=>assessments[f.id]==='duplicate').length;
    return {complete,tp,fn:issues.length-tp,fp,duplicates,recall:complete&&issues.length?tp/issues.length:null,precision:complete&&supported+fp? supported/(supported+fp):null,partial_policy:'Partial findings count as missed. Precision uses unique supported/unsupported output findings; recall uses reference issues.'};
  }
  const reduction=(baseline,assisted)=>Number.isFinite(baseline)&&baseline>0&&Number.isFinite(assisted)&&assisted>=0?(baseline-assisted)/baseline:null;
  function csv(rows){if(!rows.length)return '';const keys=Object.keys(rows[0]);const cell=v=>{let text=String(v??'');if(/^\s*[=+@-]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};return [keys,...rows.map(r=>keys.map(k=>r[k]))].map(r=>r.map(cell).join(',')).join('\r\n');}
  const reviewCaution=run=>Array.isArray(run?.sourceObligationAudit?.finalProductReview?.abstentions)&&run.sourceObligationAudit.finalProductReview.abstentions.length?'Some proposed additions could not be verified. Review the complete reports; details are in the full record.':'';
  function textReport(run){
    if(!run||!Array.isArray(run.findings))throw Error('Analyze reports before downloading a text review.');
    const findings=run.findings,rows=Array.isArray(run.reports)?run.reports:[],byReport=new Map(rows.map(r=>[r.report_id,r]));
    const inventory=new Map((run.sourceInventory||[]).map(p=>[p.id,p]));
    const statuses={open:'Open',needs_verification:'Needs checking',resolved:'Resolved for this concern',historical:'Earlier issue; disruption ended'};
    const decisions={pending:'Not reviewed',accepted:'Keep',corrected:'Corrected / see reviewer note',rejected:'Rejected'};
    const lines=['DAILY REPORT REVIEW','===================',''];
    if(rows.length){lines.push('Reports: '+rows.length);const dates=rows.map(r=>r.report_date).filter(Boolean).sort();if(dates.length)lines.push('Period: '+dates[0]+' to '+dates.at(-1));}
    if(run.createdAt)lines.push('Review generated: '+run.createdAt);
    lines.push('Findings: '+findings.length,'Not yet reviewed: '+findings.filter(f=>!f.review||f.review==='pending').length,'','Suggested status applies to the review question below. Read the cited source before deciding.','Reviewer notes are kept separate from original report text. Rejected findings remain labelled in this record.','');
    if(reviewCaution(run))lines.push(reviewCaution(run),'');
    if(!findings.length)lines.push('No review findings were returned. This does not establish that the reports contain no issues.','');
    findings.forEach((f,index)=>{
      const heading=clean(f.scopeTitle)||(clean(f.scopeQuestion)?'Review question: '+clean(f.scopeQuestion):'')||clean(f.title)||'Reported concern';
      lines.push((index+1)+'. '+heading,'-'.repeat(Math.min(96,heading.length+3)),'Suggested status: '+(statuses[f.status]||clean(f.status)),'Your decision: '+(decisions[f.review||'pending']||clean(f.review)));
      if(f.concernId||f.id)lines.push('Issue reference: '+(f.concernId||f.id));
      if(f.owner)lines.push('Owner stated in the source: '+f.owner);
      if(f.due)lines.push('Due stated in the source: '+f.due);
      if(f.correction)lines.push('Reviewer note: '+f.correction);
      lines.push('','Source timeline:');
      let passages=(f.sourceFactIds||[]).map(id=>inventory.get(id)).filter(Boolean);
      if(!passages.length||passages.length!==(f.sourceFactIds||[]).length)passages=(f.evidence||[]).map((e,index)=>({...e,id:(f.sourceFactIds||[]).length===f.evidence.length?f.sourceFactIds[index]:undefined,report_date:byReport.get(e.report_id)?.report_date||'',report_author:byReport.get(e.report_id)?.report_author||''}));
      const latest=new Set(f.latestFactIds||[]),required=new Set((f.coverageRequirements||[]).map(p=>JSON.stringify([p.report_id,p.field,p.quote]))),seen=new Set();let priorReport=null;
      for(const p of passages){
        const key=JSON.stringify([p.report_id,p.field,p.quote]);if(seen.has(key))continue;seen.add(key);
        if(priorReport!==p.report_id){if(priorReport!==null)lines.push('');lines.push([p.report_date,p.report_id,p.report_author].filter(Boolean).join(' / '));priorReport=p.report_id;}
        lines.push('  '+(required.has(key)?'Reported requirement: ':latest.has(p.id)?'Latest cited update: ':'')+'"'+p.quote+'"');
      }
      if(!passages.length&&f.observation)lines.push(f.observation);
      lines.push('','');
    });
    lines.push('RECORD DETAILS','--------------');
    if(run.model)lines.push('Model: '+run.model);
    if(run.pipeline)lines.push('Review version: '+run.pipeline);
    if(Number.isFinite(run.elapsedMs))lines.push('Processing time: '+(run.elapsedMs/1000).toFixed(1)+' seconds');
    if(run.runId)lines.push('Run reference: '+run.runId);
    lines.push('Source quotations and reviewer notes are not independent verification of reported completion.','');
    return lines.join('\r\n');
  }
  return {VERSION,FIELDS,STATUSES,reports,parseCSV,parseInput,validate,baseline,score,reduction,csv,textReport,reviewCaution};
});
