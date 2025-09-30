import React, { useState } from "react";
import * as XLSX from "xlsx";

/** === Helpers === */
const trimStr = (v) => (v == null ? "" : String(v).trim());

/** Excel number -> "hh:mm"; strings like "6.30", "6:30", "06:30" -> "06:30" */
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
  return "";
}

/** Excel number or string date -> "YYYY-MM-DD" for internal keys */
function toISODate(v) {
  if (v == null || v === "") return "";
  if (typeof v === "number") {
    // Convert Excel serial date to ISO
    const dat = XLSX.SSF.parse_date_code(v);
    if (!dat) return "";
    const y = dat.y, m = String(dat.m).padStart(2,"0"), d = String(dat.d).padStart(2,"0");
    return `${y}-${m}-${d}`;
  }
  // Try DD/MM/YYYY or similar strings
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (m) {
    const [_, dd, mm, yyyy] = m;
    return `${yyyy}-${mm.padStart(2,"0")}-${dd.padStart(2,"0")}`;
  }
  // Fallback: Date.parse
  const d = new Date(s);
  if (!isNaN(d.valueOf())) {
    const y = d.getFullYear(), mm = String(d.getMonth()+1).padStart(2,"0"), dd = String(d.getDate()).padStart(2,"0");
    return `${y}-${mm}-${dd}`;
  }
  return "";
}

/** Interpret text cells for status */
function interpretStatusCell(raw) {
  const s = trimStr(raw).toLowerCase();
  if (!s) return ""; // blank
  if (/(^|\b)(day\s*off|off|day)\b/.test(s)) return "OFF";
  if (/(rdo|requested\s*off)/.test(s)) return "REQUESTED_OFF";
  return ""; // treat anything else as not a special marker
}

/** === Component === */
export default function Admin() {
  const [status, setStatus] = useState("");
  const [detected, setDetected] = useState({ datesISO: [], startCol: -1 });
  const [preview, setPreview] = useState([]); // small snippet for visual check

  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus("Reading file…");
    const reader = new FileReader();
    reader.onload = () => {
      const wb = XLSX.read(reader.result, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]]; // Sheet 1
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

      if (!rows.length) { setStatus("Empty sheet"); return; }

      /** Heuristic: find header band where dates are shown and "Start/End" under each.
       * We scan for a row that contains several date-like values, and the next row
       * contains many "Start"/"End" labels.
       */
      let headerDateRow = -1, headerLabelRow = -1;
      for (let r = 0; r < Math.min(rows.length - 1, 30); r++) {
        const row = rows[r];
        const next = rows[r + 1] || [];
        const dateLikeCount = row.filter(c => !!toISODate(c)).length;
        const hasStartEnd = next.filter(c => /start|end/i.test(String(c))).length >= 4;
        if (dateLikeCount >= 3 && hasStartEnd) {
          headerDateRow = r;
          headerLabelRow = r + 1;
          break;
        }
      }

      if (headerDateRow < 0) {
        setStatus("Couldn't detect the date header row. Please ensure the week dates are on one row with 'Start'/'End' on the next.");
        return;
      }

      const dateRow = rows[headerDateRow];
      const labelRow = rows[headerLabelRow];

      // Build column → ISO date mapping by pairing Start/End columns
      const datesISO = [];
      const dayColPairs = []; // array of { dateISO, startCol, endCol }
      for (let c = 0; c < labelRow.length; c++) {
        const lbl = String(labelRow[c]).toLowerCase();
        if (lbl.includes("start")) {
          const dISO = toISODate(dateRow[c]);
          if (dISO) {
            // find matching "End" to the right (usually c+1)
            let endC = c + 1;
            // sanity: ensure labelRow[endC] has 'end'
            if (!/end/i.test(String(labelRow[endC] || ""))) {
              // look ahead up to 2 cells just in case
              for (let k = 1; k <= 2; k++) {
                if (/end/i.test(String(labelRow[c + k] || ""))) { endC = c + k; break; }
              }
            }
            datesISO.push(dISO);
            dayColPairs.push({ dateISO: dISO, startCol: c, endCol: endC });
          }
        }
      }

      // Name/Role columns: assume first two non-empty columns **left of first Start**
      const firstStartCol = dayColPairs.length ? dayColPairs[0].startCol : 2;
      // Find the first row below headerLabelRow that looks like a person's name
      let firstPersonRow = -1;
      for (let r = headerLabelRow + 1; r < rows.length; r++) {
        const a = trimStr(rows[r][0] || "");
        const b = trimStr(rows[r][1] || "");
        if (a && !/opening\s*times/i.test(a)) { firstPersonRow = r; break; }
      }
      if (firstPersonRow < 0) {
        setStatus("Couldn't find staff rows under the header.");
        return;
      }

      // Parse all staff rows until we hit a fully empty line
      const map = {}; // name -> dateISO -> [ {start,end,role,location} ]
      for (let r = firstPersonRow; r < rows.length; r++) {
        const row = rows[r];
        const name = trimStr(row[0]);
        const role = trimStr(row[1]);
        if (!name && !role) {
          // stop when we reach an empty block of lines
          const nextHasData = (rows[r+1]||[]).some(Boolean);
          if (!nextHasData) break;
          continue;
        }
        if (!name || /holiday|requested offs|delivery days/i.test(name)) continue; // skip sidebar blocks etc.

        for (const pair of dayColPairs) {
          const rawStart = row[pair.startCol];
          const rawEnd = row[pair.endCol];

          const markerStart = interpretStatusCell(rawStart);
          const markerEnd = interpretStatusCell(rawEnd);
          const anyMarker = markerStart || markerEnd;

          let start = toTimeStr(rawStart);
          let end = toTimeStr(rawEnd);
          let tag = "";

          if (anyMarker === "OFF") {
            // mark Off (no time)
            start = ""; end = ""; tag = "OFF";
          } else if (anyMarker === "REQUESTED_OFF") {
            start = ""; end = ""; tag = "Requested Off";
          } else if (!start && !end) {
            // if the cell text literally says RDO/Requested Off in either cell
            const txt = `${trimStr(rawStart)} ${trimStr(rawEnd)}`.toLowerCase();
            if (/rdo|requested\s*off/.test(txt)) {
              tag = "Requested Off";
            } else {
              // both blank -> no shift
              continue;
            }
          }

          // save entry
          map[name] = map[name] || {};
          map[name][pair.dateISO] = map[name][pair.dateISO] || [];
          map[name][pair.dateISO].push({
            start, end,
            role: tag || role || "Shift",
            location: undefined
          });
        }
      }

      // quick preview (first 12 names x 2 days)
      const prev = [];
      const someNames = Object.keys(map).slice(0, 12);
      for (const n of someNames) {
        for (const dISO of datesISO.slice(0,2)) {
          const arr = map[n]?.[dISO] || [];
          for (const s of arr) prev.push([n, dISO, s.start, s.end, s.role]);
        }
      }
      setPreview(prev);
      localStorage.setItem("uploaded_shifts_v1", JSON.stringify(map));
      setDetected({ datesISO, startCol: firstStartCol });
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
        This parser is tuned for your weekly grid: <b>Name | Role | (Start/End × 7 days)</b>.<br/>
        Type <code>RDO</code> in yellow cells to record <b>Requested Off</b>. Values like <b>DAY / OFF</b> are recorded as <b>Off</b>.
      </p>

      <input type="file" accept=".xlsx,.xls" onChange={onFile} style={{margin:"12px 0"}} />
      {status && <div style={{margin:"8px 0",color:"#111"}}>{status}</div>}

      {detected.datesISO.length > 0 && (
        <div style={{fontSize:12,color:"#555",margin:"8px 0"}}>
          Detected week: {detected.datesISO.join(", ")}
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
                  <th style={{border:"1px solid #ddd"}}>Tag/Role</th>
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
