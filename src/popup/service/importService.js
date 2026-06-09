import { CN_PROBLEM_KEY, PROBLEM_KEY } from "../util/keys";
import { getLocalStorageData, setLocalStorageData } from "../delegate/localStorageDelegate";
import { parseCsv } from "../util/csv";
import { Problem } from "../entity/problem";

/*
    Restore records from a CSV produced by exportService (or a compatible file).
    Merge is non-destructive: records are keyed by (site, index); on a conflict
    the row with the newer modificationTime wins, and records that exist only
    locally are kept. To get an exact replace, clear all records first, then import.
*/

/*
    Turn parsed CSV rows (first row = header) into keyed maps:
    { global: {index: Problem}, cn: {index: Problem} }.
    Columns are matched by header name; unknown columns are ignored and missing
    ones default sensibly. Rows without an index are skipped.
*/
const rowsToRecords = (rows) => {
    const result = { global: {}, cn: {} };
    if (!rows || rows.length < 2) return result;

    const header = rows[0].map(h => String(h).trim());
    const col = (name) => header.indexOf(name);
    const siteCol = col("site");
    const idxCol = col("index");
    const nameCol = col("name");
    const levelCol = col("level");
    const urlCol = col("url");
    const profCol = col("proficiency");
    const subCol = col("submissionTime");
    const modCol = col("modificationTime");
    const delCol = col("isDeleted");

    const at = (r, i) => (i >= 0 && i < r.length ? r[i] : "");

    for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        // Skip blank lines (parser may emit a single empty field for these).
        if (r.length === 1 && String(r[0]).trim() === "") continue;

        const index = String(at(r, idxCol)).trim();
        if (index === "") continue;

        const site = String(at(r, siteCol)).trim().toLowerCase() === "cn" ? "cn" : "global";

        const problem = new Problem(
            index,
            at(r, nameCol),
            at(r, levelCol),
            at(r, urlCol),
            Number(at(r, subCol)) || 0,
            Number(at(r, profCol)) || 0,
            Number(at(r, modCol)) || 0,
        );
        problem.isDeleted = /^(true|1)$/i.test(String(at(r, delCol)).trim());

        result[site][index] = problem;
    }

    return result;
};

/*
    Merge `incoming` into `existing` (newer modificationTime wins).
    Returns { merged, added, updated, skipped }.
*/
const mergeInto = (existing, incoming) => {
    const merged = { ...(existing || {}) };
    let added = 0, updated = 0, skipped = 0;

    for (const [index, incomingProblem] of Object.entries(incoming)) {
        const current = merged[index];
        if (!current) {
            merged[index] = incomingProblem;
            added++;
        } else if ((Number(incomingProblem.modificationTime) || 0) > (Number(current.modificationTime) || 0)) {
            merged[index] = incomingProblem;
            updated++;
        } else {
            skipped++;
        }
    }

    return { merged, added, updated, skipped };
};

export const importRecordsFromCsv = async (csvText) => {
    const { global, cn } = rowsToRecords(parseCsv(csvText));

    const existingGlobal = await getLocalStorageData(PROBLEM_KEY);
    const existingCn = await getLocalStorageData(CN_PROBLEM_KEY);

    const g = mergeInto(existingGlobal, global);
    const c = mergeInto(existingCn, cn);

    await setLocalStorageData(PROBLEM_KEY, g.merged);
    await setLocalStorageData(CN_PROBLEM_KEY, c.merged);

    return {
        added: g.added + c.added,
        updated: g.updated + c.updated,
        skipped: g.skipped + c.skipped,
    };
};
