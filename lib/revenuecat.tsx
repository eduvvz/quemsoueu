import Constants, { ExecutionEnvironment } from 'expo-constants';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import Purchases, {
  CustomerInfo,
  LOG_LEVEL,
  PurchasesOfferings,
  PurchasesPackage,
} from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';

export const revenueCatConfig = {
  apiKey: 'test_xZSnHZQrfaAaAQZUVYFYDVUjxGM',
  entitlementId: 'Quem Sou Eu Pro',
  offeringId: 'default',
  products: {
    consumable: {
      packageId: '24 hours',
      productId: 'Consumable_24hours',
    },
    lifetime: {
      packageId: 'Lifitime',
      productId: 'Lifetime',
    },
  },
} as const;

type PurchaseResult = {
  customerInfo: CustomerInfo | null;
  success: boolean;
};

type RevenueCatContextValue = {
  customerInfo: CustomerInfo | null;
  errorMessage: string | null;
  isConfigured: boolean;
  isLoading: boolean;
  isPro: boolean;
  lifetimePriceString: string | null;
  offerings: PurchasesOfferings | null;
  pass24hPriceString: string | null;
  openCustomerCenter: () => Promise<void>;
  presentPaywall: () => Promise<PAYWALL_RESULT | null>;
  presentPaywallIfNeeded: () => Promise<PAYWALL_RESULT | null>;
  purchaseConsumable: () => Promise<PurchaseResult>;
  purchaseLifetime: () => Promise<PurchaseResult>;
  refreshCustomerInfo: () => Promise<CustomerInfo | null>;
  restorePurchases: () => Promise<CustomerInfo | null>;
};

const RevenueCatContext = createContext<RevenueCatContextValue | null>(null);

function isWeb() {
  return Platform.OS === 'web';
}

function isExpoGo() {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

function hasProEntitlement(customerInfo: CustomerInfo | null) {
  return Boolean(customerInfo?.entitlements.active[revenueCatConfig.entitlementId]);
}

function getErrorMessage(error: unknown) {
  if (typeof error === 'object' && error !== null) {
    if ('userCancelled' in error && error.userCancelled) {
      return null;
    }

    if ('message' in error && typeof error.message === 'string') {
      return error.message;
    }
  }

  return 'Unable to complete the purchase. Please try again.';
}

function findPackageByProductId(
  offerings: PurchasesOfferings | null,
  productConfig: {
    packageId: string;
    productId: string;
  }
): PurchasesPackage | null {
  const currentOffering =
    offerings?.all[revenueCatConfig.offeringId] ?? offerings?.current;

  if (!currentOffering) {
    return null;
  }

  return (
    currentOffering.availablePackages.find(
      (item) =>
        item.product.identifier === productConfig.productId ||
        item.identifier === productConfig.packageId
    ) ?? null
  );
}

export function RevenueCatProvider({ children }: PropsWithChildren) {
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);
  const isPro = hasProEntitlement(customerInfo);
  const pass24hPackage = findPackageByProductId(
    offerings,
    revenueCatConfig.products.consumable
  );
  const lifetimePackage = findPackageByProductId(offerings, revenueCatConfig.products.lifetime);
  const pass24hPriceString = pass24hPackage?.product.priceString ?? null;
  const lifetimePriceString = lifetimePackage?.product.priceString ?? null;

  const refreshCustomerInfo = useCallback(async () => {
    if (isWeb() || !isConfigured) {
      return null;
    }

    try {
      const nextCustomerInfo = await Purchases.getCustomerInfo();
      setCustomerInfo(nextCustomerInfo);
      setErrorMessage(null);

      return nextCustomerInfo;
    } catch (error) {
      const message = getErrorMessage(error);

      if (message) {
        setErrorMessage(message);
        console.warn('[revenuecat] failed to refresh customer info', error);
      }

      return null;
    }
  }, [isConfigured]);

  const refreshOfferings = useCallback(async () => {
    if (isWeb() || !isConfigured) {
      return null;
    }

    try {
      const nextOfferings = await Purchases.getOfferings();
      setOfferings(nextOfferings);
      setErrorMessage(null);

      return nextOfferings;
    } catch (error) {
      const message = getErrorMessage(error);

      if (message) {
        setErrorMessage(message);
        console.warn('[revenuecat] failed to fetch offerings', error);
      }

      return null;
    }
  }, [isConfigured]);

  useEffect(() => {
    if (isWeb()) {
      return;
    }

    if (isExpoGo()) {
      setErrorMessage('RevenueCat purchases require a development build, not Expo Go.');
      return;
    }

    try {
      Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.VERBOSE : LOG_LEVEL.WARN);
      Purchases.configure({ apiKey: revenueCatConfig.apiKey });
      setIsConfigured(true);
    } catch (error) {
      setIsConfigured(false);
      setErrorMessage(
        'RevenueCat native module is unavailable. Rebuild and reinstall the development client.'
      );
      console.warn('[revenuecat] failed to configure SDK', error);
      return;
    }

    const customerInfoListener = (nextCustomerInfo: CustomerInfo) => {
      setCustomerInfo(nextCustomerInfo);
    };

    Purchases.addCustomerInfoUpdateListener(customerInfoListener);

    return () => {
      Purchases.removeCustomerInfoUpdateListener(customerInfoListener);
    };
  }, []);

  useEffect(() => {
    if (!isConfigured) {
      return;
    }

    void refreshCustomerInfo();
    void refreshOfferings();
  }, [isConfigured, refreshCustomerInfo, refreshOfferings]);

  const purchasePackage = useCallback(
    async (productConfig: { packageId: string; productId: string }) => {
      if (isWeb() || !isConfigured) {
        return { customerInfo: null, success: false };
      }

      setIsLoading(true);
      setErrorMessage(null);

      try {
        const nextOfferings = offerings ?? (await refreshOfferings());
        const packageToPurchase = findPackageByProductId(nextOfferings, productConfig);

        if (!packageToPurchase) {
          throw new Error(
            `RevenueCat package not found for product "${productConfig.productId}" in offering "${revenueCatConfig.offeringId}". Check the current offering.`
          );
        }

        const result = await Purchases.purchasePackage(packageToPurchase);
        setCustomerInfo(result.customerInfo);

        return { customerInfo: result.customerInfo, success: true };
      } catch (error) {
        const message = getErrorMessage(error);

        if (message) {
          setErrorMessage(message);
          console.warn('[revenuecat] purchase failed', error);
        }

        return { customerInfo: null, success: false };
      } finally {
        setIsLoading(false);
      }
    },
    [isConfigured, offerings, refreshOfferings]
  );

  const purchaseConsumable = useCallback(async () => {
    return purchasePackage(revenueCatConfig.products.consumable);
  }, [purchasePackage]);

  const purchaseLifetime = useCallback(async () => {
    const result = await purchasePackage(revenueCatConfig.products.lifetime);

    if (result.success && !hasProEntitlement(result.customerInfo)) {
      setErrorMessage(
        `Purchase completed, but entitlement "${revenueCatConfig.entitlementId}" is not active. Check RevenueCat product setup.`
      );

      return { customerInfo: result.customerInfo, success: false };
    }

    return result;
  }, [purchasePackage]);

  const restorePurchases = useCallback(async () => {
    if (isWeb() || !isConfigured) {
      return null;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const nextCustomerInfo = await Purchases.restorePurchases();
      setCustomerInfo(nextCustomerInfo);

      return nextCustomerInfo;
    } catch (error) {
      const message = getErrorMessage(error);

      if (message) {
        setErrorMessage(message);
        console.warn('[revenuecat] restore failed', error);
      }

      return null;
    } finally {
      setIsLoading(false);
    }
  }, [isConfigured]);

  const presentPaywall = useCallback(async () => {
    if (isWeb() || !isConfigured) {
      return null;
    }

    try {
      const result = await RevenueCatUI.presentPaywall({ displayCloseButton: true });
      await refreshCustomerInfo();

      return result;
    } catch (error) {
      const message = getErrorMessage(error);

      if (message) {
        setErrorMessage(message);
        console.warn('[revenuecat] paywall failed', error);
      }

      return null;
    }
  }, [isConfigured, refreshCustomerInfo]);

  const presentPaywallIfNeeded = useCallback(async () => {
    if (isWeb() || !isConfigured) {
      return null;
    }

    try {
      const result = await RevenueCatUI.presentPaywallIfNeeded({
        requiredEntitlementIdentifier: revenueCatConfig.entitlementId,
        displayCloseButton: true,
      });
      await refreshCustomerInfo();

      return result;
    } catch (error) {
      const message = getErrorMessage(error);

      if (message) {
        setErrorMessage(message);
        console.warn('[revenuecat] conditional paywall failed', error);
      }

      return null;
    }
  }, [isConfigured, refreshCustomerInfo]);

  const openCustomerCenter = useCallback(async () => {
    if (isWeb() || !isConfigured) {
      return;
    }

    try {
      await RevenueCatUI.presentCustomerCenter({
        callbacks: {
          onRestoreCompleted: ({ customerInfo: restoredCustomerInfo }) => {
            setCustomerInfo(restoredCustomerInfo);
          },
          onRestoreFailed: ({ error }) => {
            const message = getErrorMessage(error);

            if (message) {
              setErrorMessage(message);
            }
          },
        },
      });
      await refreshCustomerInfo();
    } catch (error) {
      const message = getErrorMessage(error);

      if (message) {
        setErrorMessage(message);
        console.warn('[revenuecat] customer center failed', error);
      }
    }
  }, [isConfigured, refreshCustomerInfo]);

  const value = useMemo<RevenueCatContextValue>(
    () => ({
      customerInfo,
      errorMessage,
      isConfigured,
      isLoading,
      isPro,
      lifetimePriceString,
      offerings,
      pass24hPriceString,
      openCustomerCenter,
      presentPaywall,
      presentPaywallIfNeeded,
      purchaseConsumable,
      purchaseLifetime,
      refreshCustomerInfo,
      restorePurchases,
    }),
    [
      customerInfo,
      errorMessage,
      isConfigured,
      isLoading,
      isPro,
      lifetimePriceString,
      offerings,
      pass24hPriceString,
      openCustomerCenter,
      presentPaywall,
      presentPaywallIfNeeded,
      purchaseConsumable,
      purchaseLifetime,
      refreshCustomerInfo,
      restorePurchases,
    ]
  );

  return <RevenueCatContext.Provider value={value}>{children}</RevenueCatContext.Provider>;
}

export function useRevenueCat() {
  const context = useContext(RevenueCatContext);

  if (!context) {
    throw new Error('useRevenueCat must be used inside RevenueCatProvider');
  }

  return context;
}
