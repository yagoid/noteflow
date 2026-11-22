import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, Minus, X } from 'lucide-react'
import { useLanguageStore } from '../stores/languageStore'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Top-level error boundary. A render exception anywhere below it would otherwise
 * unmount the whole tree and leave a completely blank, unusable window — and since
 * both windows are frameless (frame: false), a blank window has no title bar to
 * move or close it. So the fallback ships its own draggable bar + minimize/close
 * controls (mirroring the sticky StickyTitleBar) plus a Reload action.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    // Class component (error boundaries must be classes) can't use the useT()
    // hook, so read the current dictionary imperatively at render time.
    const t = useLanguageStore.getState().dict.titleBar

    return (
      <div className="flex flex-col h-screen bg-surface-0 text-text overflow-hidden">
        {/* Draggable custom title bar with window controls (frameless window). */}
        <div
          className="h-8 bg-surface-0 border-b border-border/40 flex items-center justify-end px-2 cursor-default select-none flex-shrink-0"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <button
              className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
              onClick={() => window.noteflow?.minimize()}
              title={t.minimize}
            >
              <Minus size={12} />
            </button>
            <button
              className="p-1 rounded text-text-muted hover:text-red hover:bg-red/10 transition-colors"
              onClick={() => window.noteflow?.close()}
              title={t.closeShort}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 overflow-hidden">
          <AlertTriangle size={28} className="text-red flex-shrink-0" />
          <div className="text-sm font-mono text-text font-semibold">{t.errorTitle}</div>
          <p className="text-xs font-mono text-text-muted text-center max-w-md">
            {t.errorBody}
          </p>
          {error.message && (
            <pre className="text-[11px] font-mono text-red bg-surface-2 border border-border rounded px-3 py-2 max-w-md max-h-40 overflow-auto whitespace-pre-wrap break-words">
              {error.message}
            </pre>
          )}
          <button
            onClick={() => window.location.reload()}
            className="px-3 py-1.5 text-xs font-mono bg-text text-surface-0 rounded hover:opacity-90 transition-opacity"
          >
            {t.reload}
          </button>
        </div>
      </div>
    )
  }
}
