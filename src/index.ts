import { Client, GatewayIntentBits, EmbedBuilder, Message } from 'discord.js';
import dotenv from 'dotenv';
import { setupScheduledMessages } from './utils/scheduler';
import { askLLM, checkGroqHealth } from './utils/llm';
import hackathonData from './config/hackathon-data.json';

// Load environment variables
dotenv.config();

// Create Discord client with optimized intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// Bot ready event
client.once('ready', async () => {
  console.log('╔════════════════════════════════════════╗');
  console.log('║      🤖 Kernel Bot is Online! 🤖      ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`📝 Logged in as: ${client.user?.tag}`);
  console.log(`🌐 Serving ${client.guilds.cache.size} server(s)`);
  console.log(`👥 Total members: ${client.users.cache.size}`);
  console.log('');

  // Set bot status
  client.user?.setPresence({
    activities: [{ name: `@mention me for AI help! | HackOverflow 4.0` }],
    status: 'online',
  });

  // Check Groq health
  console.log('🔍 Checking Groq API connection...');
  const groqHealthy = await checkGroqHealth();
  if (groqHealthy) {
    console.log('✅ Groq API is accessible');
  } else {
    console.warn('⚠️  Warning: Groq API is not accessible!');
    console.warn('   Check your GROQ_API_KEY in .env file');
    console.warn('   Get your free API key at: https://console.groq.com');
  }

  // Setup scheduled messages
  setupScheduledMessages(client);

  console.log('✅ Bot initialization complete!');
  console.log('💡 Bot is command-less - AI handles all requests intelligently');
  console.log('🚀 Using llama-3.1-8b-instant - 14,400 requests/day capacity!');
  console.log('⚡ 8 concurrent requests - optimized for token limits!');
  console.log('════════════════════════════════════════\n');
});

// Main message handler - all requests go through AI
client.on('messageCreate', async (message: Message) => {
  // Ignore bot messages
  if (message.author.bot) return;

  // Check if bot is mentioned
  const botMentioned = message.mentions.has(client.user!);

  if (!botMentioned) return;

  // Remove the mention from the message
  const query = message.content
    .replace(`<@${client.user!.id}>`, '')
    .replace(`<@!${client.user!.id}>`, '')
    .trim();

  if (!query) {
    // Send help information when mentioned without a query
    const embed = new EmbedBuilder()
      .setColor('#FF6B35')
      .setTitle('👋 Hey there! I\'m Kernel')
      .setDescription(
        'I\'m your AI assistant for HackOverflow 4.0. Just mention me and ask anything!\n\n' +
          '**Examples:**\n' +
          '• @Kernel when is the hackathon?\n' +
          '• @Kernel what\'s the prize pool?\n' +
          '• @Kernel how do I register?\n' +
          '• @Kernel tell me about the schedule\n' +
          '• @Kernel who are the organizers?\n\n' +
          'I can answer questions about registration, schedule, prizes, team formation, venue, and much more!'
      )
      .addFields(
        {
          name: '📅 Quick Info',
          value: `**Event:** ${hackathonData.dates.event_start} - ${hackathonData.dates.event_end}\n**Prize Pool:** ${hackathonData.statistics.prize_pool}\n**Registration Ends:** ${hackathonData.dates.registration_end}`,
        }
      )
      .setFooter({ text: 'Just ask me anything about HackOverflow 4.0!' })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
    return;
  }

  // Show typing indicator
  if (message.channel.isSendable()) {
    await message.channel.sendTyping();
  }

  try {
    // Get response from AI (queued internally)
    const response = await askLLM(query, message.author.id);

    // Handle empty responses
    if (!response || response.trim().length === 0) {
      await message.reply(
        `I couldn't process that question. Please try rephrasing or contact ${hackathonData.contact.email} for assistance.`
      );
      return;
    }

    // Split long responses if needed (Discord has 2000 char limit)
    if (response.length > 1900) {
      const chunks = response.match(/[\s\S]{1,1900}/g) || [];
      for (const chunk of chunks) {
        await message.reply(chunk);
        // Add small delay between chunks to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } else {
      await message.reply(response);
    }
  } catch (error: any) {
    console.error('❌ Error processing query:', error);
    await message.reply(
      `❌ Sorry, I encountered an error processing your question. Please try again or contact ${hackathonData.contact.email} for assistance!`
    );
  }
});

// Error handling
client.on('error', (error) => {
  console.error('❌ Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled promise rejection:', error);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  console.log('✅ Bot shutting down...');
  await client.destroy();
  process.exit(0);
});

// Login to Discord
const token = process.env.DISCORD_BOT_TOKEN;

if (!token) {
  console.error('❌ Error: DISCORD_BOT_TOKEN is not set in environment variables!');
  process.exit(1);
}

client.login(token).catch((error) => {
  console.error('❌ Failed to login to Discord:', error);
  process.exit(1);
});