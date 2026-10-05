// Settings modal copy. English is the source of truth; es/settings.ts mirrors it
// key-for-key (enforced by the `const es: Messages` annotation). One namespace per
// panel so keys stay grouped and easy to find.
export const settings = {
  // Modal header.
  title: 'Settings',

  // Left-hand navigation labels, keyed by SettingsSection id.
  nav: {
    general: 'General',
    appearance: 'Appearance',
    editor: 'Editor',
    templates: 'Templates',
    startup: 'Startup',
    sync: 'Sync',
    data: 'Data',
    ai: 'AI',
    account: 'Account',
    shortcuts: 'Keyboard shortcuts',
    about: 'About',
  },

  general: {
    language: 'Language',
    languageHint: 'Language used across the NoteFlow interface',
    // Option labels. `system` is translated; the language names are shown in
    // their own language, so they are identical across locales.
    system: 'System',
    english: 'English',
    spanish: 'Español',
    // Secondary line under the "System" option showing the detected language.
    detected: 'Detected: {lang}',
    // Decorative activity chart (ActivityPulse): header + axis legends. The chart
    // itself has no text; these labels live in HTML around the SVG.
    activity: {
      title: 'Activity',
      hint: 'Notes created or edited over the last 16 weeks',
      yAxis: 'Activity',
      xStart: '16 weeks ago',
      xEnd: 'Today',
    },
  },

  appearance: {
    theme: 'Theme',
    font: 'Font',
    accent: 'Accent',
    editorColors: 'Editor colours',
    textSize: 'Text size',
    brainView: 'Brain view',
    preview: 'Preview',
    // Reset-to-theme link shown next to Font / Accent / Editor colours.
    themeDefault: 'Theme default',
    fewerThemes: 'Fewer themes',
    moreThemes: 'More themes ({count})',
    fontSelected: 'Selected',
    customColour: 'Custom colour',
    resetToThemeDefault: 'Reset to theme default',
    // Editor colour rows (H1/H2/H3 need no label — they show as "H1"…).
    colorItalic: 'Italic',
    colorInlineCode: 'Inline code',
    colorCodeAccent: 'Code & quote',
    colorCodeAccentHint: 'Left border of code blocks and quotes',
    smaller: 'Smaller',
    larger: 'Larger',
    immersive: 'Immersive',
    lightweight: 'Lightweight',
    brainViewHint: '3D looks better but uses more resources. If the brain feels slow, switch to 2D.',
    // Live preview mock content.
    previewActiveNote: 'Active note',
    previewAnotherNote: 'Another note',
    previewThirdNote: 'Third note',
    previewHeading: 'Heading',
    previewSubheading: 'Subheading',
    previewParagraph: 'The quick brown fox jumps over the lazy dog.',
    previewItalic: 'in italics',
    previewQuote: 'Quoted line',
    previewInlineCode: 'inline code',
    // Selection summary suffixes.
    summaryTheme: 'theme',
    summaryCustom: 'custom',
  },

  editor: {
    fontSize: 'Font size',
    fontSizeHint: 'Size of the text inside the editor',
    decrease: 'Decrease ({keys})',
    reset: 'Reset ({keys})',
    increase: 'Increase ({keys})',
    editorFont: 'Editor font',
    editorFontHint: 'Typeface used for note content',
    contentWidth: 'Content width',
    contentWidthHint: 'Constrain editor content to a readable column',
    full: 'Full',
    readable: 'Readable',
    toc: 'Table of contents',
    tocHint: 'Show an outline of the section headings at the right of the editor',
    showToc: 'Show table of contents',
    hideToc: 'Hide table of contents',
  },

  startup: {
    launchOnStartup: 'Launch on system startup',
    launchOnStartupHint: 'NoteFlow starts automatically when you turn on your computer',
    enableLaunch: 'Enable launch on startup',
    disableLaunch: 'Disable launch on startup',
    openAsSticky: 'Open as sticky at startup',
    enableToUse: 'Enable "Launch on system startup" to use this feature',
    noNotesAvailable: 'No notes available',
    willOpen: {
      one: '{count} sticky window will open on startup',
      other: '{count} sticky windows will open on startup',
    },
    noTabsSelected: 'No tabs selected — app will start in tray',
  },

  sync: {
    // Backend selector (the two sync backends are mutually exclusive).
    chooseBackendDesc: 'Choose how your notes sync across devices. Only one backend can be active at a time.',
    cloudCardDesc: 'Encrypted sync through NoteFlow servers. Nothing to set up — requires a subscription.',
    githubTitle: 'GitHub Sync',
    githubCardDesc: 'Sync through a private GitHub repository of your own. Free, needs a GitHub account.',
    // Backend status badges.
    badgeActive: 'Active',
    badgePaused: 'Paused',
    badgeInactive: 'Inactive',
    // Shown in the GitHub subsection while NoteFlow Cloud is enabled — the
    // sync router gives Cloud priority (see electron/syncProvider.ts).
    pausedByCloud: 'GitHub Sync is paused while NoteFlow Cloud is enabled. Your GitHub configuration is kept — disable NoteFlow Cloud to resume syncing through GitHub.',
    connected: 'Connected',
    // Also used as the GitHub badge in the backend selector.
    notConnected: 'Not connected',
    lastSync: 'Last sync: {time}',
    authFailed: 'Authorization failed',
    failedToStart: 'Failed to start authorization',
    alreadyUpToDate: 'Already up to date',
    pulled: {
      one: 'Pulled {count} note',
      other: 'Pulled {count} notes',
    },
    // "Go to <link> and enter this code:" — the link sits between these two.
    goToPrefix: 'Go to ',
    goToSuffix: ' and enter this code:',
    waitingAuth: 'Waiting for authorization...',
    openBrowser: 'Open browser',
    connecting: 'Connecting...',
    syncNow: 'Sync now',
    // Mirror local → repo. Only shown while NoteFlow Cloud is enabled: GitHub is
    // then a paused write-only mirror and the repo slowly goes stale.
    mirror: 'Mirror to GitHub',
    mirrorConfirmTitle: 'Mirror to GitHub?',
    mirrorConfirmMessage: 'The repository will be overwritten with the notes on this device: anything missing or different is uploaded, and anything that no longer exists here is deleted from the repository. Your notes on this device are not modified.',
    mirrorConfirmAction: 'Mirror',
    mirrorDone: 'Repository mirrored — {pushed} uploaded, {deleted} deleted.',
    mirrorAlreadyMirrored: 'The repository already matches this device.',
    mirrorFailed: 'Could not mirror to GitHub.',
    mirrorRequiresCloud: 'Mirroring is only available while NoteFlow Cloud is enabled.',
    mirrorInProgress: 'A mirror is already running.',
    mirrorTokenError: 'Could not read the GitHub token. Please reconnect GitHub.',
    // Deletions are skipped whenever a local file can't be read: an incomplete
    // local snapshot would make live notes look deleted.
    mirrorDeletionsSkipped: 'Nothing was deleted from the repository: some local files could not be read.',
    disconnect: 'Disconnect',
    setupDesc: "Sync notes across machines via a private GitHub repository. The repo will be created automatically if it doesn't exist.",
    repoName: 'Repository name',
    repoHint: "Will be created as private if it doesn't exist.",
    connectWithGitHub: 'Connect with GitHub',
  },

  // NoteFlow Cloud (encrypted sync) — lives on the Sync page above GitHub Sync.
  cloud: {
    title: 'NoteFlow Cloud',
    desc: 'Encrypted sync through NoteFlow servers. Notes are encrypted on this device before upload — the server only ever stores ciphertext.',
    notAvailable: "NoteFlow Cloud isn't available in this build yet.",
    paidLabel: 'Paid',
    signInFirst: 'Sign in to your NoteFlow account to use it.',
    // Entitlement gate (enable only — unlock/pull/disable stay available). The
    // plans and their prices come from the shared PlanOffers block (settings.account.*).
    requiresSubscription: 'Enabling NoteFlow Cloud sync requires an active subscription.',
    // Encryption mode choice (state: no-keys) — two cards, Standard preselected.
    chooseModeDesc: 'Choose how your encryption keys are managed. You can switch modes later from this panel.',
    modeStandardTitle: 'Standard',
    modeStandardBadge: 'Recommended',
    modeStandardDesc: 'Your notes are encrypted in transit and on our servers. NoteFlow manages the key for you — nothing to remember. We could technically access your notes; choose Private if that matters to you.',
    modeStandardEnable: 'Enable',
    modePrivateTitle: 'Private (end-to-end encrypted)',
    modePrivateDesc: 'Only you can read your notes — not even NoteFlow. Requires a passphrase; if you lose it and the recovery code, your notes are unrecoverable.',
    setupManagedFailed: 'Could not set up NoteFlow Cloud.',
    // Key setup (state: no-keys, Private card selected).
    setupDesc: 'Create a passphrase to protect your encryption keys. It never leaves this device: NoteFlow cannot read your notes — and cannot reset the passphrase.',
    passphrase: 'Passphrase',
    confirmPassphrase: 'Confirm passphrase',
    passphraseTooShort: 'Use at least {min} characters.',
    passphraseMismatch: 'The passphrases do not match.',
    createPassphrase: 'Create passphrase',
    setupFailed: 'Could not set up the encryption keys.',
    // Recovery code (shown ONCE right after setup, never again).
    recoveryTitle: 'Your recovery code',
    recoveryDesc: 'This code is shown only once. It is the only other way to unlock your notes if you forget your passphrase — store it somewhere safe (password manager or printed copy).',
    recoveryWarning: 'If you lose both the passphrase and this code, your cloud notes are unrecoverable. NoteFlow cannot reset them for you.',
    copyCode: 'Copy code',
    copied: 'Copied',
    recoverySaved: 'I have saved my recovery code',
    // Unlock (state: locked + e2ee mode).
    lockedDesc: 'Your cloud encryption keys are locked on this device. Enter your passphrase — or your recovery code — to unlock.',
    passphraseOrRecovery: 'Passphrase or recovery code',
    unlock: 'Unlock',
    unlockFailed: 'Could not unlock.',
    // Silent unlock (state: locked + managed/unknown mode) — never asks for a secret.
    unlocking: 'Unlocking…',
    // Unlocked controls.
    syncEnabled: 'Sync enabled',
    syncDisabled: 'Sync disabled',
    enableSync: 'Enable sync',
    disableSync: 'Disable sync',
    enableFailed: 'Could not enable cloud sync.',
    lock: 'Lock',
    // Encryption-mode badge (state: unlocked).
    badgeStandard: 'Standard encryption',
    badgePrivate: 'Private E2EE',
    // Standard → Private upgrade (state: unlocked + managed).
    switchToPrivate: 'Switch to private mode',
    upgradeDesc: 'Create a passphrase to switch to end-to-end encryption. From then on only you can read your notes — NoteFlow cannot reset the passphrase or recover them for you.',
    upgradeNotice: 'Note: while in Standard mode, notes synced so far were technically accessible to NoteFlow. Switching does not rewrite them, but everything stays encrypted and only you hold the key from now on.',
    upgradeSubmit: 'Create passphrase & switch',
    upgradeFailed: 'Could not switch to private mode.',
    // Private → Standard downgrade (state: unlocked + e2ee). Explicit and
    // confirmed — never silent: it weakens the privacy guarantee.
    switchToStandard: 'Switch to standard mode',
    downgradeDesc: 'Switch back to standard encryption. NoteFlow will manage your encryption key for you — nothing to remember, and unlocking becomes automatic on every device where you are signed in.',
    downgradeNotice: 'Warning: in Standard mode NoteFlow holds your key and could technically read your notes — including the ones already synced. Your current passphrase and recovery code will stop working.',
    downgradeSubmit: 'Switch to standard encryption',
    downgradeFailed: 'Could not switch to standard mode.',
    // Mutual exclusion warning shown BEFORE enabling, when GitHub Sync is connected.
    willPauseGitHub: 'GitHub Sync is connected. While NoteFlow Cloud is enabled it takes over, and GitHub Sync stays paused (your GitHub configuration is kept).',
  },

  data: {
    backup: 'Backup',
    exportNotes: 'Export notes…',
    importNotes: 'Import notes…',
    notesLocation: 'Notes location',
    openNotesFolder: 'Open notes folder',
  },

  ai: {
    localAi: 'Local AI',
    localAiHint:
      'Index your notes on this device to power Related notes, the brain graph and chat context. Runs fully offline; encrypted notes are skipped.',
    enableLocalAi: 'Enable local AI',
    disableLocalAi: 'Disable local AI',
    reindexAll: 'Reindex all notes',
    downloadingModel: 'Downloading model…',
    assistant: 'Assistant (LLM)',
    assistantHint:
      "Power the chat with the managed NoteFlow AI plan or with a provider of your own (API key or a local model) — one or the other. Each provider keeps its own credentials; switching providers won't mix keys.",
    profile: 'Profile',
    openProfileSetup: 'Open profile setup',
    profileHint: 'Re-run the questionnaire to refresh the profile note the assistant uses for context.',
    aiAgents: 'AI agents',
    exposeSkill: 'Expose CLI skill to AI agents',
    exposeSkillHint:
      'Installs the NoteFlow skill into ~/.claude/skills so agents like Claude Code can drive your notes via the CLI without extra setup.',
    exposeSkillTooltip: 'Expose the CLI skill',
    stopExposingSkill: 'Stop exposing the CLI skill',
  },

  account: {
    notAvailable: "NoteFlow account services aren't available in this build yet.",
    couldNotSendCode: 'Could not send the sign-in code.',
    couldNotVerify: 'Could not verify the code.',
    couldNotRefresh: 'Could not refresh subscription status.',
    // One entry per AccountErrorCode (src/types/index.ts, mirrored in
    // electron/account.ts). The main process only sends the code; the copy is
    // chosen here so the message follows the app language.
    errors: {
      notConfigured: "NoteFlow account services aren't available in this build yet.",
      invalidEmail: 'That email address does not look valid. Check it and try again.',
      emptyCode: 'Enter the 6-digit code we emailed you.',
      invalidCode: "That code doesn't match, or it has expired. Check your email or request a new one.",
      rateLimited: 'Too many attempts. Wait a moment before trying again.',
      network: 'Could not reach the NoteFlow account service. Check your connection and try again.',
      unexpectedResponse: 'The account service returned an unexpected response. Please try again.',
      sendFailed: 'Could not send the sign-in code. Please try again.',
      verifyFailed: 'Could not verify the code. Please try again.',
      notSignedIn: 'Sign in to your NoteFlow account first.',
      refreshFailed: 'Could not load your subscription status. Please try again.',
      checkoutUnavailable: "This plan isn't available for purchase yet.",
      checkoutInvalidUrl: 'The checkout link is not valid in this build.',
    },
    // "Resend code" control under the code input (step 2 of sign-in).
    resendCode: 'Resend code',
    resendCodeIn: 'Resend in {seconds}s',
    codeResent: 'New code sent — check your inbox.',
    active: 'Active',
    lastChecked: 'Last checked: {time}',
    // Plans block (signed in, entitlements missing). Price figures are NOT in
    // the dicts — they live in src/lib/subscriptionPlans.ts; only the pattern
    // is translated and filled with tf().
    planBundleSubtitle: 'AI + Cloud',
    planBestValue: 'Best value',
    planPrice: '{monthly}/month · {yearly}/year',
    // Suffixes for the split price on the plan cards: the monthly figure is the
    // hero, the yearly one a small line under it (mirrors the /pricing web cards).
    planPerMonth: '/month',
    planPerYear: '/year',
    subscribe: 'Subscribe',
    comingSoon: 'Coming soon',
    subscribeHint: 'Opens the checkout in your browser. The plan activates automatically after payment — hit Refresh if it does not show up.',
    // Shown instead of subscribeHint when the plans block renders without a
    // session (AI / Cloud gates), next to the shortcut into Settings → Account.
    signInToSubscribe: 'Sign in to your NoteFlow account to subscribe.',
    goToAccount: 'Go to Account',
    couldNotOpenCheckout: 'Could not open the checkout.',
    refresh: 'Refresh',
    signOut: 'Sign out',
    signInDesc:
      "Sign in with your email to access your NoteFlow account. We'll send you a one-time code — no password needed.",
    email: 'Email',
    sendCode: 'Send code',
    // "We sent a 6-digit code to <email>. Enter it below to sign in." — the email
    // address (styled inline) sits between these two fragments.
    codeSentPrefix: 'We sent a 6-digit code to ',
    codeSentSuffix: '. Enter it below to sign in.',
    code: 'Code',
    verifyAndSignIn: 'Verify & sign in',
    useDifferentEmail: 'Use a different email',
    // "By continuing, you agree to the <Terms of Service> and acknowledge the
    // <Privacy Policy>." — the two link labels sit between the fragments.
    legalPrefix: 'By continuing, you agree to the ',
    legalTerms: 'Terms of Service',
    legalMiddle: ' and acknowledge the ',
    legalPrivacy: 'Privacy Policy',
    legalSuffix: '.',
  },

  shortcuts: {
    // Section titles.
    appSection: 'App',
    sectionsSection: 'Sections',
    stickySection: 'Sticky notes',
    editorSection: 'Editor',
    fontSizeSection: 'Font size',
    // Shortcut descriptions.
    showHideApp: 'Show / hide app (global)',
    commandPalette: 'Command palette',
    newNote: 'New note',
    newTempNote: 'New temporary note (24h)',
    searchAllNotes: 'Search all notes',
    toggleSidebar: 'Toggle sidebar',
    openSideBySide: 'Open note side by side (on a section tag: that section in a new pane)',
    newSectionShortcut: 'New section',
    deleteSectionShortcut: 'Delete section',
    nextSection: 'Next section',
    prevSection: 'Previous section',
    selectAllSections: 'Select all (sections in the note overview, notes in the group overview)',
    deleteSelectedNote: 'Delete selected note (when not editing)',
    openSectionSticky: 'Open current section as sticky',
    openAllSticky: 'Open all sections as sticky',
    undo: 'Undo',
    redo: 'Redo',
    bold: 'Bold',
    italic: 'Italic',
    underline: 'Underline',
    inlineCode: 'Inline code',
    codeBlock: 'Code block',
    findInNote: 'Find in note',
    toggleMarkdown: 'Toggle Markdown / rich-text mode',
    increaseFontSize: 'Increase font size',
    decreaseFontSize: 'Decrease font size',
    resetFontSize: 'Reset font size',
  },

  templates: {
    title: 'Note templates',
    desc: 'Reusable notes with predefined sections. Open a note’s ⋯ menu and choose "Save as template" to add one here.',
    empty: 'No templates yet. Open a note’s ⋯ menu and choose "Save as template".',
    createFromTemplate: 'Create a note from this template',
    saveName: 'Save name',
    newNoteFromTemplate: 'New note from template',
    newNote: 'New note',
    renameTemplate: 'Rename template',
    deleteTemplate: 'Delete template',
    deleteConfirm: 'Delete the template "{name}"? This cannot be undone.',
  },

  about: {
    tagline: 'Fast notes for software engineers',
    updates: 'Updates',
    checking: 'Checking…',
    upToDate: 'Up to date',
    checkForUpdates: 'Check for updates',
    installing: 'Installing…',
    downloading: 'Downloading…',
    updateTo: 'Update to v{version}',
    links: 'Links',
    githubRepo: 'GitHub repository',
  },
}
