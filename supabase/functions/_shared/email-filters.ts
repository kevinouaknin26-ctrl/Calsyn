/**
 * Helpers partagés pour filtrer les emails automatisés et matcher par nom.
 * (Si Deno edge fn ne partagent pas via import — duplique côté chaque fn.)
 */

const AUTOMATED_LOCAL_PATTERNS = [
  'noreply', 'no-reply', 'donotreply', 'do-not-reply',
  'postmaster', 'mailer-daemon', 'mailer', 'mail-daemon',
  'notification', 'notifications', 'notif', 'notify',
  'alert', 'alerts', 'automated', 'bot', 'system',
  'newsletter', 'newsletters', 'digest', 'updates',
  'webmaster', 'admin@', 'root',
]

const AUTOMATED_DOMAINS = [
  // Productivity SaaS
  'notion.so', 'mail.notion.so',
  'slack.com', 'mail.slack.com',
  'github.com', 'noreply.github.com',
  'gitlab.com', 'mail.gitlab.com',
  'asana.com', 'trello.com', 'monday.com', 'clickup.com',
  // Email marketing
  'mailchimp.com', 'mailchimp.net', 'mcsv.net',
  'sendgrid.net', 'sendgrid.com',
  'sendinblue.com', 'sib.email',
  'mailgun.org', 'mailjet.com',
  'mandrillapp.com', 'mandrill.com',
  'amazonses.com', 'awstrack.me',
  'substack.com', 'buttondown.email',
  // Calendar / Meet
  'calendar-notification.google.com',
  'mail-noreply.google.com',
  'apps-google.com',
  // Social
  'twitter.com', 'mail.twitter.com',
  'facebookmail.com', 'fb.com',
  'linkedin.com', 'mail.linkedin.com', 'e.linkedin.com',
  'instagram.com', 'mail.instagram.com',
  'youtube.com',
  // Tech / autres
  'medium.com',
  'meetup.com', 'eventbrite.com', 'doodle.com',
  'stripe.com', 'mail.stripe.com',
  'paypal.com', 'epaypal.com',
  'figma.com', 'mail.figma.com',
  'zoom.us', 'mail.zoom.us',
  'salesforce.com', 'salesforceiq.com',
  'hubspot.com', 'mail.hubspot.com',
  'pipedrive.com',
  'intercom.io',
  'app.spotify.com', 'spotify.com',
  'amazon.com', 'amazon.fr',
  'apple.com', 'icloud.com',
]

export function isAutomatedEmail(email: string, headers: any[]): boolean {
  if (!email) return true
  const e = email.toLowerCase()
  const local = e.split('@')[0] || ''
  const domain = e.split('@')[1] || ''

  // Patterns de la partie locale
  for (const p of AUTOMATED_LOCAL_PATTERNS) {
    if (local === p || local.startsWith(`${p}-`) || local.startsWith(`${p}.`) || local.startsWith(`${p}_`)) return true
    if (local.includes(p) && (p === 'noreply' || p === 'no-reply' || p === 'donotreply' || p === 'notification' || p === 'mailer-daemon')) return true
  }

  // Domaines automatisés
  for (const d of AUTOMATED_DOMAINS) {
    if (domain === d || domain.endsWith(`.${d}`)) return true
  }

  // Headers d'auto-mailing
  const getH = (name: string) => (headers || []).find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || ''
  if (getH('list-unsubscribe')) return true
  if (getH('list-id')) return true
  if (getH('precedence').toLowerCase().includes('bulk')) return true
  if (getH('precedence').toLowerCase().includes('list')) return true
  const autoSub = getH('auto-submitted').toLowerCase()
  if (autoSub && autoSub !== 'no') return true
  if (getH('x-auto-response-suppress')) return true
  if (getH('x-mailgun-tag') || getH('x-mailchimp-id')) return true

  return false
}

/** Normalise un nom : lowercase, sans accents, espaces simples. */
export function normalizeName(name: string): string {
  return (name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ')
}
