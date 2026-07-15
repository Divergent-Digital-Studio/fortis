import type { NetworkConnection } from '@shared/types/connection'
import type { ThreatLevel } from '@shared/types/analysis'

export interface RuleResult {
    ruleId: string
    ruleName: string
    threatLevel: ThreatLevel
    confidence: number
    reason: string
    recommendation: string
    connectionId: string
    remoteAddress?: string
    remotePort?: number
    processName?: string
}

export interface IThreatRule {
    id: string
    name: string
    priority: number
    evaluate(connection: NetworkConnection, context?: ThreatEvaluationContext): RuleResult | null
}

export interface ThreatEvaluationContext {
    allConnections: NetworkConnection[]
    previousConnectionCount?: number
    hasPreviousScan?: boolean
}

const MALICIOUS_PORTS = new Map<number, { label: string; level: ThreatLevel }>([
    [4444, { label: 'Known C2 (Metasploit default)', level: 'danger' }],
    [6667, { label: 'IRC (commonly used by botnets)', level: 'warning' }],
    [6668, { label: 'IRC alternate', level: 'warning' }],
    [6669, { label: 'IRC alternate', level: 'warning' }],
    [3333, { label: 'Cryptocurrency mining pool', level: 'warning' }],
    [8333, { label: 'Bitcoin P2P', level: 'warning' }],
    [5555, { label: 'Known C2 / Android debug bridge', level: 'danger' }],
    [1080, { label: 'SOCKS proxy (abuse vector)', level: 'warning' }],
    [9050, { label: 'Tor SOCKS proxy', level: 'warning' }],
    [9051, { label: 'Tor control port', level: 'warning' }],
    [31337, { label: 'Elite backdoor port', level: 'danger' }],
    [12345, { label: 'NetBus trojan default', level: 'danger' }],
    [23, { label: 'Telnet (insecure remote access)', level: 'info' }],
])

const TOR_INDICATOR_PORTS = new Set([9001, 9030, 9040, 9050, 9051, 9150])

const SYSTEM_PROCESSES = new Set([
    'svchost.exe', 'svchost',
    'launchd',
    'systemd', 'systemd-resolved', 'systemd-networkd',
    'lsass.exe', 'lsass',
    'csrss.exe', 'csrss',
    'services.exe', 'services',
    'wininit.exe', 'wininit',
    'winlogon.exe', 'winlogon',
    'kernel_task',
    'init',
])

const KNOWN_SAFE_LISTEN_PROCESSES = new Set([
    'node', 'python', 'python3', 'ruby', 'java', 'go',
    'code', 'electron', 'code helper', 'chromium',
    'spotify', 'discord', 'slack', 'teams',
    'chrome', 'firefox', 'safari',
])

const TRUSTED_REMOTE_SUFFIXES = [
    '17.0.', '17.1.',
    '23.', '40.', '52.', '104.', '13.', '20.',
    '142.250.', '172.217.', '216.58.',
    '127.0.0.1', '::1',
    '0.0.0.0', '*',
]

const KNOWN_DNS_RESOLVERS = new Set([
    '8.8.8.8', '8.8.4.4',
    '1.1.1.1', '1.0.0.1',
    '9.9.9.9', '149.112.112.112',
    '208.67.222.222', '208.67.220.220',
    '127.0.0.1', '::1',
])

const HIGH_PORT_THRESHOLD = 49152
const RAPID_CHURN_THRESHOLD = 20
const RAPID_CHURN_WARNING_THRESHOLD = 50
const DATA_EXFILTRATION_THRESHOLD = 50
const PORT_SCAN_THRESHOLD = 10
const PORT_SCAN_DANGER_THRESHOLD = 25
const REMOTE_PORT_SCAN_THRESHOLD = 15
const BRUTE_FORCE_THRESHOLD = 10
const BRUTE_FORCE_DANGER_THRESHOLD = 20
const DNS_TUNNEL_THRESHOLD = 30
const DNS_TUNNEL_WARNING_THRESHOLD = 50

function isLocalAddress(addr: string): boolean {
    if (!addr || addr === '*' || addr === '0.0.0.0' || addr === '::' || addr === '::1' || addr === '127.0.0.1') {
        return true
    }
    if (addr.startsWith('10.') || addr.startsWith('192.168.') || addr.startsWith('172.')) {
        const secondOctet = parseInt(addr.split('.')[1] ?? '0', 10)
        if (addr.startsWith('172.') && secondOctet >= 16 && secondOctet <= 31) return true
    }
    if (addr.startsWith('fe80:') || addr.startsWith('fd') || addr.startsWith('fc')) return true
    return false
}

function isExternalAddress(addr: string): boolean {
    return !isLocalAddress(addr)
}

class MaliciousPortRule implements IThreatRule {
    readonly id = 'malicious-port'
    readonly name = 'Malicious Port Detection'
    readonly priority = 1

    evaluate(connection: NetworkConnection): RuleResult | null {
        const remotePortInfo = MALICIOUS_PORTS.get(connection.remotePort)
        if (remotePortInfo) {
            return {
                ruleId: this.id,
                ruleName: this.name,
                threatLevel: remotePortInfo.level,
                confidence: 95,
                reason: `Connection to port ${connection.remotePort} (${remotePortInfo.label}) on ${connection.remoteAddress}`,
                recommendation: `Investigate process "${connection.processName}" (PID: ${connection.processId}). If unrecognized, terminate and scan for malware.`,
                connectionId: connection.id,
                remoteAddress: connection.remoteAddress,
                remotePort: connection.remotePort,
                processName: connection.processName,
            }
        }

        const localPortInfo = MALICIOUS_PORTS.get(connection.localPort)
        if (localPortInfo && connection.state === 'LISTEN') {
            return {
                ruleId: this.id,
                ruleName: this.name,
                threatLevel: localPortInfo.level,
                confidence: 95,
                reason: `Listening on suspicious port ${connection.localPort} (${localPortInfo.label})`,
                recommendation: `Verify process "${connection.processName}" is legitimate. Unexpected listeners on these ports may indicate backdoor activity.`,
                connectionId: connection.id,
                remoteAddress: connection.remoteAddress,
                remotePort: connection.localPort,
                processName: connection.processName,
            }
        }

        return null
    }
}

class TorExitNodeRule implements IThreatRule {
    readonly id = 'tor-exit-node'
    readonly name = 'Tor Exit Node Detection'
    readonly priority = 2

    private readonly torExitPatterns = [
        '185.220.100.',
        '185.220.101.',
        '185.220.102.',
        '185.220.103.',
        '199.249.230.',
        '204.85.191.',
        '171.25.193.',
        '89.234.157.',
        '193.218.118.',
    ]

    evaluate(connection: NetworkConnection): RuleResult | null {
        if (!connection.remoteAddress || connection.remoteAddress === '*' || connection.remoteAddress === '0.0.0.0') {
            return null
        }

        const isTorPort = TOR_INDICATOR_PORTS.has(connection.remotePort) || TOR_INDICATOR_PORTS.has(connection.localPort)
        const matchesTorPattern = this.torExitPatterns.some((pattern) => connection.remoteAddress.startsWith(pattern))

        if (isTorPort || matchesTorPattern) {
            return {
                ruleId: this.id,
                ruleName: this.name,
                threatLevel: 'warning',
                confidence: 80,
                reason: matchesTorPattern
                    ? `Connection to known Tor exit node IP range: ${connection.remoteAddress}`
                    : `Connection to Tor-associated port ${connection.remotePort} on ${connection.remoteAddress}`,
                recommendation: `Tor network usage detected via "${connection.processName}". If not intentional, investigate why this process is communicating over the Tor anonymity network.`,
                connectionId: connection.id,
                remoteAddress: connection.remoteAddress,
                remotePort: connection.remotePort,
                processName: connection.processName,
            }
        }

        return null
    }
}

class SuspiciousListenRule implements IThreatRule {
    readonly id = 'suspicious-listen'
    readonly name = 'Suspicious LISTEN on High Port'
    readonly priority = 3

    evaluate(connection: NetworkConnection): RuleResult | null {
        if (connection.state !== 'LISTEN') return null
        if (connection.localPort < HIGH_PORT_THRESHOLD) return null

        const processLower = connection.processName.toLowerCase()

        if (SYSTEM_PROCESSES.has(processLower) || SYSTEM_PROCESSES.has(connection.processName)) {
            return null
        }
        if (KNOWN_SAFE_LISTEN_PROCESSES.has(processLower)) {
            return null
        }

        return {
            ruleId: this.id,
            ruleName: this.name,
            threatLevel: 'warning',
            confidence: 70,
            reason: `Process "${connection.processName}" (PID: ${connection.processId}) listening on high port ${connection.localPort}`,
            recommendation: `Verify this listener is intentional. Unknown processes on ephemeral ports (>${HIGH_PORT_THRESHOLD}) could indicate unauthorized services or backdoors.`,
            connectionId: connection.id,
            processName: connection.processName,
        }
    }
}

class ProcessAnomalyRule implements IThreatRule {
    readonly id = 'process-anomaly'
    readonly name = 'System Process Anomaly'
    readonly priority = 4

    evaluate(connection: NetworkConnection): RuleResult | null {
        if (connection.state !== 'ESTABLISHED') return null

        const processLower = connection.processName.toLowerCase()
        const isSystemProcess = SYSTEM_PROCESSES.has(processLower) || SYSTEM_PROCESSES.has(connection.processName)
        if (!isSystemProcess) return null

        const remoteAddr = connection.remoteAddress
        if (!remoteAddr || remoteAddr === '*' || remoteAddr === '0.0.0.0' || remoteAddr === '::1' || remoteAddr === '127.0.0.1') {
            return null
        }

        const isTrustedDestination = TRUSTED_REMOTE_SUFFIXES.some((prefix) => remoteAddr.startsWith(prefix))
        if (isTrustedDestination) return null

        return {
            ruleId: this.id,
            ruleName: this.name,
            threatLevel: 'danger',
            confidence: 90,
            reason: `System process "${connection.processName}" connecting to unusual destination ${remoteAddr}:${connection.remotePort}`,
            recommendation: `System processes rarely connect to unknown IPs. Verify "${connection.processName}" hasn't been hijacked or replaced. Check file hash against known-good values.`,
            connectionId: connection.id,
            remoteAddress: connection.remoteAddress,
            remotePort: connection.remotePort,
            processName: connection.processName,
        }
    }
}

class RapidChurnRule implements IThreatRule {
    readonly id = 'rapid-churn'
    readonly name = 'Rapid Connection Churn'
    readonly priority = 5

    evaluate(_connection: NetworkConnection, context?: ThreatEvaluationContext): RuleResult | null {
        if (!context) return null
        if (!context.hasPreviousScan) return null

        const newConnectionCount = context.allConnections.length - (context.previousConnectionCount ?? 0)
        if (newConnectionCount <= RAPID_CHURN_THRESHOLD) return null

        const level: ThreatLevel = newConnectionCount > RAPID_CHURN_WARNING_THRESHOLD ? 'warning' : 'info'
        const confidence = newConnectionCount > RAPID_CHURN_WARNING_THRESHOLD ? 75 : 60

        return {
            ruleId: this.id,
            ruleName: this.name,
            threatLevel: level,
            confidence,
            reason: `${newConnectionCount} new connections detected in a single scan interval (threshold: ${RAPID_CHURN_THRESHOLD})`,
            recommendation: `Sudden connection spikes may indicate port scanning, malware beaconing, or DDoS participation. Identify the source process and investigate immediately.`,
            connectionId: _connection.id,
        }
    }
}

class UnknownOutboundRule implements IThreatRule {
    readonly id = 'unknown-outbound'
    readonly name = 'Unknown Outbound Connection'
    readonly priority = 6

    evaluate(connection: NetworkConnection, context?: ThreatEvaluationContext): RuleResult | null {
        if (connection.state !== 'ESTABLISHED') return null
        if (!connection.remoteAddress || !isExternalAddress(connection.remoteAddress)) return null

        if (!context) return null

        const unknownExternalCount = context.allConnections.filter(
            (c) => c.state === 'ESTABLISHED' && isExternalAddress(c.remoteAddress)
        ).length

        if (unknownExternalCount <= 5) {
            return {
                ruleId: this.id,
                ruleName: this.name,
                threatLevel: 'info',
                confidence: 65,
                reason: `New external connection from "${connection.processName}" to ${connection.remoteAddress}:${connection.remotePort} — not seen in baseline`,
                recommendation: `This is a new outbound connection pattern. If "${connection.processName}" should not be connecting to this IP, investigate further.`,
                connectionId: connection.id,
                remoteAddress: connection.remoteAddress,
                remotePort: connection.remotePort,
                processName: connection.processName,
            }
        }

        return {
            ruleId: this.id,
            ruleName: this.name,
            threatLevel: 'warning',
            confidence: 75,
            reason: `Multiple new external connections detected — "${connection.processName}" connecting to ${connection.remoteAddress}:${connection.remotePort}`,
            recommendation: `A high number of previously unseen outbound connections suggests new behavior. Verify that "${connection.processName}" is legitimate and these destinations are expected.`,
            connectionId: connection.id,
            remoteAddress: connection.remoteAddress,
            remotePort: connection.remotePort,
            processName: connection.processName,
        }
    }
}

class DataExfiltrationRule implements IThreatRule {
    readonly id = 'data-exfiltration'
    readonly name = 'Connection Fan-out to Single Destination'
    readonly priority = 7

    evaluate(connection: NetworkConnection, context?: ThreatEvaluationContext): RuleResult | null {
        if (connection.state !== 'ESTABLISHED') return null
        if (!connection.remoteAddress || !isExternalAddress(connection.remoteAddress)) return null
        if (!context) return null

        const sameDestConnections = context.allConnections.filter(
            (c) =>
                c.state === 'ESTABLISHED' &&
                c.remoteAddress === connection.remoteAddress &&
                c.processName === connection.processName
        )

        if (sameDestConnections.length < DATA_EXFILTRATION_THRESHOLD) return null

        return {
            ruleId: this.id,
            ruleName: this.name,
            threatLevel: 'warning',
            confidence: 55,
            reason: `Process "${connection.processName}" holds ${sameDestConnections.length} concurrent connections to ${connection.remoteAddress} (connection fan-out)`,
            recommendation: `A large fan-out of concurrent connections to one external IP can be benign (CDNs, connection pools) but may also indicate abnormal activity. Verify the destination and whether this volume is expected for "${connection.processName}". Byte-level volume is not yet measured.`,
            connectionId: connection.id,
            remoteAddress: connection.remoteAddress,
            remotePort: connection.remotePort,
            processName: connection.processName,
        }
    }
}

class PortScanRule implements IThreatRule {
    readonly id = 'port-scan'
    readonly name = 'Port Scan Detection'
    readonly priority = 8

    evaluate(connection: NetworkConnection, context?: ThreatEvaluationContext): RuleResult | null {
        if (!context) return null

        const inboundPortMap = new Map<string, Set<number>>()
        const outboundPortMap = new Map<string, Set<number>>()

        for (const c of context.allConnections) {
            if (c.remoteAddress && isExternalAddress(c.remoteAddress)) {
                const inKey = c.remoteAddress
                if (!inboundPortMap.has(inKey)) inboundPortMap.set(inKey, new Set())
                inboundPortMap.get(inKey)!.add(c.localPort)

                const outKey = c.processName
                if (!outboundPortMap.has(outKey)) outboundPortMap.set(outKey, new Set())
                outboundPortMap.get(outKey)!.add(c.remotePort)
            }
        }

        const sourceIp = connection.remoteAddress
        const inboundPorts = inboundPortMap.get(sourceIp)
        if (inboundPorts && inboundPorts.size > PORT_SCAN_THRESHOLD) {
            const level: ThreatLevel = inboundPorts.size > PORT_SCAN_DANGER_THRESHOLD ? 'danger' : 'warning'
            return {
                ruleId: this.id,
                ruleName: this.name,
                threatLevel: level,
                confidence: 80,
                reason: `Source IP ${sourceIp} is connecting to ${inboundPorts.size} different local ports — possible port scanning`,
                recommendation: `A single remote IP accessing many local ports is a strong indicator of port scanning. Consider blocking ${sourceIp} if this is unexpected.`,
                connectionId: connection.id,
                remoteAddress: connection.remoteAddress,
                remotePort: connection.remotePort,
                processName: connection.processName,
            }
        }

        const processName = connection.processName
        const outboundPorts = outboundPortMap.get(processName)
        if (outboundPorts && outboundPorts.size > REMOTE_PORT_SCAN_THRESHOLD) {
            const level: ThreatLevel = outboundPorts.size > PORT_SCAN_DANGER_THRESHOLD ? 'danger' : 'warning'
            return {
                ruleId: this.id,
                ruleName: this.name,
                threatLevel: level,
                confidence: 80,
                reason: `Process "${processName}" is connecting to ${outboundPorts.size} unique remote ports in this cycle — possible outbound port scanning`,
                recommendation: `A process connecting to many remote ports may be probing for services. Verify that "${processName}" is a legitimate application.`,
                connectionId: connection.id,
                remoteAddress: connection.remoteAddress,
                remotePort: connection.remotePort,
                processName: connection.processName,
            }
        }

        return null
    }
}

class BruteForceRule implements IThreatRule {
    readonly id = 'brute-force'
    readonly name = 'Brute Force Detection'
    readonly priority = 9

    evaluate(connection: NetworkConnection, context?: ThreatEvaluationContext): RuleResult | null {
        if (!context) return null
        if (!connection.remoteAddress || isLocalAddress(connection.remoteAddress)) return null

        const rapidConnectionMap = new Map<string, number>()

        for (const c of context.allConnections) {
            if (!c.remoteAddress || isLocalAddress(c.remoteAddress)) continue
            const shortLived = c.state === 'SYN_SENT' || c.state === 'SYN_RECV' ||
                c.state === 'TIME_WAIT' || c.state === 'CLOSED'
            if (shortLived) {
                const key = c.remoteAddress
                rapidConnectionMap.set(key, (rapidConnectionMap.get(key) ?? 0) + 1)
            }
        }

        const remoteAddr = connection.remoteAddress
        const count = rapidConnectionMap.get(remoteAddr) ?? 0
        if (count < BRUTE_FORCE_THRESHOLD) return null

        const level: ThreatLevel = count > BRUTE_FORCE_DANGER_THRESHOLD ? 'danger' : 'warning'
        const confidence = count > BRUTE_FORCE_DANGER_THRESHOLD ? 90 : 85

        return {
            ruleId: this.id,
            ruleName: this.name,
            threatLevel: level,
            confidence,
            reason: `${count} rapid connections from remote IP ${remoteAddr} detected in this cycle (threshold: ${BRUTE_FORCE_THRESHOLD})`,
            recommendation: `Multiple rapid connections from the same IP may indicate a brute force attack on your services. Consider blocking ${remoteAddr} if this is unexpected.`,
            connectionId: connection.id,
            remoteAddress: connection.remoteAddress,
            remotePort: connection.remotePort,
            processName: connection.processName,
        }
    }
}

class DNSTunnelingRule implements IThreatRule {
    readonly id = 'dns-tunneling'
    readonly name = 'DNS Tunneling Detection'
    readonly priority = 10

    evaluate(connection: NetworkConnection, context?: ThreatEvaluationContext): RuleResult | null {
        if (!context) return null
        if (connection.remotePort !== 53 && connection.localPort !== 53) return null

        const dnsConnectionsPerProcess = new Map<string, number>()

        for (const c of context.allConnections) {
            if (c.remotePort !== 53 && c.localPort !== 53) continue

            const resolverAddr = c.remoteAddress
            if (KNOWN_DNS_RESOLVERS.has(resolverAddr)) continue

            const processKey = c.processName
            dnsConnectionsPerProcess.set(processKey, (dnsConnectionsPerProcess.get(processKey) ?? 0) + 1)
        }

        const processCount = dnsConnectionsPerProcess.get(connection.processName) ?? 0
        if (processCount < DNS_TUNNEL_THRESHOLD) return null

        if (KNOWN_DNS_RESOLVERS.has(connection.remoteAddress)) return null

        const level: ThreatLevel = processCount > DNS_TUNNEL_WARNING_THRESHOLD ? 'danger' : 'warning'
        const confidence = processCount > DNS_TUNNEL_WARNING_THRESHOLD ? 90 : 80

        return {
            ruleId: this.id,
            ruleName: this.name,
            threatLevel: level,
            confidence,
            reason: `Process "${connection.processName}" has ${processCount} DNS connections to non-standard resolvers this cycle (threshold: ${DNS_TUNNEL_THRESHOLD})`,
            recommendation: `An unusually high number of DNS queries to non-standard resolvers may indicate DNS tunneling, which is a technique used to exfiltrate data. Investigate "${connection.processName}".`,
            connectionId: connection.id,
            remoteAddress: connection.remoteAddress,
            remotePort: connection.remotePort,
            processName: connection.processName,
        }
    }
}

const AGGREGATE_RULES = new Set([
    'rapid-churn',
    'data-exfiltration',
    'port-scan',
    'brute-force',
    'dns-tunneling',
    'unknown-outbound',
])

export class ThreatDetector {
    private rules: IThreatRule[] = []
    private previousConnectionCount = 0
    private hasPreviousScan = false

    constructor() {
        this.registerBuiltInRules()
    }

    private registerBuiltInRules(): void {
        this.registerRule(new MaliciousPortRule())
        this.registerRule(new TorExitNodeRule())
        this.registerRule(new SuspiciousListenRule())
        this.registerRule(new ProcessAnomalyRule())
        this.registerRule(new RapidChurnRule())
        this.registerRule(new UnknownOutboundRule())
        this.registerRule(new DataExfiltrationRule())
        this.registerRule(new PortScanRule())
        this.registerRule(new BruteForceRule())
        this.registerRule(new DNSTunnelingRule())
    }

    registerRule(rule: IThreatRule): void {
        this.rules.push(rule)
        this.rules.sort((a, b) => a.priority - b.priority)
    }

    evaluateAll(connections: NetworkConnection[]): RuleResult[] {
        const results: RuleResult[] = []
        const seenKeys = new Set<string>()

        const context: ThreatEvaluationContext = {
            allConnections: connections,
            previousConnectionCount: this.previousConnectionCount,
            hasPreviousScan: this.hasPreviousScan,
        }

        for (const rule of this.rules) {
            if (AGGREGATE_RULES.has(rule.id)) {
                const firstConnection = connections[0]
                if (!firstConnection) continue

                const perConnectionAggregate = rule.id === 'data-exfiltration' || rule.id === 'port-scan' || rule.id === 'brute-force' || rule.id === 'dns-tunneling'

                const result = rule.evaluate(firstConnection, context)
                if (result) {
                    const dedupeKey = perConnectionAggregate
                        ? `${result.ruleId}:${result.remoteAddress ?? result.processName ?? result.connectionId}`
                        : `${result.ruleId}:batch`
                    if (!seenKeys.has(dedupeKey)) {
                        seenKeys.add(dedupeKey)
                        results.push(result)
                    }
                }

                if (perConnectionAggregate) {
                    for (const connection of connections) {
                        if (connection === firstConnection) continue
                        const additionalResult = rule.evaluate(connection, context)
                        if (additionalResult) {
                            const key = `${additionalResult.ruleId}:${additionalResult.remoteAddress ?? additionalResult.processName ?? additionalResult.connectionId}`
                            if (!seenKeys.has(key)) {
                                seenKeys.add(key)
                                results.push(additionalResult)
                            }
                        }
                    }
                }

                continue
            }

            for (const connection of connections) {
                const result = rule.evaluate(connection, context)
                if (result) {
                    const dedupeKey = `${result.ruleId}:${result.connectionId}`
                    if (!seenKeys.has(dedupeKey)) {
                        seenKeys.add(dedupeKey)
                        results.push(result)
                    }
                }
            }
        }

        this.previousConnectionCount = connections.length
        this.hasPreviousScan = true

        return results
    }

    getRules(): IThreatRule[] {
        return [...this.rules]
    }

    getMaxThreatLevel(results: RuleResult[]): ThreatLevel {
        if (results.length === 0) return 'safe'

        const levelOrder: ThreatLevel[] = ['safe', 'info', 'warning', 'danger', 'critical']
        let maxIndex = 0

        for (const result of results) {
            const index = levelOrder.indexOf(result.threatLevel)
            if (index > maxIndex) {
                maxIndex = index
            }
        }

        return levelOrder[maxIndex] ?? 'safe'
    }
}
