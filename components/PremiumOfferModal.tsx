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

type PremiumOfferModalProps = {
  visible: boolean;
  categoryName?: string;
  adCooldownRemainingMs: number;
  canWatchAd: boolean;
  onClose: () => void;
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
  onClose,
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

  const freeActionLabel =
    isCategoryUnlock && canWatchAd
      ? t('app.premium.freeCtaAd')
      : isCategoryUnlock
        ? t('app.premium.freeCtaCooldown', { time: formatCooldown(adCooldownRemainingMs) })
        : t('app.premium.freeCtaBrowse');

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      snapPoints={snapPoints}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.sheetBackground}
      handleIndicatorStyle={styles.handle}
      enablePanDownToClose
      onDismiss={onClose}>
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
            <Text style={styles.compareValueHot}>{formatPrice(monetizationConfig.pricing.pass24h)}</Text>
          </View>
          <View style={styles.compareItem}>
            <Text style={styles.compareName}>{t('app.premium.lifetimeName')}</Text>
            <Text style={styles.compareValue}>{formatPrice(monetizationConfig.pricing.lifetime)}</Text>
          </View>
        </View>

        <View style={styles.benefits}>
          <Text style={styles.benefit}>{t('app.premium.benefitNoAds')}</Text>
          <Text style={styles.benefit}>{t('app.premium.benefitAllCategories')}</Text>
          <Text style={styles.benefit}>{t('app.premium.benefitUnlimitedPlay')}</Text>
        </View>

        <View style={styles.options}>
          <Pressable
            disabled={isCategoryUnlock && !canWatchAd}
            onPress={onWatchAdToUnlockSession}
            style={({ pressed }) => [
              styles.option,
              styles.optionFree,
              isCategoryUnlock && !canWatchAd && styles.optionDisabled,
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
            onPress={onUnlock24hPass}
            style={({ pressed }) => [styles.option, styles.optionPass, pressed && styles.pressed]}>
            <View style={styles.valueBadge}>
              <Text style={styles.valueBadgeText}>{t('app.premium.mostPopular')}</Text>
            </View>
            <View style={styles.optionCopy}>
              <Text style={styles.optionKickerInverse}>{t('app.premium.passLabel')}</Text>
              <Text style={styles.optionTitleInverse}>{t('app.premium.passTitle')}</Text>
              <Text style={styles.optionDescriptionInverse}>{t('app.premium.passDescription')}</Text>
            </View>
            <Text style={styles.optionActionInverse}>{t('app.premium.passCta')}</Text>
          </Pressable>

          <Pressable
            onPress={onUnlockLifetime}
            style={({ pressed }) => [
              styles.option,
              styles.optionLifetime,
              pressed && styles.pressed,
            ]}>
            <View style={styles.optionCopy}>
              <Text style={styles.optionKicker}>{t('app.premium.lifetimeLabel')}</Text>
              <Text style={styles.optionTitle}>{t('app.premium.lifetimeTitle')}</Text>
              <Text style={styles.optionDescription}>{t('app.premium.lifetimeDescription')}</Text>
            </View>
            <Text style={styles.optionAction}>{t('app.premium.lifetimeCta')}</Text>
          </Pressable>
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
