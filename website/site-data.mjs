export const TIERS = [
    {
        name: 'Free',
        price: '$0',
        blurb: 'Core visibility, forever free.',
        features: [
            'Connection monitoring',
            'Local AI analysis (BYOK / Ollama)',
            'DNS + WiFi device discovery',
            'Geo map',
            'Light / dark themes',
            '6-language UI (RTL aware)',
        ],
    },
    {
        name: 'Fortress',
        price: 'Lifetime deal',
        blurb: 'Active defense + integrations.',
        features: [
            'Everything in Free',
            'Auto-kill / firewall block (manual-confirm)',
            'Bandwidth per process',
            'Slack / Discord / PagerDuty alerts',
            'SSL certificate monitoring',
            'Custom alert rules',
            'Community threat intel (opt-in)',
        ],
    },
    {
        name: 'Enterprise',
        price: 'Contact',
        blurb: 'RBAC, SIEM, compliance.',
        features: [
            'Everything in Fortress',
            'RBAC (admin / manager / observer)',
            'Local REST API',
            'SIEM (Splunk / ELK / Datadog)',
            'Compliance reports (SOC2 / ISO / PCI / HIPAA / GDPR)',
            'Insider-threat scoring',
            'White-label reports',
        ],
    },
];

export const FEATURE_MATRIX = [
    { feature: 'Connection visibility', free: true, fortress: true, enterprise: true },
    { feature: 'Local AI analysis', free: true, fortress: true, enterprise: true },
    { feature: 'Active defense', free: false, fortress: true, enterprise: true },
    { feature: 'Remote agent + bridge', free: false, fortress: true, enterprise: true },
    { feature: 'RBAC / SIEM / compliance', free: false, fortress: false, enterprise: true },
    { feature: 'Multi-language UI (i18n, RTL)', free: true, fortress: true, enterprise: true },
    { feature: 'Community threat intel', free: false, fortress: true, enterprise: true },
];

export const FAQ = [
    {
        q: 'Does my data leave my machine?',
        a: 'No. All enrichment is local and bundled. AI uses your own key (or local Ollama). Community threat intel is off by default and shares only anonymized, salted-hashed indicators when you explicitly opt in.',
    },
    {
        q: 'Which platforms are supported?',
        a: 'macOS (Intel + Apple Silicon), Windows, and Linux (AppImage + deb).',
    },
    {
        q: 'How does the AppSumo lifetime deal work?',
        a: 'Redeem your AppSumo code on the licensing screen to unlock the Fortress tier for life on this install.',
    },
    {
        q: 'Is there a mobile app?',
        a: 'A read-only mobile companion that consumes the local REST API is on the roadmap.',
    },
];
