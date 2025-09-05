# Good Psychopath Mixing Desk – AI Only (with optional PDF grounding)

Type a scenario and (optionally) paste a PDF URL. The app calls a serverless
endpoint that prompts an LLM to return 0–10 dial levels plus per-trait commentary
and an overall summary. If a PDF is provided, the model is asked to use it as a
knowledge base (quotes short snippets when helpful).

## Deploy
1) In Vercel → Project → Settings → Environment Variables:
   - `OPENAI_API_KEY` = your API key (Targets: Production + Preview)
2) Import this repo to Vercel and Deploy (Framework: **Vite**, Build: `vite build`, Output: `dist`).

## Local
```bash
npm install
npm run dev
