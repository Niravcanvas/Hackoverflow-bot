import { Client, GatewayIntentBits, EmbedBuilder, Message } from 'discord.js';
import dotenv from 'dotenv';
import { setupScheduledMessages } from './utils/scheduler';
import { askLLM, checkGroqHealth } from './utils/llm';
import hackathonData from './config/hackathon-data.json';

// Load environment variables
dotenv.config();

// Command prefix (unique to avoid conflicts with other bots)
const PREFIX = 'ho!';

// Create Discord client
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
  console.log(`🎯 Command prefix: ${PREFIX}`);
  console.log('');

  // Set bot status
client.user?.setPresence({
  activities: [{ name: `${PREFIX}help | @mention me for AI help!` }],
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
  console.log('════════════════════════════════════════\n');
});

// Handle command functions
async function handleScheduleCommand(message: Message): Promise<void> {
  const { schedule } = hackathonData;
  
  const embed = new EmbedBuilder()
    .setColor('#FF6B35')
    .setTitle('🤖 Kernel Bot - Help Guide')
    .setDescription('Hey there! I\'m your HackOverflow assistant. Here\'s how to use me:')
    .addFields(
      {
        name: '💬 Ask Me Anything (AI-Powered)',
        value: 'Just mention me (@Kernel) and ask your question!\nExample: `@Kernel when is the hackathon?`',
      },
      {
        name: `📍 Day 2 - ${schedule.day2.date} (Mid-Evaluation)`,
        value: schedule.day2.events.map(e => `• ${e.time} - ${e.event}`).join('\n'),
      },
      {
        name: `📍 Day 3 - ${schedule.day3.date} (Grand Finale)`,
        value: schedule.day3.events.map(e => `• ${e.time} - ${e.event}`).join('\n'),
      }
    )
    .setFooter({ text: `${hackathonData.statistics.duration} of non-stop innovation!` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

async function handleFaqCommand(message: Message): Promise<void> {
  const { faqs, contact } = hackathonData;
  
  const embed = new EmbedBuilder()
    .setColor('#FF6B35')
    .setTitle('❓ Frequently Asked Questions')
    .setDescription('Quick answers to common questions')
    .addFields(
      ...faqs.map(faq => ({
        name: `🎯 ${faq.question}`,
        value: faq.answer
      })),
      { name: '📧 More questions?', value: `Email: ${contact.email}` }
    )
    .setFooter({ text: 'Need more help? Just ask me!' })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

async function handleTeamCommand(message: Message): Promise<void> {
  const { team } = hackathonData;
  
  const embed = new EmbedBuilder()
    .setColor('#9B59B6')
    .setTitle('👥 HackOverflow 4.0 Team')
    .setDescription('Meet the amazing people making this happen!')
    .addFields(
      {
        name: '🎯 Event Leads',
        value: team.leads.map(l => `• ${l.name}`).join('\n'),
        inline: true,
      },
      {
        name: '👨‍🏫 Faculty Coordinators',
        value: team.faculty_coordinators.map(f => `• ${f.name}`).join('\n'),
        inline: true,
      },
      {
        name: '⚡ Department Heads',
        value: team.heads.map(h => `• ${h.role}: ${h.name}`).join('\n'),
      }
    )
    .setFooter({ text: 'A dedicated team working to make HackOverflow amazing!' })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

async function handleRegisterCommand(message: Message): Promise<void> {
  const { dates, statistics, contact } = hackathonData;
  
  const embed = new EmbedBuilder()
    .setColor('#00FF00')
    .setTitle('📝 Register for HackOverflow 4.0!')
    .setDescription(`Join ${statistics.expected_hackers} hackers in this epic coding marathon!`)
    .addFields(
      { name: '📅 Registration Deadline', value: dates.registration_end, inline: true },
      { name: '🎯 Event Dates', value: `${dates.event_start} - ${dates.event_end}`, inline: true },
      { name: '💰 Prize Pool', value: statistics.prize_pool, inline: true },
      {
        name: '🔗 How to Register',
        value: 'Visit the official website and fill out the registration form!',
      },
      { name: '✅ What You Need', value: '• Team of 2-4 members\n• Valid student ID\n• Passion for coding!' },
      { name: '📧 Questions?', value: `Contact: ${contact.email}` }
    )
    .setFooter({ text: 'Register early - Limited spots available!' })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

async function handleStatsCommand(message: Message): Promise<void> {
  const { statistics, project_categories } = hackathonData;
  
  const categoriesText = Object.entries(project_categories)
    .map(([cat, pct]) => `• ${cat} (${pct})`)
    .join('\n');
  
  const embed = new EmbedBuilder()
    .setColor('#E74C3C')
    .setTitle('📊 HackOverflow Statistics')
    .setDescription('Our track record speaks for itself!')
    .addFields(
      { name: '🏆 Prize Pool', value: statistics.prize_pool, inline: true },
      { name: '👥 Expected Hackers', value: statistics.expected_hackers, inline: true },
      { name: '⏰ Duration', value: statistics.duration, inline: true },
      { name: '🎓 Colleges Represented', value: `${statistics.previous_stats.colleges}`, inline: true },
      { name: '🌍 States', value: `${statistics.previous_stats.states_represented}+ states`, inline: true },
      { name: '🎯 Completion Rate', value: statistics.previous_stats.completion_rate, inline: true },
      {
        name: '📁 Project Categories',
        value: categoriesText,
      },
      { name: '⭐ Participant Satisfaction', value: statistics.previous_stats.satisfaction }
    )
    .setFooter({ text: 'Be part of this amazing event!' })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

async function handleAboutCommand(message: Message): Promise<void> {
  const { name, tagline, type, organizer, location, dates, statistics } = hackathonData;
  
  const embed = new EmbedBuilder()
    .setColor('#3498DB')
    .setTitle(`ℹ️ About ${name}`)
    .setDescription(tagline)
    .addFields(
      { name: '🎯 What is it?', value: `A ${type.toLowerCase()} bringing together the best tech minds` },
      { name: '🏢 Organized by', value: organizer },
      { name: '📍 Location', value: `${location.venue}, ${location.address}` },
      { name: '📅 When', value: `${dates.event_start} - ${dates.event_end} (${dates.duration_hours} hours)` },
      {
        name: '💡 Domains',
        value: 'AI/ML, Blockchain, Web3, IoT, Web Development, and more!',
      },
      { name: '🎁 What You Get', value: `${statistics.prize_pool} prizes, networking, mentorship, learning, and fun!` }
    )
    .setFooter({ text: 'We don\'t just write code; we build the future!' })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

async function handleHelpCommand(message: Message): Promise<void> {
  const { dates } = hackathonData;
  
  const embed = new EmbedBuilder()
    .setColor('#FF6B35')
    .setTitle('🤖 HackOverflow Bot - Help Guide')
    .setDescription('Hey there! I\'m your HackOverflow assistant. Here\'s how to use me:')
    .addFields(
      {
        name: '💬 Ask Me Anything (AI-Powered)',
        value: 'Just mention me (@HackOverflow Bot) and ask your question!\nExample: `@bot when is the hackathon?`',
      },
      {
        name: '📝 Available Commands',
        value:
          `\`${PREFIX}schedule\` - View the 3-day event schedule\n` +
          `\`${PREFIX}faq\` - Frequently asked questions\n` +
          `\`${PREFIX}team\` - Meet the organizing team\n` +
          `\`${PREFIX}register\` - Registration information\n` +
          `\`${PREFIX}stats\` - Event statistics\n` +
          `\`${PREFIX}about\` - About HackOverflow 4.0\n` +
          `\`${PREFIX}help\` - Show this help message`,
      },
      {
        name: '✨ Smart Features',
        value: 'I use AI to answer your questions! Ask me anything about:\n' +
          '• Event details and schedule\n' +
          '• Registration process\n' +
          '• Prizes and perks\n' +
          '• Venue and travel\n' +
          '• Team formation\n' +
          '• And much more!',
      },
      {
        name: '🎯 Command Prefix',
        value: `This bot uses \`${PREFIX}\` to avoid conflicts with other bots!`,
      },
      {
        name: '📧 Need More Help?',
        value: `Email: ${hackathonData.contact.email}`,
      }
    )
    .setFooter({ text: `HackOverflow 4.0 | ${dates.event_start} - ${dates.event_end}` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

// Main message handler
client.on('messageCreate', async (message: Message) => {
  // Ignore bot messages
  if (message.author.bot) return;

  // Check if bot is mentioned (AI responses)
  const botMentioned = message.mentions.has(client.user!);

  if (botMentioned) {
    // Remove the mention from the message
    const query = message.content.replace(`<@${client.user!.id}>`, '').trim();

    if (!query) {
      await handleHelpCommand(message);
      return;
    }

    // Show typing indicator
    if (message.channel.isSendable()) {
      await message.channel.sendTyping();
    }

    try {
      // Get response from LLM
      const response = await askLLM(query, message.author.id);

      // Split long responses if needed (Discord has 2000 char limit)
      if (response.length > 1900) {
        const chunks = response.match(/[\s\S]{1,1900}/g) || [];
        for (const chunk of chunks) {
          await message.reply(chunk);
        }
      } else {
        await message.reply(response);
      }
    } catch (error) {
      console.error('❌ Error processing query:', error);
      await message.reply(
        `❌ Sorry, I encountered an error processing your question. Please try again or contact ${hackathonData.contact.email} for assistance!`
      );
    }
    return;
  }

  // Handle prefix commands (ho!command)
  if (message.content.startsWith(PREFIX)) {
    const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const command = args[0].toLowerCase();

    switch (command) {
      case 'schedule':
        await handleScheduleCommand(message);
        break;

      case 'faq':
        await handleFaqCommand(message);
        break;

      case 'team':
        await handleTeamCommand(message);
        break;

      case 'register':
        await handleRegisterCommand(message);
        break;

      case 'stats':
        await handleStatsCommand(message);
        break;

      case 'about':
        await handleAboutCommand(message);
        break;

      case 'help':
        await handleHelpCommand(message);
        break;

      default:
        // Unknown command - show help
        await message.reply(`❓ Unknown command. Use \`${PREFIX}help\` to see available commands!`);
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