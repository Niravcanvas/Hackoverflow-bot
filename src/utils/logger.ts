/**
 * src/utils/logger.ts
 * ───────────────────
 * Writes structured bot events to MongoDB `bot_logs` collection.
 * Uses the same MONGODB_URI + DB as db-config.ts.
 * All writes are fire-and-forget — a logging failure never crashes the bot.
 */

import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI!;
const DB_NAME     = process.env.MONGODB_DB ?? 'hackoverflow';
const COLL        = 'bot_logs';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LogType = 'ai_mention' | 'prefix_command' | 'scheduled' | 'error';

export interface BotLogEntry {
  type:        LogType;
  event:       string;       // e.g. "ho!help", "AI Q&A", "Daily Morning Reminder"
  userId?:     string;       // Discord snowflake
  username?:   string;       // Discord display name
  channelId?:  string;
  detail?:     string;       // question text, error message, etc.
  success:     boolean;
  durationMs?: number;
  timestamp:   Date;
}

// ─── Singleton Mongo client ───────────────────────────────────────────────────
// Separate from db-config.ts so logger is fully self-contained.

let _client: MongoClient | null = null;

async function getClient(): Promise<MongoClient> {
  if (!_client) {
    _client = new MongoClient(MONGODB_URI);
    await _client.connect();
  }
  return _client;
}

// ─── Core write — never throws ────────────────────────────────────────────────

export async function writeBotLog(entry: Omit<BotLogEntry, 'timestamp'>): Promise<void> {
  try {
    const client = await getClient();
    await client.db(DB_NAME).collection(COLL).insertOne({ ...entry, timestamp: new Date() });
  } catch (err) {
    // Never let a logging failure propagate to the bot
    console.error('[logger] Failed to write bot log:', err);
  }
}

// ─── Convenience wrappers ─────────────────────────────────────────────────────

/** Call this for every ho! prefix command (success or failure). */
export function logCommand(opts: {
  command:     string;
  userId:      string;
  username:    string;
  channelId:   string;
  success:     boolean;
  detail?:     string;
  durationMs?: number;
}): void {
  // Fire-and-forget — intentionally not awaited
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

/** Call this for every @mention AI interaction. */
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

/** Call this inside every cron job. */
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

/** Generic error logger — use when you catch something unexpected. */
export function logError(opts: {
  event:       string;
  error:       unknown;
  userId?:     string;
  username?:   string;
  channelId?:  string;
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