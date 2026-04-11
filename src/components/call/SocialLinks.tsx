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
}

interface Social {
  id: string
  platform: string
  url: string
}

const PLATFORMS: Record<string, { label: string; color: string; icon: string }> = {
  linkedin:  { label: 'LinkedIn', color: '#0A66C2', icon: 'in' },
  instagram: { label: 'Instagram', color: '#E4405F', icon: 'ig' },
  facebook:  { label: 'Facebook', color: '#1877F2', icon: 'fb' },
  twitter:   { label: 'X / Twitter', color: '#000000', icon: 'X' },
  tiktok:    { label: 'TikTok', color: '#000000', icon: 'tk' },
  pinterest: { label: 'Pinterest', color: '#BD081C', icon: 'pi' },
  youtube:   { label: 'YouTube', color: '#FF0000', icon: 'yt' },
  behance:   { label: 'Behance', color: '#1769FF', icon: 'be' },
  dribbble:  { label: 'Dribbble', color: '#EA4C89', icon: 'dr' },
  snapchat:  { label: 'Snapchat', color: '#FFFC00', icon: 'sc' },
  website:   { label: 'Site web', color: '#6b7280', icon: '🌐' },
  other:     { label: 'Autre', color: '#6b7280', icon: '🔗' },
}

/** Détecte la plateforme depuis l'URL */
function detectPlatform(url: string): string {
  const u = url.toLowerCase()
  if (u.includes('linkedin.com')) return 'linkedin'
  if (u.includes('instagram.com')) return 'instagram'
  if (u.includes('facebook.com') || u.includes('fb.com')) return 'facebook'
  if (u.includes('twitter.com') || u.includes('x.com')) return 'twitter'
  if (u.includes('tiktok.com')) return 'tiktok'
  if (u.includes('pinterest.com') || u.includes('pin.it')) return 'pinterest'
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube'
  if (u.includes('behance.net')) return 'behance'
  if (u.includes('dribbble.com')) return 'dribbble'
  if (u.includes('snapchat.com')) return 'snapchat'
  return 'website'
}

function PlatformIcon({ platform, size = 'sm' }: { platform: string; size?: 'sm' | 'md' }) {
  const p = PLATFORMS[platform] || PLATFORMS.other
  const s = size === 'sm' ? 'w-5 h-5 text-[7px]' : 'w-6 h-6 text-[8px]'
  return (
    <div className={`${s} rounded flex items-center justify-center font-bold flex-shrink-0`}
      style={{ background: p.color + '15', color: p.color }}
      title={p.label}>
      {p.icon.length <= 2 ? p.icon : <span className="text-[10px]">{p.icon}</span>}
    </div>
  )
}

export { PlatformIcon, detectPlatform }

export default function SocialLinks({ prospectId }: Props) {
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

  return (
    <div>
      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Réseaux sociaux</span>
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
            Ajouter un réseau social
          </button>
        )}
      </div>
    </div>
  )
}
