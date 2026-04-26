/**
 * DuplicatesDetector — Modal HubSpot-style pour détecter les doublons.
 *
 * Scanne tous les prospects de l'org, regroupe les candidats par :
 *  - email exact (lowercase trimmé)
 *  - téléphone normalisé (n'importe lequel des phone1..5)
 *  - nom normalisé (sans accents, lowercase) + même domaine email
 *
 * Pour chaque groupe : affiche les fiches côte-à-côte avec un bouton
 * "Fusionner" (RPC merge_prospects) et "Ignorer" (persisté en localStorage).
 */

import { useState, useMemo } from 'react'
import { supabase } from '@/config/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { normalizePhone } from '@/utils/phone'
import type { Prospect } from '@/types/prospect'

const IGNORE_KEY = 'crm-dup-ignored-v1'

interface ProspectLite extends Prospect {
  listNames?: string[]
}

interface DuplicateGroup {
  key: string
  reason: 'email' | 'phone' | 'name'
  reasonLabel: string
  prospects: ProspectLite[]
}

function normalizeName(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // accents
    .replace(/[._\-,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function emailKey(s: string | null | undefined): string {
  if (!s) return ''
  return s.toLowerCase().trim()
}

function phoneKey(s: string | null | undefined): string {
  if (!s) return ''
  return normalizePhone(s) || ''
}

function emailDomain(s: string | null | undefined): string {
  if (!s) return ''
  const idx = s.indexOf('@')
  return idx > -1 ? s.slice(idx + 1).toLowerCase() : ''
}

function getIgnored(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(IGNORE_KEY) || '[]'))
  } catch { return new Set() }
}

function setIgnored(ignored: Set<string>) {
  try { localStorage.setItem(IGNORE_KEY, JSON.stringify(Array.from(ignored))) } catch { /* */ }
}

export default function DuplicatesDetector({
  prospects,
  onClose,
  onProspectClick,
}: {
  prospects: ProspectLite[]
  onClose: () => void
  onProspectClick?: (p: ProspectLite) => void
}) {
  const queryClient = useQueryClient()
  const [ignored, setIgnoredState] = useState<Set<string>>(getIgnored())
  const [merging, setMerging] = useState<string | null>(null)

  const groups = useMemo<DuplicateGroup[]>(() => {
    const out: DuplicateGroup[] = []
    const byEmail = new Map<string, ProspectLite[]>()
    const byPhone = new Map<string, ProspectLite[]>()
    const byName = new Map<string, ProspectLite[]>()

    for (const p of prospects) {
      // Email
      const e = emailKey(p.email)
      if (e) {
        if (!byEmail.has(e)) byEmail.set(e, [])
        byEmail.get(e)!.push(p)
      }
      // Téléphones (tous)
      const phones = [p.phone, (p as any).phone2, (p as any).phone3, (p as any).phone4, (p as any).phone5]
      for (const ph of phones) {
        const k = phoneKey(ph)
        if (!k) continue
        if (!byPhone.has(k)) byPhone.set(k, [])
        const arr = byPhone.get(k)!
        if (!arr.some(x => x.id === p.id)) arr.push(p)
      }
      // Nom normalisé seul (prénom + nom, len > 6) pour matcher cas comme
      // "amandine.lasa" (Gmail) vs "amandine lasa" (calendrier) qui n'ont
      // pas le même email/domaine. Faux positifs gérables via "Ignorer".
      const n = normalizeName(p.name)
      if (n && n.length > 6 && n.includes(' ')) {
        if (!byName.has(n)) byName.set(n, [])
        byName.get(n)!.push(p)
      }
    }

    function pushGroup(reason: 'email' | 'phone' | 'name', reasonLabel: string, key: string, list: ProspectLite[]) {
      if (list.length < 2) return
      const ids = list.map(p => p.id).sort()
      const groupKey = `${reason}:${ids.join(',')}`
      if (ignored.has(groupKey)) return
      out.push({ key: groupKey, reason, reasonLabel, prospects: list })
    }

    for (const [k, list] of byEmail) pushGroup('email', `Même email (${k})`, k, list)
    for (const [k, list] of byPhone) pushGroup('phone', `Même téléphone (${k})`, k, list)
    for (const [k, list] of byName) {
      // Skip si déjà couvert par email/phone (évite doublon de groupe)
      const ids = list.map(p => p.id).sort().join(',')
      const alreadyCovered = out.some(g => g.prospects.map(p => p.id).sort().join(',') === ids)
      if (alreadyCovered) continue
      pushGroup('name', `Nom similaire (${k})`, k, list)
    }

    return out
  }, [prospects, ignored])

  async function handleMerge(g: DuplicateGroup) {
    setMerging(g.key)
    try {
      // Canonique = le plus ancien
      const sorted = [...g.prospects].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      const canonical = sorted[0]
      const dups = sorted.slice(1)
      const { data, error } = await supabase.rpc('merge_prospects', {
        p_canonical_id: canonical.id,
        p_dup_ids: dups.map(d => d.id),
      })
      if (error) { alert(`Erreur fusion : ${error.message}`); return }
      const merged = (data as Array<{ merged_count: number }>)?.[0]?.merged_count || 0
      await queryClient.invalidateQueries({ queryKey: ['all-prospects'] })
      await queryClient.invalidateQueries({ queryKey: ['prospect-list-memberships'] })
      await queryClient.invalidateQueries({ queryKey: ['prospects'] })
      // Auto-ignore le groupe (les fiches archivées vont disparaître à la prochaine query)
      const next = new Set(ignored); next.add(g.key); setIgnored(next); setIgnoredState(next)
      console.log(`✅ Fusion : ${merged} fiche${merged > 1 ? 's' : ''} dans "${canonical.name}".`)
    } finally {
      setMerging(null)
    }
  }

  function handleIgnore(g: DuplicateGroup) {
    const next = new Set(ignored); next.add(g.key); setIgnored(next); setIgnoredState(next)
  }

  function handleResetIgnored() {
    if (!confirm('Réafficher tous les doublons précédemment ignorés ?')) return
    setIgnored(new Set()); setIgnoredState(new Set())
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-3 border-b border-gray-200 flex items-center gap-3 bg-gradient-to-r from-violet-50 to-indigo-50">
          <div className="text-[15px]">🔍</div>
          <div className="flex-1">
            <div className="text-[14px] font-bold text-gray-800">Détecteur de doublons</div>
            <div className="text-[11px] text-gray-500">{groups.length} groupe{groups.length > 1 ? 's' : ''} détecté{groups.length > 1 ? 's' : ''} sur {prospects.length} contacts</div>
          </div>
          {ignored.size > 0 && (
            <button onClick={handleResetIgnored} className="text-[10px] text-gray-500 hover:text-gray-700 underline">
              Réinitialiser ignorés ({ignored.size})
            </button>
          )}
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {groups.length === 0 && (
            <div className="text-center py-12 text-[13px] text-gray-400">
              <div className="text-3xl mb-2">✨</div>
              Aucun doublon détecté !
            </div>
          )}
          {groups.map(g => (
            <div key={g.key} className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-3 py-1.5 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
                <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                  g.reason === 'email' ? 'bg-emerald-100 text-emerald-700' :
                  g.reason === 'phone' ? 'bg-blue-100 text-blue-700' :
                  'bg-purple-100 text-purple-700'
                }`}>{g.reason}</span>
                <span className="text-[11px] text-gray-700 flex-1">{g.reasonLabel}</span>
                <button onClick={() => handleIgnore(g)} className="text-[10px] text-gray-500 hover:text-gray-700">
                  Ignorer
                </button>
                <button
                  onClick={() => handleMerge(g)}
                  disabled={merging === g.key}
                  className="text-[11px] font-semibold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 px-2.5 py-1 rounded"
                >
                  {merging === g.key ? 'Fusion...' : '⚭ Fusionner'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-px bg-gray-100">
                {g.prospects.map((p, idx) => {
                  const inner = (
                    <>
                      {idx === 0 && (
                        <div className="text-[9px] uppercase font-bold text-violet-600 mb-1">Canonique (gardé)</div>
                      )}
                      <div className="font-semibold text-gray-800 mb-1 hover:text-indigo-600">{p.name || '(sans nom)'}</div>
                      {p.email && <div className="text-gray-600 truncate">📧 {p.email}</div>}
                      {p.phone && <div className="text-gray-600">📞 {p.phone}</div>}
                      {(p as any).phone2 && <div className="text-gray-500">📞 {(p as any).phone2}</div>}
                      {p.listNames && p.listNames.length > 0 && (
                        <div className="text-[10px] text-gray-400 mt-1 truncate">📋 {p.listNames.join(', ')}</div>
                      )}
                      <div className="text-[9px] text-gray-400 mt-1">Créé le {new Date(p.created_at).toLocaleDateString('fr-FR')}</div>
                    </>
                  )
                  return onProspectClick ? (
                    <button key={p.id} onClick={() => onProspectClick(p)}
                      className="bg-white p-3 text-[11px] text-left hover:bg-indigo-50 transition-colors cursor-pointer">
                      {inner}
                    </button>
                  ) : (
                    <div key={p.id} className="bg-white p-3 text-[11px]">{inner}</div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-2 border-t border-gray-200 bg-gray-50 text-[10px] text-gray-500 flex items-center gap-2">
          <span>💡 Le canonique gardé = le plus ancien. Toutes les infos sont fusionnées (emails, tels, appels, RDV, listes).</span>
        </div>
      </div>
    </div>
  )
}
