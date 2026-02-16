import { Resend } from 'resend';

// Send invitation email
export async function sendInvitationEmail(
  resendApiKey: string,
  toEmail: string,
  organizationName: string,
  invitationId: string,
  appUrl: string = 'https://yourapp.com'
): Promise<void> {
  const resend = new Resend(resendApiKey);

  await resend.emails.send({
    from: 'noreply@yourdomain.com', // Change this to your verified domain
    to: toEmail,
    subject: `You've been invited to join ${organizationName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>You've been invited!</h2>
        <p>You've been invited to join <strong>${organizationName}</strong>.</p>
        <p>Click the button below to accept the invitation:</p>
        <a href="${appUrl}/accept-invite/${invitationId}" 
           style="display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 16px 0;">
          Accept Invitation
        </a>
        <p style="color: #666; font-size: 14px;">
          This invitation will expire in 7 days.
        </p>
        <p style="color: #666; font-size: 14px;">
          If you didn't expect this invitation, you can safely ignore this email.
        </p>
      </div>
    `,
  });
}
