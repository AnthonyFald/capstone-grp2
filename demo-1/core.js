(function(root){
  'use strict';
  const kinds=['decision','schedule','action','question'];
  const labels={decision:'Decisions',action:'Action items',schedule:'Schedule & dependencies',question:'Open questions'};
  function lines(text){return String(text).split(/\r?\n/).map((raw,i)=>{const m=raw.match(/^\s*([^:]{1,90}):\s*(.*)$/);return {line:i+1,raw:raw.trim(),speaker:m?m[1].trim():null,text:m?m[2].trim():raw.trim()};}).filter(x=>x.raw);}
  function validateTranscript(text){if(typeof text!=='string'||text.trim().length<20) throw new Error('Add a meeting transcript with at least 20 characters.');if(text.length>24000) throw new Error('Please keep the transcript under 24,000 characters.');return text.trim();}
  function dueFrom(text){
    const m=text.match(/\b(?:by|on|due(?:\s+by)?)\s+((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,?\s+\d{4})?(?:\s+(?:morning|afternoon|evening))?(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(?:AM|PM))?|\d{4}-\d{2}-\d{2}(?:\s+(?:morning|afternoon|evening))?(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(?:AM|PM))?|(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|tomorrow|today)(?:\s+(?:morning|afternoon|evening))?(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(?:AM|PM))?)/i);
    if(m)return m[1].trim();
    const dependency=text.match(/\b(before|after)\s+[^.!?]+/i);return dependency?dependency[0].trim():null;
  }
  function ownerFrom(row){
    if(/\b(?:I will|I'll|I shall|let me)\b/i.test(row.text))return row.speaker?.replace(/\s*\([^)]*\)\s*/g,'').trim()||null;
    const m=row.text.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:will|must|needs to)\b/);return m?m[1]:null;
  }
  function extractBasic(text){
    validateTranscript(text);const items=[];
    for(const row of lines(text)){
      const t=row.text;let kind=null;
      if(/\b(?:we (?:decided|agreed)|decision:|approved (?:to|the)|it was agreed)\b/i.test(t))kind='decision';
      else if(/\b(?:I will|I'll|I shall)\b/i.test(t)||/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+(?:will|must)\b/.test(t))kind='action';
      else if(/\?|\b(?:unresolved|pending|no owner|not assigned|no approved|no confirmed|not a confirmed|needs? to confirm)\b/i.test(t))kind='question';
      if(!kind)continue;
      items.push({id:'n'+(items.length+1),kind,line:row.line,text:t,owner:kind==='action'?ownerFrom(row):null,due:kind==='action'?dueFrom(t):null,evidence:row.raw,reviewed:false,flags:[]});
    }
    return {mode:'rules',model:null,items,summary:items.length+' candidate items found using text patterns.'};
  }
  function normalizeModelOutput(raw,text){
    if(typeof raw==='string'){raw=raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');try{raw=JSON.parse(raw);}catch{throw new Error('The local model returned incomplete or invalid JSON. Try a shorter transcript or run again.');}}
    if(!raw||!Array.isArray(raw.items))throw new Error('The model response did not contain a list of meeting items.');
    if(raw.items.length>500)throw new Error('The model returned too many items. Try a shorter transcript.');
    const source=lines(text), items=[], contextual=raw.format==='meeting-notes-v2';let rejected=Number.isInteger(raw.rejected)&&raw.rejected>=0&&raw.rejected<=80?raw.rejected:0;
    for(const x of raw.items){
      if(!x||!kinds.includes(x.kind)||typeof x.text!=='string'||!x.text.trim()||!(Number.isInteger(x.line)||Array.isArray(x.lines))){rejected++;continue;}
      const citations=Array.isArray(x.lines)?[...new Set(x.lines)]:[x.line];
      if(!citations.length||citations.some(n=>!Number.isInteger(n)||!source.some(r=>r.line===n))){rejected++;continue;}
      citations.sort((a,b)=>a-b);
      const sources=citations.map(n=>({line:n,evidence:source.find(r=>r.line===n).raw}));
      const primary=Number.isInteger(x.line)?x.line:citations[0];
      if(!citations.includes(primary)){rejected++;continue;}
      const row=source.find(r=>r.line===primary);
      const clean=v=>typeof v==='string'&&v.trim()&&!/^(null|none|unknown|not specified|not assigned)$/i.test(v.trim())?v.trim().slice(0,180):null;
      let owner=clean(x.owner),due=clean(x.due);const flags=[];
      const singleCommitment=(row.text.match(/\b(?:will|must|I'll)\b/gi)||[]).length===1;
      if(!contextual&&x.kind==='action'&&singleCommitment&&!owner){owner=ownerFrom(row);if(owner)flags.push('Owner filled from an explicit commitment in the source. Verify it.');}
      if(!contextual&&x.kind==='action'&&singleCommitment&&!due){due=dueFrom(row.text);if(due)flags.push('Deadline filled from the source wording. Verify it.');}
      const support=sources.map(r=>r.evidence).join(' ').toLowerCase().replace(/\s+/g,' ');
      if(owner&&!support.includes(owner.toLowerCase().replace(/\s+/g,' '))){flags.push('Unsupported owner removed. Check the source.');owner=null;}
      // An omitted article does not change a deadline: "end of day today"
      // and "end of the day today" refer to the same stated time. Do not
      // discard that time or infer a different date from other source lines.
      const deadlineWords=value=>value.toLowerCase().replace(/\bthe\b/g,'').replace(/\s+/g,' ').trim();
      if(due&&(!deadlineWords(due)||!deadlineWords(support).includes(deadlineWords(due)))){
        // Keep only a stated relative prefix when the model appends an inferred
        // calendar date. Never fill a null deadline or restore a prior date.
        const relative=due.split(',')[0].trim();
        if(contextual&&relative!==due&&/\b(?:today|tomorrow|this week|next week)\b/i.test(relative)&&support.includes(relative.toLowerCase())){due=relative;flags.push('Unstated calendar date removed; retained the stated relative deadline.');}
        else {flags.push('Unsupported deadline removed. Check the source.');due=null;}
      }
      if(contextual&&due&&(/^(?:once|when)\b/i.test(due)||/\[\d{1,2}:\d{2}/.test(due))){due=null;flags.push('No fixed deadline supplied; check the timing condition in the note.');}
      // Contextual extraction has already read later corrections. Do not restore
      // an earlier owner or deadline with a single-line pattern match.
      let noteText=x.text.trim().slice(0,1200);
      if(contextual&&x.kind==='action'&&owner&&/\byou\b/i.test(row.text)&&!/\bmyself\b/i.test(row.text)){
        const bare=value=>value.replace(/\s*\([^)]*\)\s*/g,'').trim();
        if(row.speaker&&bare(row.speaker).toLowerCase()===bare(owner).toLowerCase()){
          const escaped=bare(owner).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
          const selfRecipient=new RegExp('^(Email|Call|Contact|Notify)\\s+'+escaped+'(?:\\s*\\([^)]*\\))?(?=\\s|[.,;]|$)','i');
          const corrected=noteText.replace(selfRecipient,'$1');
          if(corrected!==noteText){noteText=corrected;flags.push('Inferred self-recipient removed. Verify the recipient against the source.');}
        }
      }
      if(x.kind!=='action'){owner=null;due=null;}
      items.push({id:'n'+(items.length+1),kind:x.kind,line:primary,lines:citations,text:noteText,owner,due,sources,evidence:sources.map(r=>'['+r.line+'] '+r.evidence).join('\n'),reviewed:false,flags,status:x.status||null});
      // Keep the original single-source format for older results and the rules baseline.
      if(citations.length===1)items[items.length-1].evidence=sources[0].evidence;
    }
    if(raw.items.length&&items.length===0)throw new Error('None of the model items had valid source lines. Try again with a shorter transcript.');
    return {mode:'ai',model:'Local browser model',pipeline:raw.pipeline||'legacy-line-classification',verification:raw.verification||null,items,rejected,summary:items.length+' candidate items generated by local AI.'};
  }
  function compare(items,reference){
    const matches=reference.map(ref=>({reference:ref,candidates:items.filter(i=>i.kind===ref.kind&&(i.lines||[i.line]).includes(ref.line))}));
    return {matches,found:matches.filter(x=>x.candidates.length).length,total:reference.length,unmatched:items.filter(i=>!reference.some(r=>r.kind===i.kind&&(i.lines||[i.line]).includes(r.line)))};
  }
  function processingBudget(audioMs=0){return Math.max(0,300000-(Number.isFinite(audioMs)?Math.max(0,audioMs):0));}
  function timing(manualSeconds,reviewSeconds,processingMs){
    if(!Number.isFinite(manualSeconds)||manualSeconds<=0||!Number.isFinite(reviewSeconds)||reviewSeconds<0)return null;
    const assisted=reviewSeconds+processingMs/1000;return {assisted,savings:(manualSeconds-assisted)/manualSeconds*100};
  }
  function exportMarkdown(result,title){
    let out='# '+title+'\n\nMethod: '+(result.mode==='ai'?'Local AI — '+result.model:'Basic extraction — rules, not AI')+'\nProcessing time: '+(result.elapsedMs/1000).toFixed(2)+' seconds.\nAll items require human verification.\n\n';
    for(const kind of kinds){out+='## '+labels[kind]+'\n\n';const items=result.items.filter(x=>x.kind===kind);if(!items.length)out+='None extracted.\n\n';for(const i of items){out+='- ['+(i.reviewed?'x':' ')+'] '+i.text.replace(/\n/g,' ')+'\n';if(kind==='schedule'&&i.status==='tentative')out+='  - Status: Tentative; check the stated conditions.\n';if(kind==='action')out+='  - Owner: '+(i.owner||'Not specified')+'\n  - Due: '+(i.due||'Not specified')+'\n';for(const ref of sourceReferences(i))out+='  - Source line '+ref.line+': '+ref.evidence.replace(/\n/g,' ')+'\n';}out+='\n';}return out;
  }
  function sourceReferences(item){return item.sources||[{line:item.line,evidence:item.evidence}];}
  function sourceLabel(item){const refs=sourceReferences(item);return (refs.length===1?'line ':'lines ')+refs.map(r=>r.line).join(', ');}
  function formatDuration(milliseconds){
    const seconds=Math.max(0,Number(milliseconds)||0)/1000;
    if(seconds<.1)return '< 0.1s';
    if(seconds<60)return seconds.toFixed(1)+'s';
    const total=Math.round(seconds);
    return Math.floor(total/60)+'m '+String(total%60).padStart(2,'0')+'s';
  }
  function exportPlainText(result,title='Meeting notes'){
    const out=[],oneLine=value=>String(value??'').replace(/\s+/g,' ').trim();
    function write(text,prefix='',indent=prefix){
      let line=prefix;
      for(const word of oneLine(text).split(' ')){
        if(line.length>prefix.length&&line.length+word.length+1>80){out.push(line);line=indent;}
        line+=(line===prefix||line===indent?'':' ')+word;
      }
      out.push(line);
    }
    function section(name){out.push(name,'-'.repeat(name.length),'');}
    out.push('MEETING NOTES','='.repeat(80),'');
    write('Title: '+title);
    if(result.createdAt)write('Notes generated: '+result.createdAt);
    write('Method: '+(result.mode==='ai'?'Local AI - '+result.model:'Basic extraction - rules, not AI'));
    if(result.pipeline)write('Notes pipeline: '+result.pipeline);
    if(result.verification)write('Automatic check: '+result.verification);
    if(Number.isFinite(result.elapsedMs))write('Note processing time: '+(result.elapsedMs/1000).toFixed(2)+' seconds');
    if(Number.isFinite(result.totalElapsedMs))write('Total note generation completed in: '+formatDuration(result.totalElapsedMs));
    if(result.audioProcessingMs>0)write('Audio + note processing: '+formatDuration(result.combinedProcessingMs)+' (model setup excluded when measured separately)');
    if(result.modelLoadMs>100)write('Included AI model setup: '+formatDuration(result.modelLoadMs));
    write('Reviewed against source: '+result.items.filter(i=>i.reviewed).length+' of '+result.items.length+' items');
    out.push('');write('These notes include your saved corrections. Items marked Pending need human review. Check owners, deadlines and conditions against the source.');out.push('');
    for(const kind of kinds){
      const items=result.items.filter(i=>i.kind===kind);section(labels[kind].toUpperCase());
      if(!items.length){write('None extracted. Check the transcript for omissions.');out.push('');}
      items.forEach((item,index)=>{
        write(item.text,(index+1)+'. ','   ');
        if(kind==='action'){
          write('Owner: '+(oneLine(item.owner)||'Not specified'),'   ');
          write('Deadline: '+(oneLine(item.due)||'Not specified'),'   ');
        }
        if(kind==='schedule'&&item.status==='tentative')write('Status: Tentative; check the stated conditions.','   ');
        write('Review: '+(item.reviewed?'Reviewed against source':'Pending'),'   ');
        write('Source: transcript '+sourceLabel(item),'   ');
        for(const flag of item.flags||[])write('Review note: '+flag,'   ');
        out.push('');
      });
    }
    section('SOURCE REFERENCES');
    const sources=new Map(result.items.flatMap(item=>sourceReferences(item).map(ref=>[ref.line,ref.evidence])));
    if(!sources.size)write('No source references exported.');
    for(const [line,evidence] of sources){write('Transcript line '+line+':');write(evidence,'  ');out.push('');}
    return out.join('\r\n').trimEnd()+'\r\n';
  }
  const api={kinds,labels,lines,validateTranscript,extractBasic,normalizeModelOutput,compare,timing,exportMarkdown,exportPlainText,formatDuration,sourceReferences,sourceLabel,processingBudget};
  root.MeetingCore=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
