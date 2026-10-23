export class Password {
  private constructor(private readonly rawValue: string) {}

  static create(value: string): Password {
    if (value.length < 6) {
      throw new Error('Password must contain at least 6 characters.');
    }
    if (Buffer.byteLength(value, 'utf8') > 72) {
      throw new Error('Password must not exceed 72 UTF-8 bytes.');
    }
    if (!/[A-Z]/.test(value)) {
      throw new Error('Password must contain at least one uppercase letter.');
    }
    if (!/[a-z]/.test(value)) {
      throw new Error('Password must contain at least one lowercase letter.');
    }
    if (!/[0-9]/.test(value)) {
      throw new Error('Password must contain at least one number.');
    }
    if (!/[^A-Za-z0-9]/.test(value)) {
      throw new Error('Password must contain at least one special character.');
    }

    return new Password(value);
  }

  get value(): string {
    return this.rawValue;
  }

  equals(other: Password): boolean {
    return this.rawValue === other.rawValue;
  }

  toString(): string {
    return '[REDACTED]';
  }

  toJSON(): string {
    return '[REDACTED]';
  }
}
