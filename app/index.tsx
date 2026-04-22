import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PremiumOfferModal } from '@/components/PremiumOfferModal';
import { t } from '@/lib/i18n';
import { useMonetization } from '@/lib/monetization';
import { useRevenueCat } from '@/lib/revenuecat';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [isPremiumOpen, setIsPremiumOpen] = useState(false);
  const {
    adCooldownRemainingMs,
    canWatchRewardedAd,
    isPremiumUser,
    trackMonetizationEvent,
    unlock24hPass,
    unlockLifetime,
  } = useMonetization();
  const {
    errorMessage: revenueCatError,
    isLoading: isPurchaseLoading,
    lifetimePriceString,
    openCustomerCenter,
    pass24hPriceString,
    presentPaywallIfNeeded,
    purchaseConsumable,
    purchaseLifetime,
    restorePurchases,
  } = useRevenueCat();

  function openPaywall() {
    trackMonetizationEvent('paywall_viewed', { trigger: 'home' });
    setIsPremiumOpen(true);
  }

  function handleContinueFree() {
    setIsPremiumOpen(false);
    router.push('/categories');
  }

  async function handleUnlock24hPass() {
    const result = await purchaseConsumable();

    if (result.success) {
      unlock24hPass();
      setIsPremiumOpen(false);
    }
  }

  async function handleUnlockLifetime() {
    const result = await purchaseLifetime();

    if (result.success) {
      unlockLifetime();
      setIsPremiumOpen(false);
    }
  }

  async function handleRevenueCatPaywall() {
    await presentPaywallIfNeeded();
  }

  return (
    <View style={styles.container}>
      <View pointerEvents="none" style={styles.backdrop}>
        <View style={[styles.ray, styles.rayOne]} />
        <View style={[styles.ray, styles.rayTwo]} />
        <View style={[styles.ray, styles.rayThree]} />
        <View style={[styles.confetti, styles.confettiOne]} />
        <View style={[styles.confetti, styles.confettiTwo]} />
        <View style={[styles.confetti, styles.confettiThree]} />
      </View>

      <ScrollView
        bounces={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + 16,
            paddingBottom: Math.max(insets.bottom + 18, 28),
          },
        ]}>
        <View style={styles.topBar}>
          <Text style={styles.logoText}>{t('app.home.logo')}</Text>
          <Pressable
            onPress={openPaywall}
            style={({ pressed }) => [styles.removeAdsPill, pressed && styles.pressed]}>
            <Text style={styles.removeAdsText}>
              {isPremiumUser ? t('app.home.premiumActive') : t('app.home.removeAds')}
            </Text>
          </Pressable>
        </View>

        <View style={styles.hero}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{t('app.home.badge')}</Text>
          </View>
          <Text style={styles.title}>{t('app.home.title')}</Text>
          <Text style={styles.subtitle}>{t('app.home.subtitle')}</Text>
        </View>

        <View style={styles.stagePreview}>
          <View style={styles.previewTopRow}>
            <Text style={styles.previewTimer}>01:20</Text>
            <Text style={styles.previewScore}>7</Text>
          </View>
          <View style={styles.previewWord}>
            <Text style={styles.previewWordText}>{t('app.home.previewWord')}</Text>
          </View>
          <View style={styles.previewBottomRow}>
            <Text style={styles.previewChip}>{t('app.game.pass')}</Text>
            <Text style={[styles.previewChip, styles.previewChipHot]}>{t('app.game.correct')}</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={() => router.push('/categories')}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryPressed]}>
            <Text style={styles.primaryButtonText}>{t('app.home.start')}</Text>
            <Text style={styles.primaryButtonHint}>{t('app.home.startHint')}</Text>
          </Pressable>

          <Pressable
            onPress={() => router.push('/categories')}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
            <Text style={styles.secondaryButtonText}>{t('app.home.categories')}</Text>
          </Pressable>
        </View>
      </ScrollView>

      <PremiumOfferModal
        visible={isPremiumOpen}
        adCooldownRemainingMs={adCooldownRemainingMs}
        canWatchAd={canWatchRewardedAd()}
        isPurchaseLoading={isPurchaseLoading}
        lifetimePrice={lifetimePriceString ?? undefined}
        pass24hPrice={pass24hPriceString ?? undefined}
        purchaseError={revenueCatError}
        onClose={() => setIsPremiumOpen(false)}
        onOpenCustomerCenter={openCustomerCenter}
        onOpenRevenueCatPaywall={handleRevenueCatPaywall}
        onRestorePurchases={restorePurchases}
        onWatchAdToUnlockSession={handleContinueFree}
        onUnlock24hPass={handleUnlock24hPass}
        onUnlockLifetime={handleUnlockLifetime}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    gap: 18,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  ray: {
    position: 'absolute',
    height: 180,
    borderRadius: 12,
    opacity: 0.72,
    transform: [{ rotate: '-24deg' }],
  },
  rayOne: {
    top: -38,
    left: 36,
    width: 30,
    backgroundColor: '#F97316',
  },
  rayTwo: {
    top: 92,
    right: 26,
    width: 24,
    backgroundColor: '#22D3EE',
  },
  rayThree: {
    bottom: 190,
    left: -18,
    width: 22,
    backgroundColor: '#FACC15',
  },
  confetti: {
    position: 'absolute',
    width: 9,
    height: 9,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
    opacity: 0.75,
  },
  confettiOne: {
    top: 108,
    left: 46,
    transform: [{ rotate: '18deg' }],
  },
  confettiTwo: {
    top: 206,
    right: 42,
    transform: [{ rotate: '-16deg' }],
  },
  confettiThree: {
    bottom: 150,
    right: 72,
    transform: [{ rotate: '24deg' }],
  },
  topBar: {
    zIndex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  logoText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  removeAdsPill: {
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.13)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 14,
  },
  removeAdsText: {
    color: '#FDE68A',
    fontSize: 13,
    fontWeight: '900',
  },
  hero: {
    zIndex: 1,
    gap: 10,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: '#F97316',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 44,
    fontWeight: '900',
    lineHeight: 47,
  },
  subtitle: {
    maxWidth: 310,
    color: 'rgba(255, 255, 255, 0.78)',
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600',
  },
  stagePreview: {
    zIndex: 1,
    borderRadius: 26,
    backgroundColor: '#FFF8EA',
    padding: 16,
    gap: 14,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.22,
    shadowRadius: 26,
    elevation: 18,
  },
  previewTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewTimer: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '900',
  },
  previewScore: {
    minWidth: 44,
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: '#22C55E',
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    paddingHorizontal: 12,
    paddingVertical: 6,
    textAlign: 'center',
  },
  previewWord: {
    minHeight: 98,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#111827',
    paddingHorizontal: 16,
  },
  previewWordText: {
    color: '#FFFFFF',
    fontSize: 31,
    fontWeight: '900',
    textAlign: 'center',
  },
  previewBottomRow: {
    flexDirection: 'row',
    gap: 10,
  },
  previewChip: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 14,
    backgroundColor: '#E5E7EB',
    color: '#111827',
    fontSize: 15,
    fontWeight: '900',
    paddingVertical: 11,
    textAlign: 'center',
  },
  previewChipHot: {
    backgroundColor: '#F97316',
    color: '#FFFFFF',
  },
  actions: {
    zIndex: 1,
    gap: 12,
  },
  primaryButton: {
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: '#FACC15',
    shadowColor: '#F97316',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.32,
    shadowRadius: 18,
    elevation: 12,
  },
  primaryPressed: {
    opacity: 0.92,
    transform: [{ translateY: 2 }, { scale: 0.99 }],
  },
  primaryButtonText: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '900',
  },
  primaryButtonHint: {
    marginTop: 3,
    color: 'rgba(17, 24, 39, 0.72)',
    fontSize: 13,
    fontWeight: '800',
  },
  secondaryButton: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.84,
    transform: [{ scale: 0.99 }],
  },
});
