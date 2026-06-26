export const MODULES = Object.freeze({
  DASHBOARD: 'dashboard',
  ACCOUNT_APPROVAL: 'account-approval',
  PRE_ADVICE_APPROVAL: 'pre-advice-approval',
  BOOKING_APPROVAL: 'booking-approval',
  GATE_IN: 'gate-in',
  INVENTORY: 'inventory',
  BILLING: 'billing',
  GATE_OUT: 'gate-out',
  PAYMENT_VERIFICATION: 'payment-verification',
  REPORTS: 'reports',
  VALIDATION_RULES: 'validation-rules',
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
  [MODULES.BOOKING_APPROVAL]: 'Booking / Gate Appointment Approval',
  [MODULES.GATE_IN]: 'Gate In Module',
  [MODULES.INVENTORY]: 'Inventory / Yard Monitoring',
  [MODULES.BILLING]: 'Billing Module',
  [MODULES.GATE_OUT]: 'Gate Out Module',
  [MODULES.PAYMENT_VERIFICATION]: 'Payment Verification',
  [MODULES.REPORTS]: 'Reports',
  [MODULES.VALIDATION_RULES]: 'Validation Rules',
  [MODULES.USERS]: 'Users and Module Access',
  [MODULES.API_LOGS]: 'API Logs',
  [MODULES.AUDIT_LOGS]: 'Audit Logs',
  [MODULES.SETTINGS]: 'Settings'
})
