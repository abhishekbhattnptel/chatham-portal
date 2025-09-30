import React, { useState } from "react";
import * as XLSX from "xlsx";

/** We read only Sheet 1 and map its columns into:
 *  name | date | start | end | role | location
 */
const TARGET_COLS = ["name", "date", "start", "end", "role", "location"];

/** Excel numeric -> formatted string helpers */
function toStr(v, kind) {
  if (v == null) return "";
  if (typeof v === "number") {
    if (kind === "date") return XLSX.SSF.format("yyyy-mm-dd", v);
    if (kind === "time") return XLSX.SSF.format("hh:mm", v);
  }
  return String(v).trim();
}

export default function Admin() {
  const [status, setStatus] = useState("");
  const [preview, setPreview] = useState([]);     // first ~50 rows
  const [headers, setHeaders] = useState([]);     // header row from sheet
  const [mapping, setMapping] = useState({});     // uiHeader -> target field

  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus("Reading file…");
    const reader = new FileReader();
    reader.onload = () => {
      const wb = XLSX.read(reader.result, { type: "array" });
      const sheetName = wb.SheetNames[0];      // SHEET 1
      const sheet = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

      if (!rows.length) { setStatus("Empty sheet"); return; }

      const hdrs = rows[0].map(h => String(h).trim());
      setHeaders(hdrs);
      setPreview(rows.slice(0, 51));           // header + 50 rows

      // auto-map by case-insensitive includes
      const auto = {};
      for (const h of hdrs) {
        const low = h.toLowerCase();
        const hit = TARGET_COLS.find(t => low === t || low.includes(t));
        if (hit) auto[h] = hit;
      }
      setMapping(auto);
      setStatus("File loaded. Check mappings then click Save.");
    };
    reader.readAsArrayBuffer(file);
  }

  function setMap(uiHeader, val) {
    setMapping(prev => ({ ...prev, [uiHeader]: val }));
  }

  function saveParsed() {
    if (!preview.length) return;

    const hdrRow = preview[0];
    const idx = {};
    hdrRow.forEach((h, i) => {
      const target = mapping[h];
      if (target) idx[target] = i;
    });

    // required fields
    for (const req of ["name", "date", "start", "end"]) {
      if (idx[req] == null) {
        alert(`Missing required column mapping for: ${req}`);
        return;
      }
    }

    // rows -> map: name -> date -> [ shift ]
    const map = {};
    for (let r = 1; r < preview.length; r++) {
      const row = preview[r];
      if (!row || row.length === 0) continue;

      const name = toStr(row[idx.name]);
      const date = toStr(row[idx.date], "date");   // accept excel date number
      const start = toStr(row[idx.start], "time"); // accept excel time number
      const end = toStr(row[idx.end], "time");
      const role = idx.role != null ? toStr(row[idx.role]) : "";
      const location = idx.location != null ? toStr(row[idx.location]) : "";

      if (!name || !date || !start || !end) continue;

      map[name] = map[name] || {};
      map[name][date] = map[name][date] || [];
      map[name][date].push({ start, end, role, location });
    }

    localStorage.setItem("uploaded_shifts_v1", JSON.stringify(map));
    setStatus("Saved! Open the main page and refresh to see the rota.");
    alert("Rota saved. Open the main page tab and refresh.");
  }

  return (
    <div style={{maxWidth:760,margin:"0 auto",padding:"24px 16px",
      fontFamily:"system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif"}}>
      <h1 style={{fontSize:22,fontWeight:700,marginBottom:8}}>Upload Excel (Sheet 1)</h1>
      <p style={{marginTop:0,color:"#555"}}>
        Choose your Excel file. Map columns to <b>name, date, start, end, role, location</b>.
      </p>

      <input type="file" accept=".xlsx,.xls" onChange={onFile} style={{margin:"12px 0"}} />
      {status && <div style={{margin:"8px 0",color:"#111"}}>{status}</div>}

      {headers.length > 0 && (
        <div style={{border:"1px solid #eee",borderRadius:10,padding:12,margin:"12px 0"}}>
          <div style={{fontWeight:600,marginBottom:8}}>Column mapping</div>
          {headers.map(h => (
            <div key={h} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <div style={{width:240}}>{h || <em>(blank)</em>}</div>
              <select value={mapping[h] || ""} onChange={e=>setMap(h, e.target.value)} style={{padding:"6px 8px"}}>
                <option value="">— ignore —</option>
                {TARGET_COLS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          ))}
          <button onClick={saveParsed} style={{padding:"8px 12px",borderRadius:8,background:"#111",color:"#fff",
            border:"1px solid #e5e7eb"}}>Save to site</button>
        </div>
      )}

      {preview.length > 0 && (
        <>
          <div style={{fontWeight:600, margin:"12px 0 6px"}}>Preview (first 50 rows)</div>
          <div style={{overflowX:"auto"}}>
            <table cellPadding={6} style={{borderCollapse:"collapse",minWidth:600}}>
              <tbody>
                {preview.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} style={{border:"1px solid #ddd"}}>{String(cell)}</td>
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
