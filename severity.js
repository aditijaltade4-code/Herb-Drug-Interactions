// server.js
// Uses severity module for scoring & explanations
const express = require('express');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const multer = require('multer');
const Papa = require('papaparse');
const XLSX = require('xlsx');

const sev = require('./severity'); // your severity module

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const CSV_PATH = path.join(__dirname, 'data', 'interactions.csv');

let interactionsDB = [];

function loadCSV() {
  return new Promise((resolve, reject) => {
    interactionsDB = [];
    if (!fs.existsSync(CSV_PATH)) {
      console.warn(`CSV not found at ${CSV_PATH}. Database will be empty.`);
      return resolve();
    }

    fs.createReadStream(CSV_PATH)
      .pipe(csv())
      .on('data', (row) => {
        const herb = (row.herb || row.herbal || '').toString().trim();
        const drug = (row.drug || row.medicine || '').toString().trim();
        const mechanism = (row.mechanism || '').toString().trim();
        const severityRaw = (row.severity || '').toString().trim();
        const recommendation = (row.recommendation || '').toString().trim();
        const evidence = (row.evidence_level || row.evidence || '').toString().trim();
        const citation = (row.citation_url || row.citation || '').toString().trim();
        const interaction_text = (row.interaction_text || row.interaction || '').toString().trim();

        if (!herb && !drug) return;

        // If CSV row doesn't include severity, attempt to infer from recommendation/mechanism/interaction_text using severity.calculateSeverity
        let inferredSeverityNum = null;
        if (!severityRaw) {
          const inferFrom = recommendation || mechanism || interaction_text;
          if (inferFrom) {
            inferredSeverityNum = Number(sev.calculateSeverity(inferFrom));
          }
        }

        interactionsDB.push({
          herb: herb.toLowerCase(),
          drug: drug.toLowerCase(),
          herb_raw: herb,
          drug_raw: drug,
          mechanism,
          severity: severityRaw,       // original text (if any)
          severity_inferred: inferredSeverityNum, // numeric 1-3 if inferred
          evidence,
          recommendation,
          citation,
          interaction_text
        });
      })
      .on('end', () => {
        console.log(`Loaded ${interactionsDB.length} interaction records from CSV`);
        resolve();
      })
      .on('error', (err) => reject(err));
  });
}

function normalizeList(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(x => (x || '').toString().trim()).filter(Boolean).map(s => s.toLowerCase());
}

function severityStringToNumber(sevStr, fallbackInferred) {
  if (typeof fallbackInferred === 'number' && !sevStr) return fallbackInferred;
  if (!sevStr) return 0;
  const s = String(sevStr).trim().toLowerCase();
  if (s === 'high' || s === '3' || s === 'major' || s === 'severe' ) return 3;
  if (s === 'moderate' || s === '2') return 2;
  if (s === 'low' || s === 'mild' || s === '1') return 1;
  return 0;
}

function computeAdjustedSeverity(baseSeverityNum, evidence, patient, herbCount = 0, drugCount = 0) {
  // Keep same adjustment rules as before
  let s = Number(baseSeverityNum) || 0;
  const ev = (evidence || '').toLowerCase();

  if (ev.includes('in vitro')) s = Math.max(0, s - 1);
  if (ev.includes('rct') || ev.includes('randomized') || ev.includes('systematic') || ev.includes('meta')) s = Math.min(3, s + 0);

  if (patient) {
    if (patient.age && Number(patient.age) >= 65) s = Math.min(3, s + 1);
    if (patient.renal_impairment) s = Math.min(3, s + 1);
    if (patient.hepatic_impairment) s = Math.min(3, s + 1);
  }

  if ((herbCount || 0) + (drugCount || 0) > 2) s = Math.min(3, s + 1);

  return Math.min(3, Math.max(0, Math.round(s)));
}

function buildResult(rec, patient = {}, herbCount = 0, drugCount = 0) {
  // base severity preference: explicit CSV severity -> inferred severity -> 0
  const baseNum = severityStringToNumber(rec.severity, rec.severity_inferred);
  const adjusted = computeAdjustedSeverity(baseNum, rec.evidence, patient, herbCount, drugCount);
  const severityLabel = sev.getSeverityLabel ? sev.getSeverityLabel(adjusted) : (adjusted === 3 ? 'Severe' : adjusted === 2 ? 'Moderate' : adjusted === 1 ? 'Mild' : 'None');
  const recommendation = rec.recommendation && rec.recommendation.trim() ? rec.recommendation : (sev.severityExplanation ? sev.severityExplanation(adjusted) : '');
  return {
    herb: rec.herb_raw || rec.herb,
    drug: rec.drug_raw || rec.drug,
    herb_id: rec.herb,
    drug_id: rec.drug,
    mechanism: rec.mechanism || '',
    evidence: rec.evidence || '',
    interaction_text: rec.interaction_text || '',
    base_severity: baseNum,
    adjusted_severity: adjusted,
    severity_label: severityLabel,
    recommendation,
    citation: rec.citation || ''
  };
}

function findInteractions(herbs = [], drugs = [], patient = {}) {
  const hset = new Set(normalizeList(herbs));
  const dset = new Set(normalizeList(drugs));
  const results = [];

  interactionsDB.forEach(rec => {
    const herbMatch = hset.size === 0 ? null : hset.has(rec.herb);
    const drugMatch = dset.size === 0 ? null : dset.has(rec.drug);

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

// api endpoints
app.post('/api/manual-check', (req, res) => {
  try {
    const body = req.body || {};
    const herbs = Array.isArray(body.herbs) ? body.herbs : (body.herb ? [body.herb] : []);
    const drugs = Array.isArray(body.drugs) ? body.drugs : (body.drug ? [body.drug] : []);
    const patient = body.patient || {};
    const results = findInteractions(herbs, drugs, patient);
    res.json({ count: results.length, results });
  } catch (err) {
    console.error('manual-check error', err);
    res.status(500).json({ error: 'server_error', details: err.message });
  }
});

const upload = multer({ dest: path.join(__dirname, 'uploads/') });
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no_file' });
  const filePath = req.file.path;
  const original = (req.file.originalname || '').toLowerCase();

  const finishAndRespond = (herbs, drugs) => {
    try { fs.unlinkSync(filePath); } catch (e) {}
    const results = findInteractions(herbs, drugs, {});
    return res.json({ count: results.length, results, herbs, drugs });
  };

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

app.get('/api/list', (req, res) => {
  const herbs = new Set();
  const drugs = new Set();
  interactionsDB.forEach(r => {
    if (r.herb) herbs.add(r.herb_raw || r.herb);
    if (r.drug) drugs.add(r.drug_raw || r.drug);
  });
  res.json({ herbs: Array.from(herbs).slice(0, 2000), drugs: Array.from(drugs).slice(0, 2000) });
});

app.get('/api/aggregate', (req, res) => {
  const counts = { total: interactionsDB.length, severity: { none: 0, mild: 0, moderate: 0, severe: 0 } };
  const herbCounts = {};
  // build list of sample "interaction objects" to use with severity.calculateTotalRisk (if desired)
  const interactionsForCalc = [];
  interactionsDB.forEach(r => {
    const baseNum = severityStringToNumber(r.severity, r.severity_inferred);
    if (baseNum >= 3) counts.severity.severe++;
    else if (baseNum === 2) counts.severity.moderate++;
    else if (baseNum === 1) counts.severity.mild++;
    else counts.severity.none++;

    herbCounts[r.herb_raw || r.herb] = (herbCounts[r.herb_raw || r.herb] || 0) + 1;
    interactionsForCalc.push({ description: r.recommendation || r.mechanism || r.interaction_text || '' });
  });
  const topHerbs = Object.entries(herbCounts).sort((a,b)=>b[1]-a[1]).slice(0,10);
  // you may compute an overall total risk with your module:
  const totalRisk = sev.calculateTotalRisk ? sev.calculateTotalRisk(interactionsForCalc) : null;
  res.json({ counts, topHerbs, totalRisk });
});

const PORT = process.env.PORT || 3000;
loadCSV().then(() => {
  app.listen(PORT, () => console.log(`AI-CDSS Server running on port ${PORT}`));
}).catch(err => {
  console.error('Failed to load CSV:', err);
  app.listen(PORT, () => console.log(`AI-CDSS Server running (CSV not loaded) on port ${PORT}`));
});
