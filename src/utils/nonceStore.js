/**
 * nonceStore.js
 * Almacén de nonces de un solo uso con TTL.
 * Usa Redis (Upstash REST) si las variables están configuradas, sino Map en memoria.
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

/* ─── Adaptador Redis (Upstash REST) ─── */
class RedisStore {
  constructor(client) {
    this._client = client;
  }

  async set(key, ttlMs = TTL_MS) {
    // Guarda contador 2 para absorber doble montaje de React
    // PX = TTL en milisegundos
    await this._client.set(`nonce:${key}`, "2", { px: ttlMs });
  }

  async consume(key) {
    // @upstash/redis NO soporta eval con Lua scripts via HTTP REST,
    // así que hacemos la lógica en JS con GET + DEL/SET
    const redisKey = `nonce:${key}`;
    const v = await this._client.get(redisKey);

    if (v === null || v === undefined) return false;

    const count = parseInt(v, 10);

    if (count <= 1) {
      await this._client.del(redisKey);
    } else {
      // Mantener el mismo TTL no es posible directamente en REST sin KEEPTTL,
      // usamos GETEX para obtener el TTL restante y luego SET con ese TTL
      const ttlMs = await this._client.pttl(redisKey);
      if (ttlMs > 0) {
        await this._client.set(redisKey, String(count - 1), { px: ttlMs });
      } else {
        await this._client.del(redisKey);
      }
    }

    return true;
  }

  async has(key) {
    const v = await this._client.get(`nonce:${key}`);
    return v !== null && v !== undefined;
  }
}

/* ─── Factory ─── */
let _store = null;

async function getStore() {
  if (_store) return _store;

  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    try {
      const { Redis } = require("@upstash/redis");
      const client = new Redis({ url, token });

      // Test de conexión
      await client.ping();

      _store = new RedisStore(client);
    } catch (err) {
      console.warn("⚠️ NonceStore: Redis falló, usando memoria:", err.message);
      _store = new MemoryStore();
    }
  } else {
    console.warn("⚠️ NonceStore: sin credenciales Upstash, usando memoria (no apto para producción)");
    _store = new MemoryStore();
  }

  return _store;
}

module.exports = { getStore, TTL_MS };