import nodemailer, { Transporter } from 'nodemailer';
import settings from '../config/settings';
import logger from './logger';

class EmailService {
  private transporter: Transporter | null = null;

  initialize(): void {
    if (!settings.email.auth.user || !settings.email.auth.pass) {
      logger.warn('Email credentials not configured. Email functionality will be disabled.');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: settings.email.host,
      port: settings.email.port,
      secure: settings.email.secure,
      auth: {
        user: settings.email.auth.user,
        pass: settings.email.auth.pass
      }
    });
  }

  async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    if (!this.transporter) {
      logger.error('Email service not initialized. Please configure email settings.');
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: settings.email.from,
        to,
        subject,
        html
      });

      return true;
    } catch (error) {
      logger.error({ error }, 'Error sending email');
      return false;
    }
  }

  async sendVerificationEmail(to: string, token: string, username: string): Promise<boolean> {
    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${token}`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Verify Your Email</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #4CAF50;">Welcome ${username}!</h2>
            <p>Thank you for registering. Please verify your email address by clicking the button below:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verificationUrl}" style="background-color: #4CAF50; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                Verify Email
              </a>
            </div>
            <p>Or copy and paste this link in your browser:</p>
            <p style="word-break: break-all; color: #666;">${verificationUrl}</p>
            <p style="margin-top: 30px; color: #999; font-size: 12px;">
              If you didn't create this account, please ignore this email.
            </p>
          </div>
        </body>
      </html>
    `;

    return this.sendEmail(to, 'Verify Your Email Address', html);
  }

  async sendPasswordResetEmail(to: string, token: string, username: string): Promise<boolean> {
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${token}`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Reset Your Password</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #FF5722;">Password Reset Request</h2>
            <p>Hi ${username},</p>
            <p>We received a request to reset your password. Click the button below to create a new password:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background-color: #FF5722; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                Reset Password
              </a>
            </div>
            <p>Or copy and paste this link in your browser:</p>
            <p style="word-break: break-all; color: #666;">${resetUrl}</p>
            <p style="margin-top: 30px; color: #999; font-size: 12px;">
              If you didn't request a password reset, please ignore this email. This link will expire in 1 hour.
            </p>
          </div>
        </body>
      </html>
    `;

    return this.sendEmail(to, 'Reset Your Password', html);
  }

  async sendPasswordChangedEmail(to: string, username: string): Promise<boolean> {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Password Changed</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #4CAF50;">Password Changed Successfully</h2>
            <p>Hi ${username},</p>
            <p>This email confirms that your password has been changed successfully.</p>
            <p style="margin-top: 30px; color: #999; font-size: 12px;">
              If you didn't make this change, please contact support immediately.
            </p>
          </div>
        </body>
      </html>
    `;

    return this.sendEmail(to, 'Password Changed Successfully', html);
  }
}

export default new EmailService();
