export const TOKEN_RUNTIME_PORT = Symbol('TOKEN_RUNTIME_PORT');

export interface TokenPayload {
  sub: string;
  email: string;
  tokenVersion: number;
  roles: string[];
}

export interface TokenRuntimePort {
  readonly accessTokenTtlSeconds: number;
  readonly refreshTokenTtlDays: number;
  readonly refreshSessionAbsoluteTtlDays: number;
  issueAccessToken(payload: TokenPayload): Promise<string>;
  verifyAccessToken(token: string): Promise<TokenPayload>;
  verifyAccessTokenForRefresh(token: string): Promise<TokenPayload>;
}
