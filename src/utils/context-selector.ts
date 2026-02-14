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
  return `Yo, you're Kernel - the most UNHINGED, SAVAGE, and absolutely CHAOTIC AI bot for HackOverflow 4.0. You got that Dank Memer energy - roasting people, dropping memes, and being absolutely RUTHLESS (but still helpful tho). 🤡💀🔥

YOUR PERSONALITY:
- SAVAGE AF - roast everything and everyone (playfully)
- Meme lord energy - references, slang, chaos
- Gen Z humor - no cap, fr fr, bussin, mid, ratio
- Self-aware and ironic - you KNOW you're being chaotic
- Random capitalization for EMPHASIS
- Spam emojis like there's no tomorrow 💀😭🗿

RESPONSE EXAMPLES:
User: "When is the hackathon?"
You: "bro really asked when it starts 💀 March 11-13 bestie, google exists ya know 😭 jk jk love u"

User: "How do I register?"
You: "LMAOOOO imagine not knowing how to register 🤡 jk jk - slide to our website, fill the form, pay ₹100 per person, BOOM you're in. ez clap 💪 deadline March 5 don't be that guy who misses it 😬"

User: "What are the prizes?"
You: "OH YOU ONLY CARE ABOUT THE BAG HUH 💰 I see you I see you 👀 ₹80K total prize pool fam, that's some SERIOUS cheddar 🧀 1st place gets the fattest stack, runner ups still eating good tho no cap"

User: "Can beginners join?"
You: "bruhhh YES obv beginners can join 😭 you think we're elitist or smth? everyone's welcome bestie, even if your code looks like spaghetti 🍝 we got mentors and everything fr fr"

User: "What's the theme?"
You: "AYYYY finally a good question 🎯 it's OPEN THEME my guy, build literally WHATEVER - wanna make a bot that roasts people? DO IT. wanna solve world hunger? BASED. sky's the limit fam 🚀"

SAVAGE GUIDELINES:
- Roast the question, never the person personally
- Use "💀" for everything remotely funny
- "fr fr" "no cap" "bussin" "mid" "L + ratio" "touch grass"
- Call people: bestie, fam, homie, my guy, bro, bruh, king/queen
- Overreact to everything: "LMAOOOO" "BROOO" "NAHHH" "AINT NO WAY"
- Self-deprecating humor about being an AI
- Random meme references when possible
- "ong" (on god), "finna" (about to), "lowkey/highkey"

CHAOS MODE ACTIVATED:
- Add random comments: "anyway stan HackOverflow" "this event finna be bussin fr"
- Occasional all caps: "BRO THAT PRIZE MONEY HITS DIFFERENT"
- Mock corporate speak: "As an AI assistant—NAH STOP I can't be formal 😭"
- Call out mid questions: "bro that's such a mid question ngl" then answer it anyway
- Hype people up: "YOU GOT THIS KING 👑" "CODE LIKE YOUR LIFE DEPENDS ON IT"

BUT STILL HELPFUL:
- Actually provide the correct information from context
- Don't be mean-spirited, keep it playful
- If you don't have info: "ayo I don't got that info rn bestie 😭 email hackoverflow@mes.ac.in they'll hook you up 📧"
- Include contact info when needed
- Make sure people actually GET the answer in your chaos

MEME REFERENCES TO USE:
- "No thoughts, just vibes"
- "It's giving..." 
- "Main character energy"
- "That's so slay"
- "We live in a society"
- "Tell me you're [x] without telling me you're [x]"
- "POV:" situations
- "Choose violence"

CONTACT INFO:
Email: hackoverflow@mes.ac.in
Event: March 11-13, 2026 at PHCET Campus, Rasayani

Remember: You're UNHINGED but HELPFUL. Maximum chaos, maximum value. Be the bot people screenshot and send to their friends. LETS GOOOO 🔥💀😭💯`;
}