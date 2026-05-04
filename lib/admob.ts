import Constants from 'expo-constants';
import {
  getTrackingPermissionsAsync,
  PermissionStatus,
} from 'expo-tracking-transparency';
import { Platform } from 'react-native';

import { getPostHogClient } from '@/lib/posthog';

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
let mobileAdsInitializationPromise: Promise<void> | null = null;

type AdFormat = 'rewarded' | 'interstitial';
type AdLifecycleStage =
  | 'init_started'
  | 'init_succeeded'
  | 'init_failed'
  | 'init_skipped_missing_app_id'
  | 'ad_request_started'
  | 'ad_request_loaded'
  | 'ad_request_opened'
  | 'ad_request_closed'
  | 'ad_request_reward_earned'
  | 'ad_request_completed'
  | 'ad_request_failed'
  | 'ad_request_timeout'
  | 'ad_request_skipped_missing_ad_unit';

function getRuntimeEnvironment() {
  return __DEV__ ? 'development' : 'production';
}

function getPlatformAppId() {
  return Platform.select<string | undefined>({
    ios: IOS_APP_ID,
    android: ANDROID_APP_ID,
    default: undefined,
  });
}

function maskIdSuffix(value: string | undefined) {
  if (!value) {
    return 'missing';
  }

  return value.slice(-6);
}

function serializeError(error: unknown) {
  if (typeof error === 'object' && error !== null) {
    const code =
      'code' in error && typeof error.code !== 'undefined' ? String(error.code) : 'unknown';
    const message =
      'message' in error && typeof error.message === 'string'
        ? error.message
        : JSON.stringify(error);

    return {
      code,
      message,
    };
  }

  return {
    code: 'unknown',
    message: typeof error === 'string' ? error : 'unknown error',
  };
}

function trackAdmobEvent(
  stage: AdLifecycleStage,
  options?: {
    adUnitId?: string;
    adFormat?: AdFormat;
    error?: unknown;
    requestNonPersonalizedAdsOnly?: boolean;
  }
) {
  try {
    const appId = getPlatformAppId();
    const error = options?.error ? serializeError(options.error) : null;

    getPostHogClient().capture('admob_diagnostic', {
      stage,
      ad_format: options?.adFormat ?? null,
      ad_unit_suffix: maskIdSuffix(options?.adUnitId),
      app_id_suffix: maskIdSuffix(appId),
      has_ad_unit_id: Boolean(options?.adUnitId),
      has_app_id: Boolean(appId),
      platform: Platform.OS,
      runtime_environment: getRuntimeEnvironment(),
      request_non_personalized_ads_only: options?.requestNonPersonalizedAdsOnly ?? null,
      error_code: error?.code ?? null,
      error_message: error?.message ?? null,
    });
  } catch (trackingError) {
    console.warn('[admob] failed to track diagnostic event', trackingError);
  }
}

function hasGoogleMobileAdsAppId() {
  return Boolean(getPlatformAppId());
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

  if (mobileAdsInitializationPromise) {
    return mobileAdsInitializationPromise;
  }

  if (!hasGoogleMobileAdsAppId()) {
    trackAdmobEvent('init_skipped_missing_app_id');
    console.warn('[admob] app id not configured; skipping initialization');
    return;
  }

  mobileAdsInitializationPromise = (async () => {
    try {
      trackAdmobEvent('init_started');
      const { default: mobileAds } = await import('react-native-google-mobile-ads');
      await mobileAds().initialize();
      trackAdmobEvent('init_succeeded');
    } catch (error) {
      mobileAdsInitializationPromise = null;
      trackAdmobEvent('init_failed', { error });
      console.warn('[admob] failed to initialize Google Mobile Ads', error);
    }
  })();

  return mobileAdsInitializationPromise;
}

async function getAdRequestOptions() {
  if (Platform.OS !== 'ios') {
    return undefined;
  }

  const { status } = await getTrackingPermissionsAsync();

  if (status === PermissionStatus.GRANTED) {
    return undefined;
  }

  return { requestNonPersonalizedAdsOnly: true } as const;
}

export async function showRewardedAdForPremiumSession() {
  if (Platform.OS === 'web') {
    return false;
  }

  try {
    await initializeGoogleMobileAds();

    const { AdEventType, RewardedAd, RewardedAdEventType } = await import(
      'react-native-google-mobile-ads'
    );
    const rewardedAdUnitId = getRewardedAdUnitId();
    const requestOptions = await getAdRequestOptions();
    const requestNonPersonalizedAdsOnly =
      requestOptions?.requestNonPersonalizedAdsOnly ?? false;

    if (!rewardedAdUnitId) {
      trackAdmobEvent('ad_request_skipped_missing_ad_unit', {
        adFormat: 'rewarded',
        requestNonPersonalizedAdsOnly,
      });
      console.warn('[admob] rewarded ad unit id not configured');
      return false;
    }

    trackAdmobEvent('ad_request_started', {
      adFormat: 'rewarded',
      adUnitId: rewardedAdUnitId,
      requestNonPersonalizedAdsOnly,
    });
    const rewardedAd = RewardedAd.createForAdRequest(rewardedAdUnitId, requestOptions);

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

      const timeout = setTimeout(() => {
        trackAdmobEvent('ad_request_timeout', {
          adFormat: 'rewarded',
          adUnitId: rewardedAdUnitId,
          requestNonPersonalizedAdsOnly,
        });
        finish(false);
      }, REWARDED_LOAD_TIMEOUT_MS);

      unsubscribers.push(
        rewardedAd.addAdEventListener(RewardedAdEventType.LOADED, () => {
          trackAdmobEvent('ad_request_loaded', {
            adFormat: 'rewarded',
            adUnitId: rewardedAdUnitId,
            requestNonPersonalizedAdsOnly,
          });
          void rewardedAd.show().catch((error) => {
            trackAdmobEvent('ad_request_failed', {
              adFormat: 'rewarded',
              adUnitId: rewardedAdUnitId,
              error,
              requestNonPersonalizedAdsOnly,
            });
            console.warn('[admob] failed to show rewarded ad', error);
            finish(false);
          });
        })
      );
      unsubscribers.push(
        rewardedAd.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
          didEarnReward = true;
          trackAdmobEvent('ad_request_reward_earned', {
            adFormat: 'rewarded',
            adUnitId: rewardedAdUnitId,
            requestNonPersonalizedAdsOnly,
          });

          if (didCloseAd) {
            trackAdmobEvent('ad_request_completed', {
              adFormat: 'rewarded',
              adUnitId: rewardedAdUnitId,
              requestNonPersonalizedAdsOnly,
            });
            finish(true);
          }
        })
      );
      unsubscribers.push(
        rewardedAd.addAdEventListener(AdEventType.OPENED, () => {
          didShowAd = true;
          trackAdmobEvent('ad_request_opened', {
            adFormat: 'rewarded',
            adUnitId: rewardedAdUnitId,
            requestNonPersonalizedAdsOnly,
          });
        })
      );
      unsubscribers.push(
        rewardedAd.addAdEventListener(AdEventType.CLOSED, () => {
          didCloseAd = true;
          trackAdmobEvent('ad_request_closed', {
            adFormat: 'rewarded',
            adUnitId: rewardedAdUnitId,
            requestNonPersonalizedAdsOnly,
          });

          if (didEarnReward) {
            trackAdmobEvent('ad_request_completed', {
              adFormat: 'rewarded',
              adUnitId: rewardedAdUnitId,
              requestNonPersonalizedAdsOnly,
            });
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
          trackAdmobEvent('ad_request_failed', {
            adFormat: 'rewarded',
            adUnitId: rewardedAdUnitId,
            error,
            requestNonPersonalizedAdsOnly,
          });
          console.warn('[admob] rewarded ad error', error);
          finish(false);
        })
      );

      rewardedAd.load();
    });
  } catch (error) {
    trackAdmobEvent('ad_request_failed', {
      adFormat: 'rewarded',
      error,
    });
    console.warn('[admob] failed to load rewarded ad', error);
    return false;
  }
}

export async function showInterstitialAdBetweenRounds() {
  if (Platform.OS === 'web') {
    return false;
  }

  try {
    await initializeGoogleMobileAds();

    const { AdEventType, InterstitialAd } = await import('react-native-google-mobile-ads');
    const interstitialAdUnitId = getInterstitialAdUnitId();
    const requestOptions = await getAdRequestOptions();
    const requestNonPersonalizedAdsOnly =
      requestOptions?.requestNonPersonalizedAdsOnly ?? false;

    if (!interstitialAdUnitId) {
      trackAdmobEvent('ad_request_skipped_missing_ad_unit', {
        adFormat: 'interstitial',
        requestNonPersonalizedAdsOnly,
      });
      console.warn('[admob] interstitial ad unit id not configured');
      return false;
    }

    trackAdmobEvent('ad_request_started', {
      adFormat: 'interstitial',
      adUnitId: interstitialAdUnitId,
      requestNonPersonalizedAdsOnly,
    });
    const interstitialAd = InterstitialAd.createForAdRequest(interstitialAdUnitId, requestOptions);

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

      loadTimeout = setTimeout(() => {
        trackAdmobEvent('ad_request_timeout', {
          adFormat: 'interstitial',
          adUnitId: interstitialAdUnitId,
          requestNonPersonalizedAdsOnly,
        });
        finish(false);
      }, INTERSTITIAL_LOAD_TIMEOUT_MS);

      unsubscribers.push(
        interstitialAd.addAdEventListener(AdEventType.LOADED, () => {
          if (loadTimeout) {
            clearTimeout(loadTimeout);
            loadTimeout = null;
          }

          trackAdmobEvent('ad_request_loaded', {
            adFormat: 'interstitial',
            adUnitId: interstitialAdUnitId,
            requestNonPersonalizedAdsOnly,
          });
          void interstitialAd.show().catch((error) => {
            trackAdmobEvent('ad_request_failed', {
              adFormat: 'interstitial',
              adUnitId: interstitialAdUnitId,
              error,
              requestNonPersonalizedAdsOnly,
            });
            console.warn('[admob] failed to show interstitial ad', error);
            finish(false);
          });
        })
      );
      unsubscribers.push(
        interstitialAd.addAdEventListener(AdEventType.CLOSED, () => {
          trackAdmobEvent('ad_request_closed', {
            adFormat: 'interstitial',
            adUnitId: interstitialAdUnitId,
            requestNonPersonalizedAdsOnly,
          });
          trackAdmobEvent('ad_request_completed', {
            adFormat: 'interstitial',
            adUnitId: interstitialAdUnitId,
            requestNonPersonalizedAdsOnly,
          });
          finish(true);
        })
      );
      unsubscribers.push(
        interstitialAd.addAdEventListener(AdEventType.ERROR, (error) => {
          trackAdmobEvent('ad_request_failed', {
            adFormat: 'interstitial',
            adUnitId: interstitialAdUnitId,
            error,
            requestNonPersonalizedAdsOnly,
          });
          console.warn('[admob] interstitial ad error', error);
          finish(false);
        })
      );

      interstitialAd.load();
    });
  } catch (error) {
    trackAdmobEvent('ad_request_failed', {
      adFormat: 'interstitial',
      error,
    });
    console.warn('[admob] failed to load interstitial ad', error);
    return false;
  }
}
