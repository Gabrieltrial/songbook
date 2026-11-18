#!/usr/bin/env node
/*
 * Songbook server: serves the web page, keeps the shared lists and songs in
 * data/songbook.json, and searches/reads chord pages so the browser doesn't
 * run into cross-site restrictions. No dependencies; needs Node 18 or newer.
 */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const net = require("net");
const Chords = require("./public/chords.js");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "songbook.json");
const EDIT_KEY = process.env.EDIT_KEY || "";
const USER_AGENT = process.env.USER_AGENT || "Mozilla/5.0 (compatible; Songbook/1.0; personal use)";
const PUBLIC_DIR = path.join(__dirname, "public");

/* ---------------- data ---------------- */
const EXAMPLE = {
  songs: {
    examplegrace: {
      title: "Amazing Grace (example)", artist: "Traditional · John Newton", key: "G", source: "Public domain",
      createdAt: Date.now(), updatedAt: Date.now(),
      body: "[Verse 1]\nG              G7        C        G\nAmazing grace, how sweet the sound\n                         D\nThat saved a wretch like me\nG              G7       C       G\nI once was lost, but now am found\n    Em       D         G\nWas blind, but now I see",
    },
  },
  lists: { examplelist: { name: "Example set", items: ["examplegrace"], createdAt: Date.now(), updatedAt: Date.now() } },
};
let db;
try { db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); }
catch (e) { db = EXAMPLE; }
db.songs = db.songs || {}; db.lists = db.lists || {};

let saving = Promise.resolve();
function persist() {
  saving = saving.then(async () => {
    await fs.promises.mkdir(DATA_DIR, { recursive: true });
    const tmp = DATA_FILE + ".tmp";
    await fs.promises.writeFile(tmp, JSON.stringify(db, null, 1));
    await fs.promises.rename(tmp, DATA_FILE);
  }).catch(e => console.error("Could not save data:", e.message));
  return saving;
}

const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
const num = v => (Number.isFinite(v) ? v : Date.now());
function cleanSong(d) {
  return { title: str(d.title, 200) || "Untitled", artist: str(d.artist, 200), key: str(d.key, 20), body: str(d.body, 100000),
    source: str(d.source, 1000), createdAt: num(d.createdAt), updatedAt: Date.now() };
}
function cleanList(d) {
  const items = Array.isArray(d.items) ? d.items.filter(x => typeof x === "string" && /^[a-z0-9]{1,40}$/.test(x)).slice(0, 500) : [];
  return { name: str(d.name, 120) || "Untitled list", items, createdAt: num(d.createdAt), updatedAt: Date.now() };
}

/* ---------------- live updates (server-sent events) ---------------- */
const clients = new Set();
function broadcast(msg) {
  const line = "data: " + JSON.stringify(msg) + "\n\n";
  for (const res of clients) res.write(line);
}
setInterval(() => { for (const res of clients) res.write(": ping\n\n"); }, 25000).unref();

/* ---------------- fetching chord pages ---------------- */
function isPrivateHost(host) {
  host = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (net.isIP(host) === 4) return /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
  if (net.isIP(host) === 6) return host === "::1" || /^(fc|fd|fe80)/.test(host);
  return false;
}
async function getPage(url) {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol) || isPrivateHost(u.hostname)) throw new Error("That address is not allowed");
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(u, { signal: ctl.signal, redirect: "follow",
      headers: { "User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml", "Accept-Language": "ca,es;q=0.9,en;q=0.8,pt;q=0.6" } });
    if (!r.ok) throw new Error("the site answered " + r.status);
    const text = await r.text();
    return text.slice(0, 4_000_000);
  } finally { clearTimeout(t); }
}
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ntilde: "ñ", Ntilde: "Ñ", ccedil: "ç", Ccedil: "Ç",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", agrave: "à", egrave: "è", ograve: "ò", uuml: "ü", iuml: "ï", middot: "·",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Agrave: "À", Egrave: "È", Ograve: "Ò", atilde: "ã", otilde: "õ", acirc: "â", ecirc: "ê", ocirc: "ô", hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", ndash: "–", mdash: "—" };
function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") { const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(n); } catch (_) { return m; } }
    return ENT[e] !== undefined ? ENT[e] : m;
  });
}
function htmlToText(html, keepLayout) {
  let s = html.replace(/<(script|style|noscript|svg|head|nav|footer|iframe)[\s\S]*?<\/\1>/gi, "");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  if (!keepLayout) s = s.replace(/<\/(p|div|li|h[1-6]|tr|section|article|header)>/gi, "\n");
  s = s.replace(/<[^>]+>/g, "");
  s = decode(s).replace(/ /g, " ").replace(/\r/g, "");
  if (!keepLayout) s = s.split("\n").map(l => l.replace(/\s+$/, "")).join("\n").replace(/\n{3,}/g, "\n\n");
  return s;
}
function metaTitle(html) {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title/i);
  const t = og ? og[1] : ((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
  return decode(t).replace(/\s*[|–—-]\s*(Cifra Club|LaCuerda.*|Ultimate.?Guitar.*|E-Chords.*|AcordesWeb.*)$/i, "")
    .replace(/\b(chords?|acordes|acords|cifra|tabs?|letra( y acordes)?|lyrics)\b(\s+(by|de|for))?/gi, "").replace(/\s{2,}/g, " ").replace(/^[\s:·|-]+|[\s:·|-]+$/g, "").trim();
}
function splitTitle(t) {
  const m = t.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  return m ? { title: m[1].trim(), artist: m[2].trim() } : { title: t, artist: "" };
}
function ugStore(html) {
  const m = html.match(/class="js-store"\s+data-content="([^"]+)"/);
  if (!m) return null;
  try { return JSON.parse(decode(m[1])); } catch (e) { return null; }
}

async function readSong(url) {
  const html = await getPage(url);
  return parseSongHtml(html, new URL(url).hostname);
}
function parseSongHtml(html, host) {
  // Ultimate Guitar keeps the song in a JSON blob
  if (/ultimate-guitar\.com$/.test(host)) {
    const st = ugStore(html);
    const data = st && st.store && st.store.page && st.store.page.data;
    const content = data && data.tab_view && data.tab_view.wiki_tab && data.tab_view.wiki_tab.content;
    if (content) {
      const tab = data.tab || {};
      const imp = Chords.importText(content);
      return { title: tab.song_name || "", artist: tab.artist_name || "", key: tab.tonality_name || imp.key, body: imp.body };
    }
  }
  const t = splitTitle(metaTitle(html));
  // Most chord sites put the sheet inside <pre>
  let best = null, bestScore = 0;
  for (const m of html.matchAll(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi)) {
    const text = htmlToText(m[1], true);
    const score = text.split("\n").filter(Chords.isChordLine).length;
    if (score > bestScore) { best = text; bestScore = score; }
  }
  let body = bestScore >= 2 ? best : Chords.trimToSong(htmlToText(html, false));
  if (!body) throw new Error("no chords found on that page");
  const imp = Chords.importText(body);
  return { title: imp.title || t.title, artist: imp.artist || t.artist, key: imp.key, body: imp.body };
}

const CHORD_SITES = [
  [/ultimate-guitar\.com\/tab\/.*chords/, 11], [/ultimate-guitar\.com\/tab\//, 8],
  [/cifraclub\.com(\.br)?\/[^/]+\/[^/]+/, 10], [/acordes\.lacuerda\.net\/[^/]+\/[^/]+/, 10],
  [/e-chords\.com\/chords\//, 9], [/acordesweb\.com\/cancion/, 9], [/cifras\.com\.br\/cifra/, 8], [/chordie\.com\/chord/, 7],
  [/(chords|acordes|acords|cifra|tabs?)[^/]*\.[a-z.]+\/.+/i, 4], [/\/(chords?|acordes|acords|cifras?)\b/i, 3],
];
const SKIP = /duckduckgo|bing\.|google\.|youtube|youtu\.be|spotify|apple\.com|facebook|instagram|tiktok|wikipedia|chordify|amazon|songsterr|pinterest|scribd/i;
function rank(items) {
  const seen = new Set(), out = [];
  for (const it of items) {
    let u; try { u = new URL(it.url); } catch (e) { continue; }
    if (SKIP.test(u.hostname)) continue;
    const key = u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/$/, "");
    if (seen.has(key)) continue;
    let score = 0; for (const [rx, w] of CHORD_SITES) { if (rx.test(u.href)) { score = w; break; } }
    if (!score) continue;
    seen.add(key);
    out.push({ url: u.origin + u.pathname, host: u.hostname.replace(/^www\./, ""), title: it.title || "", score: score + (it.bonus || 0) });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 10);
}
async function ddg(query) {
  const html = await getPage("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query));
  const out = [];
  for (const m of html.matchAll(/<a[^>]+class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    let href = decode(m[1]);
    const ud = href.match(/[?&]uddg=([^&]+)/);
    if (ud) { try { href = decodeURIComponent(ud[1]); } catch (e) { continue; } }
    if (href.startsWith("//")) href = "https:" + href;
    out.push({ url: href, title: htmlToText(m[2], false).trim() });
  }
  return out;
}
async function ugSearch(q) {
  const st = ugStore(await getPage("https://www.ultimate-guitar.com/search.php?search_type=title&value=" + encodeURIComponent(q)));
  const res = (st && st.store && st.store.page && st.store.page.data && st.store.page.data.results) || [];
  return res.filter(r => r && r.tab_url && /chords/i.test(r.type || ""))
    .sort((a, b) => (b.votes || 0) - (a.votes || 0)).slice(0, 4)
    .map((r, i) => ({ url: r.tab_url, title: [r.song_name, r.artist_name].filter(Boolean).join(" · ") + (r.version > 1 ? " (v" + r.version + ")" : ""), bonus: 2 - i * 0.5 }));
}
async function search(q) {
  const jobs = [ddg(q + " chords"), ddg(q + " acordes"), ugSearch(q)];
  const settled = await Promise.allSettled(jobs);
  const items = settled.flatMap(s => (s.status === "fulfilled" ? s.value : []));
  settled.forEach((s, i) => { if (s.status === "rejected") console.warn("search source " + i + " failed:", s.reason && s.reason.message); });
  return rank(items);
}

/* ---------------- http ---------------- */
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };
function send(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(obj === undefined ? "" : JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > 400_000) { reject(new Error("too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch (e) { reject(new Error("invalid JSON")); } });
    req.on("error", reject);
  });
}
const authorized = req => !EDIT_KEY || req.headers["x-edit-key"] === EDIT_KEY;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const p = url.pathname;
  try {
    if (p === "/api/state" && req.method === "GET") return send(res, 200, { songs: db.songs, lists: db.lists, keyRequired: !!EDIT_KEY });
    if (p === "/api/events" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", "Connection": "keep-alive", "X-Accel-Buffering": "no" });
      res.write("retry: 3000\n\n");
      clients.add(res); req.on("close", () => clients.delete(res));
      return;
    }
    const m = p.match(/^\/api\/(songs|lists)\/([a-z0-9]{1,40})$/);
    if (m && (req.method === "PUT" || req.method === "DELETE")) {
      if (!authorized(req)) return send(res, 401, { error: "edit password required" });
      const [, coll, id] = m;
      if (req.method === "PUT") {
        const data = coll === "songs" ? cleanSong(await readBody(req)) : cleanList(await readBody(req));
        db[coll][id] = data; persist(); broadcast({ type: "change", coll, id, data });
        return send(res, 200, data);
      }
      delete db[coll][id]; persist(); broadcast({ type: "change", coll, id, data: null });
      return send(res, 204);
    }
    if (p === "/api/search" && req.method === "GET") {
      if (!authorized(req)) return send(res, 401, { error: "edit password required" });
      const q = (url.searchParams.get("q") || "").trim().slice(0, 200);
      if (!q) return send(res, 400, { error: "empty search" });
      return send(res, 200, { results: await search(q) });
    }
    if (p === "/api/song" && req.method === "GET") {
      if (!authorized(req)) return send(res, 401, { error: "edit password required" });
      try { return send(res, 200, await readSong(url.searchParams.get("url") || "")); }
      catch (e) { return send(res, 502, { error: e.name === "AbortError" ? "the site took too long" : e.message }); }
    }
    if (p.startsWith("/api/")) return send(res, 404, { error: "not found" });

    // static files
    const rel = p === "/" ? "index.html" : decodeURIComponent(p).replace(/^\/+/, "");
    const file = path.normalize(path.join(PUBLIC_DIR, rel));
    if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, { error: "forbidden" });
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
      res.end(buf);
    });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: e.message || "server error" });
  }
});

if (require.main !== module) { module.exports = { parseSongHtml, rank, htmlToText }; }
else server.listen(PORT, HOST, () => {
  console.log(`Songbook running:\n  On this computer:  http://localhost:${PORT}`);
  for (const addrs of Object.values(os.networkInterfaces()))
    for (const a of addrs || []) if (a.family === "IPv4" && !a.internal) console.log(`  On your network:   http://${a.address}:${PORT}`);
  console.log(EDIT_KEY ? "  Changes require the edit password (EDIT_KEY)." : "  Anyone who can open the page can edit it. Set EDIT_KEY to require a password.");
  console.log(`  Data file: ${DATA_FILE}`);
});
