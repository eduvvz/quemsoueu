const env = (name) => process.env[name];
const admobAndroidAppId = env('ADMOB_ANDROID_APP_ID');
const admobIosAppId = env('ADMOB_IOS_APP_ID') ?? 'ca-app-pub-7037052370613478~3586939135';

export default {
  expo: {
    name: 'Who Am I? Party Game',
    slug: 'quemsoueu',
    version: '1.0.1',
    orientation: 'default',
    icon: './assets/icon.png',
    scheme: 'quemsoueu',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.eduvvz.quemsoueu',
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        CFBundleAllowMixedLocalizations: true,
        GADApplicationIdentifier: admobIosAppId,
      },
    },
    android: {
      adaptiveIcon: {
        backgroundColor: '#FDD400',
        foregroundImage: './assets/icon.png',
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
    },
    web: {
      output: 'static',
      favicon: './assets/icon.png',
    },
    locales: {
      'en-US': './locales/app/en-US.json',
      'pt-BR': './locales/app/pt-BR.json',
      'es-MX': './locales/app/es-MX.json',
      'en-IN': './locales/app/en-IN.json',
      'es-ES': './locales/app/es-ES.json',
      'fr-FR': './locales/app/fr-FR.json',
      'de-DE': './locales/app/de-DE.json',
      'en-GB': './locales/app/en-GB.json',
      'it-IT': './locales/app/it-IT.json',
      'pt-PT': './locales/app/pt-PT.json',
      'nl-NL': './locales/app/nl-NL.json',
      'sv-SE': './locales/app/sv-SE.json',
      'ja-JP': './locales/app/ja-JP.json',
      'ko-KR': './locales/app/ko-KR.json',
    },
    plugins: [
      'expo-router',
      'expo-tracking-transparency',
      [
        'expo-splash-screen',
        {
          image: './assets/images/splash-icon.png',
          imageWidth: 240,
          resizeMode: 'contain',
          backgroundColor: '#FDD400',
          dark: {
            backgroundColor: '#FDD400',
          },
        },
      ],
      [
        'expo-localization',
        {
          supportedLocales: {
            ios: [
              'en-US', 'pt-BR', 'es-MX', 'en-IN', 'es-ES', 'fr-FR',
              'de-DE', 'en-GB', 'it-IT', 'pt-PT', 'nl-NL', 'sv-SE', 'ja-JP', 'ko-KR',
            ],
            android: [
              'en-US', 'pt-BR', 'es-MX', 'en-IN', 'es-ES', 'fr-FR',
              'de-DE', 'en-GB', 'it-IT', 'pt-PT', 'nl-NL', 'sv-SE', 'ja-JP', 'ko-KR',
            ],
          },
        },
      ],
      [
        'react-native-google-mobile-ads',
        {
          androidAppId: admobAndroidAppId,
          iosAppId: admobIosAppId,
          userTrackingUsageDescription:
            'Este identificador pode ser usado para entregar anuncios personalizados.',
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      router: {},
      eas: {
        projectId: '32bb319f-3349-4385-a7de-7d7c2113f47c',
      },
      posthogProjectToken: env('POSTHOG_PROJECT_TOKEN'),
      posthogHost: env('POSTHOG_HOST'),
      admobAndroidAppId,
      admobIosAppId,
      admobAndroidRewardedAdUnitId: env('ADMOB_ANDROID_REWARDED_AD_UNIT_ID'),
      admobIosRewardedAdUnitId: env('ADMOB_IOS_REWARDED_AD_UNIT_ID'),
      admobAndroidTestRewardedAdUnitId: env('ADMOB_ANDROID_TEST_REWARDED_AD_UNIT_ID'),
      admobIosTestRewardedAdUnitId: env('ADMOB_IOS_TEST_REWARDED_AD_UNIT_ID'),
      admobAndroidInterstitialAdUnitId: env('ADMOB_ANDROID_INTERSTITIAL_AD_UNIT_ID'),
      admobIosInterstitialAdUnitId: env('ADMOB_IOS_INTERSTITIAL_AD_UNIT_ID'),
      admobAndroidTestInterstitialAdUnitId: env('ADMOB_ANDROID_TEST_INTERSTITIAL_AD_UNIT_ID'),
      admobIosTestInterstitialAdUnitId: env('ADMOB_IOS_TEST_INTERSTITIAL_AD_UNIT_ID'),
      revenueCatAndroidApiKey: env('REVENUECAT_ANDROID_API_KEY'),
      revenueCatIosApiKey: env('REVENUECAT_IOS_API_KEY'),
      revenueCatEntitlementId: env('REVENUECAT_ENTITLEMENT_ID'),
      revenueCatOfferingId: env('REVENUECAT_OFFERING_ID'),
      revenueCatConsumablePackageId: env('REVENUECAT_CONSUMABLE_PACKAGE_ID'),
      revenueCatConsumableProductId: env('REVENUECAT_CONSUMABLE_PRODUCT_ID'),
      revenueCatLifetimePackageId: env('REVENUECAT_LIFETIME_PACKAGE_ID'),
      revenueCatLifetimeProductId: env('REVENUECAT_LIFETIME_PRODUCT_ID'),
    },
  },
};
