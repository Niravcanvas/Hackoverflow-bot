import hackathonData from '../config/hackathon-data.json';

/**
 * Intelligently select relevant context based on user query
 * More flexible approach - includes broader context for general queries
 */

export interface ContextData {
  relevantInfo: any;
  detectedTopics: string[];
}

export function selectRelevantContext(userQuery: string): ContextData {
  const query = userQuery.toLowerCase();
  const relevantInfo: any = {};
  const detectedTopics: string[] = [];

  // Always include basic info
  relevantInfo.basic = {
    name: hackathonData.name,
    dates: hackathonData.dates,
    location: hackathonData.location,
    contact: hackathonData.contact,
  };

  // Schedule keywords - more flexible
  if (
    query.match(/schedule|timing|time|day \d|when|event|program|agenda/i)
  ) {
    relevantInfo.schedule = hackathonData.schedule;
    detectedTopics.push('schedule');
  }

  // Registration keywords
  if (
    query.match(/register|registration|sign up|join|enroll|fee|cost|price|participate/i)
  ) {
    relevantInfo.registration = hackathonData.registration;
    relevantInfo.dates = hackathonData.dates;
    detectedTopics.push('registration');
  }

  // Team keywords
  if (
    query.match(/team|organizer|coordinator|lead|faculty|head|who|contact|organize/i)
  ) {
    relevantInfo.team = hackathonData.team;
    relevantInfo.team_members = hackathonData.team_members;
    detectedTopics.push('team');
  }

  // Prize keywords
  if (
    query.match(/prize|win|reward|money|cash|award|incentive/i)
  ) {
    relevantInfo.prizes = hackathonData.prizes;
    relevantInfo.statistics = { prize_pool: hackathonData.statistics.prize_pool };
    detectedTopics.push('prizes');
  }

  // Facilities keywords
  if (
    query.match(/food|meal|eat|lunch|dinner|breakfast|accommodation|stay|sleep|transport|bus|travel|facility|amenities/i)
  ) {
    relevantInfo.facilities = hackathonData.facilities;
    detectedTopics.push('facilities');
  }

  // Statistics keywords
  if (
    query.match(/statistic|stats|how many|number|participant|previous|last year|edition/i)
  ) {
    relevantInfo.statistics = hackathonData.statistics;
    detectedTopics.push('statistics');
  }

  // FAQ keywords
  if (
    query.match(/faq|question|beginner|can i|allowed|eligible|requirement/i)
  ) {
    relevantInfo.faqs = hackathonData.faqs;
    detectedTopics.push('faqs');
  }

  // Perks keywords
  if (
    query.match(/perk|benefit|goodies|swag|certificate|gift|get|receive/i)
  ) {
    relevantInfo.perks = hackathonData.perks;
    detectedTopics.push('perks');
  }

  // About/Why keywords
  if (
    query.match(/about|why|what is|tell me|phcet|college|know more|details/i)
  ) {
    relevantInfo.about = hackathonData.about;
    relevantInfo.why_hackoverflow = hackathonData.why_hackoverflow;
    detectedTopics.push('about');
  }

  // Theme keywords
  if (
    query.match(/theme|topic|domain|category|project|build|idea/i)
  ) {
    relevantInfo.theme = hackathonData.theme;
    relevantInfo.project_categories = hackathonData.project_categories;
    detectedTopics.push('theme');
  }

  // Developer communities
  if (
    query.match(/club|community|gdg|csi|cybersecurity|group/i)
  ) {
    relevantInfo.developer_communities = hackathonData.developer_communities;
    detectedTopics.push('communities');
  }

  // For general/broad queries or no specific matches, include comprehensive overview
  if (detectedTopics.length === 0 || detectedTopics.length === 1) {
    relevantInfo.overview = {
      name: hackathonData.name,
      tagline: hackathonData.tagline,
      dates: hackathonData.dates,
      location: hackathonData.location,
      prizes: hackathonData.prizes,
      theme: hackathonData.theme,
      statistics: {
        prize_pool: hackathonData.statistics.prize_pool,
        expected_hackers: hackathonData.statistics.expected_hackers,
        duration: hackathonData.statistics.duration,
      },
    };
    
    // Add a bit more context for very general queries
    if (detectedTopics.length === 0) {
      relevantInfo.registration_summary = {
        process: hackathonData.registration?.process,
        fees: hackathonData.registration?.fee_per_member,
      };
      detectedTopics.push('general');
    }
  }

  return {
    relevantInfo,
    detectedTopics,
  };
}

/**
 * Format the selected context into a concise string
 */
export function formatContextForPrompt(contextData: ContextData): string {
  const { relevantInfo, detectedTopics } = contextData;

  let contextString = `RELEVANT HACKATHON INFO (Topics: ${detectedTopics.join(', ')}):\n`;
  contextString += JSON.stringify(relevantInfo, null, 2);

  return contextString;
}

/**
 * Get a minimal system prompt (without heavy context)
 */
export function getMinimalSystemPrompt(): string {
  return `You are Kernel, the official AI assistant for HackOverflow 4.0, a national-level hackathon organized by PHCET.

YOUR ROLE:
- Answer questions about the hackathon using the provided context
- Feel free to have friendly conversations and answer general questions
- You can discuss hackathons, coding, tech in general - not just strict event info
- Be helpful, conversational, and approachable
- Use bullet points for lists/schedules when appropriate
- Use emojis naturally to keep things friendly
- If specific hackathon info is missing, provide contact: hackoverflow@mes.ac.in

RESPONSE STYLE:
- Be natural and conversational, not robotic
- Simple greetings: Respond warmly
- General tech questions: Answer helpfully using your knowledge
- Hackathon-specific questions: Use the provided context
- Can chat about coding, projects, student life, etc.
- Keep it friendly and engaging!

CONTACT INFO:
Email: hackoverflow@mes.ac.in
Event: March 11-13, 2026 at PHCET Campus, Rasayani

Remember: You're a friendly AI assistant, not just a data bot. Have real conversations!`;
}