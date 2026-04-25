import { getSessionRepo } from "@/main/repos";
import { type DeviceMeta, issueRefreshToken } from "@/main/utils/auth/refresh";
import { issueAccessToken } from "@/main/utils/auth/tokens";

export interface SessionTokens {
  token: string;
  refreshToken: string;
}

export async function issueSessionTokens(
  userId: string,
  device: DeviceMeta = {},
): Promise<SessionTokens> {
  const token = issueAccessToken(userId);
  const refresh = issueRefreshToken(userId);
  await getSessionRepo().store(userId, refresh.payload, device);
  return { token, refreshToken: refresh.token };
}
