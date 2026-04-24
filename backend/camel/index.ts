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
      docs: [
        "/auth/login",
        "/auth/refresh",
        "/auth/me",
        "/auth/logout",
        "/folders",
        "/folders/:id",
        "/notes",
        "/notes/recent",
        "/notes/:id",
        "/notes/:id/tags",
        "/tags",
        "/tags/:id",
        "/shares",
        "/shares/:id",
        "/settings/event_logs",
        "/settings/profile",
        "/settings/password",
        "/settings/sessions",
        "/settings/sessions/revoke",
        "/settings/sessions/revoke-current",
        "/settings/sessions/revoke-others",
        "/settings/account",
      ],
    };
  },
);
