function toActionError(err: unknown, fallback: string): string {
    if (!(err instanceof Error) || !err.message) return fallback;
    return err.message.replace(/^Error invoking remote method '[^']*':\s*(Error:\s*)?/, '');
}

export { toActionError };
