export type { AsyncOption, AsyncResult } from "ts-results-es";
export { Err, None, Ok, Option, Result, Some } from "ts-results-es";

import type { Option, Result } from "ts-results-es";
import { Err, None, Ok, Some } from "ts-results-es";

export async function promiseToResult<T, E = unknown>(p: Promise<T>): Promise<Result<T, E>> {
  try {
    return Ok(await p);
  } catch (e) {
    return Err(e as E);
  }
}

export async function firstAsyncOk<T, E>(
  fns: Array<() => Promise<Result<T, E>>>,
): Promise<Result<T, E[]>> {
  const errors: E[] = [];
  for (const fn of fns) {
    const result = await fn();
    if (result.isOk()) return result;
    errors.push(result.error);
  }
  return Err(errors);
}

export function arrayFirst<T>(arr: T[]): Option<T> {
  return arr.length > 0 ? Some(arr[0]) : None;
}

export function arraySingle<T>(arr: T[]): Option<T> {
  return arr.length === 1 ? Some(arr[0]) : None;
}

export function parseIntStrict(value: string): Result<number, string> {
  const n = Number(value);
  if (!Number.isInteger(n) || String(n) !== value.trim()) {
    return Err(`"${value}" is not a valid integer`);
  }
  return Ok(n);
}

export function passString(value: unknown): Result<string, string> {
  return typeof value === "string" ? Ok(value) : Err(`expected string, got ${typeof value}`);
}

export function passNonEmptyString(value: unknown): Result<string, string> {
  if (typeof value !== "string") return Err(`expected string, got ${typeof value}`);
  if (!value.trim()) return Err("expected non-empty string");
  return Ok(value);
}

export function passBoolean(value: unknown): Result<boolean, string> {
  return typeof value === "boolean" ? Ok(value) : Err(`expected boolean, got ${typeof value}`);
}

export function passNumber(value: unknown): Result<number, string> {
  return typeof value === "number" && !Number.isNaN(value)
    ? Ok(value)
    : Err(`expected number, got ${typeof value}`);
}

export function passInt(value: unknown): Result<number, string> {
  if (typeof value !== "number" || Number.isNaN(value))
    return Err(`expected number, got ${typeof value}`);
  if (!Number.isInteger(value)) return Err(`expected integer, got ${value}`);
  return Ok(value);
}

export function passPositiveInt(value: unknown): Result<number, string> {
  const r = passInt(value);
  if (r.isErr()) return r;
  return r.value > 0 ? r : Err(`expected positive integer, got ${r.value}`);
}

export function passNonNegativeInt(value: unknown): Result<number, string> {
  const r = passInt(value);
  if (r.isErr()) return r;
  return r.value >= 0 ? r : Err(`expected non-negative integer, got ${r.value}`);
}
