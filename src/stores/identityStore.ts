import { create } from 'zustand'
import { activePlan, type SubscriptionProduct } from '../lib/subscriptionPlans'
import type { AccountStatus, ActiveSyncStatus } from '../types'

// Who / where for the sidebar footer's identity line (Sidebar/SidebarIdentity.tsx) and its ⋯
// menu: the NoteFlow account (session + plan name) and the live sync backend. Main window
// only. Flat primitives so components subscribe with fine selectors and only re-render on
// what they show. Kept current by main's broadcasts while something holds connectIdentity().

interface IdentityState {
  /** Account email while signed in (initial of the circle). */
  email: string | null
  /**
   * Plan to name (subscriptionPlans.activePlan): null = signed out, free/lapsed or unknown yet.
   * Null also puts "Sync" in the ⋯ menu (with a plan it lives in the plan menu).
   */
  plan: SubscriptionProduct | null
  /** Live sync provider (sync:get-active-status): Cloud when enabled, else GitHub, else none. */
  syncBackend: ActiveSyncStatus['backend']
  /** GitHub repo NAME (no owner) while the backend is GitHub. */
  githubRepo: string | null
}

export const useIdentityStore = create<IdentityState>(() => ({
  email: null,
  plan: null,
  syncBackend: 'none',
  githubRepo: null,
}))

function applyAccount(s: AccountStatus): void {
  useIdentityStore.setState({
    email: s.signedIn ? s.email ?? null : null,
    plan: activePlan(s),
  })
}

function applySync(s: ActiveSyncStatus): void {
  const repo = s.backend === 'github' ? s.github?.repo ?? null : null
  useIdentityStore.setState({
    syncBackend: s.backend,
    githubRepo: repo ? repo.slice(repo.lastIndexOf('/') + 1) : null,
  })
}

let connections = 0
let disconnect: (() => void) | null = null

/**
 * Loads the account + sync snapshot and follows main's broadcasts until the returned
 * function is called. Ref-counted: the first caller subscribes, the last one unsubscribes.
 */
export function connectIdentity(): () => void {
  connections++
  if (connections === 1) {
    const api = window.noteflow
    // Responses can land out of order (the boot fetch vs an event-driven one): only the
    // latest request of each kind is applied; a pushed account status beats any pending fetch.
    let accountSeq = 0
    let syncSeq = 0
    // Set on disconnect: a response still in flight from this connection must not land after a
    // later reconnect (StrictMode, sidebar remount).
    let disposed = false
    const fetchAccount = () => {
      const seq = ++accountSeq
      api.getAccountStatus().then((s) => { if (!disposed && seq === accountSeq) applyAccount(s) }).catch(() => {})
    }
    const fetchSync = () => {
      const seq = ++syncSeq
      api.getActiveSyncStatus().then((s) => { if (!disposed && seq === syncSeq) applySync(s) }).catch(() => {})
    }
    fetchAccount()
    fetchSync()
    const offs = [
      api.onAccountStatusChanged((s) => { accountSeq++; applyAccount(s) }),
      // GitHub connect / disconnect / status, and Cloud enable / disable.
      api.onSyncAuthComplete(fetchSync),
      api.onSyncStatusChanged(fetchSync),
      api.onCloudStatusChanged(fetchSync),
    ]
    disconnect = () => {
      disposed = true
      offs.forEach((off) => off())
    }
  }
  return () => {
    connections--
    if (connections === 0) {
      disconnect?.()
      disconnect = null
    }
  }
}
