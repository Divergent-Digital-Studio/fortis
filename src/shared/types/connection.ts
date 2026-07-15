export type ConnectionState =
    | 'ESTABLISHED'
    | 'SYN_SENT'
    | 'SYN_RECV'
    | 'FIN_WAIT1'
    | 'FIN_WAIT2'
    | 'TIME_WAIT'
    | 'CLOSE_WAIT'
    | 'LAST_ACK'
    | 'LISTEN'
    | 'CLOSING'
    | 'CLOSED';

export type Protocol = 'tcp' | 'udp';

export interface NetworkConnection {
    id: string;
    protocol: Protocol;
    localAddress: string;
    localPort: number;
    remoteAddress: string;
    remotePort: number;
    state: ConnectionState;
    processName: string;
    processId: number;
    timestamp: number;
}

export interface ConnectionDiff {
    timestamp: number;
    newConnections: NetworkConnection[];
    droppedConnections: NetworkConnection[];
    changedConnections: Array<{
        before: NetworkConnection;
        after: NetworkConnection;
    }>;
    totalActive: number;
}

export interface ConnectionStats {
    totalActive: number;
    totalTcp: number;
    totalUdp: number;
    totalEstablished: number;
    totalListening: number;
    uniqueRemoteAddresses: number;
    uniqueProcesses: number;
    topProcesses: Array<{
        processName: string;
        connectionCount: number;
    }>;
    topRemoteAddresses: Array<{
        address: string;
        connectionCount: number;
    }>;
}

export interface TimeSeriesPoint {
    timestamp: number;
    value: number;
    label?: string;
}
