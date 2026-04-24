export interface PaginationOptions {
  defaultPageSize: number;
  maxPageSize: number;
}

export interface PaginationResult {
  page: number;
  pageSize: number;
  offset: number;
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.floor(value));
}

export function normalizePagination(
  page: number | undefined,
  pageSize: number | undefined,
  options: PaginationOptions,
): PaginationResult {
  const normalizedPage = normalizePositiveInteger(page, 1);
  const normalizedPageSize = Math.min(
    options.maxPageSize,
    normalizePositiveInteger(pageSize, options.defaultPageSize),
  );

  return {
    page: normalizedPage,
    pageSize: normalizedPageSize,
    offset: (normalizedPage - 1) * normalizedPageSize,
  };
}
