export const config = { runtime: "nodejs" };

import pdfParse from "pdf-parse";

/** Always return JSON */
function sendJson(res, code, payload) {
  try {
    res.status(code).setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(payload));
  } catch {
    res.status(500).setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Failed to serialize JSON response" }));
  }
}

/** Convert common share links to direct-download URLs */
function toDirectPdfUrl(url) {
  if (!url) return "";
  try {
    const u = new URL(url);
    if (u.hostname.includes("drive.google.com")) {
      const idMatch = u.pathname.match(/\/d\/([^/]+)/);
      if (idMatch?.[1]) return `https://drive.google.com/uc?export=download&id=${idMatch[1]}`;
    }
    if (u.hostname.includes("dropbox.com")) {
      u.searchParams.set("dl", "1"); return u.toString();
    }
    if (u.hostname.includes("1drv.ms") || u.hostname.includes("onedrive.live.com")) {
      if (!u.searchParams.has("download")) u.searchParams.set("download", "1");
      return u.toString();
    }
    return url;
  } catch { return url; }
}

/** Fetch & parse PDF text (trim for token budget) */
async function fetchPdfText(url) {
  if (!url) return "";
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`PDF fetch failed (${r.status})`);
    const buf = Buffer.from(await r.arrayBuffer());
    const data = await pdfParse(buf);
    const text = (data.text || "").replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
    return text.slice(0, 12000);
  } catch { return ""; }
}

function clamp10(n){ const v=Math.round(Number(n)); return Number.isFinite(v)?Math.max(0,Math.min(10,v)):5; }

async function readJson(req){
  if (req.body && typeof req.body === "object") return req.body;
  const chunks=[]; for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return {}; }
}

export default async function handler(req,res){
  try{
    if (req.method !== "POST") return sendJson(res,405,{error:"Use POST"});
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return sendJson(res,500,{error:"Missing OPENAI_API_KEY in Vercel env"});

    const body = await readJson(req);
    const scenario = (body?.scenario || "").toString();
    if (!scenario || scenario.trim().length < 3) return sendJson(res,400,{error:"Missing or too-short 'scenario'"});

    const rawPdf = body?.pdfUrl ? body.pdfUrl.toString() : "";
    const pdfUrl = rawPdf ? toDirectPdfUrl(rawPdf) : "";
    const kb = await fetchPdfText(pdfUrl);

    const traits = ["ruthlessness","fearlessness","impulsivity","selfConfidence","focus","coolness","toughness","charm","charisma","reducedEmpathy","lackConscience"];
    const model = process.env.OPENAI_MODEL || "gpt-4o"; // safest advanced API model

    const system = `
You are a coaching assistant. Map any scenario to psychopathic trait "dials" (0–10).
If PDF context is given, use it (quote tiny phrases). Output STRICT JSON:
{
  "levels": { <traitKey>: 0-10, ... },
  "rationales": { <traitKey>: "1–2 sentences..." },
  "summary": "2–4 sentences"
}
Trait keys: ${traits.join(", ")}.`.trim();

    const user = `
Scenario:
${scenario}

PDF_Excerpt (may be empty):
${kb || "(none)"}
`.trim();

    const r = await fetch("https://api.openai.com/v1/chat/completions",{
      method:"POST",
      headers:{ "Authorization":`Bearer ${apiKey}`, "Content-Type":"application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [{ role:"system", content: system }, { role:"user", content: user }],
        response_format: { type:"json_object" }
      })
    });

    let data, textFallback="";
    try { data = await r.json(); }
    catch {
      textFallback = await r.text().catch(()=> "");
      return sendJson(res,502,{ error:"Upstream returned non-JSON", snippet:textFallback.slice(0,200) });
    }
    if (!r.ok) return sendJson(res, r.status, { error: data?.error?.message || "OpenAI API error" });

    let content = data?.choices?.[0]?.message?.content;
    if (typeof content === "string") {
      try { content = JSON.parse(content); }
      catch { return sendJson(res,500,{ error:"Model did not return valid JSON", snippet:String(content).slice(0,200) }); }
    }

    const rawLevels = content?.levels || {};
    const levels = {}; for (const k of traits) levels[k] = clamp10(rawLevels[k]);

    return sendJson(res,200,{ levels, rationales: content?.rationales || {}, summary: content?.summary || "" });
  } catch(e){
    return sendJson(res,500,{ error: e?.message || "Server error" });
  }
}
