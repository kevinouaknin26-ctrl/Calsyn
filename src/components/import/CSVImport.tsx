/**
 * CSVImport — Import CSV intelligent avec detection auto et mapping visuel.
 *
 * 1. Upload le fichier
 * 2. Detecte automatiquement les colonnes (par header ET par contenu)
 * 3. Montre un mapping visuel editable
 * 4. Preview des 5 premieres lignes
 * 5. Import en 1 clic
 */

import { useState, useRef, type ChangeEvent } from 'react'
import { useImportProspects } from '@/hooks/useProspects'

interface Props {
  listId: string
  onClose: () => void
  onSuccess: (count: number) => void
}

interface ParsedRow {
  name: string
  phone: string
  email?: string
  company?: string
  title?: string
  sector?: string
}

type FieldKey = 'name' | 'first_name' | 'last_name' | 'phone' | 'email' | 'company' | 'title' | 'sector' | 'ignore'

const FIELD_OPTIONS: Array<{ value: FieldKey; label: string }> = [
  { value: 'ignore', label: '— Ignorer —' },
  { value: 'name', label: 'Nom complet' },
  { value: 'first_name', label: 'Prenom' },
  { value: 'last_name', label: 'Nom de famille' },
  { value: 'phone', label: 'Telephone' },
  { value: 'email', label: 'Email' },
  { value: 'company', label: 'Entreprise' },
  { value: 'title', label: 'Poste' },
  { value: 'sector', label: 'Secteur' },
]

/** Normalise un header */
function norm(h: string): string {
  return h.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
}

/** Detection intelligente : par header ET par contenu de la colonne */
function detectField(header: string, sampleValues: string[]): FieldKey {
  const n = norm(header)

  // Par header (exact)
  const headerMap: Record<string, FieldKey> = {
    name: 'name', nom: 'name', fullname: 'name', contact: 'name',
    firstname: 'first_name', prenom: 'first_name',
    lastname: 'last_name', nomdefamille: 'last_name',
    phone: 'phone', telephone: 'phone', tel: 'phone', mobile: 'phone', numero: 'phone',
    email: 'email', mail: 'email', courriel: 'email',
    company: 'company', entreprise: 'company', societe: 'company',
    title: 'title', poste: 'title', jobtitle: 'title', fonction: 'title',
    sector: 'sector', secteur: 'sector', industry: 'sector',
  }
  if (headerMap[n]) return headerMap[n]

  // Par header (partiel)
  if (n.includes('nom') || n.includes('artiste') || n.includes('contact') || n.includes('name')) return 'name'
  if (n.includes('prenom') || n.includes('first')) return 'first_name'
  if (n.includes('phone') || n.includes('tel') || n.includes('mobile') || n.includes('numero') || n.includes('gsm')) return 'phone'
  if (n.includes('mail') || n.includes('courriel')) return 'email'
  if (n.includes('entreprise') || n.includes('societe') || n.includes('company') || n.includes('organisation')) return 'company'
  if (n.includes('poste') || n.includes('title') || n.includes('fonction') || n.includes('role')) return 'title'

  // Par contenu — analyser les valeurs
  const nonEmpty = sampleValues.filter(v => v.trim())
  if (nonEmpty.length === 0) return 'ignore'

  // Detecter telephone par format (06, 07, +33, chiffres avec espaces/tirets)
  const phonePattern = /^[\+]?[\d\s\-\.\(\)]{8,}$/
  if (nonEmpty.filter(v => phonePattern.test(v.trim())).length >= nonEmpty.length * 0.6) return 'phone'

  // Detecter email par @
  if (nonEmpty.filter(v => v.includes('@')).length >= nonEmpty.length * 0.5) return 'email'

  return 'ignore'
}

/** Nettoie un numero */
function cleanPhone(raw: string): string {
  let p = raw.replace(/[\s\-\.\(\)]/g, '')
  if (p.startsWith('0') && p.length === 10) p = '+33' + p.substring(1)
  if (p.startsWith('33') && p.length === 11) p = '+' + p
  return p
}

/** Parse CSV (supporte , et ; et BOM) */
function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  // Retirer BOM
  const clean = text.replace(/^\uFEFF/, '')
  const lines = clean.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return { headers: [], rows: [] }
  const sep = lines[0].includes(';') ? ';' : ','
  const headers = lines[0].split(sep).map(h => h.replace(/^"|"$/g, '').trim())
  const rows = lines.slice(1).map(l => l.split(sep).map(c => c.replace(/^"|"$/g, '').trim()))
  return { headers, rows }
}

export default function CSVImport({ listId, onClose, onSuccess }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<FieldKey[]>([])
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const importMutation = useImportProspects()

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

      // Detection auto intelligente
      const autoMapping = parsed.headers.map((h, i) => {
        const sampleValues = parsed.rows.slice(0, 10).map(r => r[i] || '')
        return detectField(h, sampleValues)
      })

      // Verifier qu'on a au moins un telephone
      if (!autoMapping.includes('phone')) {
        setError('Aucune colonne telephone detectee. Ajustez le mapping ci-dessous.')
      }

      setMapping(autoMapping)
    }
    reader.readAsText(file, 'UTF-8')
  }

  function buildProspects(): ParsedRow[] {
    const result: ParsedRow[] = []
    for (const row of rows) {
      const obj: Record<string, string> = {}
      mapping.forEach((field, i) => {
        if (field !== 'ignore' && row[i]?.trim()) {
          if (obj[field]) obj[field] += ' ' + row[i].trim()
          else obj[field] = row[i].trim()
        }
      })
      let name = obj.name || ''
      if (!name && (obj.first_name || obj.last_name)) name = [obj.first_name, obj.last_name].filter(Boolean).join(' ')
      if (!name) name = 'Sans nom'
      const phone = cleanPhone(obj.phone || '')
      if (!phone || phone.length < 8) continue
      result.push({ name, phone, email: obj.email, company: obj.company, title: obj.title, sector: obj.sector })
    }
    return result
  }

  const prospects = headers.length > 0 ? buildProspects() : []
  const hasPhone = mapping.includes('phone')

  async function handleImport() {
    if (!prospects.length) return
    setImporting(true)
    setError(null)
    try {
      await importMutation.mutateAsync({ listId, prospects })
      onSuccess(prospects.length)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur import')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-[700px] max-h-[85vh] flex flex-col overflow-hidden animate-fade-in-scale">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-gray-800">Importer un CSV</h2>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 text-lg">&times;</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">

          {/* Upload zone */}
          {headers.length === 0 ? (
            <div className="text-center py-12">
              <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" />
              <button onClick={() => fileRef.current?.click()}
                className="px-8 py-6 rounded-2xl bg-gray-50 border-2 border-dashed border-gray-200 hover:border-teal-300 hover:bg-teal-50/30 transition-colors">
                <svg className="w-10 h-10 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-[14px] font-medium text-gray-600">Cliquer pour charger un fichier CSV</p>
                <p className="text-[12px] text-gray-400 mt-1">Colonnes detectees automatiquement</p>
              </button>
            </div>
          ) : (
            <>
              {/* Mapping visuel */}
              <div className="mb-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[13px] font-semibold text-gray-700">{prospects.length} contacts detectes sur {rows.length} lignes</p>
                  <button onClick={() => { setHeaders([]); setRows([]); setMapping([]) }}
                    className="text-[12px] text-gray-400 hover:text-gray-600">Changer de fichier</button>
                </div>

                <div className="grid gap-2">
                  {headers.map((h, i) => {
                    const detected = mapping[i]
                    const sample = rows[0]?.[i] || ''
                    return (
                      <div key={i} className="flex items-center gap-3 py-1.5">
                        <div className="w-[180px] flex-shrink-0">
                          <p className="text-[12px] font-medium text-gray-700 truncate">{h}</p>
                          <p className="text-[11px] text-gray-400 truncate">{sample || '(vide)'}</p>
                        </div>
                        <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                        </svg>
                        <select value={detected} onChange={e => {
                          const newMapping = [...mapping]
                          newMapping[i] = e.target.value as FieldKey
                          setMapping(newMapping)
                          setError(null)
                        }} className={`text-[12px] px-2 py-1.5 rounded-lg border outline-none ${
                          detected === 'ignore' ? 'border-gray-200 text-gray-400' : 'border-teal-200 text-teal-700 bg-teal-50'
                        }`}>
                          {FIELD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Preview */}
              {prospects.length > 0 && (
                <div className="mb-4">
                  <p className="text-[12px] font-semibold text-gray-500 mb-2">Apercu</p>
                  <div className="overflow-x-auto rounded-lg border border-gray-100">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="bg-gray-50 text-gray-400 uppercase">
                          <th className="px-2 py-1.5 text-left font-bold">Nom</th>
                          <th className="px-2 py-1.5 text-left font-bold">Telephone</th>
                          <th className="px-2 py-1.5 text-left font-bold">Email</th>
                          <th className="px-2 py-1.5 text-left font-bold">Entreprise</th>
                          <th className="px-2 py-1.5 text-left font-bold">Poste</th>
                        </tr>
                      </thead>
                      <tbody>
                        {prospects.slice(0, 5).map((p, i) => (
                          <tr key={i} className="border-t border-gray-50">
                            <td className="px-2 py-1.5 text-gray-700">{p.name}</td>
                            <td className="px-2 py-1.5 text-gray-500 font-mono">{p.phone}</td>
                            <td className="px-2 py-1.5 text-gray-400">{p.email || '—'}</td>
                            <td className="px-2 py-1.5 text-gray-400">{p.company || '—'}</td>
                            <td className="px-2 py-1.5 text-gray-400">{p.title || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {prospects.length > 5 && <p className="text-[11px] text-gray-400 mt-1">...et {prospects.length - 5} autres</p>}
                </div>
              )}
            </>
          )}

          {error && <div className="px-3 py-2 rounded-lg bg-red-50 text-red-500 text-[12px] mb-3">{error}</div>}
        </div>

        {/* Footer */}
        {headers.length > 0 && (
          <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] text-gray-500 hover:bg-gray-100">Annuler</button>
            <button onClick={handleImport} disabled={importing || !hasPhone || !prospects.length}
              className="px-5 py-2 rounded-lg text-[13px] font-semibold bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 transition-colors">
              {importing ? 'Import en cours...' : `Importer ${prospects.length} contacts`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
