/**
 * usePermissions — Source unique de vérité pour les permissions frontend.
 * 3 rôles effectifs : Super Admin > Admin > Commercial (SDR)
 * Le rôle 'manager' est traité comme 'admin' (backward compat).
 */

import { useAuth } from './useAuth'
import type { Role } from '@/types/user'

export interface Permissions {
  // Contacts
  canViewAllContacts: boolean
  canEditContacts: boolean
  canDeleteContacts: boolean
  canImportCSV: boolean
  canExportData: boolean

  // Listes
  canCreateLists: boolean
  canDeleteLists: boolean
  canRenameLists: boolean

  // Appels & Recordings
  canViewAllCalls: boolean
  canViewOwnCalls: boolean
  canViewAllRecordings: boolean

  // Settings
  canAccessSettings: boolean
  canManageCallSettings: boolean
  canManageUsers: boolean
  canInviteUsers: boolean
  canChangeRoles: boolean
  canManagePhoneNumbers: boolean
  canAssignPhoneNumbers: boolean
  canManagePipeline: boolean
  canManageFields: boolean
  canManageIntegrations: boolean
  canAccessBilling: boolean
  canManageWebhooks: boolean

  // Analytics
  canViewAllAnalytics: boolean
  canViewOwnAnalytics: boolean

  // Phone
  canChangeFromNumber: boolean

  // Role helpers
  isSuperAdmin: boolean
  isAdmin: boolean
  isSdr: boolean
  role: Role | null
}

const SUPER_ADMIN: Permissions = {
  canViewAllContacts: true,
  canEditContacts: true,
  canDeleteContacts: true,
  canImportCSV: true,
  canExportData: true,
  canCreateLists: true,
  canDeleteLists: true,
  canRenameLists: true,
  canViewAllCalls: true,
  canViewOwnCalls: true,
  canViewAllRecordings: true,
  canAccessSettings: true,
  canManageCallSettings: true,
  canManageUsers: true,
  canInviteUsers: true,
  canChangeRoles: true,
  canManagePhoneNumbers: true,
  canAssignPhoneNumbers: true,
  canManagePipeline: true,
  canManageFields: true,
  canManageIntegrations: true,
  canAccessBilling: true,
  canManageWebhooks: true,
  canViewAllAnalytics: true,
  canViewOwnAnalytics: true,
  canChangeFromNumber: true,
  isSuperAdmin: true,
  isAdmin: true,
  isSdr: false,
  role: 'super_admin',
}

const ADMIN: Permissions = {
  canViewAllContacts: true,
  canEditContacts: true,
  canDeleteContacts: true,
  canImportCSV: true,
  canExportData: true,
  canCreateLists: true,
  canDeleteLists: true,
  canRenameLists: true,
  canViewAllCalls: true,
  canViewOwnCalls: true,
  canViewAllRecordings: true,
  canAccessSettings: true,
  canManageCallSettings: true,
  canManageUsers: true,
  canInviteUsers: true,
  canChangeRoles: false,        // Seul super_admin peut changer les rôles
  canManagePhoneNumbers: false,  // Seul super_admin peut acheter/supprimer
  canAssignPhoneNumbers: true,   // Admin peut assigner aux users
  canManagePipeline: true,
  canManageFields: true,
  canManageIntegrations: true,
  canAccessBilling: false,       // Seul super_admin
  canManageWebhooks: true,
  canViewAllAnalytics: true,
  canViewOwnAnalytics: true,
  canChangeFromNumber: true,
  isSuperAdmin: false,
  isAdmin: true,
  isSdr: false,
  role: 'admin',
}

const SDR: Permissions = {
  canViewAllContacts: true,      // Même org — voit les contacts
  canEditContacts: true,         // Peut modifier les champs
  canDeleteContacts: false,
  canImportCSV: false,
  canExportData: false,
  canCreateLists: false,
  canDeleteLists: false,
  canRenameLists: false,
  canViewAllCalls: false,
  canViewOwnCalls: true,
  canViewAllRecordings: false,
  canAccessSettings: false,
  canManageCallSettings: false,
  canManageUsers: false,
  canInviteUsers: false,
  canChangeRoles: false,
  canManagePhoneNumbers: false,
  canAssignPhoneNumbers: false,
  canManagePipeline: false,
  canManageFields: false,
  canManageIntegrations: false,
  canAccessBilling: false,
  canManageWebhooks: false,
  canViewAllAnalytics: false,
  canViewOwnAnalytics: true,
  canChangeFromNumber: false,
  isSuperAdmin: false,
  isAdmin: false,
  isSdr: true,
  role: 'sdr',
}

export function usePermissions(): Permissions {
  const { profile } = useAuth()
  const role = profile?.role

  if (role === 'super_admin') return SUPER_ADMIN
  if (role === 'admin' || role === 'manager') return { ...ADMIN, role: role as Role }
  return { ...SDR, role: role as Role ?? 'sdr' }
}
