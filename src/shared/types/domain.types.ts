export type Uuid = string;
export type IpAddress = string;
export type JsonObject = Record<string, unknown>;

export function assertSmallInt(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value < 1 || value > 32767) {
    throw new RangeError(
      `${fieldName} must be an integer between 1 and 32767.`,
    );
  }
}

export function assertNonEmpty(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${fieldName} cannot be empty.`);
  }
}

export function assertUuid(value: Uuid, fieldName: string): void {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new Error(`${fieldName} must be a valid UUID.`);
  }
}
