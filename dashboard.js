/* ---------------------------------------------------
   Dashboard Analytics for AI-CDSS
---------------------------------------------------*/

let interactionData = [];

/* ---------------------------------------------------
   Load Interaction Data from Server
---------------------------------------------------*/

async function loadDashboard() {

    try {

        const response = await fetch("/dashboard-data");
        const data = await response.json();

        interactionData = data.interactions;

        renderSeverityDistribution();
        renderTopHerbs();
        renderTopDrugs();

    } catch (error) {

        console.error("Dashboard Load Error:", error);

    }

}


/* ---------------------------------------------------
   1. Severity Distribution Chart
---------------------------------------------------*/

function renderSeverityDistribution() {

    let severityCount = {
        High: 0,
        Moderate: 0,
        Minor: 0
    };

    interactionData.forEach(item => {

        if (item.severity === "High") severityCount.High++;
        else if (item.severity === "Moderate") severityCount.Moderate++;
        else severityCount.Minor++;

    });

    const ctx = document.getElementById("severityChart");

    new Chart(ctx, {
        type: "pie",
        data: {
            labels: ["High", "Moderate", "Minor"],
            datasets: [{
                data: [
                    severityCount.High,
                    severityCount.Moderate,
                    severityCount.Minor
                ],
                backgroundColor: [
                    "#ff4d4d",
                    "#ffcc00",
                    "#66cc66"
                ]
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: "Interaction Severity Distribution"
                }
            }
        }
    });

}


/* ---------------------------------------------------
   2. Top Herbs Involved in Interactions
---------------------------------------------------*/

function renderTopHerbs() {

    let herbCounts = {};

    interactionData.forEach(item => {

        if (!herbCounts[item.herb]) {
            herbCounts[item.herb] = 0;
        }

        herbCounts[item.herb]++;

    });

    const sortedHerbs = Object.entries(herbCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    const labels = sortedHerbs.map(h => h[0]);
    const values = sortedHerbs.map(h => h[1]);

    const ctx = document.getElementById("herbChart");

    new Chart(ctx, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [{
                label: "Interaction Count",
                data: values,
                backgroundColor: "#4CAF50"
            }]
        },
        options: {
            plugins: {
                title: {
                    display: true,
                    text: "Top Herbs Involved in Interactions"
                }
            }
        }
    });

}


/* ---------------------------------------------------
   3. Top Interacting Drugs
---------------------------------------------------*/

function renderTopDrugs() {

    let drugCounts = {};

    interactionData.forEach(item => {

        if (!drugCounts[item.drug]) {
            drugCounts[item.drug] = 0;
        }

        drugCounts[item.drug]++;

    });

    const sortedDrugs = Object.entries(drugCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    const labels = sortedDrugs.map(d => d[0]);
    const values = sortedDrugs.map(d => d[1]);

    const ctx = document.getElementById("drugChart");

    new Chart(ctx, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [{
                label: "Interaction Count",
                data: values,
                backgroundColor: "#2196F3"
            }]
        },
        options: {
            plugins: {
                title: {
                    display: true,
                    text: "Top Interacting Drugs"
                }
            }
        }
    });

}


/* ---------------------------------------------------
   Initialize Dashboard
---------------------------------------------------*/

window.onload = function () {

    loadDashboard();

};
