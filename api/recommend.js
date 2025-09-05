// Serverless API (Vercel) — AI-only recommender with optional PDF grounding.
// Set OPENAI_API_KEY in Vercel → Project → Settings → Environment Variables.

export const config = { runtime: "nodejs" }; // Node runtime (pdf-parse needs Node)

import pdfParse from "pdf-parse";

/** Always respond JSON helper */
function sendJson(res, code, payload) {
  try {
    res.status(code).json(payload);
  } catch {
    // final fallback
    res.status(500).setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Failed to serialize JSON response" }));
  }
}

/** Convert common share links to direct-download URLs */
function toDirectPdfUrl(url) {
  if (!url) return "";
  try {
    const u = new URL(url);

    // Google Drive: /file/d/<id>/view?usp=sharing  ==> uc?export=download&id=<id>
    if (u.hostname.includes("drive.google.com")) {
      const idMatch = u.pathname.match(/\/d\/([^/]+)/);
      if (idMatch?.[1]) return `https://drive.google.com/uc?export=download&id=${idMatch[1]}`;
    }

    // Dropbox: dl=0 ==> dl=1
    if (u.hostname.includes("dropbox.com")) {
      u.searchParams.set("dl", "1");
      return u.toString();
    }

    // OneDrive: best effort — add download=1
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
    if (!r.ok) throw new Error(`PDF fetch failed (${r.status})`);
    const buf = Buffer.from(await r.arrayBuffer());
    const data = await pdfParse(buf);
    const text = (data.text || "").replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
    return text.slice(0, 12000); // ~12k chars for prompt (tune as needed)
  } catch (e) {
    // Return empty so the app still works without PDF
    return "";
  }
}

function clamp10(n) {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.max(0, Math.min(10, v)) : 5;
}

async function readJson(req) {
  // Vercel Node runtime often gives req.body; still guard streaming
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  try { return JSON.parse(raw || "{}"); } catch { return {}; }
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return sendJson(res, 405, { error: "Use POST" });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return sendJson(res, 500, { error: "Missing OPENAI_API_KEY in Vercel env" });
    }

    const body = await readJson(req);
    const scenario = (body?.scenario || "").toString();
    const rawPdfUrl = body?.pdfUrl ? body.pdfUrl.toString() : "";
    const pdfUrl = rawPdfUrl ? toDirectPdfUrl(rawPdfUrl) : "";

    if (!scenario || scenario.trim().length < 3) {
      return sendJson(res, 400, { error: "Missing or too-short 'scenario'" });
    }

    const kb = await fetchPdfText(pdfUrl);

    const traits = [
      "ruthlessness","fearlessness","impulsivity","selfConfidence","focus",
      "coolness","toughness","charm","charisma","reducedEmpathy","lackConscience"
    ];

    // Use the best widely available API model. DO NOT put "gpt-5" here; it’s not an API model.
    const model = process.env.OPENAI_MODEL || "gpt-4o";

    const system = `
You are a coaching assistant. Map any scenario to psychopathic trait "dials" (0 = off, 10 = max)
using the mixing-desk idea. Be precise, practical, and grounded in the provided PDF excerpt if present.
- If a PDF excerpt is provided, use it as knowledge/context. Quote very short phrases when relevant.
- If the excerpt is irrelevant or empty, rely on general guidance.
Output STRICT JSON only with:
{
  "levels": { <traitKey>: 0-10, ... },
  "rationales": { <traitKey>: "1–2 sentences referencing the scenario and, if useful, short quoted snippets from the PDF" },
  "summary": "2–4 sentence overview of the dial plan"
}
Trait keys: ${traits.join(", ")}.
Rules of thumb (override with scenario specifics/PDF when needed):
- Presentation: ↑ selfConfidence, charisma, charm, coolness; ↓ impulsivity, ruthlessness.
- Negotiation: ↑ focus, coolness, selfConfidence, charm, (sometimes) ruthlessness; ↓ impulsivity.
- Crisis: ↑ coolness, focus, fearlessness, toughness; ↓ impulsivity.
- Difficult talk/firing: ↑ focus, coolness, selfConfidence, slight ↑ ruthlessness; keep empathy higher than baseline.
- Precision/surgery: ↑ coolness, focus, reducedEmpathy; ↓ impulsivity, charm, charisma.
- Networking: ↑ charm, charisma, selfConfidence, coolness; ↓ impulsivity, ruthlessness.
Levels must be integers 0–10.
`.trim();

    const user = `
Scenario:
${scenario}

PDF_Excerpt (may be empty):
${kb || "(none)"}
`.trim();

    // Call OpenAI
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        response_format: { type: "json_object" }
      })
    });

    let data;
    let textFallback = "";
    try {
      data = await r.json();
    } catch {
      // If the server returned HTML/text, capture a tiny snippet to help debug
      textFallback = await r.text().catch(() => "");
      return sendJson(res, 502, { error: "Upstream returned non-JSON", snippet: textFallback.slice(0, 200) });
    }

    if (!r.ok) {
      // Return the API error payload safely
      const msg = data?.error?.message || "OpenAI API error";
      return sendJson(res, r.status, { error: msg });
    }

    let content = data?.choices?.[0]?.message?.content;
    if (typeof content === "string") {
      try { content = JSON.parse(content); } catch {
        return sendJson(res, 500, { error: "Model did not return valid JSON", snippet: String(content).slice(0, 200) });
      }
    }

    const rawLevels = content?.levels || {};
    const levels = {};
    for (const k of traits) levels[k] = clamp10(rawLevels[k]);

    const rationales = content?.rationales || {};
    const summary = content?.summary || "";

    return sendJson(res, 200, { levels, rationales, summary });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || "Server error" });
  }
}
