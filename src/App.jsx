import React, { useMemo, useState } from "react";

/* ===================== Helpers & constants ===================== */

// Day labels Mon–Sun (Monday index = 0)
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const page = {
  maxWidth: 760,
  margin: "0 auto",
  padding: "24px 16px",
  fontFamily:
    "system-ui, -apple-system, Segoe UI, Roboto, Arial, 'Helvetica Neue', sans-serif",
};
const card = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 14,
  background: "#fff",
};
const btn = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  background: "#111",
  color: "#fff",
  cursor: "pointer",
};
const btnGhost = { ...btn, background: "#fff", color: "#111" };

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
function getUploadedShifts() {
  try {
    const raw = localStorage.getItem("uploaded_shifts_v1");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function getUploadedNames() {
  try {
    const raw = localStorage.getItem("uploaded_names_v1");
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
  const label = `${DAY_NAMES[(d.getDay() + 6) % 7]} ${d.getDate()}/${String(
    d.getMonth() + 1
  ).padStart(2, "0")}`;

  const list = entries || [];

  return (
    <div style={{ ...card, marginBottom: 8 }}>
      <div
  style={{
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    alignItems: "center",
    marginBottom: 4
  }}
>
  {/* Left: day label (e.g., Mon 29/09) */}
  <div style={{ fontWeight: 600, justifySelf: "start" }}>{label}</div>

  {/* Center: big date */}
  <div style={{ justifySelf: "center", fontSize: 13, fontWeight: 600 }}>
    {formatDDMMYYYY(dateISO)}
  </div>

  {/* Right: empty (keeps center truly centered) */}
  <div />
      </div>

      {list.length === 0 ? (
        <div style={{ fontSize: 14, color: "#6b7280", marginTop: 6 }}>No shifts</div>
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

            return (
              <li
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: 14,
                  padding: "6px 0",
                }}
              >
                <div style={{ fontWeight: 600, minHeight: 18 }}>{leftLabel}</div>
                <Tag kind={kind}>{rightLabel}</Tag>
              </li>
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

  // load data
  const uploaded = getUploadedShifts();
  const DATA = uploaded || MOCK_SHIFTS;

  const uploadedNames = getUploadedNames();

  // state
  const [step, setStep] = useState(
    deepName ? "person" : deepView === "rota" ? "mode" : "home"
  );
  const [selectedName, setSelectedName] = useState(deepName);
  const [search, setSearch] = useState("");
  const [weekStart, setWeekStart] = useState(startOfWeekMonday(new Date()));

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
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 16 }}>
        <img
          src="/chatham-logo.png"
          alt="Chatham Logo"
          style={{ width: 106, height: 106, marginBottom: 8 }}
        />
        <div style={{ fontSize: 22, fontWeight: 700 }}>Starbucks Chatham Weekly Rota</div>
        <div style={{ fontSize: 12, color: "#6b7280" }}>Designed and Developed by Abhishek Bhatt</div>
        <div style={{ marginTop: 10 }}>
          <button onClick={shareLink} style={btnGhost}>
            Copy share link
          </button>
        </div>
      </div>

      {/* Steps */}
      {step === "home" && (
        <div>
          <div style={{ marginBottom: 8, fontWeight: 600 }}>Select from the following</div>
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 600 }}>Rota</div>
                <div style={{ fontSize: 14, color: "#6b7280" }}>See your assigned shifts</div>
              </div>
              <button style={btn} onClick={() => setStep("mode")}>
                Open
              </button>
            </div>
          </div>
        </div>
      )}

      {step === "mode" && (
        <div>
          <div style={{ marginBottom: 8, fontWeight: 600 }}>Look for your name?</div>
          <div style={{ ...card, marginBottom: 10 }}>
            <input
              placeholder="Search your name here"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: 10 }}
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
        </div>
      )}

      {step === "person" && (
        <div>
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
            <div style={{ fontSize: 14, color: "#374151", fontweight: 700 }}>
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

          {/* Days */}
          {weekISO.map((iso) => (
            <ShiftsForDay key={iso} dateISO={iso} entries={shiftsForSelected[iso] || []} />
          ))}

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
            If something looks off, re-upload your Excel via <b>#/admin</b>.
          </div>
        </div>
      )}
    </div>
  );
}
