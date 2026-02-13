# HackOverflow 4.0 Discord Bot

<div align="center">

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Discord](https://img.shields.io/badge/Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white)
![Groq](https://img.shields.io/badge/Groq-000000?style=for-the-badge&logo=groq&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)

**AI-powered Discord bot for HackOverflow 4.0**

[Features](#features) • [Quick Start](#quick-start) • [Commands](#commands) • [Deployment](#deployment)

</div>

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Commands](#commands)
- [Scheduled Messages](#scheduled-messages)
- [Deployment](#deployment)
- [Development](#development)
- [Troubleshooting](#troubleshooting)

---

## Overview

HackOverflow Bot is an intelligent Discord assistant built for the HackOverflow 4.0 hackathon. It combines Discord.js with Groq's free AI API to provide instant answers about the event and schedule automated announcements.

**Event Details:**
- Date: March 11-13, 2026 (36 hours)
- Location: PHCET Campus, Rasayani, Maharashtra
- Prize Pool: ₹100,000+
- Expected Participants: 250+

---

## Features

### AI-Powered Q&A
- Natural language understanding using Groq's LLaMA 3.3 70B model
- Instant answers about hackathon details, registration, and schedule
- Context-aware responses from `hackathon-data.json`
- Rate limiting: 1 query per 5 seconds per user

### Prefix Commands
- `ho!help` - Show help guide
- `ho!schedule` - View 3-day event timeline
- `ho!faq` - Frequently asked questions
- `ho!team` - Meet the organizing team
- `ho!register` - Registration information
- `ho!stats` - Event statistics
- `ho!about` - About HackOverflow 4.0

### Automated Scheduling
- Daily morning reminders (9:00 AM)
- Weekly updates (Mondays 10:00 AM)
- Registration deadline warnings
- Event day announcements
- All messages pull data from `hackathon-data.json`

---

## Tech Stack

| Technology | Purpose |
|------------|---------|
| TypeScript | Type-safe development |
| Discord.js v14 | Discord API interaction |
| Groq SDK | Free AI completions |
| Node-cron | Scheduled messages |
| Docker | Containerization |

---

## Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn
- Discord Bot Token
- Groq API Key (free at console.groq.com)
- Docker (optional, for deployment)

---

## Quick Start

### 1. Clone the Repository
```bash
git clone https://github.com/YOUR_USERNAME/hackoverflow-bot.git
cd hackoverflow-bot
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Set Up Environment Variables
```bash
cp .env.example .env
```

Edit `.env` and add:
```env
DISCORD_BOT_TOKEN=your_discord_bot_token
GROQ_API_KEY=your_groq_api_key
ANNOUNCEMENTS_CHANNEL_ID=your_channel_id
NODE_ENV=development
```

### 4. Build and Run
```bash
# Development mode
npm run dev

# Production
npm run build
npm start
```

### 5. Invite Bot to Server

1. Go to Discord Developer Portal
2. Select your application → OAuth2 → URL Generator
3. Select scopes: `bot`, `applications.commands`
4. Select permissions: `Send Messages`, `Embed Links`, `Read Message History`
5. Copy URL and authorize bot to your server

---

## Configuration

### Discord Bot Token

1. Go to Discord Developer Portal
2. Create New Application → Name it "HackOverflow Bot"
3. Go to Bot tab → Reset Token → Copy token
4. Enable Privileged Gateway Intents:
   - Presence Intent
   - Server Members Intent
   - Message Content Intent
5. Paste token in `.env` file

### Groq API Key

1. Go to console.groq.com
2. Sign up (free)
3. Create API key
4. Paste in `.env` file

**Groq Free Tier:**
- 30 requests/minute
- 14,400 requests/day
- No credit card required

### Channel ID for Announcements

1. Enable Developer Mode in Discord
2. Right-click the announcements channel
3. Copy Channel ID
4. Paste in `ANNOUNCEMENTS_CHANNEL_ID`

---

## Commands

### Prefix Commands

All commands use the `ho!` prefix to avoid conflicts with other bots.

| Command | Description |
|---------|-------------|
| `ho!help` | Show all commands and features |
| `ho!schedule` | View 3-day event timeline |
| `ho!faq` | Common questions and answers |
| `ho!team` | Meet organizing team |
| `ho!register` | Registration details |
| `ho!stats` | Event statistics |
| `ho!about` | About HackOverflow 4.0 |

### AI Mention Commands

Mention the bot with your question:
```
@HackOverflow Bot when is the hackathon?
@HackOverflow Bot how do I register?
@HackOverflow Bot what's the prize pool?
```

**Rate Limit:** 1 question per 5 seconds per user

---

## Scheduled Messages

Automatic announcements sent to configured channel. All messages dynamically pull data from `hackathon-data.json`.

| Schedule | Time | Description |
|----------|------|-------------|
| Daily | 9:00 AM | Morning reminder |
| Weekly | Monday 10:00 AM | Weekly update |
| 7 days before registration | 6:00 PM | Deadline warning |
| Registration deadline day | 9:00 AM, 6:00 PM | Final reminders |
| Day before event | 6:00 PM | Event prep reminder |
| Event day | 8:00 AM | Kickoff announcement |

### Customizing Schedules

Edit `src/utils/scheduler.ts`:

```typescript
{
  cronExpression: '0 9 * * *', // Every day at 9 AM
  channelId: process.env.ANNOUNCEMENTS_CHANNEL_ID || '',
  description: 'Daily morning reminder',
  message: () => {
    const { name, dates, statistics } = hackathonData;
    return new EmbedBuilder()
      .setColor('#FF6B35')
      .setTitle('Good Morning, Hackers!')
      .setDescription(`${name} is coming soon!`)
      .addFields(
        { name: 'Event Dates', value: `${dates.event_start} - ${dates.event_end}` }
      );
  }
}
```

**Cron Syntax:**
```
* * * * *
│ │ │ │ │
│ │ │ │ └─ Day of week (0-7)
│ │ │ └─── Month (1-12)
│ │ └───── Day of month (1-31)
│ └─────── Hour (0-23)
└───────── Minute (0-59)
```

---

## Deployment

### Option 1: Local with PM2
```bash
npm run build
npm install -g pm2
pm2 start dist/index.js --name hackoverflow-bot
pm2 save
pm2 startup
```

### Option 2: Docker
```bash
# Build image
docker build -t hackoverflow-bot .

# Run container
docker run -d \
  --name hackoverflow-bot \
  --env-file .env \
  --restart unless-stopped \
  hackoverflow-bot
```

### Option 3: Docker Compose
```bash
# Start
docker-compose up -d

# View logs
docker-compose logs -f hackoverflow-bot

# Stop
docker-compose down
```

### Option 4: Coolify

1. Push to GitHub
2. In Coolify Dashboard: New Resource → Docker Compose
3. Connect repository
4. Set compose file: `docker-compose.coolify.yml`
5. Add environment variables
6. Deploy

---

## Development

### Project Setup
```bash
npm install
npm run dev
```

### Project Structure
```
hackoverflow-bot/
├── src/
│   ├── config/
│   │   └── hackathon-data.json    # Event data
│   ├── utils/
│   │   ├── llm.ts                 # Groq AI integration
│   │   └── scheduler.ts           # Cron jobs
│   ├── index.ts                   # Main bot logic
│   └── test-env.ts                # Environment validator
├── dist/                          # Compiled JavaScript
├── .env                           # Environment variables
├── .env.example                   # Template
├── package.json
├── tsconfig.json
├── Dockerfile
└── docker-compose.yml
```

### Adding New Commands

Edit `src/index.ts`:

```typescript
async function handleYourCommand(message: Message): Promise<void> {
  const embed = new EmbedBuilder()
    .setColor('#FF6B35')
    .setTitle('Your Command Title')
    .setDescription('Your description');
  
  await message.reply({ embeds: [embed] });
}

// Add to switch statement
case 'yourcommand':
  await handleYourCommand(message);
  break;
```

### Updating Hackathon Data

Edit `src/config/hackathon-data.json`:

```json
{
  "name": "HackOverflow 4.0",
  "dates": {
    "event_start": "March 11, 2026",
    "event_end": "March 13, 2026"
  },
  "statistics": {
    "prize_pool": "₹100,000+",
    "expected_hackers": "250+"
  }
}
```

Updates to this file automatically reflect in:
- AI responses
- Scheduled messages
- Command outputs

---

## Troubleshooting

### Bot is Offline

Check if bot is running:
```bash
ps aux | grep node
# or
docker-compose logs -f hackoverflow-bot
```

### Invalid Token Error

- Verify `DISCORD_BOT_TOKEN` in `.env`
- Remove extra spaces
- Regenerate token if needed

### Groq API Errors

**401 Unauthorized:**
- Check `GROQ_API_KEY` is correct
- Verify at console.groq.com

**429 Rate Limited:**
- Wait 1 minute and try again
- Users are rate-limited to 1 query per 5 seconds
- Free tier: 30 requests/minute

### Bot Doesn't Respond to Mentions

- Verify `Message Content Intent` is enabled
- Check bot has channel permissions:
  - Send Messages
  - Embed Links
  - Read Message History

### Scheduled Messages Not Sending

- Set `ANNOUNCEMENTS_CHANNEL_ID` in `.env`
- Verify bot has permissions in that channel
- Check cron expressions in `src/utils/scheduler.ts`
- Ensure `hackathon-data.json` is valid JSON

### TypeScript Errors

Clean build:
```bash
rm -rf dist node_modules
npm install
npm run build
```

### Property Does Not Exist Error

Check destructuring from `hackathon-data.json`:

```typescript
// Wrong - expected_hackers is not at top level
const { name, expected_hackers } = hackathonData;

// Correct - access from statistics object
const { name, statistics } = hackathonData;
// Then use: statistics.expected_hackers
```

---

## Performance

**Resource Usage:**
- RAM: ~100-150 MB
- CPU: <1% idle
- Network: ~1-5 MB/day

**Groq API Limits (Free Tier):**
- 30 requests/minute
- 14,400 requests/day

---

## Documentation

- [Discord.js Guide](https://discordjs.guide/)
- [Groq Documentation](https://console.groq.com/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Node-cron Documentation](https://www.npmjs.com/package/node-cron)

<div align="center">

**Made with TypeScript, Discord.js, and Groq AI**

</div>