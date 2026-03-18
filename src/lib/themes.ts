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

export interface Theme {
  id: string
  label: string
  colorScheme: 'dark' | 'light'
  vars: ThemeVars
}

export const THEMES: Theme[] = [
  {
    id: 'tokyo-night',
    label: 'Tokyo Night',
    colorScheme: 'dark',
    vars: {
      '--bg-0':        '19 20 30',
      '--bg-1':        '26 27 38',
      '--bg-2':        '36 40 59',
      '--bg-3':        '47 52 73',
      '--border':      '47 52 73',
      '--text':        '192 202 245',
      '--text-muted':  '86 95 137',
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
    id: 'midnight-blue',
    label: 'Midnight Blue',
    colorScheme: 'dark',
    vars: {
      '--bg-0':        '8 12 20',
      '--bg-1':        '10 14 23',
      '--bg-2':        '13 17 23',
      '--bg-3':        '17 24 40',
      '--border':      '26 38 64',
      '--text':        '205 217 229',
      '--text-muted':  '106 122 144',
      '--accent':      '121 184 255',
      '--accent-2':    '78 201 176',
      '--accent-3':    '229 192 123',
      '--red':         '255 123 123',
      '--cyan':        '78 201 176',
      '--purple':      '74 144 217',
      '--bg-editor':   '13 17 23',
      '--tab-active':  '229 192 123',
      '--orange':      '230 140 70',
      '--pink':        '210 100 200',
    },
  },
  {
    id: 'arctic-day',
    label: 'Arctic Day',
    colorScheme: 'light',
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
    id: 'carbon',
    label: 'Carbon',
    colorScheme: 'dark',
    vars: {
      '--bg-0':        '9 9 9',
      '--bg-1':        '17 17 17',
      '--bg-2':        '26 26 26',
      '--bg-3':        '38 38 38',
      '--border':      '42 42 42',
      '--text':        '212 212 212',
      '--text-muted':  '100 100 100',
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
]

export const DEFAULT_THEME_ID = 'tokyo-night'
