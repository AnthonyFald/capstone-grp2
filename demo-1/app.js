(() => {
  'use strict';
  const $=id=>document.getElementById(id), core=MeetingCore, scenarios=DEMO_SCENARIOS;
  let result=null,worker=null,ready=false,busy=false,timeout=null,runStart=0,runTranscript='',modelName='',referenceId=null,loadTicket=0;
  let scores={},measurements={manual:'',review:''};
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
  function updateCount(){$('word-count').textContent=($('transcript').value.trim().match(/\S+/g)||[]).length+' words';}
  function setBusy(value){busy=value;for(const id of ['generate','load-model','mode','scenario','upload-button','transcript'])$(id).disabled=value;$('cancel').hidden=!value;if(!value)clearTimeout(timeout);}
  function resetResult(){result=null;scores={};measurements={manual:'',review:''};$('empty').hidden=false;$('results').hidden=true;$('run-label').textContent='Ready when you are';renderEvaluation();}
  function loadScenario(){const s=scenarios[$('scenario').value];$('transcript').value=s?s.transcript:'';resetResult();updateCount();status(s?'Synthetic meeting loaded. Choose a processing method.':'Paste a transcript or upload a plain text file.');}
  function setMode(){const ai=$('mode').value==='ai';$('ai-info').hidden=!ai;$('rules-info').hidden=ai;$('generate').textContent=ai?'Generate AI meeting notes →':'Extract notes with rules →';status(ai?(ready?'Free local AI is ready.':'Load the model, then generate notes.'):'Basic extraction works instantly and offline. It is not AI.');}
  function tabs(view){$('notes-view').hidden=view!=='notes';$('evaluation-view').hidden=view!=='evaluation';for(const name of ['notes','evaluation']){const active=name===view;$(name+'-tab').classList.toggle('active',active);$(name+'-tab').setAttribute('aria-selected',String(active));}}
  function stopWorker(message,error=false){loadTicket++;if(worker)worker.terminate();worker=null;ready=false;clearTimeout(timeout);setBusy(false);$('load-model').textContent='Load free AI model';$('load-model').disabled=false;$('model-progress').hidden=true;$('model-status').textContent='Model not loaded.';status(message,error);}
  async function loadModel(){
    if(ready){status('The local AI model is already loaded.');return;}
    if(location.protocol==='file:'){status('For local AI, open Start Demo.cmd from the project folder. Direct file opening supports only Basic extraction.',true);return;}
    if(!window.isSecureContext||!navigator.gpu){status('This browser does not offer WebGPU. Open the local demo in current Chrome or Edge with hardware acceleration, or use Basic extraction.',true);return;}
    const ticket=++loadTicket;
    setBusy(true);$('model-progress').hidden=false;$('model-progress').value=0;status('Checking your computer, then downloading the free model.');
    try{
      const adapter=await navigator.gpu.requestAdapter();if(ticket!==loadTicket)return;if(!adapter)throw new Error('No compatible graphics adapter was found. Try Chrome or Edge, or use Basic extraction.');
      modelName=adapter.features.has('shader-f16')?'Qwen2.5-1.5B-Instruct-q4f16_1-MLC':'Qwen2.5-1.5B-Instruct-q4f32_1-MLC';
      worker=new Worker('ai-worker.js',{type:'module'});
      worker.onerror=event=>stopWorker('Local AI could not start. '+(event.message||'Check your connection and browser WebGPU support.'),true);
      worker.onmessage=({data})=>{
        if(data.type==='progress'){$('model-status').textContent=data.text;$('model-progress').value=Math.max(0,Math.min(1,data.progress||0));}
        if(data.type==='generation-progress')status(data.text);
        if(data.type==='ready'){ready=true;setBusy(false);$('model-progress').hidden=true;$('model-status').textContent='Qwen 2.5 1.5B is loaded. All text processing stays on this computer.';$('load-model').textContent='AI model ready';$('load-model').disabled=true;status('Ready. Generate notes to run the real local AI model.');}
        if(data.type==='result'){
          try{const parsed=core.normalizeModelOutput(data.content,runTranscript);parsed.model=modelName;finish(parsed);}catch(e){status(e.message,true);}finally{setBusy(false);if(ready)$('load-model').disabled=true;}
        }
        if(data.type==='error'){stopWorker('Local AI: '+data.message+' No paid service was used.',true);}
      };
      worker.postMessage({type:'load',model:modelName});
      timeout=setTimeout(()=>stopWorker('Model loading took too long. Check the internet connection and retry; cached files may be reused.',true),15*60*1000);
    }catch(e){stopWorker(e.message,true);}
  }
  function finish(data){
    result={...data,elapsedMs:performance.now()-runStart,createdAt:new Date().toISOString(),transcript:runTranscript,scenarioId:referenceId,originalItems:JSON.parse(JSON.stringify(data.items))};
    scores={};measurements={manual:'',review:''};$('empty').hidden=true;$('results').hidden=false;$('run-label').textContent=data.mode==='ai'?'LOCAL AI':'RULES · NOT AI';$('summary').textContent=data.summary;$('elapsed').textContent=(result.elapsedMs/1000).toFixed(2)+'s processing';
    renderNotes();renderEvaluation();tabs('notes');status(data.items.length?'Notes generated. Review the source for each item.'+(data.rejected?' '+data.rejected+' invalid model items were rejected.':''):'No items extracted. Review the transcript manually; this does not mean there are no action items.');
  }
  async function generate(){
    if(busy)return;
    try{
      const text=core.validateTranscript($('transcript').value);
      if($('mode').value==='ai'&&!ready){status('Load the free AI model first. This does not require an account or API key.',true);return;}
      runTranscript=text;referenceId=Object.keys(scenarios).find(id=>scenarios[id].transcript===text)||null;runStart=performance.now();setBusy(true);
      if($('mode').value==='rules'){finish(core.extractBasic(text));setBusy(false);return;}
      status('Qwen is reading the meeting locally. This can take a minute or two.');
      worker.postMessage({type:'generate',transcript:text.split(/\r?\n/).map((line,i)=>'['+(i+1)+'] '+line).join('\n')});
      timeout=setTimeout(()=>stopWorker('This computer took more than fifteen minutes to generate notes. Try a shorter transcript.',true),15*60*1000);
    }catch(e){setBusy(false);status(e.message,true);}
  }
  function renderNotes(){
    if(!result)return;
    $('notes-list').innerHTML=core.kinds.map(kind=>{const group=result.items.filter(i=>i.kind===kind);return '<section><div class="section-heading"><h3>'+core.labels[kind]+'</h3><span class="count">'+group.length+'</span></div>'+(!group.length?'<p class="muted">None extracted.</p>':group.map(i=>'<article class="note '+(i.reviewed?'reviewed':'')+'" data-id="'+i.id+'"><p class="note-text">'+escape(i.text)+'</p>'+(kind==='action'?'<div class="note-meta"><span>Owner <strong>'+escape(i.owner||'Not specified')+'</strong></span><span>Due <strong>'+escape(i.due||'Not specified')+'</strong></span></div>':'')+(i.flags.length?'<p class="warning">'+i.flags.map(escape).join(' ')+'</p>':'')+'<details class="source"><summary>View source · line '+i.line+'</summary><blockquote>'+escape(i.evidence)+'</blockquote></details><div class="note-actions"><label><input type="checkbox" data-review="'+i.id+'" '+(i.reviewed?'checked':'')+'>Reviewed against source</label><button class="text-button" data-edit="'+i.id+'">Edit</button><button class="text-button" data-remove="'+i.id+'">Remove</button></div></article>').join(''))+'</section>';}).join('');
    $('review-count').textContent=result.items.filter(i=>i.reviewed).length+' of '+result.items.length+' reviewed';
  }
  function editItem(id){
    const item=result.items.find(x=>x.id===id),node=document.querySelector('[data-id="'+id+'"]');if(!item||!node)return;
    const fields=document.createElement('div');fields.className='edit-fields';fields.innerHTML='<label>Category<select data-field="kind">'+core.kinds.map(kind=>'<option value="'+kind+'" '+(item.kind===kind?'selected':'')+'>'+core.labels[kind]+'</option>').join('')+'</select></label><label>Note<textarea data-field="text" rows="3">'+escape(item.text)+'</textarea></label><label>Owner (actions only)<input data-field="owner" value="'+escape(item.owner||'')+'"></label><label>Deadline (actions only; blank if not stated)<input data-field="due" value="'+escape(item.due||'')+'"></label><button class="button secondary">Save correction</button>';
    fields.querySelector('button').onclick=()=>{const text=fields.querySelector('[data-field="text"]').value.trim();if(!text){status('The note cannot be empty.',true);return;}item.text=text;item.kind=fields.querySelector('[data-field="kind"]').value;for(const key of ['owner','due']){const input=fields.querySelector('[data-field="'+key+'"]');item[key]=item.kind==='action'?(input.value.trim()||null):null;}item.reviewed=false;item.edited=true;renderNotes();status('Correction saved. The reference comparison still uses the original output.');};
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
  $('transcript').oninput=()=>{$('scenario').value='custom';resetResult();updateCount();status('Transcript changed. Generate a new set of notes.');};
  $('upload-button').onclick=()=>$('upload').click();$('upload').onchange=async()=>{const file=$('upload').files[0];if(!file)return;try{if(!/\.txt$/i.test(file.name)||file.size>100000)throw new Error('Choose a plain .txt file smaller than 100 KB.');const text=await file.text();core.validateTranscript(text);$('transcript').value=text;$('scenario').value='custom';resetResult();updateCount();status('Transcript uploaded locally.');}catch(e){status(e.message,true);}finally{$('upload').value='';}};
  $('notes-tab').onclick=()=>tabs('notes');$('evaluation-tab').onclick=()=>{renderEvaluation();tabs('evaluation');};
  $('notes-list').onchange=e=>{const id=e.target.dataset.review;if(!id)return;result.items.find(i=>i.id===id).reviewed=e.target.checked;renderNotes();};
  $('notes-list').onclick=e=>{if(e.target.dataset.edit)editItem(e.target.dataset.edit);if(e.target.dataset.remove){result.items=result.items.filter(i=>i.id!==e.target.dataset.remove);renderNotes();status('Removed from reviewed notes. The original output is preserved in the reference comparison and results export.');}};
  $('evaluation-content').onchange=e=>{if(e.target.dataset.score!==undefined){scores[e.target.dataset.score]=e.target.value;renderEvaluation();}};
  $('evaluation-content').oninput=e=>{if(e.target.id==='manual-time')measurements.manual=e.target.value;if(e.target.id==='review-time')measurements.review=e.target.value;updateTiming();};
  $('export-notes').onclick=()=>{if(result)download('meeting-notes.md',core.exportMarkdown(result,result.scenarioId?scenarios[result.scenarioId].title:'Meeting notes'),'text/markdown');};
  $('export-json').onclick=()=>{if(result)download('meeting-results.json',JSON.stringify({...result,evaluation:{scores,measurements,reference:result.scenarioId?scenarios[result.scenarioId].reference:null,warning:'Reference matches are not automatic accuracy judgments.'}},null,2),'application/json');};
  $('about-button').onclick=()=>$('about').showModal();$('close-about').onclick=()=>$('about').close();
  loadScenario();setMode();
})();
