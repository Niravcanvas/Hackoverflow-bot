import { getMongoClient } from './mongo';

const DB_NAME    = process.env.MONGODB_DB || 'hackoverflow';
const COLLECTION = 'bot_config';
const DOC_ID     = 'hackathon-data';

// ─── In-memory cache (60 s TTL) ──────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedData: any = null;
let cacheTime = 0;
const CACHE_TTL_MS = 60_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getHackathonData(): Promise<any> {
  const now = Date.now();
  if (cachedData && now - cacheTime < CACHE_TTL_MS) return cachedData;

  const client = await getMongoClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = await client.db(DB_NAME).collection(COLLECTION).findOne({ _id: DOC_ID as any });

  if (!doc) {
    throw new Error(
      '[BotConfig] No config found in MongoDB. Seed it from the admin dashboard first.'
    );
  }

  const { _id, updatedAt, updatedBy, __v, ...data } = doc as Record<string, unknown>;
  void _id; void updatedAt; void updatedBy;

  cachedData = data;
  cacheTime  = now;
  console.log(`[BotConfig] Loaded config v${__v ?? '?'} from MongoDB`);
  return cachedData;
}

export function invalidateCache(): void {
  cachedData = null;
  cacheTime  = 0;
}