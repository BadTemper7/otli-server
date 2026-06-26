export const MODULES = Object.freeze({
  DASHBOARD: 'dashboard',
  ACCOUNT_APPROVAL: 'account-approval',
  PRE_ADVICE_APPROVAL: 'pre-advice-approval',
  BOOKING_APPROVAL: 'booking-approval',
  GATE_IN: 'gate-in',
  USERS: 'users',
  API_LOGS: 'api-logs',
  AUDIT_LOGS: 'audit-logs',
  SETTINGS: 'settings'
})

export const ALL_ADMIN_MODULES = Object.values(MODULES)

export const ADMIN_MODULE_LABELS = Object.freeze({
  [MODULES.DASHBOARD]: 'Dashboard',
  [MODULES.ACCOUNT_APPROVAL]: 'Account Approval',
  [MODULES.PRE_ADVICE_APPROVAL]: 'Pre-Advice Approval',
  [MODULES.BOOKING_APPROVAL]: 'Booking Approval',
  [MODULES.GATE_IN]: 'Gate In Module',
  [MODULES.USERS]: 'Users and Module Access',
  [MODULES.API_LOGS]: 'API Logs',
  [MODULES.AUDIT_LOGS]: 'Audit Logs',
  [MODULES.SETTINGS]: 'Settings'
})
