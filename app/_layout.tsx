import * as ScreenOrientation from 'expo-screen-orientation';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { t } from '@/lib/i18n';

export default function RootLayout() {
  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  }, []);

  return (
    <>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen
          name="categories"
          options={{
            title: t('app.navigation.categories'),
            headerBackTitle: t('app.navigation.back'),
          }}
        />
        <Stack.Screen name="game" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="dark" />
    </>
  );
}
