import nodemailer, { Transporter } from 'nodemailer';
import logger from './logger';
import settings from '../config/settings';

const BRAND = 'DataSpider';
const BRAND_PRIMARY = '#10B981'; // emerald-500
const BRAND_PRIMARY_DARK = '#059669'; // emerald-600
const BRAND_PRIMARY_SOFT = '#D1FAE5'; // emerald-100
const BRAND_SECONDARY = '#0F172A'; // slate-900
const BRAND_SURFACE = '#F8FAFC'; // slate-50
const TEXT_PRIMARY = '#1E293B'; // slate-800
const TEXT_MUTED = '#64748B'; // slate-500
const TEXT_FAINT = '#94A3B8'; // slate-400

const baseTemplate = (content: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: ${TEXT_PRIMARY}; margin: 0; padding: 0; background-color: #f4f7f9; }
    .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.05); }
    .header { background-color: ${BRAND_SECONDARY}; padding: 40px; text-align: center; }
    .content { padding: 40px; }
    .footer { background-color: ${BRAND_SURFACE}; padding: 30px; text-align: center; border-top: 1px solid #edf2f7; }
    .button { display: inline-block; padding: 14px 32px; background-color: ${BRAND_PRIMARY}; color: #ffffff !important; text-decoration: none; border-radius: 14px; font-weight: 700; font-size: 15px; margin: 24px 0; transition: all 0.2s ease; }
    .footer-text { font-size: 13px; color: ${TEXT_FAINT}; margin: 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="color:white; margin:0; font-size:28px; letter-spacing:-0.5px;">${BRAND}<span style="color:${BRAND_PRIMARY};">.</span></h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p class="footer-text">© ${new Date().getFullYear()} DataSpider Inc. All rights reserved.</p>
      <p class="footer-text" style="margin-top:8px;">450 Tech Avenue, Silicon Valley, CA</p>
    </div>
  </div>
</body>
</html>`;

const ctaButton = (url: string, text: string) => `
  <div style="text-align: center;">
    <a href="${url}" class="button">${text}</a>
  </div>
`;

const linkText = (url: string) => `
  <span style="color:${BRAND_PRIMARY_DARK}; text-decoration:underline; word-break:break-all;">${url}</span>
`;

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
      requireTLS: true,
      auth: {
        user: settings.email.auth.user,
        pass: settings.email.auth.pass,
      },
      tls: { rejectUnauthorized: false },
    });
  }

  async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    if (!this.transporter) {
      logger.error('Email service not initialized. Please configure email settings.');
      return false;
    }

    try {
      // Ensure we only use the email address part for a cleaner "from" label
      const fromAddress = settings.email.from.includes('<') 
        ? settings.email.from.split('<')[1].replace('>', '').trim()
        : settings.email.from;

      const info = await this.transporter.sendMail({
        from: fromAddress,
        to,
        subject,
        html,
      });
      logger.info({ messageId: info.messageId, to, subject }, 'Email sent');
      return true;
    } catch (error) {
      logger.error({ error }, 'Email send failed');
      return false;
    }
  }

  async sendVerificationEmail(to: string, token: string, username: string): Promise<boolean> {
    const url = `${settings.frontendUrl}/verify-email?token=${token}`;

    const html = baseTemplate(`
      <h2 style="margin:0 0 12px;font-size:24px;color:${TEXT_PRIMARY};font-weight:700;">Verify your email</h2>
      <p style="color:${TEXT_MUTED};margin:0 0 12px;font-size:15px;line-height:1.6;">
        Hi <strong style="color:${TEXT_PRIMARY};">${username}</strong>, welcome to ${BRAND}!
      </p>
      <p style="color:${TEXT_MUTED};margin:0 0 8px;font-size:15px;line-height:1.6;">
        Click the button below to activate your account. This link expires in <strong>24 hours</strong>.
      </p>
      ${ctaButton(url, 'Verify Email Address')}
      <p style="color:${TEXT_FAINT};font-size:12px;margin-top:24px;">
        Or copy this link into your browser:<br>${linkText(url)}
      </p>
    `);

    return this.sendEmail(to, `Verify your email address`, html);
  }

  async sendPasswordResetEmail(to: string, token: string, username: string): Promise<boolean> {
    const url = `${settings.frontendUrl}/reset-password?token=${token}`;

    const html = baseTemplate(`
      <h2 style="margin:0 0 12px;font-size:24px;color:${TEXT_PRIMARY};font-weight:700;">Reset your password</h2>
      <p style="color:${TEXT_MUTED};margin:0 0 12px;font-size:15px;line-height:1.6;">
        Hi <strong style="color:${TEXT_PRIMARY};">${username}</strong>,
      </p>
      <p style="color:${TEXT_MUTED};margin:0 0 8px;font-size:15px;line-height:1.6;">
        We received a request to reset your password. Click below to choose a new one.
        This link expires in <strong>4 hours</strong>.
      </p>
      ${ctaButton(url, 'Reset Password')}
      <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:16px;margin-top:12px;">
        <p style="margin:0;font-size:13px;color:#92400E;">
          If you didn't request this, your account is safe. Just ignore this email.
        </p>
      </div>
      <p style="color:${TEXT_FAINT};font-size:12px;margin-top:24px;">
        Or copy this link into your browser:<br>${linkText(url)}
      </p>
    `);

    return this.sendEmail(to, `Reset your password`, html);
  }

  async sendPasswordChangedEmail(to: string, username: string): Promise<boolean> {
    const html = baseTemplate(`
      <h2 style="margin:0 0 12px;font-size:24px;color:${TEXT_PRIMARY};font-weight:700;">Password changed</h2>
      <p style="color:${TEXT_MUTED};margin:0 0 12px;font-size:15px;line-height:1.6;">
        Hi <strong style="color:${TEXT_PRIMARY};">${username}</strong>,
      </p>
      <p style="color:${TEXT_MUTED};margin:0;font-size:15px;line-height:1.6;">
        Your ${BRAND} password was changed successfully.
      </p>
      <div style="background:${BRAND_PRIMARY_SOFT};border:1px solid #86EFAC;border-radius:10px;padding:16px;margin-top:24px;">
        <p style="margin:0;font-size:13px;color:${BRAND_PRIMARY_DARK}; font-weight: 600;">
          Your account is secure. If you made this change, no action is needed.
        </p>
      </div>
    `);

    return this.sendEmail(to, `Your password was changed`, html);
  }

  async sendSetupPasswordEmail(to: string, token: string, username: string, projectLabel: string): Promise<boolean> {
    const url = `${settings.frontendUrl}/setup-password?token=${token}`;

    const html = baseTemplate(`
      <h2 style="margin:0 0 12px;font-size:24px;color:${TEXT_PRIMARY};font-weight:700;">Set up your password</h2>
      <p style="color:${TEXT_MUTED};margin:0 0 12px;font-size:15px;line-height:1.6;">
        Hi <strong style="color:${TEXT_PRIMARY};">${username}</strong>,
      </p>
      <p style="color:${TEXT_MUTED};margin:0 0 8px;font-size:15px;line-height:1.6;">
        Your account for <strong style="color:${TEXT_PRIMARY};">${projectLabel}</strong> is ready.
        Click below to create your password and view your offer status in the dashboard.
      </p>
      ${ctaButton(url, 'Set Password & View Status')}
      <p style="color:${TEXT_FAINT};font-size:12px;margin-top:24px;">
        Or copy this link into your browser:<br>${linkText(url)}
      </p>
    `);

    return this.sendEmail(to, `Set up your account`, html);
  }

  async sendOfferReceivedEmail(to: string, username: string): Promise<boolean> {
    const html = baseTemplate(`
      <h2 style="margin:0 0 12px;font-size:24px;color:${TEXT_PRIMARY};font-weight:700;">We received your offer!</h2>
      <p style="color:${TEXT_MUTED};margin:0 0 12px;font-size:15px;line-height:1.6;">
        Hi <strong style="color:${TEXT_PRIMARY};">${username}</strong>,
      </p>
      <p style="color:${TEXT_MUTED};margin:0 0 8px;font-size:15px;line-height:1.6;">
        Thank you for submitting your custom offer. Our team is currently reviewing your project 
        requirements and admin will contact you soon.
      </p>
      <p style="color:${TEXT_MUTED};margin:0 0 8px;font-size:15px;line-height:1.6;">
        You can check the current status of your offer anytime directly from your dashboard.
      </p>
    `);

    return this.sendEmail(to, `Your offer was received`, html);
  }

  async sendOfferInProgressEmail(to: string, username: string): Promise<boolean> {
    const html = baseTemplate(`
      <h2 style="margin:0 0 12px;font-size:24px;color:${TEXT_PRIMARY};font-weight:700;">Offer under review</h2>
      <p style="color:${TEXT_MUTED};margin:0 0 12px;font-size:15px;line-height:1.6;">
        Hi <strong style="color:${TEXT_PRIMARY};">${username}</strong>,
      </p>
      <p style="color:${TEXT_MUTED};margin:0 0 8px;font-size:15px;line-height:1.6;">
        We have received your custom offer and it is currently being reviewed by our admin.
      </p>
      <p style="color:${TEXT_MUTED};margin:0 0 8px;font-size:15px;line-height:1.6;">
        You can check the current status of your offer anytime directly from your dashboard.
      </p>
      ${ctaButton(settings.frontendUrl + '/dashboard/offers', 'Check Status in Dashboard')}
    `);

    return this.sendEmail(to, `Your offer is being reviewed`, html);
  }

  async sendOfferAcceptedEmail(to: string, paymentUrl: string, username: string): Promise<boolean> {
    const html = baseTemplate(`
      <h2 style="margin:0 0 12px;font-size:24px;color:${TEXT_PRIMARY};font-weight:700;">Offer Accepted!</h2>
      <p style="color:${TEXT_MUTED};margin:0 0 12px;font-size:15px;line-height:1.6;">
        Hi <strong style="color:${TEXT_PRIMARY};">${username}</strong>,
      </p>
      <p style="color:${TEXT_MUTED};margin:0 0 8px;font-size:15px;line-height:1.6;">
        Great news! Your custom offer has been accepted by our team.
      </p>
      <p style="color:${TEXT_MUTED};margin:0 0 8px;font-size:15px;line-height:1.6;">
        Click the button below to review the final terms and complete your payment to get started.
      </p>
      ${ctaButton(paymentUrl, 'Review & Pay')}
      <p style="color:${TEXT_FAINT};font-size:12px;margin-top:24px;">
        Or copy this link into your browser:<br>${linkText(paymentUrl)}
      </p>
    `);

    return this.sendEmail(to, `Your offer has been accepted`, html);
  }

  async sendCustomPaymentLinkEmail(
    to: string,
    username: string,
    paymentUrl: string,
    details: {
      serviceName: string;
      planName: string | null;
      priceUsdCents: number | null;
      estimatedDeliveryDate: string | null;
    }
  ): Promise<boolean> {
    const price = details.priceUsdCents 
      ? `$${(details.priceUsdCents / 100).toFixed(2)}`
      : 'Custom Price';
    
    let deliveryInfo = '';
    if (details.estimatedDeliveryDate) {
      try {
        const date = new Date(details.estimatedDeliveryDate);
        if (!isNaN(date.getTime())) {
          deliveryInfo = `<p style="color:${TEXT_MUTED};margin:8px 0 0;font-size:14px;line-height:1.6;">Estimated Delivery: <strong>${date.toLocaleDateString('en-US', { dateStyle: 'long' })}</strong></p>`;
        }
      } catch (e) {
        // Silently skip if date formatting fails
      }
    }

    const html = baseTemplate(`
      <h2 style="margin:0 0 12px;font-size:24px;color:${TEXT_PRIMARY};font-weight:700;">Ready to get started?</h2>
      <p style="color:${TEXT_MUTED};margin:0 0 12px;font-size:15px;line-height:1.6;">
        Hi <strong style="color:${TEXT_PRIMARY};">${username}</strong>,
      </p>
      <p style="color:${TEXT_MUTED};margin:0 0 16px;font-size:15px;line-height:1.6;">
        Your custom project for <strong style="color:${TEXT_PRIMARY};">${details.serviceName}</strong> has been set up. 
        Please complete the payment below to activate your service and begin work.
      </p>
      
      <div style="background:${BRAND_SURFACE};border:1px solid #edf2f7;border-radius:16px;padding:24px;margin-bottom:24px;">
        <p style="margin:0 0 8px;font-size:12px;color:${TEXT_FAINT};text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Project Summary</p>
        <p style="color:${TEXT_PRIMARY};margin:0 0 4px;font-size:16px;font-weight:600;">${details.serviceName}</p>
        ${details.planName ? `<p style="color:${TEXT_MUTED};margin:0 0 4px;font-size:14px;">Plan: ${details.planName}</p>` : ''}
        <p style="color:${BRAND_PRIMARY_DARK};margin:12px 0 0;font-size:22px;font-weight:700;">${price}</p>
        ${deliveryInfo}
      </div>

      ${ctaButton(paymentUrl, 'Complete Payment')}
      
      <p style="color:${TEXT_FAINT};font-size:12px;margin-top:24px;">
        Or copy this link into your browser:<br>${linkText(paymentUrl)}
      </p>
    `);

    return this.sendEmail(to, `Action Required: Payment for ${details.serviceName}`, html);
  }
}

export default new EmailService();
