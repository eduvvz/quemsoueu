import Constants from 'expo-constants';
import { Platform } from 'react-native';

const extra = Constants.expoConfig?.extra ?? {};
const IOS_REWARDED_AD_UNIT_ID = extra.admobIosRewardedAdUnitId as string | undefined;
const ANDROID_REWARDED_AD_UNIT_ID = extra.admobAndroidRewardedAdUnitId as string | undefined;
const IOS_TEST_REWARDED_AD_UNIT_ID = extra.admobIosTestRewardedAdUnitId as string | undefined;
const ANDROID_TEST_REWARDED_AD_UNIT_ID = extra.admobAndroidTestRewardedAdUnitId as string | undefined;
const REWARDED_LOAD_TIMEOUT_MS = 30_000;

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
    default: fallbackAdUnitId,
  }) ?? fallbackAdUnitId;
}

export async function initializeGoogleMobileAds() {
  if (Platform.OS === 'web') {
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
      let didSettle = false;
      const unsubscribers: (() => void)[] = [];

      const finish = (result: boolean) => {
        if (didSettle) {
          return;
        }

        didSettle = true;
        clearTimeout(timeout);
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
        })
      );
      unsubscribers.push(
        rewardedAd.addAdEventListener(AdEventType.CLOSED, () => {
          finish(didEarnReward);
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
