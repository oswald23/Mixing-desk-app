import React, { useState } from "react";
import { motion } from "framer-motion";

/** -------------------- TRAITS -------------------- **/
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

/** -------------------- HELPERS -------------------- **/
const clamp10 = (v) => Math.max(0, Math.min(10, v));
const levelPct = (v) => `${clamp10(v) * 10}%`;
const levelColor = (v) => (v >= 7 ? "#22c55e" : v >= 4 ? "#f59e0b" : "#ef4444"); // green / amber / red

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

/** -------------------- PRESETS -------------------- **/
const PRESETS = [
  { id: "presentation", label: "Presentation", text: "big stage presentation with Q&A" },
  { id: "negotiation", label: "Negotiation", text: "high-stakes negotiation on a contract" },
  { id: "crisis", label: "Crisis", text: "production outage crisis urgent decision" },
  { id: "network", label: "Networking", text: "talking to strangers at a conference networking and small talk" },
];

/** -------------------- RULES ENGINE -------------------- **/
function recommendFromText(text) {
  const base = Object.fromEntries(TRAITS.map(t => [t.key, NEUTRAL]));
  const t = (text || "").toLowerCase();

  const up = (k, d = 1) => (base[k] = clamp10((base[k] ?? NEUTRAL) + d));
  const down = (k, d = 1) => (base[k] = clamp10((base[k] ?? NEUTRAL) - d));
  const hasAny = (arr) => arr.some((k) => t.includes(k));

  // PRESENTATION / SPEAKING
  if (hasAny(["presentation","present","pitch","keynote","talk","speech","audience","speak"])) {
    up("selfConfidence", 2);
    up("charisma", 2);
    up("charm", 1);
    up("coolness", 2);
    up("focus", 1);
    down("impulsivity", 1);
    down("ruthlessness", 1);
  }

  // NEGOTIATION / DEAL / CONTRACT
  if (hasAny(["negotiate","negotiation","deal","counter","contract","bargain"])) {
    up("focus", 2);
    up("coolness", 2);
    up("selfConfidence", 1);
    up("charm", 1);
    up("ruthlessness", 1);
    down("impulsivity", 2);
  }

  // CRISIS / OUTAGE / EMERGENCY
  if (hasAny(["crisis","emergency","panic","chaos","urgent","outage"])) {
    up("fearlessness", 2);
    up("coolness", 3);
    up("focus", 2);
    up("toughness", 2);
    up("ruthlessness", 1);
    down("impulsivity", 2);
  }

  // DIFFICULT CONVERSATION / FIRING
  if (hasAny(["fire","firing","terminate","let go","final warning","performance issue","disciplinary"])) {
    up("focus", 2);
    up("coolness", 2);
    up("selfConfidence", 1);
    up("ruthlessness", 1);
    // more empathy than baseline
    down("reducedEmpathy", 1);
    down("impulsivity", 2);
  }

  // SURGERY-LIKE / HIGH PRECISION DETACHMENT
  if (hasAny(["surgery","operate","operation","medical","procedure"])) {
    up("coolness", 2);
    up("focus", 2);
    up("reducedEmpathy", 2);
    up("fearlessness", 1);
    up("toughness", 1);
    down("impulsivity", 3);
    down("charm", 1);
    down("charisma", 1);
  }

  // SOCIAL / NETWORKING / TALKING TO STRANGERS
  if (hasAny(["network","networking","stranger","strangers","mingle","small talk","introduce","meet people","icebreaker","talking to strangers","talk to strangers","converse"])) {
    up("charm", 2);
    up("charisma", 2);
    up("selfConfidence", 1);
    up("coolness", 1);
    down("impulsivity", 1);
    down("ruthlessness", 1);
  }

  // GENERIC FALLBACK
  const nothingTriggered = Object.values(base).every(v => v === NEUTRAL);
  if (nothingTriggered) {
    up("selfConfidence", 1);
    up("focus", 1);
    up("coolness", 1);
    down("impulsivity", 1);
  }

  return base;
}

/** -------------------- APP -------------------- **/
export default function App() {
  const [scenario, setScenario] = useState("");
  const [levels, setLevels] = useState(Object.fromEntries(TRAITS.map(t => [t.key, NEUTRAL])));

  const applyScenario = () => setLevels(recommendFromText(scenario));
  const usePreset = (text) => {
    setScenario(text);
    setLevels(recommendFromText(text));
  };
  const resetNeutral = () => setLevels(Object.fromEntries(TRAITS.map(t => [t.key, NEUTRAL])));

  return (
    <div className="page">
      <div className="container">
        <h1>Good Psychopath Mixing Desk</h1>
        <p className="subtitle">
          Enter a scenario or tap a preset. Then press <b>Recommend Dials</b> to see suggested levels (0–10).
        </p>

        <div className="preset-row">
          {PRESETS.map(p => (
            <button key={p.id} className="btn preset" onClick={() => usePreset(p.text)}>
              {p.label}
            </button>
          ))}
        </div>

        <textarea
          value={scenario}
          onChange={(e) => setScenario(e.target.value)}
          placeholder="e.g., talking to strangers at a conference; high-stakes negotiation; production outage crisis..."
          className="scenario"
          rows={3}
        />

        <div className="btn-row">
          <button className="btn primary" onClick={applyScenario}>Recommend Dials</button>
          <button className="btn" onClick={resetNeutral}>Reset</button>
        </div>

        <Legend />

        <div className="bars">
          {TRAITS.map(trait => (
            <BarRow key={trait.key} name={trait.name} value={levels[trait.key]} />
          ))}
        </div>
      </div>
    </div>
  );
}
