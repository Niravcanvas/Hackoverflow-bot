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

// Rate limiting configuration
const COOLDOWN_MS = 5000; // 5 seconds per user
const MAX_CONCURRENT_REQUESTS = 5; // Max concurrent API calls
const REQUEST_TIMEOUT_MS = 30000; // 30 second timeout

// Per-user rate limiting
const userCooldowns = new Map<string, number>();

// Request queue for load balancing
interface QueuedRequest {
  resolve: (value: string) => void;
  reject: (error: Error) => void;
  userQuery: string;
  userId?: string;
}

const requestQueue: QueuedRequest[] = [];
let activeRequests = 0;

// Process queued requests
async function processQueue(): Promise<void> {
  while (requestQueue.length > 0 && activeRequests < MAX_CONCURRENT_REQUESTS) {
    const request = requestQueue.shift();
    if (!request) continue;

    activeRequests++;
    
    // Process request with timeout
    const timeoutPromise = new Promise<string>((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), REQUEST_TIMEOUT_MS);
    });

    const requestPromise = executeGroqRequest(request.userQuery);

    try {
      const response = await Promise.race([requestPromise, timeoutPromise]);
      request.resolve(response);
    } catch (error) {
      request.reject(error as Error);
    } finally {
      activeRequests--;
      // Process next request in queue
      processQueue();
    }
  }
}

// Execute actual Groq API request
async function executeGroqRequest(userQuery: string): Promise<string> {
  const systemPrompt = `You are Kernel, the official AI assistant for HackOverflow 4.0. You help participants with questions about the hackathon in a friendly and professional manner.

HACKATHON INFORMATION:
${JSON.stringify(hackathonData, null, 2)}

INSTRUCTIONS:
- Provide clear, direct answers based on the hackathon data above
- Keep responses concise and conversational - answer only what was asked
- Use 1-2 sentences for simple questions, expand only when necessary
- Write in a professional but natural tone, as if you're having a real conversation
- Avoid unnecessary emojis - use sparingly (max 1-2 per response, only when it adds value)
- If information is missing from the data, briefly acknowledge it and provide the contact email: hackoverflow@mes.ac.in
- For registration questions, mention the January 31, 2026 deadline
- For theme questions, note it will be announced closer to the event date
- Don't over-explain or add extra encouragement unless specifically asked
- Focus on answering the specific question asked, not everything about the hackathon
- Use proper grammar and maintain a professional tone throughout
- When users ask who you are, introduce yourself as "Kernel, your AI assistant for HackOverflow 4.0"
- For team-related questions, provide names and roles from the team data
- Always format responses clearly with line breaks where appropriate`;

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
    temperature: 0.5,
    max_tokens: 500,
  });

  const response = chatCompletion.choices[0]?.message?.content || '';
  
  if (!response) {
    throw new Error('Empty response from API');
  }

  return response.trim();
}

// Main LLM function with queue and rate limiting
export async function askLLM(userQuery: string, userId?: string): Promise<string> {
  // Check per-user rate limit
  if (userId) {
    const now = Date.now();
    const lastRequest = userCooldowns.get(userId);
    
    if (lastRequest && (now - lastRequest) < COOLDOWN_MS) {
      const waitTime = Math.ceil((COOLDOWN_MS - (now - lastRequest)) / 1000);
      return `⏱️ Please wait ${waitTime} second${waitTime > 1 ? 's' : ''} before asking another question.`;
    }
    
    userCooldowns.set(userId, now);
    
    // Cleanup old entries (prevent memory leak)
    if (userCooldowns.size > 1000) {
      const oldestKeys = Array.from(userCooldowns.keys()).slice(0, 100);
      oldestKeys.forEach(key => userCooldowns.delete(key));
    }
  }

  // Check queue size
  if (requestQueue.length >= 50) {
    return '🚦 The system is currently busy. Please try again in a moment.';
  }

  // Add request to queue and return promise
  return new Promise<string>((resolve, reject) => {
    requestQueue.push({
      resolve: (response: string) => resolve(response),
      reject: (error: Error) => {
        console.error('❌ Error in queued request:', error);
        
        // Handle specific error types
        if (error.message === 'Request timeout') {
          resolve('⏱️ The request took too long. Please try again.');
        } else if (error.message.includes('429')) {
          resolve('🚦 Too many requests. Please wait a moment and try again.');
        } else if (error.message.includes('401')) {
          console.error('⚠️ Invalid Groq API key!');
          resolve('⚠️ AI service configuration error. Please contact hackoverflow@mes.ac.in');
        } else {
          resolve('❌ The AI service is temporarily unavailable. Please try again in a moment.');
        }
      },
      userQuery,
      userId,
    });

    // Start processing queue
    processQueue();
  });
}

// Health check function
export async function checkGroqHealth(): Promise<boolean> {
  try {
    if (!process.env.GROQ_API_KEY) {
      return false;
    }
    
    const client = getGroqClient();
    // Simple check - try to create a completion
    await client.chat.completions.create({
      messages: [{ role: "user", content: "test" }],
      model: "llama-3.3-70b-versatile",
      max_tokens: 1,
    });
    
    return true;
  } catch (error) {
    console.error('Groq health check failed:', error);
    return false;
  }
}

// Export queue stats for monitoring
export function getQueueStats(): { queueLength: number; activeRequests: number } {
  return {
    queueLength: requestQueue.length,
    activeRequests,
  };
}