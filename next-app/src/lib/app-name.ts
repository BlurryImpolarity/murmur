// Read at request time, so it can be changed without rebuilding
export function appName(): string {
    return process.env.APP_NAME || "murmur";
}
