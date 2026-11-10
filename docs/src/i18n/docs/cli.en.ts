// English copy for the /cli docs page (source of truth for the shape:
// `CliContent = typeof cliEn`, see cli.es.ts). Strings with inline HTML are
// rendered with `set:html` in CliPage.astro. The structural command table
// (usage/flags/examples) lives in src/data/cli.ts, not here.

export const cliEn = {
  meta: {
    title: 'NoteFlow CLI — headless notes from your terminal',
    description:
      'Complete reference for the NoteFlow CLI v2.7.0: create, read, edit and organize markdown notes from any terminal, sync with GitHub or NoteFlow Cloud, and drive it from scripts or AI agents. A single Node.js script, zero dependencies.',
  },

  hero: {
    kicker: 'NoteFlow · CLI reference',
    h1: 'Your notes,<br />headless.',
    tagline:
      'The whole notebook from any terminal — a single Node.js script, zero dependencies, same files as the desktop app.',
    termTitle: 'pi@homelab: ~',
    termLines: [
      '~ $ noteflow --help',
      'NoteFlow CLI — quick notes from your terminal',
      '',
      'usage: noteflow <command> [options]',
      '',
      '  add · new · list · get · read · set · path · touch',
      '  sections · section · move · groups · folders',
      '  login · cloud · push · pull · migrate · self-update · status',
      '',
      '~ $ noteflow add "It works."',
      '✓ Added to "07-07-2026" · Note',
    ],
  },

  toc: [
    { id: 'install', label: 'Install' },
    { id: 'notes-dir', label: 'Notes directory' },
    { id: 'format', label: 'Note format' },
    { id: 'commands', label: 'Commands' },
    { id: 'flags', label: 'Flags & colors' },
    { id: 'agents', label: 'For AI agents' },
    { id: 'caveats', label: 'Caveats' },
    { id: 'troubleshooting', label: 'Troubleshooting' },
  ],

  install: {
    title: 'One script, zero dependencies',
    intro: [
      'The NoteFlow CLI is a single standalone Node.js script — <code>cli/noteflow.js</code>, no npm packages. It reads and writes the <strong>same files as the desktop app</strong>: same notes directory, same format, no daemon in between. That makes it perfect for servers, Raspberry Pis and any box without a screen.',
    ],
    headlessH3: 'Linux / Raspberry Pi (headless)',
    headlessTermTitle: 'install',
    installCmd: 'curl -fsSL https://raw.githubusercontent.com/yagoid/noteflow/main/cli/install-cli.sh | sudo bash',
    desktopH3: 'Linux desktop / Windows',
    desktopP:
      'Nothing to do — the CLI installs automatically with NoteFlow’s <code>.deb</code> and <code>.exe</code> desktop installers.',
    reqP: 'Only requirement: <strong>Node.js ≥ 18</strong>. The script also installs the CLI’s AI agent skill into <code>~/.claude/skills</code> and <code>~/.agents/skills</code>. To update later, run it again or use <code>noteflow self-update</code> (it refreshes the installed skill too).',
  },

  notesDir: {
    title: 'Where your notes live',
    intro: [
      'The CLI operates directly on the NoteFlow notes directory — plain files on your disk, no database:',
    ],
    colPlatform: 'Platform',
    colPath: 'Path',
    rows: [
      { platform: 'Linux', path: '~/.local/share/noteflow-notes/' },
      { platform: 'Windows / macOS', path: '~/noteflow-notes/' },
    ],
    envP:
      'The <code>NOTEFLOW_NOTES_DIR</code> environment variable points the CLI at a different directory — useful for scripting and testing against a sandbox.',
  },

  format: {
    title: 'Note format (v2 — folder per note)',
    intro: [
      'Every note is a <strong>directory</strong> named <code>&lt;slug&gt;-&lt;id&gt;/</code> holding a <code>note.md</code> (frontmatter only: metadata + section index) and <strong>one <code>.md</code> file per section</strong> (pure markdown):',
    ],
    termTitle: 'noteflow-notes/',
    treeLines: [
      'project-alpha-abc12345/',
      '  note.md       ← metadata anchor + section index',
      '  sec001.md     ← body of section "Note"',
      '  sec002.md     ← body of section "Tasks"',
    ],
    bullets: [
      'Each section’s content lives in its own <code>&lt;sectionId&gt;.md</code> — no frontmatter, just markdown.',
      'The <code>updated:</code> field in <code>note.md</code> is the canonical sync timestamp for the whole note.',
      '<code>isRawMode: true</code> means text mode (the app shows the content as-is, unrendered); <code>false</code> means markdown mode (the app renders it). Either way the section file holds plain markdown.',
      'Notes with an <code>encryption:</code> block in <code>note.md</code> are encrypted (the folder only contains <code>note.md</code>) — the CLI ignores them.',
      'A <code>.noteflow-format</code> marker file (containing <code>2</code>) at the root of the notes directory flags the v2 format.',
    ],
    migrateP:
      'Coming from the old flat v1 layout? A single <code>noteflow migrate</code> converts everything — see the <a href="#commands">commands table</a>.',
  },

  commands: {
    title: 'Command reference',
    intro: [
      'Everything is addressed <strong>by name</strong>: note titles plus section names — you never touch ids. Titles can be partial (on multiple matches the CLI lists them and asks for precision), and duplicate section names are targeted with a 1-based suffix like <code>"Tasks#2"</code>. Quote names containing spaces.',
    ],
    colCommand: 'Command',
    colDesc: 'What it does',
    flagsLabel: 'Options',
    exampleLabel: 'Example',
  },

  flags: {
    title: 'Global flags, colors & env vars',
    intro: ['A few flags repeat across commands with the same meaning everywhere. A flag a command doesn’t support is an error (exit 1, nothing done), never silently ignored:'],
    colFlag: 'Flag',
    colApplies: 'Applies to',
    colDesc: 'Description',
    colorsH3: 'Group colors',
    colorsP:
      'The palette accepted by <code>group create --color</code> — the same color tokens the desktop app uses for group dots and note accents:',
    envH3: 'Environment variables',
    envRows: [
      {
        name: 'NOTEFLOW_NOTES_DIR',
        desc: 'Redirect the notes directory (scripting / testing).',
      },
      {
        name: 'NOTEFLOW_NO_APP_CHECK',
        desc: 'Set to <code>1</code> to silence the stderr warning when mutating groups/folders while the desktop app is running.',
      },
      {
        name: 'NOTEFLOW_CLOUD_PASSPHRASE',
        desc: 'Passphrase (or recovery code) for NoteFlow Cloud accounts in private (e2ee) mode — skips the interactive prompt on servers and cron jobs. Never stored on disk.',
      },
    ],
    colEnv: 'Variable',
    colEnvDesc: 'Effect',
  },

  agents: {
    title: 'A tool built for AI agents',
    intro: [
      'The CLI is deliberately agent-friendly: the read commands (<code>list</code>, <code>get</code>, <code>read</code>, <code>path</code>, <code>status</code>…) take <code>--json</code> for machine-readable output, results go to <strong>stdout</strong> and errors to <strong>stderr</strong>, and the exit code is <code>0</code> on success, <code>1</code> on error. Since everything is addressed by note title and section name, an agent never needs to track ids.',
      'Two conventions matter: <code>read</code> vs <code>get</code> — <code>get</code> is for humans (indented, decorated) while <code>read</code> emits content verbatim, so agents should always use <code>read</code>. And <code>set</code> vs <code>add</code> — <code>set</code> <strong>replaces</strong> a section, <code>add</code> <strong>appends</strong> to it. An explicit section name must match an existing one <strong>exactly</strong>: an unknown one fails with a “Did you mean” and the list of sections — as JSON too under <code>--json</code> — so the agent can retry with the right name; <code>--create</code> is for genuinely new sections.',
      'For <strong>partial edits of a large section</strong> there is a shortcut: the CLI has no find-replace, so <code>read</code> + <code>set</code> means hauling the whole section out and back. If your agent already has file-editing tools, ask <code>path</code> for the section’s <code>.md</code>, edit it in place, and close with <code>touch</code> — which bumps <code>updated:</code> and pushes.',
    ],
    flowH3: 'Typical agent flow',
    flowTermTitle: 'agent session',
    flowLines: [
      '# 1 · discover notes and section names',
      '$ noteflow list --json',
      '# 2 · read one section, raw (pipe-safe)',
      '$ noteflow read "Project Alpha" "Tasks"',
      '# 3 · overwrite it — or append with `add`',
      '$ noteflow set "Project Alpha" "Tasks" --text "- [x] deploy"',
      '# 3b · …or edit the section file in place with your own tools',
      '$ noteflow path "Project Alpha" "Tasks"',
      '$ noteflow touch "Project Alpha"',
      '# 4 · sync',
      '$ noteflow push',
    ],
    skillH3: 'Install the skill',
    skillP:
      'Running Claude Code or another skills-compatible agent? The NoteFlow CLI skill gives your agent the full command reference, gotchas included. The desktop app and the headless installer already put it in your agent skill dirs; to add it by hand:',
    skillTermTitle: 'skills',
    skillCmd: 'npx skills add yagoid/noteflow/cli/noteflow-cli',
  },

  caveats: {
    title: 'Caveats worth knowing',
    items: [
      {
        title: 'Desktop app open ⇒ group/folder changes can be lost',
        html:
          'The app keeps <code>groups.json</code> / <code>folders.json</code> in memory and <strong>rewrites them on its own cycles</strong> (saves and the 5-minute auto-sync), overwriting groups and folders created from the CLI while it runs. Note-level changes — content, sections, favorite, archive — do survive: they live in per-note folders. The CLI <strong>warns on stderr</strong> when it detects NoteFlow running while you mutate groups/folders (silence it with <code>NOTEFLOW_NO_APP_CHECK=1</code>). For reliable structural changes, close the app first — or make them in the app.',
      },
      {
        title: 'PowerShell: multiline --text can truncate silently',
        html:
          'On Windows/PowerShell, passing <code>--text</code> with newlines may be <strong>truncated to the first line</strong> without warning. For anything beyond a single line use <code>--file &lt;path&gt;</code> (the most reliable route) or <code>--stdin</code>. Rule of thumb: non-trivial content → <code>--file</code>.',
      },
      {
        title: 'BOM on --stdin',
        html:
          'PowerShell prepends a BOM to pipes and here-strings; the CLI strips it automatically, so piped content arrives clean.',
      },
    ],
  },

  troubleshooting: {
    title: 'Troubleshooting',
    items: [
      {
        q: '“noteflow: command not found”',
        a:
          'The headless install script places the CLI at <code>/usr/local/bin/noteflow</code> — make sure that’s on your <code>PATH</code>. On desktop it ships with the <code>.deb</code> / <code>.exe</code> installers; open a fresh terminal after installing.',
      },
      {
        q: 'I’m logged in in the app, but the CLI asks me to log in',
        a:
          'Expected: the CLI <strong>can’t decrypt</strong> tokens the desktop app stores with Electron’s <code>safeStorage</code>, and sessions can’t be shared anyway (they rotate on every use). It keeps its own credentials — run <code>noteflow login</code> (GitHub) or <code>noteflow cloud login</code> (NoteFlow Cloud) once.',
      },
      {
        q: 'A note doesn’t show up in list / read',
        a:
          'Encrypted notes (an <code>encryption:</code> block in <code>note.md</code>) are <strong>ignored by every read command</strong>, by design. Decrypt the note in the desktop app if you need CLI access to it.',
      },
      {
        q: 'My CLI-made groups or folders vanished / pull didn’t change anything',
        a:
          'Two sync rules: the desktop app’s auto-sync rewrites <code>groups.json</code> / <code>folders.json</code> while it runs (see <a href="#caveats">caveats</a>), and <code>pull</code> only overwrites a local note when the remote <code>updated:</code> timestamp is newer. Close the app for structural changes, and check <code>noteflow status</code> for the last sync.',
      },
    ],
  },
};

export type CliContent = typeof cliEn;
