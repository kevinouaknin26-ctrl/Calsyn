/**
 * CSVImport — Import CSV intelligent à la HubSpot.
 *
 * 1. Upload → parse CSV
 * 2. Auto-mapping :
 *    - Headers natifs (name/phone/email/company/title/sector…) reconnus
 *    - Headers qui matchent un custom field existant → auto-link
 *    - Headers inconnus → proposition "Créer un nouveau champ personnalisé"
 * 3. L'utilisateur valide ou ajuste chaque mapping
 * 4. À l'import :
 *    - Création auto des nouveaux custom fields
 *    - Insert prospects + prospect_field_values en batch
 */

import { useState, useRef, useEffect, useMemo, type ChangeEvent } from 'react'
import { useImportProspects, useProspectFields } from '@/hooks/useProspects'
import { supabase } from '@/config/supabase'
import { useAuth } from '@/hooks/useAuth'

interface Props {
  listId: string
  onClose: () => void
  onSuccess: (count: number) => void
}

type NativeField = 'name' | 'first_name' | 'last_name' | 'phone' | 'email' | 'company' | 'title' | 'sector' | 'ignore'

// Mapping pour une colonne : soit un champ natif, soit un custom existant (id),
// soit la création d'un nouveau champ custom (auto depuis le header).
type ColumnMap =
  | { kind: 'native'; field: NativeField }
  | { kind: 'existing_custom'; fieldId: string; fieldName: string }
  | { kind: 'new_custom'; name: string; type: 'text' | 'email' | 'phone' | 'url' | 'number' | 'date' }

const NATIVE_OPTIONS: Array<{ value: NativeField; label: string; group: string }> = [
  { value: 'name', label: 'Nom complet', group: 'Identité' },
  { value: 'first_name', label: 'Prénom', group: 'Identité' },
  { value: 'last_name', label: 'Nom de famille', group: 'Identité' },
  { value: 'phone', label: 'Téléphone', group: 'Contact' },
  { value: 'email', label: 'Email', group: 'Contact' },
  { value: 'company', label: 'Entreprise', group: 'Professionnel' },
  { value: 'title', label: 'Poste', group: 'Professionnel' },
  { value: 'sector', label: 'Secteur', group: 'Professionnel' },
  { value: 'ignore', label: '— Ignorer cette colonne —', group: 'Autre' },
]

function norm(h: string): string {
  return h.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
}

/** Distance/similarité pour matcher un header à un custom existant */
function similarity(a: string, b: string): number {
  const na = norm(a), nb = norm(b)
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.85
  // Jaccard sur bigrammes simple
  const bigrams = (s: string) => { const out = new Set<string>(); for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2)); return out }
  const ba = bigrams(na), bb = bigrams(nb)
  let inter = 0
  for (const b2 of ba) if (bb.has(b2)) inter++
  const union = ba.size + bb.size - inter
  return union === 0 ? 0 : inter / union
}

/** Détecte le field natif (name/phone/email/…) d'un header + ses valeurs */
function detectNative(header: string, sampleValues: string[]): NativeField | null {
  const n = norm(header)

  const exact: Record<string, NativeField> = {
    name: 'name', nom: 'name', fullname: 'name', contact: 'name', artiste: 'name',
    firstname: 'first_name', prenom: 'first_name',
    lastname: 'last_name', nomdefamille: 'last_name',
    phone: 'phone', telephone: 'phone', tel: 'phone', mobile: 'phone', numero: 'phone', gsm: 'phone', portable: 'phone',
    email: 'email', mail: 'email', courriel: 'email', adressemail: 'email',
    company: 'company', entreprise: 'company', societe: 'company', organisation: 'company', structure: 'company',
    title: 'title', poste: 'title', jobtitle: 'title', fonction: 'title',
    sector: 'sector', secteur: 'sector', industry: 'sector', industrie: 'sector',
  }
  if (exact[n]) return exact[n]

  if (n.includes('prenom') || n.includes('firstname')) return 'first_name'
  if (n.includes('nomfamille') || n.includes('lastname')) return 'last_name'
  if (n.includes('phone') || n.includes('tel') || n.includes('mobile') || n.includes('numero') || n.includes('gsm')) return 'phone'
  if (n.includes('mail') || n.includes('courriel')) return 'email'
  if (n.includes('entreprise') || n.includes('societe') || n.includes('company')) return 'company'
  if (n.includes('poste') || n.includes('title') || n.includes('fonction')) return 'title'
  if (n.includes('secteur') || n.includes('industry')) return 'sector'
  if (n === 'nom' || n.includes('contact') || n === 'name') return 'name'

  // Analyse du contenu
  const nonEmpty = sampleValues.filter(v => v.trim())
  if (nonEmpty.length === 0) return null
  const phonePattern = /^[+]?[\d\s\-.()]{8,}$/
  if (nonEmpty.filter(v => phonePattern.test(v.trim())).length >= nonEmpty.length * 0.6) return 'phone'
  if (nonEmpty.filter(v => v.includes('@')).length >= nonEmpty.length * 0.5) return 'email'
  return null
}

/** Détecte le type d'un custom field à partir du contenu */
function detectType(sampleValues: string[]): 'text' | 'email' | 'phone' | 'url' | 'number' | 'date' {
  const ne = sampleValues.filter(v => v.trim())
  if (ne.length === 0) return 'text'
  const emailR = /@/, urlR = /^https?:\/\//i, phoneR = /^[+]?[\d\s\-.()]{8,}$/
  const dateR = /^\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}/
  const numR = /^-?\d+([.,]\d+)?$/
  const ratio = (test: (v: string) => boolean) => ne.filter(test).length / ne.length
  if (ratio(v => emailR.test(v)) > 0.5) return 'email'
  if (ratio(v => urlR.test(v)) > 0.5) return 'url'
  if (ratio(v => phoneR.test(v)) > 0.6) return 'phone'
  if (ratio(v => dateR.test(v)) > 0.6) return 'date'
  if (ratio(v => numR.test(v)) > 0.8) return 'number'
  return 'text'
}

function cleanPhone(raw: string): string {
  let p = raw.replace(/[\s\-.()]/g, '')
  if (p.startsWith('0') && p.length === 10) p = '+33' + p.substring(1)
  if (p.startsWith('33') && p.length === 11) p = '+' + p
  return p
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const clean = text.replace(/^\uFEFF/, '')
  const lines = clean.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return { headers: [], rows: [] }
  const sep = lines[0].includes(';') ? ';' : ','
  const headers = lines[0].split(sep).map(h => h.replace(/^"|"$/g, '').trim())
  const rows = lines.slice(1).map(l => l.split(sep).map(c => c.replace(/^"|"$/g, '').trim()))
  return { headers, rows }
}

function slugKey(name: string): string {
  return name.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'field'
}

export default function CSVImport({ listId, onClose, onSuccess }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const { organisation } = useAuth()
  const { data: existingFields } = useProspectFields()
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<ColumnMap[]>([])
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const importMutation = useImportProspects()

  // ── Auto-mapping au upload du CSV ──────────────────────────────
  function autoMap(csvHeaders: string[], csvRows: string[][]): ColumnMap[] {
    return csvHeaders.map((h, i) => {
      const samples = csvRows.slice(0, 20).map(r => r[i] || '')
      // 1. Field natif ?
      const native = detectNative(h, samples)
      if (native) return { kind: 'native' as const, field: native }
      // 2. Custom existant matché par similarité ?
      const customs = (existingFields || []).filter(f => !f.is_system)
      let bestMatch = null as null | { id: string; name: string; score: number }
      for (const f of customs) {
        const score = similarity(h, f.name)
        if (score > 0.6 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { id: f.id, name: f.name, score }
        }
      }
      if (bestMatch) return { kind: 'existing_custom' as const, fieldId: bestMatch.id, fieldName: bestMatch.name }
      // 3. Nouveau custom field (auto-créé à l'import)
      return { kind: 'new_custom' as const, name: h, type: detectType(samples) }
    })
  }

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const parsed = parseCSV(text)
      if (parsed.headers.length === 0) { setError('Fichier CSV vide ou invalide'); return }
      setHeaders(parsed.headers)
      setRows(parsed.rows)
      const auto = autoMap(parsed.headers, parsed.rows)
      setMapping(auto)
      const hasPhone = auto.some(m => m.kind === 'native' && m.field === 'phone')
      if (!hasPhone) setError('Aucune colonne téléphone détectée. Ajustez le mapping ci-dessous.')
    }
    reader.readAsText(file, 'UTF-8')
  }

  // Re-auto-map si les custom fields arrivent après l'upload
  useEffect(() => {
    if (headers.length > 0 && (existingFields?.length ?? 0) > 0 && rows.length > 0) {
      setMapping(prev => {
        // Ne refait pas l'auto si Kevin a déjà modifié (on garde son mapping)
        const untouched = prev.every(m => m.kind !== 'existing_custom')
        return untouched ? autoMap(headers, rows) : prev
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingFields?.length])

  // ── Préparation data à importer ──────────────────────────────
  const phoneIdx = mapping.findIndex(m => m.kind === 'native' && m.field === 'phone')
  const hasPhone = phoneIdx >= 0

  const prospectsNative = useMemo(() => {
    const result: Array<{ _row: number; name: string; phone: string; email?: string; company?: string; title?: string; sector?: string }> = []
    rows.forEach((row, rowIdx) => {
      const obj: Record<string, string> = {}
      mapping.forEach((m, colIdx) => {
        if (m.kind !== 'native' || m.field === 'ignore') return
        const v = row[colIdx]?.trim()
        if (!v) return
        if (obj[m.field]) obj[m.field] += ' ' + v
        else obj[m.field] = v
      })
      let name = obj.name || ''
      if (!name && (obj.first_name || obj.last_name)) name = [obj.first_name, obj.last_name].filter(Boolean).join(' ')
      if (!name) name = 'Sans nom'
      const phone = cleanPhone(obj.phone || '')
      if (!phone || phone.length < 8) return
      result.push({ _row: rowIdx, name, phone, email: obj.email, company: obj.company, title: obj.title, sector: obj.sector })
    })
    return result
  }, [rows, mapping])

  async function handleImport() {
    if (!prospectsNative.length) { setError('Aucun prospect valide à importer (téléphone manquant).'); return }
    if (!organisation?.id) { setError('Organisation manquante.'); return }
    setImporting(true)
    setError(null)
    try {
      // 1. Création auto des nouveaux custom fields
      const newFieldMap = new Map<number, string>() // colIdx → fieldId
      const existingFieldMap = new Map<number, string>() // colIdx → fieldId
      for (let i = 0; i < mapping.length; i++) {
        const m = mapping[i]
        if (m.kind === 'existing_custom') existingFieldMap.set(i, m.fieldId)
        else if (m.kind === 'new_custom') {
          const { data, error: errF } = await supabase.from('prospect_fields')
            .upsert({
              organisation_id: organisation.id,
              name: m.name,
              key: slugKey(m.name),
              field_type: m.type,
              is_system: false,
            }, { onConflict: 'organisation_id,key' })
            .select('id')
            .single()
          if (errF) throw new Error(`Échec création champ "${m.name}" : ${errF.message}`)
          if (data?.id) newFieldMap.set(i, data.id)
        }
      }

      // 2. Import prospects natifs
      await importMutation.mutateAsync({ listId, prospects: prospectsNative.map(({ _row, ...p }) => p) })

      // 3. Re-fetch les prospects par phone pour mapper phone→id (robuste même avec déduplication)
      if (newFieldMap.size + existingFieldMap.size > 0) {
        const phones = prospectsNative.map(p => p.phone)
        const { data: inserted } = await supabase.from('prospects')
          .select('id, phone').eq('organisation_id', organisation.id).eq('list_id', listId).in('phone', phones)
        const phoneToId = new Map<string, string>()
        ;(inserted || []).forEach(p => { if (p.phone) phoneToId.set(p.phone, p.id) })

        const valueRows: Array<{ prospect_id: string; field_id: string; value: string }> = []
        prospectsNative.forEach(p => {
          const pid = phoneToId.get(p.phone)
          if (!pid) return
          const row = rows[p._row]
          for (const [colIdx, fieldId] of [...newFieldMap.entries(), ...existingFieldMap.entries()]) {
            const v = row[colIdx]?.trim()
            if (v) valueRows.push({ prospect_id: pid, field_id: fieldId, value: v })
          }
        })
        if (valueRows.length > 0) {
          const batchSize = 500
          for (let i = 0; i < valueRows.length; i += batchSize) {
            const { error: errV } = await supabase.from('prospect_field_values').insert(valueRows.slice(i, i + batchSize))
            if (errV) throw new Error(`Échec import valeurs custom : ${errV.message}`)
          }
        }
      }

      onSuccess(prospectsNative.length)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur import')
    } finally {
      setImporting(false)
    }
  }

  // ── Stats ─────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const s = { native: 0, existing: 0, newCustom: 0, ignored: 0 }
    mapping.forEach(m => {
      if (m.kind === 'native' && m.field === 'ignore') s.ignored++
      else if (m.kind === 'native') s.native++
      else if (m.kind === 'existing_custom') s.existing++
      else if (m.kind === 'new_custom') s.newCustom++
    })
    return s
  }, [mapping])

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-xl w-[780px] max-h-[85vh] flex flex-col overflow-hidden animate-fade-in-scale">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-800">Importer un CSV</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">Mapping auto à la HubSpot — modifiez ou validez, je crée les champs manquants.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {headers.length === 0 ? (
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-10 text-center cursor-pointer hover:bg-gray-50"
              onClick={() => fileRef.current?.click()}>
              <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
              <p className="text-sm text-gray-600 font-medium">Cliquer ou glisser un fichier CSV</p>
              <p className="text-[11px] text-gray-400 mt-1">Séparateur , ou ; · UTF-8 · entêtes en première ligne</p>
            </div>
          ) : (
            <>
              <div className="mb-4 px-3 py-2 rounded-lg bg-indigo-50/60 border border-indigo-100 text-[12px] text-indigo-700 flex items-center gap-3 flex-wrap">
                <span>{rows.length} ligne{rows.length > 1 ? 's' : ''}</span>
                <span>·</span>
                <span>{stats.native} champ{stats.native > 1 ? 's' : ''} natif{stats.native > 1 ? 's' : ''}</span>
                {stats.existing > 0 && <><span>·</span><span className="text-emerald-700">{stats.existing} lié{stats.existing > 1 ? 's' : ''} à un champ existant</span></>}
                {stats.newCustom > 0 && <><span>·</span><span className="text-violet-700">{stats.newCustom} nouveau{stats.newCustom > 1 ? 'x' : ''} champ{stats.newCustom > 1 ? 's' : ''} auto-créé{stats.newCustom > 1 ? 's' : ''}</span></>}
                {stats.ignored > 0 && <><span>·</span><span className="text-gray-500">{stats.ignored} ignoré{stats.ignored > 1 ? 's' : ''}</span></>}
              </div>

              <div className="space-y-2">
                {headers.map((h, i) => {
                  const m = mapping[i]
                  const preview = rows.slice(0, 3).map(r => r[i] || '').filter(Boolean).slice(0, 3).join(' · ')
                  return (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 hover:border-gray-200 bg-white">
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-semibold text-gray-800 truncate">{h}</div>
                        {preview && <div className="text-[11px] text-gray-400 truncate mt-0.5">{preview}</div>}
                      </div>
                      <div className="flex-shrink-0 w-5 text-gray-300">→</div>
                      <div className="flex-1 min-w-0">
                        <MappingSelector header={h} value={m} existingFields={(existingFields || []).filter(f => !f.is_system).map(f => ({ id: f.id, name: f.name }))}
                          usedCustomIds={new Set(mapping.filter((m2, idx) => idx !== i && m2.kind === 'existing_custom').map(m2 => (m2 as { fieldId: string }).fieldId))}
                          usedNative={new Set(mapping.filter((m2, idx) => idx !== i && m2.kind === 'native' && m2.field !== 'ignore').map(m2 => (m2 as { field: NativeField }).field))}
                          onChange={(newMap) => {
                            const next = [...mapping]; next[i] = newMap; setMapping(next)
                          }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {error && <div className="mt-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">{error}</div>}
        </div>

        {headers.length > 0 && (
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-2">
            <div className="text-[12px] text-gray-500">
              {prospectsNative.length} prospect{prospectsNative.length > 1 ? 's' : ''} prêt{prospectsNative.length > 1 ? 's' : ''} à importer
            </div>
            <div className="flex items-center gap-2">
              <button onClick={onClose} disabled={importing}
                className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-200 disabled:opacity-50">Annuler</button>
              <button onClick={handleImport} disabled={importing || !hasPhone || !prospectsNative.length}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40">
                {importing ? 'Import en cours…' : `Importer ${prospectsNative.length} contact${prospectsNative.length > 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── MappingSelector ────────────────────────────────────────────
// Dropdown unique qui expose : champs natifs · champs custom existants ·
// "Créer ce nouveau champ" · Ignorer.
function MappingSelector({ header, value, existingFields, usedCustomIds, usedNative, onChange }: {
  header: string
  value: ColumnMap
  existingFields: Array<{ id: string; name: string }>
  usedCustomIds: Set<string>
  usedNative: Set<NativeField>
  onChange: (m: ColumnMap) => void
}) {
  // L'option "create_new" utilise le nom exact du header
  const currentLabel = (() => {
    if (value.kind === 'native') {
      if (value.field === 'ignore') return '— Ignorer —'
      return NATIVE_OPTIONS.find(o => o.value === value.field)?.label ?? value.field
    }
    if (value.kind === 'existing_custom') return `📎 ${value.fieldName}`
    return `✨ Nouveau champ : ${value.name}`
  })()

  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const selectedTone = value.kind === 'native' && value.field !== 'ignore'
    ? 'border-indigo-200 bg-indigo-50/40 text-indigo-800'
    : value.kind === 'existing_custom' ? 'border-emerald-200 bg-emerald-50/40 text-emerald-800'
    : value.kind === 'new_custom' ? 'border-violet-200 bg-violet-50/40 text-violet-800'
    : 'border-gray-200 bg-gray-50 text-gray-500'

  return (
    <div ref={boxRef} className="relative">
      <button type="button" onClick={() => setOpen(v => !v)}
        className={`w-full text-left px-3 py-2 rounded-lg border text-[12px] font-medium flex items-center justify-between gap-2 transition-colors ${selectedTone}`}>
        <span className="truncate">{currentLabel}</span>
        <svg className="w-3 h-3 flex-shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 right-0 left-0 max-h-[280px] overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
          {/* Suggestion "Créer comme nouveau champ" toujours en haut */}
          <button type="button" className="w-full text-left px-3 py-2 hover:bg-violet-50 text-[12px] border-b border-gray-100"
            onClick={() => { onChange({ kind: 'new_custom', name: header, type: 'text' }); setOpen(false) }}>
            <span className="text-violet-700 font-semibold">✨ Créer un nouveau champ : </span>
            <span className="text-gray-800">{header}</span>
          </button>

          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-gray-400 font-semibold bg-gray-50">Champs natifs</div>
          {NATIVE_OPTIONS.map(o => {
            const disabled = usedNative.has(o.value) && !(value.kind === 'native' && value.field === o.value) && o.value !== 'ignore'
            return (
              <button key={o.value} type="button" disabled={disabled}
                onClick={() => { onChange({ kind: 'native', field: o.value }); setOpen(false) }}
                className={`w-full text-left px-3 py-1.5 text-[12px] hover:bg-indigo-50 disabled:opacity-30 disabled:cursor-not-allowed ${value.kind === 'native' && value.field === o.value ? 'bg-indigo-50 font-semibold text-indigo-700' : 'text-gray-700'}`}>
                {o.label}{disabled ? ' (déjà utilisé)' : ''}
              </button>
            )
          })}

          {existingFields.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-gray-400 font-semibold bg-gray-50 border-t border-gray-100">Champs personnalisés existants</div>
              {existingFields.map(f => {
                const disabled = usedCustomIds.has(f.id)
                return (
                  <button key={f.id} type="button" disabled={disabled}
                    onClick={() => { onChange({ kind: 'existing_custom', fieldId: f.id, fieldName: f.name }); setOpen(false) }}
                    className={`w-full text-left px-3 py-1.5 text-[12px] hover:bg-emerald-50 disabled:opacity-30 disabled:cursor-not-allowed ${value.kind === 'existing_custom' && value.fieldId === f.id ? 'bg-emerald-50 font-semibold text-emerald-700' : 'text-gray-700'}`}>
                    📎 {f.name}{disabled ? ' (déjà utilisé)' : ''}
                  </button>
                )
              })}
            </>
          )}
        </div>
      )}
    </div>
  )
}
