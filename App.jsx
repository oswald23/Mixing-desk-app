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

const PRESETS = [
  { id: "presentation", label: "Presentation", text: "Big presentation with Q&A; persuade and stay calm" },
  { id: "negotiation", label: "Negotiation", text: "High-stakes negotiation on contract terms" },
  { id: "crisis", label: "Crisis", text: "Production outage / emergency decision" },
  { id: "network", label: "Networking", text: "Meet new people; build rapport fast" }
];

export default function App() {
  const [scenario, setScenario] = useState("");
  const [levels, setLevels] = useState(
    Object.fromEntries(TRAITS.map(t => [t.key, NEUTRAL]))
  );

  const applyAdjust = (newLevels, key, delta) => {
    newLevels[key] = Math.max(0, Math.min(10, (newLevels[key] ?? NEUTRAL) + delta));
  };

  const recommendFor = (text) => {
    const t = (text || "").toLowerCase();
    const newLevels = Object.fromEntries(TRAITS.map(tr => [tr.key, NEUTRAL]));

    const up = (k,d=1)=>applyAdjust(newLevels,k,d);
    const down = (k,d=1)=>applyAdjust(newLevels,k,-d);

    // Presentation
    if (/(presentation|pitch|talk|audience|keynote)/.test(t)) {
      up("selfConfidence", 2);
      up("charisma", 2);
      up("charm", 1);
      up("coolness", 2);
      up("focus", 1);
      down("impulsivity", 1);
      down("ruthlessness", 1);
    }

    // Negotiation
    if (/(negotiation|negotiate|deal|contract|bargain|counter)/.test(t)) {
      up("focus", 2);
      up("coolness", 2);
      up("selfConfidence", 1);
      up("charm", 1);
      up("ruthlessness", 1);
      down("impulsivity", 2);
    }

    // Crisis
    if (/(crisis|emergency|panic|chaos|outage|urgent)/.test(t)) {
      up("fearlessness", 2);
      up("coolness", 3);
      up("focus", 2);
      up("toughness", 2);
      up("ruthlessness", 1);
      down("impulsivity", 2);
    }

    // Networking
    if (/(network|meet|introduce|mingle)/.test(t)) {
      up("charm", 2);
      up("charisma", 1);
      up("selfConfidence", 1);
      down("focus", 1);
      down("ruthlessness", 1);
    }

    return newLevels;
  };

  const recommend = () => {
    setLevels(recommendFor(scenario));
  };

  const loadPreset = (p) => {
    setScenario(p.text);
    setLevels(recommendFor(p.text));
  };

  return (
    <div className="p-6 font-sans max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Good Psychopath Mixing Desk</h1>
      <p className="text-sm opacity-80 mb-4">
        Enter a scenario or tap a preset. Then press <b>Recommend Dials</b> to see suggested levels (0–10).
      </p>
      <div className="flex gap-2 flex-wrap mb-3">
        {PRESETS.map(p => (
          <button key={p.id} onClick={()=>loadPreset(p)}
            className="px-3 py-2 rounded bg-black text-white">
            {p.label}
          </button>
        ))}
      </div>
      <textarea
        value={scenario}
        onChange={e => setScenario(e.target.value)}
        placeholder="e.g., Renegotiating a big contract under pressure"
        className="w-full p-2 border rounded mb-3"
        rows={3}
      />
      <button onClick={recommend} className="bg-blue-600 text-white px-4 py-2 rounded">
        Recommend Dials
      </button>

      <div className="mt-6 space-y-3">
        {TRAITS.map(trait => (
          <div key={trait.key} className="flex items-center gap-3">
            <div className="w-48">{trait.name}</div>
            <motion.div
              className="h-3 rounded"
              style={{ background: "#10b981", width: `${levels[trait.key]*10}%` }}
              initial={{ width: 0 }}
              animate={{ width: `${levels[trait.key]*10}%` }}
              transition={{ duration: 0.5 }}
            />
            <span className="w-6 text-right">{levels[trait.key]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
