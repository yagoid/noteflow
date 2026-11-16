import { useEffect, useState, type ReactNode } from 'react'
import { ArrowLeft, Check, Cloud, Github, HardDrive, Loader } from 'lucide-react'
import type { AccountStatus } from '../../types'
import { useT } from '../../i18n/useT'
import { CloudPanel } from './CloudPanel'
import { GitHubOverview, GitHubSetup } from './GitHubSync'
import { PlanTag } from './PlanOffers'
import { useOfferTag } from './planOffersShared'
import type { SettingsIntent } from './SettingsModal'
import { LocalCopies } from './SyncOriginNotices'
import { settingsButtonClass } from './ui'

type Backend = 'cloud' | 'github'
// 'overview' = the backend in use (Cloud when enabled — it takes priority —,
// else GitHub); 'cloud' / 'github' = that backend's detail (plan / setup);
// 'choose' = the first-run chooser.
type View = 'overview' | Backend | 'choose'

// The Sync page: ONE backend — NoteFlow Cloud (encrypted, paid) or GitHub Sync
// (free). The two are mutually exclusive: Cloud takes priority in
// electron/syncProvider.ts and pauses GitHub while enabled.
// - Nothing in use yet → a chooser: both options side by side at the same level
//   (value first, the price only as a tag; nothing preselected), and from it the
//   detail of the one picked, with a link back.
// - A backend in use → its overview (SyncOverview, via CloudPanel or
//   GitHubOverview): status card + map, its data list, the other provider as a
//   row ("Other providers") and the turn-off action in the footer. The other
//   backend's detail opens from that row, with a link back — including GitHub's
//   while Cloud is on and GitHub was never connected: then GitHubSetup is only
//   informative (no connect) until Cloud is turned off.
// - A pending origin choice (the notes on this device came from another remote)
//   always belongs to the backend in use, so its notice lives in the overview
//   (SyncOverview). The local copies made by "Use only the notes from …" outlive
//   the connection: the overview lists them as a row, and the chooser and the
//   details show the same access at the bottom (LocalCopies).
export function SyncPanel({ intent }: { intent?: SettingsIntent }) {
  const t = useT()
  const [cloudEnabled, setCloudEnabled] = useState(false)
  const [githubConnected, setGithubConnected] = useState(false)
  const [account, setAccount] = useState<AccountStatus | null>(null)
  // null until both statuses land: the view is resolved once, from what is actually
  // in use. Which backend the overview shows, on the other hand, follows the LIVE
  // state — and a detail whose backend gets connected meanwhile becomes the
  // overview (see `effective` below).
  const [view, setView] = useState<View | null>(null)
  // Settings → Account's "View" on NoteFlow Cloud / the Bundle lands on the Cloud detail.
  const offer = intent?.offer
  const [openCloudDetail] = useState(offer === 'cloud' || offer === 'bundle')

  useEffect(() => {
    Promise.all([window.noteflow.getCloudStatus(), window.noteflow.getSyncStatus()]).then(
      ([cloud, github]) => {
        setCloudEnabled(cloud.enabled)
        setGithubConnected(github.connected)
        setView(cloud.enabled ? 'overview' : openCloudDetail ? 'cloud' : github.connected ? 'overview' : 'choose')
      },
    )
    // Signing out turns Cloud sync off in main (electron/accountTransition.ts),
    // so the Cloud status follows it. The account status feeds the price tag of
    // the chooser.
    const offCloud = window.noteflow.onCloudStatusChanged((s) => setCloudEnabled(s.enabled))
    void window.noteflow.getAccountStatus().then(setAccount)
    const offAccount = window.noteflow.onAccountStatusChanged(setAccount)
    return () => {
      offCloud()
      offAccount()
    }
  }, [openCloudDetail])

  if (view === null) {
    return (
      <div className="flex items-center gap-2 text-text-muted">
        <Loader size={12} className="animate-spin" />
        <span className="text-xs font-mono">{t.common.loading}</span>
      </div>
    )
  }

  const backendInUse = cloudEnabled || githubConnected
  // A detail whose backend is now in use IS the overview (e.g. Cloud enabled
  // from its detail, GitHub connected from its setup); an overview with nothing
  // in use any more (turned off from elsewhere, e.g. signing out) falls back to
  // the chooser.
  const effective: View =
    (view === 'cloud' && cloudEnabled) || (view === 'github' && githubConnected)
      ? 'overview'
      : view === 'overview' && !backendInUse
        ? 'choose'
        : view

  if (effective === 'choose') {
    return <SyncChooser account={account} onPick={setView} />
  }

  // Back from a detail: to the overview if something syncs, else to the chooser.
  const backLink = effective !== 'overview' && (
    <button
      type="button"
      onClick={() => setView(backendInUse ? 'overview' : 'choose')}
      className="self-start flex items-center gap-1.5 text-[11px] font-mono text-text-muted hover:text-text transition-colors"
    >
      <ArrowLeft size={11} />
      {t.settings.sync.backToOptions}
    </button>
  )

  const showCloud = effective === 'cloud' || (effective === 'overview' && cloudEnabled)

  return (
    <div className="min-h-full flex flex-col gap-5">
      {backLink}
      {showCloud ? (
        <CloudPanel
          initialBundle={offer === 'bundle'}
          githubConnected={githubConnected}
          onGithubConnectedChange={setGithubConnected}
          // Turning Cloud off keeps the user on its detail (to turn it back on),
          // with a link back to GitHub's overview if GitHub takes over.
          onTurnOff={() => setView('cloud')}
          onViewGithub={() => setView('github')}
        />
      ) : effective === 'overview' ? (
        <GitHubOverview
          onConnectedChange={(connected) => {
            setGithubConnected(connected)
            // Disconnected: stay on GitHub's setup, as before.
            if (!connected) setView('github')
          }}
          onViewCloud={() => setView('cloud')}
        />
      ) : (
        // Under a live Cloud (opened from its "Other providers" row) it stays
        // informative; Cloud turned off from elsewhere → the normal setup.
        <GitHubSetup cloudEnabled={cloudEnabled} onConnectedChange={setGithubConnected} />
      )}
      {effective !== 'overview' && <LocalCopies />}
    </div>
  )
}

// First-run chooser: NoteFlow Cloud and GitHub Sync as two equal cards — who each
// one is for, three points of value, a discreet price tag and its own button.
function SyncChooser({ account, onPick }: { account: AccountStatus | null; onPick: (view: Backend) => void }) {
  const t = useT()
  const cloudTag = useOfferTag(account, 'cloud')
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="flex items-center gap-2 text-xs font-mono text-text-muted">
          <HardDrive size={12} className="shrink-0" />
          {t.settings.sync.localOnly}
        </p>
        <p className="text-[11px] font-mono text-text-muted/80 leading-relaxed">{t.settings.sync.chooseIntro}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <ChoiceCard
          icon={<Cloud size={13} className="text-text-muted" />}
          title={t.settings.cloud.title}
          tag={cloudTag}
          audience={t.settings.sync.choiceCloud.audience}
          points={t.settings.sync.choiceCloud.points}
          cta={t.settings.sync.choiceCloud.cta}
          onPick={() => onPick('cloud')}
        />
        <ChoiceCard
          icon={<Github size={13} className="text-text-muted" />}
          title={t.settings.sync.githubTitle}
          tag={t.settings.plans.free}
          audience={t.settings.sync.choiceGithub.audience}
          points={t.settings.sync.choiceGithub.points}
          cta={t.settings.sync.choiceGithub.cta}
          onPick={() => onPick('github')}
        />
      </div>
      {/* Returning subscribers: the Cloud detail carries the inline sign-in. */}
      {account?.configured && !account.signedIn && (
        <p className="text-[11px] font-mono text-text-muted/80">
          {t.settings.sync.haveCloud}{' '}
          <button
            type="button"
            onClick={() => onPick('cloud')}
            className="underline underline-offset-2 text-text-muted hover:text-text transition-colors"
          >
            {t.settings.account.signIn}
          </button>
        </p>
      )}
      <LocalCopies />
    </div>
  )
}

function ChoiceCard({
  icon,
  title,
  tag,
  audience,
  points,
  cta,
  onPick,
}: {
  icon: ReactNode
  title: string
  tag: string | null
  audience: string
  points: readonly string[]
  cta: string
  onPick: () => void
}) {
  return (
    <div className="flex flex-col gap-3 p-3.5 rounded-xl border border-solid border-border bg-surface-0">
      <div className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          {icon}
          <span className="text-xs font-mono font-semibold text-text">{title}</span>
          {tag && <PlanTag>{tag}</PlanTag>}
        </div>
        <p className="text-[11px] font-mono text-text-muted leading-relaxed">{audience}</p>
      </div>
      <ul className="space-y-1">
        {points.map((point) => (
          <li key={point} className="flex items-start gap-2 text-[11px] font-mono text-text-muted leading-relaxed">
            <Check size={11} className="mt-[3px] shrink-0 text-accent" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onPick}
        className={`mt-auto self-start px-3 py-1.5 rounded-lg text-xs font-mono ${settingsButtonClass}`}
      >
        {cta}
      </button>
    </div>
  )
}
