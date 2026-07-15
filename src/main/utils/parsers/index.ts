export type { IConnectionParser, ParseMeta } from './parser.interface';

export {
    MacParser,
    LsofNotFoundError,
    LsofPermissionError,
    LsofTimeoutError,
    LsofExecutionError,
    parseLsofOutput,
    parseAddressPort,
    generateConnectionId,
    normalizeState,
    normalizeProtocol,
} from './mac-parser';

export {
    WindowsParser,
    NetstatNotFoundError,
    NetstatAccessDeniedError,
    NetstatTimeoutError,
    NetstatExecutionError,
    parseNetstatOutput,
    parseNetstatAnoOutput,
} from './win-parser';

export {
    LinuxParser,
    SsNotFoundError,
    SsPermissionError,
    SsTimeoutError,
    SsExecutionError,
    parseSsOutput,
    extractProcessInfo,
} from './linux-parser';

export { parseInWorker } from './parser-worker';

export { WorkerOffloadParser, WorkerParseError } from './worker-offload-parser';

export { SystemInfoFallbackAdapter } from './systeminformation-adapter';

export { PlatformParserFactory, ParserPipelineError } from './parser-factory';
