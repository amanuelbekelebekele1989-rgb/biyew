// server.js — serves the coffee ceremony page and talks to Gemini.
// Four girls answer in turn: Enana → Suzi → Beza → Tesfanesh. They only speak Amharic.
// Needs Node.js 18+. No npm packages.
//
//   1. .env next to this file:   GEMINI_API_KEY=your-key-here
//      (or a Codespaces secret named GEMINI_API_KEY)
//   2. node server.js
//   3. open http://localhost:3000 in Chrome or Edge

const http = require("http");
const fs = require("fs");
const path = require("path");

// --- tiny .env loader ---
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const API_KEY = process.env.GEMINI_API_KEY;
// Tried in order: if one model is busy (503) or slow, the next one answers.
const TEXT_MODELS = (process.env.GEMINI_MODEL || "gemini-3.8-flash,gemini-3.6-flash,gemini-3.5-flash-lite").split(",").map(s => s.trim());
const TEXT_MODEL = TEXT_MODELS.join(" → ");
const TTS_MODELS = (process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-tts,gemini-3.1-flash-tts-preview").split(",");
const PORT = process.env.PORT || 3000;
const API = "https://generativelanguage.googleapis.com/v1beta/models";

if (!API_KEY) {
  console.error("Missing GEMINI_API_KEY. Add it to .env or as a Codespaces secret.");
  process.exit(1);
}

// --- The four girls. Change personalities or voices here. ---
const GIRLS = {
  enana:     { am: "እናና",   voice: "Kore",   about: "the warm host who is making the coffee; kind, motherly, proud of the buna tradition" },
  suzi:      { am: "ሱዚ",    voice: "Aoede",  about: "playful and funny; loves jokes, music and teasing her friends gently" },
  beza:      { am: "ቤዛ",    voice: "Leda",   about: "calm and wise; loves Ethiopian history, culture and old proverbs (ተረትና ምሳሌ)" },
  tesfanesh: { am: "ተስፋነሽ", voice: "Zephyr", about: "curious and dreamy; loves science, space, school and big goals" },
};

function persona(id) {
  const me = GIRLS[id];
  const friends = Object.entries(GIRLS).filter(([k]) => k !== id).map(([, g]) => g.am).join("፣ ");
  return `You are ${me.am}, a young Ethiopian woman in a habesha kemis, sitting with your friends ${friends}
at a buna (coffee ceremony) with jebena, etan incense and three rounds: abol, tona, baraka.
Your personality: ${me.about}.
The friends take turns answering the guest. Earlier lines from your friends are marked with their names.
RULES:
- Answer ONLY in Amharic, written in Ge'ez (Fidel) script — even if the guest speaks English. Never use Latin letters.
- 1 to 3 short, natural spoken sentences. No lists, no markdown, no emojis.
- Do NOT start with your name or "እኔ ... ነኝ" — the app adds that for you.
- You may react to what your friends said.`;
}

const INTRO = id => `እኔ ${GIRLS[id].am} ነኝ። `;
function clean(id, text) {
  return text
    .replace(/^\s*[^\s:：]{1,12}\s*[:：]\s*/, "")                // "ቤዛ: ..." label
    .replace(/^\s*(እኔ\s*\S{1,10}\s*ነኝ[።!.,፣]?\s*)/, "")        // duplicate intro
    .replace(/[*_#`]/g, "")
    .trim();
}

async function gemini(model, body, timeoutMs = 25000) {
  const t0 = Date.now();
  let res;
  try {
    res = await fetch(`${API}/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": API_KEY },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),            // never wait forever
    });
  } catch (e) {
    throw new Error(e.name === "TimeoutError" ? `${model} took longer than ${timeoutMs / 1000}s` : e.message);
  }
  const data = await res.json();
  console.log(`  ${model}: ${res.status} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (!res.ok) throw new Error(data.error?.message || `Gemini error ${res.status}`);
  return data;
}

async function askGirl(id, history) {
  const contents = history
    .filter(h => h && typeof h.text === "string" && h.text.trim())
    .slice(-24)
    .map(h => h.role === "model"
      ? { role: "model", parts: [{ text: `${GIRLS[h.speaker]?.am || ""}: ${h.text.slice(0, 1500)}` }] }
      : { role: "user", parts: [{ text: h.text.slice(0, 1500) }] });

  const req = {
    systemInstruction: { parts: [{ text: persona(id) }] },
    contents,
    generationConfig: { maxOutputTokens: 1024, thinkingConfig: { thinkingLevel: "low" } },  // think less = answer faster
  };
  let data, lastErr;
  for (const model of TEXT_MODELS) {
    const r = JSON.parse(JSON.stringify(req));
    try { data = await gemini(model, r); break; }
    catch (e) {
      lastErr = e;
      if (/think/i.test(e.message)) {                   // model doesn't accept thinkingLevel → ask without it
        delete r.generationConfig.thinkingConfig;
        try { data = await gemini(model, r); break; } catch (e2) { lastErr = e2; }
      }
      console.log(`  ${model} failed (${lastErr.message.slice(0, 60)}) → trying next model`);
    }
  }
  if (!data) throw lastErr;
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("").trim();
  return INTRO(id) + (clean(id, text || "") || "ይቅርታ፣ እንደገና ይጠይቁኝ።");
}

// --- Text to speech (Gemini TTS supports Amharic) ---
function pcmToWav(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

let workingTts = null;   // remembers which TTS model worked
async function speakAmharic(id, text) {
  const models = workingTts ? [workingTts] : TTS_MODELS;
  let lastErr;
  for (const model of models) {
    try {
      const data = await gemini(model, {
        contents: [{ parts: [{ text: `Say this in Amharic, warmly and naturally, like a friendly young Ethiopian woman: ${text}` }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: GIRLS[id].voice } } },
        },
      }, 45000);
      const part = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
      if (!part) throw new Error("no audio returned");
      const { mimeType = "", data: b64 } = part.inlineData;
      let buf = Buffer.from(b64, "base64");
      if (!/wav/i.test(mimeType)) {                       // raw PCM → wrap as WAV
        const rate = Number((mimeType.match(/rate=(\d+)/) || [])[1]) || 24000;
        buf = pcmToWav(buf, rate);
      }
      workingTts = model;
      return buf.toString("base64");
    } catch (e) { lastErr = e; console.error(`TTS ${model}: ${e.message}`); }
  }
  throw lastErr;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return fs.createReadStream(path.join(__dirname, "buna-girl.html")).pipe(res);
  }

  if (req.method === "POST" && req.url === "/api/chat") {
    let body = "";
    req.on("data", c => { body += c; if (body.length > 200000) req.destroy(); });
    req.on("end", async () => {
      res.setHeader("Content-Type", "application/json");
      try {
        const { history, speaker } = JSON.parse(body || "{}");
        if (!GIRLS[speaker]) throw new Error("unknown speaker");
        if (!Array.isArray(history)) throw new Error("history must be an array");
        console.log(`→ ${speaker} is answering`);
        const reply = await askGirl(speaker, history);
        res.end(JSON.stringify({ reply }));
      } catch (err) {
        console.error(err.message);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/tts") {
    let body = "";
    req.on("data", c => { body += c; if (body.length > 20000) req.destroy(); });
    req.on("end", async () => {
      res.setHeader("Content-Type", "application/json");
      try {
        const { text, speaker } = JSON.parse(body || "{}");
        if (!GIRLS[speaker] || typeof text !== "string") throw new Error("bad request");
        console.log(`→ ${speaker} voice`);
        res.end(JSON.stringify({ audio: await speakAmharic(speaker, text.slice(0, 1500)) }));
      } catch (err) {
        console.error("Voice failed:", err.message);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404); res.end("Not found");
});

server.listen(PORT, () => console.log(`☕ Enana, Suzi, Beza & Tesfanesh are ready → http://localhost:${PORT}  (text: ${TEXT_MODEL})`));
