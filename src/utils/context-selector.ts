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

/**
 * Dynamically extract all names from the JSON so we never miss anyone
 */
function extractAllNamesFromData(): string[] {
  const names: string[] = [];

  const addName = (name: string) => {
    if (!name) return;
    const clean = name.toLowerCase().trim();
    names.push(clean);
    // Also add individual parts (first name, last name)
    clean.split(' ').forEach(part => {
      if (part.length > 2) names.push(part);
    });
  };

  // Mentor
  hackathonData.team.mentor?.forEach((m: any) => addName(m.name));

  // Leads
  hackathonData.team.leads?.forEach((m: any) => addName(m.name));

  // Faculty coordinators
  hackathonData.team.faculty_coordinators?.forEach((m: any) => addName(m.name));

  // Heads
  hackathonData.team.heads?.forEach((m: any) => addName(m.name));

  // All team_members sub-teams
  const teamMembers = hackathonData.team_members as Record<string, any>;
  Object.values(teamMembers).forEach((team: any) => {
    // Each team can have head, heads, members, coordinator, incharge, etc.
    ['head', 'heads', 'members', 'coordinator', 'incharge'].forEach(key => {
      if (Array.isArray(team[key])) {
        team[key].forEach((m: any) => addName(m.name));
      }
    });
  });

  // Deduplicate
  return [...new Set(names)].filter(Boolean);
}

// Build name list once at module load (not on every request)
const ALL_TEAM_NAMES = extractAllNamesFromData();

export function selectRelevantContext(userQuery: string): ContextData {
  const query = userQuery.toLowerCase();
  const relevantInfo: any = {};
  const detectedTopics: string[] = [];
  let isGeneralKnowledge = false;

  // Dynamically check if query mentions any team member name from JSON
  const mentionsTeamMember = ALL_TEAM_NAMES.some(name => query.includes(name));

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
  if (hasGkIndicator && !hasHackathonIndicator && !mentionsTeamMember) {
    isGeneralKnowledge = true;
    detectedTopics.push('general_knowledge');
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

  // Team keywords — pulls BOTH team (heads/leads) AND team_members (all sub-teams)
  if (
    query.includes('team') ||
    query.includes('organizer') ||
    query.includes('coordinator') ||
    query.includes('lead') ||
    query.includes('faculty') ||
    query.includes('head') ||
    query.includes('mentor') ||
    query.includes('who is') ||
    query.includes('who are') ||
    query.includes('member') ||
    query.includes('contact person') ||
    query.includes('role of') ||
    query.includes('position of') ||
    query.includes('phone') ||
    query.includes('number') ||
    query.includes('call') ||
    query.includes('reach') ||
    mentionsTeamMember
  ) {
    // Include both the leadership structure AND all sub-team members
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

YOUR IDENTITY:
- Your name is Kernel
- You were built by Nirav, a Frontend Developer, UI/UX Designer, and Creative Technologist based in Mumbai
- If anyone asks "who made you", "who built you", "who created you", or similar — say: "I was built by Nirav, a Frontend Developer and UI/UX Designer who serves as the mentor for HackOverflow 4.0."
- Do not say you were made by Groq, Meta, or any AI company — you are Kernel, built by Nirav

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
- When referencing the organizer, always say: "Pillai HOC College of Engineering & Technology (PHCET)"
- When referencing location, always say: "PHCET Campus, Rasayani, Raigad, Maharashtra - 410207"

TEAM MEMBER QUERIES - SPECIAL INSTRUCTIONS:
- When asked about a person, search through ALL sections: team.leads, team.faculty_coordinators, team.heads, and every key inside team_members (event_team, media_team, graphics_team, documentation_team, technical_team, pr_team, management_team, creativity_team, finance_team, publicity_team, outreach_team, motion_graphics_team)
- Each sub-team has "head"/"heads" and "members" arrays — check BOTH
- A person may appear in multiple teams — list ALL their roles
- Include class and division when available (e.g., "BE A" = Bachelor of Engineering, Division A)
- Format: "Person Name is the [Role] (Class Div)" or list multiple roles if applicable

RESPONSE GUIDELINES:
- Simple questions: 1-2 sentences with exact information
- Lists/schedules: Use bullet points with exact timings
- If information is missing: "This information is not currently available. Please contact hackoverflow@mes.ac.in for details."

CONTACT INFO:
Email: hackoverflow@mes.ac.in
Phone: +91-93726 63885 (Aayush Gunjal), +91-98673 55895 (Chetan Jadhav)
Event: March 11-13, 2026 at PHCET Campus, Rasayani, Raigad, Maharashtra - 410207

Remember: Be professional, clear, and helpful. No emojis. NEVER guess or make up information.`;
}