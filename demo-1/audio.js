(function(){
  'use strict';
  const $=id=>document.getElementById(id),core=AudioCore;
  let token=null,data=null,objectURL=null,running=false;
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function status(text,error=false){$('audio-status').textContent=text;$('audio-status').className=error?'status error':'status';}
  function showProgress(progress){
    $('audio-progress-panel').hidden=false;
    if(Number.isFinite(progress?.percent))$('audio-progress').value=progress.percent;else $('audio-progress').removeAttribute('value');
    $('audio-eta').textContent=core.etaText(progress);
    $('audio-elapsed').textContent=(Number.isFinite(progress?.elapsedSeconds)?'Elapsed: '+core.stamp(progress.elapsedSeconds)+'. ':'')+'Estimates adjust as processing progresses. First-time model downloads can add time.';
  }
  function lock(value){running=value;for(const id of ['process-audio','audio-file','speaker-count','whisper-model','import-audio-button'])$(id).disabled=value;}
  function render(){
    $('audio-review').hidden=false;
    $('speaker-editor').innerHTML=data.speakers.map((p,i)=>'<div class="speaker-row"><strong>'+escape(p.id.replace('speaker_','Speaker '))+'</strong><label>Name<input maxlength="80" data-person="'+i+'" data-field="name" value="'+escape(p.name)+'" placeholder="Enter name"></label><label>Role<input maxlength="100" data-person="'+i+'" data-field="role" value="'+escape(p.role)+'" placeholder="Enter role"></label><small>'+(p.suggested?'Suggested from introduction · check it':'Enter from introduction or leave unnamed')+'</small></div>').join('');
    $('turn-editor').innerHTML=data.segments.map((s,i)=>'<div class="audio-turn"><div><button type="button" class="text-button" data-play="'+i+'" '+(objectURL?'':'disabled')+'>'+core.stamp(s.start)+'–'+core.stamp(s.end)+'</button><label>Speaker for turn '+(i+1)+'<select data-turn-speaker="'+i+'">'+data.speakers.map(p=>'<option value="'+escape(p.id)+'" '+(s.speaker===p.id?'selected':'')+'>'+escape(core.label(p))+'</option>').join('')+'</select></label></div><label>Transcript turn '+(i+1)+'<textarea rows="2" data-turn-text="'+i+'">'+escape(s.text)+'</textarea></label>'+(s.uncertain?'<small class="warning">Overlapping or unmatched speech — check speaker assignment.</small>':'')+'</div>').join('');
  }
  async function poll(){
    try{
      const response=await fetch('/api/audio/status',{cache:'no-store'});if(!response.ok)throw Error('Local audio service stopped. Keep the launcher running.');
      const state=await response.json();status(state.message,state.state==='error');
      if(state.state==='running'){showProgress(state.progress);setTimeout(poll,1000);return;}
      $('audio-progress-panel').hidden=true;
      lock(false);if(state.state==='done'){data=core.validate(state.result);render();status('Audio completed in '+MeetingCore.formatDuration(data.elapsedSeconds*1000)+'. Transcript ready for review. Time includes local transfer and model setup when needed.');}
    }catch(error){lock(false);$('audio-progress-panel').hidden=true;status(error.message,true);}
  }
  async function connect(){
    if(location.hostname!=='127.0.0.1'){ $('audio-connection').textContent='Audio processing uses the optional local companion.';return;}
    try{
      const response=await fetch('/api/audio/config',{cache:'no-store'});if(!response.ok)throw Error();const info=await response.json();if(!info.localAudio)throw Error();
      token=info.token;$('audio-controls').hidden=false;$('audio-setup').hidden=true;$('audio-connection').textContent='Local audio companion connected. Recordings stay on this computer.';
      const check=await fetch('/api/audio/status',{cache:'no-store'});const state=await check.json();if(state.state==='running'){lock(true);$('audio-panel').open=true;poll();}else if(state.state==='done'){data=core.validate(state.result);render();$('audio-panel').open=true;status('Audio completed in '+MeetingCore.formatDuration(data.elapsedSeconds*1000)+'. Recovered the transcript from this running session.');}
    }catch{$('audio-connection').textContent='Audio processing uses the optional local companion.';}
  }
  $('process-audio').onclick=async()=>{
    const file=$('audio-file').files[0];if(!file){status('Choose a recording first.',true);return;}if(file.size>80*1024*1024){status('Use a recording under 80 MB.',true);return;}
    if(objectURL)URL.revokeObjectURL(objectURL);objectURL=URL.createObjectURL(file);$('recording-player').src=objectURL;$('recording-player').hidden=false;
    lock(true);$('audio-review').hidden=true;showProgress(null);status('Sending the recording to the local companion on this computer…');
    try{
      const response=await fetch('/api/audio/jobs',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Local-Token':token,'X-Speaker-Count':$('speaker-count').value,'X-Whisper-Model':$('whisper-model').value},body:file});
      if(!response.ok){const err=await response.json();throw Error(err.error||'Audio processing could not start.');}poll();
    }catch(error){lock(false);$('audio-progress-panel').hidden=true;status(error.message,true);}
  };
  $('speaker-editor').oninput=e=>{const i=e.target.dataset.person;if(i===undefined)return;data.speakers[i][e.target.dataset.field]=e.target.value;data.speakers[i].suggested=false;for(const select of $('turn-editor').querySelectorAll('select'))for(const option of select.options)option.textContent=core.label(data.speakers.find(p=>p.id===option.value));};
  $('add-speaker').onclick=()=>{if(!data||data.speakers.length>=30)return;let n=1;while(data.speakers.some(p=>p.id==='speaker_'+n))n++;data.speakers.push({id:'speaker_'+n,name:'',role:'',suggested:false});render();status('New speaker added. Enter a name and assign the appropriate turns.');};
  $('turn-editor').onchange=e=>{if(e.target.dataset.turnSpeaker!==undefined)data.segments[e.target.dataset.turnSpeaker].speaker=e.target.value;};
  $('turn-editor').oninput=e=>{if(e.target.dataset.turnText!==undefined)data.segments[e.target.dataset.turnText].text=e.target.value;};
  $('turn-editor').onclick=e=>{if(e.target.dataset.play!==undefined&&objectURL){$('recording-player').currentTime=data.segments[e.target.dataset.play].start;$('recording-player').play().catch(()=>status('Press play on the recording to listen.'));}};
  $('apply-audio').onclick=()=>{
    if(!data)return;if($('transcript').disabled){status('Wait for note generation to finish first.',true);return;}
    try{const text=core.transcript(data);MeetingCore.validateTranscript(text);$('transcript').value=text;$('transcript').dispatchEvent(new Event('input',{bubbles:true}));$('audio-panel').open=false;$('transcript').focus();}catch(error){status(error.message+' Export the transcript and split it into shorter sections.',true);}
  };
  $('download-audio').onclick=()=>{if(!data)return;const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='speaker-transcript.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);};
  $('import-audio-button').onclick=()=>$('import-audio').click();
  $('import-audio').onchange=async()=>{const file=$('import-audio').files[0];if(!file)return;try{if(file.size>2*1024*1024)throw Error('Use a transcript JSON under 2 MB.');data=core.validate(JSON.parse(await file.text()));if(objectURL)URL.revokeObjectURL(objectURL);objectURL=null;$('recording-player').removeAttribute('src');$('recording-player').hidden=true;render();status('Speaker transcript imported locally. Review names and wording before generating notes.');}catch(error){status(error.message,true);}finally{$('import-audio').value='';}};
  connect();
})();
