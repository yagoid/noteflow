// Shared writer for the userData settings.json. Every module that owns a
// section of it (main, account, githubSync, cloudSync, cloudKeys) keeps its own
// read-modify-write helper; only the final write goes through here so the file
// stays owner-only (0600) on POSIX — it holds the GitHub PAT, the account
// refresh token and the cached DEK (safeStorage-encrypted, but base64-only when
// the OS keyring is unavailable). Same idiom as the CLI's writeSettings
// (cli/noteflow.js): written IN PLACE (no tmp + rename, so the inode and its
// mode survive), tightened BEFORE writing so a legacy 0644 file never holds new
// data, and `mode` covers the create case (it is ignored for existing files).
// Windows is unaffected (the file inherits the profile's ACLs).

import fs from 'fs'

function restrictPerms(filePath: string): void {
  if (process.platform === 'win32') return
  try {
    if (fs.statSync(filePath).mode & 0o077) fs.chmodSync(filePath, 0o600)
  } catch {
    // Missing file (first write), a filesystem without POSIX modes, or a file
    // owned by someone else — never fail the write over it.
  }
}

export function writeSettingsFile(filePath: string, data: Record<string, unknown>): void {
  restrictPerms(filePath)
  fs.writeFileSync(filePath, JSON.stringify(data), { encoding: 'utf-8', mode: 0o600 })
}
