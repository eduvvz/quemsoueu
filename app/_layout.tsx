import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import {
  getTrackingPermissionsAsync,
  PermissionStatus,
  requestTrackingPermissionsAsync,
} from 'expo-tracking-transparency';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Stack, useGlobalSearchParams, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PostHogProvider } from 'posthog-react-native';

import { initializeGoogleMobileAds } from '@/lib/admob';
import { t } from '@/lib/i18n';
import { MonetizationProvider, useMonetization } from '@/lib/monetization';
import { getPostHogClient } from '@/lib/posthog';
import { RevenueCatProvider, useRevenueCat } from '@/lib/revenuecat';

function RevenueCatEntitlementBridge() {
  const { hasLifetimeAccess } = useRevenueCat();
  const { setLifetimeEntitlementActive } = useMonetization();

  useEffect(() => {
    setLifetimeEntitlementActive(hasLifetimeAccess);
  }, [hasLifetimeAccess, setLifetimeEntitlementActive]);

  return null;
}

export default function RootLayout() {
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const previousPathname = useRef<string | undefined>(undefined);
  const [isBootstrapReady, setIsBootstrapReady] = useState(Platform.OS !== 'ios');

  useEffect(() => {
    let isCancelled = false;

    function waitForAppToBecomeActive() {
      if (AppState.currentState === 'active') {
        return Promise.resolve();
      }

      return new Promise<void>((resolve) => {
        const subscription = AppState.addEventListener('change', (nextState) => {
          if (nextState !== 'active') {
            return;
          }

          subscription.remove();
          resolve();
        });
      });
    }

    async function bootstrap() {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);

      if (Platform.OS !== 'ios') {
        await initializeGoogleMobileAds();

        if (!isCancelled) {
          setIsBootstrapReady(true);
        }
        return;
      }

      await waitForAppToBecomeActive();

      const currentPermission = await getTrackingPermissionsAsync();
      if (currentPermission.status === PermissionStatus.UNDETERMINED) {
        await requestTrackingPermissionsAsync();
      }

      await initializeGoogleMobileAds();

      if (!isCancelled) {
        setIsBootstrapReady(true);
      }
    }

    void bootstrap();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isBootstrapReady) {
      return;
    }

    if (previousPathname.current !== pathname) {
      getPostHogClient().screen(pathname, {
        previous_screen: previousPathname.current ?? null,
        ...params,
      });
      previousPathname.current = pathname;
    }
  }, [isBootstrapReady, pathname, params]);

  if (!isBootstrapReady) {
    return (
      <GestureHandlerRootView style={styles.root}>
        <View style={styles.loadingScreen}>
          <Text style={styles.loadingTitle}>Who Am I?</Text>
          <Text style={styles.loadingCopy}>Preparing personalized ads…</Text>
        </View>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <PostHogProvider
        client={getPostHogClient()}
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
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#111827',
    paddingHorizontal: 24,
  },
  loadingTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
  },
  loadingCopy: {
    color: 'rgba(255, 255, 255, 0.72)',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
});
