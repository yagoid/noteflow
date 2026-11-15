import { useEffect, useState, type ReactNode } from 'react'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  Cloud,
  CreditCard,
  ExternalLink,
  Info,
  Layers,
  Loader,
  Lock,
  LogOut,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  UserCircle,
} from 'lucide-react'
import type { AccountErrorCode, AccountOpResult, AccountStatus } from '../../types'
import {
  SUBSCRIPTION_PRICES,
  activePlan,
  bundleSavings,
  isPlanOffered,
  isPlanUnknown,
  productOffer,
  type SubscriptionProduct,
} from '../../lib/subscriptionPlans'
import { tf } from '../../i18n/format'
import { useT } from '../../i18n/useT'
import { ConfirmModal } from '../ConfirmModal'
import { BundleUpgradeOffer, PlanUnknownNotice } from './PlanOffers'
import { PLAN_NAMES, PRIMARY_BUTTON, isCheckoutConfigured, usePrice } from './planOffersShared'
import type { SettingsNavigate } from './SettingsModal'
import { SignInInline } from './SignInInline'
import { settingsButtonClass } from './ui'

const PRODUCT_ICONS: Record<SubscriptionProduct, typeof Cloud> = { ai: Sparkles, cloud: Cloud, bundle: Layers }

// Settings → Account: the NoteFlow account (Supabase email + OTP) and the plan.
// Leads with "Your plan" — Free (with what it includes, no account needed) or the
// paid one — and only then the optional upgrades, as compact rows that open each
// plan's detail. Someone who already pays sees no price card: the other product is
// a folded "Add … to your plan" row (a Bundle plan change). All session/token
// handling lives in the main process — this panel only ever sees the public
// AccountStatus.
export function AccountPanel({ onNavigate }: { onNavigate?: SettingsNavigate }) {
  const t = useT()
  const [status, setStatus] = useState<AccountStatus | null>(null)
  const [busy, setBusy] = useState(false)
  // The box at the top (refresh, sign out). Sign-in and checkout report inline.
  const [error, setError] = useState<string | null>(null)
  // "Manage subscription": its own spinner (the Edge Function round-trip takes
  // a moment) and a note when the generic store portal had to be opened.
  const [portalBusy, setPortalBusy] = useState(false)
  const [portalNotice, setPortalNotice] = useState<string | null>(null)
  // "Delete account": confirmation modal, its own spinner, its error (reported
  // right under the button) and the "account deleted" notice, which outlives
  // the session — it is shown above the sign-in form afterwards.
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    window.noteflow.getAccountStatus().then(setStatus)
    return window.noteflow.onAccountStatusChanged(setStatus)
  }, [])

  /** Localized reason for a failed account op, falling back to main's English string. */
  function describeError(result: AccountOpResult, fallback: string): string {
    const messages: Record<AccountErrorCode, string> = t.settings.account.errors
    if (result.errorCode && messages[result.errorCode]) return messages[result.errorCode]
    return result.error ?? fallback
  }

  async function handleRefresh() {
    setBusy(true)
    setError(null)
    const result = await window.noteflow.accountRefreshEntitlements()
    setBusy(false)
    // A locked keychain is already explained by its own notice above the plan.
    if (!result.ok && result.errorCode !== 'sessionLocked') {
      setError(describeError(result, t.settings.account.couldNotRefresh))
    }
  }

  async function handleManageSubscription() {
    setPortalBusy(true)
    setError(null)
    setPortalNotice(null)
    const result = await window.noteflow.accountOpenBillingPortal()
    setPortalBusy(false)
    if (!result.ok) setError(describeError(result, t.settings.account.errors.billingPortalUnavailable))
    else if (result.via === 'storePortal') setPortalNotice(t.settings.account.storePortalOpened)
  }

  async function handleSignOut() {
    setBusy(true)
    setError(null)
    setPortalNotice(null)
    setDeleteError(null)
    await window.noteflow.accountSignOut()
    setBusy(false)
  }

  // Server-side deletion (Edge Function delete-account). On success main has
  // already signed out locally and switched NoteFlow Cloud off; local notes are
  // never touched. A failure leaves the session exactly as it was.
  async function handleDeleteAccount() {
    setConfirmDelete(false)
    setDeleting(true)
    setError(null)
    setPortalNotice(null)
    setDeleteError(null)
    setNotice(null)
    const result = await window.noteflow.accountDelete()
    setDeleting(false)
    if (!result.ok) {
      setDeleteError(describeError(result, t.settings.account.couldNotDeleteAccount))
      return
    }
    // Another session took over meanwhile: the deletion happened, but what is
    // on screen is that other account — leave its view alone (a "deleted"
    // notice would sit on top of an account that is still signed in).
    if (result.staleSession) return
    setNotice(result.accountGone ? t.settings.account.accountGone : t.settings.account.accountDeleted)
  }

  // ── Initial status fetch ──
  if (!status) {
    return (
      <div className="flex items-center gap-2 text-text-muted">
        <Loader size={12} className="animate-spin" />
        <span className="text-xs font-mono">{t.common.loading}</span>
      </div>
    )
  }

  // ── Not configured (no Supabase project in this build) ──
  if (!status.configured) {
    return (
      <p className="text-[11px] font-mono text-text-muted leading-relaxed">
        {t.settings.account.notAvailable}
      </p>
    )
  }

  // Unknown (never fetched) is its own state — neither Free nor a paid plan, and
  // no offer at all (it may already be paid for).
  const unknown = isPlanUnknown(status)
  const plan = activePlan(status)
  const single = plan === 'ai' || plan === 'cloud' ? plan : null
  const free = !unknown && plan === null

  // Manage subscription — only with a Lemon Squeezy subscription (any status:
  // past_due needs the card, canceled/expired keep invoices); never for comps
  // (provider 'manual') nor while the plan is unknown. Opens the customer portal;
  // main falls back to the store's generic portal when the user's own link can't
  // be fetched.
  const manageBlock = status.hasBillingSubscription && (
    <div className="space-y-1.5 pt-1">
      <button
        onClick={handleManageSubscription}
        disabled={busy || portalBusy || deleting}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono ${settingsButtonClass}`}
      >
        {portalBusy ? <Loader size={11} className="animate-spin" /> : <CreditCard size={11} />}
        {t.settings.account.manageSubscription}
      </button>
      <p className="text-[11px] font-mono text-text-muted/60 leading-relaxed">
        {t.settings.account.manageSubscriptionHint}
      </p>
      {portalNotice && (
        <p role="status" className="flex items-start gap-1.5 text-[11px] font-mono text-text-muted leading-relaxed">
          <Info size={12} className="shrink-0 mt-[1px]" />
          <span>{portalNotice}</span>
        </p>
      )}
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Error box — refresh, portal, sign out. */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 px-3 py-2 bg-red/10 border border-red/30 rounded text-xs font-mono text-red leading-relaxed"
        >
          <AlertCircle size={13} className="shrink-0 mt-[1px]" />
          <span>{error}</span>
        </div>
      )}

      {/* Account deleted — stays above the sign-in form once the session is gone. */}
      {notice && (
        <div
          role="status"
          className="flex items-start gap-2 px-3 py-2 bg-green-500/10 border border-green-500/30 rounded text-xs font-mono text-green-400 leading-relaxed"
        >
          <CheckCircle2 size={13} className="shrink-0 mt-[1px]" />
          <span>{notice}</span>
        </div>
      )}

      {status.signedIn && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <UserCircle size={13} className="text-green-400" />
            <span className="text-xs font-mono text-text">{status.email}</span>
          </div>
          {/* Keychain locked: the session is still there (NOT signed out) but its
              token can't be decrypted right now. Main retries on its own; Refresh
              forces it, Sign out (below) is the way out if it never unlocks. */}
          {status.sessionLocked && (
            <div
              role="status"
              className="flex items-start gap-2 px-3 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded text-xs font-mono text-yellow-400 leading-relaxed"
            >
              <Lock size={13} className="shrink-0 mt-[1px]" />
              <span>{t.settings.account.sessionLocked}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Your plan ── */}
      <div className="space-y-2.5 rounded-lg border border-solid border-border bg-surface-0 px-3.5 py-3">
        {unknown ? (
          <>
            <p className="text-xs font-mono font-semibold text-text">{t.settings.plans.yourPlanTitle}</p>
            <PlanUnknownNotice />
          </>
        ) : plan ? (
          <>
            <PlanHeading
              title={tf(t.settings.plans.yourPlan, { plan: PLAN_NAMES[plan] })}
              badge={t.settings.account.active}
              badgeClassName="text-green-400 bg-green-500/10 border-green-500/30"
            />
            {manageBlock}
          </>
        ) : (
          <>
            <PlanHeading
              title={tf(t.settings.plans.yourPlan, { plan: t.settings.plans.free })}
              badge={t.settings.plans.currentPlan}
              badgeClassName="text-accent border-accent/40"
            />
            <ul className="space-y-1">
              {t.settings.plans.freeIncludes.map((item) => (
                <li key={item} className="flex items-start gap-2 text-[11px] font-mono text-text-muted leading-relaxed">
                  <Check size={11} className="mt-[3px] shrink-0 text-accent" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            {!status.signedIn && (
              <p className="text-[11px] font-mono text-text-muted/70">{t.settings.plans.noAccountNeeded}</p>
            )}
            {manageBlock}
          </>
        )}
      </div>

      {/* ── One plan already paid: the other product, folded ── */}
      {single && <AddOnRow account={status} current={single} />}

      {/* ── Free: the optional upgrades as compact rows — each opens its detail ── */}
      {free && (
        <div className="space-y-2">
          <p className="text-[11px] font-mono font-semibold text-text-muted">{t.settings.plans.optionalUpgrades}</p>
          {(['cloud', 'ai', 'bundle'] as const)
            .filter((product) => isPlanOffered(status, product))
            .map((product) => (
              <UpgradeRow
                key={product}
                product={product}
                onView={
                  onNavigate
                    ? () => onNavigate(product === 'ai' ? 'ai' : 'sync', { offer: product })
                    : undefined
                }
              />
            ))}
        </div>
      )}

      {status.signedIn ? (
        <>
          {status.entitlementsFetchedAt && (
            <p className="text-[11px] font-mono text-text-muted/60">
              {tf(t.settings.account.lastChecked, { time: new Date(status.entitlementsFetchedAt).toLocaleString() })}
            </p>
          )}

          <div className="flex gap-2">
            {/* Plan still unknown: the PlanUnknownNotice in "Your plan" already offers Retry. */}
            {!unknown && (
              <button
                onClick={handleRefresh}
                disabled={busy || deleting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono settings-btn bg-surface-2 hover:bg-surface-3 text-text transition-colors disabled:opacity-40"
              >
                {busy ? <Loader size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                {t.settings.account.refresh}
              </button>
            )}
            <button
              onClick={handleSignOut}
              disabled={busy || deleting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono text-text-muted hover:text-red hover:bg-red/10 transition-colors disabled:opacity-40"
            >
              <LogOut size={11} />
              {t.settings.account.signOut}
            </button>
          </div>

          {/* Delete account — permanent and server-side (account, Cloud data,
              subscription), behind a confirmation. Local notes stay on this
              computer. Errors are reported right under the button. */}
          <div className="pt-3 border-t border-border space-y-1.5">
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={busy || portalBusy || deleting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono text-red border border-red/30 hover:bg-red/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {deleting ? <Loader size={11} className="animate-spin" /> : <Trash2 size={11} />}
              {deleting ? t.settings.account.deletingAccount : t.settings.account.deleteAccount}
            </button>
            {deleteError && (
              <p role="alert" className="flex items-start gap-1.5 text-[11px] font-mono text-red leading-relaxed">
                <AlertCircle size={12} className="shrink-0 mt-[1px]" />
                <span>{deleteError}</span>
              </p>
            )}
            <p className="text-[11px] font-mono text-text-muted/60 leading-relaxed">
              {t.settings.account.deleteAccountHint}
            </p>
          </div>

          {confirmDelete && (
            <ConfirmModal
              title={t.settings.account.deleteAccountConfirmTitle}
              message={t.settings.account.deleteAccountConfirm}
              confirmLabel={t.settings.account.deleteAccountConfirmAction}
              cancelLabel={t.common.cancel}
              danger
              confirmOnEnter={false}
              onConfirm={() => void handleDeleteAccount()}
              onCancel={() => setConfirmDelete(false)}
            />
          )}
        </>
      ) : (
        // ── Signed out: the way in for whoever already pays ──
        <div className="pt-4 border-t border-border space-y-2.5">
          <div className="space-y-0.5">
            <p className="text-xs font-mono font-semibold text-text">{t.settings.plans.alreadySubscribed}</p>
            <p className="text-[11px] font-mono text-text-muted leading-relaxed">{t.settings.plans.signInHint}</p>
          </div>
          <SignInInline onStart={() => setNotice(null)} />
        </div>
      )}
    </div>
  )
}

function PlanHeading({ title, badge, badgeClassName }: { title: string; badge: string; badgeClassName: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs font-mono font-semibold text-text">{title}</span>
      <span className={`text-[11px] font-mono border border-solid rounded px-2 py-0.5 ${badgeClassName}`}>{badge}</span>
    </div>
  )
}

/** Compact row of an optional upgrade: name, one line of value, a small price and "View". */
function UpgradeRow({ product, onView }: { product: SubscriptionProduct; onView?: () => void }) {
  const t = useT()
  const price = usePrice()
  const Icon = PRODUCT_ICONS[product]
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-solid border-border bg-surface-0">
      <Icon size={12} className="shrink-0 text-text-muted" />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-xs font-mono font-semibold text-text">{PLAN_NAMES[product]}</span>
          <span className="text-[11px] font-mono text-text-muted">{t.settings.plans.rowDesc[product]}</span>
        </div>
        {product === 'bundle' && (
          <p className="text-[11px] font-mono text-text-muted/70">
            {tf(t.settings.plans.bundleSaves, { price: price(bundleSavings('monthly')) })}
          </p>
        )}
      </div>
      <span className="shrink-0 text-[11px] font-mono text-text-muted whitespace-nowrap">
        {tf(t.settings.plans.perMonth, { price: price(SUBSCRIPTION_PRICES[product].monthly) })}
      </span>
      {onView && (
        <button
          type="button"
          onClick={onView}
          className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-mono ${settingsButtonClass}`}
        >
          {t.settings.plans.view}
        </button>
      )}
    </div>
  )
}

/**
 * One product already paid: the other one as a folded "Add … to your plan" row —
 * no price in sight until the user opens it. Opened, it is the Bundle plan change
 * (productOffer 'upgrade'; the only offer then, never the product on its own) or,
 * when that subscription can't be changed (a comp…), the product as its own
 * subscription — never a Bundle checkout, which would bill the owned one twice.
 */
function AddOnRow({ account, current }: { account: AccountStatus; current: 'ai' | 'cloud' }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const added = current === 'ai' ? 'cloud' : 'ai'
  const offer = productOffer(account, added)
  if (offer !== 'upgrade' && offer !== 'checkout') return null

  let body: ReactNode
  if (offer === 'upgrade') {
    body = <BundleUpgradeOffer account={account} current={current} onDismiss={() => setOpen(false)} />
  } else {
    body = <StandaloneAddOn account={account} product={added} onDismiss={() => setOpen(false)} />
  }

  return (
    <div className="rounded-lg border border-solid border-border bg-surface-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="flex items-center gap-2 text-xs font-mono text-text">
          <Plus size={12} className="shrink-0 text-text-muted" />
          {tf(t.settings.plans.addProduct, { plan: PLAN_NAMES[added] })}
        </span>
        <ChevronDown
          size={13}
          className={`shrink-0 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="px-3 pb-3 pt-1">{body}</div>}
    </div>
  )
}

/** The product as its own subscription (single plan that can't be switched to the Bundle). */
function StandaloneAddOn({
  account,
  product,
  onDismiss,
}: {
  account: AccountStatus
  product: 'ai' | 'cloud'
  onDismiss: () => void
}) {
  const t = useT()
  const price = usePrice()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [opened, setOpened] = useState(false)

  async function openCheckout() {
    setBusy(true)
    setError(null)
    try {
      const result = await window.noteflow.accountOpenCheckout(product)
      if (result.ok) setOpened(true)
      else {
        setError(
          (result.errorCode && t.settings.account.errors[result.errorCode]) ||
            result.error ||
            t.settings.account.couldNotOpenCheckout,
        )
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-mono text-text leading-relaxed">{t.settings.plans.addValue[product]}</p>
      <p className="text-[11px] font-mono text-text-muted leading-relaxed">
        {tf(t.settings.plans.perMonth, { price: price(SUBSCRIPTION_PRICES[product].monthly) })} ·{' '}
        {tf(t.settings.plans.perYear, { price: price(SUBSCRIPTION_PRICES[product].yearly) })} ·{' '}
        {t.settings.plans.standaloneNote}
      </p>
      {error && (
        <p role="alert" className="flex items-start gap-1.5 text-[11px] font-mono text-red leading-relaxed">
          <AlertCircle size={12} className="shrink-0 mt-[1px]" />
          <span>{error}</span>
        </p>
      )}
      {opened && (
        <p role="status" className="text-[11px] font-mono text-text-muted leading-relaxed">{t.settings.plans.checkoutOpened}</p>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        {isCheckoutConfigured(account, product) ? (
          <button type="button" onClick={openCheckout} disabled={busy} className={PRIMARY_BUTTON}>
            {busy ? <Loader size={11} className="animate-spin" /> : <ExternalLink size={11} />}
            {t.settings.plans.continueToPayment}
          </button>
        ) : (
          <span className="text-[11px] font-mono text-text-muted/60">{t.settings.account.comingSoon}</span>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className="px-3 py-1.5 rounded-lg text-xs font-mono text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
        >
          {t.settings.plans.notNow}
        </button>
      </div>
      <p className="text-[10px] font-mono text-text-muted/60 leading-relaxed">{t.settings.plans.paymentNote}</p>
    </div>
  )
}
