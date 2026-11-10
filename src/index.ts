import "dotenv/config";
import crypto from "node:crypto";
import cors from "cors";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import jwt from "jsonwebtoken";
import { desc, eq, gte, asc, sql } from "drizzle-orm";
import { z } from "zod";
import { createDatabase } from "./db/index.js";
import { projects, siteContent, visits } from "./db/schema.js";
import { defaultSiteContent, siteContentSchema } from "./site-content.js";

const required = [
  "DATABASE_URL",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
  "JWT_SECRET",
  "IP_HASH_SECRET",
] as const;
for (const key of required)
  if (!process.env[key]) throw new Error(`Missing ${key}`);
const env = process.env as Record<string, string>;
let databaseUrl: URL;
try {
  databaseUrl = new URL(env.DATABASE_URL);
  if (databaseUrl.protocol !== "postgres:" && databaseUrl.protocol !== "postgresql:")
    throw new Error("DATABASE_URL must use the postgres:// or postgresql:// scheme");
  if (!databaseUrl.hostname || !databaseUrl.pathname.slice(1))
    throw new Error("DATABASE_URL must include a database name");
  if (/[\\'"]/.test(databaseUrl.pathname.slice(1)))
    throw new Error("DATABASE_URL contains quote or backslash characters in the database name");
} catch (error) {
  const message = error instanceof Error ? error.message : "invalid database URL";
  console.error(`[api] database configuration error: ${message}`);
  process.exit(1);
}
const { db, pool } = createDatabase(
  env.DATABASE_URL,
  env.DATABASE_SSL === "true",
);
const app = express();
app.set("trust proxy", env.TRUST_PROXY === "true");
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on("finish", () => {
    console.log(
      JSON.stringify({
        event: "http_request",
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
      }),
    );
  });
  next();
});
app.use(helmet());
app.use(express.json({ limit: "100kb" }));
app.use(
  cors({
    origin: [env.PORTFOLIO_ORIGIN, env.DASHBOARD_ORIGIN].filter(Boolean),
    credentials: true,
  }),
);

const hash = (value: string, secret: string) =>
  crypto.createHmac("sha256", secret).update(value).digest("hex");
const projectSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/),
  title: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  tech: z.array(z.string().max(40)).max(20),
  thumbnail: z.string().min(1).max(500),
  screenshot: z.string().min(1).max(500),
  github: z
    .string()
    .url()
    .refine((value) => ["http:", "https:"].includes(new URL(value).protocol))
    .optional()
    .or(z.literal("")),
  live: z
    .string()
    .url()
    .refine((value) => ["http:", "https:"].includes(new URL(value).protocol))
    .optional()
    .or(z.literal("")),
  caseStudy: z.object({
    problem: z.string().max(3000),
    approach: z.string().max(3000),
    highlights: z.array(z.string().max(300)).max(20),
    outcome: z.string().max(3000),
  }),
  published: z.boolean(),
  sortOrder: z.number().int().default(0),
});
type AuthRequest = Request & { admin?: boolean };
function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  try {
    const payload = token ? jwt.verify(token, env.JWT_SECRET) : null;
    if (
      !payload ||
      typeof payload === "string" ||
      payload.role !== "portfolio-admin"
    )
      throw new Error();
    req.admin = true;
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}

app.get("/health", (_req, res) => res.json({ ok: true }));
app.post(
  "/auth/login",
  rateLimit({
    windowMs: 15 * 60_000,
    limit: 8,
    standardHeaders: true,
    legacyHeaders: false,
  }),
  (req, res) => {
    const body = z
      .object({ email: z.string().email(), password: z.string().min(1) })
      .safeParse(req.body);
    if (
      !body.success ||
      body.data.email.toLowerCase() !== env.ADMIN_EMAIL.toLowerCase() ||
      body.data.password !== env.ADMIN_PASSWORD
    )
      return res.status(401).json({ error: "Invalid credentials" });
    const token = jwt.sign({ role: "portfolio-admin" }, env.JWT_SECRET, {
      expiresIn: "8h",
    });
    res.json({ token, expiresIn: 28800 });
  },
);
app.get("/content", async (_req, res, next) => {
  try {
    const [row] = await db
      .select({ content: siteContent.content })
      .from(siteContent)
      .where(eq(siteContent.id, "main"));
    res.json(row?.content ?? defaultSiteContent);
  } catch (e) {
    console.error("[api] content lookup failed", e);
    res.json(defaultSiteContent);
  }
});
app.get("/admin/content", requireAdmin, async (_req, res, next) => {
  try {
    const [row] = await db
      .select({
        content: siteContent.content,
        updatedAt: siteContent.updatedAt,
      })
      .from(siteContent)
      .where(eq(siteContent.id, "main"));
    res.json({
      content: row?.content ?? defaultSiteContent,
      updatedAt: row?.updatedAt ?? null,
    });
  } catch (e) {
    console.error("[api] admin content lookup failed", e);
    res.status(503).json({ error: "Database unavailable. Content could not be loaded." });
  }
});
app.put("/admin/content", requireAdmin, async (req, res, next) => {
  const parsed = siteContentSchema.safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ error: "Invalid site content", details: parsed.error.flatten() });
  try {
    const [row] = await db
      .insert(siteContent)
      .values({ id: "main", content: parsed.data })
      .onConflictDoUpdate({
        target: siteContent.id,
        set: { content: parsed.data, updatedAt: new Date() },
      })
      .returning({ updatedAt: siteContent.updatedAt });
    res.json({ ok: true, updatedAt: row?.updatedAt });
  } catch (e) {
    console.error("[api] admin content update failed", e);
    res.status(503).json({ error: "Database unavailable. Content was not saved." });
  }
});
app.get("/projects", async (_req, res, next) => {
  try {
    const rows = await db
      .select({
        id: projects.id,
        title: projects.title,
        description: projects.description,
        tech: projects.tech,
        thumbnail: projects.thumbnail,
        screenshot: projects.screenshot,
        github: projects.github,
        live: projects.live,
        caseStudy: projects.caseStudy,
        published: projects.published,
        sortOrder: projects.sortOrder,
      })
      .from(projects)
      .where(eq(projects.published, true))
      .orderBy(asc(projects.sortOrder), asc(projects.title));
    res.json(rows);
  } catch (e) {
    console.error("[api] public projects lookup failed", e);
    res.status(503).json({ error: "Projects are temporarily unavailable" });
  }
});
app.get("/admin/projects", requireAdmin, async (_req, res, next) => {
  try {
    const rows = await db
      .select({
        id: projects.id,
        title: projects.title,
        description: projects.description,
        tech: projects.tech,
        thumbnail: projects.thumbnail,
        screenshot: projects.screenshot,
        github: projects.github,
        live: projects.live,
        caseStudy: projects.caseStudy,
        published: projects.published,
        sortOrder: projects.sortOrder,
      })
      .from(projects)
      .orderBy(asc(projects.sortOrder), asc(projects.title));
    res.json(rows);
  } catch (e) {
    console.error("[api] admin projects lookup failed", e);
    res.status(503).json({ error: "Database unavailable. Projects could not be loaded." });
  }
});
app.put("/admin/projects/:id", requireAdmin, async (req, res, next) => {
  const parsed = projectSchema.safeParse({ ...req.body, id: req.params.id });
  if (!parsed.success)
    return res
      .status(400)
      .json({ error: "Invalid project", details: parsed.error.flatten() });
  const p = parsed.data;
  try {
    await db
      .insert(projects)
      .values({
        id: p.id,
        title: p.title,
        description: p.description,
        tech: p.tech,
        thumbnail: p.thumbnail,
        screenshot: p.screenshot,
        github: p.github || null,
        live: p.live || null,
        caseStudy: p.caseStudy,
        published: p.published,
        sortOrder: p.sortOrder,
      })
      .onConflictDoUpdate({
        target: projects.id,
        set: {
          title: p.title,
          description: p.description,
          tech: p.tech,
          thumbnail: p.thumbnail,
          screenshot: p.screenshot,
          github: p.github || null,
          live: p.live || null,
          caseStudy: p.caseStudy,
          published: p.published,
          sortOrder: p.sortOrder,
          updatedAt: new Date(),
        },
      });
    res.json({ ok: true });
  } catch (e) {
    console.error("[api] admin project update failed", e);
    res.status(503).json({ error: "Database unavailable. Project was not saved." });
  }
});
app.delete("/admin/projects/:id", requireAdmin, async (req, res, next) => {
  const id = typeof req.params.id === "string" ? req.params.id : null;
  if (!id) return res.status(400).json({ error: "Invalid project id" });
  try {
    await db.delete(projects).where(eq(projects.id, id));
    res.status(204).end();
  } catch (e) {
    console.error("[api] admin project deletion failed", e);
    res.status(503).json({ error: "Database unavailable. Project was not deleted." });
  }
});

app.post(
  "/track",
  rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
  }),
  async (req, res, next) => {
    const input = z
      .object({
        path: z.string().startsWith("/").max(200),
        sessionId: z.string().uuid(),
        referrer: z.string().max(1000).optional(),
      })
      .safeParse(req.body);
    if (!input.success || input.data.path.startsWith("//"))
      return res.status(400).json({ error: "Invalid event" });
    const ip = req.ip || "unknown";
    const month = new Date().toISOString().slice(0, 7);
    const visitorHash = hash(`${month}:${ip}`, env.IP_HASH_SECRET);
    const sessionHash = hash(input.data.sessionId, env.IP_HASH_SECRET);
    let referrerHost: string | null = null;
    if (input.data.referrer) {
      try {
        referrerHost = new URL(input.data.referrer).hostname.slice(0, 253);
      } catch {
        /* discard invalid referrer */
      }
    }
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`
          SELECT pg_advisory_xact_lock(hashtext(${`${sessionHash}:${input.data.path}`}))
        `);
        await tx.execute(sql`
          INSERT INTO ${visits} (page_path, session_hash, visitor_hash, referrer_host)
          SELECT ${input.data.path}, ${sessionHash}, ${visitorHash}, ${referrerHost}
          WHERE NOT EXISTS (
            SELECT 1
            FROM ${visits}
            WHERE session_hash = ${sessionHash}
              AND page_path = ${input.data.path}
              AND occurred_at > now() - interval '30 minutes'
          )
        `);
      });
      res.status(202).json({ ok: true });
    } catch (e) {
      console.error("[api] analytics lookup failed", e);
      res.status(503).json({ error: "Database unavailable. Analytics could not be loaded." });
    }
  },
);
app.get("/admin/analytics", requireAdmin, async (req, res, next) => {
  const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
  try {
    const since = sql`now() - ${days} * interval '1 day'`;
    const [totals, series, pages, referrers] = await Promise.all([
      db
        .select({
          page_views: sql<number>`count(*)::int`,
          visitors: sql<number>`count(distinct ${visits.visitorHash})::int`,
          sessions: sql<number>`count(distinct ${visits.sessionHash})::int`,
        })
        .from(visits)
        .where(gte(visits.occurredAt, since)),
      db
        .select({
          date: sql<string>`to_char(date_trunc('day', ${visits.occurredAt}), 'YYYY-MM-DD')`,
          page_views: sql<number>`count(*)::int`,
          visitors: sql<number>`count(distinct ${visits.visitorHash})::int`,
        })
        .from(visits)
        .where(gte(visits.occurredAt, since))
        .groupBy(sql`date_trunc('day', ${visits.occurredAt})`)
        .orderBy(sql`date_trunc('day', ${visits.occurredAt})`),
      db
        .select({
          page_path: visits.pagePath,
          views: sql<number>`count(*)::int`,
        })
        .from(visits)
        .where(gte(visits.occurredAt, since))
        .groupBy(visits.pagePath)
        .orderBy(desc(sql`count(*)`))
        .limit(8),
      db
        .select({
          referrer: sql<string>`coalesce(${visits.referrerHost}, 'Direct')`,
          visits: sql<number>`count(*)::int`,
        })
        .from(visits)
        .where(gte(visits.occurredAt, since))
        .groupBy(sql`coalesce(${visits.referrerHost}, 'Direct')`)
        .orderBy(desc(sql`count(*)`))
        .limit(8),
    ]);
    res.json({
      days,
      totals: totals[0],
      series,
      pages,
      referrers,
    });
  } catch (e) {
    next(e);
  }
});
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
});
const port = Number(process.env.PORT) || 4000;
let server: ReturnType<typeof app.listen>;
async function startServer() {
  try {
    await pool.query("select 1");
    console.log(
      `[api] database connection verified (${databaseUrl.hostname}/${databaseUrl.pathname.slice(1)})`,
    );
    server = app.listen(port, () =>
      console.log(`Portfolio API listening on ${port}`),
    );
  } catch (error) {
    console.error("[api] database connection failed; API will not start", error);
    await pool.end().catch((closeError: unknown) => {
      console.error("[api] failed to close database pool", closeError);
    });
    process.exit(1);
  }
}
void startServer();
const shutdown = (signal: string) => {
  console.log(`Received ${signal}; shutting down`);
  if (!server) {
    void pool.end().finally(() => process.exit(0));
    return;
  }
  server.close(() => {
    void pool.end().finally(() => process.exit(0));
  });
};
process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
