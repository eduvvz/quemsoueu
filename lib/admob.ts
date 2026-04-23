import Constants from 'expo-constants';
import { Platform } from 'react-native';

const extra = Constants.expoConfig?.extra ?? {};
const IOS_APP_ID = extra.admobIosAppId as string | undefined;
const ANDROID_APP_ID = extra.admobAndroidAppId as string | undefined;
const IOS_REWARDED_AD_UNIT_ID = extra.admobIosRewardedAdUnitId as string | undefined;
const ANDROID_REWARDED_AD_UNIT_ID = extra.admobAndroidRewardedAdUnitId as string | undefined;
const IOS_TEST_REWARDED_AD_UNIT_ID = extra.admobIosTestRewardedAdUnitId as string | undefined;
const ANDROID_TEST_REWARDED_AD_UNIT_ID = extra.admobAndroidTestRewardedAdUnitId as string | undefined;
const IOS_INTERSTITIAL_AD_UNIT_ID = extra.admobIosInterstitialAdUnitId as string | undefined;
const ANDROID_INTERSTITIAL_AD_UNIT_ID = extra.admobAndroidInterstitialAdUnitId as string | undefined;
const IOS_TEST_INTERSTITIAL_AD_UNIT_ID = extra.admobIosTestInterstitialAdUnitId as string | undefined;
const ANDROID_TEST_INTERSTITIAL_AD_UNIT_ID = extra.admobAndroidTestInterstitialAdUnitId as string | undefined;
const REWARDED_LOAD_TIMEOUT_MS = 30_000;
const REWARDED_CLOSE_GRACE_MS = 700;
const INTERSTITIAL_LOAD_TIMEOUT_MS = 8_000;

function hasGoogleMobileAdsAppId() {
  return Boolean(
    Platform.select({
      ios: IOS_APP_ID,
      android: ANDROID_APP_ID,
      default: undefined,
    })
  );
}

function getRewardedAdUnitId() {
  const fallbackAdUnitId =
    Platform.OS === 'android'
      ? ANDROID_TEST_REWARDED_AD_UNIT_ID
      : IOS_TEST_REWARDED_AD_UNIT_ID;

  if (__DEV__) {
    return fallbackAdUnitId;
  }

  return Platform.select<string | undefined>({
    ios: IOS_REWARDED_AD_UNIT_ID,
    android: ANDROID_REWARDED_AD_UNIT_ID,
    default: undefined,
  });
}

function getInterstitialAdUnitId() {
  const fallbackAdUnitId =
    Platform.OS === 'android'
      ? ANDROID_TEST_INTERSTITIAL_AD_UNIT_ID
      : IOS_TEST_INTERSTITIAL_AD_UNIT_ID;

  if (__DEV__) {
    return fallbackAdUnitId;
  }

  return Platform.select<string | undefined>({
    ios: IOS_INTERSTITIAL_AD_UNIT_ID,
    android: ANDROID_INTERSTITIAL_AD_UNIT_ID,
    default: undefined,
  });
}

export async function initializeGoogleMobileAds() {
  if (Platform.OS === 'web') {
    return;
  }

  if (!hasGoogleMobileAdsAppId()) {
    console.warn('[admob] app id not configured; skipping initialization');
    return;
  }

  try {
    const { default: mobileAds } = await import('react-native-google-mobile-ads');
    await mobileAds().initialize();
  } catch (error) {
    console.warn('[admob] failed to initialize Google Mobile Ads', error);
  }
}

export async function showRewardedAdForPremiumSession() {
  if (Platform.OS === 'web') {
    return false;
  }

  try {
    const { AdEventType, RewardedAd, RewardedAdEventType } = await import(
      'react-native-google-mobile-ads'
    );
    const rewardedAdUnitId = getRewardedAdUnitId();

    if (!rewardedAdUnitId) {
      console.warn('[admob] rewarded ad unit id not configured');
      return false;
    }

    const rewardedAd = RewardedAd.createForAdRequest(rewardedAdUnitId);

    return await new Promise<boolean>((resolve) => {
      let didEarnReward = false;
      let didShowAd = false;
      let didCloseAd = false;
      let didSettle = false;
      let closeGraceTimeout: ReturnType<typeof setTimeout> | null = null;
      const unsubscribers: (() => void)[] = [];

      const finish = (result: boolean) => {
        if (didSettle) {
          return;
        }

        didSettle = true;
        clearTimeout(timeout);
        if (closeGraceTimeout) {
          clearTimeout(closeGraceTimeout);
          closeGraceTimeout = null;
        }
        unsubscribers.forEach((unsubscribe) => unsubscribe());
        resolve(result);
      };

      const timeout = setTimeout(() => finish(false), REWARDED_LOAD_TIMEOUT_MS);

      unsubscribers.push(
        rewardedAd.addAdEventListener(RewardedAdEventType.LOADED, () => {
          void rewardedAd.show().catch((error) => {
            console.warn('[admob] failed to show rewarded ad', error);
            finish(false);
          });
        })
      );
      unsubscribers.push(
        rewardedAd.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
          didEarnReward = true;

          if (didCloseAd) {
            finish(true);
          }
        })
      );
      unsubscribers.push(
        rewardedAd.addAdEventListener(AdEventType.OPENED, () => {
          didShowAd = true;
        })
      );
      unsubscribers.push(
        rewardedAd.addAdEventListener(AdEventType.CLOSED, () => {
          didCloseAd = true;

          if (didEarnReward) {
            finish(true);
            return;
          }

          if (!didShowAd) {
            finish(false);
            return;
          }

          closeGraceTimeout = setTimeout(() => {
            finish(false);
          }, REWARDED_CLOSE_GRACE_MS);
        })
      );
      unsubscribers.push(
        rewardedAd.addAdEventListener(AdEventType.ERROR, (error) => {
          console.warn('[admob] rewarded ad error', error);
          finish(false);
        })
      );

      rewardedAd.load();
    });
  } catch (error) {
    console.warn('[admob] failed to load rewarded ad', error);
    return false;
  }
}

export async function showInterstitialAdBetweenRounds() {
  if (Platform.OS === 'web') {
    return false;
  }

  try {
    const { AdEventType, InterstitialAd } = await import('react-native-google-mobile-ads');
    const interstitialAdUnitId = getInterstitialAdUnitId();

    if (!interstitialAdUnitId) {
      console.warn('[admob] interstitial ad unit id not configured');
      return false;
    }

    const interstitialAd = InterstitialAd.createForAdRequest(interstitialAdUnitId);

    return await new Promise<boolean>((resolve) => {
      let didSettle = false;
      let loadTimeout: ReturnType<typeof setTimeout> | null = null;
      const unsubscribers: (() => void)[] = [];

      const finish = (result: boolean) => {
        if (didSettle) {
          return;
        }

        didSettle = true;
        if (loadTimeout) {
          clearTimeout(loadTimeout);
          loadTimeout = null;
        }
        unsubscribers.forEach((unsubscribe) => unsubscribe());
        resolve(result);
      };

      loadTimeout = setTimeout(() => finish(false), INTERSTITIAL_LOAD_TIMEOUT_MS);

      unsubscribers.push(
        interstitialAd.addAdEventListener(AdEventType.LOADED, () => {
          if (loadTimeout) {
            clearTimeout(loadTimeout);
            loadTimeout = null;
          }

          void interstitialAd.show().catch((error) => {
            console.warn('[admob] failed to show interstitial ad', error);
            finish(false);
          });
        })
      );
      unsubscribers.push(
        interstitialAd.addAdEventListener(AdEventType.CLOSED, () => {
          finish(true);
        })
      );
      unsubscribers.push(
        interstitialAd.addAdEventListener(AdEventType.ERROR, (error) => {
          console.warn('[admob] interstitial ad error', error);
          finish(false);
        })
      );

      interstitialAd.load();
    });
  } catch (error) {
    console.warn('[admob] failed to load interstitial ad', error);
    return false;
  }
}
