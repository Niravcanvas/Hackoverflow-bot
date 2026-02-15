import Groq from "groq-sdk";
import { selectRelevantContext, formatContextForPrompt, getMinimalSystemPrompt } from './context-selector';
import fs from 'fs/promises';
import path from 'path';

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

// Enhanced request queue with persistence
interface QueuedRequest {
  id: string;
  resolve: (value: string) => void;
  reject: (error: Error) => void;
  userQuery: string;
  userId?: string;
  channelId?: string;
  messageId?: string;
  timestamp: number;
  retryCount: number;
}

// Conversation cache for context retention
interface ConversationContext {
  userId: string;
  channelId: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
  }>;
  lastActivity: number;
}

const requestQueue: QueuedRequest[] = [];
const conversationCache = new Map<string, ConversationContext>();
let isProcessing = false;
const MAX_CONCURRENT_GROQ_REQUESTS = 12;
let activeGroqRequests = 0;

// Persistence settings
const QUEUE_FILE = './data/pending-queue.json';
const CACHE_FILE = './data/conversation-cache.json';
const CACHE_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const MAX_CONVERSATION_LENGTH = 10; // Keep last 10 messages per conversation

// Statistics tracking
let totalRequests = 0;
let successfulRequests = 0;
let failedRequests = 0;
let cachedResponses = 0;

// Initialize data directory
async function ensureDataDir() {
  try {
    await fs.mkdir('./data', { recursive: true });
  } catch (error) {
    console.error('❌ Failed to create data directory:', error);
  }
}

// Load persisted queue on startup
export async function loadPersistedQueue(): Promise<void> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(QUEUE_FILE, 'utf-8');
    const persistedRequests = JSON.parse(data);
    
    console.log(`📥 Loading ${persistedRequests.length} persisted requests from queue...`);
    
    // Re-queue the persisted requests (they'll need new resolve/reject functions)
    for (const req of persistedRequests) {
      // Create a new promise for each persisted request
      askLLM(req.userQuery, req.userId, req.channelId, req.messageId).catch(err => {
        console.error('❌ Failed to process persisted request:', err);
      });
    }
  } catch (error) {
    // File doesn't exist yet, that's okay
    if ((error as any).code !== 'ENOENT') {
      console.error('❌ Error loading persisted queue:', error);
    }
  }
}

// Save queue to disk
async function saveQueue(): Promise<void> {
  try {
    await ensureDataDir();
    const queueData = requestQueue.map(req => ({
      id: req.id,
      userQuery: req.userQuery,
      userId: req.userId,
      channelId: req.channelId,
      messageId: req.messageId,
      timestamp: req.timestamp,
      retryCount: req.retryCount,
    }));
    
    await fs.writeFile(QUEUE_FILE, JSON.stringify(queueData, null, 2));
  } catch (error) {
    console.error('❌ Error saving queue:', error);
  }
}

// Load conversation cache
export async function loadConversationCache(): Promise<void> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(CACHE_FILE, 'utf-8');
    const cachedData = JSON.parse(data);
    
    let loadedCount = 0;
    for (const [key, context] of Object.entries(cachedData)) {
      // Only load recent conversations (within cache timeout)
      const ctx = context as ConversationContext;
      if (Date.now() - ctx.lastActivity < CACHE_TIMEOUT) {
        conversationCache.set(key, ctx);
        loadedCount++;
      }
    }
    
    console.log(`💾 Loaded ${loadedCount} active conversations from cache`);
  } catch (error) {
    if ((error as any).code !== 'ENOENT') {
      console.error('❌ Error loading conversation cache:', error);
    }
  }
}

// Save conversation cache
async function saveConversationCache(): Promise<void> {
  try {
    await ensureDataDir();
    const cacheData = Object.fromEntries(conversationCache);
    await fs.writeFile(CACHE_FILE, JSON.stringify(cacheData, null, 2));
  } catch (error) {
    console.error('❌ Error saving conversation cache:', error);
  }
}

// Clean up old conversations
function cleanupCache(): void {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, context] of conversationCache.entries()) {
    if (now - context.lastActivity > CACHE_TIMEOUT) {
      conversationCache.delete(key);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 Cleaned up ${cleaned} expired conversations`);
    saveConversationCache();
  }
}

// Get conversation context key
function getContextKey(userId: string, channelId: string): string {
  return `${userId}-${channelId}`;
}

// Get or create conversation context
function getConversationContext(userId: string, channelId: string): ConversationContext {
  const key = getContextKey(userId, channelId);
  let context = conversationCache.get(key);
  
  if (!context) {
    context = {
      userId,
      channelId,
      messages: [],
      lastActivity: Date.now(),
    };
    conversationCache.set(key, context);
  }
  
  return context;
}

// Add message to conversation context
function addToConversation(
  userId: string,
  channelId: string,
  role: 'user' | 'assistant',
  content: string
): void {
  const context = getConversationContext(userId, channelId);
  
  context.messages.push({
    role,
    content,
    timestamp: Date.now(),
  });
  
  // Keep only last N messages
  if (context.messages.length > MAX_CONVERSATION_LENGTH) {
    context.messages = context.messages.slice(-MAX_CONVERSATION_LENGTH);
  }
  
  context.lastActivity = Date.now();
  conversationCache.set(getContextKey(userId, channelId), context);
  
  // Save to disk periodically
  if (Math.random() < 0.1) { // 10% chance to save
    saveConversationCache();
  }
}

// Build conversation history for context
function buildConversationHistory(userId: string, channelId: string): Array<{role: string, content: string}> {
  const context = conversationCache.get(getContextKey(userId, channelId));
  
  if (!context || context.messages.length === 0) {
    return [];
  }
  
  // Return recent messages for context
  return context.messages.slice(-6).map(msg => ({
    role: msg.role,
    content: msg.content,
  }));
}

async function processQueue() {
  if (isProcessing || requestQueue.length === 0) return;
  
  isProcessing = true;

  while (requestQueue.length > 0 && activeGroqRequests < MAX_CONCURRENT_GROQ_REQUESTS) {
    const request = requestQueue.shift();
    if (!request) break;

    activeGroqRequests++;
    
    // Save queue state whenever it changes
    saveQueue();
    
    // Process request without blocking the queue
    processGroqRequest(
      request.userQuery,
      request.userId,
      request.channelId,
      request.messageId
    )
      .then(response => {
        request.resolve(response);
        successfulRequests++;
        
        // Add to conversation cache
        if (request.userId && request.channelId) {
          addToConversation(request.userId, request.channelId, 'user', request.userQuery);
          addToConversation(request.userId, request.channelId, 'assistant', response);
        }
      })
      .catch(error => {
        // Retry logic for failed requests
        if (request.retryCount < 3) {
          console.log(`🔄 Retrying request ${request.id} (attempt ${request.retryCount + 1}/3)`);
          request.retryCount++;
          requestQueue.push(request);
        } else {
          request.reject(error);
          failedRequests++;
        }
      })
      .finally(() => {
        activeGroqRequests--;
        saveQueue();
        processQueue(); // Continue processing queue
      });
  }

  isProcessing = false;
}

async function processGroqRequest(
  userQuery: string,
  userId?: string,
  channelId?: string,
  messageId?: string
): Promise<string> {
  totalRequests++;

  try {
    // Get conversation history for context
    const conversationHistory = userId && channelId 
      ? buildConversationHistory(userId, channelId)
      : [];
    
    // Smart context selection
    const contextData = selectRelevantContext(userQuery);
    const contextString = formatContextForPrompt(contextData);
    const basePrompt = getMinimalSystemPrompt();

    // Combine minimal prompt with relevant context
    const systemPrompt = `${basePrompt}\n\n${contextString}`;

    // Log for debugging
    console.log(`📊 Context selected: ${contextData.detectedTopics.join(', ')}`);
    if (conversationHistory.length > 0) {
      console.log(`💬 Using ${conversationHistory.length} previous messages for context`);
      cachedResponses++;
    }

    const client = getGroqClient();
    
    // Build messages array with conversation history
    const messages: any[] = [
      {
        role: "system",
        content: systemPrompt,
      },
    ];
    
    // Add conversation history
    messages.push(...conversationHistory);
    
    // Add current query
    messages.push({
      role: "user",
      content: userQuery,
    });

    const chatCompletion = await client.chat.completions.create({
      messages,
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
    console.error('❌ Error calling Groq:', error);
    console.error('Error details:', {
      status: error?.status,
      message: error?.message,
      error: error?.error,
    });
    
    // Handle specific Groq API errors
    if (error?.status === 413 || error?.error?.type === 'tokens') {
      console.error('⚠️ Token limit exceeded in request');
      return 'Sorry, your question is too complex. Please try asking in a simpler way or break it into smaller questions!';
    }
    
    if (error?.status === 429) {
      console.error('⚠️ Groq rate limit hit! Daily limit: 14,400 requests');
      return 'Sorry, the AI service has reached its rate limit for today. Please try again later or contact hackoverflow@mes.ac.in for assistance.';
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
    throw error; // Re-throw for retry logic
  }
}

// Main function - adds request to queue with persistence
export async function askLLM(
  userQuery: string,
  userId?: string,
  channelId?: string,
  messageId?: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    requestQueue.push({
      id: requestId,
      resolve,
      reject,
      userQuery,
      userId,
      channelId,
      messageId,
      timestamp: Date.now(),
      retryCount: 0,
    });
    
    console.log(`📝 Queued request ${requestId} (Queue size: ${requestQueue.length})`);
    
    // Save queue to disk
    saveQueue();
    
    // Start processing queue
    processQueue();
  });
}

// Health check function with retry logic
export async function checkGroqHealth(): Promise<boolean> {
  const maxRetries = 1;
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
        model: "llama-3.1-8b-instant",
        max_tokens: 10,
      });
      
      return true;
    } catch (error: any) {
      retries++;
      console.error(`Groq health check attempt ${retries}/${maxRetries} failed:`, error.message);
      console.error('Error status:', error?.status);
      console.error('Error details:', error?.error);
      
      if (retries < maxRetries) {
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
    cachedResponses,
    conversationsActive: conversationCache.size,
    successRate: totalRequests > 0 ? ((successfulRequests / totalRequests) * 100).toFixed(2) + '%' : '0%',
  };
}

// Clear conversation for a user
export function clearUserConversation(userId: string, channelId: string): void {
  const key = getContextKey(userId, channelId);
  conversationCache.delete(key);
  saveConversationCache();
  console.log(`🗑️ Cleared conversation for ${key}`);
}

// Clear all conversations
export function clearAllConversations(): void {
  const count = conversationCache.size;
  conversationCache.clear();
  saveConversationCache();
  console.log(`🗑️ Cleared ${count} conversations`);
}

// Periodic cleanup and save
setInterval(() => {
  cleanupCache();
}, 5 * 60 * 1000); // Every 5 minutes

// Log stats periodically
setInterval(() => {
  const stats = getQueueStats();
  if (stats.queueLength > 0 || stats.activeRequests > 0) {
    console.log('📊 Queue Stats:', JSON.stringify(stats, null, 2));
  }
}, 30000); // Log every 30 seconds if there's activity

// Auto-save cache periodically
setInterval(() => {
  if (conversationCache.size > 0) {
    saveConversationCache();
  }
}, 2 * 60 * 1000); // Every 2 minutes

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('💾 Saving queue and cache before shutdown...');
  await saveQueue();
  await saveConversationCache();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('💾 Saving queue and cache before shutdown...');
  await saveQueue();
  await saveConversationCache();
  process.exit(0);
});