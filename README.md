# ቡና — Enana, Suzi, Beza & Tesfanesh

Four friends in habesha kemis at an Ethiopian coffee ceremony. Talk to them by voice or text:
press **Start**, then call a girl by name (“Enana, …”, “Beza, …”, or ሁላችሁም for everyone) and only she answers, **only in Amharic**, each with her own Gemini voice,
and each starts with "እኔ [name] ነኝ።".

## Run in GitHub Codespaces
1. Add your key once: GitHub → Settings → Codespaces → Secrets → **New secret**
   `GEMINI_API_KEY` = your key, repository: this repo.
2. **Code → Codespaces → Create codespace on main** (or, in an existing codespace: `git pull`).
3. Run `node server.js` if it didn't start, then open port 3000 (Ports tab → globe icon).
4. Chrome or Edge → press **🎤 አውሩ · Talk**.

No secret? `cp .env.example .env`, paste your key into `.env` (it is git-ignored).

## Settings (.env or Codespaces secrets)
- `GEMINI_MODEL` — best text model (default `gemini-3.8-flash`); `GEMINI_FAST_MODEL` — backup if the best is slow (default `gemini-3.5-flash-lite`)
- `GEMINI_TTS_MODEL` — voice model(s), comma-separated (default `gemini-3.8-flash-tts,gemini-3.1-flash-tts-preview`)
- Personalities and voices: edit `GIRLS` in `server.js`.
