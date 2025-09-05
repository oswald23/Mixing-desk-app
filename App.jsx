import React, { useState } from "react";
import { motion } from "framer-motion";

/** ---------- TRAITS ---------- **/
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

/** ---------- HELPERS ---------- **/
const clamp10 = (v) => Math.max(0, Math.min(10, v));
const levelPct = (v) => `${clamp10(v) * 10}%`;
const levelColor = (v) => (v >= 7 ? "#22c55e" : v >= 4 ? "#f59e0b" : "#ef4444");

function Legend() {
  return (
    <div className="legend">
      <span><i className="dot dot-green" /> High (7–10)</span>
      <span><i className="dot dot-orange" /> Medium (4–6)</span>
      <span><i className="dot dot-red" /> Low (0–3)</span>
    </div>
  );
}

function BarRow({ name, value }) {
  return (
    <div className="bar-row" aria-label={`${name} level ${value} of 10`}>
      <div className="bar-label">{name}</div>
      <div className="bar-track">
        <motion.div
          className="bar-fill"
          initial={{ width: 0 }}
          animate={{ width: levelPct(value) }}
          transition={{ duration: 0.5 }}
          style={{ background: levelColor(value) }}
        >
          <span className="bar-inline">{value}</span>
        </motion.div>
      </div>
      <div className="bar-value">{value}</div>
    </div>
  );
}

/** ---------- APP ---------- **/
export default function App() {
  const [scenario, setScenario] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [levels, setLevels] = useState(Object.fromEntries(TRAITS.map(t => [t.key, NEUTRAL])));
  const [rationales, setRationales] = useState({});
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const recommend = async () => {
    setLoading(true); setErr(""); setSummary(""); setRationales({});
    try {
      const r = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario, pdfUrl: pdfUrl || undefined })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "AI error");
      setLevels(data.levels);
      setRationales(data.rationales || {});
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
    setSummary("");
    setErr("");
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
          placeholder="e.g., angry customer complaint; board prioritization; panel interview; conference networking..."
          className="scenario"
          rows={3}
        />

        <input
          value={pdfUrl}
          onChange={(e)=>setPdfUrl(e.target.value)}
          className="input"
          placeholder="Optional: paste share link to a PDF (https://...)"
        />

        <div className="btn-row">
          <button className="btn primary" onClick={recommend} disabled={loading || !scenario.trim()}>
            {loading ? "Thinking..." : "Recommend Dials (AI)"}
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
          {TRAITS.map(trait => (
            <BarRow key={trait.key} name={trait.name} value={levels[trait.key]} />
          ))}
        </div>

        {/* Per-trait commentary */}
        {Object.keys(rationales).length > 0 && (
          <div className="commentary">
            <h3>Trait-by-trait commentary</h3>
            <ul>
              {TRAITS.map(t => (
                <li key={t.key}>
                  <strong>{t.name}:</strong> {rationales[t.key] || "—"}
                </li>
              ))}
            </ul>
            <p className="note">
              Notes: Explanations may quote short snippets from your scenario and (if provided) the PDF.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
