const express = require("express");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const FILE = path.join(DATA_DIR, "inventory.json");
const ADMIN_PIN = process.env.ADMIN_PIN || ""; // optional: required to "Clear everything"

fs.mkdirSync(DATA_DIR, { recursive: true });

let state = { initial: {}, final: {}, restock: [] };
try { state = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { /* fresh start */ }

let saving = Promise.resolve();
function persist() {
  saving = saving.then(() => fs.promises.writeFile(FILE, JSON.stringify(state)));
  return saving;
}
const slug = n => String(n).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const app = express();
app.use(express.json({ limit: "200kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/state", (_req, res) => res.json(state));

app.put("/api/counts/:phase", async (req, res) => {
  const { phase } = req.params;
  if (!["initial", "final"].includes(phase)) return res.status(400).json({ error: "bad phase" });
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "name required" });
  const counts = {};
  for (const [k, v] of Object.entries(req.body?.counts || {})) {
    const n = parseInt(v, 10); if (Number.isFinite(n) && n > 0) counts[k] = n;
  }
  state[phase][slug(name)] = { name, counts, time: Date.now() };
  await persist();
  res.json({ ok: true });
});

app.post("/api/restock", async (req, res) => {
  const qty = parseInt(req.body?.qty, 10);
  const product = String(req.body?.product || "").trim();
  const source = String(req.body?.source || "").trim();
  if (!product || !source || !(qty > 0)) return res.status(400).json({ error: "product, qty and source required" });
  const entry = { id: Date.now() + "-" + Math.random().toString(36).slice(2, 7), product, qty, source, by: String(req.body?.by || "").trim(), time: Date.now() };
  state.restock.push(entry);
  await persist();
  res.json(entry);
});

app.delete("/api/restock/:id", async (req, res) => {
  state.restock = state.restock.filter(r => r.id !== req.params.id);
  await persist();
  res.json({ ok: true });
});

app.delete("/api/all", async (req, res) => {
  if (ADMIN_PIN && req.get("x-admin-pin") !== ADMIN_PIN) return res.status(403).json({ error: "wrong PIN" });
  state = { initial: {}, final: {}, restock: [] };
  await persist();
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`Stand Inventory running on port ${PORT}, data in ${FILE}`));
