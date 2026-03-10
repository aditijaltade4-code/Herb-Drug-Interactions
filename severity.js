/* --------------------------------------------------
   Severity Calculation Module
   Used for Herb-Drug Interaction Risk Assessment
--------------------------------------------------*/

/*
Severity Score System
1 = Minor
2 = Moderate
3 = Major / Contraindicated
*/

function calculateSeverity(interactionText) {

    if (!interactionText) return 0;

    const text = interactionText.toLowerCase();

    if (
        text.includes("contraindicated") ||
        text.includes("avoid combination") ||
        text.includes("serious") ||
        text.includes("life threatening")
    ) {
        return 3;
    }

    if (
        text.includes("monitor") ||
        text.includes("moderate") ||
        text.includes("dose adjustment") ||
        text.includes("caution")
    ) {
        return 2;
    }

    if (
        text.includes("minor") ||
        text.includes("unlikely") ||
        text.includes("minimal")
    ) {
        return 1;
    }

    return 1;
}

/* --------------------------------------------------
   Convert Score to Severity Category
--------------------------------------------------*/
function getSeverityLabel(score) {

    switch (score) {
        case 3:
            return "Major / Contraindicated";
        case 2:
            return "Moderate";
        case 1:
            return "Minor";
        default:
            return "Unknown";
    }
}

/* --------------------------------------------------
   Calculate Total Risk for Multiple Interactions
--------------------------------------------------*/
function calculateTotalRisk(interactions) {

    let totalScore = 0;

    interactions.forEach(interaction => {
        totalScore += calculateSeverity(interaction.description || interaction);
    });

    let overallRisk = "Low";

    if (totalScore >= 6) overallRisk = "High";
    else if (totalScore >= 3) overallRisk = "Moderate";

    return {
        totalScore,
        overallRisk
    };
}

/* --------------------------------------------------
   Clinical Severity Explanation
--------------------------------------------------*/
function severityExplanation(score) {

    if (score === 3) {
        return "High clinical risk. Combination should generally be avoided due to potential serious adverse effects.";
    }

    if (score === 2) {
        return "Moderate interaction risk. Careful monitoring or dose adjustment may be required.";
    }

    if (score === 1) {
        return "Minor interaction. Clinical effects are usually limited but monitoring is recommended.";
    }

    return "Severity could not be determined.";
}

/* --------------------------------------------------
   Export Functions
--------------------------------------------------*/

module.exports = {
    calculateSeverity,
    getSeverityLabel,
    calculateTotalRisk,
    severityExplanation
};
