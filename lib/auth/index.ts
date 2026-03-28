// ============================================================================
// Foot Stock — Barrel Export de Auth Lib
// ============================================================================

export { canAccess, getPermissions, type AdminResource } from './canAccess'
export {
  planHasFeature,
  getPlanFeatures,
  hasPlanAccess,
  PLAN_FEATURES,
  PLAN_HIERARCHY,
  type PlanFeature,
} from './planAccess'
export {
  getSupabaseClient,
  getSession,
  getCurrentUser,
  onAuthStateChange,
  signOut,
} from './session'
