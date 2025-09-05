// Serverless API (Vercel) â€” AI-only recommender with optional PDF grounding.
// Set OPENAI_API_KEY in Vercel â†’ Project â†’ Settings â†’ Environment Variables.

export const config = { runtime: "nodejs" }; // Node runtime (pdf-parse needs Node)

import pdfParse from "pdf-parse";

/** Convert common share links to direct-download URLs */
function toDirectPdfUrl(url) {
  if (!url) return "";
  try {
    const u = new URL(url);

    // Google Drive: /file/d/<id>/view?usp=sharing  ==>  uc?export=download&id=<id>
    if (u.hostname.includes("drive.google.com")) {
      const idMatch = u.pathname.match(/\/d\/([^/]+)/);
      if (idMatch?.[1]) return `https://drive.google.com/uc?export=download&id=${idMatch[1]}`;
    }

    // Dropbox: dl=0 ==> dl=1
    if (u.hostname.includes("dropbox.com")) {
      u.searchParams.set("dl", "1");
      return u.toString();
    }

    // OneDrive: best effort â€” force download param when present
    if (u.hostname.includes("1drv.ms") || u.hostname.includes("onedrive.live.com")) {
      if (!u.searchParams.has("download")) u.searchParams.set("download", "1");
      return u.toString();
    }

    return url;
  } catch {
    return url;
  }
}

/** Fetch & parse PDF text (trim to keep prompt small) */
async function fetchPdfText(url) {
  if (!url) return "";
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`fetch failed (${r.status})`);
    const buf = Buffer.from(await r.arrayBuffer());
    const data = await pdfParse(buf);
    const text = (data.text || "").replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
    return text.slice(0, 12000); // ~12k chars for prompt (tune as needed)
  } catch (e) {
    return ""; // continue without PDF if it fails
  }
}

function clamp10(n) {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.max(0, Math.min(10, v)) : 5;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
    const body = await readJson(req);
    const scenario = (body?.scenario || "").toString();
    const rawPdfUrl = body?.pdfUrl ? body.pdfUrl.toString() : "";
    const pdfUrl = rawPdfUrl ? toDirectPdfUrl(rawPdfUrl) : ""

    if (!scenario || scenario.trim().length < 3) {
      return res.status(400).json({ error: "Missing or too-short 'scenario'" });
    }

    const kb = await fetchPdfText(pdfUrl);

    const traits = [
      "ruthlessness","fearlessness","impulsivity","selfConfidence","focus",
      "coolness","toughness","charm","charisma","reducedEmpathy","lackConscience"
    ];

    const system = `
You are a coaching assistant. Map any scenario to psychopathic trait "dials" (0 = off, 10 = max)
using the mixing-desk idea. Be precise, practical, and grounded in the provided PDF excerpt if present.
- If a PDF excerpt is provided, use it as knowledge/context. Quote very short phrases when relevant.
- If the excerpt is irrelevant or empty, rely on general guidance.
Output STRICT JSON only with:
{
  "levels": { <traitKey>: 0-10, ... },
  "rationales": { <traitKey>: "1â€“2 sentences referencing the scenario and, if useful, short quoted snippets from the PDF" },
  "summary": "2â€“4 sentence overview of the dial plan"
}
Trait keys: ${traits.join(", ")}.
Rules of thumb (override with scenario specifics/PDF when needed):
- Presentation: â†‘ selfConfidence, charisma, charm, coolness; â†“ impulsivity, ruthlessness.
- Negotiation: â†‘ focus, coolness, selfConfidence, charm, (sometimes) ruthlessness; â†“ impulsivity.
- Crisis: â†‘ coolness, focus, fearlessness, toughness; â†“ impulsivity.
- Difficult talk/firing: â†‘ focus, coolness, selfConfidence, slight â†‘ ruthlessness; keep empathy higher than baseline.
- Precision/surgery: â†‘ coolness, focus, reducedEmpathy; â†“ impulsivity, charm, charisma.
- Networking: â†‘ charm, charisma, selfConfidence, coolness; â†“ impulsivity, ruthlessness.
Levels must be integers 0â€“10.
`;

    const user = `
Scenario:
${scenario}

PDF_Excerpt (may be empty):
${kb || "(none)"}
`;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        response_format: { type: "json_object" }
      })
    });

    const data = await r.json();
    if (!r.ok) {
      return res.status(500).json({ error: data?.error?.message || "LLM error" });
    }

    let content = data?.choices?.[0]?.message?.content;
    if (typeof content === "string") {
      try { content = JSON.parse(content); } catch {}
    }

    const rawLevels = content?.levels || {};
    const levels = {};
    for (const k of traits) levels[k] = clamp10(rawLevels[k]);

    const rationales = content?.rationales || {};
    const summary = content?.summary || "";

    return res.status(200).json({ levels, rationales, summary });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  try { return JSON.parse(raw || "{}"); } catch { return {}; }
}
