import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { Resvg, initWasm } from 'npm:@resvg/resvg-wasm@2'

/**
 * Logo Calsyn — rendu PNG du vrai SVG avec ses gradients/filtres/masks.
 * Gmail strip les <filter>/<mask> des SVG inline ou servis → obligé de
 * pré-rendre côté serveur en PNG et servir l'image bitmap.
 * Render une fois au démarrage de l'instance, cache en mémoire + Cache-Control 1 an.
 */

// Logo SIMPLIFIÉ : uniquement le path violet solide + un dégradé linéaire de base
// (pas de filter/mask/feGaussianBlur qui ratent parfois au rendu resvg-wasm et
//  sortent un PNG tout noir dans Gmail). Testé multi-clients mail.
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="46" viewBox="0 0 48 46"><defs><linearGradient id="g" x1="0" y1="0" x2="48" y2="46" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#a45bff"/><stop offset="1" stop-color="#4f1dc4"/></linearGradient></defs><path fill="url(#g)" d="M25.946 44.938c-.664.845-2.021.375-2.021-.698V33.937a2.26 2.26 0 0 0-2.262-2.262H10.287c-.92 0-1.456-1.04-.92-1.788l7.48-10.471c1.07-1.497 0-3.578-1.842-3.578H1.237c-.92 0-1.456-1.04-.92-1.788L10.013.474c.214-.297.556-.474.92-.474h28.894c.92 0 1.456 1.04.92 1.788l-7.48 10.471c-1.07 1.498 0 3.579 1.842 3.579h11.377c.943 0 1.473 1.088.89 1.83L25.947 44.94z"/></svg>`

// Cache-bust v2 : rendu simplifié sans filters/mask, deploy 2026-04-15 06:45
let cachedPng: Uint8Array | null = null
let wasmReady = false

async function ensureWasm() {
  if (wasmReady) return
  const wasmRes = await fetch('https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm')
  const wasmBytes = await wasmRes.arrayBuffer()
  await initWasm(wasmBytes)
  wasmReady = true
}

async function renderPng(): Promise<Uint8Array> {
  if (cachedPng) return cachedPng
  await ensureWasm()
  const resvg = new Resvg(SVG, {
    fitTo: { mode: 'width', value: 256 },
    background: 'rgba(255,255,255,0)',
  })
  const png = resvg.render().asPng()
  cachedPng = png
  return png
}

Deno.serve(async () => {
  try {
    const png = await renderPng()
    return new Response(png, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': 'https://calsyn.app',
      },
    })
  } catch (e) {
    return new Response(`logo render error: ${(e as Error).message}`, { status: 500 })
  }
})
