import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';

export const monetizationConfig = {
  free: {
    maxFreeCategories: 3,
    sessionRoundsPerAd: 5,
    rewardedAdCooldownMs: 3 * 60 * 1000,
    interstitialFrequency: 5,
    minRoundsBeforePaywall: 3,
    adsBeforePaywall: 2,
  },
  pricing: {
    pass24h: 9.9,
    lifetime: 99.9,
    currency: 'BRL',
  },
  pass: {
    durationMs: 24 * 60 * 60 * 1000,
  },
} as const;

export type MonetizationEventName =
  | 'ad_watched'
  | 'category_unlocked_by_ad'
  | 'paywall_viewed'
  | 'pass_24h_clicked'
  | 'lifetime_clicked'
  | 'purchase_completed';

type UnlockState = 'free' | 'ad_session' | 'pass_24h' | 'lifetime' | 'locked';

type AdSessionUnlock = {
  roundsRemaining: number;
};

type PaywallTrigger = 'home' | 'locked_category' | 'post_round' | 'ads_watched';

type MonetizationContextValue = {
  adCooldownRemainingMs: number;
  adSessionUnlocks: Record<string, AdSessionUnlock>;
  hasActivePass: boolean;
  isPremiumUser: boolean;
  lifetimeUnlocked: boolean;
  passExpiresAt: number | null;
  rewardedAdsWatched: number;
  roundsPlayed: number;
  trackMonetizationEvent: (
    eventName: MonetizationEventName,
    payload?: Record<string, unknown>
  ) => void;
  canWatchRewardedAd: () => boolean;
  getCategoryUnlockState: (
    categoryId: string,
    requiresUnlock: boolean
  ) => UnlockState;
  isCategoryUnlocked: (categoryId: string, requiresUnlock: boolean) => boolean;
  markRoundCompleted: (categoryIds: string[]) => void;
  shouldShowPaywall: (trigger: PaywallTrigger) => boolean;
  watchAdToUnlockSession: (categoryId: string) => boolean;
  unlock24hPass: () => void;
  unlockLifetime: () => void;
  activateLifetimeEntitlement: () => void;
};

const MonetizationContext = createContext<MonetizationContextValue | null>(null);

function now() {
  return Date.now();
}

function isTimestampActive(timestamp: number | null) {
  return timestamp !== null && timestamp > now();
}

export function MonetizationProvider({ children }: PropsWithChildren) {
  const [passExpiresAt, setPassExpiresAt] = useState<number | null>(null);
  const [lifetimeUnlocked, setLifetimeUnlocked] = useState(false);
  const [adSessionUnlocks, setAdSessionUnlocks] = useState<Record<string, AdSessionUnlock>>({});
  const [lastRewardedAdAt, setLastRewardedAdAt] = useState<number | null>(null);
  const [rewardedAdsWatched, setRewardedAdsWatched] = useState(0);
  const [roundsPlayed, setRoundsPlayed] = useState(0);
  const [cooldownTick, setCooldownTick] = useState(0);

  const hasActivePass = isTimestampActive(passExpiresAt);
  const isPremiumUser = hasActivePass || lifetimeUnlocked;
  void cooldownTick;
  const adCooldownRemainingMs = Math.max(
    0,
    (lastRewardedAdAt ?? 0) + monetizationConfig.free.rewardedAdCooldownMs - now()
  );

  useEffect(() => {
    if (adCooldownRemainingMs === 0) {
      return;
    }

    const timer = setInterval(() => {
      setCooldownTick((current) => current + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [adCooldownRemainingMs]);

  const value = useMemo<MonetizationContextValue>(
    () => ({
      adCooldownRemainingMs,
      adSessionUnlocks,
      hasActivePass,
      isPremiumUser,
      lifetimeUnlocked,
      passExpiresAt,
      rewardedAdsWatched,
      roundsPlayed,
      trackMonetizationEvent: (eventName, payload = {}) => {
        console.log('[monetization]', eventName, payload);
      },
      canWatchRewardedAd: () => adCooldownRemainingMs === 0 && !isPremiumUser,
      getCategoryUnlockState: (categoryId, requiresUnlock) => {
        if (!requiresUnlock) {
          return 'free';
        }

        if (lifetimeUnlocked) {
          return 'lifetime';
        }

        if (hasActivePass) {
          return 'pass_24h';
        }

        if ((adSessionUnlocks[categoryId]?.roundsRemaining ?? 0) > 0) {
          return 'ad_session';
        }

        return 'locked';
      },
      isCategoryUnlocked: (categoryId, requiresUnlock) => {
        if (!requiresUnlock || isPremiumUser) {
          return true;
        }

        return (adSessionUnlocks[categoryId]?.roundsRemaining ?? 0) > 0;
      },
      markRoundCompleted: (categoryIds) => {
        setRoundsPlayed((current) => current + 1);
        setAdSessionUnlocks((current) => {
          const next = { ...current };

          categoryIds.forEach((categoryId) => {
            const unlock = next[categoryId];

            if (!unlock) {
              return;
            }

            const roundsRemaining = unlock.roundsRemaining - 1;

            if (roundsRemaining <= 0) {
              delete next[categoryId];
              return;
            }

            next[categoryId] = { roundsRemaining };
          });

          return next;
        });
      },
      shouldShowPaywall: (trigger) => {
        if (isPremiumUser) {
          return false;
        }

        if (trigger === 'locked_category') {
          return true;
        }

        if (trigger === 'ads_watched') {
          return rewardedAdsWatched >= monetizationConfig.free.adsBeforePaywall;
        }

        if (trigger === 'post_round') {
          return (
            roundsPlayed + 1 >= monetizationConfig.free.minRoundsBeforePaywall ||
            rewardedAdsWatched >= monetizationConfig.free.adsBeforePaywall
          );
        }

        return trigger === 'home';
      },
      watchAdToUnlockSession: (categoryId) => {
        if (adCooldownRemainingMs > 0 || isPremiumUser) {
          return false;
        }

        setLastRewardedAdAt(now());
        setRewardedAdsWatched((current) => current + 1);
        setAdSessionUnlocks((current) => ({
          ...current,
          [categoryId]: {
            roundsRemaining: monetizationConfig.free.sessionRoundsPerAd,
          },
        }));

        console.log('[monetization]', 'ad_watched', { categoryId });
        console.log('[monetization]', 'category_unlocked_by_ad', {
          categoryId,
          rounds: monetizationConfig.free.sessionRoundsPerAd,
        });

        return true;
      },
      unlock24hPass: () => {
        setPassExpiresAt(now() + monetizationConfig.pass.durationMs);
        console.log('[monetization]', 'pass_24h_clicked', {
          price: monetizationConfig.pricing.pass24h,
          currency: monetizationConfig.pricing.currency,
        });
        console.log('[monetization]', 'purchase_completed', { productId: 'pass_24h' });
      },
      unlockLifetime: () => {
        setLifetimeUnlocked(true);
        console.log('[monetization]', 'lifetime_clicked', {
          price: monetizationConfig.pricing.lifetime,
          currency: monetizationConfig.pricing.currency,
        });
        console.log('[monetization]', 'purchase_completed', { productId: 'lifetime' });
      },
      activateLifetimeEntitlement: () => {
        setLifetimeUnlocked(true);
      },
    }),
    [
      adCooldownRemainingMs,
      adSessionUnlocks,
      hasActivePass,
      isPremiumUser,
      lifetimeUnlocked,
      passExpiresAt,
      rewardedAdsWatched,
      roundsPlayed,
    ]
  );

  return <MonetizationContext.Provider value={value}>{children}</MonetizationContext.Provider>;
}

export function useMonetization() {
  const context = useContext(MonetizationContext);

  if (!context) {
    throw new Error('useMonetization must be used inside MonetizationProvider');
  }

  return context;
}
