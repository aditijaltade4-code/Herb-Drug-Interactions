// app.js
// Frontend: manual check + prescription text analysis + results rendering

document.addEventListener('DOMContentLoaded', () => {
  const analyzeBtn = document.getElementById('analyzeBtn');
  if (analyzeBtn) analyzeBtn.addEventListener('click', analyzePrescriptionText);

  const manualBtn = document.querySelector('[onclick="manualInteractionCheck()"]');
  if (manualBtn) manualBtn.addEventListener('click', manualInteractionCheck);

  // wire upload button if present (calls global uploadPrescription)
  const uploadBtn = document.querySelector('[onclick="uploadPrescription()"]');
  if (uploadBtn) uploadBtn.addEventListener('click', uploadPrescription);

  // initial dashboard load
  try { if (typeof loadDashboard === 'function') loadDashboard(); } catch(e){ /* ignore */ }
});

// Utility: show temporary message
function showMessage(msg, type = 'info') {
  const container = document.getElementById('results');
  if (!container) { alert(msg); return; }
  const el = document.createElement('div');
  el.className = `message ${type}`;
  el.textContent = msg;
  container.prepend(el);
  setTimeout(() => el.remove(), 5000);
}

// Render results table (exposed globally)
function renderResults(results) {
  const container = document.getElementById('results');
  if (!container) return console.warn('No #results element');

  container.innerHTML = ''; // clear previous

  if (!results || results.length === 0) {
    container.innerHTML = '<p class="muted">No interactions found.</p>';
    return;
  }

  // Build table
  const table = document.createElement('table');
  table.className = 'results-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Herb</th>
        <th>Drug</th>
        <th>Interaction / Mechanism</th>
        <th>Evidence</th>
        <th>Severity</th>
        <th>Recommendation</th>
        <th>Source</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector('tbody');

  results.forEach(r => {
    const tr = document.createElement('tr');
    const citation = r.citation ? `<a href="${escapeAttr(r.citation)}" target="_blank" rel="noopener">link</a>` : '';
    const sevLabel = r.severity_label || (r.adjusted_severity !== undefined ? (['None','Mild','Moderate','Severe'][r.adjusted_severity]||r.adjusted_severity) : r.base_severity);
    tr.innerHTML = `
      <td>${escapeHtml(r.herb || '')}</td>
      <td>${escapeHtml(r.drug || '')}</td>
      <td>${escapeHtml(r.mechanism || r.interaction_text || '')}</td>
      <td>${escapeHtml(r.evidence || '')}</td>
      <td><span class="sev-badge sev-${r.adjusted_severity ?? 0}">${escapeHtml(sevLabel)}</span></td>
      <td>${escapeHtml(r.recommendation || '')}</td>
      <td>${citation}</td>
    `;
    tbody.appendChild(tr);
  });

  container.appendChild(table);
}

// Basic sanitizers
function escapeHtml(s){ if(!s) return ''; return s.replace(/[&<>"']/g, (m)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function escapeAttr(s){ return escapeHtml(s).replace(/"/g,'&quot;'); }

// Manual single-pair checker (if manual inputs exist)
async function manualInteractionCheck() {
  const herb = (document.getElementById('herbInput')?.value || '').trim();
  const drug = (document.getElementById('drugInput')?.value || '').trim();

  if (!herb && !drug) { showMessage('Enter herb and/or drug for manual check', 'warning'); return; }

  const payload = { herbs: herb ? [herb] : [], drugs: drug ? [drug] : [] };

  try {
    const resp = await fetch('/api/manual-check', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) throw new Error(`Server ${resp.status}`);
    const json = await resp.json();
    renderResults(json.results || []);
    refreshDashboard();
  } catch (err) {
    console.error('manualInteractionCheck error', err);
    showMessage('Server error during manual check. Check console.', 'error');
  }
}

// Prescription text analysis
async function analyzePrescriptionText() {
  const text = (document.getElementById('prescriptionInput')?.value || '').trim();
  if (!text) { showMessage('Paste prescription text first', 'warning'); return; }

  // try to fetch authoritative lists for matching
  let lists = { herbs: [], drugs: [] };
  try {
    const res = await fetch('/api/list');
    if (res.ok) lists = await res.json();
  } catch (e) {
    console.warn('Could not fetch /api/list (server not available?)', e);
  }

  const lowerText = text.toLowerCase();

  // match using server list if available else fallback heuristic tokens
  let matchedHerbs = [];
  let matchedDrugs = [];

  if (lists && Array.isArray(lists.herbs) && lists.herbs.length) {
    lists.herbs.forEach(h => { if (lowerText.includes(h.toLowerCase())) matchedHerbs.push(h); });
  }
  if (lists && Array.isArray(lists.drugs) && lists.drugs.length) {
    lists.drugs.forEach(d => { if (lowerText.includes(d.toLowerCase())) matchedDrugs.push(d); });
  }

  // fallback: split tokens if nothing matched
  if (matchedHerbs.length === 0 && matchedDrugs.length === 0) {
    const tokens = text.split(/[\n,;():.]+/).map(t=>t.trim()).filter(Boolean);
    tokens.forEach(t => {
      if (t.length <= 30) {
        // conservative: add as both; server will only match valid pairs
        matchedHerbs.push(t);
        matchedDrugs.push(t);
      }
    });
  }

  // dedupe
  matchedHerbs = Array.from(new Set(matchedHerbs)).filter(Boolean);
  matchedDrugs = Array.from(new Set(matchedDrugs)).filter(Boolean);

  if (matchedHerbs.length === 0 || matchedDrugs.length === 0) {
    showMessage('No herbs or drugs found confidently in text. Try exact names or use upload.', 'warning');
    // still continue to call API if you want — but default stop here
    // return;
  }

  // send to server to compute interactions
  try {
    const resp = await fetch('/api/manual-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ herbs: matchedHerbs, drugs: matchedDrugs })
    });
    if (!resp.ok) throw new Error(`Server ${resp.status}`);
    const json = await resp.json();
    renderResults(json.results || []);
    refreshDashboard();
  } catch (err) {
    console.error('analyzePrescriptionText error', err);
    showMessage('Server error analyzing prescription. Check console.', 'error');
  }
}

// Export renderResults for uploader.js to reuse
window.renderResults = renderResults;

// Refresh dashboard if available
function refreshDashboard() {
  try { if (typeof loadDashboard === 'function') loadDashboard(); } catch(e){/*ignore*/ }
}
window.manualInteractionCheck = manualInteractionCheck;
window.analyzePrescriptionText = analyzePrescriptionText;
