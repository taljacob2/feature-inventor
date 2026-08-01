// A tiny, gitignored local control file that lets a human ask a running (or
// about-to-run) nightly loop to wrap up early instead of starting another
// feature. This is control/safety plumbing for the platform itself, not a
// "feature" the loop is expected to invent — see VISION.md.

export const STOP_FLAG_FILENAME = ".feature-inventor-stop";

export interface StopFlagContent {
  /** ISO 8601 timestamp of when the stop was requested. */
  requestedAt: string;
}

export function serializeStopFlag(content: StopFlagContent): string {
  return JSON.stringify(content, null, 2) + "\n";
}

export function parseStopFlag(raw: string): StopFlagContent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (
    typeof parsed === "object" &&
    parsed !== null &&
    typeof (parsed as Record<string, unknown>).requestedAt === "string"
  ) {
    return parsed as StopFlagContent;
  }
  return null;
}
