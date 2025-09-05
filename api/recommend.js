// api/recommend.js
export const config = { runtime: "nodejs" };

import pdfParse from "pdf-parse";

/** Always return JSON */
function sendJson(res, code, payload) {
  res.status(code).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

/** Convert common share links to direct-download URLs */
function toDirectPdfUrl(url) {
  if (!url) return "";
  try {
    const u = new URL(url);
    if (u.hostname.includes("drive.google.com")) {
      const idMatch = u.pathname.match(/\/d\/([^/]+)/);
      if (idMatch?.[1]) {
        return `https://drive.google.com/uc?export=download&id=${idMatch[1]}`;
      }
    }
    if (u.hostname.includes("dropbox.com")) {
      u.searchParams.set("dl", "1");
      return u.toString();
    }
    if (u.hostname.includes("1drv.ms") || u.hostname.includes("onedrive.live.com")) {
      if (!u.searchParams.has("download")) u.searchParams.set("download", "1");
      return u.toString();
    }
    return url;
  } catch {
    return url;
  }
}

/** Fetch & parse PDF text */
async function fetchPdfText(url) {
  if (!url) return "";
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`PDF fetch failed (${r.status})`);
    const buf = Buffer.from(await r.arrayBuffer());
    const data = await pdfParse(buf);
    return (data.text || "").slice(0, 12000);
  } catch {
    return "";
  }
}

function clamp10(n) {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.max(0, Math.min(10, v)) : 5;
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Use POST" });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return sendJson(res, 500, { error: "Missing OPENAI_API_KEY" });

    const body = await readJson(req);
    const scenario = (body?.scenario || "").toString();
    if (!scenario || scenario.trim().length < 3) {
      return sendJson(res, 400, { error: "Missing or too-short scenario" });
    }

    const pdfUrl = body?.pdfUrl ? toDirectPdfUrl(body.pdfUrl.toString()) : "";
    const kb = await fetchPdfText(pdfUrl);

    const traits = [
      "ruthlessness","fearlessness","impulsivity","selfConfidence","focus",
      "coolness","toughness","charm","charisma","reducedEmpathy","lackConscience"
    ];

    const system = `
You are a coaching assistant. Map any scenario to psychopathic trait "dials" (0–10).
If PDF context is given, use it. Always output JSON with:
{
  "levels": {...},
  "rationales": {...},
  "summary": "..."
}`.trim();

    const user = `
Scenario:
${scenario}

PDF Excerpt:
${kb || "(none)"}
`.trim();

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o", // safest choice
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        response_format: { type: "json_object" }
      })
    });

    let data;
    try {
      data = await r.json();
    } catch {
      const txt = await r.text().catch(() => "");
      return sendJson(res, 502, { error: "Upstream returned non-JSON", snippet: txt.slice(0, 200) });
    }

    if (!r.ok) {
      return sendJson(res, r.status, { error: data?.error?.message || "OpenAI API error" });
    }

    let content = data?.choices?.[0]?.message?.content;
    try {
      if (typeof content === "string") content = JSON.parse(content);
    } catch {
      return sendJson(res, 500, { error: "Model did not return valid JSON", snippet: String(content).slice(0, 200) });
    }

    const rawLevels = content?.levels || {};
    const levels = {};
    for (const k of traits) levels[k] = clamp10(rawLevels[k]);

    return sendJson(res, 200, {
      levels,
      rationales: content?.rationales || {},
      summary: content?.summary || ""
    });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || "Server error" });
  }
}
