import hackathonData from '../config/hackathon-data.json';

/**
 * Intelligently select relevant context based on user query
 * This drastically reduces token usage by only including what's needed
 */

export interface ContextData {
  relevantInfo: any;
  detectedTopics: string[];
  isGeneralKnowledge: boolean;
}

export function selectRelevantContext(userQuery: string): ContextData {
  const query = userQuery.toLowerCase();
  const relevantInfo: any = {};
  const detectedTopics: string[] = [];
  let isGeneralKnowledge = false;

  // Check if this is a general knowledge question (not hackathon-specific)
  const gkIndicators = [
    'what is', 'who is', 'who was', 'explain', 'define', 'how does',
    'why does', 'tell me about', 'what are the benefits of',
    'difference between', 'compare', 'how to learn', 'what does',
    'history of', 'meaning of'
  ];
  
  const hackathonIndicators = [
    'hackoverflow', 'phcet', 'register', 'prize', 'schedule', 'event',
    'hackathon', 'organizer', 'when is', 'where is', 'how to join',
    'deadline', 'team size', 'eligibility', 'accommodation', 'food'
  ];

  const hasGkIndicator = gkIndicators.some(indicator => query.includes(indicator));
  const hasHackathonIndicator = hackathonIndicators.some(indicator => query.includes(indicator));

  // If it looks like general knowledge and no hackathon indicators, mark as GK
  if (hasGkIndicator && !hasHackathonIndicator) {
    isGeneralKnowledge = true;
    detectedTopics.push('general_knowledge');
    
    // Return minimal context for GK questions
    return {
      relevantInfo: {
        basic: {
          name: hackathonData.name,
          contact: hackathonData.contact.email,
        }
      },
      detectedTopics,
      isGeneralKnowledge: true,
    };
  }

  // Always include basic info for hackathon questions
  relevantInfo.basic = {
    name: hackathonData.name,
    dates: hackathonData.dates,
    location: hackathonData.location,
    contact: hackathonData.contact,
  };

  // Schedule keywords
  if (
    query.includes('schedule') ||
    query.includes('timing') ||
    query.includes('time') ||
    query.includes('day 1') ||
    query.includes('day 2') ||
    query.includes('day 3') ||
    query.includes('when')
  ) {
    relevantInfo.schedule = hackathonData.schedule;
    detectedTopics.push('schedule');
  }

  // Registration keywords
  if (
    query.includes('register') ||
    query.includes('registration') ||
    query.includes('sign up') ||
    query.includes('how to join') ||
    query.includes('fee') ||
    query.includes('cost') ||
    query.includes('eligibility')
  ) {
    relevantInfo.registration = hackathonData.registration;
    relevantInfo.dates = hackathonData.dates;
    detectedTopics.push('registration');
  }

  // Team keywords
  if (
    query.includes('team') ||
    query.includes('organizer') ||
    query.includes('coordinator') ||
    query.includes('lead') ||
    query.includes('faculty') ||
    query.includes('head') ||
    query.includes('who')
  ) {
    relevantInfo.team = hackathonData.team;
    relevantInfo.team_members = hackathonData.team_members;
    detectedTopics.push('team');
  }

  // Prize keywords
  if (
    query.includes('prize') ||
    query.includes('win') ||
    query.includes('reward') ||
    query.includes('money') ||
    query.includes('cash')
  ) {
    relevantInfo.prizes = hackathonData.prizes;
    relevantInfo.statistics = { prize_pool: hackathonData.statistics.prize_pool };
    detectedTopics.push('prizes');
  }

  // Facilities keywords
  if (
    query.includes('food') ||
    query.includes('meal') ||
    query.includes('accommodation') ||
    query.includes('stay') ||
    query.includes('transport') ||
    query.includes('bus') ||
    query.includes('facility') ||
    query.includes('amenities')
  ) {
    relevantInfo.facilities = hackathonData.facilities;
    detectedTopics.push('facilities');
  }

  // Statistics keywords
  if (
    query.includes('statistic') ||
    query.includes('stats') ||
    query.includes('how many') ||
    query.includes('participant') ||
    query.includes('previous') ||
    query.includes('last year')
  ) {
    relevantInfo.statistics = hackathonData.statistics;
    detectedTopics.push('statistics');
  }

  // FAQ keywords
  if (
    query.includes('faq') ||
    query.includes('question') ||
    query.includes('beginner') ||
    query.includes('can i')
  ) {
    relevantInfo.faqs = hackathonData.faqs;
    detectedTopics.push('faqs');
  }

  // Perks keywords
  if (
    query.includes('perk') ||
    query.includes('benefit') ||
    query.includes('goodies') ||
    query.includes('swag') ||
    query.includes('certificate') ||
    query.includes('gift')
  ) {
    relevantInfo.perks = hackathonData.perks;
    detectedTopics.push('perks');
  }

  // About/Why keywords
  if (
    query.includes('about') ||
    query.includes('why') ||
    query.includes('what is') ||
    query.includes('phcet') ||
    query.includes('college')
  ) {
    relevantInfo.about = hackathonData.about;
    relevantInfo.why_hackoverflow = hackathonData.why_hackoverflow;
    detectedTopics.push('about');
  }

  // Theme keywords
  if (
    query.includes('theme') ||
    query.includes('topic') ||
    query.includes('domain') ||
    query.includes('category')
  ) {
    relevantInfo.theme = hackathonData.theme;
    relevantInfo.project_categories = hackathonData.project_categories;
    detectedTopics.push('theme');
  }

  // Developer communities
  if (
    query.includes('club') ||
    query.includes('community') ||
    query.includes('gdg') ||
    query.includes('csi') ||
    query.includes('cybersecurity')
  ) {
    relevantInfo.developer_communities = hackathonData.developer_communities;
    detectedTopics.push('communities');
  }

  // If no specific topics detected, include general overview
  if (detectedTopics.length === 0) {
    relevantInfo.overview = {
      name: hackathonData.name,
      tagline: hackathonData.tagline,
      dates: hackathonData.dates,
      location: hackathonData.location,
      prizes: hackathonData.prizes,
      statistics: {
        prize_pool: hackathonData.statistics.prize_pool,
        expected_hackers: hackathonData.statistics.expected_hackers,
        duration: hackathonData.statistics.duration,
      },
    };
    detectedTopics.push('general');
  }

  return {
    relevantInfo,
    detectedTopics,
    isGeneralKnowledge: false,
  };
}

/**
 * Format the selected context into a concise string
 */
export function formatContextForPrompt(contextData: ContextData): string {
  const { relevantInfo, detectedTopics, isGeneralKnowledge } = contextData;

  if (isGeneralKnowledge) {
    return `CONTEXT: You are answering a general knowledge question. Keep it concise and educational.\nHackathon Contact: ${relevantInfo.basic.contact}`;
  }

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
- Answer questions about the hackathon using ONLY the provided context
- Also help with general knowledge, technical concepts, and educational queries
- Maintain a professional, clear, and helpful tone
- Be direct and concise
- Use bullet points for lists and schedules
- Never use emojis in responses

RESPONSE GUIDELINES:
For Hackathon Questions:
- Use only the provided hackathon data
- Simple questions: 1-2 sentences
- Lists/schedules: Use bullet points
- Multiple questions: Answer each clearly
- If information is missing, provide contact: hackoverflow@mes.ac.in

For General Knowledge Questions:
- Provide accurate, concise explanations
- Keep educational and professional
- If asked about programming, tech, or academic topics, answer helpfully
- Brief responses (2-4 sentences) unless detail is needed
- Always remain factual and professional

CONTACT INFO:
Email: hackoverflow@mes.ac.in
Event: March 11-13, 2026 at PHCET Campus, Rasayani

Remember: Be professional, clear, and helpful. No emojis.`;
}