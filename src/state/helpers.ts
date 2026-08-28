import { ApiError } from "../api/types";

const RECENT_KEY = "tarot.recentProjects";

function readRecent(): string[] {
 try {
 const raw = localStorage.getItem(RECENT_KEY);
 return raw ? (JSON.parse(raw) as string[]) : [];
 } catch {
 return [];
 }
}

function writeRecent(paths: string[]): void {
 try {
 localStorage.setItem(RECENT_KEY, JSON.stringify(paths.slice(0, 8)));
 } catch {
 /* storage unavailable — non-fatal */
 }
}

export function rememberRecent(path: string): void {
 const list = readRecent().filter((p) => p !== path);
 list.unshift(path);
 writeRecent(list);
}

export function getRecentProjects(): string[] {
 return readRecent();
}

export function errorMessage(e: unknown): string {
 if (e instanceof ApiError) return `[${e.code}] ${e.message}`;
 return e instanceof Error ? e.message : String(e);
}
