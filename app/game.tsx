import { useEffect, useMemo, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getCategoryItems } from '@/lib/category-items';
import { t } from '@/lib/i18n';

const TOTAL_TIME_IN_SECONDS = 120;

type FeedbackTone = 'pass' | 'correct' | null;

function shuffleItems<T>(items: T[]) {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }

  return shuffled;
}

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');

  return `${minutes}:${seconds}`;
}

export default function GameScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ categories?: string }>();
  const selectedCategoryIds = useMemo(
    () => (params.categories ? params.categories.split(',').filter(Boolean) : []),
    [params.categories]
  );
  const [roundSeed, setRoundSeed] = useState(0);
  const items = useMemo(() => {
    const shuffleKey = roundSeed;
    void shuffleKey;

    const resolvedItems = getCategoryItems(selectedCategoryIds);
    const seenNames = new Set<string>();
    const uniqueItems = [...resolvedItems]
      .sort((first, second) => first.order - second.order)
      .filter((item) => {
        const normalizedName = t(item.nameKey).trim().toLocaleLowerCase();

        if (seenNames.has(normalizedName)) {
          return false;
        }

        seenNames.add(normalizedName);
        return true;
      });

    return shuffleItems(uniqueItems);
  }, [roundSeed, selectedCategoryIds]);

  const [timeLeft, setTimeLeft] = useState(TOTAL_TIME_IN_SECONDS);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [feedbackTone, setFeedbackTone] = useState<FeedbackTone>(null);

  const flashOpacity = useRef(new Animated.Value(0)).current;
  const contentScale = useRef(new Animated.Value(1)).current;
  const contentTranslateY = useRef(new Animated.Value(0)).current;

  const hasItems = items.length > 0;
  const isFinished = timeLeft === 0;
  const currentItem = hasItems ? items[currentIndex] : undefined;
  const isFeedbackActive = feedbackTone !== null;
  const feedbackColor = feedbackTone === 'correct' ? '#16A34A' : '#DC2626';

  useEffect(() => {
    if (isFinished) {
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((current) => {
        if (current <= 1) {
          clearInterval(timer);
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isFinished]);

  function goToNextItem() {
    if (!hasItems) {
      return;
    }

    setCurrentIndex((current) => {
      const nextIndex = current + 1;

      if (nextIndex >= items.length) {
        setRoundSeed((currentSeed) => currentSeed + 1);
        return 0;
      }

      return nextIndex;
    });
  }

  function animateFeedback(tone: Exclude<FeedbackTone, null>, callback?: () => void) {
    setFeedbackTone(tone);

    flashOpacity.setValue(0);
    contentScale.setValue(0.94);
    contentTranslateY.setValue(8);

    Animated.parallel([
      Animated.sequence([
        Animated.timing(flashOpacity, {
          toValue: 1,
          duration: 110,
          easing: Easing.out(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(flashOpacity, {
          toValue: 0,
          duration: 260,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
      ]),
      Animated.sequence([
        Animated.parallel([
          Animated.timing(contentScale, {
            toValue: 1.02,
            duration: 140,
            easing: Easing.out(Easing.back(1.4)),
            useNativeDriver: true,
          }),
          Animated.timing(contentTranslateY, {
            toValue: -6,
            duration: 140,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(contentScale, {
            toValue: 1,
            duration: 180,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(contentTranslateY, {
            toValue: 0,
            duration: 180,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start(() => {
      callback?.();
      setFeedbackTone(null);
    });
  }

  function handlePass() {
    if (isFinished) {
      return;
    }

    animateFeedback('pass', goToNextItem);
  }

  function handleCorrect() {
    if (isFinished) {
      return;
    }

    animateFeedback('correct', () => {
      setScore((current) => current + 1);
      goToNextItem();
    });
  }

  function handleRestart() {
    flashOpacity.stopAnimation();
    contentScale.stopAnimation();
    contentTranslateY.stopAnimation();

    flashOpacity.setValue(0);
    contentScale.setValue(1);
    contentTranslateY.setValue(0);
    setFeedbackTone(null);
    setTimeLeft(TOTAL_TIME_IN_SECONDS);
    setCurrentIndex(0);
    setScore(0);
    setRoundSeed((current) => current + 1);
  }

  function handleNewMatch() {
    router.replace('/categories');
  }

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 },
      ]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.feedbackOverlay,
          {
            backgroundColor: feedbackColor,
            opacity: flashOpacity,
          },
        ]}
      />

      <View style={styles.timerContainer}>
        <Text style={[styles.timer, isFeedbackActive && styles.inverseText]}>
          {formatTime(timeLeft)}
        </Text>
      </View>

      <Animated.View
        style={[
          styles.content,
          {
            transform: [{ scale: contentScale }, { translateY: contentTranslateY }],
          },
        ]}>
        {isFinished ? (
          <View style={styles.resultContainer}>
            <Text style={styles.resultTitle}>{t('app.game.timeUp')}</Text>
            <Text style={styles.resultLabel}>{t('app.game.scoreLabel')}</Text>
            <Text style={styles.resultScore}>{score}</Text>
            <View style={styles.finishedActions}>
              <Pressable
                onPress={handleRestart}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  styles.finishedButton,
                  pressed && styles.buttonPressed,
                ]}>
                <Text style={styles.secondaryButtonText}>{t('app.game.restart')}</Text>
              </Pressable>

              <Pressable
                onPress={handleNewMatch}
                style={({ pressed }) => [
                  styles.primaryButton,
                  styles.finishedButton,
                  pressed && styles.buttonPressed,
                ]}>
                <Text style={styles.primaryButtonText}>{t('app.game.newMatch')}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.itemContent}>
            <Text style={[styles.nameText, isFeedbackActive && styles.inverseText]}>
              {currentItem ? t(currentItem.nameKey) : t('app.game.empty')}
            </Text>
            {currentItem ? (
              <Text style={[styles.descriptionText, isFeedbackActive && styles.inverseSubtext]}>
                {t(currentItem.descriptionKey)}
              </Text>
            ) : null}
          </View>
        )}
      </Animated.View>

      {!isFinished && (
        <View style={styles.actions}>
          <Pressable
            onPress={handlePass}
            style={({ pressed }) => [
              styles.secondaryButton,
              isFeedbackActive && styles.inverseButton,
              pressed && styles.buttonPressed,
            ]}>
            <Text style={[styles.secondaryButtonText, isFeedbackActive && styles.inverseButtonText]}>
              {t('app.game.pass')}
            </Text>
          </Pressable>

          <Pressable
            onPress={handleCorrect}
            style={({ pressed }) => [
              styles.primaryButton,
              isFeedbackActive && styles.inverseButton,
              pressed && styles.buttonPressed,
            ]}>
            <Text style={[styles.primaryButtonText, isFeedbackActive && styles.inverseButtonText]}>
              {t('app.game.correct')}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 20,
  },
  timerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  timer: {
    fontSize: 34,
    fontWeight: '700',
    color: '#0F172A',
  },
  inverseText: {
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemContent: {
    alignItems: 'center',
    gap: 14,
  },
  nameText: {
    fontSize: 36,
    fontWeight: '800',
    textAlign: 'center',
    color: '#111827',
  },
  descriptionText: {
    maxWidth: 320,
    fontSize: 18,
    lineHeight: 28,
    textAlign: 'center',
    color: '#475569',
  },
  inverseSubtext: {
    color: 'rgba(255, 255, 255, 0.92)',
  },
  resultContainer: {
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  resultTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  resultLabel: {
    fontSize: 18,
    color: '#64748B',
  },
  resultScore: {
    fontSize: 64,
    fontWeight: '800',
    color: '#111827',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  finishedActions: {
    width: '100%',
    marginTop: 18,
    gap: 12,
  },
  finishedButton: {
    width: '100%',
  },
  primaryButton: {
    flex: 1,
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#111827',
  },
  secondaryButton: {
    flex: 1,
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#E2E8F0',
  },
  buttonPressed: {
    opacity: 0.9,
  },
  inverseButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.32)',
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  secondaryButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  inverseButtonText: {
    color: '#FFFFFF',
  },
  feedbackOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
});
