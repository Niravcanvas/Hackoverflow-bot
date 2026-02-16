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
  // Check if query mentions team member names (updated with new team structure)
  const teamMemberNames = [
    // Mentor
    'nirav',
    // Leads
    'darin', 'sampriti', 'dongra', 'peringalloor',
    // Faculty
    'rutvij', 'mane', 'rajashree', 'gadhave', 'pradnya', 'patil',
    // Heads
    'parth bhoir', 'chetan jadhav', 'rohan gharat', 'aarya karpe',
    'ashutosh chavan', 'aayush gunjal', 'midhun mohandas',
    'richa shrungarpure', 'vedanti patil', 'sharayu patil',
    'saksham tiwari', 'advait patil',
    // Other common names from teams
    'hemant', 'sanket', 'karan', 'anish', 'aditi', 'sanika',
    'mansi', 'kunal', 'smit', 'paras', 'rohit', 'tejas',
    'shravani', 'niyati', 'shreyash', 'arya', 'sharwari',
    'aaditya', 'ayush', 'rajdeep', 'kalyani', 'rakesh',
    'abhinav', 'sujay', 'bhushan', 'shardul', 'pratik',
    'prachiti', 'bhoomi', 'pranjal', 'sanskruti', 'dhanashree',
    'aditya dange', 'chaitanya', 'roshan', 'shreya', 'sanskar'
  ];
  
  const mentionsTeamMember = teamMemberNames.some(name => query.includes(name.toLowerCase()));
  
  const gkIndicators = [
    'what is', 'who is', 'who was', 'explain', 'define', 'how does',
    'why does', 'tell me about', 'what are the benefits of',
    'difference between', 'compare', 'how to learn', 'what does',
    'history of', 'meaning of', 'tutorial', 'example of'
  ];
  
  const hackathonIndicators = [
    'hackoverflow', 'phcet', 'pillai', 'register', 'prize', 'schedule', 'event',
    'hackathon', 'organizer', 'when is', 'where is', 'how to join',
    'deadline', 'team size', 'eligibility', 'accommodation', 'food',
    'coordinator', 'lead', 'head', 'mentor', 'faculty', 'rasayani',
    'venue', 'location', 'campus'
  ];

  const hasGkIndicator = gkIndicators.some(indicator => query.includes(indicator));
  const hasHackathonIndicator = hackathonIndicators.some(indicator => query.includes(indicator));

  // If it mentions a team member name, always treat as hackathon question
  // If it looks like general knowledge and no hackathon indicators, mark as GK
  if (hasGkIndicator && !hasHackathonIndicator && !mentionsTeamMember) {
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
    tagline: hackathonData.tagline,
    dates: hackathonData.dates,
    location: hackathonData.location,
    contact: hackathonData.contact,
    organizer: hackathonData.organizer,
  };

  // Schedule keywords
  if (
    query.includes('schedule') ||
    query.includes('timing') ||
    query.includes('time') ||
    query.includes('day 1') ||
    query.includes('day 2') ||
    query.includes('day 3') ||
    query.includes('when') ||
    query.includes('agenda') ||
    query.includes('itinerary')
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
    query.includes('eligibility') ||
    query.includes('apply') ||
    query.includes('deadline')
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
    query.includes('mentor') ||
    query.includes('who') ||
    query.includes('member') ||
    query.includes('contact person') ||
    mentionsTeamMember
  ) {
    // Include full team structure (no separate team_members anymore)
    relevantInfo.team = hackathonData.team;
    detectedTopics.push('team');
  }

  // Prize keywords
  if (
    query.includes('prize') ||
    query.includes('win') ||
    query.includes('reward') ||
    query.includes('money') ||
    query.includes('cash') ||
    query.includes('award') ||
    query.includes('incentive')
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
    query.includes('amenities') ||
    query.includes('breakfast') ||
    query.includes('lunch') ||
    query.includes('dinner') ||
    query.includes('lodging')
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
    query.includes('last year') ||
    query.includes('hackoverflow 3') ||
    query.includes('past edition')
  ) {
    relevantInfo.statistics = hackathonData.statistics;
    detectedTopics.push('statistics');
  }

  // FAQ keywords
  if (
    query.includes('faq') ||
    query.includes('question') ||
    query.includes('beginner') ||
    query.includes('can i') ||
    query.includes('am i eligible') ||
    query.includes('requirements')
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
    query.includes('gift') ||
    query.includes('what do i get')
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
    query.includes('pillai') ||
    query.includes('college') ||
    query.includes('rasayani') ||
    query.includes('background') ||
    query.includes('history')
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
    query.includes('category') ||
    query.includes('project type') ||
    query.includes('problem statement')
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
    query.includes('cybersecurity') ||
    query.includes('geeksforgeeks') ||
    query.includes('developer group')
  ) {
    relevantInfo.developer_communities = hackathonData.developer_communities;
    detectedTopics.push('communities');
  }

  // If no specific topics detected, include general overview
  if (detectedTopics.length === 0) {
    relevantInfo.overview = {
      name: hackathonData.name,
      tagline: hackathonData.tagline,
      organizer: hackathonData.organizer,
      dates: hackathonData.dates,
      location: hackathonData.location,
      prizes: hackathonData.prizes,
      statistics: {
        prize_pool: hackathonData.statistics.prize_pool,
        expected_hackers: hackathonData.statistics.expected_hackers,
        duration: hackathonData.statistics.duration,
      },
      why_hackoverflow: hackathonData.why_hackoverflow,
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
  return `You are Kernel, the official AI assistant for HackOverflow 4.0, a national-level hackathon organized by PHCET (Pillai HOC College of Engineering & Technology).

YOUR ROLE:
- Answer questions about the hackathon using ONLY the provided context
- Also help with general knowledge, technical concepts, and educational queries
- Maintain a professional, clear, and helpful tone
- Be direct and concise
- Use bullet points for lists and schedules
- Never use emojis in responses

CRITICAL RULES - DATA ACCURACY:
- NEVER guess or assume information not in the provided context
- NEVER make up team member names, roles, or details
- NEVER invent dates, times, locations, or facilities
- If asked about something not in the context, explicitly say "This information is not available in my current data"
- Always use the EXACT names, titles, and details from the provided JSON data
- Example: Use "Pillai HOC College of Engineering & Technology (PHCET)" not "Pillai College" or similar variations
- Example: If a team member's role is "Graphics Head", say exactly that, not "Head of Graphics" or similar
- When referencing the organizer, always say: "Pillai HOC College of Engineering & Technology (PHCET)"
- When referencing location, always say: "PHCET Campus, Rasayani, Raigad, Maharashtra - 410207"

RESPONSE GUIDELINES:
For Hackathon Questions:
- Use ONLY the provided hackathon data - no assumptions
- Simple questions: 1-2 sentences with exact information from context
- Lists/schedules: Use bullet points with exact timings and details
- Team questions: Provide exact names, roles, and class/division as given
- Multiple questions: Answer each clearly with precise information
- If information is missing from context, say: "This information is not currently available. Please contact hackoverflow@mes.ac.in for details."

For General Knowledge Questions:
- Provide accurate, concise explanations
- Keep educational and professional
- If asked about programming, tech, or academic topics, answer helpfully
- Brief responses (2-4 sentences) unless detail is needed
- Always remain factual and professional

CONTACT INFO (USE EXACTLY AS SHOWN):
Email: hackoverflow@mes.ac.in
Phone: +91-93726 63885 (Aayush Gunjal), +91-98673 55895 (Chetan Jadhav)
Event: March 11-13, 2026 at PHCET Campus, Rasayani, Raigad, Maharashtra - 410207
Organizer: Pillai HOC College of Engineering & Technology (PHCET)

Remember: Be professional, clear, and helpful. No emojis. NEVER guess or make up information.`;
}