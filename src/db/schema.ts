import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  tech: text("tech").array().notNull().default([]),
  thumbnail: text("thumbnail").notNull(),
  screenshot: text("screenshot").notNull(),
  github: text("github"),
  live: text("live"),
  caseStudy: jsonb("case_study").notNull(),
  published: boolean("published").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const visits = pgTable("visits", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  occurredAt: timestamp("occurred_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  pagePath: text("page_path").notNull(),
  sessionHash: text("session_hash").notNull(),
  visitorHash: text("visitor_hash").notNull(),
  referrerHost: text("referrer_host"),
});

export const siteContent = pgTable("site_content", {
  id: text("id").primaryKey(),
  content: jsonb("content").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
