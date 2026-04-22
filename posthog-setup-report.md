<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the **Who Am I? Party Game** Expo app. Here is a summary of everything that was added:

- **`lib/posthog.ts`** — New PostHog client instance, configured via `expo-constants` extras (loaded from `.env` at build time via `app.config.js`). Autocapture and app lifecycle events are enabled.
- **`app.config.js`** — Converted from `app.json` to a dynamic JS config so PostHog keys can be injected from environment variables (`POSTHOG_PROJECT_TOKEN`, `POSTHOG_HOST`).
- **`.env`** — PostHog project token and host stored as environment variables (gitignored).
- **`app/_layout.tsx`** — Wrapped the app in `PostHogProvider` with autocapture (touches enabled, screen tracking disabled in favour of manual). Added a `useEffect` to call `posthog.screen()` on every pathname change for automatic screen tracking via Expo Router.
- **`lib/monetization.tsx`** — Replaced all `console.log` stubs with real `posthog.capture()` calls for: `paywall_viewed`, `rewarded_ad_watched`, `category_unlocked_by_ad`, `pass_24h_purchase_initiated`, `lifetime_purchase_initiated`, `purchase_completed`.
- **`app/index.tsx`** — Added `home_start_tapped` event on the primary start button.
- **`app/categories.tsx`** — Added `category_toggled` (with `action: selected|deselected` and `is_premium`) and `game_started` (with `category_ids` and `category_count`).
- **`app/game.tsx`** — Added `word_guessed_correct` and `word_passed` in the tilt handlers; `game_completed` in the round-finished effect (with `score`, `passes`, `time_mode`, `category_ids`).
- **`components/PremiumOfferModal.tsx`** — Added `paywall_dismissed` on modal dismiss.

## Events instrumented

| Event | Description | File |
|---|---|---|
| `home_start_tapped` | User taps the primary start button on the home screen | `app/index.tsx` |
| `paywall_viewed` | Paywall / premium offer modal displayed (with `trigger` and optional `categoryId`) | `lib/monetization.tsx` |
| `paywall_dismissed` | User dismissed the premium offer modal without purchasing | `components/PremiumOfferModal.tsx` |
| `category_toggled` | User selected or deselected a category tile | `app/categories.tsx` |
| `game_started` | User confirmed category selection and navigated to the game | `app/categories.tsx` |
| `word_guessed_correct` | User tilted forward to mark the current word as correct | `app/game.tsx` |
| `word_passed` | User tilted backward to pass on the current word | `app/game.tsx` |
| `game_completed` | A game round ended — includes `score`, `passes`, `time_mode`, `category_ids` | `app/game.tsx` |
| `rewarded_ad_watched` | User successfully watched a rewarded ad | `lib/monetization.tsx` |
| `category_unlocked_by_ad` | A premium category was unlocked after an ad was watched | `lib/monetization.tsx` |
| `pass_24h_purchase_initiated` | User tapped the 24-hour pass purchase button | `lib/monetization.tsx` |
| `lifetime_purchase_initiated` | User tapped the lifetime purchase button | `lib/monetization.tsx` |
| `purchase_completed` | A premium purchase was completed successfully | `lib/monetization.tsx` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics**: https://us.posthog.com/project/392941/dashboard/1497893
- **Game funnel (Start → Game started → Game completed)**: https://us.posthog.com/project/392941/insights/b3fsihoP
- **Monetization funnel (Paywall viewed → Purchase initiated → Completed)**: https://us.posthog.com/project/392941/insights/pzbFpYrI
- **Game engagement (Correct guesses vs Passes over time)**: https://us.posthog.com/project/392941/insights/uu2gjuyy
- **Ad monetization (Ads watched vs Categories unlocked)**: https://us.posthog.com/project/392941/insights/0SM9vYZA
- **Paywall dismissal rate (Viewed vs Dismissed)**: https://us.posthog.com/project/392941/insights/OLd9fkby

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
