/**
 * Centralized Exam Security Configuration (Phase 3)
 *
 * Setting PHASE3_SECURITY_ENABLED to false temporarily disables:
 * - Copy, Cut, Paste restrictions
 * - Right-click / Context Menu restrictions
 * - Tab-switching & Window focus/blur monitoring
 * - Fullscreen mode enforcement
 * - Security warning modals & alerts
 * - Backend security event generation & recording
 *
 * Set to `true` to re-enable full Phase 3 security enforcement.
 */
export const PHASE3_SECURITY_ENABLED =
  typeof process !== "undefined" && process.env?.PHASE3_SECURITY_ENABLED !== undefined
    ? process.env.PHASE3_SECURITY_ENABLED === "true" || process.env.PHASE3_SECURITY_ENABLED === true
    : false;
