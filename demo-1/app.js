(() => {
  'use strict';
  const $=id=>document.getElementById(id), core=MeetingCore, scenarios=DEMO_SCENARIOS;
  let result=null,worker=null,ready=false,busy=false,timeout=null,runStart=0,runTranscript='',modelName='',referenceId=null,loadTicket=0,runAudioMs=0,generationTicker=null;
  let scores={},measurements={manual:'',review:''},retryTimer=null,loading=false,generateAfterLoad=false,queuedNoteStart=null,runTotalStart=0;
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
  function updateGenerationElapsed(){const seconds=Math.max(0,Math.floor((performance.now()-runStart)/1000));$('generation-elapsed').textContent='Note generation elapsed: '+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');}
  function stopGenerationClock(){if(generationTicker!==null){updateGenerationElapsed();clearInterval(generationTicker);generationTicker=null;}}
  function startGenerationClock(){stopGenerationClock();$('generation-elapsed').hidden=false;updateGenerationElapsed();generationTicker=setInterval(updateGenerationElapsed,1000);}
  function updateCount(){$('word-count').textContent=($('transcript').value.trim().match(/\S+/g)||[]).length+' words';}
  function setBusy(value){busy=value;for(const id of ['generate','load-model','mode','scenario','upload-button','transcript'])$(id).disabled=value;$('cancel').hidden=!value;if(value)$('generation-elapsed').hidden=true;else{clearTimeout(timeout);stopGenerationClock();}}
  function resetResult(){$('generation-elapsed').hidden=true;result=null;scores={};measurements={manual:'',review:''};$('empty').hidden=false;$('results').hidden=true;$('run-label').textContent='Ready when you are';renderEvaluation();}
  function loadScenario(){if($('transcript').dataset)delete $('transcript').dataset.audioProcessingMs;const s=scenarios[$('scenario').value];$('transcript').value=s?s.transcript:'';resetResult();updateCount();status(s?'Synthetic meeting loaded. Choose a processing method.':'Paste a transcript or upload a plain text file.');}
  function setMode(){const ai=$('mode').value==='ai';$('ai-info').hidden=!ai;$('rules-info').hidden=ai;$('generate').textContent=ai?(ready?'Generate AI meeting notes →':'Load AI & generate notes →'):'Extract notes with rules →';status(ai?(ready?'Free local AI is ready.':'Click Load AI & generate notes to start.'):'Basic extraction works instantly and offline. It is not AI.');}
  function tabs(view){$('notes-view').hidden=view!=='notes';$('evaluation-view').hidden=view!=='evaluation';for(const name of ['notes','evaluation']){const active=name===view;$(name+'-tab').classList.toggle('active',active);$(name+'-tab').setAttribute('aria-selected',String(active));}}
  function stopWorker(message,error=false){
    loadTicket++;clearTimeout(retryTimer);if(worker)worker.terminate();worker=null;ready=false;loading=false;generateAfterLoad=false;queuedNoteStart=null;
    clearTimeout(timeout);setBusy(false);$('load-model').textContent=error?'Retry AI model download':'Load free AI model';$('load-model').disabled=false;
    $('model-progress').hidden=true;$('model-status').textContent=error?message:'Model not loaded.';setMode();status(message,error);
  }
  async function loadModel(options={}){
    if(busy)return;
    if(ready){if(options.generateAfterLoad)generate();else status('The local AI model is already loaded.');return;}
    if(location.protocol==='file:'){status('For local AI, open Start Demo.cmd from the project folder. Direct file opening supports only Basic extraction.',true);return;}
    if(!window.isSecureContext||!navigator.gpu){status('This browser does not offer WebGPU. Open the local demo in current Chrome or Edge with hardware acceleration, or use Basic extraction.',true);return;}
    const ticket=++loadTicket;
    generateAfterLoad=!!options.generateAfterLoad;queuedNoteStart=generateAfterLoad?performance.now():null;loading=true;
    setBusy(true);$('model-progress').hidden=false;$('model-progress').removeAttribute('value');$('model-status').textContent='Preparing the free AI model…';
    status(generateAfterLoad?'Loading AI, then generating your notes automatically.':'Checking your computer, then downloading the free model.');
    timeout=setTimeout(()=>stopWorker('Model loading took too long. Check the connection and retry. Successfully saved files can be reused; your transcript is still here.',true),15*60*1000);
    function startWorker(attempt){
      if(ticket!==loadTicket)return;
      const current=new Worker('ai-worker.js?v=notes-4',{type:'module'});worker=current;
      function failed(message,retryable){
        if(ticket!==loadTicket||worker!==current)return;
        if(loading&&retryable&&attempt<3){
          current.terminate();worker=null;
          $('model-status').textContent='Download interrupted. Resuming saved files (attempt '+(attempt+1)+' of 3)…';
          $('model-progress').removeAttribute('value');
          retryTimer=setTimeout(()=>{try{startWorker(attempt+1);}catch(error){if(ticket===loadTicket)stopWorker(ModelDownload.explain(error),true);}},1500*attempt);return;
        }
        console.warn('Local model failure:',message);
        stopWorker(ModelDownload.explain(message),true);
      }
      current.onerror=event=>failed(event.message||'The AI worker could not start.',ModelDownload.retryable(event.message));
      current.onmessage=({data})=>{
        if(ticket!==loadTicket||worker!==current)return;
        if(data.type==='progress'){$('model-status').textContent=data.text;$('model-progress').value=Math.max(0,Math.min(1,data.progress||0));}
        if(data.type==='download-status')$('model-status').textContent=data.text;
        if(data.type==='generation-progress')status(data.text);
        if(data.type==='ready'){
          ready=true;loading=false;setBusy(false);$('model-progress').hidden=true;$('model-status').textContent='Qwen 3.5 9B is loaded. All text processing stays on this computer.';
          $('load-model').textContent='AI model ready';$('load-model').disabled=true;setMode();
          const queued=generateAfterLoad;generateAfterLoad=false;if(queued)generate();else status('Ready. Generate notes to run the real local AI model.');
        }
        if(data.type==='result'){
          try{const parsed=core.normalizeModelOutput(data.content,runTranscript);parsed.model=modelName;finish(parsed);}catch(e){status(e.message,true);}finally{setBusy(false);if(ready)$('load-model').disabled=true;}
        }
        if(data.type==='error')failed(data.message,data.phase==='load'&&data.retryable);
      };
      current.postMessage({type:'load',model:modelName});
    }
    try{
      const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(ticket!==loadTicket)return;
      if(!adapter)throw new Error('No compatible graphics adapter was found. Try Chrome or Edge with hardware acceleration, or use Basic extraction.');
      modelName=adapter.features.has('shader-f16')?'Qwen3.5-9B-q4f16_1-MLC':'Qwen3.5-9B-q4f32_1-MLC';
      startWorker(1);
    }catch(e){if(ticket===loadTicket)stopWorker(ModelDownload.explain(e),true);}
  }
  function finish(data){
    const completed=performance.now();
    result={...data,audioProcessingMs:runAudioMs,combinedProcessingMs:runAudioMs+completed-runStart,elapsedMs:completed-runStart,totalElapsedMs:completed-runTotalStart,modelLoadMs:Math.max(0,runStart-runTotalStart),createdAt:new Date().toISOString(),transcript:runTranscript,scenarioId:referenceId,originalItems:JSON.parse(JSON.stringify(data.items))};
    scores={};measurements={manual:'',review:''};$('empty').hidden=true;$('results').hidden=false;$('run-label').textContent=data.mode==='ai'?'LOCAL AI':'RULES · NOT AI';$('summary').textContent=data.summary;$('elapsed').textContent='Notes completed in '+core.formatDuration(result.totalElapsedMs)+(result.modelLoadMs>100?' (model setup: '+core.formatDuration(result.modelLoadMs)+'; processing: '+core.formatDuration(result.elapsedMs)+')':'');
    if(result.audioProcessingMs>0)$('elapsed').textContent+=' · Audio + notes processing: '+core.formatDuration(result.combinedProcessingMs);
    renderNotes();renderEvaluation();tabs('notes');status(data.items.length?'Notes generated. Review the source for each item.'+(data.rejected?' '+data.rejected+' invalid model items were rejected.':''):'No items extracted. Review the transcript manually; this does not mean there are no action items.');
  }
  async function generate(){
    if(busy)return;
    try{
      const text=core.validateTranscript($('transcript').value);
      runAudioMs=Math.max(0,Number($('transcript').dataset?.audioProcessingMs)||0);
      if($('mode').value==='ai'&&!ready){await loadModel({generateAfterLoad:true});return;}
      runTranscript=text;referenceId=Object.keys(scenarios).find(id=>scenarios[id].transcript===text)||null;runTotalStart=queuedNoteStart??performance.now();queuedNoteStart=null;runStart=performance.now();setBusy(true);
      if($('mode').value==='rules'){finish(core.extractBasic(text));setBusy(false);return;}
      status('Local AI is checking the meeting and writing your notes. Keep this tab open.');
      startGenerationClock();
      worker.postMessage({type:'generate',transcript:text.split(/\r?\n/).map((line,i)=>'['+(i+1)+'] '+line).join('\n')});
    }catch(e){setBusy(false);status(e.message,true);}
  }
  function renderNotes(){
    if(!result)return;
    $('notes-list').innerHTML=core.kinds.map(kind=>{const group=result.items.filter(i=>i.kind===kind);return '<section><div class="section-heading"><h3>'+core.labels[kind]+'</h3><span class="count">'+group.length+'</span></div>'+(!group.length?'<p class="muted">None extracted.</p>':group.map(i=>'<article class="note '+(i.reviewed?'reviewed':'')+'" data-id="'+i.id+'"><p class="note-text">'+escape(i.text)+'</p>'+(kind==='schedule'&&i.status==='tentative'?'<p class="muted">Tentative schedule · check the stated conditions</p>':'')+(kind==='action'?'<div class="note-meta"><span>Owner <strong>'+escape(i.owner||'Not specified')+'</strong></span><span>Due <strong>'+escape(i.due||'Not specified')+'</strong></span></div>':'')+(i.flags.length?'<p class="warning">'+i.flags.map(escape).join(' ')+'</p>':'')+'<details class="source"><summary>View source · '+escape(core.sourceLabel(i))+'</summary><blockquote>'+escape(i.evidence)+'</blockquote></details><div class="note-actions"><label><input type="checkbox" data-review="'+i.id+'" '+(i.reviewed?'checked':'')+'>Reviewed against source</label><button class="text-button" data-edit="'+i.id+'">Edit</button><button class="text-button" data-remove="'+i.id+'">Remove</button></div></article>').join(''))+'</section>';}).join('');
    $('review-count').textContent=result.items.filter(i=>i.reviewed).length+' of '+result.items.length+' reviewed';
  }
  function editItem(id){
    const item=result.items.find(x=>x.id===id),node=document.querySelector('[data-id="'+id+'"]');if(!item||!node)return;
    const fields=document.createElement('div');fields.className='edit-fields';fields.innerHTML='<label>Category<select data-field="kind">'+core.kinds.map(kind=>'<option value="'+kind+'" '+(item.kind===kind?'selected':'')+'>'+core.labels[kind]+'</option>').join('')+'</select></label><label>Schedule status (schedules only)<select data-field="schedule-status"><option value="active">Confirmed plan</option><option value="tentative" '+(item.status==='tentative'?'selected':'')+'>Tentative / awaiting confirmation</option></select></label><label>Note<textarea data-field="text" rows="3">'+escape(item.text)+'</textarea></label><label>Owner (actions only)<input data-field="owner" value="'+escape(item.owner||'')+'"></label><label>Deadline (actions only; blank if not stated)<input data-field="due" value="'+escape(item.due||'')+'"></label><button class="button secondary">Save correction</button>';
    fields.querySelector('button').onclick=()=>{const text=fields.querySelector('[data-field="text"]').value.trim();if(!text){status('The note cannot be empty.',true);return;}item.text=text;item.kind=fields.querySelector('[data-field="kind"]').value;for(const key of ['owner','due']){const input=fields.querySelector('[data-field="'+key+'"]');item[key]=item.kind==='action'?(input.value.trim()||null):null;}item.status=item.kind==='schedule'?fields.querySelector('[data-field="schedule-status"]').value:null;item.reviewed=false;item.edited=true;renderNotes();status('Correction saved. The reference comparison still uses the original output.');};
    node.querySelector('[data-edit]').disabled=true;node.append(fields);fields.querySelector('textarea').focus();
  }
  function renderEvaluation(){
    const el=$('evaluation-content');
    if(!result){el.innerHTML='<h3>Compare a run with the reference notes.</h3><p class="muted">Generate notes from a sample first. The comparison records what was captured, what was missed, and how much review was needed.</p>';return;}
    if(!result.scenarioId){el.innerHTML='<h3>No reference checklist for this transcript.</h3><p>Create independent reference notes before evaluating a custom meeting. The supplied checklists apply only to the exact sample transcripts.</p>';return;}
    const reference=scenarios[result.scenarioId].reference,comparison=core.compare(result.originalItems,reference);
    const scored=Object.values(scores).filter(x=>x).length,correct=Object.values(scores).filter(x=>x==='correct').length;
    el.innerHTML='<h3>Review the original output</h3><p class="muted">Source-line matches are suggestions, not accuracy scores. Judge each reference item against the original result below. Check wording, owner, deadline, and whether the issue is still open. Corrections made in the notes tab do not change this record.</p><div class="metrics"><div class="metric"><strong>'+reference.length+'</strong><span>Reference items</span></div><div class="metric"><strong>'+comparison.found+'</strong><span>Source / category matches</span></div><div class="metric"><strong>'+correct+'/'+scored+'</strong><span>Scored correct / scored</span></div></div>'+comparison.matches.map((m,i)=>'<div class="reference-row"><strong>'+escape(m.reference.text)+'</strong><span>Line '+m.reference.line+' · '+core.labels[m.reference.kind]+(m.reference.owner?' · '+escape(m.reference.owner):'')+(m.reference.due?' · '+escape(m.reference.due):'')+'</span><p class="'+(m.candidates.length?'found-label':'missing-label')+'">'+(m.candidates.length?'Original candidate: '+m.candidates.map(c=>escape(c.text)+(c.kind==='action'?' [Owner: '+escape(c.owner||'Not specified')+'; Due: '+escape(c.due||'Not specified')+']':'')).join(' / '):'No candidate matched this source line and category. Check other output before marking it missed.')+'</p><label for="score-'+i+'">Reviewer judgment</label><select id="score-'+i+'" data-score="'+i+'"><option value="">Not scored</option><option value="correct" '+(scores[i]==='correct'?'selected':'')+'>Captured correctly</option><option value="missed" '+(scores[i]==='missed'?'selected':'')+'>Missed</option><option value="incorrect" '+(scores[i]==='incorrect'?'selected':'')+'>Incorrect or incomplete</option></select></div>').join('')+(comparison.unmatched.length?'<h3>Additional candidates to check</h3><p>These may be valid extra details or unsupported output. Review them separately.</p>'+comparison.unmatched.map(i=>'<p>Line '+i.line+': '+escape(i.text)+'</p>').join(''):'')+'<h3>Compare preparation time</h3><p class="muted">Enter measured times. Assisted time includes model processing plus human review; model download time is shown separately by the setup flow and is not included here.</p><div class="timing"><label>Manual note preparation (seconds)<input id="manual-time" type="number" min="1" step="1" value="'+escape(measurements.manual)+'" placeholder="Measured time"></label><label>Review and correction (seconds)<input id="review-time" type="number" min="0" step="1" value="'+escape(measurements.review)+'" placeholder="Measured time"></label></div><p id="timing-result" class="muted"></p><p class="muted">Demo 1 targets: 25% less note-preparation time and 20% fewer missed details, without more incorrect details. No result is assumed. Basic-mode results do not test the AI hypothesis.</p>';
    updateTiming();
  }
  function updateTiming(){if(!$('timing-result'))return;const measured=measurements.manual!==''&&measurements.review!==''?core.timing(Number(measurements.manual),Number(measurements.review),result.elapsedMs):null;$('timing-result').textContent=measured?'Assisted preparation: '+measured.assisted.toFixed(1)+' seconds. '+Math.abs(measured.savings).toFixed(1)+'% '+(measured.savings>=0?'less':'more')+' time than your manual measurement.':'Enter both measured times to calculate a comparison.';}
  function download(name,content,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  $('scenario').onchange=loadScenario;$('mode').onchange=setMode;$('load-model').onclick=loadModel;$('generate').onclick=generate;$('cancel').onclick=()=>stopWorker('Processing canceled. Reload the model to run AI again.');
  $('transcript').oninput=()=>{if($('transcript').dataset)delete $('transcript').dataset.audioProcessingMs;$('scenario').value='custom';resetResult();updateCount();status('Transcript changed. Generate a new set of notes.');};
  $('upload-button').onclick=()=>$('upload').click();$('upload').onchange=async()=>{const file=$('upload').files[0];if(!file)return;try{if(!/\.txt$/i.test(file.name)||file.size>100000)throw new Error('Choose a plain .txt file smaller than 100 KB.');const text=await file.text();core.validateTranscript(text);$('transcript').value=text;if($('transcript').dataset)delete $('transcript').dataset.audioProcessingMs;$('scenario').value='custom';resetResult();updateCount();status('Transcript uploaded locally.');}catch(e){status(e.message,true);}finally{$('upload').value='';}};
  $('notes-tab').onclick=()=>tabs('notes');$('evaluation-tab').onclick=()=>{renderEvaluation();tabs('evaluation');};
  $('notes-list').onchange=e=>{const id=e.target.dataset.review;if(!id)return;result.items.find(i=>i.id===id).reviewed=e.target.checked;renderNotes();};
  $('notes-list').onclick=e=>{if(e.target.dataset.edit)editItem(e.target.dataset.edit);if(e.target.dataset.remove){result.items=result.items.filter(i=>i.id!==e.target.dataset.remove);renderNotes();status('Removed from reviewed notes. The original output is preserved in the reference comparison and results export.');}};
  $('evaluation-content').onchange=e=>{if(e.target.dataset.score!==undefined){scores[e.target.dataset.score]=e.target.value;renderEvaluation();}};
  $('evaluation-content').oninput=e=>{if(e.target.id==='manual-time')measurements.manual=e.target.value;if(e.target.id==='review-time')measurements.review=e.target.value;updateTiming();};
  $('export-txt').onclick=()=>{if(result)download('meeting-notes.txt','\uFEFF'+core.exportPlainText(result,result.scenarioId?scenarios[result.scenarioId].title:'Meeting notes'),'text/plain;charset=utf-8');};
  $('export-notes').onclick=()=>{if(result)download('meeting-notes.md',core.exportMarkdown(result,result.scenarioId?scenarios[result.scenarioId].title:'Meeting notes'),'text/markdown');};
  $('export-json').onclick=()=>{if(result)download('meeting-results.json',JSON.stringify({...result,evaluation:{scores,measurements,reference:result.scenarioId?scenarios[result.scenarioId].reference:null,warning:'Reference matches are not automatic accuracy judgments.'}},null,2),'application/json');};
  $('about-button').onclick=()=>$('about').showModal();$('close-about').onclick=()=>$('about').close();
  loadScenario();setMode();
})();
