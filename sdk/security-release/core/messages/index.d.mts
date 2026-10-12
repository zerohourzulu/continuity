/** Pure explanations of unauthenticated supplied records; never executes or grants authority. */
export function explainRecord(surface: string, value: unknown): string;
export function explainBytes(surface: string, bytes: string | Uint8Array): string;
export function explainCode(surface: string, code: string): string;
export const help: string;
