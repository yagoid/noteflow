// Note encryption modal + shared unlock strings (reused by the sticky window).
export const encryption = {
  // Modal titles / primary button (by mode).
  encryptNote: 'Encrypt note',
  unlockNote: 'Unlock note',
  removeEncryption: 'Remove encryption',

  // Warnings.
  encryptWarning:
    'If you lose the password, the note content is permanently lost. There is no recovery option.',
  // Encrypting a note that has tasks handed to agents (🤖): an extra warning
  // with a box that must be ticked before the note can be encrypted.
  agentTasksWarning:
    'This note has tasks handed to AI agents. Encrypting it permanently deletes their reports, on every synced device. The tasks themselves stay in the note.',
  agentTasksConfirm: 'Delete the agent reports',
  removeWarning:
    'This will permanently decrypt the note. The content will be stored unencrypted on disk.',

  // Fields.
  password: 'Password',
  enterPassword: 'Enter password',
  confirmPassword: 'Confirm password',
  passwordsDoNotMatch: 'Passwords do not match',

  // Advanced options.
  advancedOptions: 'Advanced options',
  iterations: 'Iterations',
  iterationsInfo:
    'Number of PBKDF2 key derivation rounds. Higher = harder to brute-force but slower to encrypt/decrypt. OWASP recommends ≥ 210,000.',
  saltLength: 'Salt length',
  saltLengthInfo:
    'Random salt size in bytes used for key derivation. 16 bytes (128-bit) is the standard minimum.',
  bytesRange: 'bytes ({min}–{max})',
  hashAlgorithm: 'Hash algorithm',
  hashAlgorithmInfo:
    'Hash function for PBKDF2. SHA-512 is slower on GPUs, offering better resistance to parallel brute-force attacks.',

  // Errors.
  encryptError: 'An error occurred while encrypting. Try again.',
  wrongPassword: 'Wrong password. Try again.',

  // Shared with the sticky unlock form.
  noteEncrypted: 'This note is encrypted',
  unlock: 'Unlock',
}
