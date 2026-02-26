/**
 * src/utils/heartbeat.ts
 * ──────────────────────
 * Writes a heartbeat document to MongoDB every 30 seconds so the
 * dashboard can tell whether the bot process is actually running.
 *
 * Call startHeartbeat(client) once inside client.once('ready', ...).
 */

import { MongoClient } from 'mongodb';
import type { Client } from 'discord.js';

const MONGODB_URI = process.env.MONGODB_URI!;
const DB_NAME     = process.env.MONGODB_DB ?? 'hackoverflow';
const COLL        = 'bot_heartbeat';
const DOC_ID      = 'kernel-bot';
const INTERVAL_MS = 30_000; // 30 seconds

let _client: MongoClient | null = null;

async function getClient(): Promise<MongoClient> {
  if (!_client) {
    _client = new MongoClient(MONGODB_URI);
    await _client.connect();
  }
  return _client;
}

async function writeHeartbeat(discordClient: Client): Promise<void> {
  try {
    const mongo = await getClient();
    await mongo.db(DB_NAME).collection(COLL).replaceOne(
      { _id: DOC_ID as never },
      {
        _id:        DOC_ID as never,
        alive:      true,
        tag:        discordClient.user?.tag ?? 'unknown',
        guildCount: discordClient.guilds.cache.size,
        userCount:  discordClient.users.cache.size,
        ping:       discordClient.ws.ping,
        startedAt:  startedAt,
        lastSeen:   new Date(),
      },
      { upsert: true }
    );
  } catch (err) {
    // Never crash the bot over a heartbeat failure
    console.error('[heartbeat] Failed to write:', err);
  }
}

const startedAt = new Date();

export function startHeartbeat(discordClient: Client): void {
  // Write immediately on start, then every 30 s
  writeHeartbeat(discordClient);
  setInterval(() => writeHeartbeat(discordClient), INTERVAL_MS);
  console.log('💓 Heartbeat started — writing to MongoDB every 30s');
}