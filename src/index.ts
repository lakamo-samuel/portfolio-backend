import "dotenv/config";
import crypto from "node:crypto";
import cors from "cors";
import express, { type Request, type Response, type NextFunction } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import jwt from "jsonwebtoken";
import { Pool } from "pg";
import { z } from "zod";
import { defaultSiteContent, siteContentSchema } from "./site-content.js";

const required = ["DATABASE_URL", "ADMIN_EMAIL", "ADMIN_PASSWORD", "JWT_SECRET", "IP_HASH_SECRET"] as const;
for (const key of required) if (!process.env[key]) throw new Error(`Missing ${key}`);
const env = process.env as Record<string, string>;
const pool = new Pool({ connectionString: env.DATABASE_URL, ssl: env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined, max: 5 });
const app = express();
app.set("trust proxy", 1);
app.use(helmet());
app.use(express.json({ limit: "100kb" }));
app.use(cors({ origin: [env.PORTFOLIO_ORIGIN, env.DASHBOARD_ORIGIN].filter(Boolean), credentials: true }));

const hash = (value: string, secret: string) => crypto.createHmac("sha256", secret).update(value).digest("hex");
const projectSchema = z.object({ id: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/), title: z.string().min(1).max(100), description: z.string().min(1).max(500), tech: z.array(z.string().max(40)).max(20), thumbnail: z.string().min(1).max(500), screenshot: z.string().min(1).max(500), github: z.string().url().optional().or(z.literal("")), live: z.string().url().optional().or(z.literal("")), caseStudy: z.object({ problem: z.string().max(3000), approach: z.string().max(3000), highlights: z.array(z.string().max(300)).max(20), outcome: z.string().max(3000) }), published: z.boolean(), sortOrder: z.number().int().default(0) });
type AuthRequest = Request & { admin?: boolean };
function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  try { const payload = token ? jwt.verify(token, env.JWT_SECRET) : null; if (!payload || typeof payload === "string" || payload.role !== "portfolio-admin") throw new Error(); req.admin = true; next(); }
  catch { res.status(401).json({ error: "Unauthorized" }); }
}

app.get("/health", (_req, res) => res.json({ ok: true }));
app.post("/auth/login", rateLimit({ windowMs: 15 * 60_000, limit: 8, standardHeaders: true, legacyHeaders: false }), (req, res) => {
  const body = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(req.body);
  if (!body.success || body.data.email.toLowerCase() !== env.ADMIN_EMAIL.toLowerCase() || body.data.password !== env.ADMIN_PASSWORD) return res.status(401).json({ error: "Invalid credentials" });
  const token = jwt.sign({ role: "portfolio-admin" }, env.JWT_SECRET, { expiresIn: "8h" });
  res.json({ token, expiresIn: 28800 });
});
app.get("/content", async (_req, res, next) => {
  try {
    const result = await pool.query("SELECT content FROM site_content WHERE id='main'");
    res.json(result.rows[0]?.content ?? defaultSiteContent);
  } catch (e) { next(e); }
});
app.get("/admin/content", requireAdmin, async (_req, res, next) => {
  try {
    const result = await pool.query("SELECT content,updated_at FROM site_content WHERE id='main'");
    res.json({ content: result.rows[0]?.content ?? defaultSiteContent, updatedAt: result.rows[0]?.updated_at ?? null });
  } catch (e) { next(e); }
});
app.put("/admin/content", requireAdmin, async (req, res, next) => {
  const parsed = siteContentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid site content", details: parsed.error.flatten() });
  try {
    const result = await pool.query(
      "INSERT INTO site_content(id,content,updated_at) VALUES('main',$1,now()) ON CONFLICT(id) DO UPDATE SET content=$1,updated_at=now() RETURNING updated_at",
      [parsed.data],
    );
    res.json({ ok: true, updatedAt: result.rows[0]?.updated_at });
  } catch (e) { next(e); }
});
app.get("/projects", async (_req, res, next) => {
  try { const result = await pool.query("SELECT id,title,description,tech,thumbnail,screenshot,github,live,case_study AS \"caseStudy\",published,sort_order AS \"sortOrder\" FROM projects WHERE published=true ORDER BY sort_order,title"); res.json(result.rows); } catch (e) { next(e); }
});
app.get("/admin/projects", requireAdmin, async (_req, res, next) => {
  try { const result = await pool.query("SELECT id,title,description,tech,thumbnail,screenshot,github,live,case_study AS \"caseStudy\",published,sort_order AS \"sortOrder\" FROM projects ORDER BY sort_order,title"); res.json(result.rows); } catch (e) { next(e); }
});
app.put("/admin/projects/:id", requireAdmin, async (req, res, next) => {
  const parsed = projectSchema.safeParse({ ...req.body, id: req.params.id });
  if (!parsed.success) return res.status(400).json({ error: "Invalid project", details: parsed.error.flatten() });
  const p = parsed.data;
  try { await pool.query(`INSERT INTO projects(id,title,description,tech,thumbnail,screenshot,github,live,case_study,published,sort_order,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now()) ON CONFLICT(id) DO UPDATE SET title=$2,description=$3,tech=$4,thumbnail=$5,screenshot=$6,github=$7,live=$8,case_study=$9,published=$10,sort_order=$11,updated_at=now()`, [p.id,p.title,p.description,p.tech,p.thumbnail,p.screenshot,p.github || null,p.live || null,p.caseStudy,p.published,p.sortOrder]); res.json({ ok: true }); } catch (e) { next(e); }
});
app.delete("/admin/projects/:id", requireAdmin, async (req, res, next) => { try { await pool.query("DELETE FROM projects WHERE id=$1", [req.params.id]); res.status(204).end(); } catch (e) { next(e); } });

app.post("/track", rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false }), async (req, res, next) => {
  const input = z.object({ path: z.string().startsWith("/").max(200), sessionId: z.string().uuid(), referrer: z.string().max(1000).optional() }).safeParse(req.body);
  if (!input.success || input.data.path.startsWith("//")) return res.status(400).json({ error: "Invalid event" });
  const ip = req.ip || "unknown";
  const month = new Date().toISOString().slice(0, 7);
  const visitorHash = hash(`${month}:${ip}`, env.IP_HASH_SECRET);
  const sessionHash = hash(input.data.sessionId, env.IP_HASH_SECRET);
  let referrerHost: string | null = null;
  if (input.data.referrer) { try { referrerHost = new URL(input.data.referrer).hostname.slice(0, 253); } catch { /* discard invalid referrer */ } }
  try {
    const recent = await pool.query("SELECT 1 FROM visits WHERE session_hash=$1 AND page_path=$2 AND occurred_at > now() - interval '30 minutes' LIMIT 1", [sessionHash, input.data.path]);
    if (!recent.rowCount) await pool.query("INSERT INTO visits(page_path,session_hash,visitor_hash,referrer_host) VALUES($1,$2,$3,$4)", [input.data.path, sessionHash, visitorHash, referrerHost]);
    res.status(202).json({ ok: true });
  } catch (e) { next(e); }
});
app.get("/admin/analytics", requireAdmin, async (req, res, next) => {
  const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
  try {
    const [totals, series, pages, referrers] = await Promise.all([
      pool.query("SELECT count(*)::int AS page_views, count(DISTINCT visitor_hash)::int AS visitors, count(DISTINCT session_hash)::int AS sessions FROM visits WHERE occurred_at >= now() - ($1::int * interval '1 day')", [days]),
      pool.query("SELECT to_char(date_trunc('day',occurred_at),'YYYY-MM-DD') AS date,count(*)::int AS page_views,count(DISTINCT visitor_hash)::int AS visitors FROM visits WHERE occurred_at >= now() - ($1::int * interval '1 day') GROUP BY 1 ORDER BY 1", [days]),
      pool.query("SELECT page_path,count(*)::int AS views FROM visits WHERE occurred_at >= now() - ($1::int * interval '1 day') GROUP BY 1 ORDER BY views DESC LIMIT 8", [days]),
      pool.query("SELECT coalesce(referrer_host,'Direct') AS referrer,count(*)::int AS visits FROM visits WHERE occurred_at >= now() - ($1::int * interval '1 day') GROUP BY 1 ORDER BY visits DESC LIMIT 8", [days]),
    ]);
    res.json({ days, totals: totals.rows[0], series: series.rows, pages: pages.rows, referrers: referrers.rows });
  } catch (e) { next(e); }
});
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => { console.error(error); res.status(500).json({ error: "Internal server error" }); });
const port = Number(process.env.PORT) || 4000;
app.listen(port, () => console.log(`Portfolio API listening on ${port}`));
