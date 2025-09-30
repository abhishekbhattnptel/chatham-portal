import React, { useMemo, useState } from "react";

/* ===================== Helpers & constants ===================== */

// Day labels Mon–Sun (Monday index = 0)
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const page = {
  maxWidth: 760,
  margin: "0 auto",
  padding: "16px 12px",
  fontFamily:
    "system-ui, -apple-system, Segoe UI, Roboto, Arial, 'Helvetica Neue', sans-serif",
  minHeight: "100vh",
  boxSizing: "border-box",
};
const card = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: "12px",
  background: "#fff",
  marginBottom: "8px",
};
const btn = {
  padding: "10px 16px",
  borderRadius: 8,
  border: "1px solid #00704a",
  background: "#00704a",
  color: "#fff",
  cursor: "pointer",
  fontSize: "14px",
  fontWeight: "600",
  minHeight: "44px", // Touch-friendly minimum size
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
const btnGhost = { ...btn, background: "#fff", color: "#00704a", border: "1px solid #00704a" };

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function startOfWeekMonday(date) {
  const d = new Date(date);
  const diff = (d.getDay() === 0 ? -6 : 1) - d.getDay();
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function formatDDMMYYYY(iso) {
  if (!iso || iso.length < 10) return iso || "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// Loaders from admin storage
function getUploadedShifts(weekStartISO = null) {
  try {
    // If specific week requested, try to load that week's data
    if (weekStartISO) {
      const weekKey = `uploaded_shifts_${weekStartISO}_v1`;
      const raw = localStorage.getItem(weekKey);
      if (raw) return JSON.parse(raw);
    }
    
    // Fallback to current week data
    const raw = localStorage.getItem("uploaded_shifts_v1");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getUploadedNames(weekStartISO = null) {
  try {
    // If specific week requested, try to load that week's data
    if (weekStartISO) {
      const namesKey = `uploaded_names_${weekStartISO}_v1`;
      const raw = localStorage.getItem(namesKey);
      if (raw) return JSON.parse(raw);
    }
    
    // Fallback to current week data
    const raw = localStorage.getItem("uploaded_names_v1");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Get available weeks
function getAvailableWeeks() {
  try {
    const weeks = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('week_metadata_')) {
        const metadata = JSON.parse(localStorage.getItem(key));
        weeks.push({
          weekStart: metadata.weekStart,
          weekEnd: metadata.weekEnd,
          uploadDate: metadata.uploadDate,
          totalShifts: metadata.totalShifts
        });
      }
    }
    return weeks.sort((a, b) => new Date(b.weekStart) - new Date(a.weekStart));
  } catch {
    return [];
  }
}

// Get the most recent uploaded data
function getMostRecentData() {
  try {
    const weeks = getAvailableWeeks();
    if (weeks.length === 0) return null;
    
    // Get the most recent week's data
    const mostRecentWeek = weeks[0];
    const weekKey = `uploaded_shifts_${mostRecentWeek.weekStart}_v1`;
    const raw = localStorage.getItem(weekKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Get the most recent uploaded names
function getMostRecentNames() {
  try {
    const weeks = getAvailableWeeks();
    if (weeks.length === 0) return null;
    
    // Get the most recent week's names
    const mostRecentWeek = weeks[0];
    const namesKey = `uploaded_names_${mostRecentWeek.weekStart}_v1`;
    const raw = localStorage.getItem(namesKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Clean partner list
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
  if (!/[a-z]/i.test(name)) return false;
  if (BAD_NAME_PATTERNS.some((rx) => rx.test(name))) return false;
  return true;
}

/* ===================== Fallback sample data ===================== */
const MOCK_SHIFTS = {
  Abhishek: {
    "2025-09-29": [{ start: "07:00", end: "15:00", role: "Barista" }],
    "2025-09-30": [{ start: "12:00", end: "20:00", role: "Drive" }],
    "2025-10-02": [{ start: "06:00", end: "14:00", role: "Open" }],
  },
  Jess: {
    "2025-09-29": [{ start: "10:00", end: "18:00", role: "Barista" }],
    "2025-10-01": [{ start: "08:00", end: "16:00", role: "Bar" }],
  },
  Jaz: {
    "2025-09-29": [
      { start: "06:00", end: "10:00", role: "Barista" },
      { start: "10:00", end: "14:00", role: "Supervisor" }
    ],
    "2025-09-30": [{ start: "08:00", end: "16:00", role: "Supervisor" }],
  },
  Michael: {
    "2025-10-01": [
      { start: "07:00", end: "11:00", role: "Barista" },
      { start: "11:00", end: "15:00", role: "Supervisor" },
      { start: "15:00", end: "19:00", role: "Barista" }
    ],
    "2025-10-02": [{ start: "09:00", end: "17:00", role: "Supervisor" }],
  },
  Izzy: {
    "2025-10-03": [
      { start: "08:00", end: "12:00", role: "Barista" },
      { start: "12:00", end: "16:00", role: "Supervisor" }
    ],
    "2025-10-04": [{ start: "10:00", end: "18:00", role: "Barista" }],
  },
  Marco: {
    "2025-10-03": [{ start: "13:00", end: "21:00", role: "Support" }],
  },
  Priya: {
    "2025-10-04": [{ start: "09:00", end: "17:00", role: "Barista" }],
  },
};

/* ===================== Small UI bits ===================== */

function Tag({ kind, children }) {
  // kind: "holiday" | "rdo" | "off" | "default"
  const base = {
    padding: "0 8px",
    borderRadius: 6,
    fontWeight: 600,
    lineHeight: "20px",
    display: "inline-block",
  };
  if (kind === "holiday") {
    return (
      <span style={{ ...base, background: "#fee2e2", color: "#991b1b" }}>
        {children}
      </span>
    );
  }
  if (kind === "rdo") {
    return (
      <span style={{ ...base, background: "#fef3c7", color: "#92400e" }}>
        {children}
      </span>
    );
  }
  if (kind === "off") {
    return (
      <span style={{ ...base, background: "#f3f4f6", color: "#374151" }}>
        {children}
      </span>
    );
  }
  return <span style={{ ...base, color: "#374151" }}>{children}</span>;
}

function ShiftsForDay({ dateISO, entries }) {
  const d = new Date(dateISO);
  // Full weekday names (Monday-first)
  const FULL_DAY_NAMES_MON_FIRST = [
    "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"
  ];
  const dayName = FULL_DAY_NAMES_MON_FIRST[(d.getDay() + 6) % 7];
  const list = entries || [];

  // Check if any entry is holiday or requested off to determine card color
  const hasHoliday = list.some(entry => {
    const roleRaw = (entry.role || "").toLowerCase();
    return roleRaw === "holiday";
  });
  
  const hasRequestedOff = list.some(entry => {
    const roleRaw = (entry.role || "").toLowerCase();
    return roleRaw === "requested off" || roleRaw === "requested_off";
  });

  // Check if there are actual shifts with timings (not just off/holiday)
  const hasActualShifts = list.some(entry => {
    const roleRaw = (entry.role || "").toLowerCase();
    const isHoliday = roleRaw === "holiday";
    const isRDO = roleRaw === "requested off" || roleRaw === "requested_off";
    const isOff = roleRaw === "off" || roleRaw === "day off" || roleRaw === "day_off" || roleRaw === "day";
    return !isHoliday && !isRDO && !isOff && entry.start && entry.end;
  });

  // Determine card background color
  let cardStyle = { ...card, marginBottom: 8 };
  if (hasHoliday) {
    cardStyle.background = "#fed7aa"; // Light orange
    cardStyle.border = "1px solid #fb923c"; // Slightly darker orange border
  } else if (hasRequestedOff) {
    cardStyle.background = "#fef3c7"; // Light yellow
    cardStyle.border = "1px solid #f59e0b"; // Slightly darker yellow border
  } else if (hasActualShifts) {
    cardStyle.background = "#dcfce7"; // Light green
    cardStyle.border = "1px solid #22c55e"; // Slightly darker green border
  }

  return (
    <div style={cardStyle}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "8px",
          flexWrap: "wrap",
          gap: "8px"
        }}
      >
        {/* Left: day label (e.g., Monday) */}
        <div style={{ 
          fontWeight: 600, 
          fontSize: "16px",
          color: hasHoliday ? "#92400e" : hasRequestedOff ? "#92400e" : hasActualShifts ? "#166534" : "#111",
          flex: "1",
          minWidth: "120px"
        }}>{dayName}</div>
        
        {/* Center: date */}
        <div style={{ 
          fontSize: "14px", 
          fontWeight: 600,
          color: hasHoliday ? "#92400e" : hasRequestedOff ? "#92400e" : hasActualShifts ? "#166534" : "#111",
          textAlign: "center",
          minWidth: "100px"
        }}>
          {formatDDMMYYYY(dateISO)}
        </div>
      </div>

      {list.length === 0 ? (
        <div style={{ 
          fontSize: 14, 
          color: hasHoliday ? "#92400e" : hasRequestedOff ? "#92400e" : hasActualShifts ? "#166534" : "#6b7280", 
          marginTop: 6 
        }}>No shifts</div>
      ) : (
        <ul style={{ margin: 0, padding: "8px 0 0 0", listStyle: "none" }}>
          {list.map((s, i) => {
            const roleRaw = (s.role || "").toLowerCase();
            const isHoliday = roleRaw === "holiday";
            const isRDO = roleRaw === "requested off" || roleRaw === "requested_off";
            const isOff =
              roleRaw === "off" ||
              roleRaw === "day off" ||
              roleRaw === "day_off" ||
              roleRaw === "day";

            // Label/tag + times display rules
            const rightLabel = isHoliday
              ? "Holiday"
              : isRDO
              ? "Requested Off"
              : isOff
              ? "OFF"
              : s.role || "Shift";

            // Times are hidden for Holiday / Requested Off / OFF
            const showTimes = !isHoliday && !isRDO && !isOff;
            const leftLabel =
              showTimes && s.start && s.end ? `${s.start}–${s.end}` : "";

            const kind = isHoliday ? "holiday" : isRDO ? "rdo" : isOff ? "off" : "default";

            // Check if this is a role change (different role from previous shift)
            const prevShift = i > 0 ? list[i - 1] : null;
            const isRoleChange = prevShift && 
              prevShift.role && s.role && 
              prevShift.role.toLowerCase() !== s.role.toLowerCase() &&
              !isHoliday && !isRDO && !isOff &&
              !prevShift.role.toLowerCase().includes("holiday") &&
              !prevShift.role.toLowerCase().includes("requested") &&
              !prevShift.role.toLowerCase().includes("off");

            return (
              <React.Fragment key={i}>
                {isRoleChange && (
                  <li style={{ padding: "4px 0", borderTop: "1px solid #e5e7eb", marginTop: "4px" }}>
                    <div style={{ 
                      fontSize: "10px", 
                      color: "#6b7280", 
                      textAlign: "center",
                      fontWeight: 600,
                      letterSpacing: "0.5px"
                    }}>
                      ROLE CHANGE
                    </div>
                  </li>
                )}
                <li
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "14px",
                    padding: "8px 0",
                    flexWrap: "wrap",
                    gap: "8px"
                  }}
                >
                  <div style={{ 
                    fontWeight: 600, 
                    minHeight: "20px",
                    flex: "1",
                    minWidth: "120px"
                  }}>{leftLabel}</div>
                  <div style={{ flexShrink: 0 }}>
                    <Tag kind={kind}>{rightLabel}</Tag>
                  </div>
                </li>
              </React.Fragment>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TeamRotaDay({ dateISO, shifts }) {
  const d = new Date(dateISO);
  const FULL_DAY_NAMES_MON_FIRST = [
    "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"
  ];
  const dayName = FULL_DAY_NAMES_MON_FIRST[(d.getDay() + 6) % 7];
  const list = shifts || [];

  // Check for special day types
  const hasHoliday = list.some(entry => {
    const roleRaw = (entry.role || "").toLowerCase();
    return roleRaw === "holiday";
  });
  
  const hasRequestedOff = list.some(entry => {
    const roleRaw = (entry.role || "").toLowerCase();
    return roleRaw === "requested off" || roleRaw === "requested_off";
  });

  const hasActualShifts = list.some(entry => {
    const roleRaw = (entry.role || "").toLowerCase();
    const isHoliday = roleRaw === "holiday";
    const isRDO = roleRaw === "requested off" || roleRaw === "requested_off";
    const isOff = roleRaw === "off" || roleRaw === "day off" || roleRaw === "day_off" || roleRaw === "day";
    return !isHoliday && !isRDO && !isOff && entry.start && entry.end;
  });

  // Determine card background color
  let cardStyle = { ...card, marginBottom: 8 };
  if (hasHoliday) {
    cardStyle.background = "#fed7aa"; // Light orange
    cardStyle.border = "1px solid #fb923c";
  } else if (hasRequestedOff) {
    cardStyle.background = "#fef3c7"; // Light yellow
    cardStyle.border = "1px solid #f59e0b";
  } else if (hasActualShifts) {
    cardStyle.background = "#dcfce7"; // Light green
    cardStyle.border = "1px solid #22c55e";
  }

  return (
    <div style={cardStyle}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "8px",
          flexWrap: "wrap",
          gap: "8px"
        }}
      >
        {/* Left: day label */}
        <div style={{ 
          fontWeight: 600, 
          fontSize: "16px",
          color: hasHoliday ? "#92400e" : hasRequestedOff ? "#92400e" : hasActualShifts ? "#166534" : "#111",
          flex: "1",
          minWidth: "120px"
        }}>{dayName}</div>
        
        {/* Center: date */}
        <div style={{ 
          fontSize: "14px", 
          fontWeight: 600,
          color: hasHoliday ? "#92400e" : hasRequestedOff ? "#92400e" : hasActualShifts ? "#166534" : "#111",
          textAlign: "center",
          minWidth: "100px"
        }}>
          {formatDDMMYYYY(dateISO)}
        </div>
      </div>

      {list.length === 0 ? (
        <div style={{ 
          fontSize: 14, 
          color: hasHoliday ? "#92400e" : hasRequestedOff ? "#92400e" : hasActualShifts ? "#166534" : "#6b7280", 
          marginTop: 6 
        }}>No shifts scheduled</div>
      ) : (
        <ul style={{ margin: 0, padding: "8px 0 0 0", listStyle: "none" }}>
          {list.map((shift, i) => {
            const roleRaw = (shift.role || "").toLowerCase();
            const isHoliday = roleRaw === "holiday";
            const isRDO = roleRaw === "requested off" || roleRaw === "requested_off";
            const isOff = roleRaw === "off" || roleRaw === "day off" || roleRaw === "day_off" || roleRaw === "day";

            const rightLabel = isHoliday
              ? "Holiday"
              : isRDO
              ? "Requested Off"
              : isOff
              ? "OFF"
              : shift.role || "Shift";

            const showTimes = !isHoliday && !isRDO && !isOff;
            const leftLabel = showTimes && shift.start && shift.end ? `${shift.start}–${shift.end}` : "";

            const kind = isHoliday ? "holiday" : isRDO ? "rdo" : isOff ? "off" : "default";

            // Check if this is a role change for the same person
            const prevShift = i > 0 ? list[i - 1] : null;
            const isRoleChange = prevShift && 
              prevShift.name === shift.name &&
              prevShift.role && shift.role && 
              prevShift.role.toLowerCase() !== shift.role.toLowerCase() &&
              !isHoliday && !isRDO && !isOff &&
              !prevShift.role.toLowerCase().includes("holiday") &&
              !prevShift.role.toLowerCase().includes("requested") &&
              !prevShift.role.toLowerCase().includes("off");

            return (
              <React.Fragment key={i}>
                {isRoleChange && (
                  <li style={{ padding: "4px 0", borderTop: "1px solid #e5e7eb", marginTop: "4px" }}>
                    <div style={{ 
                      fontSize: "10px", 
                      color: "#6b7280", 
                      textAlign: "center",
                      fontWeight: 600,
                      letterSpacing: "0.5px"
                    }}>
                      {shift.name.toUpperCase()} - ROLE CHANGE
                    </div>
                  </li>
                )}
                <li
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "14px",
                    padding: "8px 0",
                    flexWrap: "wrap",
                    gap: "8px"
                  }}
                >
                  <div style={{ 
                    fontWeight: 600, 
                    minHeight: "20px",
                    flex: "1",
                    minWidth: "150px"
                  }}>
                    <span style={{ color: "#00704a", marginRight: "8px" }}>{shift.name}:</span>
                    {leftLabel}
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    <Tag kind={kind}>{rightLabel}</Tag>
                  </div>
                </li>
              </React.Fragment>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ===================== Main App ===================== */

export default function App() {
  // deep link handling
  const url = new URL(window.location.href);
  const deepView = url.searchParams.get("view");
  const deepName = url.searchParams.get("name") || "";

  // state
  const [step, setStep] = useState(
    deepName ? "person" : deepView === "rota" ? "mode" : "home"
  );
  const [selectedName, setSelectedName] = useState(deepName);
  const [search, setSearch] = useState("");
  const [weekStart, setWeekStart] = useState(startOfWeekMonday(new Date()));
  const [viewMode, setViewMode] = useState("search"); // "search" or "team"

  // load data for current week
  const currentWeekStart = toISO(weekStart);
  const uploaded = getUploadedShifts(currentWeekStart);
  
  // If no data for current week, try to load most recent uploaded data
  const mostRecentData = uploaded || getMostRecentData();
  const DATA = mostRecentData || MOCK_SHIFTS;

  const uploadedNames = getUploadedNames(currentWeekStart) || getMostRecentNames();

  // name list (union of saved names + keys in data) and clean/filter
  const names = useMemo(() => {
    const fromData = Object.keys(DATA || {});
    const union = Array.from(new Set([...(uploadedNames || []), ...fromData]));
    return union.filter(isRealEmployeeName).sort();
  }, [uploadedNames, DATA]);

  // week days
  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );
  const weekISO = weekDates.map(toISO);

  // selected person's shifts
  const shiftsForSelected = selectedName ? DATA[selectedName] || {} : {};

  // search filter
  const peopleFiltered = names.filter((n) =>
    n.toLowerCase().includes(search.toLowerCase())
  );

  // team rota data - organize all shifts by day
  const teamRotaByDay = useMemo(() => {
    const teamData = {};
    weekISO.forEach(iso => {
      teamData[iso] = [];
      names.forEach(name => {
        const personShifts = DATA[name]?.[iso] || [];
        personShifts.forEach(shift => {
          teamData[iso].push({
            name,
            ...shift
          });
        });
      });
      // Sort by name, then by start time for better organization
      teamData[iso].sort((a, b) => {
        if (a.name !== b.name) return a.name.localeCompare(b.name);
        if (a.start && b.start) return a.start.localeCompare(b.start);
        return 0;
      });
    });
    return teamData;
  }, [weekISO, names, DATA]);

  // Get the most recent week info for display
  const mostRecentWeekInfo = useMemo(() => {
    const weeks = getAvailableWeeks();
    return weeks.length > 0 ? weeks[0] : null;
  }, []);

  // share link (optionally with person name)
  function shareLink() {
    const base = `${location.origin}${location.pathname}`;
    const url = selectedName
      ? `${base}?view=rota&name=${encodeURIComponent(selectedName)}`
      : `${base}?view=rota`;
    navigator.clipboard.writeText(url);
    alert("Shareable link copied!");
  }

  return (
    <div style={page}>
      {/* Header with logo above title (served from /public/chatham-logo.png) */}
      <div style={{ 
        display: "flex", 
        flexDirection: "column", 
        alignItems: "center", 
        marginBottom: "20px",
        textAlign: "center"
      }}>
        <img
          src="/chatham-logo.png"
          alt="Chatham Logo"
          style={{ 
            width: "80px", 
            height: "80px", 
            marginBottom: "12px",
            maxWidth: "100%"
          }}
        />
        <div style={{ 
          fontSize: "18px", 
          fontWeight: 700,
          lineHeight: "1.3",
          marginBottom: "4px",
          padding: "0 8px"
        }}>Starbucks Chatham - Weekly Rota Portal</div>
        <div style={{ 
          fontSize: "11px", 
          color: "#6b7280",
          padding: "0 8px"
        }}>Designed and Developed by Abhishek Bhatt</div>
      </div>

      {/* Steps */}
      {step === "home" && (
        <div>
          <div style={{ marginBottom: "12px", fontWeight: 600, fontSize: "16px" }}>Select from the following</div>
          {mostRecentData && !uploaded && mostRecentWeekInfo && (
            <div style={{
              marginBottom: "16px",
              padding: "12px 16px",
              background: "#fef3c7",
              border: "1px solid #f59e0b",
              borderRadius: "8px",
              fontSize: "14px",
              color: "#92400e",
              textAlign: "center"
            }}>
              📅 Currently showing most recent uploaded data: {formatDDMMYYYY(mostRecentWeekInfo.weekStart)} - {formatDDMMYYYY(mostRecentWeekInfo.weekEnd)}
            </div>
          )}
          <div style={card}>
            <div style={{ 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center",
              flexWrap: "wrap",
              gap: "8px"
            }}>
              <div style={{ flex: "1", minWidth: "200px" }}>
                <div style={{ fontWeight: 600, fontSize: "16px", marginBottom: "4px" }}>View Rota</div>
                <div style={{ fontSize: "14px", color: "#6b7280" }}>Check your upcoming shifts</div>
              </div>
              <button style={btn} onClick={() => setStep("mode")}>
                Open
              </button>
            </div>
          </div>
          <div style={card}>
            <div style={{ 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center",
              flexWrap: "wrap",
              gap: "8px"
            }}>
              <div style={{ flex: "1", minWidth: "200px" }}>
                <div style={{ fontWeight: 600, fontSize: "16px", marginBottom: "4px" }}>Other Options</div>
                <div style={{ fontSize: "14px", color: "#6b7280" }}>Coming Soon</div>
              </div>
              <button style={{ 
                ...btn, 
                background: "#a7c4a0", 
                border: "1px solid #a7c4a0", 
                cursor: "not-allowed" 
              }} disabled>
                Soon
              </button>
            </div>
          </div>
        </div>
      )}

      {step === "mode" && (
        <div>
          {/* Navigation buttons */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button 
              style={{ ...btnGhost, fontSize: "12px", padding: "6px 10px" }}
              onClick={() => setStep("home")}
            >
              🏠 Home
            </button>
            <button 
              style={{ ...btnGhost, fontSize: "12px", padding: "6px 10px" }}
              onClick={() => setStep("home")}
            >
              ← Back
            </button>
          </div>

          {/* Tab Navigation */}
          <div style={{ 
            display: "flex", 
            gap: "4px", 
            marginBottom: "16px",
            flexWrap: "wrap"
          }}>
            <button
              style={{
                ...btnGhost,
                fontSize: "13px",
                padding: "10px 12px",
                background: viewMode === "search" ? "#00704a" : "#fff",
                color: viewMode === "search" ? "#fff" : "#00704a",
                border: "1px solid #00704a",
                flex: "1",
                minWidth: "140px"
              }}
              onClick={() => setViewMode("search")}
            >
              Individual Rota
            </button>
            <button
              style={{
                ...btnGhost,
                fontSize: "13px",
                padding: "10px 12px",
                background: viewMode === "team" ? "#00704a" : "#fff",
                color: viewMode === "team" ? "#fff" : "#00704a",
                border: "1px solid #00704a",
                flex: "1",
                minWidth: "140px"
              }}
              onClick={() => setViewMode("team")}
            >
              Team Rota
            </button>
          </div>

          {viewMode === "search" && (
            <>
              <div style={{ marginBottom: "12px", fontWeight: 600, fontSize: "16px" }}>Partner Search Bar</div>
              <div style={{ ...card, marginBottom: "12px" }}>
                <input
                  placeholder="Type your name here"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ 
                    width: "100%", 
                    padding: "12px 16px", 
                    border: "1px solid #e5e7eb", 
                    borderRadius: "8px",
                    fontSize: "16px", // Prevents zoom on iOS
                    minHeight: "44px",
                    boxSizing: "border-box"
                  }}
                />
              </div>
              <div>
                {peopleFiltered.map((name) => (
                  <div
                    key={name}
                    style={{ ...card, marginBottom: 8, cursor: "pointer" }}
                    onClick={() => {
                      setSelectedName(name);
                      setStep("person");
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <div style={{ fontWeight: 600 }}>{name}</div>
                      <span>›</span>
                    </div>
                  </div>
                ))}
                {peopleFiltered.length === 0 && (
                  <div style={{ ...card, color: "#6b7280" }}>No matching names</div>
                )}
              </div>
            </>
          )}

          {viewMode === "team" && (
            <>
              <div style={{ marginBottom: 8, fontWeight: 600 }}>Team Weekly Rota</div>
              {mostRecentData && !uploaded && mostRecentWeekInfo && (
                <div style={{
                  marginBottom: "12px",
                  padding: "8px 12px",
                  background: "#fef3c7",
                  border: "1px solid #f59e0b",
                  borderRadius: "6px",
                  fontSize: "12px",
                  color: "#92400e"
                }}>
                  📅 Showing most recent uploaded data: {formatDDMMYYYY(mostRecentWeekInfo.weekStart)} - {formatDDMMYYYY(mostRecentWeekInfo.weekEnd)}
                </div>
              )}
              {/* Week nav */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  margin: "8px 0 16px",
                  flexWrap: "wrap",
                  gap: "8px"
                }}
              >
                <button style={{
                  ...btnGhost,
                  fontSize: "12px",
                  padding: "8px 12px",
                  minWidth: "80px"
                }} onClick={() => setWeekStart(addDays(weekStart, -7))}>
                  ◀ Prev
                </button>
                <div style={{ 
                  fontSize: "13px", 
                  color: "#374151", 
                  fontWeight: 700,
                  textAlign: "center",
                  flex: "1",
                  minWidth: "200px"
                }}>
                  {formatDDMMYYYY(weekISO[0])} – {formatDDMMYYYY(weekISO[6])}
                </div>
                <button style={{
                  ...btnGhost,
                  fontSize: "12px",
                  padding: "8px 12px",
                  minWidth: "80px"
                }} onClick={() => setWeekStart(addDays(weekStart, 7))}>
                  Next ▶
                </button>
              </div>

              {/* Team Days */}
              {weekISO.map((iso) => (
                <TeamRotaDay key={iso} dateISO={iso} shifts={teamRotaByDay[iso] || []} />
              ))}

              {/* Actions */}
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button
                  style={btnGhost}
                  onClick={() => setWeekStart(startOfWeekMonday(new Date()))}
                >
                  This week
                </button>
              </div>
            </>
          )}

          <div style={{ marginTop: 16, textAlign: "center" }}>
            <button 
              onClick={shareLink} 
              style={{ 
                ...btnGhost, 
                fontSize: "11px", 
                padding: "6px 10px",
                marginTop: "8px"
              }}
            >
              Copy share link
            </button>
          </div>
        </div>
      )}

      {step === "person" && (
        <div>
          {/* Navigation buttons */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button 
              style={{ ...btnGhost, fontSize: "12px", padding: "6px 10px" }}
              onClick={() => setStep("home")}
            >
              🏠 Home
            </button>
            <button 
              style={{ ...btnGhost, fontSize: "12px", padding: "6px 10px" }}
              onClick={() => setStep("mode")}
            >
              ← Back
            </button>
          </div>
          {/* Week nav */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              margin: "8px 0 12px",
            }}
          >
            <button style={btnGhost} onClick={() => setWeekStart(addDays(weekStart, -7))}>
              ◀ Prev week
            </button>
            <div style={{ fontSize: 14, color: "#374151", fontWeight: 700 }}>
              {formatDDMMYYYY(weekISO[0])} – {formatDDMMYYYY(weekISO[6])}
            </div>
            <button style={btnGhost} onClick={() => setWeekStart(addDays(weekStart, 7))}>
              Next week ▶
            </button>
          </div>

          {/* Title */}
          <div style={{ fontWeight: 700, marginBottom: 8 }}>
            {selectedName ? `${selectedName}'s rota` : "Your rota"} (Mon–Sun)
          </div>
          {mostRecentData && !uploaded && mostRecentWeekInfo && (
            <div style={{
              marginBottom: "12px",
              padding: "8px 12px",
              background: "#fef3c7",
              border: "1px solid #f59e0b",
              borderRadius: "6px",
              fontSize: "12px",
              color: "#92400e"
            }}>
              📅 Showing most recent uploaded data: {formatDDMMYYYY(mostRecentWeekInfo.weekStart)} - {formatDDMMYYYY(mostRecentWeekInfo.weekEnd)}
            </div>
          )}

          {/* Days */}
          {weekISO.map((iso) => {
            const dayShifts = shiftsForSelected[iso] || [];
            // Sort shifts by start time for better organization
            const sortedShifts = dayShifts.sort((a, b) => {
              if (a.start && b.start) return a.start.localeCompare(b.start);
              return 0;
            });
            return <ShiftsForDay key={iso} dateISO={iso} entries={sortedShifts} />;
          })}

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button style={btnGhost} onClick={() => setStep("mode")}>
              Switch person
            </button>
            <button
              style={btnGhost}
              onClick={() => setWeekStart(startOfWeekMonday(new Date()))}
            >
              This week
            </button>
          </div>

          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 10 }}>
            If something looks off, Please contact <b>ABHISHEK BHATT (Admin)</b>
          </div>
          <div style={{ marginTop: 8, textAlign: "center" }}>
            <button 
              onClick={shareLink} 
              style={{ 
                ...btnGhost, 
                fontSize: "11px", 
                padding: "6px 10px",
                marginTop: "8px"
              }}
            >
              Copy share link
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
