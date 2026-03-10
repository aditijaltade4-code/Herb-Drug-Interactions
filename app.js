document.getElementById("analyzeBtn").addEventListener("click", runAnalysis);

async function runAnalysis() {

    const text = document.getElementById("prescriptionInput").value.trim();

    if (!text) {
        alert("Please enter prescription text");
        return;
    }

    const lowerText = text.toLowerCase();

    /* Herb list */
    const herbs = [
        "triphala",
        "guggul",
        "ashwagandha",
        "chandraprabhavati"
    ];

    /* Drug list */
    const drugs = [
        "metformin","aspirin","glimepiride","pantoprazole","ciprofloxacin",
        "atorvastatin","amlodipine","clopidogrel","azithromycin",
        "fluconazole","amitriptyline","atenolol","norfloxacin",
        "escitalopram","propranolol","risperidone","diclofenac"
    ];

    const foundHerbs = herbs.filter(h => lowerText.includes(h));
    const foundDrugs = drugs.filter(d => lowerText.includes(d));

    /* DEBUG INFO */
    console.log("Detected Herbs:", foundHerbs);
    console.log("Detected Drugs:", foundDrugs);

    if(foundHerbs.length === 0 || foundDrugs.length === 0){
        document.getElementById("results").innerHTML =
        `<p style="color:red">No herbs or drugs detected in the text.</p>`;
        return;
    }

    try{

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

        console.log("Server Response:", data);

        displayResults(data.results);

    }catch(error){

        console.error("API Error:", error);

        document.getElementById("results").innerHTML =
        `<p style="color:red">Server connection error. Make sure Node server is running.</p>`;
    }
}


function displayResults(results){

    const resultsDiv = document.getElementById("results");
    resultsDiv.innerHTML = "";

    if(!results || results.length === 0){
        resultsDiv.innerHTML = "<p>No interactions detected.</p>";
        return;
    }

    results.forEach(r => {

        const card = document.createElement("div");

        card.className = "card";

        /* severity color */
        if(r.severity_label.includes("Contraindicated")) card.classList.add("high");
        else if(r.severity_label.includes("Moderate")) card.classList.add("moderate");
        else card.classList.add("low");

        card.innerHTML = `
            <h3>${r.herb} + ${r.drug}</h3>
            <p><b>Mechanism:</b> ${r.mechanism || "Not available"}</p>
            <p><b>Severity:</b> ${r.severity_label}</p>
            <p><b>Recommendation:</b> ${r.recommendation}</p>
        `;

        resultsDiv.appendChild(card);
    });
}
