import React, { useState } from "react";
import { motion } from "framer-motion";

const TRAITS = [
  { key: "ruthlessness", name: "Ruthlessness" },
  { key: "fearlessness", name: "Fearlessness" },
  { key: "impulsivity", name: "Impulsivity" },
  { key: "selfConfidence", name: "Self-confidence" },
  { key: "focus", name: "Focus" },
  { key: "coolness", name: "Coolness under pressure" },
  { key: "toughness", name: "Mental toughness" },
  { key: "charm", name: "Charm" },
  { key: "charisma", name: "Charisma" },
  { key: "reducedEmpathy", name: "Reduced empathy" },
  { key: "lackConscience", name: "Lack of conscience" }
];

const NEUTRAL = 5;
const clamp10 = (v) => Math.max(0, Math.min(10, v));
const pct = (v) => `${clamp10(v) * 10}%`;
const barColor = (v) => (v >= 7 ? "#22c55e" : v >= 4 ? "#f59e0b" : "#ef4444");

function Legend() {
  return (
    <div className="legend">
      <span><i className="dot dot-green" /> High (7–10)</span>
      <span><i className="dot dot-orange" /> Medium (4–6)</span>
      <span><i className="dot dot-red" /> Low (0–3)</span>
    </div>
  );
}

function Bar({ name, value }) {
  return (
    <div className="bar-row">
      <div className="bar-label">{name}</div>
      <div className="bar-track">
        <motion.div
          className="bar-fill"
          initial={{ width: 0 }}
          animate={{ width: pct(value) }}
          transition={{ duration: 0.45 }}
          style={{ background: barColor(value) }}
        >
          <span className="bar-inline">{value}</span>
        </motion.div>
      </div>
      <div className="bar-value">{value}</div>
    </div>
  );
}

export default function App() {
  const [scenario, setScenario] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [levels, setLevels] = useState(Object.fromEntries(TRAITS.map(t => [t.key, NEUTRAL])));
  const [rationales, setRationales] = useState({});
  const [behaviors, setBehaviors] = useState({});
  const [summary, setSummary] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const recommend = async () => {
    setLoading(true); setErr(""); setSummary(""); setRationales({}); setBehaviors({});
    try {
      const r = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario, pdfUrl: pdfUrl || undefined })
      });

      const raw = await r.text();
      let data;
      try { data = JSON.parse(raw); }
      catch { throw new Error(raw ? raw.slice(0, 200) : "Non-JSON response from server"); }

      if (!r.ok) throw new Error(data?.error || "AI error");

      setLevels(data.levels);
      setRationales(data.rationales || {});
      setBehaviors(data.behaviors || {});
      setSummary(data.summary || data.why || "");
    } catch (e) {
      setErr(e.message || "Failed to get recommendation");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setLevels(Object.fromEntries(TRAITS.map(t => [t.key, NEUTRAL])));
    setRationales({});
    setBehaviors({});
    setSummary("");
    setErr("");
    setScenario("");
    setPdfUrl("");
  };

  return (
    <div className="page">
      <div className="container">
        <h1>Good Psychopath Mixing Desk</h1>
        <p className="subtitle">
          AI-only mode. Enter your scenario. Optionally add a PDF URL (Drive/Dropbox/OneDrive) to ground the rationale.
        </p>

        <textarea
          value={scenario}
          onChange={(e) => setScenario(e.target.value)}
          className="scenario"
          rows={3}
          placeholder="e.g., crisis in a hospital ER; boardroom negotiation; performance review; job interview…"
        />

        <input
          value={pdfUrl}
          onChange={(e) => setPdfUrl(e.target.value)}
          className="input"
          placeholder="Optional PDF share link (https://drive.google.com/..., Dropbox, OneDrive)"
        />

        <div className="btn-row">
          <button className="btn primary" disabled={loading || !scenario.trim()} onClick={recommend}>
            {loading ? "Thinking…" : "Recommend Dials (AI)"}
          </button>
          <button className="btn" onClick={reset}>Reset</button>
        </div>

        {err && <div className="debug">⚠️ {err}</div>}
        {summary && !err && (
          <div className="debug">
            <div className="debug-title">Overall reasoning</div>
            <div>{summary}</div>
          </div>
        )}

        <Legend />

        <div className="bars">
          {TRAITS.map(t => (
            <Bar key={t.key} name={t.name} value={levels[t.key]} />
          ))}
        </div>

        {(Object.keys(rationales).length > 0 || Object.keys(behaviors).length > 0) && (
          <div className="commentary">
            <h3>Trait-by-trait commentary</h3>
            <ul>
              {TRAITS.map(t => (
                <li key={t.key} style={{ marginBottom: 6 }}>
                  <strong>{t.name}:</strong>{" "}
                  {rationales[t.key] || "—"}
                  {behaviors[t.key] && (
                    <>
                      <br />
                      <em>Suggested behaviors:</em> {behaviors[t.key]}
                    </>
                  )}
                </li>
              ))}
            </ul>
            <p className="note">Short quotes may come from your scenario and/or the provided PDF.</p>
          </div>
        )}
      </div>
    </div>
  );
}
