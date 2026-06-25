// ─── WhatsApp dot-command responder ──────────────────────────────────────────
// Ported from the original self-bot (github.com/oluwacoded/WhatsApp.js). This is
// the EXPLICIT, user-invoked command surface only. All PASSIVE behaviour from the
// original — keyword auto-reply, the AI "mirror"/cover mode (.ai/.online/.offline/
// .proactive/.takeover), auto-react, passive transcribe/vision, scam alerts — is
// intentionally NOT ported (the user asked to drop the AI auto-reply).
//
// Gating: this is a SELF-BOT. Only the linked account's OWN messages (msg.key.
// fromMe — i.e. the owner typing on their phone) trigger commands. Messages from
// other contacts are ignored, which keeps the account out of spam/ban territory.

export interface WaCommandDeps {
  sock: any;
  ev: { messages: any[]; type: string };
  settings: any; // shared, mutable: { prefix, callBlock, ... }
  writeJSON: (file: string, data: any) => void;
  readJSON: <T>(file: string, def: T) => T;
  rememberMessage: (jid: string, id: string, message: any) => void;
  downloadMediaMessage: (msg: any, type: "buffer", opts: any) => Promise<Buffer>;
  startTime: number;
}

// ─── In-memory runtime state (per process) ───────────────────────────────────
let messageCount = 0;
const commandStats: Record<string, number> = {};
const chatSet = new Set<string>();
const activePersona = new Map<string, string>(); // chatJid -> persona name

const MAX_ACTIONABLE_MSG_AGE_MS = 60 * 1000;

// ─── Data arrays ─────────────────────────────────────────────────────────────
const JOKES = ["why don't scientists trust atoms? because they make up everything 😭", "i told my wife she was drawing her eyebrows too high. she looked surprised", "why can't you give elsa a balloon? because she'll let it go", "i'm reading a book about anti-gravity. it's impossible to put down", "why did the scarecrow win an award? he was outstanding in his field", "my wife told me i had to stop acting like a flamingo. i had to put my foot down", "what do you call a fake noodle? an impasta", "how do you organize a space party? you planet", "why did the bicycle fall over? it was two-tired", "i used to hate facial hair but then it grew on me", "what do you call cheese that isn't yours? nacho cheese", "why do cows wear bells? because their horns don't work", "what do you call a sleeping dinosaur? a dino-snore", "why did the math book look so sad? because it had too many problems", "i would tell you a joke about construction but i'm still working on it"];
const FACTS = ["honey never spoils — archaeologists found 3000 year old honey in egyptian tombs and it was still good", "a group of flamingos is called a flamboyance", "the shortest war in history was between britain and zanzibar in 1896. zanzibar surrendered after 38 minutes", "octopuses have three hearts and blue blood", "the average person walks about 100,000 miles in their lifetime", "bananas are slightly radioactive", "a day on venus is longer than a year on venus", "the human nose can detect over 1 trillion different scents", "sharks are older than trees", "cleopatra lived closer in time to the moon landing than to the construction of the great pyramid", "a bolt of lightning is five times hotter than the sun's surface", "wombats produce cube-shaped poop", "the eiffel tower grows about 6 inches in summer due to heat expansion", "there are more possible chess games than atoms in the observable universe"];
const QUOTES = ["the only way to do great work is to love what you do — steve jobs", "life is what happens when you're busy making other plans — john lennon", "in the middle of every difficulty lies opportunity — einstein", "it does not matter how slowly you go as long as you do not stop — confucius", "the future belongs to those who believe in the beauty of their dreams — eleanor roosevelt", "you miss 100% of the shots you don't take — wayne gretzky", "whether you think you can or you think you can't, you're right — henry ford", "be yourself, everyone else is already taken — oscar wilde", "two things are infinite: the universe and human stupidity — einstein", "the best revenge is massive success — frank sinatra", "success is not final, failure is not fatal — winston churchill", "do or do not, there is no try — yoda", "you only live once, but if you do it right, once is enough — mae west"];
const TRUTHS = ["what's the most embarrassing thing you've ever done?", "who was your first crush?", "what's the biggest lie you've ever told?", "what's something you've done that you'd never admit in person?", "what's your most irrational fear?", "have you ever cheated on a test?", "what's the worst thing you've said about someone behind their back?", "what's something you pretend to like but actually hate?", "have you ever ghosted someone?", "what's your biggest insecurity?", "what's a secret you've never told anyone?", "have you ever stolen anything?", "what's the most childish thing you still do?"];
const DARES = ["text your last contact 'i think about you more than you know'", "do 20 push-ups right now", "send a voice note saying 'i love you' to someone random", "change your profile photo to something embarrassing for 1 hour", "send a good morning message to 5 people", "post a cringe caption on your status", "call someone and sing happy birthday even if it's not their birthday", "text someone 'we need to talk' and wait 5 minutes before responding", "do your best impression of someone in this chat", "send your most embarrassing photo"];
const WYR_LIST = ["would you rather be always 10 minutes late or always 20 minutes early?", "would you rather have unlimited money but no friends or have great friends but always be broke?", "would you rather be able to fly or be invisible?", "would you rather lose all your memories or never make new ones?", "would you rather only be able to whisper or only be able to shout?", "would you rather fight 100 duck-sized horses or one horse-sized duck?", "would you rather have no phone for a month or no sleep for a week?", "would you rather be famous but hated or unknown but loved?", "would you rather speak every language or play every instrument?", "would you rather go back in time or see the future?"];
const PICKUPS = ["are you a magician? because whenever i look at you everyone else disappears", "do you have a map? i keep getting lost in your eyes", "if you were a vegetable you'd be a cute-cumber", "are you made of copper and tellurium? because you're CuTe", "i must be a snowflake because i've fallen for you", "do you have wifi? because i'm feeling a connection", "are you a camera? because every time i look at you i smile", "is your name google? because you have everything i've been searching for", "if beauty were time you'd be an eternity", "are you from tennessee? because you're the only ten i see"];
const ROASTS = ["i'd roast you but my mom told me not to burn trash", "you're the reason they put instructions on shampoo", "you're proof that evolution can go in reverse", "some people bring happiness wherever they go. you bring happiness whenever you go", "i'd agree with you but then we'd both be wrong", "you're not stupid, you just have bad luck thinking", "i could eat a bowl of alphabet soup and spit out a smarter statement than you", "you're like a cloud — when you disappear it's a beautiful day", "the village called, they want their idiot back", "if laughter is the best medicine your face must be curing diseases"];
const COMPLIMENTS = ["you're literally a walking vibe check ✅", "your energy hits different, fr", "whoever has you in their life is lucky for real", "you make everything look effortless", "you're built different and that's facts", "the way you move through life is inspiring ngl", "you got the rarest combo: smart AND real", "your presence adds something to any room", "you're low-key underrated and people don't realize it", "you've got main character energy and i'm not even capping"];
const EIGHTBALL = ["yes, definitely 🎱", "it is certain 🎱", "without a doubt 🎱", "yes, go for it 🎱", "signs point to yes 🎱", "ask again later 🎱", "cannot predict now 🎱", "concentrate and ask again 🎱", "don't count on it 🎱", "my reply is no 🎱", "my sources say no 🎱", "outlook not so good 🎱", "very doubtful 🎱", "absolutely not 🎱", "better not tell you now 🎱"];
const FORTUNES = ["something unexpected will bring you joy this week", "the answer you've been waiting for is closer than you think", "your efforts are about to pay off — keep going", "someone is thinking about you right now", "a small decision you make today will have a big impact", "success comes to those who don't stop when they're tired", "your next move will surprise even yourself", "what you're looking for is already within you", "expect a message from an old friend soon", "the next 48 hours will shift something for you"];

const DISPLAY_3D = [
  '```\n   ╔══════════╗\n  ╱┆          ╱║\n ╔════════════╗║\n ║ ╚══════════╬╝\n ║╱           ║╱\n ╚════════════╝\n     🎲 CUBE```',
  '```\n        ▲\n       ▲█▲\n      ▲███▲\n     ▲█████▲\n    ▲███████▲\n   ▲█████████▲\n  ▔▔▔▔▔▔▔▔▔▔▔▔▔\n    🏔 PYRAMID```',
  '```\n    ◇◆◇◆◇\n   ◆███████◆\n  ◆█████████◆\n ◆███████████◆\n  ◆█████████◆\n   ◆███████◆\n    ◇◆◇◆◇\n    💎 DIAMOND```',
  '```\n      ████\n    ████████\n   ██████████\n  ████████████\n  ████████████\n   ██████████\n    ████████\n      ████\n    🌍 SPHERE```',
  '```\n   ▲   ▲   ▲\n  ▲█▲ ▲█▲ ▲█▲\n ████████████\n ████████████\n ▀▀▀▀▀▀▀▀▀▀▀▀\n   👑 CROWN```',
  '```\n      ╱▲╲\n     ╱███╲\n    ╱█████╲\n   ╱███████╲\n   ║███████║\n   ║███████║\n   ╚═══════╝\n   🚀 ROCKET```',
  '```\n ██╗   ██╗███████╗\n ██║   ██║██╔════╝\n ██║   ██║█████╗\n ╚██╗ ██╔╝██╔══╝\n  ╚████╔╝ ███████╗\n   ╚═══╝  ╚══════╝\n   🤖 MFG BOT```',
];

// ─── Groq AI (explicit, user-invoked signature commands only) ────────────────
function aiConfigured(): boolean {
  return !!process.env.GROQ_API_KEY;
}

async function askGroq(prompt: string, persona?: string): Promise<string | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  try {
    const messages: any[] = [];
    if (persona) {
      messages.push({
        role: "system",
        content: `You are ${persona}. Respond entirely in their voice, slang, style and energy — the way they actually talk. Stay in character.`,
      });
    }
    messages.push({ role: "user", content: prompt });
    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages,
        temperature: 0.9,
        max_tokens: 1024,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!resp.ok) return null;
    const data: any = await resp.json();
    return data?.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

const rand = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// ─── Entry point: wire to sock.ev.on("messages.upsert", ...) ─────────────────
export async function handleWhatsAppUpsert(deps: WaCommandDeps): Promise<void> {
  const { sock, ev, settings, rememberMessage } = deps;
  if (ev.type !== "notify") return;
  for (const msg of ev.messages) {
    try {
      if (!msg?.message) continue;
      const from: string = msg.key?.remoteJid;
      if (!from || from === "status@broadcast") continue;

      // Remember every message so the engine's getMessage() can answer peer
      // retries (prevents the Bad-MAC cascade) — for incoming messages too.
      if (msg.key?.id) rememberMessage(from, msg.key.id, msg.message);

      messageCount++;
      chatSet.add(from);

      const text: string = (
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        msg.message.videoMessage?.caption ||
        ""
      ).trim();

      const pfx: string = settings.prefix || ".";
      if (!text.startsWith(pfx)) continue;

      // SELF-BOT: only the owner's own messages drive commands.
      if (!msg.key?.fromMe) continue;

      // Stale guard: never re-run a command from a re-delivered backlog after a
      // reconnect (the original's .online/.vv replay-storm fix).
      const ts = Number(msg.messageTimestamp) || 0;
      const ageMs = ts ? Date.now() - ts * 1000 : 0;
      if (ageMs > MAX_ACTIONABLE_MSG_AGE_MS) continue;

      const send = async (t: string) => {
        const m = await sock.sendMessage(from, { text: t });
        if (m?.key?.id) rememberMessage(from, m.key.id, m.message || { conversation: t });
        return m;
      };

      const parts = text.slice(pfx.length).trim().split(/\s+/);
      const cmd = (parts.shift() || "").toLowerCase();
      const args = parts;
      if (!cmd) continue;
      commandStats[cmd] = (commandStats[cmd] || 0) + 1;

      await dispatch({ cmd, args, from, msg, send, deps });
    } catch (e: any) {
      console.log("[WhatsApp] command error:", e?.message || e);
      try {
        await sock.sendMessage(msg.key?.remoteJid, { text: "⚠️ command error: " + (e?.message || "unknown") });
      } catch {}
    }
  }
}

interface DispatchCtx {
  cmd: string;
  args: string[];
  from: string;
  msg: any;
  send: (t: string) => Promise<any>;
  deps: WaCommandDeps;
}

async function dispatch(ctx: DispatchCtx): Promise<void> {
  const { cmd, args, from, msg, send, deps } = ctx;
  const { sock, settings, writeJSON, readJSON, downloadMediaMessage, startTime, rememberMessage } = deps;
  const arg = args.join(" ").trim();

  // Send to an arbitrary jid AND remember it. emitOwnEvents:false means our own
  // sends never re-enter messages.upsert, so getMessage() must have them stored
  // to answer a peer's retry — otherwise the Bad-MAC/session-corruption cascade
  // returns. (The text-only `send` helper above already remembers.)
  const sendTo = async (jid: string, content: any) => {
    const m = await sock.sendMessage(jid, content);
    if (m?.key?.id) rememberMessage(m.key.remoteJid || jid, m.key.id, m.message || content);
    return m;
  };

  // ── CORE ───────────────────────────────────────────────────────────────────
  if (cmd === "ping") { await send("pong 🏓"); return; }

  if (cmd === "bot") {
    const sub = args[0]?.toLowerCase();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    if (sub === "status") await send(`mfg_bot online ✅\nuptime: ${uptime}s\nmessages seen: ${messageCount}`);
    else if (sub === "ping") await send(`pong 🏓 ${Date.now() - Number(msg.messageTimestamp) * 1000}ms`);
    else if (sub === "uptime") await send(`uptime: ${uptime}s`);
    else if (sub === "version") await send("mfg_bot | baileys + groq");
    else if (sub === "prefix") { settings.prefix = args[1] || "."; writeJSON("wa_settings.json", settings); await send(`prefix set: ${settings.prefix}`); }
    else await send(".bot status | .bot ping | .bot uptime | .bot version | .bot prefix <symbol>");
    return;
  }

  if (cmd === "stats") {
    const sub = args[0]?.toLowerCase();
    if (sub === "commands") {
      const top = Object.entries(commandStats).sort((a, b) => b[1] - a[1]).slice(0, 5);
      await send(top.length ? "top commands:\n" + top.map(([k, v]) => `${k}: ${v}`).join("\n") : "no commands used yet.");
    } else if (sub === "memory") {
      const mem = process.memoryUsage();
      await send(`rss: ${Math.round(mem.rss / 1024 / 1024)}mb\nheap: ${Math.round(mem.heapUsed / 1024 / 1024)}mb`);
    } else {
      await send(`messages seen: ${messageCount}\nchats: ${chatSet.size}\nunique commands: ${Object.keys(commandStats).length}`);
    }
    return;
  }

  if (cmd === "site") { await send("check the portfolio: https://ash-cloth.ink"); return; }

  if (cmd === "call") {
    const sub = args[0]?.toLowerCase();
    if (sub === "on") { settings.callBlock = true; writeJSON("wa_settings.json", settings); await send("call block on 🔴📵 — incoming calls will be rejected"); }
    else if (sub === "off") { settings.callBlock = false; writeJSON("wa_settings.json", settings); await send("call block off 🟢📞 — calls go through normally"); }
    else await send(`call block: ${settings.callBlock ? "on 🔴" : "off 🟢"}\n.call on — reject incoming calls\n.call off — allow calls`);
    return;
  }

  // .vv — reveal a view-once photo/video (reply to it)
  if (cmd === "vv") {
    const ci = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ci?.quotedMessage;
    if (!quoted) { await send("reply to a view-once photo or video with .vv to reveal it."); return; }
    const vo =
      quoted.viewOnceMessage?.message ||
      quoted.viewOnceMessageV2?.message ||
      quoted.viewOnceMessageV2Extension?.message ||
      quoted;
    const imgMsg = vo.imageMessage;
    const vidMsg = vo.videoMessage;
    if (!imgMsg && !vidMsg) { await send("no view-once media found in that reply."); return; }
    try {
      const fakeMsg = { key: { remoteJid: from, id: ci.stanzaId, fromMe: false, participant: ci.participant }, message: vo };
      const buffer = await downloadMediaMessage(fakeMsg, "buffer", {});
      if (!buffer || buffer.length < 100) { await send("media buffer empty — view-once may have already been opened."); return; }
      if (imgMsg) {
        await sendTo(from, { image: buffer, caption: "👁 view-once revealed", mimetype: imgMsg.mimetype || "image/jpeg" });
      } else if (vidMsg) {
        const mt = vidMsg.mimetype || "video/mp4";
        try {
          await sendTo(from, { video: buffer, caption: "👁 view-once video revealed", mimetype: mt, gifPlayback: false });
        } catch {
          await sendTo(from, { document: buffer, mimetype: mt, fileName: "view-once-video.mp4", caption: "👁 view-once video (sent as file)" });
        }
      }
    } catch (e: any) {
      await send("couldn't restore that media: " + (e?.message || "error"));
    }
    return;
  }

  // .send <number> <message> — owner sends a DM to another number (always owner here)
  if (cmd === "send") {
    const number = args[0]?.replace(/[^0-9]/g, "");
    const body = args.slice(1).join(" ");
    if (number && body) {
      await sendTo(`${number}@s.whatsapp.net`, { text: body });
      await send(`sent to ${number} ✅`);
    } else await send(".send <number> <message>");
    return;
  }

  // ── TEXT TOOLS ──────────────────────────────────────────────────────────────
  if (cmd === "upper") { await send(arg.toUpperCase() || "give me text: .upper <text>"); return; }
  if (cmd === "lower") { await send(arg.toLowerCase() || "give me text: .lower <text>"); return; }
  if (cmd === "reverse") { await send(arg.split("").reverse().join("") || ".reverse <text>"); return; }
  if (cmd === "mock") { await send(arg ? arg.split("").map((c, i) => (i % 2 === 0 ? c.toLowerCase() : c.toUpperCase())).join("") : ".mock <text>"); return; }
  if (cmd === "clap") { await send(arg ? arg.split(/\s+/).join(" 👏 ") + " 👏" : ".clap <text>"); return; }
  if (cmd === "aesthetic") {
    const fc = "ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ";
    await send(arg ? arg.split("").map(c => { const i = "abcdefghijklmnopqrstuvwxyz".indexOf(c.toLowerCase()); return i >= 0 ? fc[i] : c; }).join("") : ".aesthetic <text>");
    return;
  }
  if (cmd === "count") { await send(arg ? `chars: ${arg.length}\nwords: ${arg.split(/\s+/).filter(Boolean).length}\nlines: ${arg.split("\n").length}` : ".count <text>"); return; }
  if (cmd === "repeat") {
    const n = Math.min(parseInt(args[0]) || 2, 10);
    const t = args.slice(1).join(" ");
    await send(t ? Array(n).fill(t).join("\n") : ".repeat <times> <text>");
    return;
  }
  if (cmd === "wordcount") { await send(`${arg.split(/\s+/).filter(Boolean).length} words`); return; }
  if (cmd === "charcount") { await send(`${arg.length} characters`); return; }
  if (cmd === "emojify") {
    const emojis = ["😂", "🔥", "💯", "👀", "😭", "✨", "💀", "🙏", "😤", "🫶"];
    await send(arg ? arg.split(/\s+/).map(w => w + " " + rand(emojis)).join(" ") : ".emojify <text>");
    return;
  }

  // ── MATH / CALC ───────────────────────────────────────────────────────────
  if (cmd === "calc") {
    try {
      const expr = args.join("").replace(/[^0-9+\-*/.()%\s]/g, "");
      const result = Function('"use strict";return (' + expr + ")")();
      await send(`${expr} = ${result}`);
    } catch { await send("invalid expression — try: .calc 5 * (3 + 2)"); }
    return;
  }
  if (cmd === "percent") {
    const [val, total] = args.map(Number);
    await send(!isNaN(val) && !isNaN(total) ? `${val} is ${((val / total) * 100).toFixed(2)}% of ${total}` : ".percent <value> <total>");
    return;
  }
  if (cmd === "tax") {
    const [amount, rate] = args.map(Number);
    if (!isNaN(amount) && !isNaN(rate)) { const tax = (amount * rate / 100); await send(`amount: ${amount}\ntax (${rate}%): ${tax.toFixed(2)}\ntotal: ${(amount + tax).toFixed(2)}`); }
    else await send(".tax <amount> <rate%>");
    return;
  }
  if (cmd === "tip") {
    const [amount, pct] = args.map(Number);
    if (!isNaN(amount) && !isNaN(pct)) { const tip = (amount * pct / 100); await send(`bill: ${amount}\ntip (${pct}%): ${tip.toFixed(2)}\ntotal: ${(amount + tip).toFixed(2)}`); }
    else await send(".tip <amount> <percent%>");
    return;
  }
  if (cmd === "split") {
    const [amount, people] = args.map(Number);
    await send(!isNaN(amount) && !isNaN(people) && people > 0 ? `each person pays: ${(amount / people).toFixed(2)}` : ".split <total> <people>");
    return;
  }
  if (cmd === "bmi") {
    const [w, h] = args.map(Number);
    if (!isNaN(w) && !isNaN(h) && h > 0) { const bmi = w / (h * h); const cat = bmi < 18.5 ? "underweight" : bmi < 25 ? "normal" : bmi < 30 ? "overweight" : "obese"; await send(`bmi: ${bmi.toFixed(1)} — ${cat}`); }
    else await send(".bmi <weight kg> <height m>");
    return;
  }
  if (cmd === "random") {
    const [mn, mx] = args.map(Number);
    await send(!isNaN(mn) && !isNaN(mx) ? `🎲 ${Math.floor(Math.random() * (mx - mn + 1)) + mn}` : ".random <min> <max>");
    return;
  }
  if (cmd === "temp") {
    const sub = args[0]?.toLowerCase(); const val = parseFloat(args[1]);
    if (sub === "c" && !isNaN(val)) await send(`${val}°C = ${(val * 9 / 5 + 32).toFixed(1)}°F`);
    else if (sub === "f" && !isNaN(val)) await send(`${val}°F = ${((val - 32) * 5 / 9).toFixed(1)}°C`);
    else await send(".temp c <celsius> | .temp f <fahrenheit>");
    return;
  }
  if (cmd === "sqrt") { const n = parseFloat(args[0]); await send(!isNaN(n) ? `√${n} = ${Math.sqrt(n).toFixed(6)}` : ".sqrt <number>"); return; }
  if (cmd === "pow") { const [b, e] = args.map(Number); await send(!isNaN(b) && !isNaN(e) ? `${b}^${e} = ${Math.pow(b, e)}` : ".pow <base> <exponent>"); return; }
  if (cmd === "round") { const n = parseFloat(args[0]); await send(!isNaN(n) ? `${n} rounded = ${Math.round(n)}` : ".round <number>"); return; }
  if (cmd === "password") {
    const len = Math.min(parseInt(args[0]) || 12, 32);
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
    let pwd = "";
    for (let i = 0; i < len; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
    await send(`🔑 ${pwd}`);
    return;
  }

  // ── FUN / GAMES ─────────────────────────────────────────────────────────────
  if (cmd === "flip" || cmd === "coin") { await send(Math.random() > 0.5 ? "heads 🪙" : "tails 🪙"); return; }
  if (cmd === "roll" || cmd === "dice") { const n = parseInt(args[0]) || 6; await send(`🎲 rolled: ${Math.floor(Math.random() * n) + 1} (d${n})`); return; }
  if (cmd === "joke") { await send(rand(JOKES)); return; }
  if (cmd === "fact") { await send("📚 " + rand(FACTS)); return; }
  if (cmd === "quote") { await send("💬 " + rand(QUOTES)); return; }
  if (cmd === "truth") { await send("🫦 truth: " + rand(TRUTHS)); return; }
  if (cmd === "dare") { await send("😈 dare: " + rand(DARES)); return; }
  if (cmd === "wyr") { await send("🤔 " + rand(WYR_LIST)); return; }
  if (cmd === "pickup") { await send(rand(PICKUPS)); return; }
  if (cmd === "roast") { await send(`🔥 ${arg || "you"}: ${rand(ROASTS)}`); return; }
  if (cmd === "compliment") { await send(`✨ ${arg || "you"}: ${rand(COMPLIMENTS)}`); return; }
  if (cmd === "fortune") { await send("🔮 " + rand(FORTUNES)); return; }
  if (cmd === "8ball") { await send(arg ? `❓ ${arg}\n\n${rand(EIGHTBALL)}` : ".8ball <question>"); return; }
  if (cmd === "rps") {
    const choices = ["rock", "paper", "scissors"]; const bot = rand(choices); const u = args[0]?.toLowerCase();
    if (!choices.includes(u)) { await send("pick: rock, paper, or scissors"); return; }
    const win = (u === "rock" && bot === "scissors") || (u === "paper" && bot === "rock") || (u === "scissors" && bot === "paper");
    await send(`you: ${u}\nme: ${bot}\n${u === bot ? "tie 🤝" : win ? "you win 🏆" : "i win 😤"}`);
    return;
  }
  if (cmd === "ship") {
    const names = arg.split(/\s+and\s+|\s*\+\s*|\s*&\s*/i);
    const n1 = names[0]?.trim() || "you"; const n2 = names[1]?.trim() || "them";
    const pct = Math.floor(Math.random() * 101); const hearts = Math.round(pct / 10);
    const bar = "❤️".repeat(hearts) + "🖤".repeat(10 - hearts);
    await send(`💘 ${n1} + ${n2}\n${bar}\n${pct}% compatible\n${pct > 80 ? "soulmates fr 🔥" : pct > 60 ? "solid connection 💯" : pct > 40 ? "could work 🤔" : pct > 20 ? "it's complicated 😬" : "yikes 💀"}`);
    return;
  }
  if (cmd === "rate") { await send(`${arg || "that"}: ${Math.floor(Math.random() * 101)}/100`); return; }
  if (cmd === "rank") { const ranks = ["S tier 🏆", "A tier ⭐", "B tier 👍", "C tier 😐", "D tier 😬", "F tier 💀"]; await send(`${arg || "it"} → ${rand(ranks)}`); return; }
  if (cmd === "choose") {
    const opts = arg.split(/\s*[\|\/,]\s*/).map(s => s.trim()).filter(Boolean);
    await send(opts.length >= 2 ? `i pick: ${rand(opts)} 🎯` : "give options: .choose a | b | c");
    return;
  }
  if (cmd === "spin") { const wheel = ["🍕pizza", "🎮games", "📚study", "😴sleep", "💪workout", "🎵music", "🎨art", "🏃run", "🧠think", "🎬movie"]; await send(`🎡 spun: ${rand(wheel)}`); return; }
  if (cmd === "slot") {
    const s = ["🍒", "🍋", "🍊", "💎", "7️⃣", "🔔"]; const r = [rand(s), rand(s), rand(s)];
    await send(`🎰 ${r.join(" | ")}\n${r[0] === r[1] && r[1] === r[2] ? "JACKPOT 🎉" : r[0] === r[1] || r[1] === r[2] || r[0] === r[2] ? "match! you win 🏆" : "no match, try again 💀"}`);
    return;
  }
  if (cmd === "display" && args[0] === "3d") { await send(rand(DISPLAY_3D)); return; }

  // ── VIBE CHECKS ─────────────────────────────────────────────────────────────
  if (cmd === "rizz") { const p = Math.floor(Math.random() * 101); await send(`rizz level: ${p}/100\n${p > 80 ? "🔥 god-tier rizz" : p > 60 ? "💪 decent rizz" : p > 40 ? "😐 mid rizz" : p > 20 ? "😬 low rizz" : "💀 no rizz bro"}`); return; }
  if (cmd === "sus") { await send(`${arg || "you"} is ${Math.floor(Math.random() * 101)}% sus 🔴`); return; }
  if (cmd === "vibe") { const vibes = ["immaculate vibes ✨", "good vibes 🔥", "neutral vibes 😐", "off vibes today 😬", "no vibes detected 💀"]; await send(`vibe check: ${rand(vibes)}`); return; }
  if (cmd === "chad") { const p = Math.floor(Math.random() * 101); await send(`chad level: ${p}/100 ${p > 80 ? "👑 absolute chad" : p > 50 ? "💪 chad" : "😐 normie"}`); return; }
  if (cmd === "simp") { await send(`${arg || "you"} is ${Math.floor(Math.random() * 101)}% simp 💔`); return; }
  if (cmd === "npc") { const p = Math.floor(Math.random() * 101); await send(`npc rating: ${p}% ${p > 70 ? "🤖 pure npc" : p > 40 ? "😐 kinda npc" : "🧠 main character"}`); return; }
  if (cmd === "based") { const p = Math.floor(Math.random() * 101); await send(`based meter: ${p}/100 ${p > 80 ? "🔥 extremely based" : p > 50 ? "👍 based" : "😐 cringe"}`); return; }
  if (cmd === "ratio") { await send("ratio + L + no rizz + fell off + who asked 💀"); return; }
  if (cmd === "bruh") { await send("bruh 💀"); return; }
  if (cmd === "oof") { await send("oof 😬"); return; }
  if (cmd === "hype") { const hyp = ["LET'S GOOOOO 🔥🔥🔥", "W BEHAVIOR FR 💯", "NO CAP THAT'S DIFFERENT 🏆", "GOATED WITH THE SAUCE 🐐", "DIFFERENT BREED REAL ONE ⭐"]; await send(rand(hyp)); return; }
  if (cmd === "cringe") { const p = Math.floor(Math.random() * 101); await send(`cringe level: ${p}/100 ${p > 70 ? "💀 unforgivable" : p > 40 ? "😬 kinda cringe" : "👍 not cringe"}`); return; }
  if (cmd === "salty") { const p = Math.floor(Math.random() * 101); await send(`salty meter: ${p}% 🧂 ${p > 70 ? "very salty bro" : p > 40 ? "a little salty" : "not salty"}`); return; }
  if (cmd === "goat") { await send(`${arg || "you"} is the GOAT 🐐 no debate`); return; }
  if (cmd === "lucky") { await send(`🍀 your lucky number today: ${Math.floor(Math.random() * 100) + 1}`); return; }

  // ── SOCIAL ──────────────────────────────────────────────────────────────────
  if (cmd === "gm") { await send("good morning ☀️ hope today hits different"); return; }
  if (cmd === "gn") { await send("good night 🌙 rest up"); return; }
  if (cmd === "hbd") { await send(`happy birthday ${arg || "you"} 🎂🎉 wishing you everything this year`); return; }
  if (cmd === "gl") { await send("good luck 🍀 you got this"); return; }
  if (cmd === "gg") { await send("GG 🏆 well played"); return; }
  if (cmd === "greet") { await send("hey 👋 what's good?"); return; }
  if (cmd === "hug") { await send(`sending ${arg || "you"} a hug 🤗`); return; }
  if (cmd === "slap") { await send(`slapping ${arg || "whoever"} 👋💥 they deserved it`); return; }
  if (cmd === "poke") { await send(`poking ${arg || "you"} 👉`); return; }
  if (cmd === "kiss") { await send(`kissing ${arg || "you"} 😘`); return; }
  if (cmd === "punch") { await send(`punching ${arg || "you"} 👊💥`); return; }
  if (cmd === "highfive") { await send("✋ high five!"); return; }
  if (cmd === "love") { await send(`❤️ sending love to ${arg || "you"}`); return; }
  if (cmd === "wave") { await send("👋 hey!"); return; }
  if (cmd === "salute") { await send("🫡 sir"); return; }
  if (cmd === "bow") { await send("🙇 bowing down"); return; }
  if (cmd === "cheer") { await send("🎉 cheers! 🥂"); return; }
  if (cmd === "congrats") { await send(`🏆 congrats ${arg || "you"}! that's W behavior`); return; }
  if (cmd === "rip") { await send(`rip ${arg || "it"} 😔🪦 gone but not forgotten`); return; }
  if (cmd === "ily") { await send("ily too ❤️"); return; }

  // ── UTILITY / INFO ──────────────────────────────────────────────────────────
  if (cmd === "time") { await send(`🕐 ${new Date().toLocaleTimeString("en-US", { hour12: true, timeZone: "Africa/Lagos" })} (WAT)`); return; }
  if (cmd === "date") { await send(`📅 ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Africa/Lagos" })}`); return; }
  if (cmd === "uptime") { const u = Math.floor((Date.now() - startTime) / 1000); await send(`⏱ uptime: ${Math.floor(u / 3600)}h ${Math.floor((u % 3600) / 60)}m ${u % 60}s`); return; }
  if (cmd === "age") {
    const d = new Date(arg); if (isNaN(d.getTime())) { await send(".age <date> e.g. .age 2000-01-15"); return; }
    const years = Math.floor((Date.now() - d.getTime()) / (365.25 * 86400000));
    await send(`age: ${years} years old`);
    return;
  }
  if (cmd === "countdown") { const n = parseInt(args[0]) || 5; await send(`⏳ ${Array.from({ length: n }, (_, i) => n - i).join("... ")}... 🚀`); return; }

  // ── NOTES / TODOS / KV (per-chat, persisted) ─────────────────────────────────
  if (cmd === "note") {
    if (!arg) { await send(".note <text> to save | .notes to view | .delnote <id> to delete"); return; }
    const notes = readJSON<Record<string, any[]>>("wa_notes.json", {});
    if (!notes[from]) notes[from] = [];
    notes[from].push({ id: Date.now(), text: arg, time: new Date().toLocaleString() });
    writeJSON("wa_notes.json", notes);
    await send(`📝 note saved (#${notes[from].length})`);
    return;
  }
  if (cmd === "notes") {
    const notes = readJSON<Record<string, any[]>>("wa_notes.json", {});
    const ns = notes[from] || [];
    await send(ns.length ? `📝 your notes (${ns.length}):\n\n` + ns.map((n, i) => `${i + 1}. ${n.text}`).join("\n") : "no notes saved. use .note <text>");
    return;
  }
  if (cmd === "delnote") {
    const notes = readJSON<Record<string, any[]>>("wa_notes.json", {});
    const idx = (parseInt(args[0]) || 1) - 1;
    const ns = notes[from] || [];
    if (ns[idx]) { ns.splice(idx, 1); notes[from] = ns; writeJSON("wa_notes.json", notes); await send("note deleted."); }
    else await send("note not found.");
    return;
  }
  if (cmd === "todo") {
    if (!arg) { await send(".todo <task> to add | .todos to view | .done <id> to complete"); return; }
    const todos = readJSON<Record<string, any[]>>("wa_todos.json", {});
    if (!todos[from]) todos[from] = [];
    todos[from].push({ text: arg, done: false });
    writeJSON("wa_todos.json", todos);
    await send(`✅ todo added (#${todos[from].length})`);
    return;
  }
  if (cmd === "todos") {
    const todos = readJSON<Record<string, any[]>>("wa_todos.json", {});
    const ts = todos[from] || [];
    await send(ts.length ? "📋 todos:\n\n" + ts.map((t, i) => `${t.done ? "✅" : "⬜"} ${i + 1}. ${t.text}`).join("\n") : "no todos. use .todo <task>");
    return;
  }
  if (cmd === "done") {
    const todos = readJSON<Record<string, any[]>>("wa_todos.json", {});
    const idx = (parseInt(args[0]) || 1) - 1;
    const ts = todos[from] || [];
    if (ts[idx]) { ts[idx].done = true; writeJSON("wa_todos.json", todos); await send(`✅ marked done: ${ts[idx].text}`); }
    else await send("todo not found.");
    return;
  }
  if (cmd === "save") {
    const key = args[0]; const val = args.slice(1).join(" ");
    if (!key || !val) { await send(".save <key> <value> | .get <key> | .keys"); return; }
    const kv = readJSON<Record<string, Record<string, string>>>("wa_kv.json", {});
    if (!kv[from]) kv[from] = {};
    kv[from][key] = val; writeJSON("wa_kv.json", kv);
    await send(`saved: ${key} → ${val}`);
    return;
  }
  if (cmd === "get") {
    const key = args[0];
    const kv = readJSON<Record<string, Record<string, string>>>("wa_kv.json", {});
    await send(key && kv[from]?.[key] ? `${key}: ${kv[from][key]}` : key ? "not found." : ".get <key>");
    return;
  }
  if (cmd === "keys") {
    const kv = readJSON<Record<string, Record<string, string>>>("wa_kv.json", {});
    const ks = kv[from] ? Object.keys(kv[from]) : [];
    await send(ks.length ? `saved keys:\n${ks.join(", ")}` : "nothing saved. use .save <key> <value>");
    return;
  }

  // ── AI SIGNATURE COMMANDS (Groq — explicit, user-invoked) ────────────────────
  if (cmd === "persona") {
    if (!arg) { await send("🎭 *PERSONA MODE*\n\n.persona <name> — every AI command (.lyrics, .shade, etc.) will respond in that voice\n.persona off — back to normal\n\ne.g. .persona Burna Boy"); return; }
    if (arg.toLowerCase() === "off") { activePersona.delete(from); await send("🎭 persona off — back to myself."); return; }
    activePersona.set(from, arg);
    await send(`🎭 *Persona set: ${arg}*\nAI commands in this chat now respond as ${arg}. Type .persona off to reset.`);
    return;
  }

  const persona = activePersona.get(from);
  const ai = async (intro: string, prompt: string, fail: string) => {
    if (!aiConfigured()) { await send("🤖 AI commands need GROQ_API_KEY configured. Ask the owner to add it in Settings."); return; }
    await send(intro);
    const reply = await askGroq(prompt, persona);
    await send(reply || fail);
  };

  if (cmd === "lyrics") {
    if (!arg) { await send("🎵 *.lyrics <vibe or title>*\ne.g. .lyrics heartbreak Afrobeats"); return; }
    await ai("🎵 writing lyrics...", `Write an original, fire Afrobeats/Nigerian pop song based on this vibe or title: "${arg}". Include: Song Title, Verse 1, Chorus, Verse 2, Bridge. Use Nigerian slang, pidgin naturally. Make it sound like a real hit.`, "❌ couldn't write that one. try again.");
    return;
  }
  if (cmd === "freestyle" || cmd === "bars") {
    await ai("🎤 cooking bars...", `Spit a fire freestyle rap/bars about: "${arg || "life and hustle"}". Nigerian/Afrobeats style — mix English and pidgin naturally. 8-16 bars, rhythmic, wordplay, punches. No intro text, just the bars.`, "❌ bars came out wrong. try again.");
    return;
  }
  if (cmd === "shade") {
    if (!arg) { await send("😏 *.shade <person or situation>*\ne.g. .shade fake friends"); return; }
    await ai("😏 crafting shade...", `Write the most perfectly crafted, subtle shade about: "${arg}". Nigerian style — indirect, smart, could be a WhatsApp status. Cut deep but sound innocent. Short, punchy.`, "❌ couldn't craft that shade.");
    return;
  }
  if (cmd === "capcheck" || cmd === "cap" || cmd === "facts") {
    if (!arg) { await send("🧢 *.capcheck <claim>*\ne.g. .capcheck money can't buy happiness"); return; }
    await ai("🔍 analyzing...", `Analyze this claim and give a Cap or Facts verdict: "${arg}". Be opinionated, funny, decisive. State clearly if it's CAP 🧢 or FACTS ✅, then explain why in Nigerian English/pidgin. Short.`, "❌ couldn't check that.");
    return;
  }
  if (cmd === "naija" || cmd === "pidgin" || cmd === "explain") {
    if (!arg) { await send("🇳🇬 *.naija <topic>* — explain anything in pure Nigerian pidgin\ne.g. .naija quantum physics"); return; }
    await ai("🇳🇬 lemme break am down...", `Explain this topic in pure Nigerian pidgin/slang: "${arg}". Funny, relatable, real pidgin expressions, naija humor, local analogies.`, "❌ couldn't break that down.");
    return;
  }
  if (cmd === "testimony") {
    await ai("🙌 *receiving testimony...*", `Write a hilarious Nigerian Pentecostal church testimony about: "${arg || "random miracle"}". Include dramatic background, the problem, the prayer, the miracle, the praise. Nigerian church language, pidgin, dramatic flair.`, "❌ testimony no come. try again.");
    return;
  }
  if (cmd === "settle") {
    if (!arg) { await send("⚖️ *.settle <debate>*\ne.g. .settle Wizkid vs Davido"); return; }
    await ai("⚖️ *settling this once and for all...*", `Settle this debate ONCE AND FOR ALL: "${arg}". Give a FINAL, definitive ruling. Bold, entertaining, Nigerian references. Pick a side and defend it. End with "CASE CLOSED. 🔨".`, "❌ couldn't settle that one.");
    return;
  }
  if (cmd === "manifest" || cmd === "manifestation") {
    if (!arg) { await send("✨ *.manifest <your dream>*\ne.g. .manifest becoming a billionaire"); return; }
    await ai("✨ *manifesting...*", `Write a powerful, deeply personal manifestation/affirmation for this dream: "${arg}". Nigerian context — reference God, hustle, faith. Mix English and pidgin. Spiritual, motivating. 5-8 lines.`, "❌ manifestation failed. try again.");
    return;
  }
  if (cmd === "expose") {
    if (!arg) { await send("🕵️ *.expose <person or claim>*\ne.g. .expose why people ghost"); return; }
    await ai("🕵️ *pulling receipts...*", `EXPOSE the truth about: "${arg}". Write it like a viral thread — dramatic, revealing. Nigerian style, mix of English and pidgin. Make points 1 by 1. End with a hard-hitting conclusion.`, "❌ couldn't pull those receipts.");
    return;
  }
  if (cmd === "punchline" || cmd === "oneliner") {
    await ai("💥 cooking...", `Write ONE savage, perfectly crafted punchline/one-liner about: "${arg || "life"}". Nigerian humor preferred. Short, sharp, devastating. No intro, just the line.`, "❌ punchline flopped. try again.");
    return;
  }
  if (cmd === "caption" || cmd === "captions") {
    if (!arg) { await send("📸 *.caption <context>*\ne.g. .caption beach photo with friends"); return; }
    await ai("📸 *crafting fire captions...*", `Generate 3 fire, ready-to-post captions for: "${arg}". Mix styles: 1 savage/witty, 1 deep/inspirational, 1 funny/Nigerian. Include relevant emojis.`, "❌ captions flopped. try again.");
    return;
  }
  if (cmd === "prayer" || cmd === "pray") {
    await ai("🙏 *interceding...*", `Write a Nigerian Pentecostal-style prayer for: "${arg || "general blessing"}". Powerful prayer language, mix English and pidgin, call on the Holy Ghost, declare and decree. Dramatic, full of Nigerian church energy. End with a strong AMEN.`, "❌ prayer not through. try again.");
    return;
  }
  if (cmd === "argue") {
    if (!arg) { await send("🗣 *.argue <position>*\ne.g. .argue that Afrobeats is the best genre"); return; }
    await ai("🗣 *building the case...*", `Argue this position PASSIONATELY and convincingly: "${arg}". Be a lawyer, a preacher, and a Nigerian uncle all in one. Use facts, emotion, Nigerian proverbs, analogies. Win the argument.`, "❌ argument collapsed. try again.");
    return;
  }

  // ── MENU / HELP ──────────────────────────────────────────────────────────────
  if (cmd === "menu" || cmd === "help" || cmd === "commands" || cmd === "command" || cmd === "list") {
    await send(MENU_TEXT);
    return;
  }

  // Unknown command — stay silent to avoid noise (matches self-bot behaviour).
}

const MENU_TEXT = `╔══════════════════════╗
║   🤖 *MFG BOT COMMANDS* 🤖
╚══════════════════════╝
_self-bot • commands work from your own chats_

━━━━ 🔧 *CORE* ━━━━
.ping  .bot <status|ping|uptime|version|prefix>
.stats  .site  .call <on|off>  .send <number> <msg>
.vv — reveal a view-once (reply to it)

━━━━ 📝 *TEXT* ━━━━
.upper .lower .reverse .mock .clap
.aesthetic .count .repeat .wordcount .charcount .emojify

━━━━ 🔢 *MATH* ━━━━
.calc .percent .tax .tip .split .bmi
.random .temp .sqrt .pow .round .password

━━━━ 🎮 *FUN & GAMES* ━━━━
.joke .fact .quote .truth .dare .wyr .pickup
.roast .compliment .fortune .8ball .rps .ship
.rate .rank .choose .spin .slot .flip .roll .dice .display 3d

━━━━ 😤 *VIBE CHECKS* ━━━━
.rizz .sus .vibe .chad .simp .npc .based
.ratio .bruh .oof .hype .cringe .salty .goat .lucky

━━━━ 🤝 *SOCIAL* ━━━━
.gm .gn .hbd .gl .gg .greet .hug .slap .poke
.kiss .punch .highfive .love .wave .salute .bow .cheer .congrats .rip .ily

━━━━ 🛠 *UTILITY* ━━━━
.time .date .uptime .age .countdown
.note .notes .delnote .todo .todos .done .save .get .keys

━━━━ 🔥 *AI (Groq)* ━━━━
.persona <name|off> .lyrics .freestyle .shade .capcheck
.naija .testimony .settle .manifest .expose
.punchline .caption .prayer .argue

_type .help to see this again_`;
