# Agent Note: Remove first-run onboarding dialogs

Status: implemented

English | [中文](2026-08-17-remove-first-run-onboarding-dialogs.zh.md)

## Problem

Every fresh GUI profile opened with two blocking first-run dialogs: a versioned internal-testing notice and a conditional official-DeepSeek API-key prompt. Both are friction for a user whose first action is meant to be talking to a model. The recommended first-run key path also changed: the Baizor AI login button beside Settings (see the [Baizor browser login](../feature/2026-08-14-baizor-browser-login.md) note) opens the provider site, stores the key, and sets the agent default model, so a DeepSeek-first prompt no longer matches the product's own flow. The internal-test notice is release-unfit framing for the same reason the earlier beta notice was removed, and nothing else in the product needs a versioned acknowledgement.

## Decision

**Remove both shipped `settings.onboarding` steps and their exclusive code.** `ui-settings-models` no longer registers `welcome-notice` or `deepseek-official`. Deleted with them: the welcome store and copy owner, the shared modal, the credential-only `ProviderEditor` mode with its copy overrides, the onboarding readiness projection, and the `OnboardingSurface` primitive, whose only consumer was these steps. `providerUsable`/`needsSetup` stay because the Models page's first-run setup card — an inline card, not a blocking dialog — still needs them.

**Keep the seams that cost nothing and stay useful.** The `settings.onboarding` slot declaration and the shell coordinator remain, so a future feature-owned step can register without shell changes. The Host keeps `ui-onboarding` registered in the user-settings seam so stored documents from earlier notices remain valid. Both keep-vs-remove choices repeat the [first-run beta notice removal](../simplification/2026-08-13-remove-first-run-beta-notice.md) decision.

**First-run key entry now goes through the Baizor AI login button.** No first-run dialog remains; the login button owns the provider-credential path and the agent default model.

## Alternatives considered

**Drop only the internal-test notice, keeping the DeepSeek key prompt.** Rejected: the product owner asked for both dialogs to go, and the key path already has a dedicated entry point.

**Auto-open the Baizor login flow on first launch instead of a button.** Rejected: the product owner chose an explicit button parallel to Settings, so the choice to configure stays with the user.

**Delete the `settings.onboarding` slot or deregister `ui-onboarding`.** Rejected: the slot is the future extension seam for feature-owned steps, and deregistering the namespace would invalidate stored documents from earlier notices — the same rationale the beta-notice removal recorded.

**Keep the deleted components as dormant code.** Rejected: dead components would re-enter coverage exclusions and drift from their documentation, and no planned flow needs them.

## Consequences

A fresh profile boots straight into the app with no blocking dialog. The onboarding web e2e lanes and their snapshots are deleted, the scaffold's mirrored welcome constants are gone, and the generated client slot catalog records no occupants in `settings.onboarding`. The Models page setup card remains the only first-run posture. This decision supersedes the [shared-modal product onboarding](../feature/2026-08-13-shared-modal-product-onboarding.md), [versioned GUI welcome onboarding](../feature/2026-07-30-versioned-gui-welcome-onboarding.md), [official DeepSeek first-run credential setup](../feature/2026-07-30-deepseek-onboarding-credential-setup.md), and [onboarding takeover chrome](../bug-fix/2026-08-06-onboarding-step-owned-takeover-chrome.md) notes; the [onboarding-reads-every-provider](../bug-fix/2026-08-12-onboarding-reads-every-provider.md) note keeps the Models-page setup-card half.