export class Email {
  readonly value: string;

  constructor(value: string) {
    const normalized = value.trim().toLowerCase();
    if (normalized.length === 0 || normalized.length > 320) {
      throw new Error('Email must contain between 1 and 320 characters.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      throw new Error('Email must be a valid email address.');
    }
    this.value = normalized;
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
