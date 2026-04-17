import { Accelerometer, DeviceMotion, DeviceMotionOrientation } from 'expo-sensors';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import {
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getCategoryItems } from '@/lib/category-items';
import { t } from '@/lib/i18n';

const TOTAL_TIME_IN_SECONDS = 120;
const TILT_TRIGGER_THRESHOLD = 0.58;
const TILT_NEUTRAL_THRESHOLD = 0.14;
const TILT_COOLDOWN_MS = 500;
const DEVICE_MOTION_UPDATE_MS = 100;
const ACCELEROMETER_UPDATE_MS = 70;
const PORTRAIT_STABILITY_MS = 420;
const LANDSCAPE_STABILITY_MS = 120;

type FeedbackTone = 'pass' | 'correct' | null;

type DevicePosture = 'portrait' | 'landscape' | 'unknown';

const rotateDeviceWarningImage = require('../assets/images/rotate-device-warning.png');

function getDevicePosture(orientation: DeviceMotionOrientation): DevicePosture {
  if (
    orientation === DeviceMotionOrientation.LeftLandscape ||
    orientation === DeviceMotionOrientation.RightLandscape
  ) {
    return 'landscape';
  }

  if (
    orientation === DeviceMotionOrientation.Portrait ||
    orientation === DeviceMotionOrientation.UpsideDown
  ) {
    return 'portrait';
  }

  return 'unknown';
}

function getScreenOrientationFromDeviceMotion(
  orientation: DeviceMotionOrientation
): ScreenOrientation.Orientation {
  switch (orientation) {
    case DeviceMotionOrientation.LeftLandscape:
      return ScreenOrientation.Orientation.LANDSCAPE_LEFT;
    case DeviceMotionOrientation.RightLandscape:
      return ScreenOrientation.Orientation.LANDSCAPE_RIGHT;
    case DeviceMotionOrientation.UpsideDown:
      return ScreenOrientation.Orientation.PORTRAIT_DOWN;
    case DeviceMotionOrientation.Portrait:
    default:
      return ScreenOrientation.Orientation.PORTRAIT_UP;
  }
}

function getHorizontalTilt(
  x: number,
  y: number,
  orientation: ScreenOrientation.Orientation
) {
  switch (orientation) {
    case ScreenOrientation.Orientation.PORTRAIT_UP:
      return x;
    case ScreenOrientation.Orientation.PORTRAIT_DOWN:
      return -x;
    case ScreenOrientation.Orientation.LANDSCAPE_LEFT:
      return -y;
    case ScreenOrientation.Orientation.LANDSCAPE_RIGHT:
      return y;
    default:
      return x;
  }
}

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
  const [devicePosture, setDevicePosture] = useState<DevicePosture>('unknown');
  const isLandscape = devicePosture === 'landscape';
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
  const tiltReadyRef = useRef(false);
  const lastTiltTriggerAtRef = useRef(0);
  const orientationRef = useRef(ScreenOrientation.Orientation.PORTRAIT_UP);
  const devicePostureRef = useRef<DevicePosture>(devicePosture);
  const postureCandidateRef = useRef<DevicePosture | null>(null);
  const postureCandidateSinceRef = useRef(0);

  const hasItems = items.length > 0;
  const isFinished = timeLeft === 0;
  const currentItem = hasItems ? items[currentIndex] : undefined;
  const isFeedbackActive = feedbackTone !== null;
  const isOrientationBlocked = !isLandscape && !isFinished;
  const feedbackColor = feedbackTone === 'correct' ? '#16A34A' : '#DC2626';
  const isFinishedRef = useRef(isFinished);
  const isFeedbackActiveRef = useRef(isFeedbackActive);
  const hasItemsRef = useRef(hasItems);
  const handlePassRef = useRef<() => void>(() => {});
  const handleCorrectRef = useRef<() => void>(() => {});

  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.DEFAULT);
    void ScreenOrientation.getOrientationAsync().then((orientation) => {
      orientationRef.current = orientation;
    });

    const orientationSubscription = ScreenOrientation.addOrientationChangeListener((event) => {
      orientationRef.current = event.orientationInfo.orientation;
    });

    return () => {
      ScreenOrientation.removeOrientationChangeListener(orientationSubscription);
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, []);

  useEffect(() => {
    isFinishedRef.current = isFinished;
  }, [isFinished]);

  useEffect(() => {
    isFeedbackActiveRef.current = isFeedbackActive;
  }, [isFeedbackActive]);

  useEffect(() => {
    hasItemsRef.current = hasItems;
  }, [hasItems]);

  useEffect(() => {
    devicePostureRef.current = devicePosture;
  }, [devicePosture]);

  useEffect(() => {
    tiltReadyRef.current = false;
    lastTiltTriggerAtRef.current = 0;
  }, [roundSeed]);

  useEffect(() => {
    if (isFinished || !isLandscape) {
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
  }, [isFinished, isLandscape]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    DeviceMotion.setUpdateInterval(DEVICE_MOTION_UPDATE_MS);

    const subscription = DeviceMotion.addListener(({ orientation }) => {
      orientationRef.current = getScreenOrientationFromDeviceMotion(orientation);
      const nextPosture = getDevicePosture(orientation);

      if (nextPosture === 'unknown') {
        postureCandidateRef.current = null;
        return;
      }

      if (devicePostureRef.current === nextPosture) {
        postureCandidateRef.current = null;
        return;
      }

      if (postureCandidateRef.current !== nextPosture) {
        postureCandidateRef.current = nextPosture;
        postureCandidateSinceRef.current = Date.now();
        return;
      }

      const stabilityThreshold =
        nextPosture === 'portrait' ? PORTRAIT_STABILITY_MS : LANDSCAPE_STABILITY_MS;

      if (Date.now() - postureCandidateSinceRef.current < stabilityThreshold) {
        return;
      }

      postureCandidateRef.current = null;
      devicePostureRef.current = nextPosture;
      setDevicePosture(nextPosture);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    Accelerometer.setUpdateInterval(ACCELEROMETER_UPDATE_MS);

    const subscription = Accelerometer.addListener(({ x, y }) => {
      if (
        devicePostureRef.current !== 'landscape' ||
        isFinishedRef.current ||
        isFeedbackActiveRef.current ||
        !hasItemsRef.current
      ) {
        return;
      }

      const horizontalTilt = getHorizontalTilt(x, y, orientationRef.current);
      const absoluteTilt = Math.abs(horizontalTilt);

      if (absoluteTilt <= TILT_NEUTRAL_THRESHOLD) {
        tiltReadyRef.current = true;
        return;
      }

      if (!tiltReadyRef.current) {
        return;
      }

      if (absoluteTilt < TILT_TRIGGER_THRESHOLD) {
        return;
      }

      const now = Date.now();
      if (now - lastTiltTriggerAtRef.current < TILT_COOLDOWN_MS) {
        return;
      }

      tiltReadyRef.current = false;
      lastTiltTriggerAtRef.current = now;

      if (horizontalTilt < 0) {
        handleCorrectRef.current();
        return;
      }

      handlePassRef.current();
    });

    return () => {
      subscription.remove();
    };
  }, []);

  handlePassRef.current = handlePass;
  handleCorrectRef.current = handleCorrect;

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
    router.dismissAll();
    router.replace('/categories');
  }

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top + (isLandscape ? 12 : 20),
          paddingBottom: insets.bottom + (isLandscape ? 12 : 20),
        },
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
        {isOrientationBlocked ? (
          <View style={styles.pausedBadge}>
            <Text style={styles.pausedBadgeText}>{t('app.game.paused')}</Text>
          </View>
        ) : null}
      </View>

      <Animated.View
        style={[
          styles.content,
          isLandscape && styles.contentLandscape,
          {
            transform: [{ scale: contentScale }, { translateY: contentTranslateY }],
          },
        ]}>
        {isFinished ? (
          <View style={styles.resultContainer}>
            <Text style={styles.resultTitle}>{t('app.game.timeUp')}</Text>
            <Text style={styles.resultLabel}>{t('app.game.scoreLabel')}</Text>
            <Text style={styles.resultScore}>{score}</Text>
          </View>
        ) : isOrientationBlocked ? (
          <View style={styles.orientationWarning}>
            <Image
              source={rotateDeviceWarningImage}
              style={styles.orientationWarningImage}
              resizeMode="contain"
            />
            <Text style={styles.orientationWarningTitle}>
              {t('app.game.tiltHintPortraitTitle')}
            </Text>
            <Text style={styles.orientationWarningDescription}>
              {t('app.game.tiltHintPortrait')}
            </Text>
          </View>
        ) : (
          <View style={[styles.itemContent, isLandscape && styles.itemContentLandscape]}>
            <Text
              style={[
                styles.nameText,
                isLandscape && styles.nameTextLandscape,
                isFeedbackActive && styles.inverseText,
              ]}>
              {currentItem ? t(currentItem.nameKey) : t('app.game.empty')}
            </Text>
            {currentItem ? (
              <Text
                style={[
                  styles.descriptionText,
                  isLandscape && styles.descriptionTextLandscape,
                  isFeedbackActive && styles.inverseSubtext,
                ]}>
                {t(currentItem.descriptionKey)}
              </Text>
            ) : null}
          </View>
        )}
      </Animated.View>

      <View style={[styles.bottomArea, isLandscape && styles.bottomAreaLandscape]}>
        {isFinished ? (
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
        ) : (
          <View style={styles.gameActions}>
            <Text style={[styles.tiltHint, isFeedbackActive && styles.inverseSubtext]}>
              {t(isLandscape ? 'app.game.tiltHint' : 'app.game.tiltHintPortrait')}
            </Text>
            <View style={[styles.actions, isLandscape && styles.actionsLandscape]}>
              <Pressable
                disabled={isOrientationBlocked || isFeedbackActive}
                onPress={handleCorrect}
                style={({ pressed }) => [
                  styles.primaryButton,
                  isLandscape && styles.actionButtonLandscape,
                  isOrientationBlocked && styles.disabledButton,
                  isFeedbackActive && styles.inverseButton,
                  pressed && styles.buttonPressed,
                ]}>
                <Text
                  style={[
                    styles.primaryButtonText,
                    isFeedbackActive && styles.inverseButtonText,
                  ]}>
                  {t('app.game.correct')}
                </Text>
              </Pressable>

              <Pressable
                disabled={isOrientationBlocked || isFeedbackActive}
                onPress={handlePass}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  isLandscape && styles.actionButtonLandscape,
                  isOrientationBlocked && styles.disabledButton,
                  isFeedbackActive && styles.inverseButton,
                  pressed && styles.buttonPressed,
                ]}>
                <Text
                  style={[
                    styles.secondaryButtonText,
                    isFeedbackActive && styles.inverseButtonText,
                  ]}>
                  {t('app.game.pass')}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
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
    minHeight: 56,
    gap: 10,
  },
  timer: {
    fontSize: 34,
    fontWeight: '700',
    color: '#0F172A',
  },
  pausedBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#FDE68A',
  },
  pausedBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: '#92400E',
  },
  inverseText: {
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  contentLandscape: {
    justifyContent: 'center',
  },
  itemContent: {
    alignItems: 'center',
    gap: 14,
  },
  itemContentLandscape: {
    maxWidth: 760,
  },
  nameText: {
    fontSize: 36,
    fontWeight: '800',
    textAlign: 'center',
    color: '#111827',
  },
  nameTextLandscape: {
    fontSize: 30,
  },
  descriptionText: {
    maxWidth: 320,
    fontSize: 18,
    lineHeight: 28,
    textAlign: 'center',
    color: '#475569',
  },
  descriptionTextLandscape: {
    maxWidth: 680,
    fontSize: 16,
    lineHeight: 24,
  },
  inverseSubtext: {
    color: 'rgba(255, 255, 255, 0.92)',
  },
  resultContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    width: '100%',
  },
  orientationWarning: {
    width: '100%',
    maxWidth: 520,
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 24,
    paddingVertical: 28,
    borderRadius: 28,
    backgroundColor: '#FEF2F2',
    borderWidth: 2,
    borderColor: '#DC2626',
  },
  orientationWarningImage: {
    width: '100%',
    maxWidth: 320,
    height: 220,
  },
  orientationWarningTitle: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    color: '#B91C1C',
  },
  orientationWarningDescription: {
    fontSize: 17,
    lineHeight: 26,
    textAlign: 'center',
    color: '#7F1D1D',
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
  gameActions: {
    gap: 10,
  },
  actionsLandscape: {
    width: '100%',
  },
  actionButtonLandscape: {
    minHeight: 52,
  },
  bottomArea: {
    width: '100%',
    alignSelf: 'center',
    paddingTop: 16,
  },
  bottomAreaLandscape: {
    maxWidth: 560,
  },
  finishedActions: {
    width: '100%',
    flexDirection: 'row',
    gap: 12,
  },
  finishedButton: {
    flex: 1,
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
  disabledButton: {
    opacity: 0.5,
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
  tiltHint: {
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
    color: '#64748B',
  },
  inverseButtonText: {
    color: '#FFFFFF',
  },
  feedbackOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
});
