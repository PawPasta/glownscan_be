import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

@Injectable()
export class SmtpEmailService {
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly frontendUrl: string;
  private readonly verifyPath: string;
  private readonly resetPath: string;

  constructor(config: ConfigService) {
    const host = config.get<string>('GLOWNSCAN_SMTP_HOST');
    const user = config.get<string>('GLOWNSCAN_SMTP_USER');
    const password = config.get<string>('GLOWNSCAN_SMTP_PASSWORD');
    this.from = config.get<string>('GLOWNSCAN_SMTP_FROM') ?? user ?? '';
    this.frontendUrl =
      config.get<string>('GLOWNSCAN_FRONTEND_URL')?.split(',')[0]?.trim() ?? '';
    this.verifyPath = config.get<string>(
      'GLOWNSCAN_EMAIL_VERIFY_PATH',
      '/verify-email',
    );
    this.resetPath = config.get<string>(
      'GLOWNSCAN_PASSWORD_RESET_PATH',
      '/reset-password',
    );

    if (!host || !user || !password || !this.from || !this.frontendUrl) {
      throw new Error(
        'SMTP settings and GLOWNSCAN_FRONTEND_URL are required for authentication emails.',
      );
    }

    const port = Number(config.get<string>('GLOWNSCAN_SMTP_PORT', '587'));
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('GLOWNSCAN_SMTP_PORT must be a valid TCP port.');
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: config.get<string>('GLOWNSCAN_SMTP_SECURE', 'false') === 'true',
      auth: { user, pass: password },
    });
  }

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const link = this.createLink(this.verifyPath, email, token);
    await this.transporter.sendMail({
      from: this.from,
      to: email,
      subject: 'Verify your GlowScan account',
      text: `Verify your email: ${link}`,
      html: `<p>Verify your GlowScan account by opening <a href="${escapeHtml(link)}">this link</a>.</p>`,
    });
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const link = this.createLink(this.resetPath, email, token);
    await this.transporter.sendMail({
      from: this.from,
      to: email,
      subject: 'Reset your GlowScan password',
      text: `Reset your password: ${link}`,
      html: `<p>Reset your GlowScan password by opening <a href="${escapeHtml(link)}">this link</a>.</p>`,
    });
  }

  private createLink(path: string, email: string, token: string): string {
    const url = new URL(path, this.frontendUrl);
    url.searchParams.set('email', email);
    url.searchParams.set('token', token);
    return url.toString();
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });
}
