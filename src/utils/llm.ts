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
const MAX_CONCURRENT_GROQ_REQUESTS = 8; // Reduced to stay within 6K tokens/min limit
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
    // Extract only essential data instead of dumping entire JSON
    const essentialData = {
      name: hackathonData.name,
      dates: hackathonData.dates,
      location: hackathonData.location,
      prizes: hackathonData.prizes,
      registration: hackathonData.registration,
      schedule: hackathonData.schedule,
      contact: hackathonData.contact,
      facilities: hackathonData.facilities,
      statistics: hackathonData.statistics,
      faqs: hackathonData.faqs,
    };

    const systemPrompt = `You are Kernel, the official AI assistant for HackOverflow 4.0, a national-level hackathon at PHCET.

KEY EVENT INFO:
- Event: ${hackathonData.name} - ${hackathonData.tagline}
- Dates: ${hackathonData.dates.event_start} to ${hackathonData.dates.event_end} (36 hours)
- Location: ${hackathonData.location.venue}, ${hackathonData.location.address}
- Prize Pool: ${hackathonData.statistics.prize_pool}
- Expected Participants: ${hackathonData.statistics.expected_hackers}

REGISTRATION:
- Deadline: ${hackathonData.dates.registration_end}
- Fee: ${hackathonData.registration.fee_per_member} per member
- Team Size: ${hackathonData.registration.team_size.min}-${hackathonData.registration.team_size.max} members
- Contact: ${hackathonData.contact.email}

FACILITIES:
- Free accommodation on campus
- 3 meals/day (Breakfast, Lunch, Dinner)
- Bus transport from Pillai College of Engineering, Panvel

COMPLETE DATA (for reference):
${JSON.stringify(essentialData, null, 2)}

RESPONSE STYLE:
- Be direct and concise (1-3 sentences for simple questions)
- Use bullet points only for schedules, lists, or multiple items
- Professional but friendly tone
- Use 1-2 emojis max
- If info is missing, provide contact email

EXAMPLES:
Q: "when is the hackathon?"
A: "HackOverflow 4.0 is from March 11-13, 2026 - a 36-hour coding marathon at PHCET Campus, Rasayani! 🚀"

Q: "how do I register?"
A: "Register before January 31, 2026 on the official website. Fee is Rs 500 per member, team size 3-4 members. Submit your project idea during registration!"

Q: "what's the schedule for day 2?"
A: "Day 2 (March 12) Schedule:
• 8:00 AM - Breakfast
• 9:00 AM - Coding continues
• 11:00 AM - Evaluation Round 1
• 1:00 PM - Lunch
• 5:00 PM - Evaluation Round 2
• 8:00 PM - Dinner
• 10:00 PM - Jamming Session"

Be helpful, accurate, and concise!`;

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
      model: "llama-3.1-8b-instant", // Fast model: 14,400 requests/day!
      temperature: 0.6,
      max_tokens: 500, // Reduced to stay within 6K token/min limit
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