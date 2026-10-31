import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend;
  private readonly from: string;
  private readonly webUrl: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    this.resend = new Resend(apiKey);
    this.from = this.configService.get<string>('EMAIL_FROM', 'NOVA <notifications@mail.novainternationalnurses.com>');
    this.webUrl = this.configService.get<string>('WEB_URL', 'http://localhost:3000');
  }

  /**
   * Sends a staff invitation email with a secure token link.
   * The link directs the user to the accept-invite page where they create their password.
   */
  async sendInvitationEmail(opts: {
    to: string;
    firstName: string;
    lastName: string;
    role: string;
    invitationToken: string;
    expiresAt: Date;
  }): Promise<void> {
    const inviteUrl = `${this.webUrl}/accept-invite?token=${opts.invitationToken}`;
    const expiryDate = opts.expiresAt.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const roleLabel = opts.role
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You've been invited to NOVA</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:#0f172a;padding:32px 40px;text-align:center;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">NOVA</p>
              <p style="margin:4px 0 0;font-size:12px;color:#94a3b8;letter-spacing:0.5px;text-transform:uppercase;">International Nurses</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <p style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0f172a;line-height:1.3;">
                You're invited, ${opts.firstName}!
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
                You've been invited to join the NOVA clinical operations platform as a <strong style="color:#0f172a;">${roleLabel}</strong>. Click the button below to set your password and activate your account.
              </p>

              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
                <tr>
                  <td style="background:#2563eb;border-radius:8px;">
                    <a href="${inviteUrl}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                      Accept Invitation &amp; Set Password
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Info box -->
              <table cellpadding="0" cellspacing="0" width="100%" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Invitation details</p>
                    <p style="margin:0;font-size:14px;color:#0f172a;"><strong>Email:</strong> ${opts.to}</p>
                    <p style="margin:4px 0 0;font-size:14px;color:#0f172a;"><strong>Role:</strong> ${roleLabel}</p>
                    <p style="margin:4px 0 0;font-size:14px;color:#dc2626;"><strong>Expires:</strong> ${expiryDate}</p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:13px;color:#64748b;line-height:1.6;">
                If the button above doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin:0 0 24px;font-size:12px;color:#2563eb;word-break:break-all;">
                <a href="${inviteUrl}" style="color:#2563eb;">${inviteUrl}</a>
              </p>

              <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6;">
                If you weren't expecting this invitation, you can safely ignore this email. The link will expire on ${expiryDate}.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                NOVA International Nurses &bull; Secure Clinical Operations Platform
              </p>
              <p style="margin:4px 0 0;font-size:11px;color:#cbd5e1;">
                This is an automated message. Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    try {
      const result = await this.resend.emails.send({
        from: this.from,
        to: opts.to,
        subject: `You've been invited to join NOVA as ${roleLabel}`,
        html,
      });

      if (result.error) {
        this.logger.error(`Resend error for ${opts.to}: ${JSON.stringify(result.error)}`);
        throw new Error(`Email delivery failed: ${result.error.message}`);
      }

      this.logger.log(`Invitation email sent to ${opts.to} (Resend ID: ${result.data?.id})`);
    } catch (err: any) {
      this.logger.error(`Failed to send invitation email to ${opts.to}: ${err.message}`);
      throw err;
    }
  }
}

