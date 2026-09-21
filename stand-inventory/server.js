const express = require("express");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const FILE = path.join(DATA_DIR, "inventory.json");
const ADMIN_PIN = process.env.ADMIN_PIN || "";

fs.mkdirSync(DATA_DIR, { recursive: true });

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const blankEvent = name => ({ id: newId(), name, created: Date.now(), initial: {}, final: {}, restock: [] });

// db = { events: { [id]: {id,name,created,initial,final,restock} } }
let db = { events: {} };
try {
  const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
  if (raw.events) db = raw;
  else if (raw.initial || raw.final || raw.restock) {
    // migrate the old single-event format
    const ev = blankEvent("Earlier event");
    Object.assign(ev, { initial: raw.initial || {}, final: raw.final || {}, restock: raw.restock || [] });
    db.events[ev.id] = ev;
  }
} catch { /* fresh start */ }

let saving = Promise.resolve();
const persist = () => (saving = saving.then(() => fs.promises.writeFile(FILE, JSON.stringify(db))));
const slug = n => String(n).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const cleanName = n => String(n || "").trim().slice(0, 80);

function requirePin(req, res) {
  if (ADMIN_PIN && req.get("x-admin-pin") !== ADMIN_PIN) { res.status(403).json({ error: "wrong PIN" }); return false; }
  return true;
}

const app = express();
app.use(express.json({ limit: "200kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/admin/check", (req, res) => { if (requirePin(req, res)) res.json({ ok: true, pinRequired: !!ADMIN_PIN }); });

/* ----- events ----- */
app.get("/api/events", (_req, res) => {
  const list = Object.values(db.events)
    .sort((a, b) => b.created - a.created)
    .map(e => ({ id: e.id, name: e.name, created: e.created }));
  res.json(list);
});

app.post("/api/events", async (req, res) => {
  if (!requirePin(req, res)) return;
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ error: "event name required" });
  const ev = blankEvent(name);
  db.events[ev.id] = ev;
  await persist();
  res.json(ev);
});

app.param("eid", (req, res, next, eid) => {
  req.ev = db.events[eid];
  if (!req.ev) return res.status(404).json({ error: "event not found" });
  next();
});

app.get("/api/events/:eid", (req, res) => res.json(req.ev));

app.patch("/api/events/:eid", async (req, res) => {
  if (!requirePin(req, res)) return;
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ error: "event name required" });
  req.ev.name = name;
  await persist();
  res.json({ ok: true });
});

app.delete("/api/events/:eid", async (req, res) => {
  if (!requirePin(req, res)) return;
  delete db.events[req.ev.id];
  await persist();
  res.json({ ok: true });
});

/* ----- counts ----- */
app.put("/api/events/:eid/counts/:phase", async (req, res) => {
  const { phase } = req.params;
  if (!["initial", "final"].includes(phase)) return res.status(400).json({ error: "bad phase" });
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ error: "name required" });
  const counts = {};
  for (const [k, v] of Object.entries(req.body?.counts || {})) {
    const n = parseInt(v, 10); if (Number.isFinite(n) && n > 0) counts[k] = n;
  }
  req.ev[phase][slug(name)] = { name, counts, time: Date.now() };
  await persist();
  res.json({ ok: true });
});

app.delete("/api/events/:eid/counts/:phase/:key", async (req, res) => {
  if (!requirePin(req, res)) return;
  const { phase, key } = req.params;
  if (!["initial", "final"].includes(phase)) return res.status(400).json({ error: "bad phase" });
  delete req.ev[phase][key];
  await persist();
  res.json({ ok: true });
});

/* ----- restock ----- */
function readRestock(body) {
  const qty = parseInt(body?.qty, 10);
  const product = String(body?.product || "").trim();
  const source = String(body?.source || "").trim();
  return product && source && qty > 0 ? { product, qty, source } : null;
}

app.post("/api/events/:eid/restock", async (req, res) => {
  const r = readRestock(req.body);
  if (!r) return res.status(400).json({ error: "product, qty and source required" });
  const entry = { id: newId(), ...r, by: cleanName(req.body?.by), time: Date.now() };
  req.ev.restock.push(entry);
  await persist();
  res.json(entry);
});

app.put("/api/events/:eid/restock/:rid", async (req, res) => {
  const entry = req.ev.restock.find(x => x.id === req.params.rid);
  if (!entry) return res.status(404).json({ error: "not found" });
  const r = readRestock(req.body);
  if (!r) return res.status(400).json({ error: "product, qty and source required" });
  Object.assign(entry, r);
  await persist();
  res.json(entry);
});

app.delete("/api/events/:eid/restock/:rid", async (req, res) => {
  req.ev.restock = req.ev.restock.filter(x => x.id !== req.params.rid);
  await persist();
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`Stand Inventory running on port ${PORT}, data in ${FILE}`));
