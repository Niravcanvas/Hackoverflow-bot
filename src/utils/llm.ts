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

// Request queue for better concurrency handling
interface QueuedRequest {
  resolve: (value: string) => void;
  reject: (error: Error) => void;
  userQuery: string;
  userId?: string;
}

const requestQueue: QueuedRequest[] = [];
let isProcessing = false;
const MAX_CONCURRENT_GROQ_REQUESTS = 50; // Process up to 50 requests concurrently
let activeGroqRequests = 0;

// Statistics tracking
let totalRequests = 0;
let successfulRequests = 0;
let failedRequests = 0;

async function processQueue() {
  if (isProcessing || requestQueue.length === 0) return;
  
  isProcessing = true;

  while (requestQueue.length > 0 && activeGroqRequests < MAX_CONCURRENT_GROQ_REQUESTS) {
    const request = requestQueue.shift();
    if (!request) break;

    activeGroqRequests++;
    
    // Process request without blocking the queue
    processGroqRequest(request.userQuery, request.userId)
      .then(response => {
        request.resolve(response);
        successfulRequests++;
      })
      .catch(error => {
        request.reject(error);
        failedRequests++;
      })
      .finally(() => {
        activeGroqRequests--;
        processQueue(); // Continue processing queue
      });
  }

  isProcessing = false;
}

async function processGroqRequest(userQuery: string, userId?: string): Promise<string> {
  totalRequests++;

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
    console.error('Error details:', {
      status: error?.status,
      message: error?.message,
      error: error?.error,
    });
    
    // Handle specific Groq API errors
    if (error?.status === 429) {
      console.error('⚠️ Groq rate limit hit! Check your API key limits at https://console.groq.com');
      return 'Sorry, the AI service has reached its rate limit. This usually means:\n• The API key needs to be checked\n• Free tier limits were exceeded\nPlease contact hackoverflow@mes.ac.in for assistance.';
    }
    
    if (error?.status === 401) {
      console.error('⚠️ Invalid Groq API key!');
      return 'AI service authentication failed. Please contact hackoverflow@mes.ac.in for assistance.';
    }

    if (error?.status === 403) {
      console.error('⚠️ Groq API access forbidden!');
      return 'AI service access denied. Please contact hackoverflow@mes.ac.in for assistance.';
    }

    if (error?.status === 503) {
      return 'The AI service is temporarily unavailable. Please try again in a moment.';
    }
    
    // Log full error for debugging
    console.error('Full error object:', JSON.stringify(error, null, 2));
    
    // Generic error
    return `Sorry, I encountered an error: ${error?.message || 'Unknown error'}. Please contact hackoverflow@mes.ac.in for assistance.`;
  }
}

// Main function - adds request to queue
export async function askLLM(userQuery: string, userId?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    requestQueue.push({
      resolve,
      reject,
      userQuery,
      userId,
    });
    
    // Start processing queue
    processQueue();
  });
}

// Health check function with retry logic
export async function checkGroqHealth(): Promise<boolean> {
  // Don't do aggressive health checks - they use up quota
  const maxRetries = 1; // Reduced from 3
  let retries = 0;

  while (retries < maxRetries) {
    try {
      if (!process.env.GROQ_API_KEY) {
        console.error('❌ No GROQ_API_KEY found in environment!');
        return false;
      }
      
      console.log('Testing Groq API with key:', process.env.GROQ_API_KEY.substring(0, 20) + '...');
      
      const client = getGroqClient();
      await client.chat.completions.create({
        messages: [{ role: "user", content: "hi" }],
        model: "llama-3.3-70b-versatile",
        max_tokens: 10,
      });
      
      return true;
    } catch (error: any) {
      retries++;
      console.error(`Groq health check attempt ${retries}/${maxRetries} failed:`, error.message);
      console.error('Error status:', error?.status);
      console.error('Error details:', error?.error);
      
      if (retries < maxRetries) {
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retries)));
      }
    }
  }
  
  return false;
}

// Export statistics for monitoring
export function getQueueStats() {
  return {
    queueLength: requestQueue.length,
    activeRequests: activeGroqRequests,
    maxConcurrent: MAX_CONCURRENT_GROQ_REQUESTS,
    totalRequests,
    successfulRequests,
    failedRequests,
    successRate: totalRequests > 0 ? ((successfulRequests / totalRequests) * 100).toFixed(2) + '%' : '0%',
  };
}

// Log stats periodically for monitoring
setInterval(() => {
  const stats = getQueueStats();
  if (stats.queueLength > 0 || stats.activeRequests > 0) {
    console.log('📊 Queue Stats:', JSON.stringify(stats, null, 2));
  }
}, 30000); // Log every 30 seconds if there's activity