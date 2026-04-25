/**
 * MultiSelectFilter — Dropdown checkboxes pour filtrer une colonne par
 * plusieurs valeurs (Excel/HubSpot style). Stocke la sélection en CSV
 * "val1,val2" pour rester compatible avec FilterOp:'in'.
 *
 * Extrait depuis Dialer.tsx pour réutilisation côté CRM.
 */

import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  options: string[]
  value: string
  labelize?: (v: string) => string
  onChange: (newValue: string) => void
}

export default function MultiSelectFilter({ options, value, labelize, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)

  const selected = useMemo(
    () => new Set(value ? value.split(',').map(s => s.trim()).filter(Boolean) : []),
    [value],
  )
  const display = useMemo(() => {
    if (selected.size === 0) return 'tout'
    if (selected.size === 1) return labelize ? labelize(Array.from(selected)[0]) : Array.from(selected)[0]
    return `${selected.size} sélectionnés`
  }, [selected, labelize])

  const toggle = (v: string) => {
    const next = new Set(selected)
    if (next.has(v)) next.delete(v); else next.add(v)
    onChange(Array.from(next).join(','))
  }
  const all = () => onChange(options.join(','))
  const none = () => onChange('')

  const handleOpen = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setCoords({ top: r.bottom + 4, left: r.left })
    setOpen(v => !v)
  }

  return (
    <>
      <button ref={btnRef} type="button" onClick={handleOpen}
        className="text-[11px] bg-transparent border-0 outline-none text-gray-700 font-medium cursor-pointer flex items-center gap-1">
        <span>{display}</span>
        <svg className="w-2.5 h-2.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && coords && createPortal(
        <>
          <div className="fixed inset-0 z-[1000]" onClick={() => setOpen(false)} />
          <div className="fixed z-[1001] bg-white rounded-lg border border-gray-200 shadow-lg w-[260px] max-h-[360px] flex flex-col"
            style={{ top: coords.top, left: coords.left }}>
            <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-2 flex-shrink-0">
              <button onClick={all} className="text-[10px] text-indigo-600 hover:underline">Tout</button>
              <span className="text-gray-300 text-[10px]">·</span>
              <button onClick={none} className="text-[10px] text-gray-500 hover:underline">Aucun</button>
              <span className="ml-auto text-[10px] text-gray-400">{selected.size}/{options.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {options.map(opt => {
                const isSel = selected.has(opt)
                return (
                  <label key={opt} className="flex items-center gap-2 px-3 py-1 hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={isSel} onChange={() => toggle(opt)}
                      className="w-3.5 h-3.5 rounded border-gray-300 accent-indigo-600" />
                    <span className={`text-[12px] truncate ${isSel ? 'text-gray-800 font-medium' : 'text-gray-600'}`}>
                      {labelize ? labelize(opt) : opt}
                    </span>
                  </label>
                )
              })}
              {options.length === 0 && (
                <div className="px-3 py-3 text-[11px] text-gray-400 text-center italic">Aucune valeur dans cette colonne</div>
              )}
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  )
}
