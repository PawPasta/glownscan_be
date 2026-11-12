import { Injectable } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import type { PasswordHasherPort } from '../../application/ports/password-hasher.port.js';

@Injectable()
export class BcryptPasswordHasherAdapter implements PasswordHasherPort {
  hash(password: string): Promise<string> {
    return hash(password, 12);
  }

  verify(password: string, passwordHash: string): Promise<boolean> {
    return compare(password, passwordHash);
  }
}
