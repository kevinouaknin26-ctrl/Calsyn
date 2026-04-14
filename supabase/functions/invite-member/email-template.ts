export interface InviteEmailParams {
  email: string
  inviterName: string
  organisationName: string
  roleLabel: string
  licenseLabel: string
  workHoursStart: string
  workHoursEnd: string
  maxCallsPerDay: number
  actionUrl: string
  phonesCount: number
  durationLabel: string
  logoUrl: string
}

export function renderInviteEmail(p: InviteEmailParams): { subject: string; html: string; text: string } {
  const subject = `Invitation à rejoindre ${p.organisationName} sur Callio`

  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#f6f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f6f5f9;padding:40px 16px;">
  <tr><td align="center">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:560px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 20px rgba(134,59,255,0.08);">

      <tr><td align="center" style="padding:40px 40px 8px 40px;">
        <img src="${p.logoUrl}" width="64" height="61" alt="Callio" style="display:block;margin:0 auto 14px auto;border:0;">
        <div style="font-size:22px;font-weight:800;color:#0f172a;letter-spacing:-0.02em;">Callio</div>
      </td></tr>

      <tr><td align="center" style="padding:24px 40px 0 40px;">
        <h1 style="margin:0 0 12px 0;font-size:26px;font-weight:800;color:#0f172a;letter-spacing:-0.02em;line-height:1.25;text-align:center;">Bienvenue dans votre équipe</h1>
        <p style="margin:0;font-size:15px;line-height:1.6;color:#475569;text-align:center;"><strong style="color:#0f172a;">${escapeHtml(p.inviterName)}</strong> vous invite à rejoindre <strong style="color:#0f172a;">${escapeHtml(p.organisationName)}</strong> sur Callio, le dialer intelligent pour les équipes commerciales.</p>
      </td></tr>

      <tr><td align="center" style="padding:32px 40px 8px 40px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
          <td style="border-radius:10px;background:linear-gradient(135deg,#863bff 0%,#4f1dc4 100%);background-color:#863bff;">
            <a href="${p.actionUrl}" target="_blank" style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;letter-spacing:-0.01em;">Accepter l'invitation →</a>
          </td>
        </tr></table>
      </td></tr>

      <tr><td style="padding:8px 40px 0 40px;">
        <p style="margin:0;font-size:12px;line-height:1.5;color:#94a3b8;text-align:center;">Ou copiez ce lien dans votre navigateur :<br><a href="${p.actionUrl}" target="_blank" style="color:#863bff;word-break:break-all;">${p.actionUrl}</a></p>
      </td></tr>

      <tr><td style="padding:32px 40px 0 40px;">
        <p style="margin:0;font-size:12px;line-height:1.6;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:20px;">Ce lien est valide pendant ${escapeHtml(p.durationLabel)}. Si vous n'avez pas été prévenu de cette invitation, vous pouvez ignorer cet email en toute sécurité.</p>
      </td></tr>

      <tr><td style="padding:20px 40px 40px 40px;">
        <p style="margin:0;font-size:11px;line-height:1.5;color:#cbd5e1;text-align:center;">Callio · Le dialer intelligent pour les équipes commerciales<br>Des questions ? Répondez simplement à cet email.</p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`

  const text = `Bienvenue dans votre équipe

${p.inviterName} vous invite à rejoindre ${p.organisationName} sur Callio.

Accepter l'invitation :
${p.actionUrl}

Ce lien est valide pendant ${p.durationLabel}.

—
Callio · Le dialer intelligent pour les équipes commerciales`

  return { subject, html, text }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
