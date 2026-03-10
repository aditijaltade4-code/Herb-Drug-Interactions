const express = require("express");
const fs = require("fs");
const csv = require("csv-parser");
const app = express();

app.use(express.json());

let interactionData = [];

/* ---------------------------------------------------
   1. Load CSV File with Herb-Drug Interaction Data
---------------------------------------------------*/
function loadCSV() {
    return new Promise((resolve, reject) => {

        interactionData = [];

        fs.createReadStream("./data/interactions.csv")
            .pipe(csv())
            .on("data", (row) => {

                interactionData.push({
                    herb: row.herb.toLowerCase(),
                    drug: row.drug.toLowerCase(),
                    mechanism: row.mechanism,
                    severity: row.severity,
                    recommendation: row.recommendation
                });

            })
            .on("end", () => {
                console.log("CSV Interaction Data Loaded");
                resolve();
            })
            .on("error", reject);

    });
}

/* ---------------------------------------------------
   2. Find Herb-Drug Interactions
---------------------------------------------------*/
function findInteractions(inputDrugs, inputHerbs) {

    let foundInteractions = [];

    inputDrugs = inputDrugs.map(d => d.toLowerCase());
    inputHerbs = inputHerbs.map(h => h.toLowerCase());

    interactionData.forEach(record => {

        if (
            inputDrugs.includes(record.drug) &&
            inputHerbs.includes(record.herb)
        ) {

            foundInteractions.push({
                herb: record.herb,
                drug: record.drug,
                mechanism: record.mechanism,
                severity: record.severity
            });

        }

    });

    return foundInteractions;
}

/* ---------------------------------------------------
   3. Severity Risk Calculation
---------------------------------------------------*/
function severityCalculation(interactions) {

    let score = 0;

    interactions.forEach(i => {

        if (i.severity === "High") score += 3;
        else if (i.severity === "Moderate") score += 2;
        else score += 1;

    });

    let riskLevel = "Low";

    if (score >= 6) riskLevel = "High";
    else if (score >= 3) riskLevel = "Moderate";

    return {
        totalScore: score,
        riskLevel: riskLevel
    };
}

/* ---------------------------------------------------
   4. Safety Recommendation Generator
---------------------------------------------------*/
function recommendSafety(interactions) {

    let recommendations = [];

    interactions.forEach(i => {

        if (i.severity === "High") {

            recommendations.push(
                `Avoid using ${i.herb} with ${i.drug}. Consult physician immediately.`
            );

        }

        else if (i.severity === "Moderate") {

            recommendations.push(
                `Use ${i.herb} with caution when taking ${i.drug}. Monitor patient closely.`
            );

        }

        else {

            recommendations.push(
                `Minor interaction between ${i.herb} and ${i.drug}. Clinical monitoring recommended.`
            );

        }

    });

    return recommendations;
}

/* ---------------------------------------------------
   API Endpoint
---------------------------------------------------*/
app.post("/checkInteractions", (req, res) => {

    const { drugs, herbs } = req.body;

    let interactions = findInteractions(drugs, herbs);

    let severity = severityCalculation(interactions);

    let safetyAdvice = recommendSafety(interactions);

    res.json({
        interactions: interactions,
        severityAssessment: severity,
        safetyRecommendations: safetyAdvice
    });

});

/* ---------------------------------------------------
   Start Server
---------------------------------------------------*/
loadCSV().then(() => {

    app.listen(3000, () => {
        console.log("AI-CDSS Server Running on Port 3000");
    });

});
