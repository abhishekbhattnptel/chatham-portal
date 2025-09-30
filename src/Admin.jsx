import React, { useState } from "react";
import * as XLSX from "xlsx";

/** ---- CONFIG FROM YOUR SHEET ---- */
const DATES_ROW_1BASED = 4; // the row that contains the week dates
const NAME_COL = "A";
const ROLE_COL = "B"; // adjust if your Role is elsewhere

// Start/End column letters for each weekday
const COLS = {
  Mon: { start: "F", end: "G" },
  Tue: { start: "J", end: "K" },
  Wed: { start: "N", end: "O" },
  Thu: { start: "R", end: "S" },
  Fri: { start: "V", end: "W" },
  Sat: { start: "Z", end: "AA" },
  Sun: { start: "AD", end: "AE" },
};
/** -------------------------------- */

const colLetterToIndex = (L) => {
  // A -> 0, Z->25, AA->26, etc.
  let s = String(L).trim().toUpperCase();
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    n = n * 26 + (s.charCodeAt(i) - 64);
  }
  return n - 1;
};

const NAME_COL_IDX = colLetterToIndex(NAME_COL);
const ROLE_COL_IDX = colLetterToIndex(ROLE_COL);
const WEEK_COLS = Object.fromEntries(
  Object.entries(COLS).map(([d, v]) => [
    d,
    { start: colLetterToIndex(v.start), end: colLetterToIndex(v.end) },
  ])
);

const trim = (v) => (v == null ? "" : String(v).trim());

function toTimeStr(v) {
  if (v == null || v === "") return "";
  if (typeof v === "number") return XLSX.SSF.format("hh:mm", v);
  const s = String(v).trim();
  if (!s) return "";
  if (/^\d+(\.|:)\d{1,2}$/.test(s)) {
    const [hRaw, mRaw] = s.split(/[.:]/);
    const h = String(parseInt(hRaw, 10)).padStart(2, "0");
    const m = String(parseInt(mRaw, 10)).padStart(2, "0");
    return `${h}:${m}`;
  }
  if (/^\d{1,2}$/.test(s)) return `${String(parseInt(s, 10)).padStart(2, "0")}:00`;
  if (/^\d{1,2}:\d{1,2}$/.test(s)) {
    const [h, m] = s.split(":");
    return `${String(parseInt(h,10)).padStart(2,"0")}:${String(parseInt(m,10)).padStart(2,"0")}`;
  }
  return ""; // unrecognised
}

function toISODate(v) {
  if (v == null || v === "") return "";
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return "";
    const y = d.y, m = String(d.m).padStart(2,"0"), dd = String(d.d).padStart(2,"0");
    return `${y}-${m}-${dd}`;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (m) {
    const [_, dd, mm, yyyy] = m;
    return `${yyyy}-${mm.padStart(2,"0")}-${dd.padStart(2,"0")}`;
  }
  const d = new Date(s);
  if (!isNaN(d.valueOf())) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }
  return "";
}

function interpretMarker(a, b) {
  const t = `${trim(a)} ${trim(b)}`.toLowerCase();
  if (/\brdo\b|requested\s*off/.test(t)) return "Requested Off";
  if (/\bday\s*off\b|\boff\b|\bday\b/.test(t)) return "OFF";
  return "";
}

export default function Admin() {
  const [status, setStatus] = useState("");
  const [detected, setDetected] = useState({ datesISO: [] });
  const [preview, setPreview] = useState([]);

  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus("Reading file…");

    const reader = new FileReader();
    reader.onload = () => {
      const wb = XLSX.read(reader.result, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      if (!rows.length) { setStatus("Empty sheet"); return; }

      const dateRowIdx = DATES_ROW_1BASED - 1;
      const dateRow = rows[dateRowIdx] || [];

      // Build the 7 dates array by reading the Start columns for each day
      const dateKeys = Object.values(WEEK_COLS).map(({ start }) => toISODate(dateRow[start]));
      if (dateKeys.filter(Boolean).length < 5) {
        setStatus("Couldn’t read the dates from row 4. Check that the week dates sit in that row.");
        return;
      }

      // Find first staff row (below the header area)
      let firstStaff = dateRowIdx + 2;
      while (firstStaff < rows.length && !trim(rows[firstStaff][NAME_COL_IDX])) firstStaff++;

      const map = {}; // name -> dateISO -> [ {start,end,role} ]

      for (let r = firstStaff; r < rows.length; r++) {
        const row = rows[r];
        const name = trim(row[NAME_COL_IDX]);
        const role = trim(row[ROLE_COL_IDX]);
        if (!name) {
          // stop if a few empty rows encountered
          const nextHasData = (rows[r+1]||[]).some(Boolean);
          if (!nextHasData) break;
          continue;
        }
        // Skip side labels like "Opening Times", etc.
        if (/opening\s*times|holiday|requested offs|delivery days/i.test(name)) continue;

        let pushedAny = false;

        // iterate days in order of COLS
        const dayIsoList = [];
        const dayPairs = [];
        let i = 0;
        for (const day of Object.keys(COLS)) {
          const { start, end } = WEEK_COLS[day];
          const iso = dateKeys[i++] || "";
          dayIsoList.push(iso);
          dayPairs.push({ startCol: start, endCol: end, iso });
        }

        for (const dp of dayPairs) {
          const rawS = row[dp.startCol];
          const rawE = row[dp.endCol];

          const marker = interpretMarker(rawS, rawE);
          let start = "", end = "", tag = "";

          if (marker === "OFF" || marker === "Requested Off") {
            tag = marker;
          } else {
            start = toTimeStr(rawS);
            end = toTimeStr(rawE);
            if (!start && !end) continue; // blank -> ignore
          }

          if (!dp.iso) continue;

          map[name] = map[name] || {};
          map[name][dp.iso] = map[name][dp.iso] || [];
          map[name][dp.iso].push({
            start, end,
            role: tag || role || "Shift",
            location: undefined
          });
          pushedAny = true;
        }

        // If nothing parsed for this row, skip silently
        if (!pushedAny) continue;
      }

      // preview
      const prev = [];
      const names = Object.keys(map).slice(0, 10);
      for (const n of names) {
        for (const d of dateKeys.slice(0, 2)) {
          (map[n][d] || []).forEach(s => prev.push([n, d, s.start, s.end, s.role]));
        }
      }

      localStorage.setItem("uploaded_shifts_v1", JSON.stringify(map));
      setDetected({ datesISO: dateKeys });
      setPreview(prev);
      setStatus("Saved! Open the main page and refresh to see the rota.");
      alert("Rota saved. Open the main page tab and refresh.");
    };
    reader.readAsArrayBuffer(file);
  }

  return (
    <div style={{maxWidth:980,margin:"0 auto",padding:"24px 16px",
      fontFamily:"system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif"}}>
      <h1 style={{fontSize:22,fontWeight:700,marginBottom:8}}>Upload Excel (Sheet 1)</h1>
      <p style={{marginTop:0,color:"#555"}}>
        Fixed to your grid: <b>Name(A) | Role(B) | F/G J/K N/O R/S V/W Z/AA AD/AE</b> for Mon→Sun.
        Values like <b>DAY/OFF</b> show as <b>Off</b>. Use <b>RDO</b> to mark <b>Requested Off</b>.
      </p>

      <input type="file" accept=".xlsx,.xls" onChange={onFile} style={{margin:"12px 0"}} />
      {status && <div style={{margin:"8px 0",color:"#111"}}>{status}</div>}

      {detected.datesISO.length > 0 && (
        <div style={{fontSize:12,color:"#555",margin:"8px 0"}}>
          Detected week (ISO): {detected.datesISO.join(", ")}
        </div>
      )}

      {preview.length > 0 && (
        <>
          <div style={{fontWeight:600, margin:"12px 0 6px"}}>Preview (first few parsed rows)</div>
          <div style={{overflowX:"auto"}}>
            <table cellPadding={6} style={{borderCollapse:"collapse",minWidth:700}}>
              <thead>
                <tr>
                  <th style={{border:"1px solid #ddd"}}>Name</th>
                  <th style={{border:"1px solid #ddd"}}>Date (ISO)</th>
                  <th style={{border:"1px solid #ddd"}}>Start</th>
                  <th style={{border:"1px solid #ddd"}}>End</th>
                  <th style={{border:"1px solid #ddd"}}>Role/Tag</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j} style={{border:"1px solid #ddd"}}>{String(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
