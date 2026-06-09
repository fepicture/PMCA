import { CN_PROBLEM_KEY, PROBLEM_KEY } from "../util/keys";
import { getLocalStorageData } from "../delegate/localStorageDelegate";
import { toCsv } from "../util/csv";

/*
    Export both stores (Global + CN) as a single CSV backup.
    Time columns are kept as raw epoch milliseconds so an exported file can be
    re-imported losslessly. isDeleted rows are included so the dump is faithful.
*/

export const CSV_HEADER = [
    "site", "index", "name", "level", "url",
    "proficiency", "submissionTime", "modificationTime", "isDeleted",
];

// UTF-8 byte-order mark; prepended so spreadsheet apps detect the encoding.
const BOM = String.fromCharCode(0xFEFF);

const problemsToRows = (problems, site) => {
    return Object.values(problems || {}).map(p => [
        site,
        p.index,
        p.name,
        p.level,
        p.url,
        p.proficiency,
        p.submissionTime,
        p.modificationTime,
        p.isDeleted === true,
    ]);
};

export const buildRecordsCsv = async () => {
    const globalProblems = await getLocalStorageData(PROBLEM_KEY);
    const cnProblems = await getLocalStorageData(CN_PROBLEM_KEY);

    const rows = [CSV_HEADER];
    rows.push(...problemsToRows(globalProblems, "global"));
    rows.push(...problemsToRows(cnProblems, "cn"));
    return toCsv(rows);
};

const todayStamp = () => {
    const d = new Date();
    const pad = (x) => String(x).padStart(2, "0");
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
};

export const exportRecordsToCsv = async () => {
    const csv = await buildRecordsCsv();
    const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pmca-records-${todayStamp()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};
