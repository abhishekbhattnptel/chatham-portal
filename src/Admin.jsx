import React, { useState } from "react";
import * as XLSX from "xlsx";
import { saveWeekData } from "./github-api";

/** ===== YOUR SHEET LAYOUT (fixed) ===== */
const DATES_ROW_1BASED = 4;           // row containing week dates
const NAME_COL = "A";                 // partner name
const ROLE_COL = "B";                 // role/position
const COLS = {                        // Start/End columns Mon→Sun
  Mon: { start: "F",  end: "G"  },
  Tue: { start: "J",  end: "K"  },
  Wed: { start: "N",  end: "O"  },
  Thu: { start: "R",  end: "S"  },
  Fri: { start: "V",  end: "W"  },
  Sat: { start: "Z",  end: "AA" },
  Sun: { start: "AD", end: "AE" },
};
/** ===================================== */

/* ---------- helpers ---------- */
const trim = (v) => (v == null ? "" : String(v).trim());

const BAD_NAME_PATTERNS = [
  /opening\s*times?/i,
  /requested\s*offs?/i,
  /delivery\s*days?/i,
  /projected\s*sale/i,
  /\b(actual|budget|ideal|total|hours?|pay|summary|cost|variance)\b/i,
];

function isRealEmployeeName(n) {
  if (!n) return false;
  const name = String(n).trim();
  if (!name) return false;
  if (!/[a-z]/i.test(name)) return false;                 // must contain letters
  if (BAD_NAME_PATTERNS.some(rx => rx.test(name))) return false;
  return true;
}

function colLetterToIndex(L) {
  let s = String(L).trim().toUpperCase();
  let n = 0;
  for (let i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
  return n - 1;
}

function toTimeStr(v) {
  // hide blanks/zeros/DAY/OFF text here (marker also handles)
  if (v == null || v === "") return "";
  if (v === 0 || v === "0" || v === "00" || v === "00:00") return "";

  // number: could be fraction-of-day (0.27) or HH.mm (6.30)
  if (typeof v === "number") {
    if (v > 0 && v < 1) {
      const mins = Math.round(v * 24 * 60);
      const h = Math.floor(mins / 60), m = mins % 60;
      if (!h && !m) return "";
      return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
    }
    const h = Math.floor(v);
    let mm = Math.round((v - h) * 100);
    if (mm > 59) mm = 59;
    return `${String(h).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;
  }

  const s = String(v).trim().toUpperCase();
  if (s === "DAY" || s === "OFF") return "";

  if (/^\d+(\.|:)\d{1,2}$/.test(s)) {
    const [hRaw, mRaw] = s.split(/[.:]/);
    return `${String(parseInt(hRaw,10)).padStart(2,"0")}:${String(parseInt(mRaw,10)).padStart(2,"0")}`;
  }
  if (/^\d{1,2}$/.test(s)) return `${String(parseInt(s,10)).padStart(2,"0")}:00`;
  if (/^\d{1,2}:\d{1,2}$/.test(s)) {
    const [h, m] = s.split(":");
    return `${String(parseInt(h,10)).padStart(2,"0")}:${String(parseInt(m,10)).padStart(2,"0")}`;
  }
  return "";
}

function toISODate(v) {
  if (v == null || v === "") return "";
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return "";
    return `${d.y}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}`;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
  const d = new Date(s);
  if (!isNaN(d.valueOf()))
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  return "";
}

function formatDDMMYYYY(iso) {
  if (!iso || iso.length < 10) return iso || "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function interpretMarker(a, b) {
  const norm = (v) => {
    if (v === 0 || v === "0" || v === "00" || v === "00:00") return "";
    return String(v ?? "").trim().toLowerCase();
  };
  const t = `${norm(a)} ${norm(b)}`;
  if (/\bhol\b|holiday|closed/.test(t)) return "Holiday";
  if (/\brdo\b|requested\s*off/.test(t)) return "Requested Off";
  if (/\bday\s*off\b|\boff\b|\bday\b/.test(t)) return "OFF";
  return "";
}
/* -------------------------------------- */

export default function Admin() {
  const [status, setStatus] = useState("");
  const [detected, setDetected] = useState({ datesISO: [] });
  const [preview, setPreview] = useState([]);
  const [availableWeeks, setAvailableWeeks] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState("");

  // Load available weeks on component mount
  React.useEffect(() => {
    const weeks = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('week_metadata_')) {
        try {
          const metadata = JSON.parse(localStorage.getItem(key));
          weeks.push({
            weekStart: metadata.weekStart,
            weekEnd: metadata.weekEnd,
            uploadDate: metadata.uploadDate,
            totalShifts: metadata.totalShifts,
            key: key.replace('week_metadata_', '')
          });
        } catch (e) {
          console.warn('Error parsing week metadata:', e);
        }
      }
    }
    setAvailableWeeks(weeks.sort((a, b) => new Date(b.weekStart) - new Date(a.weekStart)));
  }, []);

  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus("Reading file…");
    const reader = new FileReader();
    reader.onload = async () => {
      const wb = XLSX.read(reader.result, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      if (!rows.length) { setStatus("Empty sheet"); return; }

      const NAME_COL_IDX = colLetterToIndex(NAME_COL);
      const ROLE_COL_IDX = colLetterToIndex(ROLE_COL);
      const WEEK_COLS = Object.fromEntries(
        Object.entries(COLS).map(([d, v]) => [
          d,
          { start: colLetterToIndex(v.start), end: colLetterToIndex(v.end) },
        ])
      );

      const dateRowIdx = DATES_ROW_1BASED - 1;
      const dateRow = rows[dateRowIdx] || [];

      // read week dates by looking at each day's Start column cell on date row
      const dateKeys = Object.values(WEEK_COLS).map(({ start }) => toISODate(dateRow[start]));
      if (dateKeys.filter(Boolean).length < 5) {
        setStatus("Couldn't read week dates from row 4. Check the layout.");
        return;
      }

      // find first staff row beneath header band
      let firstStaff = dateRowIdx + 2;
      while (firstStaff < rows.length && !trim(rows[firstStaff][NAME_COL_IDX])) firstStaff++;

      const map = {};                // name -> dateISO -> [ {start,end,role} ]
      const partnerNames = new Set();// for clean picker

      // process staff rows
      for (let r = firstStaff; r < rows.length; r++) {
        const row = rows[r];
        const name = trim(row[NAME_COL_IDX]);
        const role = trim(row[ROLE_COL_IDX]);

        // stop when block of empties reached
        if (!name && !role) {
          const nextHasData = (rows[r+1] || []).some(Boolean);
          if (!nextHasData) break;
          continue;
        }

        // skip junk/summary rows; but keep true names (even if no shifts)
        if (!isRealEmployeeName(name)) continue;
        partnerNames.add(name);

        // If no role specified but name exists, use "Shift" as default
        const currentRole = role || "Shift";

        // build day pairs in date order
        const dayPairs = [];
        let di = 0;
        for (const _day of Object.keys(COLS)) {
          const { start, end } = WEEK_COLS[_day];
          const iso = dateKeys[di++] || "";
          dayPairs.push({ startCol: start, endCol: end, iso });
        }

        // iterate each day
        for (const dp of dayPairs) {
          const rawS = row[dp.startCol];
          const rawE = row[dp.endCol];
          if (!dp.iso) continue;

          const marker = interpretMarker(rawS, rawE);
          let start = "", end = "", tag = "";

          if (marker === "OFF") {
            // hide off entries completely
            continue;
          } else if (marker === "Holiday" || marker === "Requested Off") {
            tag = marker; // tag-only, no times
          } else {
            start = toTimeStr(rawS);
            end   = toTimeStr(rawE);
            if (!start || !end) continue; // require both
          }

          // Only add if there's actual shift data (start/end times or special markers)
          if (start || end || tag) {
            map[name] = map[name] || {};
            map[name][dp.iso] = map[name][dp.iso] || [];
            map[name][dp.iso].push({
              start, end,
              role: tag || currentRole,
              location: undefined
            });
          }
        }
      }

      // Save to localStorage for the viewer with week-based storage
      const weekKey = `uploaded_shifts_${dateKeys[0]}_v1`; // Use first date as week identifier
      const namesKey = `uploaded_names_${dateKeys[0]}_v1`;
      
      localStorage.setItem(weekKey, JSON.stringify(map));
      localStorage.setItem(namesKey, JSON.stringify([...partnerNames]));
      
      // Also save as current week for backward compatibility
      localStorage.setItem("uploaded_shifts_v1", JSON.stringify(map));
      localStorage.setItem("uploaded_names_v1", JSON.stringify([...partnerNames]));
      
      // Save week metadata
      const weekMetadata = {
        weekStart: dateKeys[0],
        weekEnd: dateKeys[6],
        uploadDate: new Date().toISOString(),
        totalShifts: Object.values(map).flat().length
      };
      localStorage.setItem(`week_metadata_${dateKeys[0]}`, JSON.stringify(weekMetadata));

      // small preview - show more detailed info for multiple roles
      const prev = [];
      const someNames = [...partnerNames].slice(0, 8);
      for (const n of someNames) {
        for (const dISO of dateKeys.slice(0, 2)) {
          const arr = (map[n] && map[n][dISO]) || [];
          for (const s of arr) {
            const timeInfo = s.start && s.end ? `${s.start}-${s.end}` : s.role;
            prev.push([n, dISO, timeInfo, s.role]);
          }
        }
      }

      setDetected({ datesISO: dateKeys });
      setPreview(prev);
      setStatus("Saving to GitHub...");
      
      // Save to GitHub
      const githubSuccess = await saveWeekData(dateKeys[0], map, [...partnerNames]);
      
      if (githubSuccess) {
        setStatus("Saved to GitHub! Click 'View App Portal' to see the updated rota.");
        alert("Rota saved to GitHub successfully! You can now view the app portal.");
      } else {
        setStatus("Error saving to GitHub. Data saved locally only.");
        alert("Warning: Could not save to GitHub. Data saved locally only.");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  return (
    <div style={{maxWidth:980,margin:"0 auto",padding:"24px 16px",
      fontFamily:"system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif"}}>
      <h1 style={{fontSize:22,fontWeight:700,marginBottom:8}}>Upload Excel (Sheet 1)</h1>
      <p style={{marginTop:0,color:"#555"}}>
        Fixed to your grid: <b>Name(A) | Role(B) | F/G J/K N/O R/S V/W Z/AA AD/AE</b> for Mon→Sun.<br/>
        <b>Multiple roles per day:</b> Create separate rows for each role shift (e.g., Jaz as Barista 06:00-10:00, then Jaz as Supervisor 10:00-14:00).<br/>
        <b>OFF/DAY</b> is hidden. Use <b>RDO</b> for Requested Off (yellow tag) and <b>HOL</b>/<b>Holiday</b> for Holiday (red tag).
      </p>

      {/* Week Selector */}
      {availableWeeks.length > 0 && (
        <div style={{margin:"16px 0", padding:"12px", background:"#f9fafb", borderRadius:"8px"}}>
          <h3 style={{fontSize:16,fontWeight:600,margin:"0 0 8px 0"}}>View Historical Data</h3>
          <p style={{fontSize:12,color:"#666",margin:"0 0 8px 0"}}>
            Select a week to view previously uploaded rota data:
          </p>
          <select 
            value={selectedWeek} 
            onChange={(e) => setSelectedWeek(e.target.value)}
            style={{
              width:"100%",
              padding:"8px 12px",
              border:"1px solid #d1d5db",
              borderRadius:"6px",
              fontSize:"14px"
            }}
          >
            <option value="">Select a week...</option>
            {availableWeeks.map((week) => (
              <option key={week.key} value={week.key}>
                {formatDDMMYYYY(week.weekStart)} - {formatDDMMYYYY(week.weekEnd)} 
                ({week.totalShifts} shifts, uploaded {new Date(week.uploadDate).toLocaleDateString()})
              </option>
            ))}
          </select>
          {selectedWeek && (
            <div style={{marginTop:"8px", fontSize:"12px", color:"#666"}}>
              <strong>Note:</strong> This data is read-only. To modify, upload a new Excel file.
            </div>
          )}
        </div>
      )}

      <input type="file" accept=".xlsx,.xls" onChange={onFile} style={{margin:"12px 0"}} />
      {status && <div style={{margin:"8px 0",color:"#111"}}>{status}</div>}

      {/* App Portal Access Button */}
      <div style={{margin:"16px 0", textAlign:"center"}}>
        <button
          onClick={() => window.location.href = window.location.origin + window.location.pathname}
          style={{
            padding:"12px 24px",
            borderRadius:"8px",
            border:"1px solid #00704a",
            background:"#00704a",
            color:"#fff",
            cursor:"pointer",
            fontSize:"16px",
            fontWeight:"600",
            minHeight:"44px",
            display:"flex",
            alignItems:"center",
            justifyContent:"center",
            margin:"0 auto",
            gap:"8px"
          }}
        >
          🏠 View App Portal
        </button>
        <div style={{fontSize:"12px", color:"#666", marginTop:"8px"}}>
          Click to go back to the main rota viewer
        </div>
      </div>

      {detected.datesISO.length > 0 && (
        <div style={{fontSize:12,color:"#555",margin:"8px 0"}}>
          Detected week (ISO): {detected.datesISO.join(", ")}
        </div>
      )}

      {/* Success Message with Portal Button */}
      {status && status.includes("Saved!") && (
        <div style={{
          margin:"16px 0",
          padding:"16px",
          background:"#f0f9ff",
          border:"1px solid #0ea5e9",
          borderRadius:"8px",
          textAlign:"center"
        }}>
          <div style={{fontSize:"16px", fontWeight:"600", color:"#0369a1", marginBottom:"8px"}}>
            ✅ Upload Successful!
          </div>
          <div style={{fontSize:"14px", color:"#0c4a6e", marginBottom:"12px"}}>
            Your rota data has been saved. You can now view it in the app portal.
          </div>
          <button
            onClick={() => window.location.href = window.location.origin + window.location.pathname}
            style={{
              padding:"12px 24px",
              borderRadius:"8px",
              border:"1px solid #00704a",
              background:"#00704a",
              color:"#fff",
              cursor:"pointer",
              fontSize:"16px",
              fontWeight:"600",
              minHeight:"44px",
              display:"flex",
              alignItems:"center",
              justifyContent:"center",
              margin:"0 auto",
              gap:"8px"
            }}
          >
            🏠 View App Portal
          </button>
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
                  <th style={{border:"1px solid #ddd"}}>Time/Role</th>
                  <th style={{border:"1px solid #ddd"}}>Role</th>
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
