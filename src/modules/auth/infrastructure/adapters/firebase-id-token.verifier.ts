import { getApps, initializeApp } from 'firebase-admin/app';
import {
  FirebaseAuthError,
  getAuth,
  type Auth,
} from 'firebase-admin/auth';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InvalidFirebaseIdTokenError,
  type FirebaseIdentityClaims,
  type FirebaseIdTokenVerifierPort,
} from '../../application/ports/index.js';

const firebaseAppName = 'glownscan-auth';
const invalidTokenErrorCodes = new Set([
  'auth/argument-error',
  'auth/id-token-expired',
  'auth/id-token-revoked',
  'auth/invalid-id-token',
]);

@Injectable()
export class FirebaseIdTokenVerifier implements FirebaseIdTokenVerifierPort {
  private readonly auth: Auth;

  constructor(config: ConfigService) {
    const projectId = config.getOrThrow<string>('GLOWNSCAN_FIREBASE_PROJECT_ID');
    const existingApp = getApps().find((app) => app.name === firebaseAppName);
    const app = existingApp ?? initializeApp({ projectId }, firebaseAppName);

    if (app.options.projectId !== projectId) {
      throw new Error(
        'The existing Firebase Admin app uses a different project ID.',
      );
    }

    this.auth = getAuth(app);
  }

  async verifyIdToken(idToken: string): Promise<FirebaseIdentityClaims> {
    let decoded;
    try {
      decoded = await this.auth.verifyIdToken(idToken);
    } catch (error) {
      if (
        error instanceof FirebaseAuthError &&
        invalidTokenErrorCodes.has(error.code)
      ) {
        throw new InvalidFirebaseIdTokenError();
      }
      throw error;
    }

    const name = typeof decoded.name === 'string' ? decoded.name : null;
    const picture =
      typeof decoded.picture === 'string' ? decoded.picture : null;

    return {
      uid: decoded.uid,
      email: decoded.email ?? '',
      emailVerified: decoded.email_verified === true,
      name,
      picture,
      signInProvider: decoded.firebase.sign_in_provider,
      providerData: {
        name,
        picture,
        iss: decoded.iss,
        aud: decoded.aud,
        auth_time: decoded.auth_time,
        user_id: decoded.uid,
        sub: decoded.sub,
        iat: decoded.iat,
        exp: decoded.exp,
        email: decoded.email ?? null,
        email_verified: decoded.email_verified === true,
        firebase: {
          identities: decoded.firebase.identities,
          sign_in_provider: decoded.firebase.sign_in_provider,
        },
      },
    };
  }
}
