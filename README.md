# Enana — Ethiopian coffee ceremony girl that talks

An animated girl in a habesha kemis performing the buna ceremony. Talk to her with your voice; she answers with Gemini.

## Run in GitHub Codespaces
1. Add your key as a Codespaces secret (once):
   GitHub → Settings → Codespaces → Secrets → **New secret**
   Name: `GEMINI_API_KEY`, value: your key, repository: this repo.
2. On this repo page: **Code → Codespaces → Create codespace on main**.
3. The server starts by itself and port 3000 opens in a new tab.
   If not, run `node server.js` in the terminal, then open the **Ports** tab → globe icon on port 3000.
4. Use Chrome or Edge, press **🎤 Talk**, allow the microphone.

## Run on your computer
Copy `.env.example` to `.env`, paste your key, then `node server.js` and open http://localhost:3000.

Never commit `.env` or your API key.
