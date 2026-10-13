(function(root){
  'use strict';
  function validate(data){
    if(!data||data.format!=='team2-audio-v1'||!Array.isArray(data.segments)||!data.segments.length||data.segments.length>3000||!Array.isArray(data.speakers)||data.speakers.length>30)throw Error('Choose a speaker transcript exported by this demo.');
    const speakers=data.speakers.map(p=>{
      if(!p||typeof p.id!=='string'||!/^(speaker_\d+|unknown)$/.test(p.id))throw Error('Invalid speaker label.');
      return {id:p.id,name:typeof p.name==='string'?p.name.slice(0,80):'',role:typeof p.role==='string'?p.role.slice(0,100):'',suggested:!!p.suggested};
    });
    if(new Set(speakers.map(p=>p.id)).size!==speakers.length)throw Error('Duplicate speaker labels.');
    const segments=data.segments.map(s=>{
      if(!s||!Number.isFinite(s.start)||!Number.isFinite(s.end)||s.start<0||s.end<s.start||s.end>601||typeof s.text!=='string'||s.text.length>5000||!speakers.some(p=>p.id===s.speaker))throw Error('Invalid transcript turn.');
      return {start:s.start,end:s.end,text:s.text,speaker:s.speaker,uncertain:!!s.uncertain};
    });
    return {...data,speakers,segments};
  }
  function stamp(seconds){const n=Math.floor(seconds);return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
  function label(person){return (person.name.trim()||person.id.replace('speaker_','Speaker '))+(person.role.trim()?' ('+person.role.trim()+')':'');}
  function transcript(data){return data.segments.filter(s=>s.text.trim()).map(s=>label(data.speakers.find(p=>p.id===s.speaker)).replace(/[\r\n:]/g,' ') + ': '+s.text.trim().replace(/[\r\n]+/g,' ')+' ['+stamp(s.start)+'–'+stamp(s.end)+']').join('\n');}
  const api={validate,stamp,label,transcript};root.AudioCore=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
