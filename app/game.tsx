import { Accelerometer, DeviceMotion, DeviceMotionOrientation } from 'expo-sensors';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PremiumOfferModal } from '@/components/PremiumOfferModal';
import { showInterstitialAdBetweenRounds } from '@/lib/admob';
import { getCategoryItems } from '@/lib/category-items';
import { t } from '@/lib/i18n';
import { useMonetization } from '@/lib/monetization';
import { posthog } from '@/lib/posthog';
import { useRevenueCat } from '@/lib/revenuecat';

const TIME_MODES = {
  quick: 60,
  normal: 90,
  party: 120,
} as const;
const TILT_TRIGGER_THRESHOLD = 0.58;
const TILT_NEUTRAL_THRESHOLD = 0.14;
const TILT_COOLDOWN_MS = 500;
const DEVICE_MOTION_UPDATE_MS = 100;
const ACCELEROMETER_UPDATE_MS = 70;
const PORTRAIT_STABILITY_MS = 300;
const LANDSCAPE_STABILITY_MS = 120;
const FINAL_COUNTDOWN_SECONDS = 10;
const URGENT_COUNTDOWN_SECONDS = 5;
const RESUME_COUNTDOWN_SECONDS = 3;
const CONFETTI_PARTICLE_COUNT = 56;
const CONFETTI_COLORS = ['#FACC15', '#22C55E', '#38BDF8', '#A855F7', '#F97316', '#EC4899'];

type FeedbackTone = 'pass' | 'correct' | null;

type DevicePosture = 'portrait' | 'landscape' | 'unknown';
type TimeMode = keyof typeof TIME_MODES;
type PendingRoundAction = 'restart' | 'new_match';

type ConfettiParticle = {
  color: string;
  delay: number;
  driftX: number;
  fallDistance: number;
  left: number;
  rotation: number;
  size: number;
  top: number;
};

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

function playTone(frequency: number, endFrequency: number, duration: number, wave: OscillatorType) {
  if (Platform.OS !== 'web') {
    return;
  }

  const audioContextConstructor =
    (globalThis as typeof globalThis & {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    }).AudioContext ??
    (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!audioContextConstructor) {
    return;
  }

  const audioContext = new audioContextConstructor();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const now = audioContext.currentTime;

  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(frequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration * 0.75);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.01);
}

function playFeedbackSound(tone: Exclude<FeedbackTone, null>) {
  playTone(
    tone === 'correct' ? 880 : 220,
    tone === 'correct' ? 1320 : 160,
    0.16,
    tone === 'correct' ? 'sine' : 'triangle'
  );
}

function playCountdownSound(isUrgent: boolean) {
  playTone(isUrgent ? 740 : 520, isUrgent ? 820 : 560, isUrgent ? 0.08 : 0.06, 'square');
}

function playRoundCompleteSound() {
  playTone(660, 1180, 0.18, 'sine');
  setTimeout(() => playTone(880, 1480, 0.2, 'triangle'), 130);
}

function vibrateRoundComplete() {
  if (Platform.OS === 'ios') {
    Vibration.vibrate();
    setTimeout(() => Vibration.vibrate(), 160);
    setTimeout(() => Vibration.vibrate(), 360);
    return;
  }

  Vibration.vibrate([0, 120, 80, 180, 100, 260]);
}

function createConfettiParticles(screenWidth: number, screenHeight: number): ConfettiParticle[] {
  const spreadWidth = Math.max(screenWidth - 32, 280);
  const fallDistance = Math.max(screenHeight * 0.68, 420);

  return Array.from({ length: CONFETTI_PARTICLE_COUNT }, (_, index) => {
    const ratio = index / (CONFETTI_PARTICLE_COUNT - 1);
    const wave = Math.sin(index * 12.9898) * 43758.5453;
    const randomish = wave - Math.floor(wave);
    const left = 16 + ratio * spreadWidth + (randomish - 0.5) * 18;
    const driftDirection = index % 2 === 0 ? 1 : -1;

    return {
      color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
      delay: (index % 14) * 42,
      driftX: driftDirection * (28 + randomish * 74),
      fallDistance: fallDistance + randomish * 120,
      left,
      rotation: 180 + randomish * 540,
      size: 7 + (index % 5) * 2,
      top: -26 - (index % 4) * 12,
    };
  });
}

export default function GameScreen() {
  const insets = useSafeAreaInsets();
  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;
  const params = useLocalSearchParams<{ categories?: string }>();
  const {
    adCooldownRemainingMs,
    canWatchRewardedAd,
    markRoundCompleted,
    roundsPlayed,
    shouldShowInterstitialAd,
    shouldShowPaywall,
    trackMonetizationEvent,
    unlock24hPass,
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
  const [devicePosture, setDevicePosture] = useState<DevicePosture>('unknown');
  const [isPostRoundPaywallOpen, setIsPostRoundPaywallOpen] = useState(false);
  const [isConfettiVisible, setIsConfettiVisible] = useState(false);
  const [isBetweenRoundsAdLoading, setIsBetweenRoundsAdLoading] = useState(false);
  const [selectedTimeMode, setSelectedTimeMode] = useState<TimeMode>('normal');
  const [isRoundActive, setIsRoundActive] = useState(false);
  const [isTutorialVisible, setIsTutorialVisible] = useState(false);
  const [resumeCountdown, setResumeCountdown] = useState<number | null>(null);
  const isLandscape = devicePosture === 'landscape';
  const isCompactPortrait = !isLandscape && screenWidth < 390;
  const totalTimeInSeconds = TIME_MODES[selectedTimeMode];
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

  const [timeLeft, setTimeLeft] = useState<number>(totalTimeInSeconds);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [passes, setPasses] = useState(0);
  const [correctItems, setCorrectItems] = useState<string[]>([]);
  const [missedItems, setMissedItems] = useState<string[]>([]);
  const [feedbackTone, setFeedbackTone] = useState<FeedbackTone>(null);

  const flashOpacity = useRef(new Animated.Value(0)).current;
  const contentScale = useRef(new Animated.Value(1)).current;
  const contentTranslateY = useRef(new Animated.Value(0)).current;
  const itemOpacity = useRef(new Animated.Value(1)).current;
  const itemTranslateX = useRef(new Animated.Value(0)).current;
  const pointOpacity = useRef(new Animated.Value(0)).current;
  const pointTranslateY = useRef(new Animated.Value(10)).current;
  const tutorialOpacity = useRef(new Animated.Value(0)).current;
  const confettiProgress = useRef(
    Array.from({ length: CONFETTI_PARTICLE_COUNT }, () => new Animated.Value(0))
  ).current;
  const tiltReadyRef = useRef(false);
  const lastTiltTriggerAtRef = useRef(0);
  const orientationRef = useRef(ScreenOrientation.Orientation.PORTRAIT_UP);
  const devicePostureRef = useRef<DevicePosture>(devicePosture);
  const postureCandidateRef = useRef<DevicePosture | null>(null);
  const postureCandidateSinceRef = useRef(0);
  const recordedFinishedRoundSeedRef = useRef<number | null>(null);
  const celebratedFinishedRoundSeedRef = useRef<number | null>(null);
  const didShowPostRoundPaywallRef = useRef(false);
  const postRoundPaywallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRoundActionAfterPaywallRef = useRef<PendingRoundAction | null>(null);
  const wasPausedDuringRoundRef = useRef(false);

  const hasItems = items.length > 0;
  const isFinished = timeLeft === 0;
  const currentItem = hasItems ? items[currentIndex] : undefined;
  const isFeedbackActive = feedbackTone !== null;
  const isOrientationBlocked = isRoundActive && !isLandscape && !isFinished;
  const isResumeCountingDown = resumeCountdown !== null;
  const feedbackColor = feedbackTone === 'correct' ? '#22C55E' : '#EF4444';
  const progressText = hasItems ? `${currentIndex + 1}/${items.length}` : '--';
  const timerProgress = timeLeft / totalTimeInSeconds;
  const isFinalCountdown = isRoundActive && timeLeft <= FINAL_COUNTDOWN_SECONDS && !isFinished;
  const isUrgentCountdown = isRoundActive && timeLeft <= URGENT_COUNTDOWN_SECONDS && !isFinished;
  const confettiParticles = useMemo(
    () => createConfettiParticles(screenWidth, screenHeight),
    [screenHeight, screenWidth]
  );
  const playRoundCompleteCelebration = useCallback(() => {
    confettiProgress.forEach((progress) => {
      progress.stopAnimation();
      progress.setValue(0);
    });

    setIsConfettiVisible(true);
    playRoundCompleteSound();
    vibrateRoundComplete();

    Animated.stagger(
      18,
      confettiProgress.map((progress, index) =>
        Animated.sequence([
          Animated.delay(confettiParticles[index]?.delay ?? 0),
          Animated.timing(progress, {
            toValue: 1,
            duration: 1150 + (index % 6) * 120,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ])
      )
    ).start(() => setIsConfettiVisible(false));
  }, [confettiParticles, confettiProgress]);
  const tapBoundaryX = screenWidth / 2;
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
    if (!isRoundActive || isFinished) {
      wasPausedDuringRoundRef.current = false;
      setResumeCountdown(null);
      return;
    }

    if (isOrientationBlocked) {
      wasPausedDuringRoundRef.current = true;
      setResumeCountdown(null);
      return;
    }

    if (wasPausedDuringRoundRef.current && resumeCountdown === null) {
      wasPausedDuringRoundRef.current = false;
      setResumeCountdown(RESUME_COUNTDOWN_SECONDS);
      Vibration.vibrate(30);
    }
  }, [isFinished, isOrientationBlocked, isRoundActive, resumeCountdown]);

  useEffect(() => {
    if (resumeCountdown === null) {
      return;
    }

    const timer = setTimeout(() => {
      setResumeCountdown((current) => {
        if (current === null || current <= 1) {
          return null;
        }

        Vibration.vibrate(24);
        return current - 1;
      });
    }, 1000);

    return () => clearTimeout(timer);
  }, [resumeCountdown]);

  useEffect(() => {
    if (isRoundActive) {
      return;
    }

    setTimeLeft(totalTimeInSeconds);
  }, [isRoundActive, totalTimeInSeconds]);

  useEffect(() => {
    if (!isRoundActive || !isFinished || recordedFinishedRoundSeedRef.current === roundSeed) {
      return;
    }

    recordedFinishedRoundSeedRef.current = roundSeed;

    if (celebratedFinishedRoundSeedRef.current !== roundSeed) {
      celebratedFinishedRoundSeedRef.current = roundSeed;
      playRoundCompleteCelebration();
    }

    markRoundCompleted(selectedCategoryIds);
    posthog.capture('game_completed', {
      score,
      passes,
      time_mode: selectedTimeMode,
      category_ids: selectedCategoryIds,
      category_count: selectedCategoryIds.length,
    });

    if (!didShowPostRoundPaywallRef.current && shouldShowPaywall('post_round')) {
      didShowPostRoundPaywallRef.current = true;
      trackMonetizationEvent('paywall_viewed', { trigger: 'post_round' });
      postRoundPaywallTimerRef.current = setTimeout(() => {
        postRoundPaywallTimerRef.current = null;
        setIsPostRoundPaywallOpen(true);
      }, 1300);
    }
  }, [
    isFinished,
    isRoundActive,
    markRoundCompleted,
    passes,
    playRoundCompleteCelebration,
    roundSeed,
    score,
    selectedCategoryIds,
    selectedTimeMode,
    shouldShowPaywall,
    trackMonetizationEvent,
  ]);

  useEffect(() => {
    tiltReadyRef.current = false;
    lastTiltTriggerAtRef.current = 0;
  }, [roundSeed]);

  useEffect(() => {
    return () => {
      if (postRoundPaywallTimerRef.current) {
        clearTimeout(postRoundPaywallTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    itemOpacity.setValue(0);
    itemTranslateX.setValue(18);

    Animated.parallel([
      Animated.timing(itemOpacity, {
        toValue: 1,
        duration: 150,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(itemTranslateX, {
        toValue: 0,
        duration: 150,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [currentIndex, itemOpacity, itemTranslateX, roundSeed]);

  useEffect(() => {
    if (!isRoundActive || isFinished || !isLandscape || isResumeCountingDown) {
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
  }, [isFinished, isLandscape, isResumeCountingDown, isRoundActive]);

  useEffect(() => {
    if (!isRoundActive || isFinished || !isLandscape || !isFinalCountdown) {
      return;
    }

    Vibration.vibrate(isUrgentCountdown ? 34 : 18);
    playCountdownSound(isUrgentCountdown);
  }, [isFinalCountdown, isFinished, isLandscape, isRoundActive, isUrgentCountdown, timeLeft]);

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
        !isRoundActive ||
        isResumeCountingDown ||
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
  }, [isResumeCountingDown, isRoundActive]);

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

  function animatePointPop() {
    pointOpacity.setValue(0);
    pointTranslateY.setValue(10);

    Animated.parallel([
      Animated.sequence([
        Animated.timing(pointOpacity, {
          toValue: 1,
          duration: 90,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pointOpacity, {
          toValue: 0,
          duration: 380,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(pointTranslateY, {
        toValue: -22,
        duration: 470,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }

  function animateFeedback(tone: Exclude<FeedbackTone, null>, callback?: () => void) {
    setFeedbackTone(tone);
    Vibration.vibrate(tone === 'correct' ? 36 : [0, 18, 32, 18]);
    playFeedbackSound(tone);

    flashOpacity.setValue(0);
    contentScale.setValue(0.94);
    contentTranslateY.setValue(8);

    Animated.parallel([
      Animated.sequence([
        Animated.timing(flashOpacity, {
          toValue: 1,
          duration: 70,
          easing: Easing.out(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(flashOpacity, {
          toValue: 0,
          duration: 130,
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
    if (
      !isRoundActive ||
      isFinished ||
      isOrientationBlocked ||
      isResumeCountingDown ||
      isFeedbackActive
    ) {
      return;
    }

    const itemName = currentItem ? t(currentItem.nameKey) : t('app.game.empty');

    posthog.capture('word_passed', { word: itemName, category_ids: selectedCategoryIds });
    animateFeedback('pass', () => {
      setPasses((current) => current + 1);
      setMissedItems((current) => [...current, itemName]);
      goToNextItem();
    });
  }

  function handleCorrect() {
    if (
      !isRoundActive ||
      isFinished ||
      isOrientationBlocked ||
      isResumeCountingDown ||
      isFeedbackActive
    ) {
      return;
    }

    const itemName = currentItem ? t(currentItem.nameKey) : t('app.game.empty');

    posthog.capture('word_guessed_correct', { word: itemName, category_ids: selectedCategoryIds });
    animateFeedback('correct', () => {
      animatePointPop();
      setScore((current) => current + 1);
      setCorrectItems((current) => [...current, itemName]);
      goToNextItem();
    });
  }

  function showTutorial() {
    setIsTutorialVisible(true);
    tutorialOpacity.setValue(0);

    Animated.sequence([
      Animated.timing(tutorialOpacity, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.delay(1600),
      Animated.timing(tutorialOpacity, {
        toValue: 0,
        duration: 220,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => setIsTutorialVisible(false));
  }

  function clearPostRoundPaywallTimer() {
    if (!postRoundPaywallTimerRef.current) {
      return;
    }

    clearTimeout(postRoundPaywallTimerRef.current);
    postRoundPaywallTimerRef.current = null;
  }

  function resetRound(nextTimeMode = selectedTimeMode) {
    flashOpacity.stopAnimation();
    contentScale.stopAnimation();
    contentTranslateY.stopAnimation();

    flashOpacity.setValue(0);
    contentScale.setValue(1);
    contentTranslateY.setValue(0);
    pointOpacity.setValue(0);
    pointTranslateY.setValue(10);
    confettiProgress.forEach((progress) => {
      progress.stopAnimation();
      progress.setValue(0);
    });
    clearPostRoundPaywallTimer();
    setIsConfettiVisible(false);
    setFeedbackTone(null);
    setTimeLeft(TIME_MODES[nextTimeMode]);
    setCurrentIndex(0);
    setScore(0);
    setPasses(0);
    setCorrectItems([]);
    setMissedItems([]);
    setResumeCountdown(null);
    wasPausedDuringRoundRef.current = false;
    recordedFinishedRoundSeedRef.current = null;
    celebratedFinishedRoundSeedRef.current = null;
    pendingRoundActionAfterPaywallRef.current = null;
    setRoundSeed((current) => current + 1);
  }

  function beginRoundWithCountdown() {
    setIsRoundActive(true);
    setResumeCountdown(RESUME_COUNTDOWN_SECONDS);
    Vibration.vibrate(30);
  }

  function startRound(timeMode: TimeMode) {
    setSelectedTimeMode(timeMode);
    resetRound(timeMode);
    beginRoundWithCountdown();
    showTutorial();
  }

  function handleStageTap(pageX: number) {
    if (pageX <= tapBoundaryX) {
      handleCorrect();
      return;
    }

    handlePass();
  }

  function performRestart() {
    resetRound();
    beginRoundWithCountdown();
    showTutorial();
  }

  function performNewMatch() {
    router.dismissAll();
    router.replace({
      pathname: '/categories',
      params: {
        from: 'round_end',
      },
    });
  }

  function runPendingRoundActionAfterPaywall() {
    const pendingAction = pendingRoundActionAfterPaywallRef.current;
    pendingRoundActionAfterPaywallRef.current = null;

    if (pendingAction === 'restart') {
      performRestart();
      return;
    }

    if (pendingAction === 'new_match') {
      performNewMatch();
    }
  }

  function closePostRoundPaywall() {
    setIsPostRoundPaywallOpen(false);
    runPendingRoundActionAfterPaywall();
  }

  async function maybeShowInterstitialBeforeNextAction(action: PendingRoundAction) {
    if (!shouldShowInterstitialAd()) {
      return false;
    }

    clearPostRoundPaywallTimer();
    setIsBetweenRoundsAdLoading(true);

    try {
      trackMonetizationEvent('interstitial_ad_requested', {
        action,
        rounds_played: roundsPlayed,
      });
      const didShowAd = await showInterstitialAdBetweenRounds();

      trackMonetizationEvent(didShowAd ? 'interstitial_ad_shown' : 'interstitial_ad_skipped', {
        action,
        rounds_played: roundsPlayed,
      });

      if (didShowAd) {
        pendingRoundActionAfterPaywallRef.current = action;
        trackMonetizationEvent('paywall_viewed', {
          trigger: 'post_round',
          source: 'interstitial_closed',
          action,
        });
        setIsPostRoundPaywallOpen(true);
        return true;
      }

      return false;
    } finally {
      setIsBetweenRoundsAdLoading(false);
    }
  }

  async function handleRestart() {
    if (isBetweenRoundsAdLoading) {
      return;
    }

    const didDeferAction = await maybeShowInterstitialBeforeNextAction('restart');

    if (!didDeferAction) {
      performRestart();
    }
  }

  async function handleNewMatch() {
    if (isBetweenRoundsAdLoading) {
      return;
    }

    const didDeferAction = await maybeShowInterstitialBeforeNextAction('new_match');

    if (!didDeferAction) {
      performNewMatch();
    }
  }

  function handleContinueAfterOffer() {
    closePostRoundPaywall();
  }

  async function handleUnlock24hPass() {
    const result = await purchaseConsumable();

    if (result.success) {
      unlock24hPass();
      closePostRoundPaywall();
    }
  }

  async function handleUnlockLifetime() {
    const result = await purchaseLifetime();

    if (result.success) {
      closePostRoundPaywall();
    }
  }

  async function handleRevenueCatPaywall() {
    await presentPaywallIfNeeded();
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

      {isConfettiVisible ? (
        <View pointerEvents="none" style={styles.confettiOverlay}>
          {confettiParticles.map((particle, index) => {
            const progress = confettiProgress[index];
            const opacity = progress.interpolate({
              inputRange: [0, 0.12, 0.78, 1],
              outputRange: [0, 1, 1, 0],
            });
            const translateX = progress.interpolate({
              inputRange: [0, 1],
              outputRange: [0, particle.driftX],
            });
            const translateY = progress.interpolate({
              inputRange: [0, 1],
              outputRange: [0, particle.fallDistance],
            });
            const rotate = progress.interpolate({
              inputRange: [0, 1],
              outputRange: [`${particle.rotation * -0.35}deg`, `${particle.rotation}deg`],
            });

            return (
              <Animated.View
                key={`confetti-${index}`}
                style={[
                  styles.confettiPiece,
                  {
                    backgroundColor: particle.color,
                    borderRadius: index % 4 === 0 ? 999 : 2,
                    height: index % 3 === 0 ? particle.size * 1.8 : particle.size,
                    left: particle.left,
                    opacity,
                    top: particle.top,
                    transform: [{ translateX }, { translateY }, { rotate }],
                    width: particle.size,
                  },
                ]}
              />
            );
          })}
        </View>
      ) : null}

      <View
        style={[
          styles.hud,
          isCompactPortrait && styles.hudCompact,
          isLandscape && styles.hudLandscape,
        ]}>
        <View style={[styles.hudPill, isCompactPortrait && styles.hudPillCompact]}>
          <Text
            style={styles.hudLabel}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.72}>
            {t('app.game.scoreLabel')}
          </Text>
          <Text
            style={styles.hudValue}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}>
            {score}
          </Text>
        </View>

        <View
          style={[
            styles.timerContainer,
            isCompactPortrait && styles.timerContainerCompact,
            isFinalCountdown && styles.timerDanger,
            isFeedbackActive && styles.timerFeedback,
          ]}>
          <Text
            style={[
              styles.timer,
              isFinalCountdown && styles.timerDangerText,
              isFeedbackActive && styles.inverseText,
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.78}>
            {formatTime(timeLeft)}
          </Text>
          {isFeedbackActive ? (
            <Text
              style={[
                styles.feedbackText,
                styles.feedbackTextActive,
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.72}>
              {t(feedbackTone === 'correct' ? 'app.game.feedbackCorrect' : 'app.game.feedbackPass')}
            </Text>
          ) : null}
          <View style={styles.timerBarTrack}>
            <View
              style={[
                styles.timerBarFill,
                isFinalCountdown && styles.timerBarFillDanger,
                { width: `${Math.max(timerProgress, 0) * 100}%` },
              ]}
            />
          </View>
        </View>

        <View style={[styles.hudPill, isCompactPortrait && styles.hudPillCompact]}>
          <Text
            style={styles.hudLabel}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.72}>
            {t('app.game.deckLabel')}
          </Text>
          <Text
            style={styles.hudValue}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}>
            {progressText}
          </Text>
        </View>

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
        {!isRoundActive ? (
          <View style={styles.setupContainer}>
            <Text style={styles.setupEyebrow}>{t('app.game.timeModeEyebrow')}</Text>
            <Text style={styles.setupTitle}>{t('app.game.timeModeTitle')}</Text>
            <View style={styles.timeModeGrid}>
              {(['quick', 'normal', 'party'] as const).map((timeMode) => (
                <Pressable
                  key={timeMode}
                  onPress={() => startRound(timeMode)}
                  style={({ pressed }) => [
                    styles.timeModeButton,
                    timeMode === 'normal' && styles.timeModeButtonHot,
                    pressed && styles.buttonPressed,
                  ]}>
                  <Text
                    style={[
                      styles.timeModeTitle,
                      timeMode === 'normal' && styles.timeModeTitleHot,
                    ]}>
                    {t(`app.game.timeModes.${timeMode}.name`)}
                  </Text>
                  <Text
                    style={[
                      styles.timeModeMeta,
                      timeMode === 'normal' && styles.timeModeMetaHot,
                    ]}>
                    {t(`app.game.timeModes.${timeMode}.duration`)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : isFinished ? (
          <View style={[styles.resultContainer, isLandscape && styles.resultContainerLandscape]}>
            <Text style={[styles.resultTitle, isLandscape && styles.resultTitleLandscape]}>
              {t('app.game.timeUp')}
            </Text>
            <View style={styles.resultStats}>
              <View
                style={[
                  styles.resultStatCard,
                  styles.resultStatCorrect,
                  isLandscape && styles.resultStatCardLandscape,
                ]}>
                <Text style={styles.resultLabel}>{t('app.game.scoreLabel')}</Text>
                <Text style={[styles.resultScore, isLandscape && styles.resultScoreLandscape]}>
                  {score}
                </Text>
              </View>
              <View
                style={[
                  styles.resultStatCard,
                  styles.resultStatPass,
                  isLandscape && styles.resultStatCardLandscape,
                ]}>
                <Text style={styles.resultLabel}>{t('app.game.passLabel')}</Text>
                <Text style={[styles.resultPassScore, isLandscape && styles.resultScoreLandscape]}>
                  {passes}
                </Text>
              </View>
            </View>
            <View style={[styles.resultDetails, isLandscape && styles.resultDetailsLandscape]}>
              <View style={styles.resultDetailColumn}>
                <Text style={styles.resultDetailTitle}>{t('app.game.correctDetails')}</Text>
                <ScrollView
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                  style={[styles.resultDetailList, isLandscape && styles.resultDetailListLandscape]}>
                  {correctItems.length > 0 ? (
                    correctItems.map((itemName, index) => (
                      <Text key={`${itemName}-${index}`} style={styles.resultDetailItem}>
                        {itemName}
                      </Text>
                    ))
                  ) : (
                    <Text style={styles.resultDetailEmpty}>{t('app.game.noCorrect')}</Text>
                  )}
                </ScrollView>
              </View>

              <View style={styles.resultDetailColumn}>
                <Text style={styles.resultDetailTitle}>{t('app.game.missedDetails')}</Text>
                <ScrollView
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                  style={[styles.resultDetailList, isLandscape && styles.resultDetailListLandscape]}>
                  {missedItems.length > 0 ? (
                    missedItems.map((itemName, index) => (
                      <Text key={`${itemName}-${index}`} style={styles.resultDetailItem}>
                        {itemName}
                      </Text>
                    ))
                  ) : (
                    <Text style={styles.resultDetailEmpty}>{t('app.game.noMisses')}</Text>
                  )}
                </ScrollView>
              </View>
            </View>
          </View>
        ) : isResumeCountingDown ? (
          <View style={styles.hiddenPromptStage} />
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
            <Pressable
              onPress={(event) => handleStageTap(event.nativeEvent.pageX)}
              style={styles.stageTapTarget}>
              <Animated.View
                style={[
                  styles.stageCard,
                  isLandscape && styles.stageCardLandscape,
                  isFeedbackActive && styles.stageCardFeedback,
                  {
                    opacity: itemOpacity,
                    transform: [{ translateX: itemTranslateX }],
                  },
                ]}>
                <Text style={[styles.stageKicker, isLandscape && styles.stageKickerLandscape]}>
                  {t('app.game.currentPrompt')}
                </Text>
                <Text
                  style={[
                    styles.nameText,
                    isLandscape && styles.nameTextLandscape,
                    isFeedbackActive && styles.inverseText,
                  ]}
                  adjustsFontSizeToFit
                  minimumFontScale={0.62}
                  numberOfLines={isLandscape ? 2 : 3}>
                  {currentItem ? t(currentItem.nameKey) : t('app.game.empty')}
                </Text>
                {currentItem ? (
                  <Text
                    style={[
                      styles.descriptionText,
                      isLandscape && styles.descriptionTextLandscape,
                      isFeedbackActive && styles.inverseSubtext,
                    ]}
                    numberOfLines={isLandscape ? 2 : 3}>
                    {t(currentItem.descriptionKey)}
                  </Text>
                ) : null}
                <Animated.Text
                  pointerEvents="none"
                  style={[
                    styles.pointPop,
                    {
                      opacity: pointOpacity,
                      transform: [{ translateY: pointTranslateY }],
                    },
                  ]}>
                  +1
                </Animated.Text>
              </Animated.View>
            </Pressable>
          </View>
        )}
      </Animated.View>

      {isTutorialVisible ? (
        <Animated.View pointerEvents="none" style={[styles.tutorialOverlay, { opacity: tutorialOpacity }]}>
          <View style={styles.tutorialPanel}>
            <Text style={styles.tutorialText}>{t('app.game.tutorialLeft')}</Text>
            <Text style={styles.tutorialDivider}>|</Text>
            <Text style={styles.tutorialText}>{t('app.game.tutorialRight')}</Text>
          </View>
        </Animated.View>
      ) : null}

      {resumeCountdown !== null ? (
        <View pointerEvents="none" style={styles.resumeCountdownOverlay}>
          <View style={styles.resumeCountdownPanel}>
            <Text style={styles.resumeCountdownNumber}>{resumeCountdown}</Text>
            <Text style={styles.resumeCountdownLabel}>{t('app.game.resumeCountdown')}</Text>
          </View>
        </View>
      ) : null}

      <View style={[styles.bottomArea, isLandscape && styles.bottomAreaLandscape]}>
        {!isRoundActive ? null : isFinished ? (
          <View style={styles.finishedActions}>
            <Pressable
              disabled={isBetweenRoundsAdLoading}
              onPress={handleRestart}
              style={({ pressed }) => [
                styles.secondaryButton,
                styles.finishedButton,
                isBetweenRoundsAdLoading && styles.disabledButton,
                pressed && styles.buttonPressed,
              ]}>
              <Text style={styles.secondaryButtonText}>{t('app.game.restart')}</Text>
            </Pressable>

            <Pressable
              disabled={isBetweenRoundsAdLoading}
              onPress={handleNewMatch}
              style={({ pressed }) => [
                styles.primaryButton,
                styles.finishedButton,
                isBetweenRoundsAdLoading && styles.disabledButton,
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
                disabled={isOrientationBlocked || isResumeCountingDown || isFeedbackActive}
                onPress={handleCorrect}
                style={({ pressed }) => [
                  styles.correctButton,
                  isLandscape && styles.actionButtonLandscape,
                  (isOrientationBlocked || isResumeCountingDown) && styles.disabledButton,
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
                disabled={isOrientationBlocked || isResumeCountingDown || isFeedbackActive}
                onPress={handlePass}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  isLandscape && styles.actionButtonLandscape,
                  (isOrientationBlocked || isResumeCountingDown) && styles.disabledButton,
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
      <PremiumOfferModal
        visible={isPostRoundPaywallOpen}
        adCooldownRemainingMs={adCooldownRemainingMs}
        canWatchAd={canWatchRewardedAd()}
        isPurchaseLoading={isPurchaseLoading}
        lifetimePrice={lifetimePriceString ?? undefined}
        pass24hPrice={pass24hPriceString ?? undefined}
        purchaseError={revenueCatError}
        onClose={closePostRoundPaywall}
        onOpenCustomerCenter={openCustomerCenter}
        onOpenRevenueCatPaywall={handleRevenueCatPaywall}
        onRestorePurchases={restorePurchases}
        onWatchAdToUnlockSession={handleContinueAfterOffer}
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
    paddingHorizontal: 20,
  },
  hud: {
    zIndex: 1,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  hudCompact: {
    gap: 6,
  },
  hudLandscape: {
    maxWidth: 860,
    alignSelf: 'center',
  },
  hudPill: {
    flex: 1,
    flexShrink: 1,
    maxWidth: 112,
    minWidth: 86,
    minHeight: 62,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  hudPillCompact: {
    maxWidth: 82,
    minWidth: 0,
    minHeight: 56,
    borderRadius: 16,
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  hudLabel: {
    color: 'rgba(255, 255, 255, 0.62)',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    textAlign: 'center',
    width: '100%',
  },
  hudValue: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
    width: '100%',
  },
  timerContainer: {
    flex: 1.26,
    flexShrink: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 116,
    maxWidth: 150,
    minHeight: 70,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 248, 234, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 9,
  },
  timerContainerCompact: {
    minWidth: 0,
    maxWidth: 116,
    minHeight: 58,
    borderRadius: 18,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  timerFeedback: {
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.32)',
  },
  timerDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
    borderWidth: 2,
    borderColor: '#EF4444',
  },
  timer: {
    fontSize: 31,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
    width: '100%',
  },
  timerDangerText: {
    color: '#FEE2E2',
  },
  timerBarTrack: {
    width: '100%',
    height: 5,
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    marginTop: 4,
  },
  timerBarFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#22C55E',
  },
  timerBarFillDanger: {
    backgroundColor: '#EF4444',
  },
  feedbackText: {
    marginTop: -2,
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    textAlign: 'center',
    width: '100%',
  },
  feedbackTextActive: {
    color: '#FFFFFF',
  },
  pausedBadge: {
    position: 'absolute',
    bottom: -28,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#F97316',
  },
  pausedBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    color: '#FFFFFF',
  },
  inverseText: {
    color: '#FFFFFF',
  },
  content: {
    zIndex: 1,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
  },
  contentLandscape: {
    justifyContent: 'center',
    paddingVertical: 6,
  },
  itemContent: {
    width: '100%',
    alignItems: 'center',
  },
  itemContentLandscape: {
    maxWidth: 900,
  },
  stageTapTarget: {
    width: '100%',
  },
  hiddenPromptStage: {
    width: '100%',
    maxWidth: 900,
    minHeight: 154,
    borderRadius: 26,
    backgroundColor: 'rgba(11, 18, 32, 0.68)',
    borderWidth: 2,
    borderColor: 'rgba(250, 204, 21, 0.28)',
  },
  stageCard: {
    width: '100%',
    minHeight: 310,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderRadius: 30,
    backgroundColor: '#1F2937',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 18,
    paddingVertical: 26,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.25,
    shadowRadius: 28,
    elevation: 20,
  },
  stageCardLandscape: {
    minHeight: 172,
    borderRadius: 26,
    backgroundColor: '#0B1220',
    borderColor: '#F97316',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 12,
    shadowColor: '#F97316',
    shadowOpacity: 0.18,
  },
  stageCardFeedback: {
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderColor: 'rgba(255, 255, 255, 0.34)',
  },
  stageKicker: {
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
  stageKickerLandscape: {
    fontSize: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pointPop: {
    position: 'absolute',
    top: 26,
    right: 28,
    color: '#22C55E',
    fontSize: 34,
    fontWeight: '900',
  },
  setupContainer: {
    width: '100%',
    maxWidth: 560,
    alignItems: 'center',
    gap: 14,
    borderRadius: 30,
    backgroundColor: '#1F2937',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    padding: 22,
  },
  setupEyebrow: {
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
  setupTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
  },
  timeModeGrid: {
    width: '100%',
    gap: 10,
  },
  timeModeButton: {
    minHeight: 66,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  timeModeButtonHot: {
    backgroundColor: '#FACC15',
    borderColor: '#FACC15',
  },
  timeModeTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  timeModeTitleHot: {
    color: '#111827',
  },
  timeModeMeta: {
    color: 'rgba(255, 255, 255, 0.68)',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 3,
  },
  timeModeMetaHot: {
    color: 'rgba(17, 24, 39, 0.72)',
  },
  nameText: {
    width: '100%',
    fontSize: 66,
    lineHeight: 70,
    fontWeight: '900',
    textAlign: 'center',
    color: '#FFFFFF',
  },
  nameTextLandscape: {
    fontSize: 56,
    lineHeight: 60,
  },
  descriptionText: {
    maxWidth: 360,
    fontSize: 18,
    lineHeight: 25,
    fontWeight: '700',
    textAlign: 'center',
    color: 'rgba(255, 255, 255, 0.74)',
  },
  descriptionTextLandscape: {
    maxWidth: 680,
    fontSize: 15,
    lineHeight: 20,
  },
  inverseSubtext: {
    color: 'rgba(255, 255, 255, 0.92)',
  },
  resultContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    width: '100%',
    minHeight: 320,
    borderRadius: 30,
    backgroundColor: '#1F2937',
    borderWidth: 2,
    borderColor: '#F97316',
    padding: 18,
  },
  resultContainerLandscape: {
    minHeight: 188,
    maxWidth: 760,
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  orientationWarning: {
    width: '100%',
    maxWidth: 520,
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 24,
    paddingVertical: 28,
    borderRadius: 28,
    backgroundColor: '#1F2937',
    borderWidth: 2,
    borderColor: '#F97316',
  },
  orientationWarningImage: {
    width: '100%',
    maxWidth: 320,
    height: 220,
  },
  orientationWarningTitle: {
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    color: '#FFFFFF',
  },
  orientationWarningDescription: {
    fontSize: 17,
    lineHeight: 26,
    fontWeight: '700',
    textAlign: 'center',
    color: 'rgba(255, 255, 255, 0.72)',
  },
  resultTitle: {
    fontSize: 34,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  resultTitleLandscape: {
    fontSize: 24,
  },
  resultStats: {
    width: '100%',
    flexDirection: 'row',
    gap: 12,
  },
  resultStatCard: {
    flex: 1,
    minHeight: 104,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    paddingVertical: 10,
  },
  resultStatCardLandscape: {
    minHeight: 68,
    borderRadius: 16,
    paddingVertical: 6,
  },
  resultStatCorrect: {
    borderColor: 'rgba(34, 197, 94, 0.58)',
  },
  resultStatPass: {
    borderColor: 'rgba(249, 115, 22, 0.58)',
  },
  resultLabel: {
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
    color: 'rgba(255, 255, 255, 0.72)',
  },
  resultScore: {
    fontSize: 54,
    fontWeight: '900',
    color: '#22C55E',
  },
  resultPassScore: {
    fontSize: 54,
    fontWeight: '900',
    color: '#F97316',
  },
  resultScoreLandscape: {
    fontSize: 34,
  },
  resultDetails: {
    width: '100%',
    flexDirection: 'row',
    gap: 12,
  },
  resultDetailsLandscape: {
    gap: 8,
  },
  resultDetailColumn: {
    flex: 1,
    gap: 6,
  },
  resultDetailTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  resultDetailList: {
    maxHeight: 116,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  resultDetailListLandscape: {
    maxHeight: 56,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  resultDetailItem: {
    color: 'rgba(255, 255, 255, 0.86)',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    textAlign: 'center',
  },
  resultDetailEmpty: {
    color: 'rgba(255, 255, 255, 0.48)',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 18,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  gameActions: {
    gap: 12,
  },
  actionsLandscape: {
    width: '100%',
  },
  actionButtonLandscape: {
    minHeight: 50,
  },
  bottomArea: {
    zIndex: 1,
    width: '100%',
    alignSelf: 'center',
    paddingTop: 12,
  },
  bottomAreaLandscape: {
    maxWidth: 680,
    paddingTop: 6,
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
    backgroundColor: '#FACC15',
  },
  correctButton: {
    flex: 1,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#22C55E',
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 16,
    elevation: 10,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.24)',
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ translateY: 2 }, { scale: 0.99 }],
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
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
  },
  secondaryButtonText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  tiltHint: {
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    color: 'rgba(255, 255, 255, 0.62)',
  },
  inverseButtonText: {
    color: '#FFFFFF',
  },
  tutorialOverlay: {
    position: 'absolute',
    right: 12,
    bottom: 106,
    left: 12,
    zIndex: 3,
    alignItems: 'center',
  },
  tutorialPanel: {
    width: '100%',
    maxWidth: 680,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(17, 24, 39, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  tutorialText: {
    flex: 1,
    flexShrink: 1,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 16,
    textAlign: 'center',
  },
  tutorialDivider: {
    color: 'rgba(255, 255, 255, 0.42)',
    fontSize: 13,
    fontWeight: '900',
  },
  resumeCountdownOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.48)',
  },
  resumeCountdownPanel: {
    minWidth: 150,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 28,
    backgroundColor: 'rgba(11, 18, 32, 0.94)',
    borderWidth: 2,
    borderColor: '#FACC15',
    paddingHorizontal: 26,
    paddingVertical: 18,
  },
  resumeCountdownNumber: {
    color: '#FACC15',
    fontSize: 74,
    fontWeight: '900',
    lineHeight: 80,
  },
  resumeCountdownLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  feedbackOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  confettiOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 4,
    overflow: 'hidden',
  },
  confettiPiece: {
    position: 'absolute',
  },
});
