import Groq from "groq-sdk";
import hackathonData from '../config/hackathon-data.json';

// Lazy initialization - create client when first needed
let groq: Groq | null = null;

function getGroqClient(): Groq {
  if (!groq) {
    groq = new Groq({
      apiKey: process.env.GROQ_API_KEY || '',
    });
  }
  return groq;
}

// Enhanced rate limiting with per-user tracking
interface UserRateLimit {
  timestamps: number[];
  blockedUntil?: number;
}

const userRateLimits = new Map<string, UserRateLimit>();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10; // 10 requests per minute per user
const COOLDOWN_BETWEEN_REQUESTS_MS = 3000; // 3 seconds between requests

function checkRateLimit(userId: string): { allowed: boolean; waitTime?: number } {
  const now = Date.now();
  const userLimit = userRateLimits.get(userId) || { timestamps: [] };

  // Check if user is temporarily blocked
  if (userLimit.blockedUntil && now < userLimit.blockedUntil) {
    const waitTime = Math.ceil((userLimit.blockedUntil - now) / 1000);
    return { allowed: false, waitTime };
  }

  // Remove timestamps outside the window
  userLimit.timestamps = userLimit.timestamps.filter(
    (ts) => now - ts < RATE_LIMIT_WINDOW_MS
  );

  // Check if user exceeded rate limit
  if (userLimit.timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    const oldestTimestamp = Math.min(...userLimit.timestamps);
    const waitTime = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - oldestTimestamp)) / 1000);
    userLimit.blockedUntil = now + (waitTime * 1000);
    userRateLimits.set(userId, userLimit);
    return { allowed: false, waitTime };
  }

  // Check cooldown between requests
  if (userLimit.timestamps.length > 0) {
    const lastRequest = Math.max(...userLimit.timestamps);
    if (now - lastRequest < COOLDOWN_BETWEEN_REQUESTS_MS) {
      const waitTime = Math.ceil((COOLDOWN_BETWEEN_REQUESTS_MS - (now - lastRequest)) / 1000);
      return { allowed: false, waitTime };
    }
  }

  // Allow request and record timestamp
  userLimit.timestamps.push(now);
  userRateLimits.set(userId, userLimit);

  // Cleanup old entries (prevent memory leak)
  if (userRateLimits.size > 5000) {
    const entries = Array.from(userRateLimits.entries());
    const expiredUsers = entries
      .filter(([_, limit]) => {
        const latestTimestamp = Math.max(...limit.timestamps, 0);
        return now - latestTimestamp > RATE_LIMIT_WINDOW_MS * 2;
      })
      .map(([userId]) => userId);
    
    expiredUsers.forEach((userId) => userRateLimits.delete(userId));
  }

  return { allowed: true };
}

export async function askLLM(userQuery: string, userId?: string): Promise<string> {
  // Check rate limit per user
  if (userId) {
    const rateLimitCheck = checkRateLimit(userId);
    
    if (!rateLimitCheck.allowed) {
      throw new Error('RATE_LIMITED');
    }
  }

  try {
    const systemPrompt = `You are Kernel, the official AI assistant for HackOverflow 4.0, a national-level hackathon at PHCET. You help participants with any questions about the event in a friendly, professional, and intelligent manner.

HACKATHON DATA:
${JSON.stringify(hackathonData, null, 2)}

YOUR CAPABILITIES:
- Answer ALL questions about the hackathon: schedule, registration, prizes, venue, team formation, facilities, perks, organizers, etc.
- Provide information from the data intelligently without needing specific command keywords
- Understand natural language queries and context
- Handle multiple types of questions in a single response if asked
- Be conversational and helpful

RESPONSE GUIDELINES:
1. **Be Direct & Concise**: Answer exactly what was asked in 1-3 sentences for simple questions
2. **Natural Conversation**: Write like a helpful human, not a robotic assistant
3. **Smart Formatting**: Use bullet points or lists ONLY when presenting multiple items (e.g., schedule, team members, FAQs)
4. **Minimal Emojis**: Use 1-2 emojis max, only when they add clarity or friendliness
5. **Professional Tone**: Maintain professionalism while being warm and approachable
6. **Accurate Data**: Only provide information from the hackathon data provided
7. **Handle Missing Info**: If data is missing, acknowledge it briefly and provide contact: hackoverflow@mes.ac.in
8. **No Overexplaining**: Don't add extra context unless specifically asked

SPECIFIC HANDLING:
- **Schedule queries**: Present day-by-day breakdown with times
- **Team queries**: List team members with their roles
- **Registration**: Mention deadline (Jan 31, 2026), fee (Rs 500/member), team size (3-4 members)
- **Theme**: Note it will be announced closer to event, but participants can start with any domain
- **Who are you**: "I'm Kernel, your AI assistant for HackOverflow 4.0"
- **Multiple questions**: Address each question in order, use clear formatting

EXAMPLES:
User: "when is the hackathon?"
You: "HackOverflow 4.0 is from March 11-13, 2026 - a 36-hour coding marathon at PHCET Campus, Rasayani! 🚀"

User: "what's the prize pool and how do i register?"
You: "The prize pool is ₹100,000+ with cash prizes for top 3 teams and goodies for top 10! 🏆

To register:
- Visit the official website before January 31, 2026
- Registration fee: Rs 500 per team member
- Team size: 3-4 members
- Submit your project idea during registration"

User: "tell me about day 2 schedule"
You: "Here's the Day 2 (March 12) schedule:

• 8:00 AM - Breakfast
• 9:00 AM - Coding continues
• 11:00 AM - Evaluation Round 1
• 1:00 PM - Lunch
• 2:00 PM - Coding continues
• 5:00 PM - Evaluation Round 2
• 8:00 PM - Dinner
• 10:00 PM - Jamming Session
• 11:00 PM - Late night coding continues"

Remember: Be smart, be helpful, be human!`;

    const client = getGroqClient();
    const chatCompletion = await client.chat.completions.create({
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userQuery,
        },
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.6,
      max_tokens: 800,
      top_p: 0.9,
    });

    const response = chatCompletion.choices[0]?.message?.content || '';
    
    if (!response) {
      return 'Sorry, I could not generate a response. Please try again.';
    }

    return response.trim();
  } catch (error: any) {
    console.error('❌ Error calling Groq:', error);
    
    // Handle specific Groq API errors
    if (error?.status === 429) {
      return 'The AI service is experiencing high traffic. Please wait a moment and try again. ⏳';
    }
    
    if (error?.status === 401) {
      console.error('⚠️ Invalid Groq API key!');
      return 'AI service configuration error. Please contact hackoverflow@mes.ac.in for assistance.';
    }

    if (error?.status === 503) {
      return 'The AI service is temporarily unavailable. Please try again in a moment.';
    }
    
    // Generic error
    throw error;
  }
}

// Health check function with retry logic
export async function checkGroqHealth(): Promise<boolean> {
  const maxRetries = 3;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      if (!process.env.GROQ_API_KEY) {
        return false;
      }
      
      const client = getGroqClient();
      await client.chat.completions.create({
        messages: [{ role: "user", content: "ping" }],
        model: "llama-3.3-70b-versatile",
        max_tokens: 5,
      });
      
      return true;
    } catch (error: any) {
      retries++;
      console.error(`Groq health check attempt ${retries}/${maxRetries} failed:`, error.message);
      
      if (retries < maxRetries) {
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retries)));
      }
    }
  }
  
  return false;
}

// Export rate limit stats for monitoring
export function getRateLimitStats() {
  return {
    totalUsers: userRateLimits.size,
    activeUsers: Array.from(userRateLimits.entries()).filter(([_, limit]) => {
      const now = Date.now();
      return limit.timestamps.some(ts => now - ts < RATE_LIMIT_WINDOW_MS);
    }).length,
  };
}