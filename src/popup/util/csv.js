/*
    Minimal, dependency-free CSV serializer / parser (RFC-4180 style).

    - Serializer quotes every field and doubles embedded double-quotes.
    - Parser handles quoted fields containing commas, quotes and newlines,
      tolerates both LF and CRLF line endings, and strips a leading UTF-8 BOM.
*/

const escapeField = (value) => {
    const s = value === null || value === undefined ? "" : String(value);
    return `"${s.replace(/"/g, '""')}"`;
};

/*
    rows: array of arrays (the first row is conventionally the header).
    Returns a CSV string with CRLF line endings.
*/
export const toCsv = (rows) => {
    return rows.map(row => row.map(escapeField).join(",")).join("\r\n");
};

/*
    Parse a CSV string into an array of row arrays.
    Empty input -> []. A trailing newline does not produce a spurious empty row.
*/
export const parseCsv = (text) => {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    let pending = false; // true once the current row/field has any content to flush
    let i = 0;
    const n = text.length;

    // Strip a leading UTF-8 BOM if present.
    if (n > 0 && text.charCodeAt(0) === 0xFEFF) i = 1;

    for (; i < n; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                field += c;
            }
        } else if (c === '"') {
            inQuotes = true;
            pending = true;
        } else if (c === ",") {
            row.push(field);
            field = "";
            pending = true;
        } else if (c === "\n" || c === "\r") {
            if (c === "\r" && text[i + 1] === "\n") i++; // CRLF -> single break
            row.push(field);
            rows.push(row);
            row = [];
            field = "";
            pending = false;
        } else {
            field += c;
            pending = true;
        }
    }

    // Flush the last field/row only if there is trailing content.
    if (pending || field.length > 0 || row.length > 0) {
        row.push(field);
        rows.push(row);
    }

    return rows;
};
