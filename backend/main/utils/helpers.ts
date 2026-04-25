export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v as object).sort(([a], [b]) => a.localeCompare(b)));
    }
    return v;
  });
}

export function orderedUniqueBy<T>(arr: T[], key: (item: T) => unknown): T[] {
  const seen = new Set<unknown>();
  return arr.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function arrayChunks<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export function mapSetDefault<K, V>(map: Map<K, V>, key: K, defaultFn: () => V): V {
  let value = map.get(key);
  if (value === undefined) {
    value = defaultFn();
    map.set(key, value);
  }
  return value;
}

export function withElementToggled<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
}

export function parseEnumValue<T extends string>(
  values: readonly T[],
  value: string,
): T | undefined {
  return values.includes(value as T) ? (value as T) : undefined;
}

export function parseArrayMember<T>(arr: readonly T[], value: unknown): T | undefined {
  return arr.includes(value as T) ? (value as T) : undefined;
}

export function nullableMap<T, U>(value: T | null | undefined, fn: (v: T) => U): U | null {
  return value != null ? fn(value) : null;
}
