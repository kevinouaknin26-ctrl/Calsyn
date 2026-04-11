/**
 * CSVImport — Import de contacts depuis un fichier CSV.
 * Style Minari : modal simple, mapping auto des champs.
 * Champs supportés : Prénom/Nom (ou Name), Phone, Email, Company, Title, Sector
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

/** Normalise un header CSV pour le mapping auto */
function normalizeHeader(h: string): string {
  return h.toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

/** Mappe un header normalisé vers notre champ */
function mapHeader(normalized: string): keyof ParsedRow | 'first_name' | 'last_name' | null {
  const MAP: Record<string, keyof ParsedRow | 'first_name' | 'last_name'> = {
    name: 'name', nom: 'name', fullname: 'name', contact: 'name',
    firstname: 'first_name', prenom: 'first_name', first: 'first_name',
    lastname: 'last_name', nomdefamille: 'last_name', last: 'last_name',
    phone: 'phone', telephone: 'phone', tel: 'phone', mobile: 'phone', phonenumber: 'phone', numero: 'phone',
    email: 'email', mail: 'email', emailaddress: 'email', courriel: 'email',
    company: 'company', entreprise: 'company', societe: 'company', organisation: 'company', companyname: 'company',
    title: 'title', poste: 'title', jobtitle: 'title', fonction: 'title', role: 'title',
    sector: 'sector', secteur: 'sector', industry: 'sector', industrie: 'sector',
  }
  return MAP[normalized] || null
}

/** Nettoie un numéro de téléphone */
function cleanPhone(raw: string): string {
  let phone = raw.replace(/[\s\-\.\(\)]/g, '')
  // Convertir 06... → +336...
  if (phone.startsWith('0') && phone.length === 10) {
    phone = '+33' + phone.substring(1)
  }
  // Ajouter + si manquant
  if (phone.startsWith('33') && phone.length === 11) {
    phone = '+' + phone
  }
  return phone
}

/** Parse le CSV (supporte , et ;) */
function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return { headers: [], rows: [] }

  // Détecter le séparateur
  const sep = lines[0].includes(';') ? ';' : ','

  const headers = lines[0].split(sep).map(h => h.replace(/^"|"$/g, '').trim())
  const rows = lines.slice(1).map(line =>
    line.split(sep).map(cell => cell.replace(/^"|"$/g, '').trim())
  )

  return { headers, rows }
}

export default function CSVImport({ listId, onClose, onSuccess }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<{ headers: string[]; mapping: (string | null)[]; rows: string[][]; parsed: ParsedRow[] } | null>(null)
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
      const { headers, rows } = parseCSV(text)

      if (headers.length === 0) {
        setError('Fichier CSV vide ou invalide')
        return
      }

      // Auto-map headers
      const mapping = headers.map(h => {
        const field = mapHeader(normalizeHeader(h))
        return field
      })

      // Vérifier qu'on a au moins phone
      const phoneIdx = mapping.indexOf('phone')
      if (phoneIdx === -1) {
        setError('Colonne "Phone" ou "Telephone" introuvable dans le CSV')
        return
      }

      // Parser les rows
      const parsed: ParsedRow[] = []
      for (const row of rows) {
        const obj: Record<string, string> = {}
        mapping.forEach((field, i) => {
          if (field && row[i]) obj[field] = row[i]
        })

        // Construire le nom
        let name = obj.name || ''
        if (!name && (obj.first_name || obj.last_name)) {
          name = [obj.first_name, obj.last_name].filter(Boolean).join(' ')
        }
        if (!name) name = 'Sans nom'

        const phone = cleanPhone(obj.phone || '')
        if (!phone || phone.length < 8) continue // Skip lignes sans tel valide

        parsed.push({
          name,
          phone,
          email: obj.email || undefined,
          company: obj.company || undefined,
          title: obj.title || undefined,
          sector: obj.sector || undefined,
        })
      }

      setPreview({ headers, mapping, rows: rows.slice(0, 5), parsed })
    }
    reader.readAsText(file, 'UTF-8')
  }

  async function handleImport() {
    if (!preview?.parsed.length) return
    setImporting(true)
    setError(null)

    try {
      await importMutation.mutateAsync({ listId, prospects: preview.parsed })
      onSuccess(preview.parsed.length)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur import')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-[600px] max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-800">Import CSV</h2>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 text-lg">&times;</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {!preview ? (
            <div className="text-center py-10">
              <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" />
              <button onClick={() => fileRef.current?.click()}
                className="px-6 py-3 rounded-xl bg-gray-50 border-2 border-dashed border-gray-200 hover:border-teal-300 hover:bg-teal-50/50 transition-colors">
                <svg className="w-8 h-8 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-sm font-medium text-gray-600">Cliquer pour charger un fichier CSV</p>
                <p className="text-[11px] text-gray-400 mt-1">Colonnes : Nom, Telephone, Email, Entreprise, Poste</p>
              </button>
            </div>
          ) : (
            <>
              {/* Mapping preview */}
              <div className="mb-4">
                <p className="text-sm font-semibold text-gray-700 mb-2">{preview.parsed.length} contacts detectes</p>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {preview.headers.map((h, i) => {
                    const mapped = preview.mapping[i]
                    return (
                      <span key={i} className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                        mapped ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'
                      }`}>
                        {h} {mapped ? `→ ${mapped}` : '(ignore)'}
                      </span>
                    )
                  })}
                </div>
              </div>

              {/* Preview table */}
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] font-bold text-gray-400 uppercase border-b">
                      <th className="py-1.5 px-2 text-left">Nom</th>
                      <th className="py-1.5 px-2 text-left">Telephone</th>
                      <th className="py-1.5 px-2 text-left">Email</th>
                      <th className="py-1.5 px-2 text-left">Entreprise</th>
                      <th className="py-1.5 px-2 text-left">Poste</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.parsed.slice(0, 5).map((p, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-1.5 px-2 text-gray-700">{p.name}</td>
                        <td className="py-1.5 px-2 text-gray-500 font-mono">{p.phone}</td>
                        <td className="py-1.5 px-2 text-gray-400">{p.email || '—'}</td>
                        <td className="py-1.5 px-2 text-gray-400">{p.company || '—'}</td>
                        <td className="py-1.5 px-2 text-gray-400">{p.title || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.parsed.length > 5 && (
                  <p className="text-[11px] text-gray-400 mt-1">...et {preview.parsed.length - 5} autres</p>
                )}
              </div>
            </>
          )}

          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-50 text-red-500 text-xs mb-3">{error}</div>
          )}
        </div>

        {/* Footer */}
        {preview && (
          <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between">
            <button onClick={() => setPreview(null)} className="text-xs text-gray-400 hover:text-gray-600">
              Changer de fichier
            </button>
            <button onClick={handleImport} disabled={importing || !preview.parsed.length}
              className="px-5 py-2 rounded-lg text-sm font-semibold bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 transition-colors">
              {importing ? 'Import en cours...' : `Importer ${preview.parsed.length} contacts`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
