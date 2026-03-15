/**
 * nonceStore.js
 * Almacén de nonces de un solo uso con TTL.
 * Usa Redis si REDIS_URL está configurado, sino Map en memoria.
 * 
 * IMPORTANTE: En producción multi-instancia DEBES usar Redis.
 * En single-instance, el Map en memoria es suficiente.
 */

const TTL_MS = 90_000; // 90 segundos

/* ─── Adaptador en memoria ─── */
class MemoryStore {
  constructor() {
    this._map = new Map();

    // Limpieza cada 2 minutos para evitar memory leaks
    setInterval(() => {
      const now = Date.now();
      for (const [key, expiresAt] of this._map) {
        if (now > expiresAt) this._map.delete(key);
      }
    }, 2 * 60_000).unref();
  }

  async set(key, ttlMs = TTL_MS) {
    this._map.set(key, Date.now() + ttlMs);
  }

  /** Consume el nonce: retorna true si existía y lo elimina, false si no */
  async consume(key) {
    const expiresAt = this._map.get(key);
    if (!expiresAt) return false;
    if (Date.now() > expiresAt) {
      this._map.delete(key);
      return false;
    }
    this._map.delete(key); // ← un solo uso
    return true;
  }

  async has(key) {
    const expiresAt = this._map.get(key);
    if (!expiresAt) return false;
    if (Date.now() > expiresAt) {
      this._map.delete(key);
      return false;
    }
    return true;
  }
}

/* ─── Adaptador Redis ─── */
class RedisStore {
  constructor(client) {
    this._client = client;
  }

  async set(key, ttlMs = TTL_MS) {
    // PX = TTL en milisegundos
    await this._client.set(`nonce:${key}`, "1", { PX: ttlMs });
  }

  async consume(key) {
    // Usa un script Lua para atomicidad: GET + DEL en una sola operación
    const script = `
      local v = redis.call("GET", KEYS[1])
      if v then
        redis.call("DEL", KEYS[1])
        return 1
      end
      return 0
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

/* ─── Factory: detecta Redis automáticamente ─── */
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
    } catch (err) {
      console.warn("⚠️  NonceStore: Redis falló, usando memoria:", err.message);
      _store = new MemoryStore();
    }
  } else {
    _store = new MemoryStore();
  }

  return _store;
}

module.exports = { getStore, TTL_MS };