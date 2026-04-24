import { APIError } from "encore.dev/api";

export function normalizeRequiredId(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw APIError.invalidArgument(`${fieldName} is required`);
  }
  return value.trim();
}

export function normalizeOptionalId(value: unknown, fieldName: string): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw APIError.invalidArgument(`${fieldName} must be a string`);
  }
  const trimmed = value.trim();
  return trimmed || null;
}
