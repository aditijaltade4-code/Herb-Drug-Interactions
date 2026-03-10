// app.js
// Frontend glue for Manual Check + Prescription Text Analysis + Results rendering
// Expects backend routes:
//  - POST /api/manual-check   { herbs:[], drugs:[], patient:{} }  => { results: [...] }
//  - GET  /api/list           => { herbs: [...], drugs: [...] }
//  - GET  /api/aggregate      => { counts: {...}, topHerbs: [...] }

document.addEventListener('DOMContentLoaded', () => {
  // wire buttons
  const analyzeBtn = document.getElementById('analyzeBtn');
  if (analyzeBtn) analyzeBtn.addEventListener('click', analyzePrescriptionText);

  // If manual check button is inline on page, it calls the global function manualInteractionCheck()
  // Ensure dashboard loads (if dashboard.js isn't present yet, this will still try)
  try { loadDashboard && loadDashboard(); } catch (e) { /* ignore if not present */ }
});

// ---------- Manual check ----------
async function manualInteractionCheck() {
  const herb = (document.getElementById('herbInput')?.value || '').trim();
  const drug = (document.getElementById('drugInput')?.value || '').trim();

  if (!herb && !drug) {
    showMessage('Enter at least one herb or drug for manual check.', 'warning');
    return;
  }

  const payload = { herbs: [], drugs: [] };
  if (herb) payload.herbs.push(herb);
  if (drug) payload.drugs.push(drug);

  try {
    const resp = await fetch('/api/manual-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Server error: ${resp.status} ${text}`);
    }
    const json = await resp.json();
    renderResults(json.results || []);
    // refresh dashboard after manual check
    refreshDashboard();
  } catch (err) {
    console.error('manualInteractionCheck error', err);
    showMessage('Failed to reach server for manual check. See console for details.', 'error');
  }
}

// ---------- Prescription text analysis ----------
async function analyzePrescriptionText() {
  const text = (document.getElementById('prescriptionInput')?.value || '').trim();
  if (!text) {
    showMessage('Paste prescription or EHR text into the box before analysis.', 'warning');
    return;
  }

  // Try to obtain authoritative list of herbs & drugs from server for better matching
  let lists = { herbs: [], drugs: [] };
  try {
    const resp = await fetch('/api/list');
    if (resp.ok) {
      lists = await resp.json();
    } else {
      console.warn('/api/list returned', resp.status);
    }
  } catch (e) {
    console.warn('Could not fetch /api/list - falling back to heuristic parsing.', e);
  }

  // Heuristic extraction: if server provided lists, match those against text
  let matchedHerbs = [];
  let matchedDrugs = [];

  if (lists && (Array.isArray(lists.herbs) && lists.herbs.length)) {
    const lowerText = text.toLowerCase();
    lists.herbs.forEach(h => {
      if (!h) return;
      // match whole words or common separators
      const name = h.toLowerCase();
      if (lowerText.includes(name)) matchedHerbs.push(h);
    });
  }

  if (lists && (Array.isArray(lists.drugs) && lists.drugs.length)) {
    const lowerText = text.toLowerCase();
    lists.drugs.forEach(d => {
      if (!d) return;
      const name = d.toLowerCase();
      if (lowerText.includes(name)) matchedDrugs.push(d);
    });
  }

  // If server list not available or no matches found, do simple heuristic: comma-separated tokens and capitalized words
  if (matchedHerbs.length === 0 && matchedDrugs.length === 0) {
    // Try to extract tokens by splitting on commas, semicolons, newlines
    const tokens = text.split(/[\n,;():.]+/).map(t => t.trim()).filter(Boolean);
    // keep tokens that are short (<=4 words) and alphabetic-ish
    const candidates = tokens.filter(t => t.split(/\s+/).length <= 4 && /[a-zA-Z]/.test(t));
    // heuristics: if token contains words like 'extract', 'tablet', 'tab', remove them
    const filtered = candidates.map(t => t.replace(/\b(tablet|tab|mg|ml|dose|once|daily|bid|tid|hs)\b/ig,'').trim()).filter(Boolean);

    // try to split tokens into two groups: if token contains typical herb words (ashwagandha, turmeric, guggul) treat as herb, else drug
    // Since we lack a dictionary, we'll place all into matchedDrugs as a fallback but still show results so user can review.
    filtered.forEach(t => {
      // very simple guess: if token length < 4 chars it's unlikely to be a herb full name; otherwise add to both lists for checking
      if (t.length > 2) {
        matchedDrugs.push(t);
        matchedHerbs.push(t);
      }
    });
  }

  // dedupe
  matchedHerbs = Array.from(new Set(matchedHerbs.map(s => s.trim()))).filter(Boolean);
  matchedDrugs = Array.from(new Set(matchedDrugs.map(s => s.trim()))).filter(Boolean);

  // send to server for matching
  const payload = { herbs: matchedHerbs, drugs: matchedDrugs };
  try {
    const resp = await fetch('/api/manual-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Server responded ${resp.status} ${txt}`);
    }
    const json = await resp.json();
    renderResults(json.results || []);
    // refresh dashboard after analysis
    refreshDashboard();
  } catch (err) {
    console.error('analyzePrescriptionText error', err);
    showMessage('Failed to analyze prescription via server. See console for details.', 'error');
  }
}

// ---------- Render results ----------
function renderResults(results) {
  const container = document.getElementById('results');
  if (!container) {
    console.warn('No #results element found');
    return;
  }
  container.innerHTML = ''; // clear

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
        <th>Interaction</th>
        <th>Mechanism</th>
        <th>Evidence</th>
        <th>Severity</th>
        <th>Recommendation</th>
        <th>Citation</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector('tbody');
  results.forEach(r => {
    const tr = document.createElement('tr');
    const interactionText = escapeHtml(r.interaction_text || r.interaction || '');
    const mechanism = escapeHtml(r.mechanism || '');
    const evidence = escapeHtml(r.evidence || r.evidence_level || '');
    const rec = escapeHtml(r.recommendation || '');
    const citation = r.citation_url ? `<a href="${escapeAttr(r.citation_url)}" target="_blank" rel="noopener">link</a>` : '';

    const sev = typeof r.adjusted_severity !== 'undefined' ? r.adjusted_severity : (r.severity || 0);
    const sevBadge = `<span class="sev-badge sev-${sev}">${sevLabel(sev)}</span>`;

    tr.innerHTML = `
      <td>${escapeHtml(r.herb || '')}</td>
      <td>${escapeHtml(r.drug || '')}</td>
      <td>${interactionText}</td>
      <td>${mechanism}</td>
      <td>${evidence}</td>
      <td>${sevBadge}</td>
      <td>${rec}</td>
      <td>${citation}</td>
    `;
    tbody.appendChild(tr);
  });

  container.appendChild(table);
}

// ---------- Small utilities ----------
function sevLabel(sev) {
  switch (Number(sev)) {
    case 0: return 'None';
    case 1: return 'Mild';
    case 2: return 'Moderate';
    case 3: return 'Severe';
    default: return String(sev);
  }
}

function escapeHtml(s) {
  if (!s) return '';
  return s.replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function escapeAttr(s) { return escapeHtml(s).replace(/"/g,'&quot;'); }

function showMessage(msg, level='info') {
  // simple temporary message above results
  const container = document.getElementById('results');
  if (!container) return alert(msg);
  const div = document.createElement('div');
  div.className = `message ${level}`;
  div.textContent = msg;
  container.prepend(div);
  setTimeout(() => div.remove(), 5000);
}

// trigger dashboard refresh (dashboard.js provides loadDashboard)
function refreshDashboard() {
  try {
    if (typeof loadDashboard === 'function') loadDashboard();
  } catch (e) { /* ignore */ }
}

// ---------- lightweight fallback: allow direct invocation from HTML buttons if present ----------
window.manualInteractionCheck = manualInteractionCheck;
window.analyzePrescriptionText = analyzePrescriptionText;
window.renderResults = renderResults;

// Also export a helper for other front-end modules
window.hdiHelpers = {
  renderResults, refreshDashboard
};
