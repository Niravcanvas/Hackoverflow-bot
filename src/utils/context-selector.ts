import { getHackathonData } from '../config/db-config';

/**
 * Intelligently select relevant context based on user query.
 * All data is fetched from MongoDB (with 60 s cache) so the dashboard
 * can update it live without restarting the bot.
 */

export interface ContextData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  relevantInfo: any;
  detectedTopics: string[];
  isGeneralKnowledge: boolean;
}

/**
 * Dynamically extract all team member names from the JSON so we never miss anyone.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractAllNamesFromData(hackathonData: any): string[] {
  const names: string[] = [];

  const addName = (name: string) => {
    if (!name) return;
    const clean = name.toLowerCase().trim();
    names.push(clean);
    clean.split(' ').forEach(part => { if (part.length > 2) names.push(part); });
  };

  hackathonData.team?.mentor?.forEach((m: { name: string }) => addName(m.name));
  hackathonData.team?.leads?.forEach((m: { name: string }) => addName(m.name));
  hackathonData.team?.faculty_coordinators?.forEach((m: { name: string }) => addName(m.name));
  hackathonData.team?.heads?.forEach((m: { name: string }) => addName(m.name));

  const teamMembers = hackathonData.team_members as Record<string, Record<string, unknown>> | undefined;
  if (teamMembers) {
    Object.values(teamMembers).forEach((team) => {
      ['head', 'heads', 'members', 'coordinator', 'incharge'].forEach(key => {
        if (Array.isArray(team[key])) {
          (team[key] as { name: string }[]).forEach(m => addName(m.name));
        }
      });
    });
  }

  return [...new Set(names)].filter(Boolean);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function selectRelevantContext(userQuery: string): Promise<ContextData> {
  const hackathonData = await getHackathonData();
  const query = userQuery.toLowerCase();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const relevantInfo: any = {};
  const detectedTopics: string[] = [];

  // Build name list fresh from (cached) data — negligible cost
  const allTeamNames = extractAllNamesFromData(hackathonData);
  const mentionsTeamMember = allTeamNames.some(name => query.includes(name));

  const gkIndicators = [
    'what is', 'who is', 'who was', 'explain', 'define', 'how does',
    'why does', 'tell me about', 'what are the benefits of',
    'difference between', 'compare', 'how to learn', 'what does',
    'history of', 'meaning of', 'tutorial', 'example of',
  ];

  const hackathonIndicators = [
    'hackoverflow', 'phcet', 'pillai', 'register', 'prize', 'schedule', 'event',
    'hackathon', 'organizer', 'when is', 'where is', 'how to join',
    'deadline', 'team size', 'eligibility', 'accommodation', 'food',
    'coordinator', 'lead', 'head', 'mentor', 'faculty', 'rasayani',
    'venue', 'location', 'campus',
  ];

  const hasGkIndicator = gkIndicators.some(i => query.includes(i));
  const hasHackathonIndicator = hackathonIndicators.some(i => query.includes(i));

  if (hasGkIndicator && !hasHackathonIndicator && !mentionsTeamMember) {
    return {
      relevantInfo: { basic: { name: hackathonData.name, contact: hackathonData.contact?.email } },
      detectedTopics: ['general_knowledge'],
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

  if (['schedule','timing','time','day 1','day 2','day 3','when','agenda','itinerary'].some(k => query.includes(k))) {
    relevantInfo.schedule = hackathonData.schedule;
    detectedTopics.push('schedule');
  }

  if (['register','registration','sign up','how to join','fee','cost','eligibility','apply','deadline'].some(k => query.includes(k))) {
    relevantInfo.registration = hackathonData.registration;
    relevantInfo.dates = hackathonData.dates;
    detectedTopics.push('registration');
  }

  if (
    ['team','organizer','coordinator','lead','faculty','head','mentor','who is','who are',
     'member','contact person','role of','position of','phone','number','call','reach'].some(k => query.includes(k))
    || mentionsTeamMember
  ) {
    relevantInfo.team = hackathonData.team;
    relevantInfo.team_members = hackathonData.team_members;
    detectedTopics.push('team');
  }

  if (['prize','win','reward','money','cash','award','incentive'].some(k => query.includes(k))) {
    relevantInfo.prizes = hackathonData.prizes;
    relevantInfo.statistics = { prize_pool: hackathonData.statistics?.prize_pool };
    detectedTopics.push('prizes');
  }

  if (['food','meal','accommodation','stay','transport','bus','facility','amenities','breakfast','lunch','dinner','lodging'].some(k => query.includes(k))) {
    relevantInfo.facilities = hackathonData.facilities;
    detectedTopics.push('facilities');
  }

  if (['statistic','stats','how many','participant','previous','last year','hackoverflow 3','past edition'].some(k => query.includes(k))) {
    relevantInfo.statistics = hackathonData.statistics;
    detectedTopics.push('statistics');
  }

  if (['faq','question','beginner','can i','am i eligible','requirements'].some(k => query.includes(k))) {
    relevantInfo.faqs = hackathonData.faqs;
    detectedTopics.push('faqs');
  }

  if (['perk','benefit','goodies','swag','certificate','gift','what do i get'].some(k => query.includes(k))) {
    relevantInfo.perks = hackathonData.perks;
    detectedTopics.push('perks');
  }

  if (['about','why','what is','phcet','pillai','college','rasayani','background','history'].some(k => query.includes(k))) {
    relevantInfo.about = hackathonData.about;
    relevantInfo.why_hackoverflow = hackathonData.why_hackoverflow;
    detectedTopics.push('about');
  }

  if (['theme','topic','domain','category','project type','problem statement'].some(k => query.includes(k))) {
    relevantInfo.theme = hackathonData.theme;
    relevantInfo.project_categories = hackathonData.project_categories;
    detectedTopics.push('theme');
  }

  if (['club','community','gdg','csi','cybersecurity','geeksforgeeks','developer group'].some(k => query.includes(k))) {
    relevantInfo.developer_communities = hackathonData.developer_communities;
    detectedTopics.push('communities');
  }

  if (detectedTopics.length === 0) {
    relevantInfo.overview = {
      name: hackathonData.name,
      tagline: hackathonData.tagline,
      organizer: hackathonData.organizer,
      dates: hackathonData.dates,
      location: hackathonData.location,
      prizes: hackathonData.prizes,
      statistics: {
        prize_pool: hackathonData.statistics?.prize_pool,
        expected_hackers: hackathonData.statistics?.expected_hackers,
        duration: hackathonData.statistics?.duration,
      },
      why_hackoverflow: hackathonData.why_hackoverflow,
    };
    detectedTopics.push('general');
  }

  return { relevantInfo, detectedTopics, isGeneralKnowledge: false };
}

export function formatContextForPrompt(contextData: ContextData): string {
  const { relevantInfo, detectedTopics, isGeneralKnowledge } = contextData;
  if (isGeneralKnowledge) {
    return `CONTEXT: You are answering a general knowledge question. Keep it concise and educational.\nHackathon Contact: ${relevantInfo.basic?.contact}`;
  }
  return `RELEVANT HACKATHON INFO (Topics: ${detectedTopics.join(', ')}):\n${JSON.stringify(relevantInfo, null, 2)}`;
}

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