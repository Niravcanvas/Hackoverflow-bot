import Groq from "groq-sdk";
import { selectRelevantContext, formatContextForPrompt, getMinimalSystemPrompt } from './context-selector';

// Lazy initialization
let groq: Groq | null = null;

function getGroqClient(): Groq {
  if (!groq) {
    groq = new Groq({
      apiKey: process.env.GROQ_API_KEY || '',
    });
  }
  return groq;
}

// Simple in-memory stats (no disk I/O)
let totalRequests = 0;
let successfulRequests = 0;
let failedRequests = 0;
let activeRequests = 0;

// Rate limiting protection (not bottleneck - just safety)
const SAFETY_MAX_CONCURRENT = 100; // Very high limit
const requestTimestamps: number[] = [];
const RATE_WINDOW_MS = 60000; // 1 minute
const MAX_REQUESTS_PER_MINUTE = 250; // ~14,400/day = 240/min, with buffer

/**
 * Check if we should rate limit (soft limit, not hard block)
 */
function shouldRateLimit(): boolean {
  const now = Date.now();
  
  // Clean old timestamps
  while (requestTimestamps.length > 0 && requestTimestamps[0] < now - RATE_WINDOW_MS) {
    requestTimestamps.shift();
  }
  
  return requestTimestamps.length >= MAX_REQUESTS_PER_MINUTE;
}

/**
 * Record request timestamp
 */
function recordRequest(): void {
  requestTimestamps.push(Date.now());
}

/**
 * Main LLM function - direct processing, no queue
 */
export async function askLLM(userQuery: string): Promise<string> {
  // Soft rate limit check
  if (shouldRateLimit()) {
    console.warn(`⚠️ Soft rate limit hit: ${requestTimestamps.length} requests in last minute`);
    throw new Error('rate limit');
  }
  
  // Hard concurrent limit check
  if (activeRequests >= SAFETY_MAX_CONCURRENT) {
    console.warn(`⚠️ Too many concurrent requests: ${activeRequests}`);
    await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
  }

  activeRequests++;
  totalRequests++;
  recordRequest();

  try {
    const response = await processGroqRequest(userQuery);
    successfulRequests++;
    return response;
  } catch (error) {
    failedRequests++;
    throw error;
  } finally {
    activeRequests--;
  }
}

/**
 * Process Groq request with smart context selection
 */
async function processGroqRequest(userQuery: string): Promise<string> {
  try {
    // Smart context selection (reduces token usage massively)
    const contextData = selectRelevantContext(userQuery);
    const contextString = formatContextForPrompt(contextData);
    const basePrompt = getMinimalSystemPrompt();
    const systemPrompt = `${basePrompt}\n\n${contextString}`;

    console.log(`📊 [${new Date().toISOString()}] Query: "${userQuery.substring(0, 50)}..." | Topics: ${contextData.detectedTopics.join(', ')}`);

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
        }
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.6,
      max_tokens: 600,
      top_p: 0.9,
    });

    const response = chatCompletion.choices[0]?.message?.content || '';
    
    if (!response) {
      return 'Sorry, I could not generate a response. Please try again.';
    }

    return response.trim();
  } catch (error: any) {
    console.error('❌ Groq API error:', error?.message || error);
    
    // Handle specific Groq errors
    if (error?.status === 413 || error?.error?.type === 'tokens') {
      return 'Sorry, your question is too complex. Please try asking in a simpler way!';
    }
    
    if (error?.status === 429) {
      console.error('⚠️ Groq rate limit reached!');
      throw new Error('rate limit');
    }
    
    if (error?.status === 401 || error?.status === 403) {
      console.error('⚠️ Groq API authentication failed!');
      return 'AI service authentication failed. Please contact hackoverflow@mes.ac.in.';
    }

    if (error?.status === 503 || error?.status === 502) {
      return 'The AI service is temporarily unavailable. Please try again in a moment.';
    }
    
    // Generic error
    throw error;
  }
}

/**
 * Health check
 */
export async function checkGroqHealth(): Promise<boolean> {
  try {
    if (!process.env.GROQ_API_KEY) {
      console.error('❌ No GROQ_API_KEY found!');
      return false;
    }
    
    const client = getGroqClient();
    await client.chat.completions.create({
      messages: [{ role: "user", content: "test" }],
      model: "llama-3.1-8b-instant",
      max_tokens: 10,
    });
    
    return true;
  } catch (error: any) {
    console.error('Health check failed:', error?.message);
    return false;
  }
}

/**
 * Get simple stats
 */
export function getQueueStats() {
  return {
    activeRequests,
    totalRequests,
    successfulRequests,
    failedRequests,
    successRate: totalRequests > 0 ? ((successfulRequests / totalRequests) * 100).toFixed(2) + '%' : '0%',
    requestsLastMinute: requestTimestamps.length,
  };
}

// Log stats every minute
setInterval(() => {
  if (totalRequests > 0) {
    const stats = getQueueStats();
    console.log(`📊 Stats: Active=${stats.activeRequests} | Total=${stats.totalRequests} | Success=${stats.successRate} | Last Min=${stats.requestsLastMinute}`);
  }
}, 60000);