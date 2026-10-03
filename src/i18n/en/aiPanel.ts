// The AI side panel shown inside the Brain view (chat, related notes, provider
// config and the "second brain" profile wizard). Distinct from `settings.ai`,
// which is the Appearance→AI settings panel. Brand/product names (Anthropic,
// OpenAI, Ollama, Claude, Notion, GitHub…) and model ids stay literal.
export const aiPanel = {
  tabs: {
    chat: 'Chat',
    related: 'Related',
    profile: 'Profile',
  },
  providerTooltip: 'AI provider',
  collapse: 'Collapse AI panel',
  remove: 'Remove',

  chat: {
    // Present-continuous labels shown while a tool runs (keyed by tool name).
    running: {
      list_notes: 'Listing notes…',
      get_note: 'Reading note…',
      list_groups: 'Listing groups…',
      search_notes: 'Searching notes…',
      create_note: 'Creating note…',
      update_note: 'Updating note…',
      add_section: 'Adding section…',
      update_section: 'Updating section…',
      rename_section: 'Renaming section…',
      create_group: 'Creating group…',
      create_folder: 'Creating folder…',
      rename_group: 'Renaming group…',
      rename_folder: 'Renaming folder…',
      delete_note: 'Deleting note…',
      delete_section: 'Deleting section…',
      delete_group: 'Deleting group…',
      delete_folder: 'Deleting folder…',
    },
    confirm: {
      delete_note: 'Delete this note permanently?',
      delete_section: 'Delete this section?',
      delete_group: 'Delete this group? Its notes are kept but ungrouped.',
      delete_folder: 'Delete this folder? Its notes keep their group.',
      fallback: 'Confirm this action?',
    },
    confirmBtn: 'Confirm',
    thinking: 'Thinking…',
    // Screen-reader text for the pulsing dots shown while the reply streams in.
    responding: 'Writing a reply…',

    // Composer attachment tooltip. `list` is a comma-joined subset of fileTypes.
    attachHint: 'Attach files — {list}',
    attachHintBasic: 'Attach text & code files',
    messagePlaceholder: 'Type a message…',
    stop: 'Stop',
    send: 'Send',

    // Not-configured empty state.
    notConfigured: 'Connect a model (your Anthropic/OpenAI key or a local Ollama) to chat with your notes.',
    configureProvider: 'Configure provider',

    // Top bar + history.
    historyTooltip: 'Chat history',
    newChat: 'New chat',
    modelSelectTitle: 'Model used for the next question',
    noModel: '(no model)',
    loadModelsTitle: 'Load models from provider',
    noSavedChats: 'No saved chats yet.',
    deleteChat: 'Delete chat',
    emptyHint: "Ask about your notes. I'll light up the ones I use in the brain.",

    // Starter chips for the empty chat. `note`/`section` interpolate the quoted
    // name via {name}; when clicked, the chip text is sent to the chat as-is.
    suggestions: {
      generic: ['Summarize recent notes', 'What am I working on?', 'Find a topic'],
      note: ['Summarize {name}', 'Reorganize {name}', 'Improve {name}', 'Find notes like {name}', "What's in {name}?", 'Turn {name} into tasks'],
      section: ['Expand the {name} section', 'Clean up {name}'],
    },
  },

  // File-type fragments shared by the chat composer + profile file picker.
  fileTypes: {
    pdf: 'PDF',
    images: 'images',
    textCode: 'text & code',
  },

  related: {
    enablePrompt: 'Enable local AI (in the brain) to see content-related notes.',
    intro: 'Notes and sections that the local AI finds most similar in content to the one you pick below — surfacing connections across your notes.',
    from: 'From',
    selectNote: 'Select a note',
    searchNotes: 'Search notes…',
    noNotes: 'No notes',
    indexing: 'Indexing…',
    finding: 'Finding related notes…',
    none: 'No related notes found.',
    untitledSection: 'Untitled section',
    thisNote: '↻ this note',
  },

  provider: {
    provider: 'Provider',
    hintAnthropic: 'Claude via the official API (BYO key).',
    hintOpenAiCompat: 'OpenAI-compatible endpoint (BYO key).',
    hintLocal: 'Local / no API key required.',
    paidLabel: 'Paid',
    noteflowSignIn: 'Sign in to your NoteFlow account to use it.',
    noteflowNeedsSubscription: 'Requires a NoteFlow AI subscription — manage your plan in Settings → Account.',
    goToAccount: 'Go to Account',
    // Two-card selector: the assistant runs on EITHER the managed plan OR a provider of
    // your own (API key / local model). Badges tell which one is actually in use.
    chooseSourceDesc: 'Pick one source for the assistant: the managed NoteFlow AI plan, or a provider of your own.',
    badgeActive: 'Active',
    badgeInactive: 'Inactive',
    noteflowCard: {
      subtitle: 'Managed plan — chat with your notes without any API key.',
      useButton: 'Use NoteFlow AI',
      // Monthly consumption line under the progress bar; {used}/{limit} come
      // pre-abbreviated (e.g. "1.2M", "3M").
      usage: '{used} / {limit} tokens this month',
    },
    byoCard: {
      title: 'Your provider / local AI',
      subtitle: 'OpenAI, Anthropic, OpenRouter… with your own API key, or a local model (Ollama).',
      useButton: 'Use this provider',
    },
    // Suffix appended to model options that burn the monthly quota faster
    // (e.g. "grok-4.5 (2× quota)", "kimi-k3 (6× quota)").
    modelQuotaSuffix: '({mult}× quota)',
    baseUrl: 'Base URL',
    apiKey: 'API key',
    keySaved: 'Key saved',
    model: 'Model',
    // Helper under the Model label when the active preset serves a curated catalog
    // (NoteFlow AI): the field is read-only and the choice is made with the chips.
    modelCuratedHint: 'Managed plan — pick one of the models below.',
    load: 'Load',
    error: 'Error',
    testConnection: 'Test connection',
    connected: '✓ Connected',
  },

  profile: {
    createTitle: 'Create your profile',
    createIntro: "Tap what fits, add a few tags — that's all it takes. The AI fills in the rest and writes an editable profile note in your language, used as context for better answers.",
    addMore: 'Add more — optional',
    files: 'Files',
    addFiles: 'Add files',
    // `types` is the caps-based file list; e.g. "PDF, images, text & code files".
    filesHint: 'The AI reads them directly. Supported here: {types}.',
    links: 'Links',
    linksPlaceholder: 'LinkedIn, portfolio, GitHub, X…',
    notNow: 'Not now',
    generate: 'Generate profile',
    generating: 'Generating…',
    generateError: 'Could not generate the profile',
    // Accepted-files hint fragments (assembled with fileTypes).
    acceptFiles: '{types} files',
    acceptFilesBasic: 'text & code files',

    createdTitle: 'Profile created',
    createdIntro: 'The AI keeps your profile note as context for better answers. Edit it like any other note, or start over to rebuild it from scratch.',
    yourNote: 'Your profile note',
    noteDeleted: 'The profile note was deleted. Start over to create a new one.',
    startOver: 'Start over',
  },

  // The "second brain" profile wizard schema (labels/hints/options). Field ids and
  // types live in code; only display strings come from here. Brand names in the
  // option lists (Notion, Figma, Python…) stay literal by design.
  profileForm: {
    professional: {
      title: 'Professional',
      description: 'Work, studies and what you spend your focus on.',
      about: {
        label: 'What do you do?',
        hint: 'Work, studies, or how you spend most of your time. A line is enough.',
        placeholder: 'e.g. I study architecture / I run a small bakery / Backend dev at a startup',
      },
      tools: {
        label: 'Tools & apps you use often',
        hint: 'Optional — anything from Notion to a programming language.',
        placeholder: 'Type a tool and press Enter',
        options: ['Notion', 'Excel', 'Figma', 'Obsidian', 'Photoshop', 'VS Code', 'Python', 'TypeScript'],
      },
      goals: {
        label: 'What are you focused on?',
        options: ['Learn something new', 'Build a habit', 'Get organized', 'Ship a project', 'Find a job', 'Improve my health', 'Personal growth', 'Earn more'],
      },
    },
    personal: {
      title: 'Personal',
      description: 'A few favourites — no need to overthink, just what comes to mind.',
      name: {
        label: 'Your name',
        placeholder: 'Optional — how should the AI address you?',
      },
      interests: {
        label: 'Interests & passions',
        placeholder: 'Type anything you love and press Enter',
        options: ['Reading', 'Music', 'Gaming', 'Sports', 'Cooking', 'Travel', 'Art', 'Science', 'Technology', 'Photography', 'Writing', 'Nature'],
      },
      music: {
        label: 'Songs or artists you keep coming back to',
        hint: 'A few is plenty — taste says more than you’d think.',
        placeholder: 'Type a song or artist and press Enter',
      },
      screen: {
        label: 'Favourite films or series',
        hint: 'The ones you’d rewatch any day.',
        placeholder: 'Type a film or series and press Enter',
      },
      books: {
        label: 'Books that stuck with you',
        hint: 'Optional.',
        placeholder: 'Type a book and press Enter',
      },
      dreamTrip: {
        label: 'A place you’d love to go',
        hint: 'Optional — a dream trip or a spot you keep thinking about.',
        placeholder: 'e.g. road-tripping Iceland / a quiet cabin in the mountains',
      },
    },
    style: {
      title: 'Your style',
      description: 'Quick taps — there are no right answers, just go with your gut.',
      personality: {
        label: 'How would you describe yourself?',
        options: ['Curious', 'Analytical', 'Creative', 'Organized', 'Spontaneous', 'Introverted', 'Extroverted', 'Detail-oriented', 'Big-picture', 'Pragmatic', 'Ambitious', 'Easy-going'],
      },
      q_weekend: {
        label: 'Your ideal weekend is…',
        options: ['Planned in advance', 'Decided in the moment'],
      },
      q_recharge: {
        label: 'You recharge by…',
        options: ['Time on your own', 'Being around people'],
      },
      q_drawn: {
        label: 'You’re more drawn to…',
        options: ['A bold new idea', 'A proven, reliable method'],
      },
      q_space: {
        label: 'Your space tends to be…',
        options: ['Minimal and tidy', 'Full of things you love'],
      },
      q_decide: {
        label: 'When you decide, you trust…',
        options: ['The logic and facts', 'Your gut and the people involved'],
      },
      q_trip: {
        label: 'A trip you’d choose…',
        options: ['A packed itinerary', 'Wandering with no plan'],
      },
    },
    assistant: {
      title: 'Working with the AI',
      description: 'How you’d like the assistant to show up for you.',
      communication: {
        label: 'How should the AI talk to you?',
        options: ['Concise & direct', 'Detailed & thorough', 'Casual & friendly', 'Formal', 'Encouraging', 'Challenge my ideas', 'Step by step', 'Use examples'],
      },
      extra: {
        label: 'Anything else',
        placeholder: 'Optional — anything else that would help the AI understand you',
      },
    },
  },
}
