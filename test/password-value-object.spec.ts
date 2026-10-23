import { Password } from '../src/modules/auth/domain/value-objects/password.vo.js';

describe('Password', () => {
  it('accepts a password satisfying every policy rule', () => {
    const password = Password.create('Glow123!');

    expect(password.value).toBe('Glow123!');
    expect(password.toString()).toBe('[REDACTED]');
    expect(JSON.stringify(password)).toBe('"[REDACTED]"');
  });

  it.each([
    ['short', 'Aa1!'],
    ['uppercase', 'glow123!'],
    ['lowercase', 'GLOW123!'],
    ['number', 'GlowScan!'],
    ['special character', 'Glow1234'],
  ])('rejects a password missing the required %s', (_rule, value) => {
    expect(() => Password.create(value)).toThrow();
  });
});
