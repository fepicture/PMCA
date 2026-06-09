import './popup.css';
import { loadConfigs, setProblemSorter } from "./service/configService";
import { optionPageFeedbackMsgDOM } from './util/doms';
import { descriptionOf, idOf, problemSorterArr } from "./util/sort";
import { exportRecordsToCsv } from "./service/exportService";
import { importRecordsFromCsv } from "./service/importService";
import { clearAllProblems } from "./service/problemService";

document.addEventListener('DOMContentLoaded', async () => {

    await loadConfigs();

    const optionsForm = document.getElementById('optionsForm');

    // problem sorter setting
    const problemSorterSelect = document.getElementById('problemSorterSelect');
    const problemSorterMetaArr = problemSorterArr.map(sorter => ({
        id: idOf(sorter),
        text: descriptionOf(sorter),
    }));

    problemSorterMetaArr.forEach(sorterMeta => {
        const optionElement = document.createElement('option');
        optionElement.value = sorterMeta.id;
        optionElement.textContent = sorterMeta.text;
        problemSorterSelect.append(optionElement);
    });

    optionsForm.addEventListener('submit', async e => {
        e.preventDefault();
        const selectedSorterId = problemSorterSelect.value;
        await setProblemSorter(Number(selectedSorterId));
        optionPageFeedbackMsgDOM.style.display = 'block';
        setTimeout(() => optionPageFeedbackMsgDOM.style.display = 'none', 1000);
    });

    // data management: export / import / clear
    const dataFeedbackDOM = document.getElementById('dataFeedback');
    const showDataFeedback = (message, isError = false) => {
        dataFeedbackDOM.textContent = message;
        dataFeedbackDOM.classList.remove('alert-success', 'alert-danger');
        dataFeedbackDOM.classList.add(isError ? 'alert-danger' : 'alert-success');
        dataFeedbackDOM.style.display = 'block';
        setTimeout(() => dataFeedbackDOM.style.display = 'none', 4000);
    };

    document.getElementById('exportCsvBtn').addEventListener('click', async () => {
        try {
            await exportRecordsToCsv();
            showDataFeedback('Records exported to CSV.');
        } catch (err) {
            console.log(err);
            showDataFeedback('Export failed. See console for details.', true);
        }
    });

    const importInput = document.getElementById('importCsvInput');
    document.getElementById('importCsvBtn').addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', async () => {
        const file = importInput.files && importInput.files[0];
        if (!file) return;
        try {
            const { added, updated, skipped } = await importRecordsFromCsv(await file.text());
            showDataFeedback(`Import complete: ${added} added, ${updated} updated, ${skipped} unchanged.`);
        } catch (err) {
            console.log(err);
            showDataFeedback('Import failed: could not read the CSV. See console.', true);
        } finally {
            importInput.value = ''; // let the same file be re-selected later
        }
    });

    document.getElementById('confirmClearBtn').addEventListener('click', async () => {
        try {
            await clearAllProblems();
            showDataFeedback('All records cleared.');
        } catch (err) {
            console.log(err);
            showDataFeedback('Clear failed. See console for details.', true);
        }
    });
});
