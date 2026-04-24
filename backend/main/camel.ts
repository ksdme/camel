import { api } from "encore.dev/api";

interface CamelResponse {
  name: string;
  status: string;
  docs: string[];
}

export const camel = api(
  { expose: true, method: "GET", path: "/" },
  async (): Promise<CamelResponse> => {
    return {
      name: "camel-backend",
      status: "ok",
      docs: ["/auth/login", "/auth/me", "/auth/logout"],
    };
  },
);