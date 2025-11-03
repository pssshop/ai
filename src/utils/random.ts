export function randomId(prefix: string): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `${prefix}-${crypto.randomUUID()}`;
    }
  } catch {
    // ignore and fall back to Math.random when crypto is unavailable (older browsers / Node)
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
