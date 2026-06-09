import { getDifficultyBasedSteps, getSubmissionResult, isSubmissionSuccess, needReview, updateProblemUponSuccessSubmission } from "../util/utils";
import { getAllProblems, createOrUpdateProblem, getCurrentProblemInfoFromLeetCode } from "../service/problemService";
import { Problem } from "../entity/problem";
import { SUBMIT_BUTTON_ATTRIBUTE_NAME, SUBMIT_BUTTON_ATTRIBUTE_VALUE } from "../util/constants";

const SUBMIT_BUTTON_SELECTOR = `[${SUBMIT_BUTTON_ATTRIBUTE_NAME}="${SUBMIT_BUTTON_ATTRIBUTE_VALUE}"]`;

let activeMonitorId = null;

/*
    Repeatedly poll for the submission result; track the problem on success.
    Concurrent calls are deduplicated - if a poll is already running, it is
    cleared and replaced. This handles the case where the user both clicks
    Submit and presses Ctrl+Enter back-to-back.
*/
export const monitorSubmissionResult = () => {

    if (activeMonitorId !== null) {
        clearInterval(activeMonitorId);
        activeMonitorId = null;
    }

    let submissionResult;
    let maxRetry = 10;
    const retryInterval = 1000;

    activeMonitorId = setInterval(async () => {

        if (maxRetry <= 0) {
            clearInterval(activeMonitorId);
            activeMonitorId = null;
            return;
        }

        submissionResult = getSubmissionResult();

        if (submissionResult === undefined || submissionResult.length === 0) {
            maxRetry--;
            return;
        }

        clearInterval(activeMonitorId);
        activeMonitorId = null;

        let isSuccess = isSubmissionSuccess(submissionResult);

        if (!isSuccess) return;

        const { problemIndex, problemName, problemLevel, problemUrl } = await getCurrentProblemInfoFromLeetCode();
        const problems = await getAllProblems();
        let problem = problems[problemIndex];

        if (problem && problem.isDeleted !== true) {
            const reviewNeeded = needReview(problem);
            if (reviewNeeded) {
                await createOrUpdateProblem(updateProblemUponSuccessSubmission(problem));
            }
        } else {
            problem = new Problem(problemIndex, problemName, problemLevel, problemUrl, Date.now(), getDifficultyBasedSteps(problemLevel)[0], Date.now());
            await createOrUpdateProblem(problem);
        }

        console.log("Submission successfully tracked!");

    }, retryInterval);
};

export const submissionListener = (event) => {
    // Climb to the submit button from wherever the click actually landed.
    // LeetCode nests the label/icon several levels deep, so the old fixed
    // 3-level parent walk missed clicks on deeper children; closest() handles
    // any nesting depth.
    const element = event.target;

    if (element && typeof element.closest === "function" && element.closest(SUBMIT_BUTTON_SELECTOR)) {
        monitorSubmissionResult();
    }
};
