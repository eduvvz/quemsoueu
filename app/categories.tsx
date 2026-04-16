import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import categoriesData from '@/assets/categories/categories.json';
import { t } from '@/lib/i18n';

type Category = (typeof categoriesData)[number];

const categories = [...categoriesData].sort((first, second) => first.order - second.order);

export default function CategoriesScreen() {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const insets = useSafeAreaInsets();
  const isAdvanceEnabled = selectedIds.length > 0;

  function toggleCategory(categoryId: string) {
    setSelectedIds((current) =>
      current.includes(categoryId)
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId]
    );
  }

  function renderCategory({ item }: { item: Category }) {
    const isSelected = selectedIds.includes(item.id);

    return (
      <Pressable
        onPress={() => toggleCategory(item.id)}
        style={({ pressed }) => [
          styles.card,
          isSelected && styles.cardSelected,
          pressed && styles.cardPressed,
        ]}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{t(item.nameKey)}</Text>
          <View style={[styles.checkmark, isSelected && styles.checkmarkSelected]}>
            <Text style={[styles.checkmarkText, isSelected && styles.checkmarkTextSelected]}>
              {isSelected ? '✓' : ''}
            </Text>
          </View>
        </View>

        <Text style={styles.cardDescription}>{t(item.descriptionKey)}</Text>
      </Pressable>
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
      <FlatList
        data={categories}
        renderItem={renderCategory}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 140 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.header}>
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
          <Text
            style={[
              styles.advanceButtonText,
              !isAdvanceEnabled && styles.advanceButtonTextDisabled,
            ]}>
            {t('app.categories.advance')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 20,
    paddingBottom: 32,
    gap: 12,
  },
  header: {
    marginBottom: 8,
    gap: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: '#475569',
  },
  card: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    padding: 18,
    gap: 10,
  },
  cardSelected: {
    borderColor: '#111827',
    backgroundColor: '#F1F5F9',
  },
  cardPressed: {
    opacity: 0.9,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  cardDescription: {
    fontSize: 15,
    lineHeight: 22,
    color: '#475569',
  },
  checkmark: {
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkmarkSelected: {
    borderColor: '#111827',
    backgroundColor: '#111827',
  },
  checkmarkText: {
    fontSize: 16,
    fontWeight: '700',
    color: 'transparent',
  },
  checkmarkTextSelected: {
    color: '#FFFFFF',
  },
  footer: {
    marginTop: 8,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: '#64748B',
  },
  actionBar: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  advanceButton: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#111827',
  },
  advanceButtonDisabled: {
    backgroundColor: '#CBD5E1',
  },
  advanceButtonPressed: {
    opacity: 0.92,
  },
  advanceButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  advanceButtonTextDisabled: {
    color: '#F8FAFC',
  },
});
