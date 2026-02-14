import { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes,
  ChatInputCommandInteraction,
  SlashCommandBuilder
} from 'discord.js';
import dotenv from 'dotenv';
import { setupScheduledMessages } from './utils/scheduler';
import { askLLM, checkGroqHealth } from './utils/llm';
import hackathonData from './config/hackathon-data.json';

// Load environment variables
dotenv.config();

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Define slash command
const commands = [
  new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask Kernel anything about HackOverflow 4.0')
    .addStringOption(option =>
      option
        .setName('question')
        .setDescription('Your question about the hackathon')
        .setRequired(true)
    ),
].map(command => command.toJSON());

// Register slash commands
async function registerCommands() {
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN!);
    
    console.log('🔄 Registering slash commands...');
    
    await rest.put(
      Routes.applicationCommands(process.env.DISCORD_CLIENT_ID!),
      { body: commands }
    );
    
    console.log('✅ Slash commands registered successfully!');
  } catch (error) {
    console.error('❌ Error registering commands:', error);
  }
}

// Bot ready event
client.once('ready', async () => {
  console.log('╔════════════════════════════════════════╗');
  console.log('║      🤖 Kernel Bot is Online! 🤖      ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`📝 Logged in as: ${client.user?.tag}`);
  console.log(`🌐 Serving ${client.guilds.cache.size} server(s)`);
  console.log('');

  // Set bot status
  client.user?.setPresence({
    activities: [{ name: 'Use /ask to get help! 🚀' }],
    status: 'online',
  });

  // Register slash commands
  await registerCommands();

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

// Handle slash commands
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName === 'ask') {
    await handleAskCommand(interaction);
  }
});

// Handle /ask command
async function handleAskCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const question = interaction.options.getString('question', true);
  const userId = interaction.user.id;

  // Defer reply as ephemeral (only visible to user)
  await interaction.deferReply({ ephemeral: true });

  try {
    // Get response from LLM with load balancing
    const response = await askLLM(question, userId);

    // Split long responses if needed (Discord has 2000 char limit)
    if (response.length > 1900) {
      const chunks = response.match(/[\s\S]{1,1900}/g) || [];
      
      if (chunks.length > 0) {
        // Send first chunk as reply
        await interaction.editReply(chunks[0]!);
        
        // Send remaining chunks as follow-ups (also ephemeral)
        for (let i = 1; i < chunks.length; i++) {
          await interaction.followUp({ 
            content: chunks[i]!,
            ephemeral: true 
          });
        }
      } else {
        // Fallback if chunking fails
        await interaction.editReply(response.substring(0, 1900));
      }
    } else {
      await interaction.editReply(response);
    }
  } catch (error) {
    console.error('❌ Error processing query:', error);
    await interaction.editReply(
      `❌ Sorry, I encountered an error processing your question. Please try again or contact ${hackathonData.contact.email} for assistance!`
    );
  }
}

// Error handling
client.on('error', (error) => {
  console.error('❌ Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled promise rejection:', error);
});

// Login to Discord
const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;

if (!token) {
  console.error('❌ Error: DISCORD_BOT_TOKEN is not set in environment variables!');
  process.exit(1);
}

if (!clientId) {
  console.error('❌ Error: DISCORD_CLIENT_ID is not set in environment variables!');
  console.error('   Get your Client ID from Discord Developer Portal > Your App > General Information');
  process.exit(1);
}

client.login(token).catch((error) => {
  console.error('❌ Failed to login to Discord:', error);
  process.exit(1);
});