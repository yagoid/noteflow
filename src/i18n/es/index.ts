import type { Messages } from '../en'
import { common } from './common'
import { settings } from './settings'
import { sidebar } from './sidebar'
import { shell } from './shell'
import { noteMenu } from './noteMenu'
import { overview } from './overview'
import { allContent } from './allContent'
import { editor } from './editor'
import { exportImport } from './exportImport'
import { encryption } from './encryption'
import { sticky } from './sticky'
import { palette } from './palette'
import { aiPanel } from './aiPanel'
import { brain } from './brain'
import { titleBar } from './titleBar'
import { whatsNew } from './whatsNew'

// The `: Messages` annotation makes TypeScript enforce key-for-key parity with
// English at compile time — a missing or misspelled key fails `npm run build`.
export const es: Messages = {
  common,
  settings,
  sidebar,
  shell,
  noteMenu,
  overview,
  allContent,
  editor,
  exportImport,
  encryption,
  sticky,
  palette,
  aiPanel,
  brain,
  titleBar,
  whatsNew,
}
