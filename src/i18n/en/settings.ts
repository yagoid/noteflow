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
    tutorial: 'Tutorial',
    about: 'About',
  },

  // Titles of the nav groups (small uppercase headers above each block).
  navGroups: {
    preferences: 'Preferences',
    services: 'Services',
    notes: 'Your notes',
    help: 'Help',
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
    // Activity section (ActivitySummary): totals cards on top, then the notes
    // touched on the most days of the last 4 weeks, one strip of days per note.
    activity: {
      title: 'Activity',
      // Right of the title: month + year of the oldest note ("since Oct 2025").
      since: 'since {date}',
      // Card labels under each total; the number is rendered separately, so these
      // forms carry no {count}.
      notes: { one: 'note', other: 'notes' },
      sections: { one: 'section', other: 'sections' },
      words: { one: 'word', other: 'words' },
      // Under "70 / 161" (checked / all checklist items).
      tasksDone: 'tasks done',
      focusTitle: 'The notes you keep coming back to',
      focusWindow: 'last 4 weeks',
      // Right of each strip: days that note was touched in the window.
      daysTouched: { one: '{count} day', other: '{count} days' },
      // Native tooltip of each day cell: "<date> · touched" (+ " · today").
      cellTouched: 'touched',
      cellUntouched: 'not touched',
      today: 'today',
      // After focusTitle: the edit log behind the strips is local to each device.
      perDevice: 'per device',
      // Instead of the strips when no note was touched in the window.
      empty: 'No notes touched in the last 4 weeks',
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
    // Swatch that follows the active theme's text colour (light on dark themes, dark on light ones).
    textColour: 'Text colour (follows the theme)',
    resetToThemeDefault: 'Reset to theme default',
    // Editor colour rows (H1/H2/H3 need no label — they show as "H1"…).
    colorItalic: 'Italic',
    colorInlineCode: 'Inline code',
    colorCodeAccent: 'Quote',
    colorCodeAccentHint: 'Left border of quotes',
    smaller: 'Smaller',
    larger: 'Larger',
    immersive: 'Immersive',
    lightweight: 'Lightweight',
    brainViewHint: '3D looks better but uses more resources. If the brain feels slow, switch to 2D.',
    // How the sidebar note rows show their sections.
    sidebarSections: 'Sections in the sidebar',
    sidebarSectionsMap: 'Folded map',
    sidebarSectionsMapDesc: 'A thin line; hover it to see them',
    sidebarSectionsRow: 'Scroll row',
    sidebarSectionsRowDesc: 'Always visible, scroll sideways',
    sidebarSectionsHint: 'The open note always shows its sections. Only on this device.',
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
    summaryText: 'text',
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
    moveChecked: 'Move checked items to the bottom',
    moveCheckedHint: 'Checking a task moves it to the end of its list; unchecking it brings it back above the checked ones',
    taskProgress: 'Checklist progress',
    taskProgressHint: 'Shows in the margin how many tasks of each checklist are done',
    // Shown instead of the hint while the content width is Full (the switch is disabled).
    taskProgressReadableOnly: 'Only available with the Readable width',
    noteClickOpens: 'Clicking a note opens',
    noteClickOpensHint: 'For notes with more than one section, from the sidebar. Notes with a single section always open in the editor',
    noteClickEditor: 'Editor',
    noteClickOverview: 'Note overview',
  },

  startup: {
    launchOnStartup: 'Launch on system startup',
    launchOnStartupHint: 'NoteFlow starts automatically when you turn on your computer',
    // Microsoft Store build: the app can't register itself to start with Windows.
    storeUnavailable: "The Microsoft Store version of NoteFlow can't open by itself when Windows starts yet. To have it, install NoteFlow from GitHub.",
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
    githubTitle: 'GitHub Sync',
    // Badges of the inactive backend in the overview's "Other providers" (the two
    // sync backends are mutually exclusive — Cloud wins, see electron/syncProvider.ts).
    badgePaused: 'Paused',
    badgeInactive: 'Inactive',
    // First-run chooser (no backend in use yet): both options side by side, at the
    // same level — the paid one is not preselected, and its price is just a tag.
    localOnly: 'Only on this device — your notes are not syncing yet.',
    chooseIntro: 'Choose how to keep your notes in sync across your devices.',
    choiceCloud: {
      audience: 'For syncing with nothing to set up.',
      points: [
        'Automatic sync across your devices',
        'Encrypted — Standard, or Private end-to-end',
        '30-day history of every section, restorable in the app',
      ],
      cta: 'See NoteFlow Cloud',
    },
    choiceGithub: {
      audience: 'For people who already use GitHub.',
      points: [
        'Your notes in a private repository of your own',
        'Syncs on its own every 5 minutes',
        'Version history kept by Git',
      ],
      cta: 'Connect with GitHub',
    },
    haveCloud: 'Already have NoteFlow Cloud?',
    // Back link from the Cloud / GitHub detail to the overview (or the chooser).
    backToOptions: 'Sync options',
    // CLI row badges.
    connected: 'Connected',
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
    // Manual GitHub pull refused while NoteFlow Cloud is enabled (the button is
    // hidden then; this covers a stale click).
    pullCloudEnabled: 'GitHub Sync is paused while NoteFlow Cloud is enabled. Use "Mirror to GitHub" to update the repository.',
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
    // The mirror deletes from the repo whatever is missing locally, so it waits
    // until this device has downloaded the account's notes from Cloud.
    mirrorCloudInitialPullPending: 'NoteFlow Cloud has not finished downloading your notes on this device yet. Try mirroring again once it has.',
    mirrorInProgress: 'A mirror is already running.',
    mirrorTokenError: 'Could not read the GitHub token. Please reconnect GitHub.',
    // The notes on this device came from another remote than the one in use — another
    // GitHub repository, another NoteFlow account (OriginChoiceDialog). Notice under the
    // overview's status card, either backend ({previous} / {next}: 'owner/repo', the
    // account email or a generic text from originChoice.*) + its button (reopens the dialog).
    originPending: 'Paused — the notes on this device came from {previous}. Nothing syncs with {next} until you choose how to continue.',
    originChoose: 'Choose…',
    // A manual sync / mirror refused meanwhile ("Sync now" is off then; these cover a stale click).
    pullOriginPending: 'Nothing was synced: choose first what to do with the notes on this device.',
    mirrorOriginPending: 'Choose first what to do with the notes on this device.',
    // Local copies made by "Use only the notes from …" (userData/notes-archive): a row of
    // the overview's data list (title + description + button); elsewhere, description + button.
    archivesTitle: 'Local copies',
    archivesDesc: 'Notes set aside when you switched to another repository or account are kept in a folder on this computer.',
    openArchives: 'Open local copies',
    // Deletions are skipped whenever a local file can't be read: an incomplete
    // local snapshot would make live notes look deleted.
    mirrorDeletionsSkipped: 'Nothing was deleted from the repository: some local files could not be read.',
    disconnect: 'Disconnect',
    setupDesc: "Sync notes across machines via a private GitHub repository. The repo will be created automatically if it doesn't exist.",
    repoName: 'Repository name',
    repoHint: "Will be created as private if it doesn't exist.",
    connectWithGitHub: 'Connect with GitHub',
    // Under the connect button, for people without a GitHub account. The link sits between
    // prefix and suffix (opens github.com/signup in the browser).
    noAccountPrefix: "Don't have a GitHub account? GitHub Sync needs one. ",
    noAccountLink: 'Create one for free',
    noAccountSuffix: ', then come back here and connect.',
    // GitHub's detail opened from the Cloud overview ("View GitHub Sync") while
    // Cloud is on: informative only — connecting here would pull the repo over
    // the notes Cloud is keeping, so the setup form is replaced by this notice.
    githubCloudActiveTitle: 'NoteFlow Cloud is in use',
    githubCloudActiveNotice: 'To switch to GitHub Sync, turn off NoteFlow Cloud first, at the bottom of the sync overview. Turning it off deletes nothing: your notes stay on this device.',
    // While a backend is active (SyncOverview / SyncMap): the status card, the
    // informative sync map, the data list, "Other providers" and the footer.
    overview: {
      // Status card: one line of facts next to the badge.
      lastSyncAgo: 'Last sync {time}',
      neverSynced: 'Not synced yet',
      realtimeOn: 'Real time connected',
      realtimeOff: 'Real time disconnected',
      pendingChanges: { one: '{count} pending change', other: '{count} pending changes' },
      noPendingChanges: 'No pending changes',
      everyMinutes: 'every {minutes} min',
      openRepo: 'Open {repo} on GitHub',
      // Cloud enabled but no encryption keys yet (the mode choice shows below).
      badgeSetup: 'Setup needed',
      // Sync map (informative only — the label of each node, and the same state in words).
      mapThisComputer: 'This computer',
      mapOtherDevices: 'Other devices',
      mapRealtime: 'in real time',
      mapEncrypted: 'encrypted',
      mapCli: 'noteflow CLI',
      mapCliConnected: 'connected',
      mapCliOff: 'not connected',
      // Microsoft Store build: it ships without the CLI.
      mapCliUnavailable: 'not included',
      mapGithubMirror: 'paused · manual mirror',
      mapCloudInactive: 'not active',
      mapAriaCloud: 'This computer syncs encrypted with NoteFlow Cloud ({status}), which reaches your other devices {peers}.',
      mapAriaGithub: 'This computer syncs {cadence} with the GitHub repository {repo} ({status}), which reaches your other devices.',
      mapAriaCliOn: 'The noteflow CLI is connected.',
      mapAriaCliOff: 'The noteflow CLI is not connected.',
      mapAriaGithubMirror: 'GitHub Sync is paused, as a manual mirror.',
      mapAriaCloudInactive: 'NoteFlow Cloud is not active.',
      // Data list — NoteFlow Cloud.
      securityTitle: 'Security and data',
      encryptionStandardTitle: 'Standard encryption',
      encryptionStandardDesc: 'NoteFlow holds the key: unlocking is automatic on all your devices.',
      encryptionPrivateTitle: 'Private encryption (E2EE)',
      encryptionPrivateDesc: 'End to end: only you hold the key, behind your passphrase.',
      // Pre-dual-mode device whose mode is not known yet.
      encryptionUnknownTitle: 'Encryption',
      encryptionUnknownDesc: 'Your notes are encrypted before they leave this device.',
      historyTitle: 'Version history',
      historyDesc: "30 days per section, restorable from each section's menu.",
      included: 'Included',
      // Data list — GitHub Sync. NoteFlow creates the repository as private, but
      // an existing one keeps its own visibility: never claim it is private.
      repoDataTitle: 'Repository and data',
      repoTitle: 'Your repository',
      repoDesc: "In your GitHub account — NoteFlow's servers keep no copy.",
      openOnGithub: 'Open on GitHub',
      gitHistoryTitle: 'History in Git',
      gitHistoryDesc: 'Every change uploaded from here is a commit in the repository.',
      viewCommits: 'View commits',
      // Other providers.
      otherProvidersTitle: 'Other providers',
      githubPausedDesc: '{repo} · settings kept.',
      cloudInactiveDesc: 'Encrypted, with 30-day history. Turning it on pauses GitHub Sync.',
      // Cloud on, GitHub never connected: shown anyway, to browse its detail.
      githubNotConnectedDesc: 'Your notes in a repository of your GitHub account. To use it, turn off NoteFlow Cloud.',
      viewGithub: 'View GitHub Sync',
      // Footer: what turning it off does (nothing is deleted) + the action.
      footerCloud: 'Turning it off deletes nothing: your notes stay on this device.',
      footerCloudGithub: 'Turning it off deletes nothing: your notes stay here and GitHub Sync resumes.',
      turnOffCloud: 'Turn off NoteFlow Cloud',
      footerGithub: 'Disconnecting deletes nothing: your notes stay here and in the repository.',
      disconnectGithub: 'Disconnect GitHub',
    },
    // "noteflow CLI" row of the overview's data list. Gives the bundled
    // `noteflow` CLI its OWN access to the backend in use (electron/cliConnect.ts).
    cli: {
      title: 'noteflow CLI',
      // Microsoft Store build: it ships without the CLI — shown instead of the whole section.
      storeUnavailable: "The Microsoft Store version of NoteFlow doesn't include the noteflow CLI. To use it from the terminal or with AI agents, install NoteFlow from GitHub.",
      descCloud: 'Its own session with {email}, for the terminal and AI agents.',
      // Account keys in private (e2ee) mode: the CLI can only sync once unlocked with the passphrase.
      e2eeNotice: 'Your account uses private (E2EE) encryption: the CLI can only sync after unlocking it with your passphrase. It asks for it on each run in a terminal, or reads it from the NOTEFLOW_CLOUD_PASSPHRASE environment variable — without either, the CLI (and AI agents using it) cannot sync.',
      descGithub: 'Gets a copy of the token to sync this same repository.',
      connect: 'Connect the CLI too',
      connectedTo: 'Connected with {target}.',
      disconnect: 'Disconnect CLI',
      // Cloud, step 2: the code the CLI asked for.
      codeSent: 'We emailed a sign-in code to {email}. Enter it to connect the CLI:',
      code: 'Code',
      verify: 'Connect CLI',
      resend: 'Send a new code',
      codeResent: 'New code sent.',
      // Windows, token stored without the OS keyring: the CLI reads the app's own connection.
      sharedWithApp: "The CLI uses the app's GitHub connection: disconnecting GitHub here disconnects it too.",
      githubConfirmTitle: 'Give the CLI access to GitHub?',
      githubConfirmMessage: 'The CLI gets a copy of this GitHub token (access to your repositories) to sync {repo}. It stores it in its settings file encoded in base64, NOT encrypted with the system keyring like the app does: any program running as your user could read it. You can remove it at any time with "Disconnect CLI".',
      githubConfirmAction: 'Copy token',
      errors: {
        cliMissing: 'The noteflow CLI was not found in this installation.',
        notSignedIn: 'Sign in to your NoteFlow account first.',
        notConnected: 'Connect GitHub in the app first.',
        // Windows: the CLI's settings.json is the installed app's — never suggest
        // `noteflow login` there (it would replace that app's encrypted token).
        noRepoShared: 'The CLI shares its settings with the installed NoteFlow app, and that app has no GitHub connection (it may sync with NoteFlow Cloud, or not be installed). Connect this repository in the installed NoteFlow app, then try again.',
        mismatchShared: 'The CLI shares its settings with the installed NoteFlow app, which is connected to another GitHub repository. Connect this same repository in that app, then try again.',
        mismatch: "The CLI is already set up with another GitHub repository. Run noteflow logout in a terminal, then try again.",
        invalidCode: 'That code is invalid or has expired. Check it, or send a new one.',
        rateLimited: 'Too many attempts — wait a moment and try again.',
        network: 'Could not reach the server. Check your connection and try again.',
        failed: 'Could not complete the operation on the CLI.',
        originChoicePending: "Choose first what to do with the notes on this device (Settings → Sync). Until then the app syncs nothing, and the CLI can't be connected either.",
      },
      // Under the row (and the disabled button's tooltip) while the backend's origin choice is pending.
      originPending: 'Available once you choose what to do with the notes on this device.',
    },
  },

  // NoteFlow Cloud (encrypted sync) — lives on the Sync page above GitHub Sync.
  cloud: {
    title: 'NoteFlow Cloud',
    notAvailable: "NoteFlow Cloud isn't available in this build yet.",
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
    passphraseEdgeWhitespace: 'The passphrase cannot start or end with a space.',
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
    // Unlocked, not enabled (the detail).
    syncDisabled: 'Sync disabled',
    enableSync: 'Enable sync',
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
    // The account was switched to private mode on another device meanwhile —
    // nothing was rewritten here and no new recovery code was created.
    upgradeAlreadyPrivate: 'This account was already switched to private mode from another device. Nothing was changed here — use the passphrase and recovery code created on that device.',
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
    exportNotes: 'Export notes',
    importNotes: 'Import notes',
    notesLocation: 'Notes location',
    openNotesFolder: 'Open notes folder',
  },

  ai: {
    // Settings → AI, section under the assistant: what the AI does with your notes.
    notesTitle: 'Your notes and AI',
    localAi: 'Local AI',
    localAiHint: 'Indexes your notes on this device for Related notes, the brain graph and chat context. Offline; encrypted notes are skipped.',
    enableLocalAi: 'Enable local AI',
    disableLocalAi: 'Disable local AI',
    reindex: 'Reindex',
    downloadingModel: 'Downloading model…',
    profile: 'Profile',
    redoQuestionnaire: 'Redo questionnaire',
    profileHint: 'Refreshes the profile note the assistant uses for context.',
    // Inline autocomplete in the editor (ghost text; NoteFlow AI plan only, off by default).
    autocomplete: 'Autocomplete',
    autocompleteBeta: 'Beta',
    autocompleteHint:
      'Suggests how to continue as you write: Tab accepts, Esc dismisses. While it is on, the text near your cursor is sent to NoteFlow AI as you type, along with the note’s title and the names of its sections. Never used in encrypted notes or in sections hidden from the AI.',
    autocompleteNeedsPlan: 'Requires an active NoteFlow AI plan.',
    enableAutocomplete: 'Enable AI autocomplete',
    disableAutocomplete: 'Disable AI autocomplete',
    // Under the row while it is on. {percent}: 0-100, share of the autocomplete allowance spent.
    autocompleteUsage: '{percent}% of this month’s autocomplete allowance used',
    autocompleteUsedUp: 'This month’s autocomplete allowance is used up. Suggestions resume next month.',
    cliSkill: 'CLI skill',
    exposeSkillHint:
      'Installs the NoteFlow skill into ~/.claude/skills and ~/.agents/skills so Claude Code, Codex, Gemini CLI, Copilot, Cursor and other Agent Skills-compatible agents can drive your notes via the CLI.',
    exposeSkillTooltip: 'Expose the CLI skill',
    stopExposingSkill: 'Stop exposing the CLI skill',
    // Microsoft Store build: no CLI, so no skill — shown instead of the toggle.
    exposeSkillStore: "The Microsoft Store version of NoteFlow doesn't include the noteflow CLI, so it can't expose its skill to AI agents. To use it, install NoteFlow from GitHub.",
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
      emptyCode: 'Enter the code we emailed you.',
      invalidCode: "That code doesn't match, or it has expired. Check your email or request a new one.",
      rateLimited: 'Too many attempts. Wait a moment before trying again.',
      network: 'Could not reach the NoteFlow account service. Check your connection and try again.',
      unexpectedResponse: 'The account service returned an unexpected response. Please try again.',
      sendFailed: 'Could not send the sign-in code. Please try again.',
      verifyFailed: 'Could not verify the code. Please try again.',
      notSignedIn: 'Sign in to your NoteFlow account first.',
      refreshFailed: 'Could not load your subscription status. Please try again.',
      sessionLocked: "Couldn't unlock your saved session — your system keychain may be locked. Unlock it and try again.",
      checkoutUnavailable: "This plan isn't available for purchase yet.",
      checkoutInvalidUrl: 'The checkout link is not valid in this build.',
      billingPortalUnavailable: "Couldn't open the billing portal. Use the link in your Lemon Squeezy receipt email instead.",
      planChangeUnavailable: "Couldn't change your plan right now. Please try again in a moment.",
      planChangeNotEligible: "Your current plan can't be switched to the Bundle from the app. Contact support and we'll do it for you.",
      planChangeSubscriptionInactive: 'Your current subscription is cancelled or has a pending payment. Resume it or update your card in Manage subscription, then try again.',
      // Answers of the account-deletion endpoint (Edge Function delete-account).
      sessionExpired: 'Your session is no longer valid. Sign out, sign in again and retry.',
      deleteBillingFailed: "Your subscription couldn't be cancelled, so nothing was deleted. Please try again later.",
      deleteFailed: 'Could not delete your account. Please try again.',
    },
    // "Resend code" control under the code input (step 2 of sign-in).
    resendCode: 'Resend code',
    resendCodeIn: 'Resend in {seconds}s',
    codeResent: 'New code sent — check your inbox.',
    active: 'Active',
    lastChecked: 'Last checked: {time}',
    // Entitlements never fetched yet (offline boot, keychain locked…): the plan
    // is UNKNOWN — shown instead of the Subscribe cards / "not subscribed" state
    // so a paying user is never offered a plan they already have.
    planUnknown: "Couldn't verify your plan yet.",
    planChecking: 'Checking your plan…',
    planRetry: 'Retry',
    // The session's refresh token can't be decrypted right now (system keychain
    // locked). Recoverable: retried automatically, or Retry / Sign out by hand.
    sessionLocked: "Couldn't unlock your saved session — your system keychain may be locked. Unlock it and retry, or sign out.",
    comingSoon: 'Coming soon',
    signIn: 'Sign in',
    couldNotOpenCheckout: 'Could not open the checkout.',
    // Switching a single AI / Cloud subscription to the Bundle is a PLAN CHANGE of
    // that subscription (prorated), never a second checkout. It asks for
    // confirmation in the app because no checkout page is shown.
    upgradeConfirmTitle: 'Upgrade to NoteFlow Bundle?',
    upgradeConfirmBody: 'Your {plan} subscription is switched to the Bundle — it is not a second subscription, so you never pay for {plan} twice.',
    upgradeProration: "The price is prorated: the unused part of your current billing period is credited and you're charged only the difference for the rest of it, right away, to the card on file. From your next renewal you pay the Bundle price ({monthly}/month or {yearly}/year, matching your current billing cycle). Your renewal date stays the same.",
    upgradeConfirm: 'Confirm upgrade',
    upgradeRequested: 'Plan changed — the Bundle activates in a few seconds.',
    couldNotUpgrade: 'Could not change your plan.',
    // "Manage subscription" (signed in with a Lemon Squeezy subscription): opens
    // the customer portal in the browser.
    manageSubscription: 'Manage subscription',
    manageSubscriptionHint: 'Cancel, change plan, update your payment method or download invoices. Opens in your browser.',
    // The user's own portal link couldn't be fetched, so the store's generic
    // billing page was opened instead (it asks for the purchase email).
    storePortalOpened: 'Opened the billing page in your browser — sign in there with the email you used to subscribe.',
    refresh: 'Refresh',
    signOut: 'Sign out',
    // "Delete account" (signed in): permanent, server-side. Local notes on this
    // computer are never touched; NoteFlow Cloud is switched off.
    deleteAccount: 'Delete account',
    deleteAccountHint: 'Permanently deletes your NoteFlow account and your NoteFlow Cloud data, and cancels any active subscription. Notes on this computer are kept.',
    deleteAccountConfirmTitle: 'Delete your NoteFlow account?',
    deleteAccountConfirm: "This permanently deletes your NoteFlow account and your NoteFlow Cloud data on our servers, and cancels any active subscription. It can't be undone. Notes stored on this computer stay on this computer.",
    deleteAccountConfirmAction: 'Delete permanently',
    deletingAccount: 'Deleting account…',
    couldNotDeleteAccount: 'Could not delete your account.',
    accountDeleted: 'Your NoteFlow account has been deleted. Notes on this computer were kept.',
    // The retry found no session left (most likely an earlier attempt deleted
    // the account but its answer never arrived).
    accountGone: 'Your NoteFlow account has been deleted or your session ended. Notes on this computer were kept.',
    signInCodeHint: "We'll send you a one-time code.",
    email: 'Email',
    sendCode: 'Send code',
    // "We sent a sign-in code to <email>. Enter it below to sign in." — the email
    // address (styled inline) sits between these two fragments.
    codeSentPrefix: 'We sent a sign-in code to ',
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

  // "What's included" column of the NoteFlow Cloud / NoteFlow AI detail (PlanDetail):
  // what the managed plan adds over the free self-managed route (own provider /
  // GitHub Sync).
  planBenefits: {
    title: "What's included",
    ai: [
      'Works the moment you subscribe — no Ollama to install, no third-party accounts, no API keys to buy or rotate.',
      'More affordable — we use the most efficient models (GPT Luna, Claude Haiku, DeepSeek…), all with agent tools and image support.',
      'A monthly AI allowance included, with your usage shown right here.',
      'The model catalog stays up to date — new models arrive without reconfiguring anything.',
    ],
    cloud: [
      'Encrypted sync through NoteFlow servers — encrypted in transit and at rest.',
      'Automatic, hands-free sync across your devices — no manual pushes or pulls.',
      'Choose your encryption: Standard (nothing to remember) or Private end-to-end, where only you can read your notes.',
      'Version history of every section, right in the app: compare what you had in the last 30 days and restore it with a click.',
      'Nothing to set up — no GitHub repository to create or maintain.',
    ],
    // Last line of the list: what happens if the subscription ends.
    keepOnCancel: {
      ai: 'If you cancel, you can go back to your own API key or a local model at any time.',
      cloud: 'If you cancel, your notes stay on your computer.',
    },
  },

  // How the paid plans are offered (PlanOffers.tsx + Settings → Account). Price
  // figures are NOT in the dicts: they live in src/lib/subscriptionPlans.ts as
  // numbers and are formatted for the UI language ({price} = "€3.99" / "3,99 €").
  plans: {
    perMonth: '{price}/month',
    perYear: '{price}/year',
    // Suffix after the big price of the plan box.
    monthSuffix: '/month',
    free: 'Free',
    // Price tag of a plan the account already has / could add to its current one.
    inYourPlan: 'In your plan',
    addToYourPlan: 'Add to your plan',
    // Line under the big (monthly) price.
    yearlyAlternative: 'or {price}/year · save {percent}%',
    // The Lemon Squeezy checkout has its own Monthly / Yearly selector; the app can't
    // preselect it, so the plan box has no period switch of its own.
    periodAtCheckout: 'You pick monthly or yearly on the payment page.',
    bundleSubtitle: 'Cloud + AI',
    continueToPayment: 'Continue to payment',
    signInToSubscribe: 'Sign in with your email to subscribe — or to use a plan you already have.',
    // Lemon Squeezy is set to tax-inclusive pricing, so the listed price is what the
    // customer pays (stating it is required by LSSI art. 10.1.f).
    paymentNote: 'VAT included · you pay on a secure page (Lemon Squeezy) · cancel anytime',
    checkoutOpened: 'Checkout opened in your browser. The plan activates on its own after payment.',
    // Discreet line under the plan box: the Bundle is an option, not a hero card.
    bundleLine: {
      ai: 'Want your notes synced too? NoteFlow Bundle brings AI and Cloud together for {price}/month.',
      cloud: 'Also interested in AI? NoteFlow Bundle brings Cloud and AI together for {price}/month.',
    },
    chooseBundle: 'Choose the Bundle',
    // Same line once the Bundle is chosen, to go back to the single plan.
    singleLine: 'Just {plan}: {price}/month.',
    chooseSingle: 'Choose {plan} only',
    // Settings → Account.
    yourPlan: 'Your plan: {plan}',
    yourPlanTitle: 'Your plan',
    currentPlan: 'Current plan',
    freeIncludes: [
      'Unlimited notes on this computer',
      'Sync with GitHub',
      'The Brain and related notes with local AI',
      'Chat with your own API key or Ollama',
    ],
    noAccountNeeded: "You don't need an account for any of this.",
    optionalUpgrades: 'Optional upgrades',
    rowDesc: {
      ai: 'Chat with your notes — no API keys',
      cloud: 'Encrypted sync, nothing to set up',
      bundle: 'Cloud + AI',
    },
    bundleSaves: 'saves {price}/month vs. buying them separately',
    view: 'View',
    alreadySubscribed: 'Already have a subscription?',
    signInHint: 'Sign in with the email you subscribed with.',
    // A single plan already paid: the other product as a folded row.
    addProduct: 'Add {plan} to your plan',
    addValue: {
      ai: 'Chat with your notes without API keys or local models — a monthly allowance included.',
      cloud: 'Encrypted, automatic sync across your devices, with 30 days of version history — nothing to set up.',
    },
    becomesBundle: 'Your subscription becomes the Bundle (Cloud + AI): you never pay for two subscriptions.',
    upgradeDifference: '+{price}/month',
    upgradeDifferenceYearly: '+{price}/year if you pay yearly',
    upgradeTotal: '{monthly}/month in total ({yearly}/year on yearly billing) · you only pay the prorated part of the current period',
    switchToBundle: 'Switch to Bundle',
    notNow: 'Not now',
    // Single plan whose subscription can't be switched to the Bundle (e.g. a
    // complimentary one): the other product is its own subscription.
    standaloneNote: 'Billed as a separate subscription.',
  },

  shortcuts: {
    // Section titles.
    appSection: 'App',
    sectionsSection: 'Sections',
    stickySection: 'Sticky notes',
    editorSection: 'Editor',
    fontSizeSection: 'Font size',
    tablesSection: 'Tables',
    drawingSection: 'Drawings',
    // Shortcut descriptions.
    showHideApp: 'Show / hide app (global)',
    commandPalette: 'Command palette',
    newNote: 'New note',
    newTempNote: 'New temporary note (24h)',
    searchAllNotes: 'Search all notes',
    toggleSidebar: 'Pin / unpin sidebar',
    openSideBySide: 'Open note side by side (on a section tag: that section in a new pane)',
    navigateBackForward: 'Go back / forward between notes and views (also the mouse side buttons)',
    newSectionShortcut: 'New section',
    deleteSectionShortcut: 'Delete section',
    nextSection: 'Next section',
    prevSection: 'Previous section',
    selectAllSections: 'Select all (sections in the note overview, notes in the content view)',
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
    toggleMarkdown: 'Toggle text / markdown mode',
    moveListItem: 'Move list item up / down (with its sub-items)',
    // AI autocomplete (Settings → AI): only while a suggestion is showing.
    acceptAiSuggestion: 'Accept the AI suggestion (while one is showing)',
    dismissAiSuggestion: 'Dismiss the AI suggestion',
    // Tables section: only with the cursor (or a cell selection) in a table.
    tableMoveRow: 'Move row up / down',
    tableMoveColumn: 'Move column left / right',
    tableInsertRow: 'Insert row below',
    tableInsertColumn: 'Insert column to the right',
    tableDuplicateRow: 'Duplicate row',
    tableDeleteRows: 'Delete the selected rows',
    tableDeleteColumns: 'Delete the selected columns',
    tableClearCells: 'Clear the selected cells (also Delete)',
    tableNextCell: 'Next cell (in the last cell, adds a row)',
    tablePrevCell: 'Previous cell',
    drawingEdit: 'Edit the selected drawing',
    drawingDone: 'Save the drawing and close the canvas',
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
    // The check itself failed (offline, timeout…) — the button stays clickable to retry.
    checkFailed: "Couldn't check for updates",
    checkFailedHint: 'Check your connection and try again.',
    // Microsoft Store build: no update button, the Store updates the app.
    storeUpdates: 'Microsoft Store keeps NoteFlow up to date.',
    installing: 'Installing…',
    downloading: 'Downloading…',
    updateTo: 'Update to v{version}',
    links: 'Links',
    githubRepo: 'GitHub repository',
    // Opens github.com/yagoid/noteflow/releases/latest in the browser.
    releaseNotes: 'Latest release notes',
    // "Send feedback" form → public.feedback in Supabase (electron/feedback.ts).
    // Works signed out; the developer reads the reports from the Supabase dashboard.
    feedback: {
      title: 'Send feedback',
      intro: 'Found a bug or have an idea? Tell us — every message is read.',
      kindLabel: 'Type',
      kinds: {
        bug: 'Bug',
        suggestion: 'Suggestion',
        other: 'Other',
      },
      messageLabel: 'Message',
      // Placeholder of the textarea, per selected type.
      placeholders: {
        bug: 'What happened, and what did you expect? Steps to reproduce help a lot.',
        suggestion: 'What would you like NoteFlow to do?',
        other: 'Tell us anything…',
      },
      // Character counter under the textarea.
      charCount: '{count} / {max}',
      contactLabel: 'Email (optional)',
      contactPlaceholder: 'you@example.com',
      contactHint: 'Only if you want a reply.',
      contactInvalid: 'Enter a valid email or leave it empty.',
      includeDiagnostics: 'Include app and system version',
      // What the diagnostics checkbox adds — keep in sync with collectDiagnostics() in electron/feedback.ts.
      diagnosticsDetail: 'App version, operating system and its version, and interface language.',
      privacy: "Sent to NoteFlow's servers. It never includes your notes. If you're signed in, it's linked to your account.",
      // Link after the privacy line → website privacy policy, "Feedback" section.
      privacyLink: 'Privacy policy',
      send: 'Send',
      sending: 'Sending…',
      sent: 'Thanks! Your feedback was sent.',
      errorNetwork: "Couldn't send your feedback. Check your connection and try again.",
      errorServer: "Couldn't send your feedback right now. Please try again in a moment.",
      errorInvalid: "Couldn't send your feedback. Check the message and email, then try again.",
    },
  },
}
