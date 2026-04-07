import Redis from "ioredis";

/**
 * Singleton Redis client backed by the REDIS_URL environment variable.
 *
 * ioredis will automatically reconnect on disconnect with exponential backoff.
 * Import this instance wherever you need cache, pub/sub, or job queue access.
 */

const redisUrl = process.env["REDIS_URL"] ?? "redis://localhost:6379";

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
});

redis.on("error", (err: Error) => {
  console.error("[redis] connection error:", err.message);
});

redis.on("connect", () => {
  console.info("[redis] connected");
});

export type RedisClient = typeof redis;
