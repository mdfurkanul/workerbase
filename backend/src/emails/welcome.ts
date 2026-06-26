/**
 * Welcome email template — sent after superuser account creation.
 * Variables: {{appName}}, {{email}}, {{actionURL}}, {{year}}
 */
export const welcomeTemplate = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Welcome to {{appName}}</title>
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
          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 24px;text-align:center;background-color:#F38020;">
              <svg xmlns="http://www.w3.org/2000/svg" width="40" height="32" viewBox="0 0 80 64" style="display:inline-block;vertical-align:middle;">
                <path fill="#ffffff" d="M60.3 24.8c-.4-7.2-6.3-13-13.6-13-4.3 0-8.2 2-10.7 5.2-1.4-.7-3-1.1-4.7-1.1-5.2 0-9.5 3.9-10.1 8.9-4.8 1.4-8.2 5.8-8.2 11 0 6.3 5.1 11.4 11.4 11.4h32.5c6.3 0 11.4-5.1 11.4-11.4 0-5.2-3.5-9.6-8-11z"/>
                <path fill="#ffffff" opacity="0.8" d="M66.5 40.2c0 3.4-2.8 6.2-6.2 6.2H27.8c-3.4 0-6.2-2.8-6.2-6.2 0-3 2.1-5.5 4.9-6.1-.1-.4-.1-.7-.1-1.1 0-3.4 2.8-6.2 6.2-6.2 1 0 1.9.2 2.7.6 1.3-2.9 4.2-4.9 7.6-4.9 4.6 0 8.3 3.7 8.3 8.3 0 .2 0 .4-.1.6 2.7.5 4.8 2.9 4.8 5.8 0 .4 0 .7-.1 1.1 2.8.5 5 3 5 6z"/>
              </svg>
              <span style="color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:22px;font-weight:700;vertical-align:middle;margin-left:8px;">{{appName}}</span>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td class="email-body" style="padding:40px;">
              <h1 class="email-text" style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:24px;font-weight:700;color:#18181b;">Welcome to {{appName}}</h1>
              <p class="email-subtext" style="margin:0 0 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#52525b;">Your superuser account has been created for <strong style="color:#F38020;">{{email}}</strong>.</p>
              <p class="email-subtext" style="margin:0 0 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#52525b;">You now have access to the admin dashboard. Click below to get started:</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 32px;">
                    <a href="{{actionURL}}" target="_blank" style="display:inline-block;padding:14px 36px;background-color:#F38020;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">Go to Dashboard</a>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                <tr>
                  <td style="padding:24px;border-radius:8px;background-color:#fff7ed;border:1px solid #fed7aa;">
                    <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#9a3412;">As a superuser, you can manage collections, configure authentication, and oversee the entire application. Please keep your credentials secure.</p>
                  </td>
                </tr>
              </table>
              <p class="email-subtext" style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#71717a;">If you have any questions, reach out to your administrator.</p>
            </td>
          </tr>
          <!-- Footer -->
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
