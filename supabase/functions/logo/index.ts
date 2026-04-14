import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

/**
 * Logo Callio — version email-compat.
 * Gmail/Outlook strippent <filter> et <mask> du SVG pour sécurité →
 * le logo original apparaissait NOIR (path de base sans les effets colorés).
 * Ici : même path, rempli avec linearGradient violet → indigo
 * qui reproduit fidèlement la couleur du logo affiché dans l'app.
 */
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="46" viewBox="0 0 48 46">
<defs>
<linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
<stop offset="0%" stop-color="#A66BFF"/>
<stop offset="55%" stop-color="#863bff"/>
<stop offset="100%" stop-color="#4f1dc4"/>
</linearGradient>
</defs>
<path fill="url(#g)" d="M25.946 44.938c-.664.845-2.021.375-2.021-.698V33.937a2.26 2.26 0 0 0-2.262-2.262H10.287c-.92 0-1.456-1.04-.92-1.788l7.48-10.471c1.07-1.497 0-3.578-1.842-3.578H1.237c-.92 0-1.456-1.04-.92-1.788L10.013.474c.214-.297.556-.474.92-.474h28.894c.92 0 1.456 1.04.92 1.788l-7.48 10.471c-1.07 1.498 0 3.579 1.842 3.579h11.377c.943 0 1.473 1.088.89 1.83L25.947 44.94z"/>
</svg>`

Deno.serve(() => {
  return new Response(SVG, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*',
    },
  })
})
