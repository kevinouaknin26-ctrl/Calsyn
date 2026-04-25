/**
 * properties.ts — Modèle unifié de propriétés (HubSpot-style).
 *
 * Chaque champ (system ou custom) est une PropertyDefinition.
 * L'UI ne fait AUCUNE distinction entre les deux.
 * Les system fields lisent depuis la table prospects SQL.
 * Les custom fields lisent depuis prospect_field_values.
 */

import type { Prospect } from '@/types/prospect'

// ── Types ────────────────────────────────────────────────────────

export type FieldType = 'text' | 'number' | 'date' | 'url' | 'email' | 'phone' | 'enum' | 'boolean'

export interface PropertyDefinition {
  id: string              // "system:phone" ou UUID custom field
  key: string             // "phone", "discipline", etc.
  name: string            // "Téléphone", "Discipline"
  type: 'system' | 'custom'
  fieldType: FieldType
  group: string           // Clé du groupe
  groupLabel: string      // Label du groupe (pour l'UI)
  options?: string[]      // Pour les enums
  isRequired?: boolean
  isReadOnly?: boolean    // call_count, last_call_at, etc.
}

// ── Groupes ──────────────────────────────────────────────────────

export const PROPERTY_GROUPS = [
  { key: 'contact_info', label: 'Informations contact' },
  { key: 'address', label: 'Adresse' },
  { key: 'social', label: 'Réseaux & Web' },
  { key: 'call_data', label: 'Données appels' },
  { key: 'crm', label: 'CRM' },
  { key: 'custom', label: 'Champs personnalisés' },
] as const

// ── Propriétés système ───────────────────────────────────────────

export const SYSTEM_PROPERTIES: PropertyDefinition[] = [
  // Contact info
  { id: 'system:name', key: 'name', name: 'Nom', type: 'system', fieldType: 'text', group: 'contact_info', groupLabel: 'Informations contact', isRequired: true },
  { id: 'system:phone', key: 'phone', name: 'Téléphone', type: 'system', fieldType: 'phone', group: 'contact_info', groupLabel: 'Informations contact', isRequired: true },
  { id: 'system:phone2', key: 'phone2', name: 'Téléphone 2', type: 'system', fieldType: 'phone', group: 'contact_info', groupLabel: 'Informations contact' },
  { id: 'system:email', key: 'email', name: 'Email', type: 'system', fieldType: 'email', group: 'contact_info', groupLabel: 'Informations contact' },
  { id: 'system:company', key: 'company', name: 'Société', type: 'system', fieldType: 'text', group: 'contact_info', groupLabel: 'Informations contact' },
  { id: 'system:title', key: 'title', name: 'Poste', type: 'system', fieldType: 'text', group: 'contact_info', groupLabel: 'Informations contact' },
  { id: 'system:sector', key: 'sector', name: 'Secteur', type: 'system', fieldType: 'text', group: 'contact_info', groupLabel: 'Informations contact' },

  // Address
  { id: 'system:address', key: 'address', name: 'Adresse', type: 'system', fieldType: 'text', group: 'address', groupLabel: 'Adresse' },
  { id: 'system:city', key: 'city', name: 'Ville', type: 'system', fieldType: 'text', group: 'address', groupLabel: 'Adresse' },
  { id: 'system:postal_code', key: 'postal_code', name: 'Code postal', type: 'system', fieldType: 'text', group: 'address', groupLabel: 'Adresse' },
  { id: 'system:country', key: 'country', name: 'Pays', type: 'system', fieldType: 'text', group: 'address', groupLabel: 'Adresse' },

  // Social & web — tout passe par la colonne "Liens" (logos)
  // linkedin_url et website_url sont stockés en SQL mais affichés comme logos dans "Liens", pas comme colonnes texte
  { id: 'system:socials', key: 'socials', name: 'Liens', type: 'system', fieldType: 'text', group: 'social', groupLabel: 'Réseaux & Web', isReadOnly: true },

  // Call data (read-only, computed by the system)
  { id: 'system:call_count', key: 'call_count', name: 'Appels', type: 'system', fieldType: 'number', group: 'call_data', groupLabel: 'Données appels', isReadOnly: true },
  { id: 'system:last_call_at', key: 'last_call_at', name: 'Dernier appel', type: 'system', fieldType: 'date', group: 'call_data', groupLabel: 'Données appels', isReadOnly: true },
  { id: 'system:last_call_outcome', key: 'last_call_outcome', name: 'Résultat dernier appel', type: 'system', fieldType: 'text', group: 'call_data', groupLabel: 'Données appels', isReadOnly: true },

  // Dates
  { id: 'system:created_at', key: 'created_at', name: 'Date de création', type: 'system', fieldType: 'date', group: 'call_data', groupLabel: 'Données appels', isReadOnly: true },
  { id: 'system:rdv_date', key: 'rdv_date', name: 'Date du RDV', type: 'system', fieldType: 'date', group: 'crm', groupLabel: 'CRM' },

  // CRM
  { id: 'system:crm_status', key: 'crm_status', name: 'Statut CRM', type: 'system', fieldType: 'enum', group: 'crm', groupLabel: 'CRM',
    options: ['new', 'attempted_to_contact', 'connected', 'in_progress', 'callback', 'not_interested', 'mail_sent', 'rdv_pris', 'rdv_fait', 'en_attente_signature', 'signe', 'en_attente_paiement', 'paye'] },
  { id: 'system:meeting_booked', key: 'meeting_booked', name: 'RDV pris', type: 'system', fieldType: 'boolean', group: 'crm', groupLabel: 'CRM' },
  { id: 'system:do_not_call', key: 'do_not_call', name: 'Ne pas appeler', type: 'system', fieldType: 'boolean', group: 'crm', groupLabel: 'CRM' },

  // Métadonnées dérivées (calculées côté CRMGlobal pour MergedProspect)
  { id: 'system:list_names', key: 'list_names', name: 'Listes', type: 'system', fieldType: 'text', group: 'crm', groupLabel: 'CRM', isReadOnly: true },
  { id: 'system:assigned_sdrs', key: 'assigned_sdrs', name: 'Commerciaux', type: 'system', fieldType: 'text', group: 'crm', groupLabel: 'CRM', isReadOnly: true },
]

// Colonnes par défaut dans le tableau
export const DEFAULT_VISIBLE_COLUMNS = [
  'system:list_names', 'system:assigned_sdrs',
  'system:socials', 'system:phone', 'system:email', 'system:company', 'system:title', 'system:last_call_at', 'system:crm_status',
]

// ── Helpers ──────────────────────────────────────────────────────

export const CRM_STATUS_LABELS: Record<string, string> = {
  new: 'Nouveau', open: 'Ouvert', in_progress: 'En cours', open_deal: 'Affaire ouverte',
  attempted_to_contact: 'Tenté', connected: 'Connecté', not_interested: 'Pas intéressé',
  callback: 'Rappel', rdv_pris: 'RDV pris', rdv_fait: 'RDV fait',
  en_attente_signature: 'En attente signature', signe: 'Signé',
  en_attente_paiement: 'En attente paiement', paye: 'Payé',
  mail_sent: 'Mail envoyé', unqualified: 'Non qualifié', bad_timing: 'Mauvais timing',
}

/** Lit la valeur d'une propriété depuis le prospect (system) ou les custom values */
export function getPropertyValue(
  prospect: Prospect,
  customValues: Record<string, string> | undefined,
  prop: PropertyDefinition,
): string {
  if (prop.type === 'custom') {
    const fieldId = prop.id // UUID direct
    return customValues?.[fieldId] || ''
  }

  // System field — lire depuis le prospect
  const val = (prospect as Record<string, unknown>)[prop.key]
  if (val === null || val === undefined) return ''

  // Formatage selon le type
  // crm_status : retourner la clé brute (le label est géré par le select/enumLabels)
  if (prop.key === 'crm_status') return String(val)
  if (prop.key === 'meeting_booked' || prop.key === 'do_not_call') return val ? 'Oui' : 'Non'
  if (prop.key === 'last_call_at') return formatRelativeTime(String(val))
  if (prop.key === 'call_count') return String(val)

  return String(val)
}

/** Temps relatif (il y a 5 min, hier, etc.) */
function formatRelativeTime(dateStr: string): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "à l'instant"
  if (mins < 60) return `il y a ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `il y a ${hours}h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'hier'
  return `il y a ${days}j`
}

/** Vérifie si une valeur matche un filtre de recherche texte */
export function matchesSearch(
  prospect: Prospect,
  customValues: Record<string, string> | undefined,
  properties: PropertyDefinition[],
  search: string,
): boolean {
  if (!search) return true
  const lower = search.toLowerCase()
  // Chercher dans le nom (toujours)
  if (prospect.name.toLowerCase().includes(lower)) return true
  // Chercher dans toutes les propriétés visibles
  for (const prop of properties) {
    const val = getPropertyValue(prospect, customValues, prop)
    if (val && val.toLowerCase().includes(lower)) return true
  }
  return false
}
