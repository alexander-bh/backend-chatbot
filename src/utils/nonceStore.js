/**
 * nonceStore.js
 * Almacén de nonces de un solo uso con TTL.
 * Usa Redis si REDIS_URL está configurado, sino Map en memoria.
 * 
 * IMPORTANTE: En producción multi-instancia DEBES usar Redis.
 * En single-instance, el Map en memoria es suficiente.
 */

const TTL_MS = 90_000;

/* ─── Adaptador en memoria ─── */
class MemoryStore {
  constructor() {
    this._map = new Map();
    setInterval(() => {
      const now = Date.now();
      for (const [key, val] of this._map) {
        if (now > val.expiresAt) this._map.delete(key);
      }
    }, 2 * 60_000).unref();
  }

  async set(key, ttlMs = TTL_MS) {
    this._map.set(key, { count: 2, expiresAt: Date.now() + ttlMs });
  }

  async consume(key) {
    const val = this._map.get(key);
    if (!val) return false;
    if (Date.now() > val.expiresAt) { this._map.delete(key); return false; }
    if (val.count <= 1) {
      this._map.delete(key);
    } else {
      val.count--;
    }
    return true;
  }

  async has(key) {
    const val = this._map.get(key);
    if (!val) return false;
    if (Date.now() > val.expiresAt) { this._map.delete(key); return false; }
    return true;
  }
}

/* ─── Adaptador Redis ─── */
class RedisStore {
  constructor(client) {
    this._client = client;
  }

  async set(key, ttlMs = TTL_MS) {
    // Guarda contador 2 para absorber doble montaje de React
    await this._client.set(`nonce:${key}`, "2", { PX: ttlMs });
  }

  async consume(key) {
    const script = `
      local v = redis.call("GET", KEYS[1])
      if not v then return 0 end
      local count = tonumber(v)
      if count <= 1 then
        redis.call("DEL", KEYS[1])
      else
        redis.call("SET", KEYS[1], tostring(count - 1), "KEEPTTL")
      end
      return 1
    `;
    const result = await this._client.eval(script, {
      keys: [`nonce:${key}`],
      arguments: []
    });
    return result === 1;
  }

  async has(key) {
    const v = await this._client.get(`nonce:${key}`);
    return v !== null;
  }
}

/* ─── Factory ─── */
let _store = null;

async function getStore() {
  if (_store) return _store;

  if (process.env.REDIS_URL) {
    try {
      const { createClient } = require("redis");
      const client = createClient({ url: process.env.REDIS_URL });
      client.on("error", (err) => console.error("Redis error:", err));
      await client.connect();
      _store = new RedisStore(client);
      console.log("✅ NonceStore: usando Redis");
    } catch (err) {
      console.warn("⚠️ NonceStore: Redis falló, usando memoria:", err.message);
      _store = new MemoryStore();
    }
  } else {
    console.warn("⚠️ NonceStore: sin REDIS_URL, usando memoria (no apto para producción)");
    _store = new MemoryStore();
  }

  return _store;
}

module.exports = { getStore, TTL_MS };