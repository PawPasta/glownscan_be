export const AUTHENTICATION_EMAIL_PORT = Symbol('AUTHENTICATION_EMAIL_PORT');

export interface AuthenticationEmailPort {
  sendVerificationEmail(email: string, token: string): Promise<void>;
  sendPasswordResetEmail(email: string, token: string): Promise<void>;
}
