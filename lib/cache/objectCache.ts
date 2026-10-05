import "server-only";

/**
 * Optional object-cache layer. This project doesn't hard-depend on Redis —
 * if REDIS_URL isn't set, every function here is a safe no-op and the
 * dashboard shows "Not configured", exactly like the PHP version showed
 * "Not available" when the APCu extension wasn't loaded. Set REDIS_URL
 * (e.g. redis://:yourpassword@127.0.0.1:6379) to turn it on — no code
 * changes needed.
 *
 * Requires the optional `ioredis` package: `npm install ioredis`.
 */

export function isRedisConfigured(): boolean {
  return !!process.env.REDIS_URL;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let clientPromise: Promise<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getClient(): Promise<any | null> {
  if (!isRedisConfigured()) return null;
  if (!clientPromise) {
    clientPromise = (async () => {
      try {
        // Dynamic import so a deployment WITHOUT ioredis installed doesn't
        // fail to build/run — only touched when REDIS_URL is actually set.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mod: any = await import("ioredis").catch(() => null);
        if (!mod) return null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const RedisCtor: any = mod.default ?? mod;
        const client = new RedisCtor(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
        await client.connect();
        return client;
      } catch {
        return null;
      }
    })();
  }
  return clientPromise;
}

export async function objectCachePing(): Promise<boolean> {
  try {
    const client = await getClient();
    if (!client) return false;
    const res = await client.ping();
    return res === "PONG";
  } catch {
    return false;
  }
}

export async function objectCacheGet(key: string): Promise<string | null> {
  try {
    const client = await getClient();
    if (!client) return null;
    return await client.get(key);
  } catch {
    return null;
  }
}

export async function objectCacheSet(key: string, value: string, ttlSeconds?: number): Promise<void> {
  try {
    const client = await getClient();
    if (!client) return;
    if (ttlSeconds) await client.set(key, value, "EX", ttlSeconds);
    else await client.set(key, value);
  } catch {
    // best-effort — object cache failures should never break a page render
  }
}

export async function objectCacheDelete(pattern: string): Promise<number> {
  try {
    const client = await getClient();
    if (!client) return 0;
    const keys: string[] = await client.keys(pattern);
    if (keys.length === 0) return 0;
    await client.del(...keys);
    return keys.length;
  } catch {
    return 0;
  }
}

/** Redis server facts for the Cache Manager's Diagnostics: version, memory in use, how many keys. */
export async function objectCacheInfo(): Promise<{ version: string; usedMemory: string; keys: number } | null> {
  try {
    const client = await getClient();
    if (!client) return null;
    const [server, memory, keys] = await Promise.all([client.info("server"), client.info("memory"), client.dbsize()]);
    const pick = (text: string, name: string) => (text.match(new RegExp(`^${name}:(.*)$`, "m"))?.[1] ?? "").trim();
    return { version: pick(server, "redis_version"), usedMemory: pick(memory, "used_memory_human"), keys: Number(keys) || 0 };
  } catch {
    return null;
  }
}
