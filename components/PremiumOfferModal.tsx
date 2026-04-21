import {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@/lib/i18n';

type PremiumOfferModalProps = {
  visible: boolean;
  categoryName?: string;
  onClose: () => void;
  onWatchAd: () => void;
  onRemoveAds: () => void;
};

export function PremiumOfferModal({
  visible,
  categoryName,
  onClose,
  onWatchAd,
  onRemoveAds,
}: PremiumOfferModalProps) {
  const insets = useSafeAreaInsets();
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['78%'], []);

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

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      snapPoints={snapPoints}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.sheetBackground}
      handleIndicatorStyle={styles.handle}
      enablePanDownToClose
      onDismiss={onClose}>
      <BottomSheetView
        style={[styles.sheetContent, { paddingBottom: Math.max(insets.bottom + 18, 28) }]}>
        <View style={styles.hero}>
          <View style={styles.crownMark}>
            <Text style={styles.crownText}>PRO</Text>
          </View>
          <Text style={styles.title}>
            {categoryName
              ? t('app.premium.titleCategory', { category: categoryName })
              : t('app.premium.title')}
          </Text>
          <Text style={styles.subtitle}>{t('app.premium.subtitle')}</Text>
        </View>

        <View style={styles.options}>
          <Pressable
            onPress={onWatchAd}
            style={({ pressed }) => [styles.option, styles.optionAd, pressed && styles.pressed]}>
            <View style={styles.optionCopy}>
              <Text style={styles.optionKicker}>{t('app.premium.watchAdLabel')}</Text>
              <Text style={styles.optionTitle}>{t('app.premium.watchAdTitle')}</Text>
              <Text style={styles.optionDescription}>{t('app.premium.watchAdDescription')}</Text>
            </View>
            <Text style={styles.optionAction}>{t('app.premium.watchAdCta')}</Text>
          </Pressable>

          <Pressable
            onPress={onRemoveAds}
            style={({ pressed }) => [
              styles.option,
              styles.optionLifetime,
              pressed && styles.pressed,
            ]}>
            <View style={styles.valueBadge}>
              <Text style={styles.valueBadgeText}>{t('app.premium.bestValue')}</Text>
            </View>
            <View style={styles.optionCopy}>
              <Text style={styles.optionKickerInverse}>{t('app.premium.removeAdsLabel')}</Text>
              <Text style={styles.optionTitleInverse}>{t('app.premium.removeAdsTitle')}</Text>
              <Text style={styles.optionDescriptionInverse}>
                {t('app.premium.removeAdsDescription')}
              </Text>
            </View>
            <Text style={styles.optionActionInverse}>{t('app.premium.removeAdsCta')}</Text>
          </Pressable>
        </View>

        <Pressable onPress={onClose} style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
          <Text style={styles.closeText}>{t('app.premium.notNow')}</Text>
        </Pressable>
      </BottomSheetView>
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
    paddingTop: 14,
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
    gap: 8,
    paddingHorizontal: 10,
  },
  crownMark: {
    minWidth: 76,
    alignItems: 'center',
    borderRadius: 999,
    backgroundColor: '#111827',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  crownText: {
    color: '#FDE68A',
    fontSize: 14,
    fontWeight: '900',
  },
  title: {
    color: '#16120C',
    fontSize: 27,
    fontWeight: '900',
    textAlign: 'center',
  },
  subtitle: {
    color: '#6B5A39',
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
  options: {
    gap: 12,
    marginTop: 22,
  },
  option: {
    borderRadius: 18,
    padding: 16,
    minHeight: 126,
  },
  optionAd: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F2DCA6',
  },
  optionLifetime: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#111827',
    shadowColor: '#F97316',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 10,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }],
  },
  optionCopy: {
    gap: 4,
    paddingRight: 72,
  },
  optionKicker: {
    color: '#F97316',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  optionKickerInverse: {
    color: '#FDE68A',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  optionTitle: {
    color: '#16120C',
    fontSize: 20,
    fontWeight: '900',
  },
  optionTitleInverse: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
  },
  optionDescription: {
    color: '#6B5A39',
    fontSize: 14,
    lineHeight: 20,
  },
  optionDescriptionInverse: {
    color: 'rgba(255, 255, 255, 0.76)',
    fontSize: 14,
    lineHeight: 20,
  },
  optionAction: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    color: '#111827',
    fontSize: 14,
    fontWeight: '900',
  },
  optionActionInverse: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    color: '#FDE68A',
    fontSize: 14,
    fontWeight: '900',
  },
  valueBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    borderRadius: 999,
    backgroundColor: '#F97316',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  valueBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
  close: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    marginTop: 12,
  },
  closeText: {
    color: '#6B5A39',
    fontSize: 15,
    fontWeight: '800',
  },
});
