import {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@/lib/i18n';
import { monetizationConfig } from '@/lib/monetization';
import { posthog } from '@/lib/posthog';

type PremiumOfferModalProps = {
  visible: boolean;
  categoryName?: string;
  adCooldownRemainingMs: number;
  canWatchAd: boolean;
  isRewardedAdLoading?: boolean;
  isPurchaseLoading?: boolean;
  lifetimePrice?: string;
  pass24hPrice?: string;
  purchaseError?: string | null;
  onClose: () => void;
  onOpenCustomerCenter?: () => void;
  onOpenRevenueCatPaywall?: () => void;
  onRestorePurchases?: () => void;
  onWatchAdToUnlockSession: () => void;
  onUnlock24hPass: () => void;
  onUnlockLifetime: () => void;
};

function formatPrice(value: number) {
  return `${monetizationConfig.pricing.currency} ${value.toFixed(2)}`;
}

function formatCooldown(totalMs: number) {
  const totalSeconds = Math.ceil(totalMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');

  return `${minutes}:${seconds}`;
}

export function PremiumOfferModal({
  visible,
  categoryName,
  adCooldownRemainingMs,
  canWatchAd,
  isRewardedAdLoading = false,
  isPurchaseLoading = false,
  lifetimePrice,
  pass24hPrice,
  purchaseError,
  onClose,
  onOpenCustomerCenter,
  onOpenRevenueCatPaywall,
  onRestorePurchases,
  onWatchAdToUnlockSession,
  onUnlock24hPass,
  onUnlockLifetime,
}: PremiumOfferModalProps) {
  const insets = useSafeAreaInsets();
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['72%', '92%'], []);
  const isCategoryUnlock = Boolean(categoryName);

  useEffect(() => {
    if (visible) {
      bottomSheetRef.current?.present();
      return;
    }

    bottomSheetRef.current?.dismiss();
  }, [visible]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.62}
        pressBehavior="close"
        style={[props.style, styles.backdrop]}
      />
    ),
    []
  );

  let freeActionLabel = t('app.premium.freeCtaBrowse');

  if (isRewardedAdLoading) {
    freeActionLabel = t('app.premium.freeCtaLoading');
  } else if (isCategoryUnlock && canWatchAd) {
    freeActionLabel = t('app.premium.freeCtaAd');
  } else if (isCategoryUnlock) {
    freeActionLabel = t('app.premium.freeCtaCooldown', {
      time: formatCooldown(adCooldownRemainingMs),
    });
  }

  const paidActionLabel = isPurchaseLoading
    ? t('app.premium.purchaseLoading')
    : t('app.premium.passCta');
  const lifetimeActionLabel = isPurchaseLoading
    ? t('app.premium.purchaseLoading')
    : t('app.premium.lifetimeCta');

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      snapPoints={snapPoints}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.sheetBackground}
      handleIndicatorStyle={styles.handle}
      enablePanDownToClose
      onDismiss={() => {
        posthog.capture('paywall_dismissed', { has_category: isCategoryUnlock });
        onClose();
      }}>
      <BottomSheetScrollView
        bounces={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.sheetContent,
          { paddingBottom: Math.max(insets.bottom + 22, 32) },
        ]}>
        <View style={styles.hero}>
          <View style={styles.crownMark}>
            <Text style={styles.crownText}>{t('app.premium.offerBadge')}</Text>
          </View>
          <Text style={styles.title}>
            {categoryName
              ? t('app.premium.titleCategory', { category: categoryName })
              : t('app.premium.title')}
          </Text>
          <Text style={styles.subtitle}>{t('app.premium.subtitle')}</Text>
        </View>

        <View style={styles.compareRow}>
          <View style={styles.compareItem}>
            <Text style={styles.compareName}>{t('app.premium.freeName')}</Text>
            <Text style={styles.compareValue}>{t('app.premium.freeValue')}</Text>
          </View>
          <View style={[styles.compareItem, styles.compareItemHot]}>
            <Text style={styles.compareNameHot}>{t('app.premium.passName')}</Text>
            <Text style={styles.compareValueHot}>
              {pass24hPrice ?? formatPrice(monetizationConfig.pricing.pass24h)}
            </Text>
          </View>
          <View style={styles.compareItem}>
            <Text style={styles.compareName}>{t('app.premium.lifetimeName')}</Text>
            <Text style={styles.compareValue}>
              {lifetimePrice ?? formatPrice(monetizationConfig.pricing.lifetime)}
            </Text>
          </View>
        </View>

        <View style={styles.benefits}>
          <Text style={styles.benefit}>{t('app.premium.benefitNoAds')}</Text>
          <Text style={styles.benefit}>{t('app.premium.benefitAllCategories')}</Text>
          <Text style={styles.benefit}>{t('app.premium.benefitUnlimitedPlay')}</Text>
        </View>

        <View style={styles.options}>
          <Pressable
            disabled={isRewardedAdLoading || (isCategoryUnlock && !canWatchAd)}
            onPress={onWatchAdToUnlockSession}
            style={({ pressed }) => [
              styles.option,
              styles.optionFree,
              (isRewardedAdLoading || (isCategoryUnlock && !canWatchAd)) &&
                styles.optionDisabled,
              pressed && styles.pressed,
            ]}>
            <View style={styles.optionCopy}>
              <Text style={styles.optionKicker}>{t('app.premium.freeLabel')}</Text>
              <Text style={styles.optionTitle}>
                {t(isCategoryUnlock ? 'app.premium.freeTitle' : 'app.premium.freeTitleBrowse')}
              </Text>
              <Text style={styles.optionDescription}>
                {t(
                  isCategoryUnlock
                    ? 'app.premium.freeDescription'
                    : 'app.premium.freeDescriptionBrowse',
                  {
                    rounds: monetizationConfig.free.sessionRoundsPerAd,
                  }
                )}
              </Text>
            </View>
            <Text style={styles.optionAction}>{freeActionLabel}</Text>
          </Pressable>

          <Pressable
            disabled={isPurchaseLoading}
            onPress={onUnlock24hPass}
            style={({ pressed }) => [
              styles.option,
              styles.optionPass,
              isPurchaseLoading && styles.optionDisabled,
              pressed && styles.pressed,
            ]}>
            <View style={styles.valueBadge}>
              <Text style={styles.valueBadgeText}>{t('app.premium.mostPopular')}</Text>
            </View>
            <View style={styles.optionCopy}>
              <Text style={styles.optionKickerInverse}>{t('app.premium.passLabel')}</Text>
              <Text style={styles.optionTitleInverse}>{t('app.premium.passTitle')}</Text>
              <Text style={styles.optionDescriptionInverse}>{t('app.premium.passDescription')}</Text>
            </View>
            <Text style={styles.optionActionInverse}>{paidActionLabel}</Text>
          </Pressable>

          <Pressable
            disabled={isPurchaseLoading}
            onPress={onUnlockLifetime}
            style={({ pressed }) => [
              styles.option,
              styles.optionLifetime,
              isPurchaseLoading && styles.optionDisabled,
              pressed && styles.pressed,
            ]}>
            <View style={styles.optionCopy}>
              <Text style={styles.optionKicker}>{t('app.premium.lifetimeLabel')}</Text>
              <Text style={styles.optionTitle}>{t('app.premium.lifetimeTitle')}</Text>
              <Text style={styles.optionDescription}>{t('app.premium.lifetimeDescription')}</Text>
            </View>
            <Text style={styles.optionAction}>{lifetimeActionLabel}</Text>
          </Pressable>
        </View>

        {purchaseError ? <Text style={styles.errorText}>{purchaseError}</Text> : null}

        <View style={styles.utilityActions}>
          {onOpenRevenueCatPaywall ? (
            <Pressable
              disabled={isPurchaseLoading}
              onPress={onOpenRevenueCatPaywall}
              style={({ pressed }) => [
                styles.utilityButton,
                pressed && styles.pressed,
                isPurchaseLoading && styles.optionDisabled,
              ]}>
              <Text style={styles.utilityButtonText}>{t('app.premium.revenueCatPaywall')}</Text>
            </Pressable>
          ) : null}

          {onRestorePurchases ? (
            <Pressable
              disabled={isPurchaseLoading}
              onPress={onRestorePurchases}
              style={({ pressed }) => [
                styles.utilityButton,
                pressed && styles.pressed,
                isPurchaseLoading && styles.optionDisabled,
              ]}>
              <Text style={styles.utilityButtonText}>{t('app.premium.restorePurchases')}</Text>
            </Pressable>
          ) : null}

          {onOpenCustomerCenter ? (
            <Pressable
              disabled={isPurchaseLoading}
              onPress={onOpenCustomerCenter}
              style={({ pressed }) => [
                styles.utilityButton,
                pressed && styles.pressed,
                isPurchaseLoading && styles.optionDisabled,
              ]}>
              <Text style={styles.utilityButtonText}>{t('app.premium.managePurchases')}</Text>
            </Pressable>
          ) : null}
        </View>

        <Pressable onPress={onClose} style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
          <Text style={styles.closeText}>{t('app.premium.notNow')}</Text>
        </Pressable>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(3, 7, 18, 0.62)',
  },
  sheetBackground: {
    backgroundColor: '#FFF8EA',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
  },
  sheetContent: {
    paddingHorizontal: 18,
    paddingTop: 10,
    shadowColor: '#030712',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.18,
    shadowRadius: 26,
    elevation: 18,
  },
  handle: {
    width: 46,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#D6C5A1',
  },
  hero: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
  },
  crownMark: {
    minWidth: 76,
    alignItems: 'center',
    borderRadius: 999,
    backgroundColor: '#111827',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  crownText: {
    color: '#FDE68A',
    fontSize: 13,
    fontWeight: '900',
  },
  title: {
    color: '#16120C',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
  },
  subtitle: {
    color: '#6B5A39',
    fontSize: 14,
    lineHeight: 19,
    textAlign: 'center',
  },
  compareRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  compareItem: {
    flex: 1,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F2DCA6',
    paddingHorizontal: 8,
  },
  compareItemHot: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  compareName: {
    color: '#6B5A39',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  compareNameHot: {
    color: '#FDE68A',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  compareValue: {
    color: '#16120C',
    fontSize: 14,
    fontWeight: '900',
  },
  compareValueHot: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  benefits: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginTop: 10,
  },
  benefit: {
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    color: '#111827',
    fontSize: 11,
    fontWeight: '900',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  options: {
    gap: 9,
    marginTop: 14,
  },
  option: {
    borderRadius: 17,
    padding: 14,
    minHeight: 98,
  },
  optionFree: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F2DCA6',
  },
  optionPass: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#111827',
    shadowColor: '#F97316',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 10,
  },
  optionLifetime: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#111827',
  },
  optionDisabled: {
    opacity: 0.52,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }],
  },
  optionCopy: {
    gap: 4,
    paddingRight: 82,
  },
  optionKicker: {
    color: '#F97316',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  optionKickerInverse: {
    color: '#FDE68A',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  optionTitle: {
    color: '#16120C',
    fontSize: 17,
    fontWeight: '900',
  },
  optionTitleInverse: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
  },
  optionDescription: {
    color: '#6B5A39',
    fontSize: 13,
    lineHeight: 18,
  },
  optionDescriptionInverse: {
    color: 'rgba(255, 255, 255, 0.76)',
    fontSize: 13,
    lineHeight: 18,
  },
  optionAction: {
    position: 'absolute',
    right: 15,
    bottom: 15,
    color: '#111827',
    fontSize: 13,
    fontWeight: '900',
  },
  optionActionInverse: {
    position: 'absolute',
    right: 15,
    bottom: 15,
    color: '#FDE68A',
    fontSize: 13,
    fontWeight: '900',
  },
  valueBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    borderRadius: 999,
    backgroundColor: '#F97316',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  valueBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
    marginTop: 8,
    textAlign: 'center',
  },
  utilityActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginTop: 12,
  },
  utilityButton: {
    minHeight: 34,
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: 'rgba(17, 24, 39, 0.08)',
    paddingHorizontal: 12,
  },
  utilityButtonText: {
    color: '#111827',
    fontSize: 11,
    fontWeight: '900',
  },
  close: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42,
    marginTop: 6,
  },
  closeText: {
    color: '#6B5A39',
    fontSize: 15,
    fontWeight: '800',
  },
});
