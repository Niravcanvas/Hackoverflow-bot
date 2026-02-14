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

// Track active requests for better concurrency handling
const activeRequests = new Map<string, number>();
const MAX_CONCURRENT_REQUESTS_PER_USER = 3;

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
  console.log('💡 Bot is now command-less - AI handles all requests intelligently');
  console.log('════════════════════════════════════════\n');
});

// Helper function to manage concurrent requests
async function handleConcurrentRequest(
  userId: string,
  handler: () => Promise<void>
): Promise<void> {
  const currentRequests = activeRequests.get(userId) || 0;

  if (currentRequests >= MAX_CONCURRENT_REQUESTS_PER_USER) {
    throw new Error('TOO_MANY_CONCURRENT');
  }

  activeRequests.set(userId, currentRequests + 1);

  try {
    await handler();
  } finally {
    const remaining = (activeRequests.get(userId) || 1) - 1;
    if (remaining <= 0) {
      activeRequests.delete(userId);
    } else {
      activeRequests.set(userId, remaining);
    }
  }
}

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

  // Handle concurrent requests per user
  try {
    await handleConcurrentRequest(message.author.id, async () => {
      // Show typing indicator
      if (message.channel.isSendable()) {
        await message.channel.sendTyping();
      }

      try {
        // Get response from AI
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

        // Handle specific error types
        if (error.message === 'RATE_LIMITED') {
          await message.reply(
            '⏳ You\'re asking questions too quickly! Please wait a moment and try again.'
          );
        } else {
          await message.reply(
            `❌ Sorry, I encountered an error processing your question. Please try again or contact ${hackathonData.contact.email} for assistance!`
          );
        }
      }
    });
  } catch (error: any) {
    if (error.message === 'TOO_MANY_CONCURRENT') {
      await message.reply(
        '⚠️ You have too many questions being processed at once. Please wait for your current questions to be answered before asking more.'
      );
    } else {
      console.error('❌ Unexpected error in concurrent handler:', error);
    }
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
  
  // Wait for active requests to complete (with timeout)
  const shutdownTimeout = setTimeout(() => {
    console.log('⚠️ Shutdown timeout reached, forcing exit...');
    process.exit(0);
  }, 10000); // 10 second timeout

  // Check if any requests are still active
  while (activeRequests.size > 0) {
    console.log(`⏳ Waiting for ${activeRequests.size} active request(s) to complete...`);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  clearTimeout(shutdownTimeout);
  console.log('✅ All requests completed, exiting...');
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