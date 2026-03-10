// server.js
// Upgraded server: loads CSV DB, exposes /api/manual-check, /api/upload, /api/list, /api/aggregate
// Usage: npm install express csv-parser multer papaparse xlsx
const express = require('express');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const multer = require('multer');
const Papa = require('papaparse');
const XLSX = require('xlsx');

const app = express();
app.use(express.json());

// Serve static frontend files from project root (so index.html, app.js, style.css work)
app.use(express.static(path.join(__dirname)));

// CSV path (update if your CSV is elsewhere)
const CSV_PATH = path.join(__dirname, 'data', 'interactions.csv'); // your original used ./data/interactions.csv

let interactionsDB = []; // normalized DB rows

/* -----------------------
   Load CSV into memory
   ----------------------- */
function loadCSV() {
  return new Promise((resolve, reject) => {
    interactionsDB = [];

    if (!fs.existsSync(CSV_PATH)) {
      console.warn(`CSV not found at ${CSV_PATH}. Database will be empty until you provide the file.`);
      return resolve();
    }

    fs.createReadStream(CSV_PATH)
      .pipe(csv())
      .on('data', (row) => {
        // Normalize keys, allow multiple possible header names
        const herb = (row.herb || row.herbal || row.Herb || '').toString().trim();
        const drug = (row.drug || row.medicine || row.Drug || '').toString().trim();
        const mechanism = (row.mechanism || row.Mechanism || '').toString().trim();
        const severity = (row.severity || row.Severity || '').toString().trim();
        const recommendation = (row.recommendation || row.Recommendation || '').toString().trim();
        const evidence = (row.evidence_level || row.evidence || '').toString().trim();
        const citation = (row.citation_url || row.citation || '').toString().trim();

        if (!herb && !drug) return; // skip rows with no identifiers

        interactionsDB.push({
          herb: herb.toLowerCase(),
          drug: drug.toLowerCase(),
          herb_raw: herb,
          drug_raw: drug,
          mechanism,
          severity,           // e.g., "High", "Moderate", "Low" or "1/2/3"
          evidence,
          recommendation,
          citation
        });
      })
      .on('end', () => {
        console.log(`Loaded ${interactionsDB.length} interaction records from CSV`);
        resolve();
      })
      .on('error', (err) => reject(err));
  });
}

/* -----------------------
   Helpers: find interactions
   ----------------------- */
function normalizeList(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map(x => (x || '').toString().trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Find interactions where record.herb is in herbs AND record.drug is in drugs.
 * If only herbs or only drugs provided, we match any record for those items (useful for partial checks).
 */
function findInteractions(herbs = [], drugs = [], patient = {}) {
  const hset = new Set(normalizeList(herbs));
  const dset = new Set(normalizeList(drugs));
  const results = [];

  interactionsDB.forEach(rec => {
    const herbMatch = hset.size === 0 ? null : hset.has(rec.herb);
    const drugMatch = dset.size === 0 ? null : dset.has(rec.drug);

    // Accept match only when both given and both match
    if (hset.size && dset.size) {
      if (herbMatch && drugMatch) results.push(buildResult(rec, patient, herbs.length, drugs.length));
    } else if (hset.size && !dset.size) {
      if (herbMatch) results.push(buildResult(rec, patient, herbs.length, drugs.length));
    } else if (!hset.size && dset.size) {
      if (drugMatch) results.push(buildResult(rec, patient, herbs.length, drugs.length));
    }
  });

  return results;
}

/* -----------------------
   Severity scoring & recommendation
   ----------------------- */

function severityStringToNumber(sev) {
  if (sev === null || sev === undefined) return 0;
  const s = String(sev).trim().toLowerCase();
  if (s === 'high' || s === '3' || s === 'major' || s === 'severe' ) return 3;
  if (s === 'moderate' || s === '2') return 2;
  if (s === 'low' || s === 'mild' || s === '1') return 1;
  return 0;
}

function computeAdjustedSeverity(baseSeverityNum, evidence, patient, herbCount = 0, drugCount = 0) {
  let s = Number(baseSeverityNum) || 0;
  const ev = (evidence || '').toLowerCase();

  // evidence adjustments
  if (ev.includes('in vitro') || ev.includes('in vitro')) s = Math.max(0, s - 1);
  if (ev.includes('case report')) s = Math.max(0, s); // no change
  if (ev.includes('rct') || ev.includes('randomized') || ev.includes('systematic') || ev.includes('meta')) s = Math.min(3, s + 0);

  // patient risk factors (age, renal, hepatic)
  if (patient) {
    if (patient.age && Number(patient.age) >= 65) s = Math.min(3, s + 1);
    if (patient.renal_impairment) s = Math.min(3, s + 1);
    if (patient.hepatic_impairment) s = Math.min(3, s + 1);
  }

  // multiple interacting items bump severity
  if ((herbCount || 0) + (drugCount || 0) > 2) s = Math.min(3, s + 1);

  return Math.min(3, Math.max(0, Math.round(s)));
}

function severityLabel(num) {
  switch (Number(num)) {
    case 3: return 'Severe';
    case 2: return 'Moderate';
    case 1: return 'Mild';
    default: return 'None';
  }
}

function generateRecommendation(adjustedSeverityNum, recText, recTemplate) {
  // If CSV provided a specific recommendation, prefer that.
  if (recText && recText.trim().length > 0) return recText;
  // else template by severity
  switch (Number(adjustedSeverityNum)) {
    case 3:
      return recTemplate || 'Severe interaction — avoid combination and seek alternative therapy; urgent prescriber review required.';
    case 2:
      return recTemplate || 'Moderate interaction — consider dose adjustment or closer monitoring; consult prescriber.';
    case 1:
      return recTemplate || 'Mild interaction — monitor clinically; no immediate change usually required.';
    default:
      return recTemplate || 'No clinically significant interaction identified.';
  }
}

function buildResult(rec, patient = {}, herbCount = 0, drugCount = 0) {
  const baseNum = severityStringToNumber(rec.severity);
  const adjusted = computeAdjustedSeverity(baseNum, rec.evidence, patient, herbCount, drugCount);
  return {
    herb: rec.herb_raw || rec.herb,
    drug: rec.drug_raw || rec.drug,
    herb_id: rec.herb,
    drug_id: rec.drug,
    mechanism: rec.mechanism || '',
    evidence: rec.evidence || '',
    base_severity: baseNum,
    adjusted_severity: adjusted,
    severity_label: severityLabel(adjusted),
    recommendation: generateRecommendation(adjusted, rec.recommendation, null),
    citation: rec.citation || ''
  };
}

/* -----------------------
   API endpoints
   ----------------------- */

// Manual check (JSON). Body: { herbs: [], drugs: [], patient: { age:..., renal_impairment: true/false, hepatic_impairment: true/false } }
app.post('/api/manual-check', (req, res) => {
  try {
    const body = req.body || {};
    const herbs = Array.isArray(body.herbs) ? body.herbs : (body.herb ? [body.herb] : []);
    const drugs = Array.isArray(body.drugs) ? body.drugs : (body.drug ? [body.drug] : []);
    const patient = body.patient || {};
    const results = findInteractions(herbs, drugs, patient);
    return res.json({ count: results.length, results });
  } catch (err) {
    console.error('manual-check error', err);
    return res.status(500).json({ error: 'server_error', details: err.message });
  }
});

// Upload endpoint - accepts CSV or XLSX file named 'file'
const upload = multer({ dest: path.join(__dirname, 'uploads/') });
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no_file' });
  const filePath = req.file.path;
  const original = (req.file.originalname || '').toLowerCase();

  const finishAndRespond = (herbs, drugs) => {
    // cleanup uploaded file
    try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
    const results = findInteractions(herbs, drugs, {});
    return res.json({ count: results.length, results, herbs, drugs });
  };

  // CSV
  if (original.endsWith('.csv')) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = Papa.parse(raw, { header: true });
    const herbs = new Set();
    const drugs = new Set();
    parsed.data.forEach(row => {
      Object.keys(row).forEach(k => {
        const v = (row[k] || '').toString().trim();
        if (!v) return;
        const key = k.toLowerCase();
        if (key.includes('herb') || key.includes('supp') || key.includes('herbal')) herbs.add(v);
        if (key.includes('drug') || key.includes('med') || key.includes('medicine') || key.includes('presc')) drugs.add(v);
      });
    });
    return finishAndRespond(Array.from(herbs), Array.from(drugs));
  }

  // XLSX
  try {
    const wb = XLSX.readFile(filePath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    const herbs = new Set();
    const drugs = new Set();
    rows.forEach(row => {
      Object.keys(row).forEach(k => {
        const v = (row[k] || '').toString().trim();
        if (!v) return;
        const key = k.toLowerCase();
        if (key.includes('herb') || key.includes('supp') || key.includes('herbal')) herbs.add(v);
        if (key.includes('drug') || key.includes('med') || key.includes('medicine') || key.includes('presc')) drugs.add(v);
      });
    });
    try { fs.unlinkSync(filePath); } catch (e) {}
    return res.json({ count: 0, results: findInteractions(Array.from(herbs), Array.from(drugs)), herbs: Array.from(herbs), drugs: Array.from(drugs) });
  } catch (err) {
    try { fs.unlinkSync(filePath); } catch (e) {}
    return res.status(400).json({ error: 'parse_error', details: err.message });
  }
});

// Return lists of herbs and drugs from DB for client-side matching/autocomplete
app.get('/api/list', (req, res) => {
  const herbs = new Set();
  const drugs = new Set();
  interactionsDB.forEach(r => {
    if (r.herb) herbs.add(r.herb_raw || r.herb);
    if (r.drug) drugs.add(r.drug_raw || r.drug);
  });
  res.json({ herbs: Array.from(herbs).slice(0, 2000), drugs: Array.from(drugs).slice(0, 2000) });
});

// Simple aggregate metrics for dashboard
app.get('/api/aggregate', (req, res) => {
  const counts = { total: interactionsDB.length, severity: { none: 0, mild: 0, moderate: 0, severe: 0 } };
  const herbCounts = {};
  interactionsDB.forEach(r => {
    const num = severityStringToNumber(r.severity);
    if (num >= 3) counts.severity.severe++;
    else if (num === 2) counts.severity.moderate++;
    else if (num === 1) counts.severity.mild++;
    else counts.severity.none++;
    herbCounts[r.herb_raw || r.herb] = (herbCounts[r.herb_raw || r.herb] || 0) + 1;
  });
  const topHerbs = Object.entries(herbCounts).sort((a,b)=>b[1]-a[1]).slice(0,10);
  res.json({ counts, topHerbs });
});

/* -----------------------
   Start server
   ----------------------- */
const PORT = process.env.PORT || 3000;
loadCSV().then(() => {
  app.listen(PORT, () => console.log(`AI-CDSS Server running on port ${PORT}`));
}).catch(err => {
  console.error('Failed to load CSV:', err);
  app.listen(PORT, () => console.log(`AI-CDSS Server running (CSV not loaded) on port ${PORT}`));
});
