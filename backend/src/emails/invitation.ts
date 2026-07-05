/**
 * User invitation template.
 * Variables: {{appName}}, {{email}}, {{actionURL}}, {{inviterName}}, {{year}}
 */
export const invitationTemplate = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>You're invited</title>
  <style>
    @media (prefers-color-scheme: dark) {
      .email-body { background-color: #1a1a1a !important; }
      .email-card { background-color: #2a2a2a !important; }
      .email-text { color: #e0e0e0 !important; }
      .email-subtext { color: #a0a0a0 !important; }
      .email-footer { color: #707070 !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" class="email-card" width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;max-width:560px;width:100%;box-shadow:0 1px 3px rgba(0,0,0,0.08);overflow:hidden;">
          <tr>
            <td style="padding:32px 40px 24px;text-align:center;background-color:#F38020;">
              <span style="color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:22px;font-weight:700;">{{appName}}</span>
            </td>
          </tr>
          <tr>
            <td class="email-body" style="padding:40px;">
              <h1 class="email-text" style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:24px;font-weight:700;color:#18181b;">You're invited to join {{appName}}</h1>
              <p class="email-subtext" style="margin:0 0 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#52525b;">Hi,</p>
              <p class="email-subtext" style="margin:0 0 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#52525b;"><strong style="color:#F38020;">{{inviterName}}</strong> has invited <strong style="color:#F38020;">{{email}}</strong> to join {{appName}}. Click the button below to accept your invitation and set up your account:</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 32px;">
                    <a href="{{actionURL}}" target="_blank" style="display:inline-block;padding:14px 36px;background-color:#F38020;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">Accept Invitation</a>
                  </td>
                </tr>
              </table>
              <p class="email-subtext" style="margin:0 0 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#71717a;">Or copy and paste this link into your browser:</p>
              <p style="margin:0 0 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#F38020;word-break:break-all;">{{actionURL}}</p>
              <p class="email-subtext" style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#71717a;">If you weren't expecting an invitation, you can safely ignore this email.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px;background-color:#f4f4f5;border-top:1px solid #e4e4e7;">
              <p class="email-footer" style="margin:0;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:#a1a1aa;">&copy; {{year}} {{appName}}. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
