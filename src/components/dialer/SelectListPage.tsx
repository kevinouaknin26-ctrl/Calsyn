/**
 * SelectListPage — "Choisir une liste" (Minari frame 005 exact)
 * 4 colonnes : Listes | Taches | CSV | Listes intelligentes
 * S'affiche quand on clique "Nouvelle liste" dans le Dialer.
 */

import { useState, useRef, type ChangeEvent } from 'react'
import { useProspectLists, useCreateList, useImportProspects } from '@/hooks/useProspects'

interface Props {
  onSelect: (listId: string) => void
  onClose: () => void
}

/** Parse CSV simple */
function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return { headers: [], rows: [] }
  const sep = lines[0].includes(';') ? ';' : ','
  const headers = lines[0].split(sep).map(h => h.replace(/^"|"$/g, '').trim())
  const rows = lines.slice(1).map(l => l.split(sep).map(c => c.replace(/^"|"$/g, '').trim()))
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

export default function SelectListPage({ onSelect, onClose }: Props) {
  const { data: lists } = useProspectLists()
  const createList = useCreateList()
  const importProspects = useImportProspects()
  const [search, setSearch] = useState('')
  const [importing, setImporting] = useState(false)
  const [creatingList, setCreatingList] = useState(false)
  const [newListName, setNewListName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const filtered = lists?.filter(l => !search || l.name.toLowerCase().includes(search.toLowerCase()))

  async function handleCSVImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)

    const text = await file.text()
    const { headers, rows } = parseCSV(text)
    const mapping = headers.map(h => mapHeader(normalizeHeader(h)))
    const phoneIdx = mapping.indexOf('phone')
    if (phoneIdx === -1) { setImporting(false); return }

    // Creer une liste avec le nom du fichier
    const listName = file.name.replace(/\.(csv|txt)$/i, '')
    const list = await createList.mutateAsync(listName)

    // Parser les contacts
    const prospects: Array<{ name: string; phone: string; email?: string; company?: string; title?: string; sector?: string }> = []
    for (const row of rows) {
      const obj: Record<string, string> = {}
      mapping.forEach((field, i) => { if (field && row[i]) obj[field] = row[i] })
      let name = obj.name || ''
      if (!name && (obj.first_name || obj.last_name)) name = [obj.first_name, obj.last_name].filter(Boolean).join(' ')
      if (!name) name = 'Sans nom'
      const phone = cleanPhone(obj.phone || '')
      if (!phone || phone.length < 8) continue
      prospects.push({ name, phone, email: obj.email, company: obj.company, title: obj.title, sector: obj.sector })
    }

    if (prospects.length > 0) {
      await importProspects.mutateAsync({ listId: list.id, prospects })
    }

    setImporting(false)
    onSelect(list.id)
  }

  return (
    <div className="min-h-screen bg-[#f0faf4] p-8">
      {/* Header */}
      <div className="text-center mb-6">
        <button onClick={onClose} className="absolute left-20 top-8 text-gray-400 hover:text-gray-600 text-sm flex items-center gap-1">
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
              <div className="px-3 py-2.5 rounded-xl bg-white border border-teal-200 animate-fade-in">
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
                  }} className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-teal-600 text-white">Créer</button>
                  <button onClick={() => { setCreatingList(false); setNewListName('') }}
                    className="px-2.5 py-1 rounded-lg text-[11px] text-gray-400">Annuler</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setCreatingList(true)}
                className="w-full text-left px-3 py-2.5 rounded-xl border border-dashed border-gray-300 hover:border-teal-400 hover:bg-teal-50/30 transition-colors flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                <p className="text-[13px] text-gray-500">Créer une liste vide</p>
              </button>
            )}

            {filtered?.map(l => (
              <button key={l.id} onClick={() => onSelect(l.id)}
                className="w-full text-left px-3 py-2.5 rounded-xl bg-white border border-gray-100 hover:border-teal-200 hover:bg-teal-50/30 transition-colors">
                <p className="text-[13px] font-medium text-gray-800">{l.name}</p>
                <p className="text-[11px] text-gray-400">contacts</p>
              </button>
            ))}
            {!filtered?.length && <p className="text-[12px] text-gray-400 py-4 text-center">Aucune liste</p>}
          </div>
        </div>

        {/* ── Taches ── */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
            </div>
            <span className="text-[15px] font-bold text-gray-800">Taches</span>
          </div>
          <div className="space-y-1.5">
            <button className="w-full text-left px-3 py-2.5 rounded-xl bg-white border border-gray-100 hover:border-teal-200 transition-colors">
              <p className="text-[13px] text-gray-600">Taches du jour</p>
            </button>
            <button className="w-full text-left px-3 py-2.5 rounded-xl bg-white border border-gray-100 hover:border-teal-200 transition-colors">
              <p className="text-[13px] text-gray-600">Taches en retard</p>
            </button>
            <button className="w-full text-left px-3 py-2.5 rounded-xl bg-white border border-gray-100 hover:border-teal-200 transition-colors">
              <p className="text-[13px] text-gray-600">Taches a venir</p>
            </button>
            <button className="w-full text-left px-3 py-2.5 rounded-xl bg-white border border-gray-100 hover:border-teal-200 transition-colors">
              <p className="text-[13px] text-gray-600">Toutes les taches</p>
            </button>
          </div>
        </div>

        {/* ── CSV ── */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-teal-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            </div>
            <span className="text-[15px] font-bold text-gray-800">CSV</span>
          </div>
          <div className="space-y-1.5">
            <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleCSVImport} className="hidden" />
            <button onClick={() => fileRef.current?.click()} disabled={importing}
              className="w-full text-left px-3 py-2.5 rounded-xl bg-white border border-dashed border-gray-300 hover:border-teal-400 hover:bg-teal-50/30 transition-colors flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
              <p className="text-[13px] text-gray-500">{importing ? 'Import en cours...' : 'Importer un CSV'}</p>
            </button>
            <p className="text-[11px] text-gray-400 px-3">Glisser-deposer ou cliquer pour charger</p>
          </div>
        </div>

        {/* ── Listes intelligentes ── */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
            </div>
            <span className="text-[15px] font-bold text-gray-800">Listes intelligentes</span>
          </div>
          <div className="space-y-1.5">
            <button className="w-full text-left px-3 py-2.5 rounded-xl bg-white border border-gray-100 hover:border-teal-200 transition-colors">
              <p className="text-[13px] text-gray-600">Appels manques</p>
              <p className="text-[11px] text-gray-400">Pas encore de donnees</p>
            </button>
            <button className="w-full text-left px-3 py-2.5 rounded-xl bg-white border border-gray-100 hover:border-teal-200 transition-colors">
              <p className="text-[13px] text-gray-600">Contactes cette semaine</p>
            </button>
            <button className="w-full text-left px-3 py-2.5 rounded-xl bg-white border border-gray-100 hover:border-teal-200 transition-colors">
              <p className="text-[13px] text-gray-600">Contactes ce mois</p>
            </button>
            <button className="w-full text-left px-3 py-2.5 rounded-xl bg-white border border-gray-100 hover:border-teal-200 transition-colors">
              <p className="text-[13px] text-gray-600">Contactes les 30 derniers jours</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
