import { common } from './common'
import { settings } from './settings'
import { sidebar } from './sidebar'
import { shell } from './shell'
import { noteMenu } from './noteMenu'
import { overview } from './overview'
import { contentView } from './contentView'
import { editor } from './editor'
import { exportImport } from './exportImport'
import { encryption } from './encryption'
import { sticky } from './sticky'
import { palette } from './palette'
import { aiPanel } from './aiPanel'
import { brain } from './brain'
import { titleBar } from './titleBar'
import { whatsNew } from './whatsNew'
import { linked } from './linked'
import { versionHistory } from './versionHistory'
import { originChoice } from './originChoice'
import { drawing } from './drawing'

// English is the source of truth: the shape of this object defines `Messages`,
// which every other language must mirror exactly (enforced in es/index.ts).
export const en = {
  common,
  settings,
  sidebar,
  shell,
  noteMenu,
  overview,
  contentView,
  editor,
  exportImport,
  encryption,
  sticky,
  palette,
  aiPanel,
  brain,
  titleBar,
  whatsNew,
  linked,
  versionHistory,
  originChoice,
  drawing,
}

export type Messages = typeof en
