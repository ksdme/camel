const handler: ProxyHandler<object> = {
  get: (_, prop) => {
    if (prop === "then") return undefined; // prevent accidental Promise resolution
    return new Proxy((..._args: unknown[]) => superMock<unknown>(), handler);
  },
  apply: () => superMock<unknown>(),
};

export const superMock = <T>(): T => new Proxy((() => {}) as object, handler) as T;
