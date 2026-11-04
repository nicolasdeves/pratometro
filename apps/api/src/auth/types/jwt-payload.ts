export interface JwtPayload {
  sub: string;
  email: string;
}

/** O que vira `req.user` depois do JwtStrategy. */
export interface AuthUser {
  id: string;
  email: string;
}
