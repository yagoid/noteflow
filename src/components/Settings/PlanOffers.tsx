import { useState, type ReactNode } from 'react'
import { AlertCircle, Check, ExternalLink, HelpCircle, Loader, RefreshCw, Sparkles } from 'lucide-react'
import type { AccountStatus } from '../../types'
import {
  SUBSCRIPTION_PRICES,
  bundleUpgradeDifference,
  hasKnownEntitlement,
  isBundleUpgradeOffered,
  isPlanOffered,
  productOffer,
  yearlySavingsPercent,
  type SubscriptionProduct,
} from '../../lib/subscriptionPlans'
import { useT } from '../../i18n/useT'
import { tf } from '../../i18n/format'
import { PlanCardBackdrop } from './PlanCardBackdrop'
import { SignInInline } from './SignInInline'
import { PLAN_NAMES, PRIMARY_BUTTON, isCheckoutConfigured, usePrice } from './planOffersShared'

// How the paid plans are offered, shared by every surface that can end in a
// purchase — Settings → Account, Settings → Sync → NoteFlow Cloud, Settings → AI and
// the brain's AI panel (LlmConfigView) — so prices, visibility rules and copy can't
// drift between them. Product principle: value first, ONE price after it, the free
// routes at the same level, and never a price in front of someone who already pays
// unless they asked (see .agents/context/monetization.md § "Bloque de planes").
// Visibility rules: src/lib/subscriptionPlans.ts (productOffer & co.); shared
// non-component helpers (names, price formatting, tags): ./planOffersShared.ts.

const otherProduct = (product: 'ai' | 'cloud'): 'ai' | 'cloud' => (product === 'ai' ? 'cloud' : 'ai')

// Discreet inline link (Bundle line…).
const LINK_BUTTON = 'underline underline-offset-2 text-text-muted hover:text-text transition-colors'

/** The tag itself (also used for "Free"). */
export function PlanTag({ children }: { children: ReactNode }) {
  return (
    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md border border-solid border-border text-text-muted whitespace-nowrap normal-case">
      {children}
    </span>
  )
}

/**
 * Neutral state for a signed-in account whose plan was never fetched (offline
 * boot, keychain locked…): instead of an offer or a "not subscribed" gate, say we
 * couldn't check yet and offer a Retry. Main also retries on its own (backoff,
 * resume, back online) and the status broadcast replaces this block as soon as the
 * plan is known.
 */
export function PlanUnknownNotice() {
  const t = useT()
  const [checking, setChecking] = useState(false)

  async function retry() {
    setChecking(true)
    try {
      await window.noteflow.accountRefreshEntitlements()
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-text-muted normal-case leading-relaxed">
      {checking ? <Loader size={12} className="animate-spin shrink-0" /> : <HelpCircle size={12} className="shrink-0" />}
      <span>{checking ? t.settings.account.planChecking : t.settings.account.planUnknown}</span>
      {!checking && (
        <button
          type="button"
          onClick={retry}
          className="inline-flex items-center gap-1 text-text-muted hover:text-text underline underline-offset-2 transition-colors"
        >
          <RefreshCw size={10} />
          {t.settings.account.planRetry}
        </button>
      )}
    </div>
  )
}

/**
 * Adding the missing product to a single AI / Cloud subscription = switching it to
 * the Bundle: a PLAN CHANGE of that subscription (prorated, via
 * accountUpgradeToBundle), never a second checkout, which would bill the owned
 * product twice. Shows the value, the difference (the current billing period is not
 * known to the client, so both the monthly and the yearly one) and then the
 * in-app confirmation: there is no checkout page to review the charge.
 */
export function BundleUpgradeOffer({
  account,
  current,
  onDismiss,
}: {
  account: AccountStatus
  /** The single product the account already pays for. */
  current: 'ai' | 'cloud'
  /** "Not now" (folds the offer back). Omit to hide the button. */
  onDismiss?: () => void
}) {
  const t = useT()
  const price = usePrice()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (done) {
    return (
      <p role="status" className="flex items-start gap-1.5 text-[11px] font-mono text-text-muted leading-relaxed normal-case">
        <Check size={12} className="shrink-0 mt-[1px] text-accent" />
        <span>{t.settings.account.upgradeRequested}</span>
      </p>
    )
  }
  // Defensive: only ever reachable as a plan change of an upgradable subscription.
  if (!isBundleUpgradeOffered(account)) return null

  const added = otherProduct(current)

  async function confirmUpgrade() {
    setBusy(true)
    setError(null)
    try {
      const result = await window.noteflow.accountUpgradeToBundle()
      if (result.ok) {
        setDone(true)
        setConfirming(false)
      } else {
        setError((result.errorCode && t.settings.account.errors[result.errorCode]) || t.settings.account.couldNotUpgrade)
      }
    } catch {
      // The IPC invoke itself rejected (handler threw / bridge error).
      setError(t.settings.account.couldNotUpgrade)
    } finally {
      setBusy(false)
    }
  }

  // Confirmation: the plan change charges the card on file right away with no
  // checkout page in between, so the proration is spelled out here and nothing
  // happens until "Confirm upgrade".
  if (confirming) {
    return (
      <div className="space-y-2 normal-case">
        <p className="text-xs font-mono font-semibold text-text">{t.settings.account.upgradeConfirmTitle}</p>
        <p className="text-[11px] font-mono text-text-muted leading-relaxed">
          {tf(t.settings.account.upgradeConfirmBody, { plan: PLAN_NAMES[current] })}
        </p>
        <p className="text-[11px] font-mono text-text-muted leading-relaxed">
          {tf(t.settings.account.upgradeProration, {
            monthly: price(SUBSCRIPTION_PRICES.bundle.monthly),
            yearly: price(SUBSCRIPTION_PRICES.bundle.yearly),
          })}
        </p>
        {error && (
          <p role="alert" className="flex items-start gap-1.5 text-[11px] font-mono text-red leading-relaxed">
            <AlertCircle size={12} className="shrink-0 mt-[1px]" />
            <span>{error}</span>
          </p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" onClick={confirmUpgrade} disabled={busy} className={PRIMARY_BUTTON}>
            {busy ? <Loader size={11} className="animate-spin" /> : <Sparkles size={11} />}
            {t.settings.account.upgradeConfirm}
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirming(false)
              setError(null)
            }}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg text-xs font-mono text-text-muted hover:text-text hover:bg-surface-2 transition-colors disabled:opacity-40"
          >
            {t.common.cancel}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2 normal-case">
      <p className="text-[11px] font-mono text-text leading-relaxed">{t.settings.plans.addValue[added]}</p>
      <p className="text-[11px] font-mono text-text-muted leading-relaxed">{t.settings.plans.becomesBundle}</p>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pt-0.5">
        <span className="text-lg font-mono font-semibold text-text tracking-tight leading-none">
          {tf(t.settings.plans.upgradeDifference, { price: price(bundleUpgradeDifference(current, 'monthly')) })}
        </span>
        <span className="text-[11px] font-mono text-text-muted/70">
          {tf(t.settings.plans.upgradeDifferenceYearly, { price: price(bundleUpgradeDifference(current, 'yearly')) })}
        </span>
      </div>
      <p className="text-[11px] font-mono text-text-muted/70 leading-relaxed">
        {tf(t.settings.plans.upgradeTotal, {
          monthly: price(SUBSCRIPTION_PRICES.bundle.monthly),
          yearly: price(SUBSCRIPTION_PRICES.bundle.yearly),
        })}
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={() => {
            setError(null)
            setConfirming(true)
          }}
          className={PRIMARY_BUTTON}
        >
          <Sparkles size={11} />
          {t.settings.plans.switchToBundle}
        </button>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="px-3 py-1.5 rounded-lg text-xs font-mono text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
          >
            {t.settings.plans.notNow}
          </button>
        )}
      </div>
    </div>
  )
}

function BenefitList({ items, muted }: { items: readonly string[]; muted?: string }) {
  return (
    <ul className="space-y-1">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2 text-[11px] font-mono text-text-muted leading-relaxed">
          <Check size={11} className="mt-[3px] shrink-0 text-accent" />
          <span>{item}</span>
        </li>
      ))}
      {muted && (
        <li className="flex items-start gap-2 text-[11px] font-mono text-text-muted/70 leading-relaxed">
          <Check size={11} className="mt-[3px] shrink-0 text-text-muted/60" />
          <span>{muted}</span>
        </li>
      )}
    </ul>
  )
}

/**
 * Detail of a paid plan (NoteFlow Cloud in Settings → Sync, NoteFlow AI in Settings →
 * AI / the brain panel): what it includes first, then ONE plan box — the monthly
 * price with the yearly one (and its saving) under it, the inline sign-in (no trip to
 * another section) or the checkout button — and the Bundle as a discreet line, never
 * as a hero card. No in-app period switch: the Lemon Squeezy checkout has its own
 * Monthly / Yearly selector and the app can't preselect it, so the box says so.
 * For an account that owns the OTHER product on an upgradable subscription, the box
 * is the Bundle plan change instead (productOffer 'upgrade'). The two columns grow from
 * a flex-basis (not a min-width): where the surface is narrow (brain panel, resizable down
 * to 25% of the window) they wrap into one column and can still shrink to fit, with no
 * overflow, without depending on the viewport.
 */
export function PlanDetail({
  product,
  account,
  bundle: bundleProp,
  onBundleChange,
}: {
  product: 'ai' | 'cloud'
  account: AccountStatus
  /** Bundle chosen in the box. Controlled when set (the choice survives a remount, e.g. signing in). */
  bundle?: boolean
  onBundleChange?: (bundle: boolean) => void
}) {
  const t = useT()
  const price = usePrice()
  const [bundleState, setBundleState] = useState(false)
  const [busy, setBusy] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [checkoutOpened, setCheckoutOpened] = useState(false)

  const offer = productOffer(account, product)
  const bundleOffered = isPlanOffered(account, 'bundle')
  const wantsBundle = bundleProp ?? bundleState
  const setBundle = (value: boolean) => {
    if (onBundleChange) onBundleChange(value)
    else setBundleState(value)
    setCheckoutError(null)
    setCheckoutOpened(false)
  }
  const chosen: SubscriptionProduct = wantsBundle && bundleOffered ? 'bundle' : product
  const other = otherProduct(product)

  // Opens the Lemon Squeezy checkout of the chosen product in the browser (main
  // tags it with the user id). One checkout URL per product: the payment page has
  // its own Monthly / Yearly selector (monthly preselected) — see monetization.md
  // § "Precios".
  async function openCheckout() {
    setBusy(true)
    setCheckoutError(null)
    try {
      const result = await window.noteflow.accountOpenCheckout(chosen)
      if (result.ok) setCheckoutOpened(true)
      else {
        setCheckoutError(
          (result.errorCode && t.settings.account.errors[result.errorCode]) ||
            result.error ||
            t.settings.account.couldNotOpenCheckout,
        )
      }
    } finally {
      setBusy(false)
    }
  }

  const prices = SUBSCRIPTION_PRICES[chosen]
  let box: ReactNode
  if (!account.configured) {
    box = <p className="text-[11px] font-mono text-text-muted leading-relaxed">{t.settings.account.notAvailable}</p>
  } else if (offer === 'unknown') {
    // Never an offer on an unknown plan: it may already be paid (double billing).
    box = <PlanUnknownNotice />
  } else if (offer === 'owned') {
    box = (
      <span className="flex items-center gap-1.5 text-xs font-mono text-accent">
        <Check size={12} /> {t.settings.plans.inYourPlan}
      </span>
    )
  } else if (offer === 'upgrade') {
    box = (
      <div className="rounded-lg border border-solid border-border bg-surface-0 px-3.5 py-3">
        <p className="mb-2 text-xs font-mono font-semibold text-text">
          {tf(t.settings.plans.addProduct, { plan: PLAN_NAMES[product] })}
        </p>
        <BundleUpgradeOffer account={account} current={other} />
      </div>
    )
  } else if (offer === 'checkout') {
    const canCheckout = account.signedIn && isCheckoutConfigured(account, chosen)
    box = (
      // `border-solid` is explicit: the global `button { border: none }` reset aside,
      // the backdrop canvas sits under the content.
      <div className="relative overflow-hidden rounded-lg border border-solid border-border bg-surface-0 px-3.5 py-3">
        <PlanCardBackdrop />
        <div className="relative space-y-3">
          <div className="flex flex-col">
            <span className="text-sm font-mono font-semibold text-text">{PLAN_NAMES[chosen]}</span>
            {chosen === 'bundle' && (
              <span className="text-[11px] font-mono text-text-muted/70">{t.settings.plans.bundleSubtitle}</span>
            )}
          </div>

          <div className="space-y-0.5">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-mono font-semibold text-text tracking-tight leading-none">
                {price(prices.monthly)}
              </span>
              <span className="text-[11px] font-mono text-text-muted">{t.settings.plans.monthSuffix}</span>
            </div>
            <p className="text-[11px] font-mono text-text-muted/70">
              {tf(t.settings.plans.yearlyAlternative, {
                price: price(prices.yearly),
                percent: yearlySavingsPercent(chosen),
              })}
            </p>
            {/* Owns the other product on a subscription that can't be switched to the
                Bundle (a comp…): this one is its own subscription — same note as in
                Settings → Account. */}
            {hasKnownEntitlement(account, other) && (
              <p className="text-[11px] font-mono text-text-muted/70">{t.settings.plans.standaloneNote}</p>
            )}
          </div>

          {!account.signedIn ? (
            <div className="space-y-2">
              <p className="text-[11px] font-mono text-text-muted leading-relaxed">{t.settings.plans.signInToSubscribe}</p>
              <SignInInline primary />
            </div>
          ) : canCheckout ? (
            <div className="space-y-1.5">
              <button type="button" onClick={openCheckout} disabled={busy} className={PRIMARY_BUTTON}>
                {busy ? <Loader size={11} className="animate-spin" /> : <ExternalLink size={11} />}
                {t.settings.plans.continueToPayment}
              </button>
              {checkoutError && (
                <p role="alert" className="flex items-start gap-1.5 text-[11px] font-mono text-red leading-relaxed">
                  <AlertCircle size={12} className="shrink-0 mt-[1px]" />
                  <span>{checkoutError}</span>
                </p>
              )}
              {checkoutOpened && (
                <p role="status" className="text-[11px] font-mono text-text-muted leading-relaxed">
                  {t.settings.plans.checkoutOpened}
                </p>
              )}
            </div>
          ) : (
            <p className="text-[11px] font-mono text-text-muted/60">{t.settings.account.comingSoon}</p>
          )}

          <div className="space-y-0.5 text-[10px] font-mono text-text-muted/60 leading-relaxed">
            <p>{t.settings.plans.periodAtCheckout}</p>
            <p>{t.settings.plans.paymentNote}</p>
          </div>
        </div>
      </div>
    )
  } else {
    box = null
  }

  return (
    <div className="flex flex-wrap gap-x-6 gap-y-4 normal-case">
      {/* Value first: what the plan adds over the free route. */}
      <div className="flex-1 basis-[220px] min-w-0 space-y-2">
        <p className="text-[11px] font-mono font-semibold text-text-muted">{t.settings.planBenefits.title}</p>
        <BenefitList items={t.settings.planBenefits[product]} muted={t.settings.planBenefits.keepOnCancel[product]} />
        {chosen === 'bundle' && (
          <div className="space-y-1.5 pt-1">
            <p className="text-[11px] font-mono font-semibold text-text-muted">{PLAN_NAMES[other]}</p>
            <BenefitList items={t.settings.planBenefits[other]} />
          </div>
        )}
      </div>

      <div className="flex-1 basis-[250px] min-w-0 space-y-2.5">
        {box}
        {/* The Bundle as a discreet line (only while it can be a checkout: both
            products missing, or signed out). */}
        {offer === 'checkout' && bundleOffered && (
          <p className="text-[11px] font-mono text-text-muted/80 leading-relaxed">
            {chosen === 'bundle'
              ? tf(t.settings.plans.singleLine, {
                  plan: PLAN_NAMES[product],
                  price: price(SUBSCRIPTION_PRICES[product].monthly),
                })
              : tf(t.settings.plans.bundleLine[product], { price: price(SUBSCRIPTION_PRICES.bundle.monthly) })}{' '}
            <button type="button" onClick={() => setBundle(chosen !== 'bundle')} className={LINK_BUTTON}>
              {chosen === 'bundle'
                ? tf(t.settings.plans.chooseSingle, { plan: PLAN_NAMES[product] })
                : t.settings.plans.chooseBundle}
            </button>
          </p>
        )}
      </div>
    </div>
  )
}
