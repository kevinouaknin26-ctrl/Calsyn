/**
 * SocialLinks — Gestion des réseaux sociaux d'un prospect.
 * Détection auto du réseau par URL. Logos dynamiques.
 * "Ajouter un réseau social" avec détection automatique.
 */

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/config/supabase'

interface Props {
  prospectId: string
  compact?: boolean
}

interface Social {
  id: string
  platform: string
  url: string
}

const PLATFORMS: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  linkedin:  { label: 'LinkedIn', color: '#ffffff', bg: '#0A66C2', icon: 'in' },
  instagram: { label: 'Instagram', color: '#ffffff', bg: '#E4405F', icon: 'ig' },
  facebook:  { label: 'Facebook', color: '#ffffff', bg: '#1877F2', icon: 'fb' },
  twitter:   { label: 'X / Twitter', color: '#ffffff', bg: '#000000', icon: 'X' },
  tiktok:    { label: 'TikTok', color: '#ffffff', bg: '#010101', icon: 'tk' },
  pinterest: { label: 'Pinterest', color: '#ffffff', bg: '#BD081C', icon: 'Pi' },
  youtube:   { label: 'YouTube', color: '#ffffff', bg: '#FF0000', icon: 'yt' },
  behance:   { label: 'Behance', color: '#ffffff', bg: '#1769FF', icon: 'Be' },
  dribbble:  { label: 'Dribbble', color: '#ffffff', bg: '#EA4C89', icon: 'Dr' },
  snapchat:  { label: 'Snapchat', color: '#000000', bg: '#FFFC00', icon: 'Sc' },
  website:   { label: 'Site web', color: '#ffffff', bg: '#6b7280', icon: '🌐' },
  other:     { label: 'Autre', color: '#ffffff', bg: '#6b7280', icon: '🔗' },
}

/** Détecte la plateforme depuis l'URL ou texte brut */
function detectPlatform(url: string): string {
  const u = url.toLowerCase().trim()
  if (u.includes('linkedin.com') || u.includes('linkedin.fr')) return 'linkedin'
  if (u.includes('instagram.com') || u.startsWith('insta:') || u.startsWith('ig:') || u.startsWith('@') && !u.includes('@') ) return 'instagram'
  if (u.includes('facebook.com') || u.includes('fb.com') || u.includes('fb.me')) return 'facebook'
  if (u.includes('twitter.com') || u.includes('x.com')) return 'twitter'
  if (u.includes('tiktok.com')) return 'tiktok'
  if (u.includes('pinterest.com') || u.includes('pin.it')) return 'pinterest'
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube'
  if (u.includes('behance.net')) return 'behance'
  if (u.includes('dribbble.com')) return 'dribbble'
  if (u.includes('snapchat.com')) return 'snapchat'
  if (u.includes('artmajeur.com')) return 'website'
  if (u.includes('canva.com')) return 'website'
  if (u.includes('blogspot.') || u.includes('wordpress.')) return 'website'
  return 'website'
}

/** Extrait les URLs et réseaux sociaux depuis une liste de valeurs texte.
 * Retourne des paires { platform, url } prêtes à insérer dans prospect_socials. */
export function extractSocialsFromValues(values: Array<{ value: string }>): Array<{ platform: string; url: string }> {
  const results: Array<{ platform: string; url: string }> = []
  const seen = new Set<string>()

  for (const { value } of values) {
    if (!value) continue
    const v = value.trim()

    // URL directe
    if (v.startsWith('http://') || v.startsWith('https://') || v.startsWith('www.')) {
      const url = v.startsWith('www.') ? `https://${v}` : v
      const platform = detectPlatform(url)
      const key = `${platform}:${url.toLowerCase()}`
      if (!seen.has(key)) {
        seen.add(key)
        results.push({ platform, url })
      }
      continue
    }

    // Format texte "insta: username" ou "instagram: @username"
    const textPatterns = [
      { prefix: /^insta(?:gram)?[\s:]+/i, platform: 'instagram', urlBase: 'https://instagram.com/' },
      { prefix: /^fb[\s:]+/i, platform: 'facebook', urlBase: 'https://facebook.com/' },
      { prefix: /^linkedin[\s:]+/i, platform: 'linkedin', urlBase: 'https://linkedin.com/in/' },
      { prefix: /^twitter[\s:]+/i, platform: 'twitter', urlBase: 'https://x.com/' },
      { prefix: /^tiktok[\s:]+/i, platform: 'tiktok', urlBase: 'https://tiktok.com/@' },
      { prefix: /^youtube[\s:]+/i, platform: 'youtube', urlBase: 'https://youtube.com/' },
    ]

    for (const { prefix, platform, urlBase } of textPatterns) {
      const match = v.match(prefix)
      if (match) {
        const handle = v.slice(match[0].length).replace(/^@/, '').trim()
        if (handle) {
          const url = urlBase + handle
          const key = `${platform}:${url.toLowerCase()}`
          if (!seen.has(key)) {
            seen.add(key)
            results.push({ platform, url })
          }
        }
        break
      }
    }

    // URL sans protocole — SEULEMENT si ça ressemble à un domaine pur (pas de spaces, pas de phrase)
    // Ex: "artmajeur.com/john" → oui, "J'ai un site artmajeur.com" → non
    if (!v.includes(' ') && /^[a-zA-Z0-9][a-zA-Z0-9.-]*\.(com|fr|net|org|io|art|gallery|studio|shop)(\/|$)/i.test(v)) {
      const url = `https://${v}`
      const platform = detectPlatform(url)
      const key = `${platform}:${url.toLowerCase()}`
      if (!seen.has(key)) {
        seen.add(key)
        results.push({ platform, url })
      }
    }
  }

  return results
}

function PlatformIcon({ platform, size = 'sm' }: { platform: string; size?: 'sm' | 'md' }) {
  const p = PLATFORMS[platform] || PLATFORMS.other
  const s = size === 'sm' ? 'w-5 h-5' : 'w-6 h-6'
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'

  const svgIcons: Record<string, JSX.Element> = {
    linkedin: <svg className={iconSize} viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>,
    instagram: <svg className={iconSize} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>,
    facebook: <svg className={iconSize} viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>,
    twitter: <svg className={iconSize} viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>,
    tiktok: <svg className={iconSize} viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>,
    pinterest: <svg className={iconSize} viewBox="0 0 24 24" fill="currentColor"><path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 01.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12.017 24c6.624 0 11.99-5.367 11.99-11.988C24.007 5.367 18.641 0 12.017 0z"/></svg>,
    youtube: <svg className={iconSize} viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>,
    snapchat: <svg className={iconSize} viewBox="0 0 24 24" fill="currentColor"><path d="M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3-.016.659-.12 1.033-.301.165-.088.344-.104.464-.104.182 0 .359.029.509.09.45.149.734.479.734.838.015.449-.39.839-1.213 1.168-.089.029-.209.075-.344.119-.45.135-1.139.36-1.333.81-.09.21-.061.524.12.868l.015.015c.06.136 1.526 3.475 4.791 4.014.255.044.435.27.42.509 0 .075-.015.149-.045.225-.24.569-1.273.988-3.146 1.271-.059.091-.12.375-.164.57-.029.179-.074.36-.134.553-.076.271-.27.405-.555.405h-.03a3.3 3.3 0 01-.529-.06c-.135-.015-.33-.046-.569-.046-.39 0-.84.076-1.334.271a6.1 6.1 0 00-.614.314c-.655.375-1.393.804-2.727.804h-.06c-1.334 0-2.072-.429-2.727-.804a5.838 5.838 0 00-.614-.314c-.494-.195-.943-.271-1.334-.271-.24 0-.434.031-.569.046a3.3 3.3 0 01-.529.06c-.285 0-.479-.134-.555-.405a4.1 4.1 0 01-.134-.553c-.045-.195-.105-.479-.165-.57-1.872-.283-2.905-.702-3.146-1.271a.49.49 0 01-.044-.225c-.015-.24.165-.465.42-.509 3.264-.54 4.73-3.879 4.791-4.02l.016-.029c.18-.345.21-.659.119-.869-.195-.434-.884-.659-1.332-.809a3.7 3.7 0 01-.345-.12c-.604-.239-1.185-.6-1.185-1.095 0-.359.285-.689.734-.838a1.27 1.27 0 01.51-.09c.12 0 .3.015.449.104.375.18.72.301 1.034.301.21 0 .33-.045.406-.091 0-.165-.015-.33-.03-.509l-.003-.06c-.104-1.628-.229-3.654.3-4.847C7.86 1.069 11.216.793 12.206.793z"/></svg>,
    behance: <svg className={iconSize} viewBox="0 0 24 24" fill="currentColor"><path d="M6.938 4.503c.702 0 1.34.06 1.92.188.577.13 1.07.33 1.485.61.41.28.733.65.96 1.12.225.47.338 1.05.338 1.75 0 .74-.17 1.36-.507 1.86-.338.5-.837.9-1.502 1.22.906.26 1.576.72 2.022 1.37.448.66.665 1.45.665 2.36 0 .75-.13 1.39-.41 1.93-.28.55-.66 1-1.14 1.35-.48.348-1.05.6-1.67.767-.63.16-1.29.243-2.01.243H0V4.503h6.938v.003zm-.41 5.357c.59 0 1.07-.14 1.44-.42.37-.28.554-.73.554-1.34 0-.344-.07-.625-.18-.85a1.34 1.34 0 00-.5-.53 2.1 2.1 0 00-.72-.27c-.28-.06-.57-.08-.88-.08H3.522v3.5H6.53zm.2 5.58c.34 0 .66-.04.96-.12.3-.08.56-.2.79-.37.22-.16.4-.38.53-.65.13-.27.19-.6.19-.99 0-.79-.22-1.35-.66-1.7-.44-.35-1.03-.53-1.76-.53H3.52v4.35h3.2v.01zM15.85 14.09c.37.36.84.54 1.41.54.41 0 .77-.1 1.08-.29.31-.19.52-.41.63-.65h2.09c-.34 1.06-.85 1.82-1.53 2.29-.68.47-1.51.7-2.48.7-.7 0-1.32-.12-1.88-.36a4.07 4.07 0 01-1.41-1.01c-.39-.43-.69-.94-.89-1.55-.21-.61-.31-1.28-.31-2 0-.69.11-1.35.31-1.96.21-.61.51-1.14.89-1.58.39-.44.85-.78 1.4-1.03.56-.25 1.17-.37 1.86-.37.78 0 1.45.15 2 .47.56.31 1.01.73 1.35 1.27.35.54.59 1.15.72 1.85.14.7.17 1.44.09 2.23h-6.27c.04.72.28 1.3.65 1.66v-.01zm2.48-3.72c-.3-.32-.74-.48-1.32-.48-.39 0-.71.07-.96.21-.25.14-.44.32-.58.53-.14.21-.24.44-.29.68-.05.24-.08.47-.09.7h4.38c-.1-.67-.36-1.19-.67-1.51l-.47-.13zM22.32 7.35h-5.25v1.52h5.25V7.35z"/></svg>,
    dribbble: <svg className={iconSize} viewBox="0 0 24 24" fill="currentColor"><path d="M12 24C5.385 24 0 18.615 0 12S5.385 0 12 0s12 5.385 12 12-5.385 12-12 12zm10.12-10.358c-.35-.11-3.17-.953-6.384-.438 1.34 3.684 1.887 6.684 1.992 7.308 2.3-1.555 3.936-4.02 4.395-6.87zm-6.115 7.808c-.153-.9-.75-4.032-2.19-7.77l-.066.02c-5.79 2.015-7.86 6.025-8.04 6.4 1.73 1.358 3.92 2.166 6.29 2.166 1.42 0 2.77-.29 4-.816zm-11.62-2.58c.232-.4 3.045-5.055 8.332-6.765.135-.045.27-.084.405-.12-.26-.585-.54-1.167-.832-1.74C7.17 11.775 2.206 11.71 1.756 11.7l-.004.312c0 2.633.998 5.037 2.634 6.855zm-2.42-8.955c.46.008 4.683.026 9.477-1.248-1.698-3.018-3.53-5.558-3.8-5.928-2.868 1.35-5.01 3.99-5.676 7.17zM9.6 2.052c.282.38 2.145 2.914 3.822 6 3.645-1.365 5.19-3.44 5.373-3.702C16.88 2.573 14.55 1.5 12 1.5c-.817 0-1.612.107-2.4.277v.275zm10.335 3.483c-.218.29-1.91 2.478-5.69 4.012.228.47.45.95.657 1.432.073.17.143.338.21.505 3.407-.43 6.793.26 7.13.328-.024-2.392-.895-4.59-2.307-6.277z"/></svg>,
  }

  const svgIcon = svgIcons[platform]

  return (
    <div className={`${s} rounded flex items-center justify-center font-bold flex-shrink-0`}
      style={{ background: p.bg, color: p.color }}
      title={p.label}>
      {svgIcon || <span className="text-[7px]">{p.icon}</span>}
    </div>
  )
}

export { PlatformIcon, detectPlatform }

export default function SocialLinks({ prospectId, compact = false }: Props) {
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [newUrl, setNewUrl] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editUrl, setEditUrl] = useState('')

  const { data: socials } = useQuery({
    queryKey: ['prospect-socials', prospectId],
    queryFn: async () => {
      const { data } = await supabase.from('prospect_socials').select('*').eq('prospect_id', prospectId).order('created_at')
      return (data || []) as Social[]
    },
  })

  async function addSocial() {
    if (!newUrl.trim()) return
    const url = newUrl.trim().startsWith('http') ? newUrl.trim() : `https://${newUrl.trim()}`
    const platform = detectPlatform(url)
    await supabase.from('prospect_socials').insert({ prospect_id: prospectId, platform, url })
    await supabase.from('activity_logs').insert({ prospect_id: prospectId, action: 'social_added', details: `${PLATFORMS[platform]?.label || platform} ajouté` })
    setNewUrl('')
    setAdding(false)
    queryClient.invalidateQueries({ queryKey: ['prospect-socials', prospectId] })
  }

  async function updateSocial(id: string) {
    if (!editUrl.trim()) return
    const url = editUrl.trim().startsWith('http') ? editUrl.trim() : `https://${editUrl.trim()}`
    const platform = detectPlatform(url)
    await supabase.from('prospect_socials').update({ url, platform }).eq('id', id)
    setEditingId(null)
    queryClient.invalidateQueries({ queryKey: ['prospect-socials', prospectId] })
  }

  async function deleteSocial(id: string, platform: string) {
    await supabase.from('prospect_socials').delete().eq('id', id)
    await supabase.from('activity_logs').insert({ prospect_id: prospectId, action: 'social_removed', details: `${PLATFORMS[platform]?.label || platform} supprimé` })
    queryClient.invalidateQueries({ queryKey: ['prospect-socials', prospectId] })
  }

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {socials?.slice(0, 4).map(s => (
          <a key={s.id} href={s.url.startsWith('http') ? s.url : `https://${s.url}`} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()} title={s.url}>
            <PlatformIcon platform={s.platform} />
          </a>
        ))}
        {(socials?.length || 0) > 4 && <span className="text-[10px] text-gray-400">+{(socials?.length || 0) - 4}</span>}
        {(!socials || socials.length === 0) && <span className="text-[11px] text-gray-300">—</span>}
      </div>
    )
  }

  return (
    <div>
      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Liens</span>
      <div className="mt-1 space-y-1.5">
        {socials?.map(s => (
          <div key={s.id} className="flex items-center gap-1.5 group">
            <PlatformIcon platform={s.platform} />
            {editingId === s.id ? (
              <input autoFocus type="url" value={editUrl} onChange={e => setEditUrl(e.target.value)}
                onBlur={() => updateSocial(s.id)}
                onKeyDown={e => { if (e.key === 'Enter') updateSocial(s.id); if (e.key === 'Escape') setEditingId(null) }}
                className="flex-1 text-[12px] text-gray-600 outline-none border-b border-violet-400 bg-transparent" />
            ) : (
              <button onClick={() => { setEditingId(s.id); setEditUrl(s.url) }}
                className="flex-1 text-[12px] text-gray-500 truncate text-left hover:text-violet-600" title="Cliquer pour modifier">
                {s.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)}
              </button>
            )}
            <a href={s.url.startsWith('http') ? s.url : `https://${s.url}`} target="_blank" rel="noopener noreferrer"
              className="text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
            </a>
            <button onClick={() => deleteSocial(s.id, s.platform)}
              className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        ))}

        {/* Ajouter un réseau */}
        {adding ? (
          <div className="flex items-center gap-1.5">
            <input autoFocus type="url" value={newUrl} onChange={e => setNewUrl(e.target.value)}
              placeholder="Coller le lien du profil..."
              onKeyDown={e => { if (e.key === 'Enter') addSocial(); if (e.key === 'Escape') { setAdding(false); setNewUrl('') } }}
              className="flex-1 text-[12px] text-gray-600 outline-none border-b border-gray-200 pb-0.5 bg-transparent placeholder:text-gray-300" />
            <button onClick={addSocial} className="text-[11px] text-violet-600 font-medium">Ajouter</button>
            <button onClick={() => { setAdding(false); setNewUrl('') }} className="text-[11px] text-gray-400">Annuler</button>
          </div>
        ) : (
          <button onClick={() => setAdding(true)}
            className="text-[11px] text-gray-400 hover:text-violet-600 flex items-center gap-1 mt-0.5">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Ajouter un lien
          </button>
        )}
      </div>
    </div>
  )
}
