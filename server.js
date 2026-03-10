const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const Papa = require("papaparse");
const XLSX = require("xlsx");
const cors = require("cors");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

/* -----------------------------
UPLOAD CONFIG
------------------------------*/

const upload = multer({ dest: "uploads/" });

/* -----------------------------
DATABASE
------------------------------*/

let interactionsDB = [];

/* -----------------------------
SEVERITY FUNCTIONS
------------------------------*/

function severityLabel(score) {

    if (score >= 3) return "Major / Contraindicated";
    if (score === 2) return "Moderate";
    return "Minor";

}

function computeAdjustedSeverity(baseScore) {

    let score = baseScore;

    if (score < 1) score = 1;
    if (score > 3) score = 3;

    return score;

}

/* -----------------------------
RECOMMENDATION GENERATOR
------------------------------*/

function generateRecommendation(severity, baseRec) {

    if (baseRec) return baseRec;

    if (severity === 3)
        return "Avoid combination or consult physician immediately.";

    if (severity === 2)
        return "Use with caution and monitor clinical parameters.";

    return "Low clinical risk but monitor patient response.";

}

/* -----------------------------
LOAD CSV DATABASE
------------------------------*/

function loadCSV() {

    const csvPath = path.join(__dirname, "data", "interactions.csv");

    const file = fs.readFileSync(csvPath, "utf8");

    const parsed = Papa.parse(file, {
        header: true,
        skipEmptyLines: true
    });

    parsed.data.forEach(row => {

        const herb = (row.herb || "").trim();
        const drug = (row.drug || "").trim();

        if (!herb || !drug) return;

        interactionsDB.push({

            herb: herb.toLowerCase(),
            drug: drug.toLowerCase(),

            herb_raw: herb,
            drug_raw: drug,

            interaction_text: row.interaction_text || "",
            mechanism: row.mechanism || "",
            evidence: row.evidence_level || "",

            severity: row.severity || "",
            severity_score: parseInt(row.severity_score) || 1,

            recommendation: row.recommendation || "",
            citation: row.citation_url || ""

        });

    });

    console.log("Loaded interactions:", interactionsDB.length);

}

loadCSV();

/* -----------------------------
BUILD RESULT
------------------------------*/

function buildResult(rec) {

    const baseSeverity = rec.severity_score || 1;

    const adjusted = computeAdjustedSeverity(baseSeverity);

    return {

        herb: rec.herb_raw,
        drug: rec.drug_raw,

        mechanism: rec.mechanism,

        interaction: rec.interaction_text,

        severity_label: severityLabel(adjusted),

        severity_score: adjusted,

        recommendation: generateRecommendation(
            adjusted,
            rec.recommendation
        ),

        citation: rec.citation

    };

}

/* -----------------------------
GET HERB + DRUG LIST
------------------------------*/

app.get("/api/list", (req, res) => {

    const herbs = [...new Set(interactionsDB.map(i => i.herb_raw))];
    const drugs = [...new Set(interactionsDB.map(i => i.drug_raw))];

    res.json({ herbs, drugs });

});

/* -----------------------------
MANUAL CHECK
------------------------------*/

app.post("/api/manual-check", (req, res) => {

    const { herbs, drugs } = req.body;

    if (!herbs || !drugs)
        return res.json({ results: [] });

    const results = [];

    herbs.forEach(h => {

        drugs.forEach(d => {

            const herb = h.toLowerCase();
            const drug = d.toLowerCase();

            const match = interactionsDB.find(
                i => i.herb === herb && i.drug === drug
            );

            if (match) {

                results.push(buildResult(match));

            }

        });

    });

    res.json({ results });

});

/* -----------------------------
UPLOAD PRESCRIPTION FILE
------------------------------*/

app.post("/api/upload", upload.single("file"), (req, res) => {

    if (!req.file)
        return res.json({ results: [] });

    const ext = path.extname(req.file.originalname);

    let rows = [];

    try {

        if (ext === ".csv") {

            const file = fs.readFileSync(req.file.path, "utf8");

            const parsed = Papa.parse(file, { header: true });

            rows = parsed.data;

        }

        if (ext === ".xlsx") {

            const workbook = XLSX.readFile(req.file.path);

            const sheet = workbook.Sheets[workbook.SheetNames[0]];

            rows = XLSX.utils.sheet_to_json(sheet);

        }

    } catch (err) {

        return res.json({ error: "file_parse_error" });

    }

    const herbs = [];
    const drugs = [];

    rows.forEach(r => {

        if (r.herb) herbs.push(r.herb.toLowerCase());
        if (r.drug) drugs.push(r.drug.toLowerCase());

    });

    const results = [];

    herbs.forEach(h => {

        drugs.forEach(d => {

            const match = interactionsDB.find(
                i => i.herb === h && i.drug === d
            );

            if (match)
                results.push(buildResult(match));

        });

    });

    res.json({ results });

});

/* -----------------------------
DASHBOARD DATA
------------------------------*/

app.get("/api/dashboard", (req, res) => {

    const severityCounts = {
        major: 0,
        moderate: 0,
        minor: 0
    };

    const herbCounts = {};

    interactionsDB.forEach(i => {

        const sev = i.severity_score;

        if (sev === 3) severityCounts.major++;
        else if (sev === 2) severityCounts.moderate++;
        else severityCounts.minor++;

        herbCounts[i.herb_raw] =
            (herbCounts[i.herb_raw] || 0) + 1;

    });

    res.json({

        severity: severityCounts,
        herbs: herbCounts

    });

});

/* -----------------------------
START SERVER
------------------------------*/

app.listen(PORT, () => {

    console.log("AI CDSS running on port", PORT);

});
