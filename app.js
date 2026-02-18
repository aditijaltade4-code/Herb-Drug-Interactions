let interactionDB = [];

// 1. Load the CSV Data immediately
Papa.parse("HDI csv.csv", {
    download: true,
    header: false,
    complete: function(results) {
        // Clean and structure the data
        interactionDB = results.data.map(row => {
            const [pair, mechanism] = row;
            if (pair && pair.includes('+')) {
                const parts = pair.split('+');
                return {
                    herb: parts[0].trim().toLowerCase(),
                    drug: parts[1].trim().toLowerCase(),
                    mechanism: mechanism
                };
            }
            return null;
        }).filter(item => item !== null);
        console.log("Database loaded:", interactionDB.length, "interactions.");
    }
});

// 2. Interaction Detection Engine
document.getElementById('analyzeBtn').addEventListener('click', () => {
    const input = document.getElementById('prescriptionInput').value.toLowerCase();
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = ""; // Clear old results

    const matches = interactionDB.filter(item => 
        input.includes(item.herb) && input.includes(item.drug)
    );

    if (matches.length === 0) {
        resultsDiv.innerHTML = "<p style='text-align:center; color: #666;'>No interactions detected.</p>";
        return;
    }

    matches.forEach(m => {
        const { risk, recommendation, cssClass } = getClinicalGuidance(m.mechanism);
        
        resultsDiv.innerHTML += `
            <div class="card ${cssClass}">
                <span class="risk-badge">${risk}</span>
                <h3>${m.herb.toUpperCase()} + ${m.drug.toUpperCase()}</h3>
                <p><strong>Mechanism:</strong> ${m.mechanism}</p>
                <p><strong>Clinical Recommendation:</strong> ${recommendation}</p>
            </div>
        `;
    });
});

// 3. AI logic for Risk Prediction
function getClinicalGuidance(mech) {
    const m = mech.toLowerCase();
    if (m.includes("bleeding") || m.includes("failure") || m.includes("toxicity") || m.includes("increased effect")) {
        return { risk: "HIGH RISK", cssClass: "high", recommendation: "Contraindicated. Strictly avoid or use alternative therapy." };
    } else if (m.includes("decreased") || m.includes("reduced") || m.includes("fluctuating")) {
        return { risk: "MODERATE RISK", cssClass: "moderate", recommendation: "Monitor drug levels and clinical response closely." };
    } else {
        return { risk: "POTENTIAL SYNERGY", cssClass: "low", recommendation: "Observe for enhanced effects; potential beneficial interaction." };
    }
}
