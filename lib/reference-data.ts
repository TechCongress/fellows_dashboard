// ── Policy Tag Library ────────────────────────────────────────────────────────
export const POLICY_TAGS: {
  tag: string;
  definition: string;
  keywords: string[];
}[] = [
  {
    tag: 'AI & Machine Learning',
    definition: 'Artificial intelligence development, deployment, governance, safety, and ethics',
    keywords: ['AI safety', 'algorithmic accountability', 'foundation models', 'ChatGPT', 'Gemini', 'Claude', 'automated decision-making'],
  },
  {
    tag: 'Cybersecurity',
    definition: 'Protecting digital infrastructure, data breaches, threat intelligence, incident response',
    keywords: ['CISA', 'ransomware', 'critical infrastructure', 'zero trust', 'vulnerability disclosure'],
  },
  {
    tag: 'Privacy & Data Protection',
    definition: 'Individual privacy rights, data collection, surveillance, consent frameworks',
    keywords: ['GDPR', 'CCPA', 'data brokers', 'facial recognition', 'location tracking'],
  },
  {
    tag: 'Digital Service Delivery',
    definition: 'Government technology modernization, user experience, digital-first services',
    keywords: ['USDS', '18F', 'government websites', 'benefits delivery', 'digital identity'],
  },
  {
    tag: 'Broadband & Infrastructure',
    definition: 'Internet access, telecommunications policy, spectrum allocation, connectivity',
    keywords: ['Rural broadband', '5G', 'net neutrality', 'universal service', 'digital divide'],
  },
  {
    tag: 'Election Security',
    definition: 'Voting systems, campaign finance transparency, disinformation, foreign interference',
    keywords: ['Voting machines', 'mail-in ballots', 'election infrastructure', 'deepfakes'],
  },
  {
    tag: 'Crypto & Blockchain',
    definition: 'Digital currencies, distributed ledger technology, Web3, regulation',
    keywords: ['Bitcoin', 'stablecoins', 'DeFi', 'NFTs', 'SEC regulation'],
  },
  {
    tag: 'Healthcare Tech',
    definition: 'Health IT systems, telemedicine, health data, medical devices',
    keywords: ['EHR interoperability', 'FDA approval', 'HIPAA', 'telehealth', 'precision medicine'],
  },
  {
    tag: 'Housing Tech',
    definition: 'PropTech, zoning, housing policy, tenant rights, smart cities',
    keywords: ['Zillow', 'algorithmic pricing', 'affordable housing', 'short-term rentals'],
  },
  {
    tag: 'Workforce Development',
    definition: 'Tech talent pipeline, reskilling, STEM education, immigration',
    keywords: ['H-1B visas', 'coding bootcamps', 'apprenticeships', 'community colleges', 'education'],
  },
  {
    tag: 'Government Modernization',
    definition: 'Legacy system replacement, cloud adoption, open data, procurement reform',
    keywords: ['FITARA', 'ATO process', 'agile development', 'open source', 'upgrade', 'systems'],
  },
];

export const POLICY_TAG_NAMES = POLICY_TAGS.map((p) => p.tag);

// ── Traffic Light Criteria ────────────────────────────────────────────────────
export const TRAFFIC_LIGHT: {
  color: 'Green' | 'Yellow' | 'Red';
  label: string;
  storyPotential: string;
  examples: string[];
  useCases: string[];
}[] = [
  {
    color: 'Green',
    label: 'Green — Amplify Now',
    storyPotential: 'Immediate story / Social media posts/campaign / Funder update',
    examples: [
      'Self-reported (social media, Substack, Slack) policy achievements with measurable impact',
      'Alumni career milestones (promotions, leadership roles)',
      'Published research or testimony fellows contributed to',
      'Fellowship program milestones (new cohorts, state launches)',
      'Funder research during prospecting',
    ],
    useCases: [
      'Funder reporting (quarterly/annually)',
      'Grant reporting',
      'Resharing/reposting social media wins with 1-2 sentences of context (within 48 hours of logging)',
      'New social media posts (on behalf of fellow/alumni)',
      'Storytelling (website features, video projects)',
      'Newsletter highlights (Feature in quarterly Today in Tech newsletter)',
      'Speaker Series ideation',
      'Internal team awareness (#tcteaminternal Slack, TechCongress team meetings)',
      'Crossposting on #humblebrag Slack channel',
    ],
  },
  {
    color: 'Yellow',
    label: 'Yellow — Track & Revisit',
    storyPotential: 'Track, revisit within 30–60 days for clearance to amplify / Funder updates',
    examples: [
      'Recently completed projects (check with fellow/office/alum first)',
      'Preliminary wins that aren\'t finalized',
      'Fellow job searches',
      'Emerging state partnerships',
      'Funder research during prospecting',
    ],
    useCases: [
      'Funder reporting (quarterly/annually)',
      'Internal team awareness (#tcteaminternal Slack, TechCongress team meetings)',
      'Internal documentation and learning',
    ],
  },
  {
    color: 'Red',
    label: 'Red — Internal Only',
    storyPotential: 'Internal use / Funder updates',
    examples: [
      'Current fellows\' daily work details (confidential)',
      'Sensitive office relationships or politics',
      'In-progress policy negotiations',
      'Internal program challenges',
      'Funder research during prospecting',
    ],
    useCases: [
      'Funder reporting (quarterly/annually)',
      'Internal team awareness (#tcteaminternal Slack, TechCongress team meetings)',
      'Internal documentation and learning',
    ],
  },
];

// ── Content Framework Reference ───────────────────────────────────────────────
export const CONTENT_FRAMEWORK: {
  tier: string;
  format: string;
  audience: string;
  approval: string;
  criteria: string[];
}[] = [
  {
    tier: 'Tier 1',
    format: 'Impact Story: Website feature, video project, speaking engagement, event',
    audience: 'Funders, Partners, Media',
    approval: 'Deputy Director, Senior Programs Manager, Fellow review',
    criteria: [
      'Major policy win',
      'National significance',
      'Strong narrative arc',
      'Multiple data points',
      'Aligns with funder priorities',
      '800-1200 words',
    ],
  },
  {
    tier: 'Tier 2',
    format: 'Social Media Thread',
    audience: 'General public, Tech community',
    approval: 'Deputy Director, Senior Programs Manager, Communications Manager',
    criteria: [
      'Timely accomplishment',
      'Shareable content',
      'Visual potential',
      'Clear impact statement',
      'Aligns with funder priorities',
      '5-8 tweets/posts',
    ],
  },
  {
    tier: 'Tier 3',
    format: 'Funder Report Bullet',
    audience: 'Specific funders',
    approval: 'If sharing externally: Executive Director',
    criteria: [
      'Any documented accomplishment',
      'Demonstrates program activity',
      'Supports grant reporting',
      'May aggregate multiple items',
      '2-3 sentences per item',
    ],
  },
];
