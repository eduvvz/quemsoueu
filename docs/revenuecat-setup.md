# RevenueCat Setup

This app uses RevenueCat for in-app purchases and paywall/customer management.

## Installed packages

```sh
yarn add react-native-purchases react-native-purchases-ui
```

Installed versions are tracked in `package.json` and `yarn.lock`.

## SDK initialization

RevenueCat is initialized in `lib/revenuecat.tsx` with:

```ts
Purchases.configure({ apiKey: revenueCatConfig.apiKey });
```

RevenueCat keys and product identifiers are loaded from `.env` through `app.config.js`.
For production, set the correct public app-specific RevenueCat key for each platform:

```txt
REVENUECAT_IOS_API_KEY=
REVENUECAT_ANDROID_API_KEY=
```

## RevenueCat dashboard configuration

Create these items in the RevenueCat dashboard:

1. Project: `Quem Sou Eu`
2. Entitlement identifier: `Quem Sou Eu Pro`
3. Products:
   - `Consumable_24hours`
   - `Lifetime`
4. Offering:
   - Identifier: `default`
   - Make it the current offering.
   - Add package `24 hours` for `Consumable_24hours`.
   - Add package `Lifitime` for `Lifetime`.
   - Attach `Lifetime` to the `Quem Sou Eu Pro` entitlement.
5. Paywall:
   - Attach the paywall to the current offering.
   - Include the products you want to sell from the RevenueCat-hosted UI.

The app looks up packages by product identifier or package identifier:

- Pass 24h product: `Consumable_24hours`
- Pass 24h package: `24 hours`
- Lifetime product: `Lifetime`
- Lifetime package: `Lifitime`

## App behavior

- `consumable` purchase unlocks the local 24h pass.
- `lifetime` purchase must activate the `Quem Sou Eu Pro` entitlement.
- Any active `Quem Sou Eu Pro` entitlement automatically activates lifetime premium locally.
- Restore purchases and Customer Center are available from the premium sheet.
- RevenueCat Paywall is available from the premium sheet and uses the current dashboard offering.

## Useful code entry points

- RevenueCat provider and purchase helpers: `lib/revenuecat.tsx`
- Local monetization state: `lib/monetization.tsx`
- Root providers and entitlement bridge: `app/_layout.tsx`
- Premium purchase UI: `components/PremiumOfferModal.tsx`

## Expo testing

RevenueCat native purchases require a development build. Expo Go can preview some logic, but real purchases require a custom build.

```sh
npx eas-cli build --profile development --platform ios --clear-cache
npx eas-cli build --profile development --platform android --clear-cache
```

After installing the build:

```sh
npx expo start --dev-client
```

Rebuild after changing native dependencies, `app.json`, or RevenueCat native SDK versions.
