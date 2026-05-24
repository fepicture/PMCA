import { loadConfigs } from "../service/configService";
import { submissionListener, monitorSubmissionResult } from "./submission";

console.log(`Hello PMCA!`);

await loadConfigs();

document.addEventListener('click', submissionListener);

document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        // Only fire if we're on a problem page with a visible submit button.
        if (document.querySelector('[data-e2e-locator="console-submit-button"]')) {
            monitorSubmissionResult();
        }
    }
});
