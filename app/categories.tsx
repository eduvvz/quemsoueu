import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import categoriesData from '@/assets/categories/categories.json';
import { PremiumOfferModal } from '@/components/PremiumOfferModal';
import { t } from '@/lib/i18n';
import { usePremiumAccess } from '@/lib/premium-access';

type Category = (typeof categoriesData)[number];

const categories = [...categoriesData].sort((first, second) => first.order - second.order);

const categoryMarks: Record<string, string> = {
  movies_tv: 'TV',
  superheroes_villains: 'HERO',
  video_game_characters: 'GAME',
  celebrities: 'STAR',
  athletes: 'CUP',
  musicians: 'BEAT',
  cartoons_animation: 'TOON',
  fantasy_creatures: 'FANT',
  animals: 'WILD',
  food: 'FOOD',
  professions: 'JOB',
  everyday_objects: 'OBJ',
  famous_brands: 'SHOP',
  countries: 'GLOBE',
  party_mode: 'MIX',
};

export default function CategoriesScreen() {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [premiumCategory, setPremiumCategory] = useState<Category | null>(null);
  const insets = useSafeAreaInsets();
  const { adsRemoved, getUnlockLabel, isCategoryUnlocked, removeAdsForever, unlockCategoryFor24h } =
    usePremiumAccess();
  const isAdvanceEnabled = selectedIds.length > 0;

  function toggleCategory(category: Category) {
    const isUnlocked = isCategoryUnlocked(category.id, category.isPremium);

    if (!isUnlocked) {
      setPremiumCategory(category);
      return;
    }

    setSelectedIds((current) =>
      current.includes(category.id)
        ? current.filter((id) => id !== category.id)
        : [...current, category.id]
    );
  }

  function handleWatchAdUnlock() {
    if (!premiumCategory) {
      return;
    }

    unlockCategoryFor24h(premiumCategory.id);
    setSelectedIds((current) =>
      current.includes(premiumCategory.id) ? current : [...current, premiumCategory.id]
    );
    setPremiumCategory(null);
  }

  function handleRemoveAds() {
    removeAdsForever();

    if (premiumCategory) {
      setSelectedIds((current) =>
        current.includes(premiumCategory.id) ? current : [...current, premiumCategory.id]
      );
    }

    setPremiumCategory(null);
  }

  function renderCategory({ item }: { item: Category }) {
    const isSelected = selectedIds.includes(item.id);
    const isPremium = item.isPremium;
    const isUnlocked = isCategoryUnlocked(item.id, isPremium);
    const unlockLabel = isPremium ? getUnlockLabel(item.id) : 'free';
    const isLocked = isPremium && !isUnlocked;
    const badgeText = isPremium
      ? t(`app.categories.badges.${unlockLabel}`)
      : t('app.categories.badges.free');

    return (
      <View style={styles.tileSlot}>
        <Pressable
          onPress={() => toggleCategory(item)}
          style={({ pressed }) => [
            styles.modeTile,
            isPremium && styles.modeTilePremium,
            isLocked && styles.modeTileLocked,
            isSelected && styles.modeTileSelected,
            pressed && styles.tilePressed,
          ]}>
          <View style={styles.tileTopRow}>
            <View
              style={[
                styles.mark,
                isPremium && styles.markPremium,
                isSelected && styles.markSelected,
              ]}>
              <Text style={[styles.markText, isPremium && styles.markTextPremium]}>
                {categoryMarks[item.id] ?? 'PLAY'}
              </Text>
            </View>
            <View
              style={[
                styles.statePill,
                isPremium && styles.statePillPremium,
                isSelected && styles.statePillSelected,
              ]}>
              <Text
                style={[
                  styles.statePillText,
                  isPremium && styles.statePillTextPremium,
                  isSelected && styles.statePillTextSelected,
                ]}>
                {isSelected ? t('app.categories.badges.selected') : badgeText}
              </Text>
            </View>
          </View>

          <View style={styles.tileCopy}>
            <Text style={[styles.cardTitle, isLocked && styles.lockedText]} numberOfLines={2}>
              {t(item.nameKey)}
            </Text>
            <Text
              style={[styles.cardDescription, isLocked && styles.lockedDescription]}
              numberOfLines={3}>
              {t(item.descriptionKey)}
            </Text>
          </View>

          <View style={[styles.tileAccent, isPremium && styles.tileAccentPremium]} />
        </Pressable>
      </View>
    );
  }

  function getSelectionText() {
    if (selectedIds.length === 0) {
      return t('app.categories.selection.empty');
    }

    if (selectedIds.length === 1) {
      return t('app.categories.selection.one');
    }

    return t('app.categories.selection.other', { count: selectedIds.length });
  }

  return (
    <View style={styles.container}>
      <View pointerEvents="none" style={styles.backdrop}>
        <View style={[styles.ray, styles.rayOne]} />
        <View style={[styles.ray, styles.rayTwo]} />
      </View>

      <FlatList
        data={categories}
        renderItem={renderCategory}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.column}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 140 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
              <Pressable
                onPress={() => router.back()}
                style={({ pressed }) => [styles.backButton, pressed && styles.tilePressed]}>
                <Text style={styles.backButtonText}>{t('app.navigation.back')}</Text>
              </Pressable>
              <Pressable
                onPress={() => setPremiumCategory(categories.find((category) => category.isPremium) ?? null)}
                style={({ pressed }) => [styles.premiumButton, pressed && styles.tilePressed]}>
                <Text style={styles.premiumButtonText}>
                  {adsRemoved ? t('app.home.adsRemoved') : t('app.home.removeAds')}
                </Text>
              </Pressable>
            </View>
            <Text style={styles.eyebrow}>{t('app.categories.eyebrow')}</Text>
            <Text style={styles.title}>{t('app.categories.title')}</Text>
            <Text style={styles.subtitle}>{t('app.categories.subtitle')}</Text>
          </View>
        }
        ListFooterComponent={
          <View style={styles.footer}>
            <Text style={styles.footerText}>{getSelectionText()}</Text>
          </View>
        }
      />
      <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.actionSummary}>
          <Text style={styles.footerText}>{getSelectionText()}</Text>
          <Text style={styles.actionHint}>{t('app.categories.actionHint')}</Text>
        </View>
        <Pressable
          disabled={!isAdvanceEnabled}
          onPress={() =>
            router.push({
              pathname: '/game',
              params: {
                categories: selectedIds.join(','),
              },
            })
          }
          style={({ pressed }) => [
            styles.advanceButton,
            !isAdvanceEnabled && styles.advanceButtonDisabled,
            pressed && isAdvanceEnabled && styles.advanceButtonPressed,
          ]}>
          <Text style={[styles.advanceButtonText, !isAdvanceEnabled && styles.advanceButtonTextDisabled]}>
            {t('app.categories.advance')}
          </Text>
        </Pressable>
      </View>
      <PremiumOfferModal
        visible={premiumCategory !== null}
        categoryName={premiumCategory ? t(premiumCategory.nameKey) : undefined}
        onClose={() => setPremiumCategory(null)}
        onWatchAd={handleWatchAdUnlock}
        onRemoveAds={handleRemoveAds}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  ray: {
    position: 'absolute',
    width: 30,
    height: 220,
    borderRadius: 12,
    opacity: 0.55,
    transform: [{ rotate: '-23deg' }],
  },
  rayOne: {
    top: 88,
    right: 20,
    backgroundColor: '#F97316',
  },
  rayTwo: {
    top: 360,
    left: -18,
    backgroundColor: '#22D3EE',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 0,
    gap: 14,
  },
  header: {
    gap: 10,
    marginBottom: 6,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  backButton: {
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 14,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  premiumButton: {
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: '#FFF8EA',
    paddingHorizontal: 14,
  },
  premiumButtonText: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '900',
  },
  eyebrow: {
    alignSelf: 'flex-start',
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: '#F97316',
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    paddingHorizontal: 12,
    paddingVertical: 7,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 37,
    color: '#FFFFFF',
  },
  subtitle: {
    maxWidth: 330,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.72)',
  },
  column: {
    gap: 12,
  },
  tileSlot: {
    flex: 1,
  },
  modeTile: {
    minHeight: 198,
    overflow: 'hidden',
    borderRadius: 18,
    backgroundColor: '#FFF8EA',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    padding: 13,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 7,
  },
  modeTilePremium: {
    backgroundColor: '#1F2937',
    borderColor: '#FACC15',
  },
  modeTileLocked: {
    opacity: 0.94,
  },
  modeTileSelected: {
    borderColor: '#22C55E',
    transform: [{ translateY: -2 }],
  },
  tilePressed: {
    opacity: 0.86,
    transform: [{ scale: 0.98 }],
  },
  tileTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  mark: {
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#111827',
    paddingHorizontal: 8,
    paddingVertical: 9,
  },
  markPremium: {
    backgroundColor: '#FACC15',
  },
  markSelected: {
    backgroundColor: '#22C55E',
  },
  markText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
  markTextPremium: {
    color: '#111827',
  },
  statePill: {
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  statePillPremium: {
    backgroundColor: 'rgba(250, 204, 21, 0.16)',
  },
  statePillSelected: {
    backgroundColor: '#22C55E',
  },
  statePillText: {
    color: '#111827',
    fontSize: 10,
    fontWeight: '900',
  },
  statePillTextPremium: {
    color: '#FDE68A',
  },
  statePillTextSelected: {
    color: '#FFFFFF',
  },
  tileCopy: {
    flex: 1,
    justifyContent: 'flex-end',
    gap: 7,
    paddingTop: 18,
  },
  cardTitle: {
    fontSize: 18,
    lineHeight: 21,
    fontWeight: '900',
    color: '#111827',
  },
  cardDescription: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: '#6B5A39',
  },
  lockedText: {
    color: '#FFFFFF',
  },
  lockedDescription: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  tileAccent: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    height: 7,
    backgroundColor: '#22D3EE',
  },
  tileAccentPremium: {
    backgroundColor: '#FACC15',
  },
  footer: {
    marginTop: 4,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  actionBar: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: 'rgba(17, 24, 39, 0.96)',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  actionSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  actionHint: {
    color: 'rgba(255, 255, 255, 0.58)',
    fontSize: 12,
    fontWeight: '800',
  },
  advanceButton: {
    minHeight: 62,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#FACC15',
    shadowColor: '#F97316',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 16,
    elevation: 10,
  },
  advanceButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    shadowOpacity: 0,
  },
  advanceButtonPressed: {
    opacity: 0.92,
    transform: [{ translateY: 2 }, { scale: 0.99 }],
  },
  advanceButtonText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
  },
  advanceButtonTextDisabled: {
    color: 'rgba(255, 255, 255, 0.45)',
  },
});
