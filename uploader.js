/* ---------------------------------------------
   Prescription / File Upload Handler
----------------------------------------------*/

const fileInput = document.getElementById("fileUpload");
const resultContainer = document.getElementById("interactionResults");

/* ---------------------------------------------
   Read Uploaded File
----------------------------------------------*/

fileInput.addEventListener("change", function (event) {

    const file = event.target.files[0];

    if (!file) {
        alert("Please upload a file");
        return;
    }

    const reader = new FileReader();

    reader.onload = function (e) {

        const fileContent = e.target.result;

        processFile(fileContent);

    };

    reader.readAsText(file);

});


/* ---------------------------------------------
   Extract Drugs & Herbs from File
----------------------------------------------*/

function processFile(content) {

    const lines = content.split("\n");

    let drugs = [];
    let herbs = [];

    lines.forEach(line => {

        const item = line.trim().toLowerCase();

        if (!item) return;

        /* Example classification rule
           (you can replace this with AI/NLP later) */

        if (
            item.includes("aspirin") ||
            item.includes("warfarin") ||
            item.includes("metformin") ||
            item.includes("ciprofloxacin")
        ) {
            drugs.push(item);
        }

        else {
            herbs.push(item);
        }

    });

    sendToServer(drugs, herbs);

}


/* ---------------------------------------------
   Send Data to Backend Server
----------------------------------------------*/

function sendToServer(drugs, herbs) {

    fetch("/checkInteractions", {

        method: "POST",

        headers: {
            "Content-Type": "application/json"
        },

        body: JSON.stringify({
            drugs: drugs,
            herbs: herbs
        })

    })
        .then(response => response.json())
        .then(data => {

            displayResults(data);

        })
        .catch(error => {

            console.error("Error:", error);

        });

}


/* ---------------------------------------------
   Display Interaction Results on Dashboard
----------------------------------------------*/

function displayResults(data) {

    resultContainer.innerHTML = "";

    if (!data.interactions || data.interactions.length === 0) {

        resultContainer.innerHTML =
            "<p>No Herb-Drug Interactions Detected</p>";

        return;
    }

    let html = "<h3>Detected Interactions</h3>";

    data.interactions.forEach(interaction => {

        html += `
        <div class="interaction-card">
            <p><b>Herb:</b> ${interaction.herb}</p>
            <p><b>Drug:</b> ${interaction.drug}</p>
            <p><b>Mechanism:</b> ${interaction.mechanism}</p>
            <p><b>Severity:</b> ${interaction.severity}</p>
        </div>
        `;

    });

    html += `
        <h3>Risk Assessment</h3>
        <p><b>Total Score:</b> ${data.severityAssessment.totalScore}</p>
        <p><b>Risk Level:</b> ${data.severityAssessment.riskLevel}</p>
    `;

    html += "<h3>Safety Recommendations</h3>";

    data.safetyRecommendations.forEach(rec => {

        html += `<p>• ${rec}</p>`;

    });

    resultContainer.innerHTML = html;

}
