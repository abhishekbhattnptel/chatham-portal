import React, { useMemo, useState } from "react";

/** ---------- Mock data (replace later with Google Sheets) ---------- */
function getUploadedShifts() {
  try {
    const raw = localStorage.getItem("uploaded_shifts_v1");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}const MOCK_SHIFTS = {
  "Abhishek": {
    "2025-09-29": [{ start: "07:00", end: "15:00", role: "Bar", location: "Front" }],
    "2025-09-30": [{ start: "12:00", end: "20:00", role: "Drive", location: "Window" }],
    "2025-10-02": [{ start: "06:00", end: "14:00", role: "Open", location: "Main" }],
  },
  "Jess": {
    "2025-09-29": [{ start: "10:00", end: "18:00", role: "Bar", location: "Front" }],
    "2025-10-01": [{ start: "08:00", end: "16:00", role: "Bar", location: "Main" }],
  },
  "Marco": {
    "2025-10-03": [{ start: "13:00", end: "21:00", role: "Support" }],
  },
  "Priya": {
    "2025-10-04": [{ start: "09:00", end: "17:00", role: "Bar" }],
  },
};
const uploaded = getUploadedShifts();
const DATA = uploaded || MOCK_SHIFTS;
/** ---------- small date helpers ---------- */
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const startOfWeekMonday = (date) => {
  const d = new Date(date);
  const diff = (d.getDay() === 0 ? -6 : 1) - d.getDay(); // move to Monday (Sun→-6)
  d.setDate(d.getDate() + diff); d.setHours(0,0,0,0);
  return d;
};

/** ---------- simple UI primitives (no CSS libs) ---------- */
const page = {
  maxWidth: 760, margin: "0 auto", padding: "24px 16px",
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
};
const card = { border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, background: "#fff" };
const btn = {
  padding: "8px 12px", borderRadius: 10, border: "1px solid #e5e7eb",
  background: "#111", color: "#fff", cursor: "pointer"
};
const btnGhost = { ...btn, background: "#fff", color: "#111" };

function ShiftsForDay({ dateISO, entries }) {
  const d = new Date(dateISO);
  const label = `${DAY_NAMES[(d.getDay()+6)%7]} ${d.getDate()}/${String(d.getMonth()+1).padStart(2,"0")}`;
  return (
    <div style={{...card, marginBottom: 8}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontWeight:600}}>{label}</div>
        <div style={{fontSize:12,color:"#6b7280"}}>{dateISO}</div>
      </div>
      {(!entries || entries.length===0) ? (
        <div style={{fontSize:14,color:"#6b7280",marginTop:6}}>No shifts</div>
      ) : (
        <ul style={{margin:0,padding:"8px 0 0 0",listStyle:"none"}}>
          {entries.map((s, i) => (
            <li key={i} style={{display:"flex",justifyContent:"space-between",fontSize:14,padding:"4px 0"}}>
              <div style={{fontWeight:600}}>{s.start}–{s.end}</div>
              <div style={{color:"#374151"}}>{s.role || "Shift"}{s.location ? ` · ${s.location}` : ""}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function App() {
  const url = new URL(window.location.href);
  const deepView = url.searchParams.get("view");
  const deepName = url.searchParams.get("name") || "";

  const [step, setStep] = useState(deepName ? "person" : (deepView === "rota" ? "mode" : "home"));
  const [selectedName, setSelectedName] = useState(deepName);
  const [search, setSearch] = useState("");
  const [weekStart, setWeekStart] = useState(startOfWeekMonday(new Date()));

  const names = useMemo(() => Object.keys(DATA).sort(), [uploaded]);
  const peopleFiltered = names.filter(n => n.toLowerCase().includes(search.toLowerCase()));
  const weekDates = useMemo(() => Array.from({length:7}, (_,i)=>addDays(weekStart,i)), [weekStart]);
  const weekISO = weekDates.map(toISO);
  const shiftsForSelected = selectedName ? (DATA[selectedName] || {}) : {};

  const shareLink = () => {
    const base = `${location.origin}${location.pathname}`;
    const url = selectedName ? `${base}?view=rota&name=${encodeURIComponent(selectedName)}` : `${base}?view=rota`;
    navigator.clipboard.writeText(url);
    alert("Shareable link copied!");
  };

  return (
    <div style={page}>
      {/* Header (logo above title) */}
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",marginBottom:16}}>
        <img src="/chatham-logo.png" alt="Chatham Logo" style={{width:96,height:96,marginBottom:8}}/>
        <div style={{fontSize:22,fontWeight:700}}>Chatham Rota</div>
        <div style={{fontSize:12,color:"#6b7280"}}>One link for the whole team</div>
        <div style={{marginTop:10}}>
          <button onClick={shareLink} style={btnGhost}>Copy share link</button>
        </div>
      </div>

      {/* Steps */}
      {step === "home" && (
        <div>
          <div style={{marginBottom:8,fontWeight:600}}>Choose what you want to view</div>
          <div style={card}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontWeight:600}}>Rota</div>
                <div style={{fontSize:14,color:"#6b7280"}}>See your assigned shifts</div>
              </div>
              <button style={btn} onClick={()=>setStep("mode")}>Open</button>
            </div>
          </div>
        </div>
      )}

      {step === "mode" && (
        <div>
          <div style={{marginBottom:8,fontWeight:600}}>Who are you?</div>
          <div style={{...card, marginBottom:10}}>
            <input
              placeholder="Search your name"
              value={search}
              onChange={e=>setSearch(e.target.value)}
              style={{width:"100%",padding:"10px 12px",border:"1px solid #e5e7eb",borderRadius:10}}
            />
          </div>
          <div>
            {peopleFiltered.map(name => (
              <div key={name} style={{...card, marginBottom:8, cursor:"pointer"}} onClick={()=>{setSelectedName(name); setStep("person");}}>
                <div style={{display:"flex",justifyContent:"space-between"}}>
                  <div style={{fontWeight:600}}>{name}</div>
                  <span>›</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {step === "person" && (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",margin:"8px 0 12px"}}>
            <button style={btnGhost} onClick={()=>setWeekStart(addDays(weekStart,-7))}>◀ Prev week</button>
            <div style={{fontSize:14,color:"#374151"}}>
              {toISO(weekDates[0])} – {toISO(weekDates[6])}
            </div>
            <button style={btnGhost} onClick={()=>setWeekStart(addDays(weekStart,7))}>Next week ▶</button>
          </div>

          <div style={{fontWeight:700, marginBottom:8}}>
            {selectedName ? `${selectedName}'s rota` : "Your rota"} (Mon–Sun)
          </div>

          {weekISO.map(iso => (
            <ShiftsForDay key={iso} dateISO={iso} entries={shiftsForSelected[iso] || []} />
          ))}

          <div style={{display:"flex",gap:8,marginTop:12}}>
            <button style={btnGhost} onClick={()=>setStep("mode")}>Switch person</button>
            <button style={btnGhost} onClick={()=>setWeekStart(startOfWeekMonday(new Date()))}>This week</button>
          </div>

          <div style={{fontSize:12,color:"#6b7280",marginTop:10}}>
            Using sample data. We can plug this into Google Sheets next.
          </div>
        </div>
      )}
    </div>
  );
}
