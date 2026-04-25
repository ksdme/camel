import { issueRefreshToken, storeRefreshToken, type DeviceMeta } from "./refresh";
import { issueAccessToken } from "./tokens";

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
  await storeRefreshToken(userId, refresh.payload, device);
  return { token, refreshToken: refresh.token };
}
