import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { trpcServer } from "@hono/trpc-server";
import { appRouter } from "./trpc/index.js";
import { createContext } from "./trpc/context.js";
import { auth } from "./auth.js";

const app = new Hono();

// ---------------------------------------------------------------------------
// Global middleware
// ---------------------------------------------------------------------------

app.use("*", logger());

app.use(
  "*",
  cors({
    origin: [
      process.env["WEB_URL"] ?? "http://localhost:3000",
      "http://localhost:3000",
      "https://mkmgmt.computecloud.net",
    ],
    allowHeaders: ["Content-Type", "Authorization", "x-org-id", "x-trpc-source"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    maxAge: 86400,
  })
);

// ---------------------------------------------------------------------------
// Better Auth — handles /auth/** natively (sign-in, sign-up, OAuth callbacks)
// ---------------------------------------------------------------------------

app.on(["GET", "POST"], "/auth/**", (c) => auth.handler(c.req.raw));

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "@mikrotik/api",
    timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// tRPC — mounted at /trpc/*
// ---------------------------------------------------------------------------

app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
    createContext,
    onError({ error, path }) {
      if (error.code === "INTERNAL_SERVER_ERROR") {
        console.error(`[tRPC] error on ${path ?? "unknown"}:`, error);
      }
    },
  })
);

// ---------------------------------------------------------------------------
// WebSocket upgrade — agent connections (placeholder)
// ---------------------------------------------------------------------------

app.get("/agent/ws", (c) => {
  // TODO: Upgrade to WebSocket once Bun's native WS support is wired up.
  // The agent package (packages/agent) connects here for real-time metric
  // streaming and command delivery.
  //
  // Example Bun WebSocket upgrade:
  //
  //   const server = Bun.serve({
  //     fetch(req, server) {
  //       if (server.upgrade(req)) return;
  //       return new Response("upgrade required", { status: 426 });
  //     },
  //     websocket: { ... }
  //   });
  return c.json(
    { error: "WebSocket upgrade required — use ws:// or wss://" },
    426
  );
});

// ---------------------------------------------------------------------------
// 404 fallthrough
// ---------------------------------------------------------------------------

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((err, c) => {
  console.error("[api] unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

// ---------------------------------------------------------------------------
// Server entry point
// ---------------------------------------------------------------------------

const PORT = Number(process.env["PORT"] ?? 3001);

export default {
  port: PORT,
  fetch: app.fetch,
};

console.info(`[api] listening on http://localhost:${PORT}`);
