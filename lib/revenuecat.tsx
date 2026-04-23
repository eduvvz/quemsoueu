import Constants, { ExecutionEnvironment } from 'expo-constants';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import Purchases, {
  CustomerInfo,
  LOG_LEVEL,
  PRODUCT_CATEGORY,
  PurchasesOfferings,
  PurchasesPackage,
} from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';

const extra = Constants.expoConfig?.extra ?? {};

export const revenueCatConfig = {
  apiKey: Platform.select<string | undefined>({
    android: extra.revenueCatAndroidApiKey as string | undefined,
    ios: extra.revenueCatIosApiKey as string | undefined,
  }),
  entitlementId: (extra.revenueCatEntitlementId as string | undefined) ?? 'default',
  offeringId: (extra.revenueCatOfferingId as string | undefined) ?? 'default',
  products: {
    consumable: {
      packageId: (extra.revenueCatConsumablePackageId as string | undefined) ?? '',
      productId: (extra.revenueCatConsumableProductId as string | undefined) ?? '',
    },
    lifetime: {
      packageId: (extra.revenueCatLifetimePackageId as string | undefined) ?? '',
      productId: (extra.revenueCatLifetimeProductId as string | undefined) ?? '',
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
  hasLifetimeAccess: boolean;
  isConfigured: boolean;
  isLoading: boolean;
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

function hasLifetimeProductAccess(customerInfo: CustomerInfo | null) {
  const activeEntitlement = customerInfo?.entitlements.active[revenueCatConfig.entitlementId];

  if (activeEntitlement?.productIdentifier === revenueCatConfig.products.lifetime.productId) {
    return true;
  }

  return (
    customerInfo?.allPurchasedProductIdentifiers.includes(
      revenueCatConfig.products.lifetime.productId
    ) ?? false
  );
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

async function buildOfferingsDiagnosticMessage() {
  const productIds = [
    revenueCatConfig.products.consumable.productId,
    revenueCatConfig.products.lifetime.productId,
  ].filter(Boolean);

  try {
    const [storefront, storeProducts] = await Promise.all([
      Purchases.getStorefront().catch(() => null),
      productIds.length > 0
        ? Purchases.getProducts(productIds, PRODUCT_CATEGORY.NON_SUBSCRIPTION)
        : Promise.resolve([]),
    ]);

    const resolvedProductIds = storeProducts.map((product) => product.identifier);
    const missingProductIds = productIds.filter(
      (productId) => !resolvedProductIds.includes(productId)
    );
    const storefrontCode =
      storefront?.countryCode ??
      storefront?.identifier ??
      'unknown storefront';

    console.warn('[revenuecat] offerings diagnostic', {
      configuredOfferingId: revenueCatConfig.offeringId,
      configuredProductIds: productIds,
      missingProductIds,
      resolvedProductIds,
      storefront: storefront,
    });

    if (resolvedProductIds.length === 0) {
      return (
        `StoreKit did not return any App Store products for "${productIds.join(', ')}" ` +
        `(${storefrontCode}). Check App Store Connect agreements, region availability, ` +
        'and wait for product propagation in TestFlight.'
      );
    }

    if (missingProductIds.length > 0) {
      return (
        `StoreKit only returned "${resolvedProductIds.join(', ')}". Missing "${missingProductIds.join(', ')}" ` +
        `for ${storefrontCode}. Check product availability and identifiers in App Store Connect.`
      );
    }

    return (
      `App Store products loaded (${resolvedProductIds.join(', ')}), but RevenueCat offering "${revenueCatConfig.offeringId}" ` +
      'still failed. Check the current offering packages and app assignment in RevenueCat.'
    );
  } catch (diagnosticError) {
    console.warn('[revenuecat] failed to build offerings diagnostic', diagnosticError);
    return null;
  }
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
  const hasLifetimeAccess = hasLifetimeProductAccess(customerInfo);
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
      const diagnosticMessage = await buildOfferingsDiagnosticMessage();
      const message = diagnosticMessage ?? getErrorMessage(error);

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

    if (!revenueCatConfig.apiKey) {
      setErrorMessage('RevenueCat API key not configured. Set it in your .env file.');
      return;
    }

    try {
      Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.VERBOSE : LOG_LEVEL.WARN);
      Purchases.configure({
        apiKey: revenueCatConfig.apiKey,
        diagnosticsEnabled: true,
      });
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
          const currentOffering =
            nextOfferings?.all[revenueCatConfig.offeringId] ?? nextOfferings?.current;
          const availablePackages =
            currentOffering?.availablePackages.map((item) => ({
              identifier: item.identifier,
              productIdentifier: item.product.identifier,
              packageType: item.packageType,
            })) ?? [];
          const availablePackagesSummary =
            availablePackages.length > 0
              ? availablePackages
                  .map(
                    (item) =>
                      `${item.identifier} -> ${item.productIdentifier} (${item.packageType})`
                  )
                  .join(', ')
              : 'none';

          console.warn('[revenuecat] package lookup failed', {
            configuredOfferingId: revenueCatConfig.offeringId,
            configuredPackageId: productConfig.packageId,
            configuredProductId: productConfig.productId,
            currentOfferingIdentifier: currentOffering?.identifier ?? null,
            availablePackages,
          });

          throw new Error(
            `RevenueCat package not found for product "${productConfig.productId}" in offering "${revenueCatConfig.offeringId}". ` +
              `Configured package id: "${productConfig.packageId}". ` +
              `Current offering: "${currentOffering?.identifier ?? 'none'}". ` +
              `Available packages: ${availablePackagesSummary}.`
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

    if (result.success && !hasLifetimeProductAccess(result.customerInfo)) {
      setErrorMessage(
        `Purchase completed, but lifetime access was not detected for product "${revenueCatConfig.products.lifetime.productId}". ` +
          `Check the RevenueCat entitlement and product mapping.`
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
      hasLifetimeAccess,
      isConfigured,
      isLoading,
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
      hasLifetimeAccess,
      isConfigured,
      isLoading,
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
