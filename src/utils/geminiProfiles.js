import fs from 'fs';
import path from 'path';
import os from 'os';

export const PROFILES_DIR = path.join(os.homedir(), '.gemini-profiles');

/**
 * Ensures the base profiles directory exists.
 */
export function ensureProfilesDir() {
  if (!fs.existsSync(PROFILES_DIR)) {
    fs.mkdirSync(PROFILES_DIR, { recursive: true });
  }
}

/**
 * Gets a list of available Gemini CLI profiles.
 * @returns {string[]} Array of profile names.
 */
export function getAvailableProfiles() {
  ensureProfilesDir();
  try {
    const entries = fs.readdirSync(PROFILES_DIR, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (error) {
    console.error('Error reading profiles directory:', error);
    return [];
  }
}

/**
 * Sanitizes the profile name to prevent path traversal and command injection.
 * @param {string} profileName - The raw profile name.
 * @returns {string} The sanitized profile name.
 */
export function sanitizeProfileName(profileName) {
  if (typeof profileName !== 'string') {
    throw new Error('Profile name must be a string');
  }
  // Remove any character that isn't alphanumeric, dash, or underscore
  const sanitized = profileName.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!sanitized) {
    throw new Error('Invalid profile name');
  }
  return sanitized;
}

/**
 * Prepares and returns the GEMINI_CLI_HOME path for a specific profile.
 * @param {string} profileName - The name of the profile (e.g., 'account1')
 * @returns {string} The absolute path to the profile directory.
 */
export function getProfileHome(profileName) {
  ensureProfilesDir();
  if (!profileName) {
    throw new Error('Profile name is required');
  }

  const sanitizedName = sanitizeProfileName(profileName);
  const profilePath = path.join(PROFILES_DIR, sanitizedName);

  if (!fs.existsSync(profilePath)) {
    fs.mkdirSync(profilePath, { recursive: true });
  }

  return profilePath;
}
