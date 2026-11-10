export interface ThemeVars {
  '--bg-0':        string
  '--bg-1':        string
  '--bg-2':        string
  '--bg-3':        string
  '--border':      string
  '--text':        string
  '--text-muted':  string
  '--accent':      string
  '--accent-2':    string
  '--accent-3':    string
  '--red':         string
  '--cyan':        string
  '--purple':      string
  '--bg-editor':   string
  '--tab-active':  string
  '--orange':      string
  '--pink':        string
}

// App-level font registry. Each theme picks one of these for the whole UI chrome
// (titlebar, sidebar, panels, buttons…). This is independent from the editor font
// (--prose-font-family, toggled separately), so a theme's personality reaches the
// whole shell while the writing surface stays under the user's Mono/Inter control.
export interface AppFont {
  id: string
  label: string
  /** Full CSS font-family stack applied via --app-font-family. */
  stack: string
}

export const APP_FONTS: Record<string, AppFont> = {
  'jetbrains-mono': { id: 'jetbrains-mono', label: 'JetBrains Mono', stack: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace" },
  'inter':          { id: 'inter',          label: 'Inter',          stack: "'Inter', system-ui, sans-serif" },
  'space-grotesk':  { id: 'space-grotesk',  label: 'Space Grotesk',  stack: "'Space Grotesk', system-ui, sans-serif" },
  'sora':           { id: 'sora',           label: 'Sora',           stack: "'Sora', system-ui, sans-serif" },
  'ibm-plex-mono':  { id: 'ibm-plex-mono',  label: 'IBM Plex Mono',  stack: "'IBM Plex Mono', 'JetBrains Mono', monospace" },
  'lora':           { id: 'lora',           label: 'Lora',           stack: "'Lora', Georgia, serif" },
}

export const DEFAULT_APP_FONT = 'jetbrains-mono'

export interface Theme {
  id: string
  label: string
  colorScheme: 'dark' | 'light'
  /** Key into APP_FONTS — the app-level font this theme applies to the UI chrome. */
  font: string
  vars: ThemeVars
}

export const THEMES: Theme[] = [
  {
    // NoteFlow's signature themes — mirror the colours of the live landing page
    // ("The Brain" design system, docs/src/styles/brain-site.css), NOT the unused
    // tokens.css. Warm near-black surfaces + warm off-white ink + the amber "detail"
    // accent (#f5a623) that fires on every hover/highlight on the site. These are
    // the app defaults; Dark is the default theme.
    id: 'noteflow-dark',
    label: 'NoteFlow Dark',
    colorScheme: 'dark',
    font: 'inter',
    vars: {
      '--bg-0':        '12 12 17',   // --bg #0c0c11
      '--bg-1':        '16 16 23',   // --bg-soft #101017
      '--bg-2':        '21 21 28',   // --card #15151c
      '--bg-3':        '27 27 35',   // --card-2 #1b1b23
      '--border':      '45 44 52',   // --line/--line-2 (warm-white over near-black)
      '--text':        '236 234 224', // --ink #ECEAE0
      '--text-muted':  '166 163 154', // --ink-dim #a6a39a
      '--accent':      '245 166 35',  // --detail amber #f5a623 (signature)
      '--accent-2':    '96 166 150',  // web --accent (teal)
      '--accent-3':    '240 160 48', // web --accent-2 (yellow)
      '--red':         '244 71 71',
      '--cyan':        '79 195 247',
      '--purple':      '197 134 192',
      '--bg-editor':   '20 20 27',
      '--tab-active':  '245 166 35',
      '--orange':      '255 130 40',
      '--pink':        '255 80 160',
    },
  },
  {
    id: 'noteflow-light',
    label: 'NoteFlow Light',
    colorScheme: 'light',
    font: 'space-grotesk',
    vars: {
      '--bg-0':        '231 223 204', // --bg #E7DFCC (parchment)
      '--bg-1':        '239 232 216', // --bg-soft #EFE8D8
      '--bg-2':        '245 239 224', // --card #F5EFE0
      '--bg-3':        '235 227 208', // --card-2 #EBE3D0
      '--border':      '205 192 168', // --line-2 over parchment
      '--text':        '42 38 32',    // --ink #2a2620
      '--text-muted':  '108 102 86',  // --ink-dim #6c6656
      '--accent':      '184 117 20',  // --detail deeper amber #b87514
      '--accent-2':    '58 130 116',  // teal, deepened for contrast on parchment
      '--accent-3':    '240 160 48',   // green, deepened
      '--red':         '188 72 60',
      '--cyan':        '40 138 150',
      '--purple':      '108 86 180',
      '--bg-editor':   '247 242 230',
      '--tab-active':  '184 117 20',
      '--orange':      '168 110 40',
      '--pink':        '168 78 124',
    },
  },
  {
    id: 'arctic-day',
    label: 'Arctic Day',
    colorScheme: 'light',
    font: 'sora',
    vars: {
      '--bg-0':        '220 230 242',
      '--bg-1':        '237 243 252',
      '--bg-2':        '226 234 247',
      '--bg-3':        '208 220 238',
      '--border':      '176 196 220',
      '--text':        '26 38 64',
      '--text-muted':  '74 94 122',
      '--accent':      '26 111 204',
      '--accent-2':    '23 144 122',
      '--accent-3':    '176 122 16',
      '--red':         '204 42 58',
      '--cyan':        '23 144 122',
      '--purple':      '44 94 168',
      '--bg-editor':   '237 243 252',
      '--tab-active':  '26 111 204',
      '--orange':      '180 75 0',
      '--pink':        '160 30 130',
    },
  },
  {
    id: 'midnight-blue',
    label: 'Midnight Blue',
    colorScheme: 'dark',
    font: 'inter',
    vars: {
      '--bg-0':        '9 12 17',
      '--bg-1':        '14 19 26',
      '--bg-2':        '22 29 40',
      '--bg-3':        '30 40 55',
      '--border':      '38 50 68',
      '--text':        '212 212 212',
      '--text-muted':  '140 140 140',
      '--accent':      '78 158 255',
      '--accent-2':    '78 201 176',
      '--accent-3':    '240 160 48',
      '--red':         '244 71 71',
      '--cyan':        '79 195 247',
      '--purple':      '197 134 192',
      '--bg-editor':   '16 22 30',
      '--tab-active':  '240 160 48',
      '--orange':      '255 130 40',
      '--pink':        '255 80 160',
    },
  },
  {
    id: 'carbon',
    label: 'Carbon',
    colorScheme: 'dark',
    font: 'jetbrains-mono',
    vars: {
      '--bg-0':        '9 9 9',
      '--bg-1':        '17 17 17',
      '--bg-2':        '26 26 26',
      '--bg-3':        '38 38 38',
      '--border':      '42 42 42',
      '--text':        '212 212 212',
      '--text-muted':  '140 140 140',
      '--accent':      '78 158 255',
      '--accent-2':    '78 201 176',
      '--accent-3':    '240 160 48',
      '--red':         '244 71 71',
      '--cyan':        '79 195 247',
      '--purple':      '197 134 192',
      '--bg-editor':   '20 20 20',
      '--tab-active':  '240 160 48',
      '--orange':      '255 130 40',
      '--pink':        '255 80 160',
    },
  },
  {
    id: 'tokyo-night',
    label: 'Tokyo Night',
    colorScheme: 'dark',
    font: 'jetbrains-mono',
    vars: {
      '--bg-0':        '19 20 30',
      '--bg-1':        '26 27 38',
      '--bg-2':        '36 40 59',
      '--bg-3':        '47 52 73',
      '--border':      '47 52 73',
      '--text':        '192 202 245',
      '--text-muted':  '130 140 190',
      '--accent':      '122 162 247',
      '--accent-2':    '158 206 106',
      '--accent-3':    '224 175 104',
      '--red':         '247 118 142',
      '--cyan':        '125 207 255',
      '--purple':      '187 154 247',
      '--bg-editor':   '19 20 30',
      '--tab-active':  '224 175 104',
      '--orange':      '255 158 100',
      '--pink':        '255 121 198',
    },
  },
  {
    id: 'vscode-dark',
    label: 'VS Code Dark',
    colorScheme: 'dark',
    font: 'inter',
    vars: {
      '--bg-0':        '38 38 40',
      '--bg-1':        '22 22 22',
      '--bg-2':        '36 36 38',
      '--bg-3':        '46 46 48',
      '--border':      '60 60 62',
      '--text':        '212 212 212',
      '--text-muted':  '128 128 128',
      '--accent':      '86 156 214',
      '--accent-2':    '106 153 85',
      '--accent-3':    '220 220 170',
      '--red':         '244 71 71',
      '--cyan':        '78 201 176',
      '--purple':      '197 134 192',
      '--bg-editor':   '30 30 30',
      '--tab-active':  '86 156 214',
      '--orange':      '206 145 120',
      '--pink':        '218 112 214',
    },
  },
  {
    id: 'dracula',
    label: 'Dracula',
    colorScheme: 'dark',
    font: 'space-grotesk',
    vars: {
      '--bg-0':        '30 31 41',
      '--bg-1':        '34 36 47',
      '--bg-2':        '46 49 63',
      '--bg-3':        '57 60 76',
      '--border':      '68 71 90',
      '--text':        '248 248 242',
      '--text-muted':  '130 148 210',
      '--accent':      '189 147 249',
      '--accent-2':    '80 250 123',
      '--accent-3':    '241 250 140',
      '--red':         '255 85 85',
      '--cyan':        '139 233 253',
      '--purple':      '189 147 249',
      '--bg-editor':   '40 42 54',
      '--tab-active':  '255 121 198',
      '--orange':      '255 184 108',
      '--pink':        '255 121 198',
    },
  },
  {
    id: 'true-godot',
    label: 'True Godot',
    colorScheme: 'dark',
    font: 'ibm-plex-mono',
    vars: {
      '--bg-0':        '26 26 26',
      '--bg-1':        '37 37 37',
      '--bg-2':        '51 51 51',
      '--bg-3':        '65 65 65',
      '--border':      '75 75 75',
      '--text':        '224 224 224',
      '--text-muted':  '128 128 128',
      '--accent':      '71 140 191',
      '--accent-2':    '107 189 107',
      '--accent-3':    '255 204 0',
      '--red':         '255 91 91',
      '--cyan':        '102 217 239',
      '--purple':      '174 129 255',
      '--bg-editor':   '33 33 33',
      '--tab-active':  '255 204 0',
      '--orange':      '253 150 68',
      '--pink':        '249 38 114',
    },
  },
  {
    id: 'gruvbox-dark',
    label: 'GruvBox Dark',
    colorScheme: 'dark',
    font: 'ibm-plex-mono',
    vars: {
      '--bg-0':        '29 28 26',
      '--bg-1':        '34 32 30',
      '--bg-2':        '50 46 43',
      '--bg-3':        '65 60 56',
      '--border':      '62 57 53',
      '--text':        '235 219 178',
      '--text-muted':  '168 152 134',
      '--accent':      '69 133 136',
      '--accent-2':    '152 151 26',
      '--accent-3':    '215 153 33',
      '--red':         '204 36 29',
      '--cyan':        '104 157 106',
      '--purple':      '177 98 134',
      '--bg-editor':   '40 40 40',
      '--tab-active':  '215 153 33',
      '--orange':      '214 93 14',
      '--pink':        '211 134 155',
    },
  },
  {
    id: 'obsidian',
    label: 'Obsidian',
    colorScheme: 'dark',
    font: 'inter',
    vars: {
      '--bg-0':        '12 12 12',
      '--bg-1':        '20 20 20',
      '--bg-2':        '30 30 30',
      '--bg-3':        '42 42 42',
      '--border':      '55 55 55',
      '--text':        '224 224 224',
      '--text-muted':  '130 130 130',
      '--accent':      '180 180 180',
      '--accent-2':    '200 200 200',
      '--accent-3':    '160 160 160',
      '--red':         '200 80 80',
      '--cyan':        '130 170 190',
      '--purple':      '170 140 200',
      '--bg-editor':   '15 15 15',
      '--tab-active':  '200 200 200',
      '--orange':      '190 140 100',
      '--pink':        '200 120 160',
    },
  },
  {
    id: 'emerald-forest',
    label: 'Emerald Forest',
    colorScheme: 'dark',
    font: 'sora',
    vars: {
      '--bg-0':        '10 20 14',
      '--bg-1':        '16 30 22',
      '--bg-2':        '24 44 34',
      '--bg-3':        '34 58 44',
      '--border':      '42 68 54',
      '--text':        '210 230 215',
      '--text-muted':  '110 145 120',
      '--accent':      '100 200 130',
      '--accent-2':    '140 220 160',
      '--accent-3':    '180 230 100',
      '--red':         '220 100 90',
      '--cyan':        '100 210 180',
      '--purple':      '160 140 200',
      '--bg-editor':   '14 26 18',
      '--tab-active':  '140 220 160',
      '--orange':      '210 160 80',
      '--pink':        '220 130 170',
    },
  },
  {
    id: 'synthwave',
    label: 'Synthwave',
    colorScheme: 'dark',
    font: 'space-grotesk',
    vars: {
      '--bg-0':        '15 10 25',
      '--bg-1':        '28 18 45',
      '--bg-2':        '42 28 65',
      '--bg-3':        '55 38 82',
      '--border':      '70 50 100',
      '--text':        '235 220 245',
      '--text-muted':  '130 110 155',
      '--accent':      '255 100 200',
      '--accent-2':    '0 230 230',
      '--accent-3':    '255 200 60',
      '--red':         '255 90 120',
      '--cyan':        '0 230 230',
      '--purple':      '170 120 255',
      '--bg-editor':   '20 12 32',
      '--tab-active':  '255 100 200',
      '--orange':      '255 140 80',
      '--pink':        '255 80 180',
    },
  },
  {
    id: 'parchment',
    label: 'Parchment',
    colorScheme: 'light',
    font: 'lora',
    vars: {
      '--bg-0':        '220 220 218',
      '--bg-1':        '233 233 231',
      '--bg-2':        '240 240 238',
      '--bg-3':        '247 247 245',
      '--border':      '208 208 206',
      '--text':        '42 38 32',
      '--text-muted':  '108 100 88',
      '--accent':      '75 118 188',
      '--accent-2':    '58 138 96',
      '--accent-3':    '158 108 38',
      '--red':         '178 48 48',
      '--cyan':        '38 138 148',
      '--purple':      '118 68 158',
      '--bg-editor':   '239 239 237',
      '--tab-active':  '75 118 188',
      '--orange':      '188 98 38',
      '--pink':        '168 58 118',
    },
  },
]

export const DEFAULT_THEME_ID = 'noteflow-dark'
/** The app's own light theme: the "Light" of the sidebar footer's quick Light / Dark switch. */
export const LIGHT_THEME_ID = 'noteflow-light'
