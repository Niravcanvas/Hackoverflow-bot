/**
 * src/utils/logger.ts
 * ────────────────────
 * Writes structured bot events to MongoDB `bot_logs` collection.
 * Uses the shared MongoClient from config/mongo.ts.
 */

import { getMongoClient } from '../config/mongo';

const DB_NAME = process.env.MONGODB_DB ?? 'hackoverflow';
const COLL    = 'bot_logs';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LogType = 'ai_mention' | 'prefix_command' | 'scheduled' | 'error';

export interface BotLogEntry {
  type:        LogType;
  event:       string;
  userId?:     string;
  username?:   string;
  channelId?:  string;
  detail?:     string;
  success:     boolean;
  durationMs?: number;
  timestamp:   Date;
}

// ─── Core write — never throws ────────────────────────────────────────────────

export async function writeBotLog(entry: Omit<BotLogEntry, 'timestamp'>): Promise<void> {
  try {
    const client = await getMongoClient();
    await client.db(DB_NAME).collection(COLL).insertOne({ ...entry, timestamp: new Date() });
  } catch (err) {
    console.error('[logger] Failed to write bot log:', err);
  }
}

// ─── Convenience wrappers ─────────────────────────────────────────────────────

export function logCommand(opts: {
  command:     string;
  userId:      string;
  username:    string;
  channelId:   string;
  success:     boolean;
  detail?:     string;
  durationMs?: number;
}): void {
  writeBotLog({
    type:       'prefix_command',
    event:      opts.command,
    userId:     opts.userId,
    username:   opts.username,
    channelId:  opts.channelId,
    detail:     opts.detail,
    success:    opts.success,
    durationMs: opts.durationMs,
  });
}

export function logAIMention(opts: {
  userId:      string;
  username:    string;
  channelId:   string;
  question:    string;
  success:     boolean;
  durationMs?: number;
  error?:      string;
}): void {
  writeBotLog({
    type:       'ai_mention',
    event:      'AI Q&A',
    userId:     opts.userId,
    username:   opts.username,
    channelId:  opts.channelId,
    detail:     opts.error ?? opts.question.slice(0, 300),
    success:    opts.success,
    durationMs: opts.durationMs,
  });
}

export function logScheduled(opts: {
  jobName:     string;
  channelId:   string;
  success:     boolean;
  detail?:     string;
  durationMs?: number;
}): void {
  writeBotLog({
    type:       'scheduled',
    event:      opts.jobName,
    channelId:  opts.channelId,
    detail:     opts.detail,
    success:    opts.success,
    durationMs: opts.durationMs,
  });
}

export function logError(opts: {
  event:      string;
  error:      unknown;
  userId?:    string;
  username?:  string;
  channelId?: string;
}): void {
  const msg = opts.error instanceof Error ? opts.error.message : String(opts.error);
  writeBotLog({
    type:      'error',
    event:     opts.event,
    userId:    opts.userId,
    username:  opts.username,
    channelId: opts.channelId,
    detail:    msg,
    success:   false,
  });
}