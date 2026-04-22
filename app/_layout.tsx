import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Stack, useGlobalSearchParams, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PostHogProvider } from 'posthog-react-native';

import { initializeGoogleMobileAds } from '@/lib/admob';
import { t } from '@/lib/i18n';
import { MonetizationProvider, useMonetization } from '@/lib/monetization';
import { posthog } from '@/lib/posthog';
import { RevenueCatProvider, useRevenueCat } from '@/lib/revenuecat';

function RevenueCatEntitlementBridge() {
  const { isPro } = useRevenueCat();
  const { activateLifetimeEntitlement } = useMonetization();

  useEffect(() => {
    if (isPro) {
      activateLifetimeEntitlement();
    }
  }, [activateLifetimeEntitlement, isPro]);

  return null;
}

export default function RootLayout() {
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const previousPathname = useRef<string | undefined>(undefined);

  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    void initializeGoogleMobileAds();
  }, []);

  useEffect(() => {
    if (previousPathname.current !== pathname) {
      posthog.screen(pathname, {
        previous_screen: previousPathname.current ?? null,
        ...params,
      });
      previousPathname.current = pathname;
    }
  }, [pathname, params]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <PostHogProvider
        client={posthog}
        autocapture={{
          captureScreens: false,
          captureTouches: true,
          propsToCapture: ['testID'],
        }}>
        <BottomSheetModalProvider>
          <RevenueCatProvider>
            <MonetizationProvider>
              <RevenueCatEntitlementBridge />
              <Stack>
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen
                  name="categories"
                  options={{
                    headerShown: false,
                    title: t('app.navigation.categories'),
                  }}
                />
                <Stack.Screen name="game" options={{ headerShown: false }} />
              </Stack>
              <StatusBar style="light" />
            </MonetizationProvider>
          </RevenueCatProvider>
        </BottomSheetModalProvider>
      </PostHogProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
