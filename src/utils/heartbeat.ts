/**
 * src/utils/heartbeat.ts
 * ────────────────────────
 * Writes a heartbeat document every 30s using the shared MongoClient.
 */

import type { Client } from 'discord.js';
import { getMongoClient } from '../config/mongo';

const DB_NAME     = process.env.MONGODB_DB ?? 'hackoverflow';
const COLL        = 'bot_heartbeat';
const DOC_ID      = 'kernel-bot';
const INTERVAL_MS = 30_000;

const startedAt = new Date();

async function writeHeartbeat(discordClient: Client): Promise<void> {
  try {
    const mongo = await getMongoClient();
    await mongo.db(DB_NAME).collection(COLL).replaceOne(
      { _id: DOC_ID as never },
      {
        _id:        DOC_ID as never,
        alive:      true,
        tag:        discordClient.user?.tag ?? 'unknown',
        guildCount: discordClient.guilds.cache.size,
        userCount:  discordClient.users.cache.size,
        ping:       discordClient.ws.ping,
        startedAt,
        lastSeen:   new Date(),
      },
      { upsert: true }
    );
  } catch (err) {
    console.error('[heartbeat] Failed to write:', err);
  }
}

export function startHeartbeat(discordClient: Client): void {
  writeHeartbeat(discordClient);
  setInterval(() => writeHeartbeat(discordClient), INTERVAL_MS);
  console.log('💓 Heartbeat started — writing to MongoDB every 30s');
}