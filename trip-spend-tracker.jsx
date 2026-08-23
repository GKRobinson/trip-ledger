import React, { useState, useEffect, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer,
} from "recharts";

// ---- Design tokens: highway-signage roadbook ----
const T = {
  ink: "#15221B",
  paper: "#EFEFE9",
  card: "#FFFFFF",
  green: "#01633C",
  greenDark: "#014A2D",
  yellow: "#F5B700",
  red: "#C63A2F",
  line: "#D8D8CF",
  mute: "#6B7570",
};

const STORAGE_KEY = "trip-budget-v1";

const font = `
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Barlow:wght@400;500;600&display=swap');
`;

function fmt(n, dp = 0) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export default function TripSpendTracker() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null); // {budget, tripDays, currency, entries:[{day,totalSpent,ts}]}
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const [showExport, setShowExport] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  // setup / settings form
  const [budgetIn, setBudgetIn] = useState("");
  const [daysIn, setDaysIn] = useState("");
  const [curIn, setCurIn] = useState("USD");

  // entry form
  const [dayIn, setDayIn] = useState("");
  const [spentIn, setSpentIn] = useState("");
  const [entryErr, setEntryErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          setData(parsed);
          setBudgetIn(String(parsed.budget));
          setDaysIn(String(parsed.tripDays));
          setCurIn(parsed.currency || "USD");
        }
      } catch (e) {
        // key doesn't exist yet — first run
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function persist(next) {
    setData(next);
    setSaveState("saving");
    try {
      const ok = await window.storage.set(STORAGE_KEY, JSON.stringify(next));
      setSaveState(ok ? "saved" : "error");
    } catch (e) {
      setSaveState("error");
    }
    setTimeout(() => setSaveState("idle"), 2000);
  }

  async function snapshotBackup(current) {
    if (!current) return;
    try {
      await window.storage.set(STORAGE_KEY + "-backup", JSON.stringify(current));
    } catch (e) { /* backup is best-effort */ }
  }

  async function startTrip() {
    const b = parseFloat(budgetIn);
    const d = parseInt(daysIn, 10);
    if (!b || b <= 0 || !d || d <= 0) return;
    // Snapshot the current state first so a settings change can never destroy data.
    await snapshotBackup(data);
    // CRITICAL: changing budget/length must preserve existing entries.
    persist({
      budget: b,
      tripDays: d,
      currency: (curIn || "USD").trim().toUpperCase(),
      entries: data && Array.isArray(data.entries) ? data.entries : [],
    });
    setShowSettings(false);
  }

  async function restoreBackup() {
    try {
      const res = await window.storage.get(STORAGE_KEY + "-backup");
      if (res && res.value) {
        const parsed = JSON.parse(res.value);
        persist(parsed);
        setBudgetIn(String(parsed.budget));
        setDaysIn(String(parsed.tripDays));
        setCurIn(parsed.currency || "USD");
        setRestoreMsg(`Restored: ${parsed.entries.length} entr${parsed.entries.length === 1 ? "y" : "ies"}, budget ${fmt(parsed.budget)}.`);
        setShowSettings(false);
      } else {
        setRestoreMsg("No backup found yet.");
      }
    } catch (e) {
      setRestoreMsg("No backup found yet.");
    }
  }

  function addEntry() {
    setEntryErr("");
    const day = parseInt(dayIn, 10);
    const spent = parseFloat(spentIn);
    if (!day || day < 1) { setEntryErr("Enter a day number (1 or higher)."); return; }
    if (day > data.tripDays) { setEntryErr(`Day can't be past the trip length (${data.tripDays} days).`); return; }
    if (isNaN(spent) || spent < 0) { setEntryErr("Enter the total spent so far."); return; }
    const entries = data.entries.filter((e) => e.day !== day);
    entries.push({ day, totalSpent: spent, ts: Date.now() });
    entries.sort((a, b) => a.day - b.day);
    persist({ ...data, entries });
    setDayIn(""); setSpentIn("");
  }

  function removeEntry(day) {
    persist({ ...data, entries: data.entries.filter((e) => e.day !== day) });
  }

  function editEntry(e) {
    setDayIn(String(e.day));
    setSpentIn(String(e.totalSpent));
    setEntryErr("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function resetAll() {
    await snapshotBackup(data);
    try { await window.storage.delete(STORAGE_KEY); } catch (e) {}
    setData(null);
    setBudgetIn(""); setDaysIn(""); setCurIn("USD");
    setConfirmReset(false);
    setShowSettings(false);
  }

  const stats = useMemo(() => {
    if (!data || data.entries.length === 0) return null;
    const latest = data.entries[data.entries.length - 1];
    const spent = latest.totalSpent;
    const day = latest.day;
    const remaining = data.budget - spent;
    const daysLeft = data.tripDays - day;
    const avg = spent / day;
    const perDay = daysLeft > 0 ? remaining / daysLeft : remaining;
    const pace = (data.budget / data.tripDays) * day; // where even spending would put you
    const delta = spent - pace; // + means ahead of (over) pace
    return { latest, spent, day, remaining, daysLeft, avg, perDay, pace, delta };
  }, [data]);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.entries.map((e) => ({
      day: e.day,
      spent: e.totalSpent,
      pace: (data.budget / data.tripDays) * e.day,
    }));
  }, [data]);

  const styles = {
    app: {
      minHeight: "100vh", background: T.paper, color: T.ink,
      fontFamily: "'Barlow', system-ui, sans-serif", paddingBottom: 48,
    },
    shell: { maxWidth: 560, margin: "0 auto", padding: "0 16px" },
    header: {
      background: T.green, color: "#fff", padding: "18px 16px 16px",
      borderBottom: `4px solid ${T.yellow}`, marginBottom: 20,
    },
    hTitle: {
      fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
      fontSize: 26, letterSpacing: "0.06em", textTransform: "uppercase",
      margin: 0, lineHeight: 1,
    },
    hSub: { fontSize: 13, opacity: 0.85, marginTop: 4 },
    card: {
      background: T.card, border: `1px solid ${T.line}`, borderRadius: 10,
      padding: 16, marginBottom: 14,
    },
    label: {
      fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600,
      textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 13,
      color: T.mute, display: "block", marginBottom: 4,
    },
    input: {
      width: "100%", boxSizing: "border-box", padding: "12px 12px",
      fontSize: 17, border: `1.5px solid ${T.line}`, borderRadius: 8,
      background: "#FCFCF9", color: T.ink, fontFamily: "inherit",
      outline: "none",
    },
    btn: {
      width: "100%", padding: "13px 16px", fontSize: 16, fontWeight: 600,
      fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.06em",
      textTransform: "uppercase", border: "none", borderRadius: 8,
      background: T.green, color: "#fff", cursor: "pointer",
    },
    btnGhost: {
      padding: "10px 14px", fontSize: 14, fontWeight: 600,
      fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.05em",
      textTransform: "uppercase", borderRadius: 8, cursor: "pointer",
      background: "transparent", border: `1.5px solid ${T.line}`, color: T.ink,
    },
    bigNum: {
      fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
      fontSize: 56, lineHeight: 1, letterSpacing: "-0.01em",
      fontVariantNumeric: "tabular-nums",
    },
  };

  if (loading) {
    return (
      <div style={styles.app}>
        <style>{font}</style>
        <div style={{ ...styles.shell, paddingTop: 80, textAlign: "center", color: T.mute }}>
          Loading your trip…
        </div>
      </div>
    );
  }

  // ---- Setup screen ----
  if (!data || showSettings) {
    return (
      <div style={styles.app}>
        <style>{font}</style>
        <header style={styles.header}>
          <h1 style={styles.hTitle}>Trip Ledger</h1>
          <div style={styles.hSub}>{data ? "Trip settings" : "Set up your trip once — everything is saved privately to your account."}</div>
        </header>
        <div style={styles.shell}>
          <div style={styles.card}>
            <div style={{ marginBottom: 14 }}>
              <label style={styles.label}>Total budget</label>
              <input style={styles.input} inputMode="decimal" placeholder="e.g. 12000"
                value={budgetIn} onChange={(e) => setBudgetIn(e.target.value)} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={styles.label}>Trip length (days)</label>
              <input style={styles.input} inputMode="numeric" placeholder="e.g. 60"
                value={daysIn} onChange={(e) => setDaysIn(e.target.value)} />
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={styles.label}>Currency label</label>
              <input style={styles.input} placeholder="USD" value={curIn}
                onChange={(e) => setCurIn(e.target.value)} />
            </div>
            <button style={styles.btn} onClick={startTrip}
              disabled={!parseFloat(budgetIn) || !parseInt(daysIn, 10)}>
              {data ? "Save settings" : "Start tracking"}
            </button>
            {data && (
              <button style={{ ...styles.btnGhost, width: "100%", marginTop: 10 }}
                onClick={() => setShowSettings(false)}>
                Back without saving
              </button>
            )}
          </div>
          <div style={styles.card}>
            <label style={styles.label}>Recovery</label>
            <button style={{ ...styles.btnGhost, width: "100%" }} onClick={restoreBackup}>
              Restore last backup
            </button>
            <div style={{ fontSize: 12, color: T.mute, marginTop: 8 }}>
              A backup is saved automatically before settings changes and deletes.
              {restoreMsg && <span style={{ color: T.ink, fontWeight: 600 }}> {restoreMsg}</span>}
            </div>
          </div>
          {data && (
            <div style={{ ...styles.card, borderColor: T.red }}>
              <label style={{ ...styles.label, color: T.red }}>Danger zone</label>
              {!confirmReset ? (
                <button style={{ ...styles.btnGhost, borderColor: T.red, color: T.red, width: "100%" }}
                  onClick={() => setConfirmReset(true)}>
                  Delete trip and all entries
                </button>
              ) : (
                <div>
                  <p style={{ fontSize: 14, marginTop: 0 }}>This permanently deletes the trip and every entry. There is no undo — export a backup first if you want one.</p>
                  <button style={{ ...styles.btn, background: T.red }} onClick={resetAll}>Yes, delete everything</button>
                  <button style={{ ...styles.btnGhost, width: "100%", marginTop: 10 }}
                    onClick={() => setConfirmReset(false)}>Keep my data</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---- Main screen ----
  const cur = data.currency;
  const spentPct = stats ? Math.min(100, (stats.spent / data.budget) * 100) : 0;
  const pacePct = stats ? Math.min(100, (stats.pace / data.budget) * 100) : 0;
  const over = stats && stats.delta > 0;

  return (
    <div style={styles.app}>
      <style>{font}</style>
      <header style={styles.header}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <h1 style={styles.hTitle}>Trip Ledger</h1>
            <div style={styles.hSub}>
              {fmt(data.budget)} {cur} over {data.tripDays} days
              {stats && ` · day ${stats.day}`}
            </div>
          </div>
          <button style={{ ...styles.btnGhost, borderColor: "rgba(255,255,255,0.4)", color: "#fff" }}
            onClick={() => { setShowSettings(true); setConfirmReset(false); }}>
            Settings
          </button>
        </div>
      </header>

      <div style={styles.shell}>
        {/* Headline stat */}
        <div style={{ ...styles.card, textAlign: "center", paddingTop: 22 }}>
          <label style={styles.label}>Left to spend per day</label>
          <div style={{ ...styles.bigNum, color: stats && stats.perDay < 0 ? T.red : T.green }}>
            {stats ? `${fmt(stats.perDay)}` : "—"}
          </div>
          <div style={{ fontSize: 13, color: T.mute, marginTop: 6 }}>
            {stats
              ? `${cur} · ${fmt(stats.remaining)} left over ${stats.daysLeft} day${stats.daysLeft === 1 ? "" : "s"}`
              : "Add your first update below"}
          </div>

          {/* Budget gauge with pace tick */}
          {stats && (
            <div style={{ marginTop: 18 }}>
              <div style={{ position: "relative", height: 18, background: "#E3E3DA", borderRadius: 9, overflow: "visible" }}>
                <div style={{
                  position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 9,
                  width: `${spentPct}%`, background: over ? T.red : T.green,
                  transition: "width 0.4s ease",
                }} />
                <div title="Even-pace marker" style={{
                  position: "absolute", top: -4, bottom: -4, width: 3,
                  left: `calc(${pacePct}% - 1.5px)`, background: T.yellow, borderRadius: 2,
                }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.mute, marginTop: 6 }}>
                <span>{fmt(stats.spent)} spent</span>
                <span style={{ color: over ? T.red : T.green, fontWeight: 600 }}>
                  {over ? `${fmt(stats.delta)} over pace` : `${fmt(-stats.delta)} under pace`}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Secondary stats */}
        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            {[
              ["Daily average so far", `${fmt(stats.avg)} ${cur}`],
              ["Even-pace target", `${fmt(data.budget / data.tripDays)} ${cur}/day`],
              ["Total spent", `${fmt(stats.spent)} ${cur}`],
              ["Remaining", `${fmt(stats.remaining)} ${cur}`],
            ].map(([l, v]) => (
              <div key={l} style={{ ...styles.card, marginBottom: 0, padding: "12px 14px" }}>
                <label style={{ ...styles.label, marginBottom: 2, fontSize: 12 }}>{l}</label>
                <div style={{
                  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600,
                  fontSize: 22, fontVariantNumeric: "tabular-nums",
                }}>{v}</div>
              </div>
            ))}
          </div>
        )}

        {/* Entry form */}
        <div style={styles.card}>
          <label style={styles.label}>Add or update a day</label>
          <div style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: 10, marginTop: 6 }}>
            <input style={styles.input} inputMode="numeric" placeholder="Day"
              value={dayIn} onChange={(e) => setDayIn(e.target.value)} />
            <input style={styles.input} inputMode="decimal" placeholder={`Total spent so far (${cur})`}
              value={spentIn} onChange={(e) => setSpentIn(e.target.value)} />
          </div>
          {entryErr && <div style={{ color: T.red, fontSize: 13, marginTop: 8 }}>{entryErr}</div>}
          <button style={{ ...styles.btn, marginTop: 12 }} onClick={addEntry}>Save update</button>
          <div style={{ fontSize: 12, color: T.mute, marginTop: 8 }}>
            Enter the running total, not just today's spend. Saving the same day again replaces it.
            {saveState === "saving" && " · Saving…"}
            {saveState === "saved" && " · Saved ✓"}
            {saveState === "error" && <span style={{ color: T.red }}> · Couldn't save — try again.</span>}
          </div>
        </div>

        {/* Chart */}
        {chartData.length >= 2 && (
          <div style={styles.card}>
            <label style={styles.label}>Spend vs even pace</label>
            <div style={{ height: 200, marginTop: 8 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke={T.mute} />
                  <YAxis tick={{ fontSize: 12 }} stroke={T.mute} tickFormatter={(v) => fmt(v)} />
                  <Tooltip formatter={(v, name) => [`${fmt(v)} ${cur}`, name === "spent" ? "Spent" : "Even pace"]}
                    labelFormatter={(d) => `Day ${d}`} />
                  <ReferenceLine y={data.budget} stroke={T.red} strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="pace" stroke={T.yellow} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="spent" stroke={T.green} strokeWidth={2.5}
                    dot={{ r: 3 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ fontSize: 12, color: T.mute }}>
              Green: your spend · Yellow: even pace · Dashed red: total budget
            </div>
          </div>
        )}

        {/* History */}
        {data.entries.length > 0 && (
          <div style={styles.card}>
            <label style={styles.label}>Updates</label>
            {[...data.entries].reverse().map((e) => (
              <div key={e.day} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 0", borderBottom: `1px solid ${T.line}`,
              }}>
                <div>
                  <span style={{
                    fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                    background: T.ink, color: "#fff", borderRadius: 5,
                    padding: "2px 8px", fontSize: 14, marginRight: 10,
                  }}>DAY {e.day}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>
                    {fmt(e.totalSpent)} {cur}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={{ ...styles.btnGhost, padding: "6px 10px", fontSize: 13 }}
                    onClick={() => editEntry(e)}>Edit</button>
                  <button style={{ ...styles.btnGhost, padding: "6px 10px", fontSize: 13, color: T.red, borderColor: T.red }}
                    onClick={() => removeEntry(e.day)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Backup */}
        <div style={styles.card}>
          <button style={{ ...styles.btnGhost, width: "100%" }} onClick={() => setShowExport(!showExport)}>
            {showExport ? "Hide backup" : "Show backup (copy your data)"}
          </button>
          {showExport && (
            <pre style={{
              marginTop: 12, background: "#FCFCF9", border: `1px solid ${T.line}`,
              borderRadius: 8, padding: 12, fontSize: 12, overflowX: "auto",
              whiteSpace: "pre-wrap", wordBreak: "break-all",
            }}>{JSON.stringify(data, null, 2)}</pre>
          )}
        </div>
      </div>
    </div>
  );
}
