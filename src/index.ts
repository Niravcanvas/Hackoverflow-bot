import { Client, GatewayIntentBits, EmbedBuilder, Message } from 'discord.js';
import dotenv from 'dotenv';
import { setupScheduledMessages } from './utils/scheduler';
import { 
  askLLM, 
  checkGroqHealth, 
  loadPersistedQueue, 
  loadConversationCache,
  clearUserConversation,
  getQueueStats 
} from './utils/llm';
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

// Track pending replies (for delayed responses)
const pendingReplies = new Map<string, { channelId: string, userId: string }>();

// Bot ready event
client.once('ready', async () => {
  console.log('╔════════════════════════════════════════╗');
  console.log('║  🤖 Kernel Bot v2.0 is Online! 🤖    ║');
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

  // Load persisted queue and conversation cache
  console.log('💾 Loading persisted data...');
  await loadPersistedQueue();
  await loadConversationCache();

  // Setup scheduled messages
  setupScheduledMessages(client);

  console.log('✅ Bot initialization complete!');
  console.log('💡 Enhanced features enabled:');
  console.log('   ✓ Persistent message queue');
  console.log('   ✓ Conversation memory (30 min cache)');
  console.log('   ✓ Automatic retry on failures');
  console.log('   ✓ Smart context selection');
  console.log('🚀 Using llama-3.1-8b-instant - 14,400 requests/day!');
  console.log('⚡ 12 concurrent requests with intelligent token optimization!');
  console.log('🧠 Remembers conversation context across messages!');
  console.log('════════════════════════════════════════\n');
});

// Main message handler - all requests go through AI with queue persistence
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

  // Handle special commands
  if (query.toLowerCase() === 'clear' || query.toLowerCase() === 'reset') {
    clearUserConversation(message.author.id, message.channel.id);
    await message.reply('✅ Conversation history cleared! Starting fresh.');
    return;
  }

  if (query.toLowerCase() === 'stats' || query.toLowerCase() === 'status') {
    const stats = getQueueStats();
    const embed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('📊 Bot Statistics')
      .addFields(
        { name: 'Queue Length', value: stats.queueLength.toString(), inline: true },
        { name: 'Active Requests', value: stats.activeRequests.toString(), inline: true },
        { name: 'Total Requests', value: stats.totalRequests.toString(), inline: true },
        { name: 'Success Rate', value: stats.successRate, inline: true },
        { name: 'Cached Responses', value: stats.cachedResponses.toString(), inline: true },
        { name: 'Active Conversations', value: stats.conversationsActive.toString(), inline: true }
      )
      .setTimestamp();
    
    await message.reply({ embeds: [embed] });
    return;
  }

  if (!query) {
    // Send help information when mentioned without a query
    const embed = new EmbedBuilder()
      .setColor('#FF6B35')
      .setTitle('👋 Hey there! I\'m Kernel v2.0')
      .setDescription(
        'I\'m your AI assistant for HackOverflow 4.0 with enhanced memory! Just mention me and ask anything!\n\n' +
          '**Examples:**\n' +
          '• @Kernel when is the hackathon?\n' +
          '• @Kernel what\'s the prize pool?\n' +
          '• @Kernel how do I register?\n' +
          '• @Kernel tell me about the schedule\n' +
          '• @Kernel who are the organizers?\n\n' +
          '**Special Commands:**\n' +
          '• @Kernel clear - Clear conversation history\n' +
          '• @Kernel stats - Show bot statistics\n\n' +
          '**New Features:**\n' +
          '💬 I remember our conversation for 30 minutes!\n' +
          '📝 Your questions are queued and will be answered even if delayed\n' +
          '🔄 Automatic retries on failures'
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

  // Send acknowledgment for queued requests
  const queuePosition = getQueueStats().queueLength;
  let ackMessage = null;
  
  if (queuePosition > 3) {
    ackMessage = await message.reply(
      `⏳ Your question is queued (position ${queuePosition + 1}). I'll respond as soon as possible!`
    );
  }

  try {
    // Get response from AI (queued internally with persistence)
    const response = await askLLM(
      query, 
      message.author.id,
      message.channel.id,
      message.id
    );

    // Delete acknowledgment if it was sent
    if (ackMessage) {
      try {
        await ackMessage.delete();
      } catch (e) {
        // Ignore deletion errors
      }
    }

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
    
    // Delete acknowledgment if it was sent
    if (ackMessage) {
      try {
        await ackMessage.delete();
      } catch (e) {
        // Ignore deletion errors
      }
    }
    
    await message.reply(
      `❌ Sorry, I encountered an error processing your question. Your request has been saved and will be retried automatically. If this persists, contact ${hackathonData.contact.email} for assistance!`
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
  console.log('💾 Queue and conversations will be saved automatically');
  console.log('✅ Bot shutting down...');
  await client.destroy();
  // LLM module will auto-save on SIGINT
  setTimeout(() => process.exit(0), 2000);
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