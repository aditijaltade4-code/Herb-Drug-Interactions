document.getElementById("analyzeBtn").addEventListener("click", runAnalysis);

async function runAnalysis() {

    const text = document.getElementById("prescriptionInput").value;

    if (!text) {
        alert("Please enter prescription text");
        return;
    }

    /* Simple herb & drug extraction */
    const herbs = ["triphala","guggul","ashwagandha","chandraprabhavati"];
    const drugs = [
        "metformin","aspirin","glimepiride","pantoprazole","ciprofloxacin",
        "atorvastatin","amlodipine","clopidogrel","azithromycin",
        "fluconazole","amitriptyline","atenolol","norfloxacin",
        "escitalopram","propranolol","risperidone","diclofenac"
    ];

    const foundHerbs = herbs.filter(h => text.toLowerCase().includes(h));
    const foundDrugs = drugs.filter(d => text.toLowerCase().includes(d));

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
}

function displayResults(results){

    const resultsDiv = document.getElementById("results");
    resultsDiv.innerHTML = "";

    if(results.length === 0){
        resultsDiv.innerHTML = "<p>No interactions detected.</p>";
        return;
    }

    results.forEach(r => {

        const card = document.createElement("div");
        card.className = "card";

        card.innerHTML = `
            <h3>${r.herb} + ${r.drug}</h3>
            <p><b>Mechanism:</b> ${r.mechanism}</p>
            <p><b>Severity:</b> ${r.severity_label}</p>
            <p><b>Recommendation:</b> ${r.recommendation}</p>
        `;

        resultsDiv.appendChild(card);
    });
}
