/**
 * Template email HTML Callio — Invitation équipe.
 * Design propre, inline CSS (compat Gmail/Outlook/Apple Mail),
 * pas d'image externe (⚡ Unicode dans cercle CSS).
 */

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
}

export function renderInviteEmail(p: InviteEmailParams): { subject: string; html: string; text: string } {
  const subject = `Invitation à rejoindre ${p.organisationName} sur Callio`

  const licenseLine = p.licenseLabel === 'Aucune'
    ? ''
    : `<tr><td style="padding:6px 0;font-size:13px;color:#64748b;">Licence d'appel</td><td style="padding:6px 0;font-size:13px;color:#0f172a;font-weight:600;text-align:right;">${p.licenseLabel}</td></tr>`

  const phonesLine = p.phonesCount > 0
    ? `<tr><td style="padding:6px 0;font-size:13px;color:#64748b;">Numéros assignés</td><td style="padding:6px 0;font-size:13px;color:#0f172a;font-weight:600;text-align:right;">${p.phonesCount}</td></tr>`
    : ''

  const quotaLine = p.maxCallsPerDay > 0
    ? `<tr><td style="padding:6px 0;font-size:13px;color:#64748b;">Quota d'appels/jour</td><td style="padding:6px 0;font-size:13px;color:#0f172a;font-weight:600;text-align:right;">${p.maxCallsPerDay}</td></tr>`
    : ''

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f6f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f6f5f9;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:560px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 20px rgba(99,65,180,0.08);">
          <!-- Header logo -->
          <tr>
            <td style="padding:32px 40px 8px 40px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="width:44px;vertical-align:middle;">
                    <div style="width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#863bff 0%,#4f1dc4 100%);color:#ffffff;font-size:22px;font-weight:900;text-align:center;line-height:40px;">⚡</div>
                  </td>
                  <td style="padding-left:12px;vertical-align:middle;">
                    <span style="font-size:20px;font-weight:800;color:#0f172a;letter-spacing:-0.02em;">Callio</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Hero -->
          <tr>
            <td style="padding:24px 40px 0 40px;">
              <h1 style="margin:0 0 12px 0;font-size:26px;font-weight:800;color:#0f172a;letter-spacing:-0.02em;line-height:1.25;">
                Bienvenue dans votre équipe
              </h1>
              <p style="margin:0;font-size:15px;line-height:1.6;color:#475569;">
                <strong style="color:#0f172a;">${escapeHtml(p.inviterName)}</strong> vous invite à rejoindre
                <strong style="color:#0f172a;">${escapeHtml(p.organisationName)}</strong> sur Callio, le dialer
                intelligent pour les équipes commerciales.
              </p>
            </td>
          </tr>

          <!-- Info card -->
          <tr>
            <td style="padding:24px 40px 0 40px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px 20px;">
                <tr><td colspan="2" style="padding:4px 0 12px 0;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.1em;">Votre accès</td></tr>
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#64748b;">Adresse email</td>
                  <td style="padding:6px 0;font-size:13px;color:#0f172a;font-weight:600;text-align:right;">${escapeHtml(p.email)}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#64748b;">Rôle</td>
                  <td style="padding:6px 0;font-size:13px;color:#0f172a;font-weight:600;text-align:right;">${escapeHtml(p.roleLabel)}</td>
                </tr>
                ${licenseLine}
                ${phonesLine}
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#64748b;">Horaires de travail</td>
                  <td style="padding:6px 0;font-size:13px;color:#0f172a;font-weight:600;text-align:right;">${escapeHtml(p.workHoursStart)} – ${escapeHtml(p.workHoursEnd)}</td>
                </tr>
                ${quotaLine}
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td align="center" style="padding:32px 40px 8px 40px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="border-radius:10px;background:linear-gradient(135deg,#863bff 0%,#4f1dc4 100%);">
                    <a href="${p.actionUrl}" target="_blank" style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;letter-spacing:-0.01em;">
                      Accepter l'invitation →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Fallback link -->
          <tr>
            <td style="padding:8px 40px 0 40px;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#94a3b8;text-align:center;">
                Ou copiez ce lien dans votre navigateur :<br>
                <a href="${p.actionUrl}" target="_blank" style="color:#863bff;word-break:break-all;">${p.actionUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Notice -->
          <tr>
            <td style="padding:32px 40px 0 40px;">
              <p style="margin:0;font-size:12px;line-height:1.6;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:20px;">
                Ce lien est valide pendant ${escapeHtml(p.durationLabel)}. Si vous n'avez pas été prévenu de cette invitation, vous pouvez ignorer cet email en toute sécurité.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 32px 40px;">
              <p style="margin:0;font-size:11px;line-height:1.5;color:#cbd5e1;text-align:center;">
                Callio · Le dialer intelligent pour les équipes commerciales<br>
                Des questions ? Répondez simplement à cet email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const text = `Bienvenue dans votre équipe

${p.inviterName} vous invite à rejoindre ${p.organisationName} sur Callio.

Votre accès :
  Email : ${p.email}
  Rôle : ${p.roleLabel}${p.licenseLabel !== 'Aucune' ? `\n  Licence d'appel : ${p.licenseLabel}` : ''}${p.phonesCount > 0 ? `\n  Numéros assignés : ${p.phonesCount}` : ''}
  Horaires : ${p.workHoursStart} – ${p.workHoursEnd}${p.maxCallsPerDay > 0 ? `\n  Quota/jour : ${p.maxCallsPerDay}` : ''}

Accepter l'invitation :
${p.actionUrl}

Ce lien est valide pendant ${p.durationLabel}.

—
Callio · Le dialer intelligent pour les équipes commerciales`

  return { subject, html, text }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
