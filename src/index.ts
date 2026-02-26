import { Client, GatewayIntentBits, EmbedBuilder, Message } from 'discord.js';
import dotenv from 'dotenv';
import { setupScheduledMessages } from './utils/scheduler';
import { askLLM, checkGroqHealth } from './utils/llm';
import { getHackathonData } from './config/db-config';
import { logCommand, logAIMention, logError } from './utils/logger';
import { startHeartbeat } from './utils/heartbeat';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

client.once('ready', async () => {
  console.log('╔════════════════════════════════════════╗');
  console.log('║  🤖 Kernel Bot v2.0 is Online! 🤖    ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`📝 Logged in as: ${client.user?.tag}`);
  console.log(`🌐 Serving ${client.guilds.cache.size} server(s)`);
  console.log(`👥 Total members: ${client.users.cache.size}`);
  console.log('');

  client.user?.setPresence({
    activities: [{ name: `@mention me for AI help! | HackOverflow 4.0` }],
    status: 'online',
  });

  console.log('🗄️  Loading config from MongoDB...');
  try {
    const data = await getHackathonData();
    console.log(`✅ Config loaded: ${data.name}`);
  } catch {
    console.warn('⚠️  Could not load config from MongoDB — will retry on first request');
  }

  console.log('🔍 Checking Groq API connection...');
  const groqHealthy = await checkGroqHealth();
  if (groqHealthy) {
    console.log('✅ Groq API is accessible');
  } else {
    console.warn('⚠️  Warning: Groq API is not accessible!');
    console.warn('   Check your GROQ_API_KEY in .env file');
  }

  setupScheduledMessages(client);
  startHeartbeat(client);

  console.log('✅ Bot initialization complete!');
  console.log('🚀 Using llama-3.1-8b-instant - 14,400 requests/day!');
  console.log('⚡ Unlimited concurrent requests with smart rate limiting!');
  console.log('════════════════════════════════════════\n');
});

// ─── Message handler ──────────────────────────────────────────────────────────

client.on('messageCreate', async (message: Message) => {
  if (message.author.bot) return;

  const PREFIX      = 'ho!';
  const botMentioned = message.mentions.has(client.user!);
  const isPrefixCmd  = message.content.toLowerCase().startsWith(PREFIX);

  // ── Prefix commands ────────────────────────────────────────────────────────
  if (isPrefixCmd) {
    const args    = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const command = args.shift()?.toLowerCase() ?? '';
    const start   = Date.now();
    let   success = true;
    let   detail: string | undefined;

    try {
      switch (command) {
        case 'help':     await handleHelp(message);     break;
        case 'schedule': await handleSchedule(message); break;
        case 'faq':      await handleFaq(message);      break;
        case 'team':     await handleTeam(message);     break;
        case 'register': await handleRegister(message); break;
        case 'stats':    await handleStats(message);    break;
        case 'about':    await handleAbout(message);    break;
        default:
          success = false;
          detail  = `Unknown command: ${command}`;
          break;
      }
    } catch (err) {
      success = false;
      detail  = err instanceof Error ? err.message : String(err);
      logError({
        event:     `ho!${command}`,
        error:     err,
        userId:    message.author.id,
        username:  message.author.username,
        channelId: message.channelId,
      });
      throw err;
    } finally {
      logCommand({
        command:    `ho!${command}`,
        userId:     message.author.id,
        username:   message.author.username,
        channelId:  message.channelId,
        success,
        detail,
        durationMs: Date.now() - start,
      });
    }
    return;
  }

  // ── AI mention ─────────────────────────────────────────────────────────────
  if (!botMentioned) return;

  const query = message.content
    .replace(`<@${client.user!.id}>`, '')
    .replace(`<@!${client.user!.id}>`, '')
    .trim();

  // Empty mention — show welcome embed
  if (!query) {
    try {
      const hackathonData = await getHackathonData();
      const embed = new EmbedBuilder()
        .setColor('#FF6B35')
        .setTitle("👋 Hey there! I'm Kernel v2.0")
        .setDescription(
          "I'm your AI assistant for HackOverflow 4.0! Just mention me and ask anything!\n\n" +
          '**Examples:**\n' +
          '• @Kernel when is the hackathon?\n' +
          "• @Kernel what's the prize pool?\n" +
          '• @Kernel how do I register?\n' +
          '• @Kernel tell me about the schedule\n' +
          '• @Kernel who are the organizers?'
        )
        .addFields({
          name: '📅 Quick Info',
          value:
            `**Event:** ${hackathonData.dates?.event_start} - ${hackathonData.dates?.event_end}\n` +
            `**Prize Pool:** ${hackathonData.statistics?.prize_pool}\n` +
            `**Registration Ends:** ${hackathonData.dates?.registration_end}`,
        })
        .setFooter({ text: 'Just ask me anything about HackOverflow 4.0!' })
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch {
      await message.reply("Hey! I'm Kernel, your HackOverflow 4.0 assistant. Ask me anything about the event!");
    }
    return;
  }

  // Show typing indicator
  if (message.channel.isSendable()) {
    await message.channel.sendTyping();
  }

  const start   = Date.now();
  let   success = true;
  let   aiError: string | undefined;

  try {
    const response = await askLLM(query);

    if (!response || response.trim().length === 0) {
      const data = await getHackathonData();
      await message.reply(
        `I couldn't process that question. Please try rephrasing or contact ${data.contact?.email} for assistance.`
      );
      success = false;
      aiError = 'Empty response from LLM';
      return;
    }

    // Split long responses (Discord 2000 char limit)
    if (response.length > 1900) {
      const chunks = response.match(/[\s\S]{1,1900}/g) || [];
      for (let i = 0; i < chunks.length; i++) {
        await message.reply(chunks[i]);
        if (i < chunks.length - 1) await new Promise(resolve => setTimeout(resolve, 500));
      }
    } else {
      await message.reply(response);
    }

  } catch (error: unknown) {
    success = true; // already handled gracefully below, not a hard failure
    const err = error as { message?: string };
    console.error('❌ Error processing query:', error);

    aiError = err?.message ?? String(error);

    const data = await getHackathonData().catch(() => ({ contact: { email: 'hackoverflow@mes.ac.in' } }));
    if (err?.message?.includes('rate limit')) {
      await message.reply(
        `⏱️ We're experiencing high traffic right now. Please try again in a moment, or email ${data.contact?.email} for immediate assistance!`
      );
    } else {
      success = false;
      await message.reply(
        `❌ Sorry, I encountered an error. Please try again or contact ${data.contact?.email} for assistance!`
      );
    }
  } finally {
    logAIMention({
      userId:     message.author.id,
      username:   message.author.username,
      channelId:  message.channelId,
      question:   query,
      success,
      durationMs: Date.now() - start,
      error:      aiError,
    });
  }
});

// ─── Command handlers ─────────────────────────────────────────────────────────

async function handleHelp(message: Message): Promise<void> {
  const embed = new EmbedBuilder()
    .setColor('#FF6B35')
    .setTitle('🤖 Kernel Bot Commands')
    .setDescription('Here are all available commands:')
    .addFields(
      { name: 'ho!help',     value: 'Show this help message',            inline: true },
      { name: 'ho!schedule', value: 'View 3-day event timeline',         inline: true },
      { name: 'ho!faq',      value: 'Frequently asked questions',        inline: true },
      { name: 'ho!team',     value: 'Meet the organizing team',          inline: true },
      { name: 'ho!register', value: 'Registration information',          inline: true },
      { name: 'ho!stats',    value: 'Event statistics',                  inline: true },
      { name: 'ho!about',    value: 'About HackOverflow 4.0',            inline: true },
      { name: '💬 AI Chat',  value: 'Mention @Kernel and ask anything!', inline: false },
    )
    .setFooter({ text: 'HackOverflow 4.0 — Powered by Kernel AI' })
    .setTimestamp();
  await message.reply({ embeds: [embed] });
}

async function handleSchedule(message: Message): Promise<void> {
  try {
    const { schedule, dates } = await getHackathonData();
    const embed = new EmbedBuilder()
      .setColor('#4ECDC4')
      .setTitle('📅 HackOverflow 4.0 Schedule')
      .setDescription(`${dates?.event_start} – ${dates?.event_end}`)
      .setTimestamp();

    if (schedule) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Object.entries(schedule).forEach(([day, events]: [string, any]) => {
        if (Array.isArray(events)) {
          embed.addFields({
            name:  day.replace(/_/g, ' ').toUpperCase(),
            value: events.map((e: { time?: string; activity?: string }) => `**${e.time ?? ''}** — ${e.activity ?? ''}`).join('\n') || 'TBA',
          });
        }
      });
    }
    await message.reply({ embeds: [embed] });
  } catch {
    await message.reply('Schedule information is not available right now. Please check back later!');
  }
}

async function handleFaq(message: Message): Promise<void> {
  try {
    const { faqs } = await getHackathonData();
    const embed = new EmbedBuilder()
      .setColor('#9B59B6')
      .setTitle('❓ Frequently Asked Questions')
      .setTimestamp();
    if (Array.isArray(faqs)) {
      faqs.slice(0, 5).forEach((f: { question?: string; answer?: string }) => {
        embed.addFields({ name: f.question ?? 'Q', value: f.answer ?? 'TBA' });
      });
    }
    await message.reply({ embeds: [embed] });
  } catch {
    await message.reply('FAQ information is not available right now.');
  }
}

async function handleTeam(message: Message): Promise<void> {
  try {
    const { team } = await getHackathonData();
    const embed = new EmbedBuilder()
      .setColor('#E74C3C')
      .setTitle('👥 Organizing Team')
      .setTimestamp();
    if (team?.leads && Array.isArray(team.leads)) {
      embed.addFields({
        name:  'Leads',
        value: team.leads.map((l: { name?: string; role?: string }) => `**${l.name}** — ${l.role ?? ''}`).join('\n') || 'TBA',
      });
    }
    if (team?.faculty_coordinators && Array.isArray(team.faculty_coordinators)) {
      embed.addFields({
        name:  'Faculty Coordinators',
        value: team.faculty_coordinators.map((f: { name?: string }) => f.name).join(', ') || 'TBA',
      });
    }
    await message.reply({ embeds: [embed] });
  } catch {
    await message.reply('Team information is not available right now.');
  }
}

async function handleRegister(message: Message): Promise<void> {
  try {
    const { registration, dates } = await getHackathonData();
    const embed = new EmbedBuilder()
      .setColor('#2ECC71')
      .setTitle('📝 Registration Info')
      .addFields(
        { name: 'Deadline',   value: dates?.registration_end ?? 'TBA',          inline: true },
        { name: 'Team Size',  value: registration?.team_size ?? 'TBA',           inline: true },
        { name: 'Fee',        value: registration?.fee ?? 'Free',                inline: true },
        { name: 'How to Register', value: registration?.link ?? 'Visit our website' },
      )
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  } catch {
    await message.reply('Registration info is not available right now.');
  }
}

async function handleStats(message: Message): Promise<void> {
  try {
    const { statistics } = await getHackathonData();
    const embed = new EmbedBuilder()
      .setColor('#F39C12')
      .setTitle('📊 Event Statistics')
      .addFields(
        { name: 'Prize Pool',        value: statistics?.prize_pool ?? 'TBA',          inline: true },
        { name: 'Expected Hackers',  value: statistics?.expected_hackers ?? 'TBA',    inline: true },
        { name: 'Duration',          value: statistics?.duration ?? 'TBA',            inline: true },
      )
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  } catch {
    await message.reply('Stats information is not available right now.');
  }
}

async function handleAbout(message: Message): Promise<void> {
  try {
    const { name, tagline, about, organizer } = await getHackathonData();
    const embed = new EmbedBuilder()
      .setColor('#1ABC9C')
      .setTitle(`About ${name}`)
      .setDescription(tagline ?? '')
      .addFields(
        { name: 'Organizer', value: organizer ?? 'PHCET' },
        { name: 'About',     value: (typeof about === 'string' ? about : JSON.stringify(about ?? '')).slice(0, 1024) },
      )
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  } catch {
    await message.reply('About information is not available right now.');
  }
}

// ─── Error / shutdown handlers ────────────────────────────────────────────────

client.on('error', (error) => {
  console.error('❌ Discord client error:', error);
  logError({ event: 'discord_client_error', error });
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled promise rejection:', error);
  logError({ event: 'unhandled_rejection', error });
});

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await client.destroy();
  process.exit(0);
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  console.error('❌ Error: DISCORD_BOT_TOKEN is not set!');
  process.exit(1);
}

client.login(token).catch((error) => {
  console.error('❌ Failed to login to Discord:', error);
  process.exit(1);
});