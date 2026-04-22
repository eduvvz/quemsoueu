import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { initializeGoogleMobileAds } from '@/lib/admob';
import { t } from '@/lib/i18n';
import { MonetizationProvider, useMonetization } from '@/lib/monetization';
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
  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    void initializeGoogleMobileAds();
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
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
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
