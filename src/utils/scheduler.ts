import cron from 'node-cron';
import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import { ObjectId } from 'mongodb';
import { getMongoClient } from '../config/mongo';
import { getHackathonData } from '../config/db-config';
import { logScheduled, logError } from './logger';

const DB_NAME    = process.env.MONGODB_DB ?? 'hackoverflow';
const SCHED_COLL = 'scheduled_messages';

// ─── Hardcoded messages ───────────────────────────────────────────────────────

interface HardcodedMessage {
  cronExpression: string;
  channelId:      string;
  description:    string;
  message:        () => Promise<EmbedBuilder> | EmbedBuilder | string;
}

const hardcodedMessages: HardcodedMessage[] = [
  {
    cronExpression: '0 9 * * *',
    channelId:      process.env.ANNOUNCEMENTS_CHANNEL_ID || '',
    description:    'Daily Morning Reminder',
    message: async () => {
      const { name, dates, statistics } = await getHackathonData();
      return new EmbedBuilder()
        .setColor('#FF6B35')
        .setTitle('Good Morning, Hackers!')
        .setDescription(`${name} is coming soon! Have you registered yet?`)
        .addFields(
          { name: 'Event Dates',           value: `${dates.event_start} - ${dates.event_end}`, inline: true },
          { name: 'Registration Deadline', value: dates.registration_end,                       inline: true },
          { name: 'Prize Pool',            value: statistics.prize_pool,                        inline: true },
        )
        .setFooter({ text: 'Register now!' })
        .setTimestamp();
    },
  },
  {
    cronExpression: '0 10 * * 1',
    channelId:      process.env.ANNOUNCEMENTS_CHANNEL_ID || '',
    description:    'Weekly Monday Reminder',
    message: async () => {
      const { name, dates, statistics, contact } = await getHackathonData();
      return new EmbedBuilder()
        .setColor('#4ECDC4')
        .setTitle(`Week Reminder: ${name}`)
        .setDescription("Don't miss out on India's premier student hackathon!")
        .addFields(
          { name: 'What to expect', value: `${dates.duration_hours} hours of coding, networking, and innovation` },
          { name: 'Prize Pool',     value: `${statistics.prize_pool} up for grabs` },
          { name: 'Networking',     value: `Connect with ${statistics.expected_hackers} hackers from ${statistics.previous_stats?.colleges} colleges` },
          { name: 'Questions?',     value: `Email us at ${contact.email}` },
        )
        .setTimestamp();
    },
  },
  {
    cronExpression: '0 18 24 1 *',
    channelId:      process.env.ANNOUNCEMENTS_CHANNEL_ID || '',
    description:    'Registration Deadline Warning (7 days)',
    message: async () => {
      const { name, dates } = await getHackathonData();
      return new EmbedBuilder()
        .setColor('#FFA500')
        .setTitle('URGENT: 7 Days Until Registration Closes!')
        .setDescription(`Time is running out to register for ${name}!`)
        .addFields(
          { name: 'Deadline',        value: dates.registration_end, inline: true },
          { name: 'Time Left',       value: '7 DAYS',               inline: true },
          { name: 'Action Required', value: 'Register your team NOW!' },
        )
        .setFooter({ text: "Don't miss this opportunity!" })
        .setTimestamp();
    },
  },
  {
    cronExpression: '0 9,18 31 1 *',
    channelId:      process.env.ANNOUNCEMENTS_CHANNEL_ID || '',
    description:    'Registration Final Day Reminder',
    message: async () => {
      const { name } = await getHackathonData();
      return new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('LAST DAY TO REGISTER!')
        .setDescription(`TODAY is your final chance to register for ${name}!`)
        .addFields(
          { name: 'Deadline', value: 'TONIGHT at 11:59 PM' },
          { name: 'Act Now',  value: 'This is your last chance!' },
          { name: 'Register', value: 'Visit the official website immediately!' },
        )
        .setFooter({ text: 'Registration closes in hours!' })
        .setTimestamp();
    },
  },
  {
    cronExpression: '0 18 10 3 *',
    channelId:      process.env.ANNOUNCEMENTS_CHANNEL_ID || '',
    description:    'Day Before Event Reminder',
    message: async () => {
      const { name, dates, location } = await getHackathonData();
      return new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle(`TOMORROW: ${name} Begins!`)
        .setDescription(`Get ready for ${dates.duration_hours} hours of innovation and collaboration!`)
        .addFields(
          { name: 'Date',          value: `${dates.event_start} - ${dates.event_end}` },
          { name: 'Check-in',      value: 'Tomorrow at 11:00 AM' },
          { name: 'Venue',         value: `${location.venue}, ${location.address}` },
          { name: 'What to bring', value: 'Laptop, charger, ID, enthusiasm!' },
          { name: 'Pro tip',       value: "Get a good night's sleep!" },
        )
        .setTimestamp();
    },
  },
  {
    cronExpression: '0 8 11 3 *',
    channelId:      process.env.ANNOUNCEMENTS_CHANNEL_ID || '',
    description:    'Event Day Kickoff Announcement',
    message: async () => {
      const { name, location } = await getHackathonData();
      return new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle(`IT'S HAPPENING! ${name} Day 1!`)
        .setDescription('Good morning! Today marks the beginning of an amazing journey!')
        .addFields(
          { name: 'Check-in',         value: '11:00 AM onwards' },
          { name: 'Opening Ceremony', value: '2:00 PM' },
          { name: 'Hacking Starts',   value: '5:00 PM' },
          { name: 'Get Ready',        value: `See you soon at ${location.venue}!` },
        )
        .setFooter({ text: 'Let the innovation begin!' })
        .setTimestamp();
    },
  },
];

// ─── Dynamic task registry ────────────────────────────────────────────────────

const dynamicTasks = new Map<string, ReturnType<typeof cron.schedule>>();

// ─── Send a dynamic DB message ────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fireDynamic(discordClient: Client, doc: Record<string, any>): Promise<void> {
  const start   = Date.now();
  let   success = true;
  let   detail: string | undefined;

  try {
    const channel = await discordClient.channels.fetch(doc.channelId as string);
    if (!channel || !channel.isTextBased()) throw new Error('Invalid or non-text channel');
    const textChannel = channel as TextChannel;

    if (doc.messageFormat === 'embed' && doc.embedTitle) {
      const embed = new EmbedBuilder()
        .setColor((doc.embedColor ?? '#FF6B35') as `#${string}`)
        .setTitle(doc.embedTitle as string)
        .setDescription(doc.content as string)
        .setTimestamp();
      await textChannel.send({ embeds: [embed] });
    } else {
      await textChannel.send(doc.content as string);
    }

    const mongo  = await getMongoClient();
    const update =
      doc.scheduleType === 'once'
        ? { $set: { sent: true, lastSentAt: new Date() }, $inc: { sentCount: 1 } }
        : { $set: { lastSentAt: new Date() }, $inc: { sentCount: 1 } };

    await mongo.db(DB_NAME).collection(SCHED_COLL).updateOne(
      { _id: new ObjectId(doc._id) }, update
    );

    if (doc.scheduleType === 'once') {
      dynamicTasks.get(doc._id.toString())?.stop();
      dynamicTasks.delete(doc._id.toString());
    }

    console.log(`✅ Dynamic message sent: "${doc.name}"`);
  } catch (err) {
    success = false;
    detail  = err instanceof Error ? err.message : String(err);
    console.error(`❌ Dynamic message failed: "${doc.name}"`, err);
    logError({ event: `[custom] ${doc.name}`, error: err, channelId: doc.channelId as string });
  } finally {
    logScheduled({
      jobName:    `[custom] ${doc.name as string}`,
      channelId:  doc.channelId as string,
      success,
      detail,
      durationMs: Date.now() - start,
    });
  }
}

// ─── Sync dynamic messages from MongoDB ──────────────────────────────────────

async function syncDynamicMessages(discordClient: Client): Promise<void> {
  try {
    const mongo = await getMongoClient();
    const docs  = await mongo
      .db(DB_NAME)
      .collection(SCHED_COLL)
      .find({ active: true, $or: [{ scheduleType: 'recurring' }, { scheduleType: 'once', sent: { $ne: true } }] })
      .toArray();

    const activeIds = new Set(docs.map(d => d._id.toString()));

    for (const [id, task] of dynamicTasks) {
      if (!activeIds.has(id)) {
        task.stop();
        dynamicTasks.delete(id);
        console.log(`[scheduler] Stopped dynamic task ${id}`);
      }
    }

    for (const doc of docs) {
      const id = doc._id.toString();

      if (doc.scheduleType === 'once') {
        if (new Date(doc.sendAt as Date) <= new Date()) {
          await fireDynamic(discordClient, doc as Record<string, unknown>);
        }
        continue;
      }

      if (doc.scheduleType === 'recurring') {
        if (dynamicTasks.has(id)) continue;
        if (!cron.validate(doc.cronExpression as string)) {
          console.error(`[scheduler] Invalid cron for "${doc.name}": ${doc.cronExpression}`);
          continue;
        }
        const task = cron.schedule(doc.cronExpression as string, () => {
          fireDynamic(discordClient, doc as Record<string, unknown>);
        });
        dynamicTasks.set(id, task);
        console.log(`[scheduler] Registered dynamic task "${doc.name}" (${doc.cronExpression})`);
      }
    }
  } catch (err) {
    console.error('[scheduler] syncDynamicMessages error:', err);
  }
}

// ─── Setup entry point ────────────────────────────────────────────────────────

export function setupScheduledMessages(discordClient: Client): void {
  console.log('Setting up scheduled messages...');

  hardcodedMessages.forEach((item) => {
    if (!cron.validate(item.cronExpression)) {
      console.error(`❌ Invalid cron expression: ${item.cronExpression}`);
      return;
    }

    cron.schedule(item.cronExpression, async () => {
      console.log(`⏰ Running: ${item.description}`);
      const channelId = item.channelId;
      const start     = Date.now();
      let   success   = true;
      let   detail: string | undefined;

      if (!channelId) {
        logError({ event: item.description, error: 'No ANNOUNCEMENTS_CHANNEL_ID configured' });
        return;
      }

      try {
        const channel = await discordClient.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) throw new Error('Invalid or non-text channel');
        const built = await item.message();
        if (typeof built === 'string') {
          await (channel as TextChannel).send(built);
        } else {
          await (channel as TextChannel).send({ embeds: [built] });
        }
        console.log(`✅ Sent: ${item.description}`);
      } catch (err) {
        success = false;
        detail  = err instanceof Error ? err.message : String(err);
        logError({ event: item.description, error: err, channelId });
      } finally {
        logScheduled({ jobName: item.description, channelId, success, detail, durationMs: Date.now() - start });
      }
    });

    console.log(`✅ Scheduled: ${item.description} (${item.cronExpression})`);
  });

  syncDynamicMessages(discordClient);
  setInterval(() => syncDynamicMessages(discordClient), 60_000);
  console.log('🔄 Dynamic message sync started (every 60s)');
  console.log(`Hardcoded tasks registered: ${hardcodedMessages.length}`);
}