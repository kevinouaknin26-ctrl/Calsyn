/**
 * SelectListPage — "Choisir une liste" (Minari frame 005 exact)
 * 4 colonnes : Listes | Taches | CSV | Listes intelligentes
 * S'affiche quand on clique "Nouvelle liste" dans le Dialer.
 */

import { useState, useRef, useCallback, useEffect, type ChangeEvent } from 'react'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/config/supabase'
import { useProspectLists, useCreateList, useImportProspects, useProspectFields, useCreateProspectField, saveCustomFieldValues, SYSTEM_FIELDS } from '@/hooks/useProspects'
import { extractSocialsFromValues } from '@/components/call/SocialLinks'

interface Props {
  onSelect: (listId: string) => void
  onClose: () => void
}

/** Parse CSV robuste — gère les guillemets, virgules et retours à la ligne dans les valeurs */
function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (!clean.trim()) return { headers: [], rows: [] }

  // Détecter le séparateur sur la première ligne
  const firstLine = clean.split('\n')[0]
  const sep = (firstLine.match(/;/g)?.length || 0) > (firstLine.match(/,/g)?.length || 0) ? ';' : ','

  // Parser champ par champ en gérant les guillemets
  function parseRow(input: string, startPos: number): { fields: string[]; nextPos: number } | null {
    const fields: string[] = []
    let pos = startPos
    if (pos >= input.length) return null

    while (pos <= input.length) {
      if (pos === input.length) { fields.push(''); break }

      if (input[pos] === '"') {
        // Champ entre guillemets — lire jusqu'au guillemet fermant
        let val = ''
        pos++ // skip opening quote
        while (pos < input.length) {
          if (input[pos] === '"') {
            if (pos + 1 < input.length && input[pos + 1] === '"') {
              val += '"' // escaped quote
              pos += 2
            } else {
              pos++ // skip closing quote
              break
            }
          } else {
            val += input[pos]
            pos++
          }
        }
        fields.push(val.trim())
        // Skip separator or newline
        if (pos < input.length && input[pos] === sep) { pos++; continue }
        if (pos < input.length && input[pos] === '\n') { pos++; break }
        break
      } else {
        // Champ sans guillemets — lire jusqu'au séparateur ou fin de ligne
        const nextSep = input.indexOf(sep, pos)
        const nextNl = input.indexOf('\n', pos)
        let end: number
        let isEol = false

        if (nextSep === -1 && nextNl === -1) { end = input.length }
        else if (nextSep === -1) { end = nextNl; isEol = true }
        else if (nextNl === -1) { end = nextSep }
        else if (nextSep < nextNl) { end = nextSep }
        else { end = nextNl; isEol = true }

        fields.push(input.substring(pos, end).trim())
        pos = end + 1
        if (isEol || end === input.length) break
      }
    }
    return { fields, nextPos: pos }
  }

  // Première ligne = headers
  const headerResult = parseRow(clean, 0)
  if (!headerResult || headerResult.fields.length < 2) return { headers: [], rows: [] }
  const headers = headerResult.fields
  const numCols = headers.length

  // Lignes suivantes
  const rows: string[][] = []
  let pos = headerResult.nextPos
  while (pos < clean.length) {
    // Skip lignes vides
    if (clean[pos] === '\n') { pos++; continue }
    const result = parseRow(clean, pos)
    if (!result || result.fields.length === 0) break
    // Pad ou trim pour avoir le bon nombre de colonnes
    const row = result.fields.slice(0, numCols)
    while (row.length < numCols) row.push('')
    if (row.some(c => c)) rows.push(row) // skip lignes entièrement vides
    pos = result.nextPos
  }

  return { headers, rows }
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
}

function mapHeader(n: string): string | null {
  // Match exact
  const exact: Record<string, string> = {
    name: 'name', nom: 'name', fullname: 'name', firstname: 'first_name', prenom: 'first_name',
    lastname: 'last_name', nomdefamille: 'last_name', phone: 'phone', telephone: 'phone', tel: 'phone',
    mobile: 'phone', numero: 'phone', email: 'email', mail: 'email', company: 'company',
    entreprise: 'company', societe: 'company', title: 'title', poste: 'title', jobtitle: 'title',
    sector: 'sector', secteur: 'sector', source: 'sector', commentaire: 'notes',
    statut: 'notes', confirmation: 'notes',
  }
  if (exact[n]) return exact[n]
  // Match partiel (contient le mot cle)
  if (n.includes('nom') || n.includes('artiste') || n.includes('contact') || n.includes('name')) return 'name'
  if (n.includes('prenom') || n.includes('first')) return 'first_name'
  if (n.includes('phone') || n.includes('tel') || n.includes('mobile') || n.includes('numero')) return 'phone'
  if (n.includes('mail')) return 'email'
  if (n.includes('entreprise') || n.includes('societe') || n.includes('company')) return 'company'
  if (n.includes('poste') || n.includes('title') || n.includes('fonction')) return 'title'
  return null
}

function cleanPhone(raw: string): string {
  let p = raw.replace(/[\s\-\.\(\)]/g, '')
  if (p.startsWith('0') && p.length === 10) p = '+33' + p.substring(1)
  if (p.startsWith('33') && p.length === 11) p = '+' + p
  return p
}

// Mapping value: "ignore" | "system:phone" | "custom:<fieldId>" | "new"
// Prefixed to distinguish system fields from custom fields

/** Helpers pour valider le contenu */
const PHONE_PATTERN = /^[\+]?[\d\s\-\.\(\)]{8,}$/
const URL_PATTERN = /^https?:\/\//i

function looksLikePhone(values: string[]): boolean {
  const nonEmpty = values.filter(v => v.trim())
  if (nonEmpty.length === 0) return false
  // Un vrai numéro : que des chiffres/espaces/tirets, PAS une URL
  return nonEmpty.filter(v => PHONE_PATTERN.test(v.trim()) && !URL_PATTERN.test(v.trim())).length / nonEmpty.length >= 0.4
}

function looksLikeEmail(values: string[]): boolean {
  const nonEmpty = values.filter(v => v.trim())
  if (nonEmpty.length === 0) return false
  return nonEmpty.filter(v => v.includes('@') && v.includes('.') && !v.includes(' ')).length / nonEmpty.length >= 0.4
}

function looksLikeUrl(values: string[]): boolean {
  const nonEmpty = values.filter(v => v.trim())
  if (nonEmpty.length === 0) return false
  return nonEmpty.filter(v => URL_PATTERN.test(v.trim()) || v.trim().startsWith('www.')).length / nonEmpty.length >= 0.3
}

/** Détection proactive avec validation croisée header + contenu */
function detectFieldSmart(header: string, sampleValues: string[]): string {
  const n = normalizeHeader(header)
  const nonEmpty = sampleValues.filter(v => v.trim())

  // ── Colonnes techniques évidentes → ignorer par défaut (mais l'utilisateur peut changer) ──
  const techColumns = ['emailstatus', 'emailverification', 'emailverified', 'emailvalid',
    'bounced', 'unsubscribed', 'replied', 'opened', 'clicked', 'sent',
    'createdat', 'updatedat', 'importedat', 'enrichedat', 'verifiedat',
    'customvariable1', 'customvariable2', 'customvariable3', 'customvariable4']
  if (techColumns.includes(n)) return 'ignore'

  // ── Header → candidat système ──
  const headerToSystem: Record<string, string> = {
    firstname: 'first_name', prenom: 'first_name', first: 'first_name', givenname: 'first_name',
    lastname: 'last_name', nomdefamille: 'last_name', last: 'last_name', familyname: 'last_name', surname: 'last_name',
    name: 'name', nom: 'name', fullname: 'name', contact: 'name', nomcomplet: 'name',
    phone: 'phone', telephone: 'phone', tel: 'phone', mobile: 'phone', numero: 'phone', phonenumber: 'phone',
    phone2: 'phone2', tel2: 'phone2', mobile2: 'phone2', gsm: 'phone2', portable: 'phone2', mobilephone: 'phone2',
    email: 'email', mail: 'email', courriel: 'email', emailaddress: 'email',
    company: 'company', entreprise: 'company', societe: 'company', companyname: 'company', organisation: 'company', organization: 'company',
    title: 'title', poste: 'title', jobtitle: 'title', fonction: 'title', role: 'title', occupation: 'title', metier: 'title',
    sector: 'sector', secteur: 'sector', industry: 'sector', industrie: 'sector',
    address: 'address', adresse: 'address', rue: 'address', street: 'address',
    city: 'city', ville: 'city', localite: 'city', commune: 'city', location: 'city', region: 'city', laststate: 'city', state: 'city', departement: 'city',
    postalcode: 'postal_code', codepostal: 'postal_code', cp: 'postal_code', zipcode: 'postal_code', zip: 'postal_code', postcode: 'postal_code',
    country: 'country', pays: 'country', countryname: 'country', nation: 'country',
    linkedin: 'linkedin_url', linkedinurl: 'linkedin_url', linkedinprofile: 'linkedin_url', profillinkedin: 'linkedin_url',
    website: 'website_url', siteweb: 'website_url', site: 'website_url', web: 'website_url', url: 'website_url', websiteurl: 'website_url',
    companydomain: 'website_url', domain: 'website_url', domaine: 'website_url',
  }

  let candidate = headerToSystem[n] || null

  // Header partiel
  if (!candidate) {
    if (n.includes('prenom') || n.includes('firstname')) candidate = 'first_name'
    else if ((n.includes('nom') && !n.includes('prenom') && !n.includes('domain') && !n.includes('company')) || n.includes('lastname')) candidate = 'last_name'
    else if (n.includes('phone') || n.includes('tel') || n.includes('mobile') || n.includes('numero')) candidate = 'phone'
    else if (n.includes('mail') && !n.includes('status')) candidate = 'email'
    else if (n.includes('entreprise') || n.includes('societe') || (n.includes('company') && !n.includes('domain'))) candidate = 'company'
    else if (n.includes('poste') || n.includes('jobtitle') || n.includes('fonction') || n.includes('occupation')) candidate = 'title'
    else if (n.includes('adresse') || n.includes('address')) candidate = 'address'
    else if (n.includes('ville') || n.includes('city') || n.includes('location')) candidate = 'city'
    else if (n.includes('codepostal') || n.includes('postalcode') || n.includes('zipcode')) candidate = 'postal_code'
    else if (n === 'pays' || n === 'country') candidate = 'country'
    else if (n.includes('linkedin')) candidate = 'linkedin_url'
  }

  // ── VALIDATION CROISÉE : le header dit X, mais le contenu confirme-t-il ? ──
  if (candidate) {
    // Phone : le contenu DOIT ressembler à des vrais numéros
    if (candidate === 'phone' || candidate === 'phone2') {
      if (nonEmpty.length === 0 || !looksLikePhone(nonEmpty)) return 'ignore'
    }
    // Email : le contenu DOIT avoir des @
    if (candidate === 'email') {
      if (nonEmpty.length === 0 || !looksLikeEmail(nonEmpty)) return 'ignore'
    }
    // LinkedIn/website : le contenu DOIT être des URLs
    if (candidate === 'linkedin_url' || candidate === 'website_url') {
      if (nonEmpty.length > 0 && !looksLikeUrl(nonEmpty)) return 'ignore'
    }
  }

  if (candidate) return `system:${candidate}`

  // ── Détection par contenu seul (pas de match header) ──
  if (nonEmpty.length > 0) {
    if (looksLikePhone(nonEmpty)) return 'system:phone'
    if (looksLikeEmail(nonEmpty)) return 'system:email'
    if (nonEmpty.filter(v => v.toLowerCase().includes('linkedin.com')).length / nonEmpty.length >= 0.3) return 'system:linkedin_url'
  }

  return 'ignore'
}

/** Post-traitement : dédupliquer — chaque champ ne peut être utilisé qu'une seule fois */
function deduplicateMapping(mapping: string[]): string[] {
  const seen = new Set<string>()
  let phoneCount = 0
  return mapping.map(field => {
    if (field === 'ignore') return field
    // Cas spécial phone : le 2ème devient phone2
    if (field === 'system:phone') {
      phoneCount++
      if (phoneCount === 2) {
        const f2 = 'system:phone2'
        if (!seen.has(f2)) { seen.add(f2); return f2 }
        return 'ignore'
      }
      if (phoneCount > 2) return 'ignore'
    }
    // Déjà pris → ignorer
    if (seen.has(field)) return 'ignore'
    seen.add(field)
    return field
  })
}

/** Convertit un header CSV en clé technique snake_case */
function headerToKey(header: string): string {
  return header.trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z])([A-Z])/g, '$1_$2') // camelCase → snake_case
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

// ── FieldPicker : dropdown searchable pour le mapping CSV ──────
function FieldPicker({ value, usedFields, systemFields, customFields, onChange, onCreateField }: {
  value: string; usedFields: Set<string>
  systemFields: Array<{ key: string; name: string }>
  customFields: Array<{ id: string; name: string }> | undefined
  onChange: (val: string) => void
  onCreateField: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const isActive = value !== 'ignore'
  const isCustom = value.startsWith('custom:')
  const selectedLabel = value === 'ignore' ? '— Ignorer —'
    : value.startsWith('system:') ? systemFields.find(f => `system:${f.key}` === value)?.name || value
    : customFields?.find(f => `custom:${f.id}` === value)?.name || value

  const q = search.toLowerCase()
  const filteredSystem = systemFields.filter(f => !q || f.name.toLowerCase().includes(q))
  const filteredCustom = (customFields || []).filter(f => !q || f.name.toLowerCase().includes(q))
  const hasResults = filteredSystem.length > 0 || filteredCustom.length > 0

  // Fermer quand clic dehors
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50) }, [open])

  return (
    <div className="relative flex-shrink-0 min-w-[180px]" ref={containerRef}>
      {/* Bouton trigger */}
      <button onClick={() => setOpen(!open)}
        className={`w-full text-left text-[12px] px-2.5 py-1.5 rounded-lg border outline-none truncate ${
          isCustom ? 'border-violet-300 text-violet-700 bg-white font-medium' :
          isActive ? 'border-indigo-300 text-indigo-700 bg-white font-medium' :
          'border-gray-200 text-gray-400 bg-white'
        }`}>
        {selectedLabel}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-9 left-0 w-[260px] bg-white rounded-xl shadow-xl border border-gray-200 z-[60] animate-slide-down">
          {/* Recherche */}
          <div className="p-2 border-b border-gray-100">
            <input ref={inputRef} value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher ou créer..."
              onKeyDown={e => {
                if (e.key === 'Escape') { setOpen(false); setSearch('') }
              }}
              className="w-full text-[12px] px-2.5 py-1.5 rounded-lg border border-gray-200 outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200" />
          </div>

          <div className="max-h-[240px] overflow-y-auto py-1">
            {/* Ignorer */}
            <button onClick={() => { onChange('ignore'); setOpen(false); setSearch('') }}
              className={`w-full text-left px-3 py-1.5 text-[12px] hover:bg-gray-50 ${value === 'ignore' ? 'text-indigo-600 font-medium' : 'text-gray-400'}`}>
              — Ignorer —
            </button>

            {/* Champs standard */}
            {filteredSystem.length > 0 && (
              <>
                <p className="px-3 pt-2 pb-1 text-[9px] font-bold text-gray-400 uppercase tracking-wider">Champs standard</p>
                {filteredSystem.map(f => {
                  const val = `system:${f.key}`
                  const taken = usedFields.has(val)
                  const selected = value === val
                  return (
                    <button key={f.key} onClick={() => { if (!taken) { onChange(val); setOpen(false); setSearch('') } }}
                      disabled={taken}
                      className={`w-full text-left px-3 py-1.5 text-[12px] flex items-center justify-between ${
                        taken ? 'text-gray-300 cursor-not-allowed' :
                        selected ? 'text-indigo-600 font-medium bg-indigo-50' :
                        'text-gray-700 hover:bg-gray-50'
                      }`}>
                      {f.name}
                      {taken && <span className="text-[9px] text-gray-300">déjà pris</span>}
                    </button>
                  )
                })}
              </>
            )}

            {/* Champs personnalisés */}
            {filteredCustom.length > 0 && (
              <>
                <p className="px-3 pt-2 pb-1 text-[9px] font-bold text-violet-400 uppercase tracking-wider">Personnalisés</p>
                {filteredCustom.map(f => {
                  const val = `custom:${f.id}`
                  const taken = usedFields.has(val)
                  const selected = value === val
                  return (
                    <button key={f.id} onClick={() => { if (!taken) { onChange(val); setOpen(false); setSearch('') } }}
                      disabled={taken}
                      className={`w-full text-left px-3 py-1.5 text-[12px] flex items-center justify-between ${
                        taken ? 'text-gray-300 cursor-not-allowed' :
                        selected ? 'text-violet-600 font-medium bg-violet-50' :
                        'text-violet-700 hover:bg-violet-50'
                      }`}>
                      {f.name}
                      {taken && <span className="text-[9px] text-gray-300">déjà pris</span>}
                    </button>
                  )
                })}
              </>
            )}

            {/* Pas de résultat = créer */}
            {!hasResults && search.trim() && (
              <p className="px-3 py-2 text-[11px] text-gray-400">Aucun champ trouvé</p>
            )}
          </div>

          {/* Bouton créer */}
          {search.trim() && (
            <div className="border-t border-gray-100 p-2">
              <button onClick={() => { onCreateField(search.trim()); setOpen(false); setSearch('') }}
                className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] text-violet-500 hover:bg-violet-50 rounded-lg font-medium">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Créer "{search.trim()}"
              </button>
            </div>
          )}
          {!search.trim() && (
            <div className="border-t border-gray-100 p-2">
              <button onClick={() => { inputRef.current?.focus() }}
                className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] text-violet-500 hover:bg-violet-50 rounded-lg font-medium">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Nouveau champ
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function SelectListPage({ onSelect, onClose }: Props) {
  const { data: lists } = useProspectLists()
  const { data: customFields } = useProspectFields()
  const createList = useCreateList()
  const importProspects = useImportProspects()
  const createField = useCreateProspectField()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [importing, setImporting] = useState(false)
  const [creatingList, setCreatingList] = useState(false)
  const [newListName, setNewListName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // CSV mapping state
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvRows, setCsvRows] = useState<string[][]>([])
  const [csvMapping, setCsvMapping] = useState<string[]>([]) // "ignore" | "system:key" | "custom:fieldId"
  const [csvFileName, setCsvFileName] = useState('')
  const [csvError, setCsvError] = useState<string | null>(null)

  // Confirm modal state (suppression de liste)
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null)

  const filtered = lists?.filter(l => !search || l.name.toLowerCase().includes(search.toLowerCase()))

  // Options du dropdown (système + custom + créer)
  const fieldOptions: Array<{ value: string; label: string; group?: string }> = [
    { value: 'ignore', label: '— Ignorer —' },
    ...SYSTEM_FIELDS.map(f => ({ value: `system:${f.key}`, label: f.name, group: 'Champs standard' })),
    ...(customFields || []).map(f => ({ value: `custom:${f.id}`, label: f.name, group: 'Champs personnalisés' })),
    { value: 'new', label: '+ Créer un nouveau champ', group: 'Actions' },
  ]

  // Charger le fichier et afficher le mapping
  function handleCSVFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvError(null)

    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const { headers, rows } = parseCSV(text)
      if (headers.length === 0) { setCsvError('Fichier CSV vide ou invalide'); return }
      setCsvHeaders(headers)
      setCsvRows(rows)
      setCsvFileName(file.name.replace(/\.(csv|txt)$/i, ''))

      // Détection auto : échantillon réparti (20 lignes parmi tout le fichier)
      const sampleIndices: number[] = []
      const step = Math.max(1, Math.floor(rows.length / 20))
      for (let s = 0; s < rows.length && sampleIndices.length < 20; s += step) sampleIndices.push(s)

      const rawMapping = headers.map((h, i) => {
        const sampleValues = sampleIndices.map(si => rows[si]?.[i] || '')
        const detected = detectFieldSmart(h, sampleValues)
        if (detected !== 'ignore') return detected
        // Fallback : chercher dans les custom fields existants par key
        const key = headerToKey(h)
        const existing = customFields?.find(f => f.key === key)
        if (existing) return `custom:${existing.id}`
        return 'ignore'
      })
      const autoMapping = deduplicateMapping(rawMapping)
      if (!autoMapping.includes('system:phone')) {
        setCsvError('Aucune colonne téléphone détectée. Ajustez le mapping ci-dessous.')
      }
      setCsvMapping(autoMapping)
    }
    reader.readAsText(file, 'UTF-8')
  }

  // Construire les prospects à partir du mapping
  function buildProspects() {
    type ProspectRow = { name: string; phone: string; phone2?: string; email?: string; company?: string; title?: string; sector?: string; address?: string; city?: string; postal_code?: string; country?: string; linkedin_url?: string; website_url?: string }
    const result: ProspectRow[] = []
    for (const row of csvRows) {
      const sys: Record<string, string> = {}
      csvMapping.forEach((field, i) => {
        if (field.startsWith('system:') && row[i]?.trim()) {
          const key = field.replace('system:', '')
          if (sys[key]) sys[key] += ' ' + row[i].trim()
          else sys[key] = row[i].trim()
        }
      })
      let name = sys.name || ''
      if (!name && (sys.first_name || sys.last_name)) name = [sys.first_name, sys.last_name].filter(Boolean).join(' ')
      if (!name) name = 'Sans nom'
      // Nettoyage nom : si trop long ou contient des patterns suspects → extraire le vrai nom
      if (name.length > 40) {
        // Couper au premier séparateur suspect (parenthèse, virgule après le nom, tiret long)
        const cut = name.match(/^([^(,]{3,40})/)
        if (cut) name = cut[1].trim()
      }
      // Si le nom contient des mots-clés de poste → séparer nom et poste
      const jobWords = /\b(responsable|directeur|directrice|manager|commercial|CEO|CTO|CFO|PDG|DG|assistant|consultant|gérant|président|associé|fondateur|chargé)\b/i
      if (jobWords.test(name)) {
        const parts = name.split(jobWords)
        if (parts[0].trim().length >= 3) {
          const cleanName = parts[0].trim()
          const jobPart = name.slice(cleanName.length).trim()
          name = cleanName
          // Mettre le reste dans title si vide
          if (!sys.title && jobPart) sys.title = jobPart
        }
      }
      // Max 50 caractères
      if (name.length > 50) name = name.slice(0, 50).trim()
      const phone = cleanPhone(sys.phone || '')
      if (!phone || phone.length < 8) continue
      const phone2 = sys.phone2 ? cleanPhone(sys.phone2) : undefined
      result.push({
        name, phone,
        phone2: phone2 && phone2.length >= 8 ? phone2 : undefined,
        email: sys.email, company: sys.company, title: sys.title, sector: sys.sector,
        address: sys.address, city: sys.city, postal_code: sys.postal_code, country: sys.country,
        linkedin_url: sys.linkedin_url, website_url: sys.website_url,
      })
    }
    return result
  }

  // Collecter les valeurs custom par row
  function buildCustomData(): Array<Record<string, string>> {
    return csvRows.map(row => {
      const data: Record<string, string> = {}
      csvMapping.forEach((field, i) => {
        if (field.startsWith('custom:') && row[i]?.trim()) {
          const fieldId = field.replace('custom:', '')
          data[fieldId] = row[i].trim()
        }
      })
      return data
    })
  }

  const csvProspects = csvHeaders.length > 0 ? buildProspects() : []
  const hasPhone = csvMapping.includes('system:phone')
  const hasName = csvMapping.includes('system:name') || csvMapping.includes('system:first_name') || csvMapping.includes('system:last_name')
  const customMappingCount = csvMapping.filter(m => m.startsWith('custom:')).length
  const canImport = hasPhone && hasName && csvProspects.length > 0

  // Détecter doublons : même nom de liste déjà importée
  const duplicateListName = lists?.find(l => l.name === csvFileName)


  // Modal création champ custom
  const [newFieldIndex, setNewFieldIndex] = useState<number | null>(null)
  const [newFieldName, setNewFieldName] = useState('')
  const newFieldInputRef = useRef<HTMLInputElement>(null)

  function openCreateField(csvIndex: number, headerName: string) {
    setNewFieldIndex(csvIndex)
    setNewFieldName(headerName)
    setTimeout(() => newFieldInputRef.current?.select(), 50)
  }

  async function confirmCreateField() {
    if (newFieldIndex === null || !newFieldName.trim()) return
    const key = headerToKey(newFieldName.trim())
    try {
      const field = await createField.mutateAsync({ name: newFieldName.trim(), key })
      const newMapping = [...csvMapping]
      newMapping[newFieldIndex] = `custom:${field.id}`
      setCsvMapping(newMapping)
    } catch (err) {
      console.error('Failed to create field:', err)
    }
    setNewFieldIndex(null)
    setNewFieldName('')
  }

  // Importer
  async function handleCSVImport() {
    if (!csvProspects.length) return
    setImporting(true)
    setCsvError(null)

    try {
      const listName = csvFileName || 'Import CSV'
      const list = await createList.mutateAsync(listName)
      const insertedIds = await importProspects.mutateAsync({ listId: list.id, prospects: csvProspects })

      // Sauvegarder les valeurs custom
      if (insertedIds && insertedIds.length > 0 && customMappingCount > 0) {
        const customData = buildCustomData()
        // Filtrer customData pour ne garder que les rows importées (même index que csvProspects)
        const validIndices: number[] = []
        let prospectIdx = 0
        for (let i = 0; i < csvRows.length && prospectIdx < insertedIds.length; i++) {
          const sys: Record<string, string> = {}
          csvMapping.forEach((field, ci) => {
            if (field.startsWith('system:') && csvRows[i][ci]?.trim()) {
              const key = field.replace('system:', '')
              sys[key] = csvRows[i][ci].trim()
            }
          })
          const phone = cleanPhone(sys.phone || '')
          if (phone && phone.length >= 8) {
            validIndices.push(i)
            prospectIdx++
          }
        }

        const fieldMapping = csvMapping
          .map((m, _i) => m.startsWith('custom:') ? { fieldId: m.replace('custom:', ''), customKey: m.replace('custom:', '') } : null)
          .filter(Boolean) as Array<{ fieldId: string; customKey: string }>

        if (fieldMapping.length > 0) {
          const filteredCustomData = validIndices.map(i => customData[i])
          await saveCustomFieldValues(insertedIds, filteredCustomData, fieldMapping)

          // ── Sync socials depuis les custom field values (Portfolio, etc.) ──
          const socialRows: Array<{ prospect_id: string; platform: string; url: string }> = []
          filteredCustomData.forEach((data, idx) => {
            const pid = insertedIds[idx]
            if (!pid) return
            const urls = Object.values(data).filter(v => v).map(v => ({ value: v }))
            const socials = extractSocialsFromValues(urls)
            for (const s of socials) {
              socialRows.push({ prospect_id: pid, platform: s.platform, url: s.url })
            }
          })
          if (socialRows.length > 0) {
            const batchSize = 500
            for (let b = 0; b < socialRows.length; b += batchSize) {
              await supabase.from('prospect_socials').insert(socialRows.slice(b, b + batchSize))
            }
          }

          // ── Sync statut custom → crm_status ──
          // Si un custom field "statut" existe, mapper ses valeurs vers le crm_status système
          const statutMapping: Record<string, string> = {
            // RDV fait
            done: 'rdv_fait', fait: 'rdv_fait', terminé: 'rdv_fait', termine: 'rdv_fait', completed: 'rdv_fait',
            confirmed: 'rdv_pris', confirmé: 'rdv_pris', confirme: 'rdv_pris', 'rdv confirmé': 'rdv_pris', 'rdv confirme': 'rdv_pris',
            'rdv pris': 'rdv_pris', 'rdv fait': 'rdv_fait', 'rdv effectué': 'rdv_fait', 'rdv effectue': 'rdv_fait',
            // Rappel
            pending: 'callback', 'en attente': 'callback', attente: 'callback', waiting: 'callback',
            'à rappeler': 'callback', 'a rappeler': 'callback', rappel: 'callback', relance: 'callback',
            // Pas intéressé
            rejected: 'not_interested', refusé: 'not_interested', refuse: 'not_interested', declined: 'not_interested',
            'pas intéressé': 'not_interested', 'pas interesse': 'not_interested', cancelled: 'not_interested', annulé: 'not_interested', annule: 'not_interested',
            // En attente signature
            'en attente de paiement': 'en_attente_signature', 'waiting payment': 'en_attente_signature',
            'en attente de signature': 'en_attente_signature', 'lien envoyé': 'en_attente_signature', 'lien envoye': 'en_attente_signature',
            // Signé
            signed: 'signe', signé: 'signe', signe: 'signe', payé: 'signe', paye: 'signe', paid: 'signe',
            // Connecté
            connected: 'connected', contacté: 'connected', contacte: 'connected', 'en cours': 'in_progress',
            // Mail envoyé
            'mail envoyé': 'mail_sent', 'mail envoye': 'mail_sent', 'email envoyé': 'mail_sent', 'email sent': 'mail_sent',
          }
          // Chercher un field "statut" dans le mapping
          for (let ci = 0; ci < csvMapping.length; ci++) {
            const m = csvMapping[ci]
            if (!m.startsWith('custom:')) continue
            const headerNorm = csvHeaders[ci]?.toLowerCase().replace(/[^a-z]/g, '')
            if (headerNorm === 'statut' || headerNorm === 'status' || headerNorm === 'etat') {
              // Pour chaque prospect importé, mapper la valeur
              const updates: Array<{ id: string; crm_status: string }> = []
              filteredCustomData.forEach((data, idx) => {
                const pid = insertedIds[idx]
                if (!pid) return
                const fieldId = m.replace('custom:', '')
                const raw = data[fieldId]?.trim().toLowerCase()
                if (raw && statutMapping[raw]) {
                  updates.push({ id: pid, crm_status: statutMapping[raw] })
                }
              })
              // Batch update groupé par statut (1 requête par statut au lieu de 1 par prospect)
              const byStatus: Record<string, string[]> = {}
              for (const u of updates) {
                if (!byStatus[u.crm_status]) byStatus[u.crm_status] = []
                byStatus[u.crm_status].push(u.id)
              }
              for (const [status, ids] of Object.entries(byStatus)) {
                await supabase.from('prospects').update({ crm_status: status }).in('id', ids)
              }
              break
            }
          }

          // ── Sync rdv_date depuis colonnes date/heure du CSV ──
          // Chercher des colonnes dont le header contient rdv, heure, date, time
          let rdvDateColIdx = -1
          let rdvTimeColIdx = -1
          for (let ci = 0; ci < csvMapping.length; ci++) {
            const hNorm = (csvHeaders[ci] || '').toLowerCase().replace(/[^a-z0-9]/g, '')
            // Date column: "rdv_date", "date du rdv", "date_rdv", "daterdv", etc.
            if ((hNorm.includes('date') && hNorm.includes('rdv')) || hNorm === 'daterdv' || hNorm === 'rdvdate' || hNorm === 'datedurendez') {
              rdvDateColIdx = ci
            }
            // Time column: "rdv_heure", "heure du rdv", "heure_rdv", "rdv_time", etc.
            if ((hNorm.includes('heure') || hNorm.includes('time')) && (hNorm.includes('rdv') || hNorm.includes('rendez'))) {
              rdvTimeColIdx = ci
            }
            // Fallback: column named just "rdv_date" or "rdv_heure" mapped as custom
            if (rdvDateColIdx === -1 && (hNorm === 'rdvdate' || hNorm === 'daterdv')) rdvDateColIdx = ci
            if (rdvTimeColIdx === -1 && (hNorm === 'rdvheure' || hNorm === 'heurerdv')) rdvTimeColIdx = ci
          }

          if (rdvDateColIdx !== -1 || rdvTimeColIdx !== -1) {
            const rdvUpdates: Array<{ id: string; rdv_date: string }> = []

            validIndices.forEach((rowIdx, prospectIdx) => {
              const pid = insertedIds[prospectIdx]
              if (!pid) return

              const rawDate = rdvDateColIdx !== -1 ? (csvRows[rowIdx]?.[rdvDateColIdx] || '').trim() : ''
              const rawTime = rdvTimeColIdx !== -1 ? (csvRows[rowIdx]?.[rdvTimeColIdx] || '').trim() : ''

              if (!rawDate && !rawTime) return

              // Parse date: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD
              let year: number | null = null, month: number | null = null, day: number | null = null
              if (rawDate) {
                const slashMatch = rawDate.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/)
                if (slashMatch) {
                  day = parseInt(slashMatch[1], 10)
                  month = parseInt(slashMatch[2], 10)
                  year = parseInt(slashMatch[3], 10)
                } else {
                  const isoMatch = rawDate.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/)
                  if (isoMatch) {
                    year = parseInt(isoMatch[1], 10)
                    month = parseInt(isoMatch[2], 10)
                    day = parseInt(isoMatch[3], 10)
                  }
                }
              }

              // Parse time: HH:MM or HHhMM
              let hours = 9, minutes = 0
              if (rawTime) {
                const timeMatch = rawTime.match(/^(\d{1,2})[h:](\d{2})$/)
                if (timeMatch) {
                  hours = parseInt(timeMatch[1], 10)
                  minutes = parseInt(timeMatch[2], 10)
                }
              }

              // Build ISO datetime
              if (year && month && day) {
                const dt = new Date(year, month - 1, day, hours, minutes)
                if (!isNaN(dt.getTime())) {
                  rdvUpdates.push({ id: pid, rdv_date: dt.toISOString() })
                }
              } else if (rawTime && !rawDate) {
                // Only time: use today
                const now = new Date()
                const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes)
                if (!isNaN(dt.getTime())) {
                  rdvUpdates.push({ id: pid, rdv_date: dt.toISOString() })
                }
              }
            })

            // Batch update rdv_date
            if (rdvUpdates.length > 0) {
              const batchSize = 200
              for (let b = 0; b < rdvUpdates.length; b += batchSize) {
                const batch = rdvUpdates.slice(b, b + batchSize)
                // Group by same rdv_date to minimize queries
                const byDate: Record<string, string[]> = {}
                for (const u of batch) {
                  if (!byDate[u.rdv_date]) byDate[u.rdv_date] = []
                  byDate[u.rdv_date].push(u.id)
                }
                for (const [rdvDate, ids] of Object.entries(byDate)) {
                  await supabase.from('prospects').update({ rdv_date: rdvDate }).in('id', ids)
                }
              }
            }
          }
        }
      }

      // ── Auto-configurer la vue : colonnes visibles = champs mappés ──
      const mappedColumnIds: string[] = []
      csvMapping.forEach(m => {
        if (m === 'ignore' || m === 'new') return
        if (m.startsWith('system:')) {
          const key = m.replace('system:', '')
          // Convertir system field key → property id
          if (key === 'first_name' || key === 'last_name' || key === 'name') return // déjà dans colonne Nom fixe
          if (key === 'linkedin_url' || key === 'website_url') {
            if (!mappedColumnIds.includes('system:socials')) mappedColumnIds.push('system:socials')
            return
          }
          const propId = `system:${key}`
          if (!mappedColumnIds.includes(propId)) mappedColumnIds.push(propId)
        } else if (m.startsWith('custom:')) {
          const fieldId = m.replace('custom:', '')
          if (!mappedColumnIds.includes(fieldId)) mappedColumnIds.push(fieldId)
        }
      })
      // Toujours inclure socials, phone, crm_status si pas déjà là
      for (const must of ['system:socials', 'system:phone', 'system:crm_status']) {
        if (!mappedColumnIds.includes(must)) mappedColumnIds.push(must)
      }
      localStorage.setItem(`calsyn_cs_visible_columns_${list.id}`, JSON.stringify(mappedColumnIds))

      setCsvHeaders([]); setCsvRows([]); setCsvMapping([]); setCsvFileName('')
      setImporting(false)
      onSelect(list.id)
    } catch (err) {
      setCsvError(err instanceof Error ? err.message : 'Erreur import')
      setImporting(false)
    }
  }

  function resetCSV() {
    setCsvHeaders([]); setCsvRows([]); setCsvMapping([]); setCsvFileName(''); setCsvError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="min-h-screen bg-[#f5f3ff] p-8">
      {/* Header */}
      <div className="relative text-center mb-6">
        <button onClick={onClose} className="absolute left-0 top-0 z-10 text-gray-400 hover:text-gray-600 text-sm flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Retour
        </button>
        <h1 className="text-[22px] font-bold text-gray-800 mb-4">Choisir une liste</h1>
        <div className="max-w-md mx-auto">
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2.5">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input type="text" placeholder="Rechercher des listes..." value={search} onChange={e => setSearch(e.target.value)}
              className="flex-1 text-[14px] outline-none text-gray-700 placeholder:text-gray-400 bg-transparent" />
          </div>
        </div>
      </div>

      {/* 4 colonnes (Minari frame 005) */}
      <div className="grid grid-cols-4 gap-6 max-w-6xl mx-auto">

        {/* ── Listes ── */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-red-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
            </div>
            <span className="text-[15px] font-bold text-gray-800">Listes</span>
            <button className="text-[12px] text-gray-400 hover:text-gray-600 flex items-center gap-1 ml-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              Actualiser
            </button>
          </div>
          <div className="space-y-1.5">
            {/* Créer une liste vide */}
            {creatingList ? (
              <div className="px-3 py-2.5 rounded-xl bg-white border border-indigo-200 animate-fade-in">
                <input autoFocus type="text" placeholder="Nom de la liste..." value={newListName}
                  onChange={e => setNewListName(e.target.value)}
                  onKeyDown={async e => {
                    if (e.key === 'Enter' && newListName.trim()) {
                      const l = await createList.mutateAsync(newListName.trim())
                      onSelect(l.id)
                    }
                    if (e.key === 'Escape') { setCreatingList(false); setNewListName('') }
                  }}
                  className="w-full text-[13px] outline-none text-gray-800 placeholder:text-gray-400 mb-1.5" />
                <div className="flex gap-1.5">
                  <button onClick={async () => {
                    if (newListName.trim()) { const l = await createList.mutateAsync(newListName.trim()); onSelect(l.id) }
                  }} className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-indigo-600 text-white">Créer</button>
                  <button onClick={() => { setCreatingList(false); setNewListName('') }}
                    className="px-2.5 py-1 rounded-lg text-[11px] text-gray-400">Annuler</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setCreatingList(true)}
                className="w-full text-left px-3 py-2.5 rounded-xl border border-dashed border-gray-300 hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                <p className="text-[13px] text-gray-500">Créer une liste vide</p>
              </button>
            )}

            {filtered?.map(l => (
              <div key={l.id} className="flex items-center gap-1">
                <button onClick={() => onSelect(l.id)}
                  className="flex-1 text-left px-3 py-2.5 rounded-xl bg-white border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors">
                  <p className="text-[13px] font-medium text-gray-800">{l.name}</p>
                  <p className="text-[11px] text-gray-400">contacts</p>
                </button>
                <button onClick={e => {
                  e.stopPropagation()
                  setConfirmDelete({ id: l.id, name: l.name })
                }} title="Supprimer la liste"
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            ))}
            {!filtered?.length && <p className="text-[12px] text-gray-400 py-4 text-center">Aucune liste</p>}
          </div>
        </div>

        {/* ── Taches ── */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
            </div>
            <span className="text-[15px] font-bold text-gray-800">Taches</span>
          </div>
          <div className="space-y-1.5">
            <button className="w-full text-left px-3 py-2.5 rounded-xl bg-white border border-gray-100 hover:border-indigo-200 transition-colors">
              <p className="text-[13px] text-gray-600">Taches du jour</p>
            </button>
            <button className="w-full text-left px-3 py-2.5 rounded-xl bg-white border border-gray-100 hover:border-indigo-200 transition-colors">
              <p className="text-[13px] text-gray-600">Taches en retard</p>
            </button>
            <button className="w-full text-left px-3 py-2.5 rounded-xl bg-white border border-gray-100 hover:border-indigo-200 transition-colors">
              <p className="text-[13px] text-gray-600">Taches a venir</p>
            </button>
            <button className="w-full text-left px-3 py-2.5 rounded-xl bg-white border border-gray-100 hover:border-indigo-200 transition-colors">
              <p className="text-[13px] text-gray-600">Toutes les taches</p>
            </button>
          </div>
        </div>

        {/* ── CSV ── */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            </div>
            <span className="text-[15px] font-bold text-gray-800">CSV</span>
          </div>
          <div className="space-y-1.5">
            <input ref={fileRef} type="file" accept=".csv,.txt,.tsv,text/csv,text/plain,application/vnd.ms-excel" onChange={handleCSVFile} className="hidden" />
            <button onClick={() => { if (fileRef.current) { fileRef.current.value = ''; fileRef.current.click() } }} disabled={importing}
              className="w-full text-left px-3 py-2.5 rounded-xl bg-white border border-dashed border-gray-300 hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
              <p className="text-[13px] text-gray-500">{importing ? 'Import en cours...' : 'Importer un CSV'}</p>
            </button>
            <p className="text-[11px] text-gray-400 px-3">Cliquer pour charger un fichier</p>
          </div>
        </div>

        {/* ── Listes intelligentes ── */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
            </div>
            <span className="text-[15px] font-bold text-gray-800">Listes intelligentes</span>
          </div>
          <div className="space-y-1.5">
            <button onClick={() => onSelect('smart:missed-calls')}
              className="w-full text-left px-3 py-2.5 rounded-xl bg-white border border-gray-100 hover:border-violet-300 hover:bg-violet-50/30 transition-colors">
              <p className="text-[13px] text-gray-700 font-medium">🔕 Appels manqués</p>
              <p className="text-[11px] text-gray-400">Déjà tentés, jamais connectés</p>
            </button>
            <button onClick={() => onSelect('smart:contacted-this-week')}
              className="w-full text-left px-3 py-2.5 rounded-xl bg-white border border-gray-100 hover:border-violet-300 hover:bg-violet-50/30 transition-colors">
              <p className="text-[13px] text-gray-700 font-medium">📞 Contactés cette semaine</p>
            </button>
            <button onClick={() => onSelect('smart:contacted-this-month')}
              className="w-full text-left px-3 py-2.5 rounded-xl bg-white border border-gray-100 hover:border-violet-300 hover:bg-violet-50/30 transition-colors">
              <p className="text-[13px] text-gray-700 font-medium">📅 Contactés ce mois</p>
            </button>
            <button onClick={() => onSelect('smart:contacted-30-days')}
              className="w-full text-left px-3 py-2.5 rounded-xl bg-white border border-gray-100 hover:border-violet-300 hover:bg-violet-50/30 transition-colors">
              <p className="text-[13px] text-gray-700 font-medium">🗓 Contactés les 30 derniers jours</p>
            </button>
          </div>
        </div>
      </div>

      {/* ── Modal Mapping CSV ── */}
      {csvHeaders.length > 0 && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
          onClick={e => { if (e.target === e.currentTarget) resetCSV() }}>
          <div className="bg-white rounded-2xl shadow-xl w-[700px] max-h-[85vh] flex flex-col overflow-hidden animate-fade-in-scale">

            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-[15px] font-bold text-gray-800">Mapper les colonnes</h2>
                <p className="text-[12px] text-gray-400 mt-0.5">{csvFileName}.csv — {csvRows.length} lignes</p>
              </div>
              <button onClick={resetCSV} className="text-gray-300 hover:text-gray-500 text-lg">&times;</button>
            </div>

            {/* Mapping */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-[13px] font-semibold text-gray-700">{csvProspects.length} contacts sur {csvRows.length} lignes</p>
                  <p className="text-[11px] text-gray-400">
                    {csvMapping.filter(m => m.startsWith('system:')).length} champs standard
                    {customMappingCount > 0 && <span className="text-violet-500"> + {customMappingCount} personnalisé{customMappingCount > 1 ? 's' : ''}</span>}
                  </p>
                </div>
                <button onClick={() => { resetCSV(); fileRef.current?.click() }}
                  className="text-[12px] text-gray-400 hover:text-gray-600">Changer de fichier</button>
              </div>

              <div className="grid gap-1.5 mb-5">
                {csvHeaders.map((h, i) => {
                  const mapped = csvMapping[i] || 'ignore'
                  const isActive = mapped !== 'ignore'
                  const isCustom = mapped.startsWith('custom:')
                  // Champs déjà pris par d'autres colonnes (pour griser dans le dropdown)
                  const usedFields = new Set(csvMapping.filter((m, j) => j !== i && m !== 'ignore'))
                  // 1 exemple par colonne
                  const example = csvRows.find(r => r[i]?.trim())?.[i]?.trim() || ''
                  return (
                    <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                      isCustom ? 'bg-violet-50/50' : isActive ? 'bg-indigo-50/50' : 'bg-gray-50/50'
                    }`}>
                      <div className="w-[150px] flex-shrink-0">
                        <p className="text-[12px] font-semibold text-gray-700 truncate">{h}</p>
                      </div>
                      <svg className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                      </svg>
                      <select value={mapped} onChange={e => {
                        const val = e.target.value
                        if (val === 'new') { openCreateField(i, h); return }
                        const newMapping = [...csvMapping]
                        newMapping[i] = val
                        setCsvMapping(deduplicateMapping(newMapping))
                        setCsvError(null)
                      }} className={`text-[12px] px-2 py-1.5 rounded-lg border outline-none flex-shrink-0 min-w-[160px] ${
                        isCustom ? 'border-violet-300 text-violet-700 bg-white font-medium' :
                        isActive ? 'border-indigo-300 text-indigo-700 bg-white font-medium' :
                        'border-gray-200 text-gray-400 bg-white'
                      }`}>
                        <option value="ignore">— Ignorer —</option>
                        <optgroup label="Champs standard">
                          {SYSTEM_FIELDS.map(f => {
                            const val = `system:${f.key}`
                            const taken = usedFields.has(val)
                            return <option key={f.key} value={val} disabled={taken}>{f.name}{taken ? ' ✓' : ''}</option>
                          })}
                        </optgroup>
                        {(customFields?.length || 0) > 0 && (
                          <optgroup label="Champs personnalisés">
                            {customFields!.map(f => {
                              const val = `custom:${f.id}`
                              const taken = usedFields.has(val)
                              return <option key={f.id} value={val} disabled={taken}>{f.name}{taken ? ' ✓' : ''}</option>
                            })}
                          </optgroup>
                        )}
                        <optgroup label="—">
                          <option value="new">+ Créer un nouveau champ</option>
                        </optgroup>
                      </select>
                      {example && (
                        <span className="text-[10px] text-gray-400 truncate ml-1 flex-1">({example})</span>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Warning doublon de liste */}
              {duplicateListName && (
                <div className="px-3 py-2 rounded-lg bg-orange-50 border border-orange-200 text-orange-700 text-[12px] mb-2 flex items-center gap-2">
                  <span className="font-bold">⚠</span> Une liste <strong>"{csvFileName}"</strong> existe déjà. L'import créera une nouvelle liste avec le même nom.
                </div>
              )}
              {/* Warnings mapping obligatoires */}
              {csvHeaders.length > 0 && !hasPhone && (
                <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-[12px] mb-2 flex items-center gap-2">
                  <span className="font-bold">!</span> Aucune colonne mappée en <strong>Téléphone</strong>. Sélectionnez la colonne qui contient les numéros.
                </div>
              )}
              {csvHeaders.length > 0 && !hasName && (
                <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-[12px] mb-2 flex items-center gap-2">
                  <span className="font-bold">!</span> Aucune colonne mappée en <strong>Nom</strong> (nom complet, prénom ou nom de famille).
                </div>
              )}
              {csvHeaders.length > 0 && hasPhone && csvProspects.length === 0 && (
                <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-[12px] mb-2 flex items-center gap-2">
                  <span className="font-bold">!</span> 0 contacts valides. Vérifiez que la colonne téléphone contient bien des numéros.
                </div>
              )}
              {csvError && <div className="px-3 py-2 rounded-lg bg-red-50 text-red-500 text-[12px] mb-3">{csvError}</div>}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-end gap-3">
              <button onClick={resetCSV} className="px-4 py-2 rounded-lg text-[13px] text-gray-500 hover:bg-gray-100">Annuler</button>
              <button onClick={handleCSVImport} disabled={importing || !canImport}
                className="px-5 py-2 rounded-lg text-[13px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors">
                {importing ? 'Import en cours...' : `Importer ${csvProspects.length} contacts`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal création champ personnalisé ── */}
      {newFieldIndex !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]"
          onClick={e => { if (e.target === e.currentTarget) { setNewFieldIndex(null); setNewFieldName('') } }}>
          <div className="bg-white rounded-2xl shadow-2xl w-[400px] overflow-hidden animate-fade-in-scale">
            <div className="px-5 pt-5 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
                  <svg className="w-4 h-4 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                </div>
                <h3 className="text-[15px] font-bold text-gray-800">Nouveau champ personnalisé</h3>
              </div>
              <p className="text-[12px] text-gray-400 ml-10">Ce champ sera disponible pour tous les prochains imports.</p>
            </div>
            <div className="px-5 pb-4">
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Nom du champ</label>
              <input ref={newFieldInputRef} autoFocus type="text" value={newFieldName}
                onChange={e => setNewFieldName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') confirmCreateField(); if (e.key === 'Escape') { setNewFieldIndex(null); setNewFieldName('') } }}
                placeholder="Ex: Discipline, Style artistique..."
                className="w-full text-[14px] px-3 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 text-gray-800 placeholder:text-gray-300" />
            </div>
            <div className="px-5 py-3 bg-gray-50 flex items-center justify-end gap-2 border-t border-gray-100">
              <button onClick={() => { setNewFieldIndex(null); setNewFieldName('') }}
                className="px-4 py-2 rounded-lg text-[13px] text-gray-500 hover:bg-gray-100 transition-colors">Annuler</button>
              <button onClick={confirmCreateField} disabled={!newFieldName.trim()}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 transition-colors">
                Créer le champ
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal confirmation suppression liste */}
      <ConfirmModal
        open={!!confirmDelete}
        title="Supprimer la liste"
        message={confirmDelete ? `Archiver "${confirmDelete.name}" et tous ses contacts ? Les données restent récupérables par l'équipe technique.` : ''}
        confirmLabel="Archiver"
        cancelLabel="Annuler"
        variant="danger"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return
          // Soft-delete via RPC qui archive la liste + tous ses prospects en une transaction serveur
          const { error } = await supabase.rpc('archive_prospect_list', { p_list_id: confirmDelete.id })
          if (error) { alert(`Erreur archivage : ${error.message}`); return }
          queryClient.invalidateQueries({ queryKey: ['prospect-lists'] })
          queryClient.invalidateQueries({ queryKey: ['prospects'] })
          setConfirmDelete(null)
        }}
      />
    </div>
  )
}
