import { Platform } from 'react-native';

const IOS_REWARDED_AD_UNIT_ID = 'ca-app-pub-7037052370613478/9523767886';
const ANDROID_REWARDED_AD_UNIT_ID = 'ca-app-pub-7037052370613478/2658976632';
const IOS_TEST_REWARDED_AD_UNIT_ID = 'ca-app-pub-3940256099942544/1712485313';
const ANDROID_TEST_REWARDED_AD_UNIT_ID = 'ca-app-pub-3940256099942544/5224354917';
const REWARDED_LOAD_TIMEOUT_MS = 30_000;

function getRewardedAdUnitId() {
  if (__DEV__) {
    return Platform.OS === 'android'
      ? ANDROID_TEST_REWARDED_AD_UNIT_ID
      : IOS_TEST_REWARDED_AD_UNIT_ID;
  }

  return Platform.select({
    ios: IOS_REWARDED_AD_UNIT_ID,
    android: ANDROID_REWARDED_AD_UNIT_ID,
    default: IOS_TEST_REWARDED_AD_UNIT_ID,
  });
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
    const rewardedAd = RewardedAd.createForAdRequest(getRewardedAdUnitId());

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
