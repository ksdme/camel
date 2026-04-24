import { describe, expect, it } from "vitest";
import { normalizePagination } from "./pagination";

const options = {
  defaultPageSize: 20,
  maxPageSize: 100,
};

describe("normalizePagination", () => {
  it("uses defaults when page and pageSize are omitted", () => {
    expect(normalizePagination(undefined, undefined, options)).toEqual({
      page: 1,
      pageSize: 20,
      offset: 0,
    });
  });

  it("normalizes fractional and too-small values", () => {
    expect(normalizePagination(2.8, 0, options)).toEqual({
      page: 2,
      pageSize: 1,
      offset: 1,
    });
  });

  it("caps pageSize at the configured maximum", () => {
    expect(normalizePagination(3, 500, options)).toEqual({
      page: 3,
      pageSize: 100,
      offset: 200,
    });
  });

  it("falls back when values are not finite numbers", () => {
    expect(normalizePagination(Number.NaN, Number.POSITIVE_INFINITY, options)).toEqual({
      page: 1,
      pageSize: 20,
      offset: 0,
    });
  });
});
