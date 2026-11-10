import { useState } from 'react'
import { Check, ChevronDown, Minus, Plus, RotateCcw } from 'lucide-react'
import { THEMES, APP_FONTS } from '../../lib/themes'
import { THEME_TEXT_COLOR, hexToRgbTriple, resolveThemeColor, rgbTripleToHex } from '../../lib/colorUtils'
import { useThemeStore } from '../../stores/themeStore'
import { useBrainSettingsStore } from '../../stores/brainSettingsStore'
import { UI_SCALES } from '../../stores/themeStore'
import type { EditorColorKey } from '../../stores/themeStore'
import type { Theme, ThemeVars } from '../../lib/themes'
import { tf } from '../../i18n/format'
import { useT } from '../../i18n/useT'
import { SectionTitle, settingsButtonClass } from './ui'

// Each editor colour follows a theme var until the user overrides it (same fallbacks
// as index.css).
const EDITOR_COLOR_THEME_VARS: Record<EditorColorKey, keyof ThemeVars> = {
  h1: '--accent',
  h2: '--cyan',
  h3: '--text',
  italic: '--purple',
  inlineCode: '--red',
  codeAccent: '--accent',
}

// One row per editor colour; `sample` picks how the row label previews its own colour.
type EditorColorRow = { key: EditorColorKey; sample: 'heading' | 'italic' | 'code' | 'border' }

const EDITOR_COLOR_ROWS: EditorColorRow[] = [
  { key: 'h1', sample: 'heading' },
  { key: 'h2', sample: 'heading' },
  { key: 'h3', sample: 'heading' },
  { key: 'italic', sample: 'italic' },
  { key: 'inlineCode', sample: 'code' },
  { key: 'codeAccent', sample: 'border' },
]

// Curated presets (as "r g b" triplets) around the hue wheel, slate grey last, on top of
// which the user can still pick any custom colour via the native colour input. Mid
// saturation and lightness on purpose: the same colour must read on light AND dark themes
// (each one is ≥ 3:1 against the --bg-1 / --bg-editor of every theme in lib/themes.ts).
// The "text" swatch (THEME_TEXT_COLOR) is rendered separately, before these.
const ACCENT_PRESETS: string[] = [
  '88 128 214',  // blue
  '50 142 152',  // teal
  '88 142 94',   // sage green
  '172 122 48',  // ochre
  '200 102 72',  // terracotta
  '208 88 110',  // rose
  '186 100 152', // mauve
  '138 108 212', // violet
  '120 128 144', // slate grey
]

export function AppearancePanel() {
  const activeThemeId = useThemeStore((s) => s.activeThemeId)
  const fontOverride = useThemeStore((s) => s.fontOverride)
  const accentOverride = useThemeStore((s) => s.accentOverride)
  const setTheme = useThemeStore((s) => s.setTheme)
  const setFontOverride = useThemeStore((s) => s.setFontOverride)
  const setAccentOverride = useThemeStore((s) => s.setAccentOverride)
  const editorColors = useThemeStore((s) => s.editorColors)
  const setEditorColor = useThemeStore((s) => s.setEditorColor)
  const resetEditorColors = useThemeStore((s) => s.resetEditorColors)
  const uiScale = useThemeStore((s) => s.uiScale)
  const changeUiScale = useThemeStore((s) => s.changeUiScale)
  const sidebarSectionsStyle = useThemeStore((s) => s.sidebarSectionsStyle)
  const setSidebarSectionsStyle = useThemeStore((s) => s.setSidebarSectionsStyle)
  const prefer3D = useBrainSettingsStore((s) => s.prefer3D)
  const setPrefer3D = useBrainSettingsStore((s) => s.setPrefer3D)
  const t = useT()

  const [showAllThemes, setShowAllThemes] = useState(false)

  const theme = THEMES.find((th) => th.id === activeThemeId) ?? THEMES[0]
  const effectiveFontId = fontOverride ?? theme.font
  // Stored colours may be THEME_TEXT_COLOR: resolve it to this theme's `--text` triple, as
  // themeStore does when applying it, so every swatch/preview/colour input gets a real triple.
  const resolveColor = (value: string) => resolveThemeColor(value, theme.vars['--text'])
  const effectiveAccent = accentOverride ? resolveColor(accentOverride) : theme.vars['--accent']
  const fonts = Object.values(APP_FONTS)

  // Effective colour of an editor element — the override, else its theme var. `--accent`
  // reads through the accent override, since that's what the root ends up carrying.
  const editorColor = (key: EditorColorKey) => {
    const override = editorColors[key]
    if (override) return resolveColor(override)
    const themeVar = EDITOR_COLOR_THEME_VARS[key]
    return themeVar === '--accent' ? effectiveAccent : theme.vars[themeVar]
  }
  // The "text" swatch is selected when chosen explicitly, or when the element follows the theme
  // and its default resolves to `--text`: its theme var is `--text` (h3), or it is `--accent`
  // (h1, codeAccent) while the accent itself is the text colour — the same "effective colour"
  // rule as the presets.
  const editorColorFollowsText = (key: EditorColorKey) => {
    const override = editorColors[key]
    if (override !== null) return override === THEME_TEXT_COLOR
    const themeVar = EDITOR_COLOR_THEME_VARS[key]
    return themeVar === '--text' || (themeVar === '--accent' && accentOverride === THEME_TEXT_COLOR)
  }
  const editorColorsOverridden = EDITOR_COLOR_ROWS.some((row) => editorColors[row.key] !== null)

  const editorColorLabels: Record<EditorColorKey, string> = {
    h1: 'H1',
    h2: 'H2',
    h3: 'H3',
    italic: t.settings.appearance.colorItalic,
    inlineCode: t.settings.appearance.colorInlineCode,
    codeAccent: t.settings.appearance.colorCodeAccent,
  }

  // The row label doubles as the swatch: it renders with the colour it controls.
  function renderColorSample(row: EditorColorRow, color: string) {
    const label = editorColorLabels[row.key]
    switch (row.sample) {
      case 'heading':
        return <span className="text-sm font-bold leading-none" style={{ color: `rgb(${color})` }}>{label}</span>
      case 'italic':
        return <span className="text-sm italic leading-none" style={{ color: `rgb(${color})` }}>{label}</span>
      case 'code':
        return (
          <span
            className="max-w-full truncate rounded border border-border bg-surface-0 px-1 py-0.5 text-[10px] font-mono leading-none"
            style={{ color: `rgb(${color})` }}
          >
            {label}
          </span>
        )
      case 'border':
        return (
          <span
            className="max-w-full truncate border-l-[3px] pl-1.5 text-[10px] leading-tight text-text-muted"
            style={{ borderColor: `rgb(${color})` }}
          >
            {label}
          </span>
        )
    }
  }

  // First swatch of every colour row: the theme's text colour (light on dark themes, dark on
  // light ones), painted with the live `--text` var so it flips with the theme. The check uses
  // --bg-1 so it contrasts with the swatch either way (a white check would vanish on white).
  function renderTextSwatch(size: 'lg' | 'sm', selected: boolean, onSelect: () => void) {
    const lg = size === 'lg'
    return (
      <button
        key={THEME_TEXT_COLOR}
        onClick={onSelect}
        className={`${lg ? 'w-7 h-7' : 'w-4 h-4'} rounded-full border border-border flex items-center justify-center transition-transform hover:scale-110`}
        style={{
          background: 'rgb(var(--text))',
          boxShadow: selected ? `0 0 0 2px rgb(var(--bg-1)), 0 0 0 ${lg ? 4 : 3}px rgb(var(--text) / 0.6)` : undefined,
        }}
        title={t.settings.appearance.textColour}
        aria-label={t.settings.appearance.textColour}
      >
        {selected && <Check size={lg ? 13 : 9} strokeWidth={3} style={{ color: 'rgb(var(--bg-1))' }} />}
      </button>
    )
  }

  // Only the first four themes show by default; the rest live behind a toggle.
  const primaryThemes = THEMES.slice(0, 4)
  const moreThemes = THEMES.slice(4)

  const scalePct = Math.round(uiScale * 100)
  const atMinScale = uiScale <= UI_SCALES[0]
  const atMaxScale = uiScale >= UI_SCALES[UI_SCALES.length - 1]

  function renderThemeCard(th: Theme) {
    const selected = th.id === activeThemeId
    return (
      <button
        key={th.id}
        onClick={() => setTheme(th.id)}
        className="relative text-left rounded-md border p-2 transition-all"
        style={{
          background: `rgb(${th.vars['--bg-1']})`,
          borderColor: selected ? `rgb(${th.vars['--accent']})` : `rgb(${th.vars['--border']})`,
          boxShadow: selected ? `0 0 0 1px rgb(${th.vars['--accent']})` : undefined,
        }}
      >
        <div className="flex items-center gap-1 mb-1.5">
          {(['--bg-0', '--bg-2', '--accent', '--accent-2', '--cyan'] as const).map((v) => (
            <span
              key={v}
              className="w-3.5 h-3.5 rounded-full border"
              style={{ background: `rgb(${th.vars[v]})`, borderColor: `rgb(${th.vars['--border']})` }}
            />
          ))}
        </div>
        <div className="flex items-center justify-between gap-1">
          <span className="text-[11px] truncate" style={{ color: `rgb(${th.vars['--text']})`, fontFamily: APP_FONTS[th.font]?.stack }}>
            {th.label}
          </span>
          {selected && <Check size={11} style={{ color: `rgb(${th.vars['--accent']})` }} className="flex-shrink-0" />}
        </div>
      </button>
    )
  }

  return (
    <div className="flex min-h-0 gap-4">
      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <div className="settings-rows flex-1 space-y-6">
        {/* Theme */}
        <section>
          <SectionTitle>{t.settings.appearance.theme}</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            {primaryThemes.map(renderThemeCard)}
          </div>
          {moreThemes.length > 0 && (
            <>
              {showAllThemes && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {moreThemes.map(renderThemeCard)}
                </div>
              )}
              <button
                onClick={() => setShowAllThemes((v) => !v)}
                className={`mt-2 flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-mono ${settingsButtonClass}`}
              >
                <ChevronDown size={11} className={`transition-transform ${showAllThemes ? 'rotate-180' : ''}`} />
                {showAllThemes ? t.settings.appearance.fewerThemes : tf(t.settings.appearance.moreThemes, { count: moreThemes.length })}
              </button>
            </>
          )}
        </section>

        {/* Font */}
        <section>
          <SectionTitle
            action={
              fontOverride !== null && (
                <button
                  onClick={() => setFontOverride(null)}
                  className={`flex flex-shrink-0 items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-mono ${settingsButtonClass}`}
                >
                  <RotateCcw size={9} /> {t.settings.appearance.themeDefault}
                </button>
              )
            }
          >
            {t.settings.appearance.font}
          </SectionTitle>
          <div className="grid grid-cols-3 gap-1.5">
            {fonts.map((f) => {
              // A font tile is "selected" when it matches the effective font, but we
              // only badge it as the explicit override when the user actually chose it.
              const isEffective = f.id === effectiveFontId
              const isOverride = f.id === fontOverride
              return (
                <button
                  key={f.id}
                  onClick={() => setFontOverride(f.id)}
                  className={`rounded-md border px-2 py-2 text-left transition-colors ${
                    isEffective ? 'border-accent bg-accent/[0.08]' : 'border-border hover:bg-surface-2'
                  }`}
                  style={{ fontFamily: f.stack }}
                  title={isOverride ? t.settings.appearance.fontSelected : f.label}
                >
                  <div className="text-sm text-text leading-none mb-1">Ag</div>
                  <div className={`text-[11px] truncate ${isEffective ? 'text-accent' : 'text-text-muted'}`}>{f.label}</div>
                </button>
              )
            })}
          </div>
        </section>

        {/* Accent */}
        <section>
          <SectionTitle
            action={
              accentOverride !== null && (
                <button
                  onClick={() => setAccentOverride(null)}
                  className={`flex flex-shrink-0 items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-mono ${settingsButtonClass}`}
                >
                  <RotateCcw size={9} /> {t.settings.appearance.themeDefault}
                </button>
              )
            }
          >
            {t.settings.appearance.accent}
          </SectionTitle>
          <div className="flex flex-wrap items-center gap-2">
            {renderTextSwatch('lg', accentOverride === THEME_TEXT_COLOR, () => setAccentOverride(THEME_TEXT_COLOR))}
            {ACCENT_PRESETS.map((rgb) => {
              const selected = accentOverride !== THEME_TEXT_COLOR && effectiveAccent.trim() === rgb
              return (
                <button
                  key={rgb}
                  onClick={() => setAccentOverride(rgb)}
                  className="w-7 h-7 rounded-full flex items-center justify-center transition-transform hover:scale-110"
                  style={{
                    background: `rgb(${rgb})`,
                    boxShadow: selected ? '0 0 0 2px rgb(var(--bg-1)), 0 0 0 4px rgb(var(--text) / 0.6)' : undefined,
                  }}
                  title={`rgb(${rgb})`}
                >
                  {selected && <Check size={13} className="text-white drop-shadow" />}
                </button>
              )
            })}
            {/* Custom colour picker */}
            <label
              className="w-7 h-7 rounded-full border border-dashed border-text-muted/50 flex items-center justify-center cursor-pointer hover:border-text-muted transition-colors relative overflow-hidden"
              title={t.settings.appearance.customColour}
              style={{ background: `conic-gradient(red, orange, yellow, lime, cyan, blue, magenta, red)` }}
            >
              <input
                type="color"
                value={rgbTripleToHex(effectiveAccent)}
                onChange={(e) => setAccentOverride(hexToRgbTriple(e.target.value))}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </label>
          </div>
        </section>

        {/* Editor colours */}
        <section>
          <SectionTitle
            action={
              editorColorsOverridden && (
                <button
                  onClick={resetEditorColors}
                  className={`flex flex-shrink-0 items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-mono ${settingsButtonClass}`}
                >
                  <RotateCcw size={9} /> {t.settings.appearance.themeDefault}
                </button>
              )
            }
          >
            {t.settings.appearance.editorColors}
          </SectionTitle>
          {/* Six rows: smaller swatches than the accent row so the section keeps the
              panel's density (the label column absorbs the longer i18n labels). */}
          <div className="space-y-1.5">
            {EDITOR_COLOR_ROWS.map((row) => {
              const color = editorColor(row.key)
              return (
                <div key={row.key} className="flex items-center gap-2">
                  <span
                    className="w-[86px] flex-shrink-0 flex items-center overflow-hidden"
                    title={row.key === 'codeAccent' ? t.settings.appearance.colorCodeAccentHint : editorColorLabels[row.key]}
                  >
                    {renderColorSample(row, color)}
                  </span>
                  <div className="flex flex-wrap items-center gap-1">
                    {renderTextSwatch('sm', editorColorFollowsText(row.key), () => setEditorColor(row.key, THEME_TEXT_COLOR))}
                    {ACCENT_PRESETS.map((rgb) => {
                      const selected = !editorColorFollowsText(row.key) && color.trim() === rgb
                      return (
                        <button
                          key={rgb}
                          onClick={() => setEditorColor(row.key, rgb)}
                          className="w-4 h-4 rounded-full flex items-center justify-center transition-transform hover:scale-110"
                          style={{
                            background: `rgb(${rgb})`,
                            boxShadow: selected ? '0 0 0 2px rgb(var(--bg-1)), 0 0 0 3px rgb(var(--text) / 0.6)' : undefined,
                          }}
                          title={`rgb(${rgb})`}
                        >
                          {selected && <Check size={9} className="text-white drop-shadow" />}
                        </button>
                      )
                    })}
                    {/* Custom colour picker */}
                    <label
                      className="w-4 h-4 rounded-full border border-dashed border-text-muted/50 flex items-center justify-center cursor-pointer hover:border-text-muted transition-colors relative overflow-hidden"
                      title={t.settings.appearance.customColour}
                      style={{ background: `conic-gradient(red, orange, yellow, lime, cyan, blue, magenta, red)` }}
                    >
                      <input
                        type="color"
                        value={rgbTripleToHex(color)}
                        onChange={(e) => setEditorColor(row.key, hexToRgbTriple(e.target.value))}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                    </label>
                    {editorColors[row.key] !== null && (
                      <button
                        onClick={() => setEditorColor(row.key, null)}
                        className="text-text-muted hover:text-text transition-colors"
                        title={t.settings.appearance.resetToThemeDefault}
                      >
                        <RotateCcw size={11} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Text size */}
        <section>
          <SectionTitle>{t.settings.appearance.textSize}</SectionTitle>
          <div className="flex items-center gap-2">
            <button
              onClick={() => changeUiScale(-1)}
              disabled={atMinScale}
              className={`w-8 h-8 flex items-center justify-center rounded-lg ${settingsButtonClass}`}
              title={t.settings.appearance.smaller}
            >
              <Minus size={14} />
            </button>
            <div className="min-w-[56px] text-center text-xs font-mono text-text tabular-nums">{scalePct}%</div>
            <button
              onClick={() => changeUiScale(1)}
              disabled={atMaxScale}
              className={`w-8 h-8 flex items-center justify-center rounded-lg ${settingsButtonClass}`}
              title={t.settings.appearance.larger}
            >
              <Plus size={14} />
            </button>
          </div>
        </section>

        {/* Sections of the sidebar note rows (per device) */}
        <section>
          <SectionTitle>{t.settings.appearance.sidebarSections}</SectionTitle>
          <div className="grid grid-cols-2 gap-1.5">
            {([
              { value: 'map', label: t.settings.appearance.sidebarSectionsMap, desc: t.settings.appearance.sidebarSectionsMapDesc },
              { value: 'row', label: t.settings.appearance.sidebarSectionsRow, desc: t.settings.appearance.sidebarSectionsRowDesc },
            ] as const).map((opt) => {
              const selected = sidebarSectionsStyle === opt.value
              return (
                <button
                  key={opt.value}
                  onClick={() => setSidebarSectionsStyle(opt.value)}
                  aria-pressed={selected}
                  className={`rounded-md border px-3 py-2 text-left transition-colors ${
                    selected ? 'border-accent bg-accent/[0.08]' : 'border-border hover:bg-surface-2'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-mono ${selected ? 'text-accent' : 'text-text'}`}>{opt.label}</span>
                    {selected && <Check size={12} className="text-accent flex-shrink-0" />}
                  </div>
                  <div className="text-[11px] text-text-muted">{opt.desc}</div>
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-text-muted/80">
            {t.settings.appearance.sidebarSectionsHint}
          </p>
        </section>

        {/* Brain view */}
        <section>
          <SectionTitle>{t.settings.appearance.brainView}</SectionTitle>
          <div className="grid grid-cols-2 gap-1.5">
            {([
              { value: true, label: '3D', desc: t.settings.appearance.immersive },
              { value: false, label: '2D', desc: t.settings.appearance.lightweight },
            ] as const).map((opt) => {
              const selected = prefer3D === opt.value
              return (
                <button
                  key={opt.label}
                  onClick={() => setPrefer3D(opt.value)}
                  className={`rounded-md border px-3 py-2 text-left transition-colors ${
                    selected ? 'border-accent bg-accent/[0.08]' : 'border-border hover:bg-surface-2'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-mono ${selected ? 'text-accent' : 'text-text'}`}>{opt.label}</span>
                    {selected && <Check size={12} className="text-accent flex-shrink-0" />}
                  </div>
                  <div className="text-[11px] text-text-muted">{opt.desc}</div>
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-text-muted/80">
            {t.settings.appearance.brainViewHint}
          </p>
        </section>
      </div>

      {/* ── Live preview ─────────────────────────────────────────────────── */}
      <div className="w-[280px] flex-shrink-0 border-l border-border pl-4 flex flex-col">
        <SectionTitle>{t.settings.appearance.preview}</SectionTitle>
        <div className="rounded-lg border border-border overflow-hidden bg-surface-0 shadow-inner">
          {/* fake titlebar */}
          <div className="flex items-center gap-1.5 px-2 py-1.5 bg-surface-2 border-b border-border">
            <span className="w-2 h-2 rounded-full bg-red/70" />
            <span className="w-2 h-2 rounded-full bg-accent-3/70" />
            <span className="w-2 h-2 rounded-full bg-accent-2/70" />
            <span className="ml-auto text-[8px] px-1.5 py-0.5 rounded border border-accent/60 bg-accent/[0.15] text-accent font-mono">
              brain
            </span>
          </div>
          {/* body */}
          <div className="flex h-[176px]">
            {/* sidebar */}
            <div className="w-[42%] bg-surface-1 border-r border-border p-1.5 space-y-1">
              <div className="h-4 rounded bg-surface-2 border border-border" />
              <div className="px-1.5 py-1 rounded bg-text/[0.1] border border-text/15 text-text text-[8px] font-mono truncate">
                {t.settings.appearance.previewActiveNote}
              </div>
              <div className="px-1.5 py-1 text-text/70 text-[8px] font-mono truncate">{t.settings.appearance.previewAnotherNote}</div>
              <div className="px-1.5 py-1 text-text/70 text-[8px] font-mono truncate">{t.settings.appearance.previewThirdNote}</div>
            </div>
            {/* editor */}
            <div className="flex-1 p-2 space-y-1.5 bg-surface-0 overflow-hidden">
              <div className="font-bold text-[12px] font-mono leading-none" style={{ color: `rgb(${editorColor('h1')})` }}>{t.settings.appearance.previewHeading}</div>
              <div className="text-[10px] font-mono leading-none" style={{ color: `rgb(${editorColor('h2')})` }}>{t.settings.appearance.previewSubheading}</div>
              <div className="text-text/80 text-[8px] font-mono leading-relaxed">
                {t.settings.appearance.previewParagraph}{' '}
                <em className="italic" style={{ color: `rgb(${editorColor('italic')})` }}>
                  {t.settings.appearance.previewItalic}
                </em>
              </div>
              <div
                className="border-l-[3px] pl-1.5 text-[8px] font-mono leading-relaxed text-text-muted truncate"
                style={{ borderColor: `rgb(${editorColor('codeAccent')})` }}
              >
                {t.settings.appearance.previewQuote}
              </div>
              <span
                className="inline-block text-[8px] font-mono bg-surface-0 border border-border rounded px-1"
                style={{ color: `rgb(${editorColor('inlineCode')})` }}
              >
                {t.settings.appearance.previewInlineCode}
              </span>
            </div>
          </div>
        </div>

        {/* current selection summary */}
        <div className="text-[11px] font-mono text-text-muted space-y-1 pt-3 mt-auto">
          <div className="flex justify-between gap-2">
            <span className="text-text-muted/60">{t.settings.appearance.theme}</span>
            <span className="text-text truncate">{theme.label}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-text-muted/60">{t.settings.appearance.font}</span>
            <span className="text-text truncate">
              {APP_FONTS[effectiveFontId]?.label}
              {fontOverride === null && <span className="text-text-muted/50"> · {t.settings.appearance.summaryTheme}</span>}
            </span>
          </div>
          <div className="flex justify-between gap-2 items-center">
            <span className="text-text-muted/60">{t.settings.appearance.accent}</span>
            <span className="flex items-center gap-1.5 text-text">
              <span className="w-3 h-3 rounded-full border border-border" style={{ background: `rgb(${effectiveAccent})` }} />
              {accentOverride === null
                ? <span className="text-text-muted/50">{t.settings.appearance.summaryTheme}</span>
                : accentOverride === THEME_TEXT_COLOR ? t.settings.appearance.summaryText : t.settings.appearance.summaryCustom}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
