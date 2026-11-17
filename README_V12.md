# First Milk Venture v12

Deploy the coordinated backend first, then this portal with every changed local asset. No new paid service or secret is required.

Admin now supports no base pay, per-delivery, daily, weekly and monthly base-pay schedules with effective dates. Accounts confirms completed fixed-pay periods before credit; duplicate credits and overlaps are rejected by the backend. Peak bonuses, COD holdbacks and payout review remain separate.

Ads & offers → Show in → Home ad strip (former address area) publishes animated artwork or text posts in the removed Home address strip. Choose artwork width/height and contain/cover fit. Text flows below the responsive artwork frame. Existing editor permissions and scheduling remain.

Dark mode now pairs readable text with every themed surface and uses mint, blue, gold and coral accents. Shared OTP fields support keyboard suggestions, grouped paste and an explicit Paste code button; password reset uses a proper one-time-code field rather than a prompt. Suggestions depend on the device/mail app and clipboard permissions.

Performance: chat reads are incremental, attachments load on demand, public campaign bytes are stored outside the main state row and cached separately, and larger API responses are compressed. Existing visible-page revision polling and batching remain. No claim of WebSocket delivery or a hosting latency guarantee is made.

Validation includes JavaScript syntax and full-portal DOM workflow checks, sampled dark contrast above 4.5:1, plus the backend regression suite. Real mobile layout, microphone/keyboard behavior, inbox delivery and production PostgreSQL remain deployment verification. See the backend UPGRADE_V12.md for details.
