/**
 * emailQuote — strip les parties citées (replies) des emails pour affichage.
 *
 * Couvre Gmail, Outlook, Apple Mail, Gmail mobile, FR + EN.
 * Permet d'afficher uniquement le NOUVEAU contenu d'une réponse, pas le
 * thread historique (qui est déjà visible message par message dans la conv).
 */

/** Strip HTML quotes (Gmail web blockquote, Outlook divRplyFwdMsg, etc.). */
export function stripGmailQuote(html: string): string {
  let out = html

  // Outlook : tout le bloc reply commence par <div id="divRplyFwdMsg"> ou
  // <div id="appendonsend"></div><hr> ou un <hr> isolé qui sépare la réponse.
  // On coupe à partir du premier de ces marqueurs.
  const outlookMarkers = [
    /<div\s+id=["']appendonsend["'][^>]*>/i,
    /<div\s+id=["']divRplyFwdMsg["'][^>]*>/i,
    /<hr\s+[^>]*style=["'][^"']*(display:\s*inline-block|width:\s*\d+%)[^"']*["'][^>]*>/i,
    /<div\s+class=["'][^"']*OutlookMessageHeader[^"']*["'][^>]*>/i,
  ]
  for (const re of outlookMarkers) {
    const m = out.match(re)
    if (m && m.index !== undefined) {
      out = out.slice(0, m.index) + '</body></html>'
      break
    }
  }

  // Gmail / Apple Mail / Yahoo / autres
  out = out
    .replace(/<blockquote[^>]*>[\s\S]*?<\/blockquote>/gi, '')
    .replace(/<div\s+class=["']gmail_quote["'][^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<div\s+class=["']gmail_attr["'][^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<div[^>]*class=["'][^"']*WordSection1[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '')
    // "On [date], [name] wrote:" en HTML brut
    .replace(/<[^>]*>\s*On\s+.+?\s+wrote:\s*<\/[^>]+>[\s\S]*$/i, '')
    // "Le [date], [name] a écrit :" FR
    .replace(/<[^>]*>\s*Le\s+.+?\s+a\s+écrit\s*:\s*<\/[^>]+>[\s\S]*$/i, '')

  return out
}

/** Strip plain-text quotes (Outlook, Apple Mail, Gmail mobile, FR+EN). */
export function stripPlainTextQuote(text: string): string {
  if (!text) return text
  const cutPatterns: RegExp[] = [
    // Outlook : ligne d'underscores ou tirets séparant la réponse
    /\n\s*_{3,}\s*\n[\s\S]*$/i,
    // "From: ... Sent: ..." (Outlook EN)
    /\n\s*From:\s+.+[\r\n]+\s*Sent:[\s\S]*$/i,
    // "De : ... Date : ..." / "De : ... Envoyé : ..." (Outlook FR)
    /\n\s*De\s*:\s+.+[\r\n]+\s*(Date|Envoyé)\s*:[\s\S]*$/i,
    // Gmail FR mobile : "Le [date] à [heure], [nom] a écrit :"
    /\n\s*Le\s+\S+\s+\d+\s+\S+\s+\d{4}[,\s]+(à\s+)?\d+:\d+[\s\S]*$/i,
    // Apple Mail / Gmail EN : "On [date], [name] wrote:"
    /\n\s*On\s+.+\s+wrote:[\s\S]*$/i,
    // "-----Original Message-----" / "----- Message d'origine -----"
    /\n\s*-{2,}\s*(Original Message|Message d['']origine|Forwarded message|Message transféré)\s*-{2,}[\s\S]*$/i,
    // Bloc de quote ">" (multi-line, démarrage en début de ligne)
    /\n\s*>\s.+(\n\s*>.+)*[\s\S]*$/,
  ]
  let out = text
  for (const re of cutPatterns) {
    out = out.replace(re, '')
  }
  return out.trimEnd()
}
