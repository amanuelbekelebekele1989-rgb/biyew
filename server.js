// server.js — serves the animation and talks to Gemini.
// Needs Node.js 18 or newer. No npm packages needed.
//
//   1. Put your key in a file named .env next to this file:
//        GEMINI_API_KEY=your-key-here
//   2. Run:   node server.js
//   3. Open:  http://localhost:3000   (in Chrome or Edge)

const http = require("http");
const fs = require("fs");
const path = require("path");

// --- Load .env (tiny loader so you don't need the dotenv package) ---
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite"; // fast + cheap; change if you like
const PORT = process.env.PORT || 3000;

if (!API_KEY) {
  console.error("Missing GEMINI_API_KEY. Create a .env file with GEMINI_API_KEY=your-key");
  process.exit(1);
}

// --- Her personality. Edit this to change who she is. ---
const PERSONA = `You are Enana, a warm, friendly young Ethiopian woman wearing a habesha kemis.
You are performing the Ethiopian coffee ceremony (buna): roasting beans, brewing in the jebena,
burning etan (frankincense), and serving abol, tona, and baraka.
Your words are spoken aloud by a text-to-speech voice, so:
- Your name is Enana. The app already says "I am Enana" before every reply, so do NOT start your reply with your name or a self-introduction.
- Reply in 1 to 3 short sentences.
- No markdown, no lists, no emojis, no asterisks.
- You may sprinkle in simple Amharic greetings like "Selam" or "Buna tetu" with their meaning.
Be kind, curious, and happy to chat about anything, not only coffee.`;

async function askGemini(history) {
  const contents = history
    .filter(h => h && typeof h.text === "string" && h.text.trim())
    .slice(-20)
    .map(h => ({ role: h.role === "model" ? "model" : "user", parts: [{ text: h.text.slice(0, 2000) }] }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: PERSONA }] },
      contents,
      generationConfig: { maxOutputTokens: 300 }
    })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Gemini error ${res.status}`);
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("").trim();
  return text || "Hmm, I'm not sure what to say. Ask me again?";
}

const server = http.createServer(async (req, res) => {
  // Serve the animation page
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return fs.createReadStream(path.join(__dirname, "buna-girl.html")).pipe(res);
  }

  // Chat endpoint
  if (req.method === "POST" && req.url === "/api/chat") {
    let body = "";
    req.on("data", c => { body += c; if (body.length > 100000) req.destroy(); });
    req.on("end", async () => {
      res.setHeader("Content-Type", "application/json");
      try {
        const { history } = JSON.parse(body || "{}");
        if (!Array.isArray(history)) throw new Error("history must be an array");
        const reply = await askGemini(history);
        res.end(JSON.stringify({ reply }));
      } catch (err) {
        console.error(err.message);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404); res.end("Not found");
});

server.listen(PORT, () => console.log(`Enana is ready → http://localhost:${PORT}  (model: ${MODEL})`));
