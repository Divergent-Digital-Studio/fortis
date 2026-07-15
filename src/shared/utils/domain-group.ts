/**
 * Second-level suffixes where the registrable domain needs three labels rather
 * than two: `bbc.co.uk`, not `co.uk`.
 *
 * ponytail: a heuristic, not the Public Suffix List. An unlisted suffix only
 * splits one visual group into two — swap in `tldts` if that ever matters.
 */
const MULTI_PART_SUFFIXES = new Set([
    'co', 'com', 'net', 'org', 'edu', 'gov', 'ac', 'go', 'ne', 'or',
]);

/**
 * Cloud providers mint one hostname per instance (`ec2-1-2-3-4.compute.
 * amazonaws.com`). Grouping those at the registrable domain would still leave
 * hundreds of siblings, so they collapse to the service label instead.
 */
const CLOUD_HOST_SUFFIXES = [
    'compute.amazonaws.com',
    'compute-1.amazonaws.com',
    's3.amazonaws.com',
    'cloudfront.net',
    'akamaitechnologies.com',
    'googleusercontent.com',
    'bc.googleusercontent.com',
    '1e100.net',
    'cloudapp.azure.com',
    'azurewebsites.net',
    'in-addr.arpa',
    'ip6.arpa',
];

function isIpLiteral(host: string): boolean {
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');
}

/**
 * The label a domain should be grouped under: its registrable domain, or the
 * cloud service that owns it. Returns the input unchanged for IPs and hosts
 * with no dot, which have no parent to roll up into.
 */
export function domainGroup(domain: string): string {
    const host = domain.trim().toLowerCase().replace(/\.$/, '');
    if (host.length === 0) return domain;
    if (isIpLiteral(host)) return host;

    for (const suffix of CLOUD_HOST_SUFFIXES) {
        if (host === suffix || host.endsWith(`.${suffix}`)) return suffix;
    }

    const labels = host.split('.');
    if (labels.length <= 2) return host;

    const secondLast = labels[labels.length - 2] ?? '';
    const take = MULTI_PART_SUFFIXES.has(secondLast) ? 3 : 2;
    return labels.slice(-take).join('.');
}
