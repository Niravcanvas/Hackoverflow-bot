import { Client, GatewayIntentBits, EmbedBuilder, Message } from 'discord.js';
import dotenv from 'dotenv';
import { setupScheduledMessages } from './utils/scheduler';
import { askLLM, checkGroqHealth, getQueueStats } from './utils/llm';
import hackathonData from './config/hackathon-data.json';

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

  console.log('🔍 Checking Groq API connection...');
  const groqHealthy = await checkGroqHealth();
  if (groqHealthy) {
    console.log('✅ Groq API is accessible');
  } else {
    console.warn('⚠️  Warning: Groq API is not accessible!');
    console.warn('   Check your GROQ_API_KEY in .env file');
  }

  setupScheduledMessages(client);

  console.log('✅ Bot initialization complete!');
  console.log('🚀 Using llama-3.1-8b-instant - 14,400 requests/day!');
  console.log('⚡ Unlimited concurrent requests with smart rate limiting!');
  console.log('════════════════════════════════════════\n');
});

client.on('messageCreate', async (message: Message) => {
  if (message.author.bot) return;

  const botMentioned = message.mentions.has(client.user!);
  if (!botMentioned) return;

  const query = message.content
    .replace(`<@${client.user!.id}>`, '')
    .replace(`<@!${client.user!.id}>`, '')
    .trim();

  if (!query) {
    const embed = new EmbedBuilder()
      .setColor('#FF6B35')
      .setTitle('👋 Hey there! I\'m Kernel v2.0')
      .setDescription(
        'I\'m your AI assistant for HackOverflow 4.0! Just mention me and ask anything!\n\n' +
          '**Examples:**\n' +
          '• @Kernel when is the hackathon?\n' +
          '• @Kernel what\'s the prize pool?\n' +
          '• @Kernel how do I register?\n' +
          '• @Kernel tell me about the schedule\n' +
          '• @Kernel who are the organizers?'
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
    const response = await askLLM(query);

    if (!response || response.trim().length === 0) {
      await message.reply(
        `I couldn't process that question. Please try rephrasing or contact ${hackathonData.contact.email} for assistance.`
      );
      return;
    }

    // Split long responses (Discord 2000 char limit)
    if (response.length > 1900) {
      const chunks = response.match(/[\s\S]{1,1900}/g) || [];
      for (let i = 0; i < chunks.length; i++) {
        await message.reply(chunks[i]);
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    } else {
      await message.reply(response);
    }
  } catch (error: any) {
    console.error('❌ Error processing query:', error);
    
    // Handle specific error types
    if (error.message?.includes('rate limit')) {
      await message.reply(
        `⏱️ We're experiencing high traffic right now. Please try again in a moment, or email ${hackathonData.contact.email} for immediate assistance!`
      );
    } else {
      await message.reply(
        `❌ Sorry, I encountered an error. Please try again or contact ${hackathonData.contact.email} for assistance!`
      );
    }
  }
});

client.on('error', (error) => {
  console.error('❌ Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled promise rejection:', error);
});

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await client.destroy();
  process.exit(0);
});

const token = process.env.DISCORD_BOT_TOKEN;

if (!token) {
  console.error('❌ Error: DISCORD_BOT_TOKEN is not set!');
  process.exit(1);
}

client.login(token).catch((error) => {
  console.error('❌ Failed to login to Discord:', error);
  process.exit(1);
});