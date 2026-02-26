/**
 * src/config/mongo.ts
 * ────────────────────
 * Single shared MongoClient for the entire bot with auto-reconnect.
 * db-config, logger, heartbeat, and scheduler all import from here.
 */

import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error('[mongo] MONGODB_URI environment variable is not set');
}

let _client: MongoClient | null = null;

async function createClient(): Promise<MongoClient> {
  const client = new MongoClient(MONGODB_URI!, {
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS:         10_000,
    socketTimeoutMS:          45_000,
    maxPoolSize:              5,
  });
  await client.connect();
  console.log('[mongo] Connected to MongoDB');

  // When the connection drops, clear the cached client so
  // the next call to getMongoClient() creates a fresh one.
  client.on('close',          ()    => { console.warn('[mongo] Connection closed — will reconnect on next use'); _client = null; });
  client.on('topologyClosed', ()    => { console.warn('[mongo] Topology closed — will reconnect on next use'); _client = null; });
  client.on('error',          (err) => { console.error('[mongo] Client error:', err.message); _client = null; });

  return client;
}

export async function getMongoClient(): Promise<MongoClient> {
  if (_client) return _client;

  try {
    _client = await createClient();
    return _client;
  } catch (err) {
    _client = null;
    throw err;
  }
}