/**
 * Centralized Exam Security Configuration (Phase 3) - Frontend
 *
 * Setting PHASE3_SECURITY_ENABLED to false temporarily disables:
 * - Copy, Cut, Paste restrictions on editor and notepad
 * - Context menu / right click blocking
 * - Tab switching / blur detection & warning modals
 * - Fullscreen mode enforcement & security logging
 *
 * Set to `true` (or import.meta.env.VITE_PHASE3_SECURITY_ENABLED = "true") to re-enable.
 */
export const PHASE3_SECURITY_ENABLED =
  typeof import.meta !== "undefined" && import.meta.env?.VITE_PHASE3_SECURITY_ENABLED !== undefined
    ? import.meta.env.VITE_PHASE3_SECURITY_ENABLED !== "false" && import.meta.env.VITE_PHASE3_SECURITY_ENABLED !== false
    : true;
