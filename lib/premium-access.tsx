import { createContext, PropsWithChildren, useContext, useMemo, useState } from 'react';

const UNLOCK_DURATION_MS = 24 * 60 * 60 * 1000;

type PremiumAccessContextValue = {
  adsRemoved: boolean;
  removeAdsForever: () => void;
  unlockCategoryFor24h: (categoryId: string) => void;
  isCategoryUnlocked: (categoryId: string, isPremium: boolean) => boolean;
  getUnlockLabel: (categoryId: string) => 'free' | 'temporary' | 'lifetime' | 'locked';
};

const PremiumAccessContext = createContext<PremiumAccessContextValue | null>(null);

export function PremiumAccessProvider({ children }: PropsWithChildren) {
  const [adsRemoved, setAdsRemoved] = useState(false);
  const [temporaryUnlocks, setTemporaryUnlocks] = useState<Record<string, number>>({});

  const value = useMemo<PremiumAccessContextValue>(
    () => ({
      adsRemoved,
      removeAdsForever: () => {
        setAdsRemoved(true);
      },
      unlockCategoryFor24h: (categoryId: string) => {
        setTemporaryUnlocks((current) => ({
          ...current,
          [categoryId]: Date.now() + UNLOCK_DURATION_MS,
        }));
      },
      isCategoryUnlocked: (categoryId: string, isPremium: boolean) => {
        if (!isPremium || adsRemoved) {
          return true;
        }

        return (temporaryUnlocks[categoryId] ?? 0) > Date.now();
      },
      getUnlockLabel: (categoryId: string) => {
        if (adsRemoved) {
          return 'lifetime';
        }

        if ((temporaryUnlocks[categoryId] ?? 0) > Date.now()) {
          return 'temporary';
        }

        return 'locked';
      },
    }),
    [adsRemoved, temporaryUnlocks]
  );

  return (
    <PremiumAccessContext.Provider value={value}>{children}</PremiumAccessContext.Provider>
  );
}

export function usePremiumAccess() {
  const context = useContext(PremiumAccessContext);

  if (!context) {
    throw new Error('usePremiumAccess must be used inside PremiumAccessProvider');
  }

  return context;
}
