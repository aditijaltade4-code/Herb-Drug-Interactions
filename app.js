/* ---------------------------------------
MANUAL HERB DRUG INTERACTION CHECK
----------------------------------------*/

async function manualInteractionCheck() {

    const herb = document.getElementById("herbInput").value;
    const drug = document.getElementById("drugInput").value;

    if (!herb || !drug) {
        alert("Please enter both herb and drug");
        return;
    }

    try {

        const response = await fetch("/api/manual-check", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                herbs: [herb],
                drugs: [drug]
            })
        });

        const data = await response.json();

        displayResults(data.results);

    } catch (error) {

        console.error("Manual check error:", error);
        alert("Error running interaction check");

    }

}


/* ---------------------------------------
PRESCRIPTION TEXT ANALYSIS
----------------------------------------*/

document.getElementById("analyzeBtn").addEventListener("click", runAnalysis);

async function runAnalysis() {

    const text = document.getElementById("prescriptionInput").value;

    if (!text) {
        alert("Please enter prescription text");
        return;
    }

    const herbs = [
        "triphala",
        "guggul",
        "ashwagandha",
        "chandraprabhavati"
    ];

    const drugs = [
        "metformin",
        "aspirin",
        "glimepiride",
        "pantoprazole",
        "ciprofloxacin",
        "atorvastatin",
        "amlodipine",
        "clopidogrel",
        "azithromycin",
        "fluconazole",
        "amitriptyline",
        "atenolol",
        "norfloxacin",
        "escitalopram",
        "propranolol",
        "risperidone",
        "diclofenac"
    ];

    const foundHerbs = herbs.filter(h =>
        text.toLowerCase().includes(h)
    );

    const foundDrugs = drugs.filter(d =>
        text.toLowerCase().includes(d)
    );

    if (foundHerbs.length === 0 || foundDrugs.length === 0) {
        alert("No herbs or drugs detected in text");
        return;
    }

    try {

        const response = await fetch("/api/manual-check", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                herbs: foundHerbs,
                drugs: foundDrugs
            })
        });

        const data = await response.json();

        displayResults(data.results);

    } catch (error) {

        console.error("Analysis error:", error);
        alert("Analysis failed");

    }

}


/* ---------------------------------------
DISPLAY RESULTS
----------------------------------------*/

function displayResults(results) {

    const resultsDiv = document.getElementById("results");

    resultsDiv.innerHTML = "";

    if (!results || results.length === 0) {

        resultsDiv.innerHTML =
            "<p>No interactions detected.</p>";

        return;
    }

    results.forEach(r => {

        const card = document.createElement("div");

        card.className = "result-card";

        card.innerHTML = `
            <h3>${r.herb} + ${r.drug}</h3>

            <p><b>Interaction:</b> ${r.interaction}</p>

            <p><b>Mechanism:</b> ${r.mechanism}</p>

            <p><b>Severity:</b> ${r.severity_label}</p>

            <p><b>Recommendation:</b> ${r.recommendation}</p>

            <p><b>Reference:</b> 
            <a href="${r.citation}" target="_blank">
            PubMed Link
            </a></p>
        `;

        resultsDiv.appendChild(card);

    });

}
