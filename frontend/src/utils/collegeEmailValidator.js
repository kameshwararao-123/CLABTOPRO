/**
 * RGUKT Srikakulam College Email Validator (Frontend)
 *
 * Allowed format: s210670@rguktsklm.ac.in, faculty@rguktsklm.ac.in
 * Allowed domain: exactly @rguktsklm.ac.in
 */

export const COLLEGE_EMAIL_DOMAIN = "rguktsklm.ac.in";

export const COLLEGE_EMAIL_REGEX = /^[a-z0-9._%+-]+@rguktsklm\.ac\.in$/;

export const COLLEGE_EMAIL_HELPER_NOTE =
  "Only official @rguktsklm.ac.in email addresses are accepted.";

export const REGISTRATION_RESTRICTION_MESSAGE =
  "Please register using your official @rguktsklm.ac.in college email address.";

export const LOGIN_ACCESS_DENIED_MESSAGE =
  "Access denied. Please log in using your official RGUKT Srikakulam college email address.";

export const PASSWORD_RESET_RESTRICTION_MESSAGE =
  "Access denied. Password recovery is restricted to official RGUKT Srikakulam college email addresses (@rguktsklm.ac.in).";

/**
 * Normalizes an email address: trims whitespace and converts to lowercase.
 */
export function normalizeCollegeEmail(email) {
  if (typeof email !== "string") return "";
  return email.trim().toLowerCase();
}

/**
 * Validates whether an email belongs strictly to the @rguktsklm.ac.in domain.
 */
export function isValidCollegeEmail(email) {
  if (typeof email !== "string") return false;
  const normalized = normalizeCollegeEmail(email);
  return COLLEGE_EMAIL_REGEX.test(normalized);
}
