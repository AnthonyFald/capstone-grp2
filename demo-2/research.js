const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cases={'reports-a':'Room B104 · 10 reports','reports-b':'Library wing · 6 reports','reports-clean':'Routine control · 3 reports'};
fetch('docs/evaluation-summary.json').then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{
  document.getElementById('results').innerHTML=data.groups.map(g=>'<tr><td><strong>'+esc(g.label)+'</strong><small>'+esc(cases[g.dataset]||g.dataset)+(g.model.includes('27b')?' · earlier development pipeline':'')+'</small></td><td>'+g.n+'</td><td>'+esc(g.recallDisplay)+'</td><td>'+esc(g.partialDisplay)+'</td><td>'+esc(g.unsupportedDisplay)+'</td><td>'+esc(g.duplicateDisplay)+'</td><td>'+esc(g.timeDisplay)+'</td></tr>').join('');
  document.getElementById('result-note').textContent=data.note+' Selected comparison records: '+data.attempts+' attempts; '+data.completed+' completed; '+data.failed+' failed. Older development attempts are listed in the results log.';
}).catch(()=>{document.getElementById('results').innerHTML='<tr><td colspan="7">The results file could not be loaded. Open the detailed results below or retry.</td></tr>';});
