import { useState } from 'react'
import { AlertCircle, Check, HelpCircle, Loader, RefreshCw, Sparkles } from 'lucide-react'
import type { AccountStatus } from '../../types'
import {
  SUBSCRIPTION_PRICES,
  isBundleUpgradeOffered,
  isPlanOffered,
  isPlanUnknown,
  type SubscriptionProduct,
} from '../../lib/subscriptionPlans'
import { useT } from '../../i18n/useT'
import { tf } from '../../i18n/format'
import { PlanCardBackdrop } from './PlanCardBackdrop'

// The subscription offer block, shared by every gate that can end in a purchase:
// Settings → Account, Settings → AI and the brain panel (LlmConfigView) and
// Settings → Sync → NoteFlow Cloud. One component so the price, the visibility
// rules and the copy can never drift between those four surfaces.

const PLAN_NAMES: Record<SubscriptionProduct, string> = {
  ai: 'NoteFlow AI',
  cloud: 'NoteFlow Cloud',
  bundle: 'NoteFlow Bundle',
}

// Does this build ship a checkout URL for the product? (Set in main; without one
// the card can only say "coming soon".)
function isCheckoutConfigured(account: AccountStatus, product: SubscriptionProduct): boolean {
  if (product === 'ai') return account.aiCheckoutConfigured
  if (product === 'cloud') return account.cloudCheckoutConfigured
  return account.bundleCheckoutConfigured
}

/**
 * Neutral state for a signed-in account whose plan was never fetched (offline
 * boot, keychain locked…): instead of Subscribe cards or a "not subscribed"
 * gate, say we couldn't check yet and offer a Retry. Main also retries on its
 * own (backoff, resume, back online) and the status broadcast replaces this
 * block as soon as the plan is known.
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

export function PlanOffers({
  products,
  account,
  busy = false,
  showSignInHint = true,
  showUnknownNotice = true,
  benefits,
  onSubscribe,
  onGoToAccount,
}: {
  /** Plans to advertise, in the order they should appear (e.g. ['ai', 'bundle']). */
  products: SubscriptionProduct[]
  account: AccountStatus
  busy?: boolean
  /**
   * "Sign in … to subscribe" line shown under the cards without a session. Turn it
   * off in gates that already say it in their own words right above the block
   * (the AI and Cloud ones do). The cards route to Account on their own either way.
   */
  showSignInHint?: boolean
  /**
   * Signed in with the plan still UNKNOWN, the cards are never shown; by default
   * the PlanUnknownNotice takes their place. Turn it off where the surface already
   * reports the unknown state itself (Settings → Account's plan badges).
   */
  showUnknownNotice?: boolean
  /**
   * "What you get" list under the cards: what the managed plan adds over the free
   * self-managed route (own provider / GitHub Sync). Set it on the AI and Cloud
   * gates; omit it in Settings → Subscription, which compares plans, not routes.
   * Living inside this block, it shows exactly when the cards do.
   */
  benefits?: 'ai' | 'cloud'
  /**
   * Signed in, the whole card is the checkout button for its product. Omit where the
   * surface cannot open a checkout — a signed-in card then just shows "coming soon".
   */
  onSubscribe?: (product: SubscriptionProduct) => void
  /** Signed out, the whole card routes here (Settings → Account) to sign in first. */
  onGoToAccount?: () => void
}) {
  const t = useT()
  // Bundle-as-upgrade flow (see isBundleUpgradeOffered): there is no checkout
  // page to review the charge, so the card first opens an in-app confirmation.
  const [confirmingUpgrade, setConfirmingUpgrade] = useState(false)
  const [upgradeBusy, setUpgradeBusy] = useState(false)
  const [upgradeError, setUpgradeError] = useState<string | null>(null)
  const [upgradeDone, setUpgradeDone] = useState(false)

  // No Supabase project in this build: nothing is purchasable, so advertising
  // prices would be a dead end.
  if (!account.configured) return null

  // Plan never fetched: offering a plan the user may already pay for is a
  // double-billing trap — show the neutral notice instead (or nothing).
  if (isPlanUnknown(account)) return showUnknownNotice ? <PlanUnknownNotice /> : null

  // With exactly one of AI / Cloud on a Lemon Squeezy subscription, the Bundle is
  // offered as a PLAN CHANGE of that subscription (prorated) — never as a second
  // checkout, which would bill the owned product twice.
  const upgradeOffered = isBundleUpgradeOffered(account)
  const visible = products.filter(
    (product) => isPlanOffered(account, product) || (product === 'bundle' && upgradeOffered)
  )
  if (visible.length === 0) return null
  const hasCheckoutCard = visible.some((product) => !(product === 'bundle' && upgradeOffered))
  const currentPlanName = account.entitlements.ai ? PLAN_NAMES.ai : PLAN_NAMES.cloud

  async function confirmUpgrade() {
    setUpgradeBusy(true)
    setUpgradeError(null)
    try {
      const result = await window.noteflow.accountUpgradeToBundle()
      if (result.ok) {
        setUpgradeDone(true)
        setConfirmingUpgrade(false)
      } else {
        setUpgradeError(
          (result.errorCode && t.settings.account.errors[result.errorCode]) || t.settings.account.couldNotUpgrade
        )
      }
    } catch {
      // The IPC invoke itself rejected (handler threw / bridge error).
      setUpgradeError(t.settings.account.couldNotUpgrade)
    } finally {
      setUpgradeBusy(false)
    }
  }

  // `normal-case` everywhere: this block also renders inside the brain's AI panel,
  // whose micro-label style would otherwise uppercase the copy.
  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap gap-2.5">
        {visible.map((product) => {
          const isBundle = product === 'bundle'
          // Upgrade card: no checkout URL involved (the plan change runs in main →
          // Edge Function), so it ignores `configured` / `onSubscribe`.
          const isUpgrade = isBundle && upgradeOffered
          const configured = isUpgrade || isCheckoutConfigured(account, product)
          // The card itself is the call to action. Signed in with a checkout URL it
          // opens the payment gateway for THIS product (same accountOpenCheckout the
          // Subscribe button used to fire); signed out it routes to Settings →
          // Account to sign in first. Signed in but without a checkout URL in this
          // build ("coming soon") there is nothing to open, so the card stays inert.
          // The upgrade card opens the in-app confirmation instead.
          const canUpgrade = isUpgrade && !upgradeDone
          const canSubscribe = !isUpgrade && account.signedIn && configured && !!onSubscribe
          const canNavigate = !account.signedIn && !!onGoToAccount
          const onCardClick = canUpgrade
            ? () => {
                setUpgradeError(null)
                setConfirmingUpgrade(true)
              }
            : canSubscribe
              ? () => onSubscribe!(product)
              : canNavigate
                ? onGoToAccount
                : undefined
          const comingSoon = account.signedIn && !configured

          const body = (
            <>
              <PlanCardBackdrop />
              <div className="relative flex h-full flex-col gap-0.5">
                {isBundle && (
                  <span className="self-start mb-1.5 px-2 py-0.5 rounded-full border border-accent/50 text-accent text-[9px] font-mono font-medium uppercase tracking-[0.14em]">
                    {t.settings.account.planBestValue}
                  </span>
                )}
                <span className="text-sm font-mono font-semibold text-text normal-case">{PLAN_NAMES[product]}</span>
                {isBundle && (
                  <span className="text-[11px] font-mono text-text-muted/70 normal-case">
                    {t.settings.account.planBundleSubtitle}
                  </span>
                )}
                {isUpgrade && (
                  <span className="text-[11px] font-mono text-text-muted/70 normal-case">
                    {t.settings.account.planUpgradeNote}
                  </span>
                )}
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-2xl font-mono font-semibold text-text tracking-tight leading-none normal-case">
                    {SUBSCRIPTION_PRICES[product].monthly}
                  </span>
                  <span className="text-[11px] font-mono text-text-muted normal-case">
                    {t.settings.account.planPerMonth}
                  </span>
                </div>
                <span className="text-[11px] font-mono text-text-muted/70 normal-case">
                  {SUBSCRIPTION_PRICES[product].yearly}
                  {t.settings.account.planPerYear}
                </span>
                <div className="mt-auto pt-3">
                  {canUpgrade ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-mono text-accent normal-case">
                      <Sparkles size={11} />
                      {t.settings.account.upgrade}
                    </span>
                  ) : canSubscribe ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-mono text-accent normal-case">
                      <Sparkles size={11} />
                      {t.settings.account.subscribe}
                    </span>
                  ) : comingSoon ? (
                    <span className="text-[11px] font-mono text-text-muted/60 normal-case">
                      {t.settings.account.comingSoon}
                    </span>
                  ) : null}
                </div>
              </div>
            </>
          )

          // Same box in both cases; only clickable cards become a <button> (focus +
          // keyboard). A button can't nest a button, which is why the CTA above is a
          // plain <span>, not the old inner Subscribe button.
          // `border-solid` is explicit on purpose: the global `button { border: none }`
          // reset (index.css) zeroes border-style, so the clickable <button> cards would
          // otherwise show no border at all — neither the base one nor the hover accent.
          const box = 'relative flex-1 min-w-[150px] overflow-hidden rounded-lg border border-solid border-border bg-surface-0 px-3.5 py-3 text-left'
          return onCardClick ? (
            <button
              key={product}
              type="button"
              onClick={onCardClick}
              disabled={(canSubscribe && busy) || (canUpgrade && upgradeBusy)}
              className={`${box} block transition-colors hover:border-accent focus-visible:outline-none focus-visible:border-accent disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              {body}
            </button>
          ) : (
            <div key={product} className={box}>
              {body}
            </div>
          )
        })}
      </div>

      {/* Upgrade confirmation: the plan change charges the card on file right
          away with no checkout page in between, so the proration is spelled out
          here and nothing happens until "Confirm upgrade". */}
      {upgradeOffered && confirmingUpgrade && !upgradeDone && (
        <div className="space-y-2 rounded-lg border border-solid border-accent/40 bg-surface-0 px-3.5 py-3 normal-case">
          <p className="text-xs font-mono font-semibold text-text">{t.settings.account.upgradeConfirmTitle}</p>
          <p className="text-[11px] font-mono text-text-muted leading-relaxed">
            {tf(t.settings.account.upgradeConfirmBody, { plan: currentPlanName })}
          </p>
          <p className="text-[11px] font-mono text-text-muted leading-relaxed">
            {tf(t.settings.account.upgradeProration, {
              monthly: SUBSCRIPTION_PRICES.bundle.monthly,
              yearly: SUBSCRIPTION_PRICES.bundle.yearly,
            })}
          </p>
          {upgradeError && (
            <p role="alert" className="flex items-start gap-1.5 text-[11px] font-mono text-red leading-relaxed">
              <AlertCircle size={12} className="shrink-0 mt-[1px]" />
              <span>{upgradeError}</span>
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={confirmUpgrade}
              disabled={upgradeBusy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono settings-btn bg-accent/15 hover:bg-accent/25 text-accent border border-solid border-accent/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {upgradeBusy ? <Loader size={11} className="animate-spin" /> : <Sparkles size={11} />}
              {t.settings.account.upgradeConfirm}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmingUpgrade(false)
                setUpgradeError(null)
              }}
              disabled={upgradeBusy}
              className="px-3 py-1.5 rounded-lg text-xs font-mono text-text-muted hover:text-text hover:bg-surface-2 transition-colors disabled:opacity-40"
            >
              {t.common.cancel}
            </button>
          </div>
        </div>
      )}
      {upgradeOffered && upgradeDone && (
        <p role="status" className="flex items-start gap-1.5 text-[11px] font-mono text-text-muted leading-relaxed normal-case">
          <Check size={12} className="shrink-0 mt-[1px] text-accent" />
          <span>{t.settings.account.upgradeRequested}</span>
        </p>
      )}

      {benefits && (
        <div className="space-y-1.5 normal-case">
          <p className="text-[11px] font-mono font-semibold text-text-muted">
            {t.settings.planBenefits.title}
          </p>
          <ul className="space-y-1">
            {t.settings.planBenefits[benefits].map((benefit) => (
              <li key={benefit} className="flex items-start gap-2 text-[11px] font-mono text-text-muted leading-relaxed">
                <Check size={11} className="mt-[3px] shrink-0 text-accent" />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[11px] font-mono text-text-muted/60 leading-relaxed normal-case">
        {t.settings.account.pricesIncludeVat}
      </p>

      {account.signedIn ? (
        hasCheckoutCard && (
          <p className="text-[11px] font-mono text-text-muted/60 leading-relaxed normal-case">
            {t.settings.account.subscribeHint}
          </p>
        )
      ) : (
        showSignInHint && (
          <p className="text-[11px] font-mono text-text-muted/60 leading-relaxed normal-case">
            {t.settings.account.signInToSubscribe}
          </p>
        )
      )}
    </div>
  )
}
