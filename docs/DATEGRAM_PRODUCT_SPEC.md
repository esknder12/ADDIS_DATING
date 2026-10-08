# Dategram — Complete UX/UI Product Specification

> Source of truth for rebuilding the Dategram Telegram Mini App from the supplied 86-screen reference set.
>
> **Implementation status:** Phase 1 (bot, Mini App shell, Telegram authentication, and user persistence) is implemented. The remaining screens below define Phases 2–8.

## Contents

1. [Product and brand](#1-product-and-brand)
2. [Telegram bot entry](#2-telegram-bot-entry)
3. [Onboarding](#3-onboarding)
4. [Post-onboarding conversion](#4-post-onboarding-conversion)
5. [Bot-based verification](#5-bot-based-verification)
6. [Main navigation](#6-main-navigation)
7. [Discover](#7-discover)
8. [AI Picks](#8-ai-picks)
9. [Likes and matches](#9-likes-and-matches)
10. [Chat](#10-chat)
11. [Own profile](#11-own-profile)
12. [Other-user profile detail](#12-other-user-profile-detail)
13. [Monetization](#13-monetization)
14. [Design system](#14-design-system)
15. [Reusable component inventory](#15-reusable-component-inventory)
16. [Implementation rules](#16-implementation-rules)

---

## 1. Product and brand

- **Name:** Dategram
- **Bot:** `@DategramAppBot`
- **Tagline:** “Dating with intention, right inside Telegram”
- **Visual theme:** pure-black dark mode, white text, pink/red accent near `#FF2D55`
- **Logo:** rounded black square with a white-to-pink heart/leaf mark
- **Reference audience/copy:** primarily men seeking women; partner copy uses “she/her”

Repeated value propositions:

1. Real people only: profiles are photo/video reviewed and verified.
2. Users stay in control: nobody can message without a mutual match.
3. Smart matching: interests, values, lifestyle, intention, and city.
4. Nearby candidates: people who actually live in the same city.
5. Low effort: ten minutes per day is positioned as enough.

---

## 2. Telegram bot entry

### B1 — Bot profile / intro

Heading: **What can this bot do?**

```text
Dategram - dating with intention, right inside Telegram.

Nobody's here for a one-night chat. They're here for someone who shares their values.

🛡️ Real people only - every profile is reviewed and verified.
🔒 You're in control - no one messages you without a match.
✨ Smart AI matching - by interests, values and city.
📍 Close by - people who actually live in your city.

Set up your profile in 2 minutes and find your person 🤍
```

### B2 — `/start`

User sends `/start`. The bot replies:

```text
Welcome to Dategram 🖤

Answer a few questions about yourself — AI will find those who are perfect for you. ⬇️
```

Inline Web App button: **Go to Dategram**.

### B3 — Mini App launch

- Telegram header: Dategram, menu, close
- Centered pulsing Dategram logo
- Footer: `@DategramAppBot`

---

## 3. Onboarding

### 3.1 Global structure

Five named sections:

1. **About You**
2. **Your Type**
3. **Lifestyle**
4. **Relationship Goals**
5. **Almost There**

Question screens use:

- Back navigation
- Centered section label
- Thin segmented progress indicator
- Large, bold question
- “Choose all that apply” for multi-select questions
- Dark pill/list/image options
- Pink selected outline and pink checkbox
- White, full-width **NEXT STEP** button for multi-select/manual screens
- Single-select screens usually advance automatically after a short selected-state delay

Interstitial screens are not questions and do not advance question progress. They use a large marketing heading, gray explanatory copy, image/visual, and a white **CONTINUE** pill.

### 3.2 Section 1 — About You

#### Q1.1 — Gender

**What’s your gender?**

- ♂ Male
- ♀ Female

Single select; large icon pills; pink selected border.

#### I1 — Social proof

- Heading: **Over 2.4M men**
- Copy: “in their 20s–40s have already met someone here.”
- Image: two women posing in red/blue outfits
- Caption: **As featured in**
- CTA: **CONTINUE**

#### Q1.2 — Previous dating-app use

Section: About You; first progress segment.

**Have you used dating apps before?**

- Yes
- No

Model image bleeds from the right side.

#### I2 — Differentiation

- Heading: **Dating that actually works differently.**
- Copy: “Our AI matching learns your type and shows you women you'll actually click with, instead of endless random swipes. People here are motivated to meet, not just to scroll. That's why we're growing fast.”
- Image: woman using a phone among white flowers
- CTA: **CONTINUE**

#### Q1.3 — Current intention

**What are you looking for right now?**
*Choose all that apply*

- ⚭ Serious relationship
- 💬 Dating & seeing where it goes
- 📱 Online communication
- 🧭 Not sure yet

#### I3 — Intention match preview

- Heading: **We’ll show you women who want the same thing.**
- Copy: “No guessing games. We match you on intention first, so you don't waste weeks on people who want something different.”
- Sample card: “Roxy, 26” with verified badge and intent caption
- CTA: **CONTINUE**

#### Q1.4 — Other priorities

**What else matters to you?**
*Choose all that apply*

- ✈ Someone to travel with
- ♡ Emotional connection
- ✨ Fun and spontaneity
- 🏠 Building a family
- 🚩 A partner who supports my goals

#### Q1.5 — Body-type preference

**Which body type do you find most attractive?**
*Choose all that apply*

Two-column image-card grid:

- Slim
- Athletic
- Curvy
- Average

Cards have full-bleed imagery, bottom scrim/label, and top-corner checkbox.

#### Q1.6 — Style preference

**What’s your type?**
*Choose all that apply*

Two-column image-card grid:

- Natural
- Glamorous
- Sporty
- Elegant

#### Q1.7 — Relationship recency

**When was your last relationship?**

- Less than a year ago
- 1–2 years ago
- More than 3 years ago
- Never had a serious one

#### I4 — Time commitment

- Heading: **Just 10 minutes a day is enough.**
- Copy: “You don't need to swipe for hours. Our algorithm learns your type and brings the right women to you. You just pick who to talk to.”
- Visual: verified avatar cluster around pink heart/sparkle
- CTA: **CONTINUE**

### 3.3 Section 2 — Your Type

#### Q2.1 — Date frequency

**How often do you go on dates?**

- Almost every week
- A few times a month
- A few times a year
- Almost never

Model image bleeds from right side.

#### Q2.2 — First visual/physical signal

**What catches your eye first?**
*Choose all that apply*

Rows contain a checkbox, label, and small right thumbnail:

- Eyes
- Hair
- Smile
- Figure
- Style
- Voice

#### I5 — Verification trust

- Heading: **Every photo you see is real.**
- Copy: “Women here pass photo and video verification. You'll get a verified badge on every profile you're shown.”
- Image: two-woman selfie with **✓ Verified** overlay
- CTA: **CONTINUE**

#### Q2.3 — Preferred age range

**What age range are you into?**

- 18–24
- 25–30
- 30–38
- 38+

Right-side model photo.

#### Q2.4 — Preferred distance

**How far should she live from you?**

- Same neighborhood
- Same city
- Within 100 km
- Distance doesn’t matter

#### Q2.5 — Conversation confidence

**How do you feel about starting the conversation?**

- I never know what to write
- I can, but replies are rare
- I’m fine at it
- I’d rather she wrote first

#### Q2.6 — Dating-app frustrations

**What’s frustrated you most in dating apps?**
*Choose all that apply*

Two-column glitch-image grid:

- Fake profiles
- Getting ghosted
- Endless small talk
- Matches that never reply

#### I6 — Reassurance

- Green check icon
- Heading: **We got you!**
- Copy: “Every profile is photo-verified. No bots, no fakes.”
- CTA: **CONTINUE**

### 3.4 Section 3 — Lifestyle

#### Q3.1 — Work schedule

**What’s your work schedule like?**

- 💻 9 to 5
- 🎨 Flexible hours
- 🌙 Night shifts
- 💼 I run my own thing

#### Q3.2 — Weekends

**How do you usually spend your weekend?**

- 👥 Going out and meeting people
- ⛰ Sports and outdoors
- 🏠 At home, recharging
- 📖 Working or studying

#### Q3.3 — Social energy

**How’s your social energy?**

- I’m the life of the party
- I open up in small groups
- I’m reserved until I trust someone
- Depends on my mood

Use abstract curved-line icons.

#### I7 — Lifestyle matching

- Heading: **Meet women who match your rhythm.**
- Copy: “Whether you're a night-out person or a Sunday-at-home person, we'll show you women whose lifestyle actually fits yours.”
- Image: woman stretching by a window in cozy clothes, coffee visible
- CTA: **CONTINUE**

#### Q3.4 — Ideal first date

**What’s your ideal first date?**

Large restaurant/garden image, then a two-by-two text grid:

- Coffee and a walk
- Dinner and drinks
- Something active
- Haven’t decided yet

#### Q3.5 — Home atmosphere

**What atmosphere should you two have at home?**

Large warm couch/reading image, then:

- Warm and caring
- Independent and busy
- Playful and fun
- Calm and grounded

### 3.5 Section 4 — Relationship Goals

#### Q4.1 — Desired activity level

**How active should she be?**

Tennis-court hero image, then:

- Very sporty
- Active on weekends
- Chill, occasional walks
- Doesn’t matter to me

#### Q4.2 — Children

**Kids in the picture?**

Family-dinner hero image, then:

- Want kids together
- Open to it
- Already have, open to hers
- Prefer no kids

#### Q4.3 — Ambition

**How ambitious should she be?**

Office/blazer hero image, then:

- Career-driven
- Balanced
- Family first
- Doesn’t matter

#### Q4.4 — Common ground

**What should you have in common?**
*Choose all that apply*

**HOME & FAMILY**

- ⚭ Traditional values — family, stability, loyalty
- 🏠 Home & comfort — cosy evenings, cooking together

**ADVENTURE & GROWTH**

- ✈ Travel & discovery — new cities, new food
- 📖 Self-development — books, courses, growth
- 💼 Career & ambition — goals, business, hustle

**LEISURE & CULTURE**

- ⛰ Sports & outdoors — gym, hiking, running
- 🎬 Movies & music — cinema nights, concerts
- 🎵 Nightlife & fun — bars, parties, friends

Category labels are small uppercase gray text. Each option has icon, stacked title/subtitle, and checkbox.

#### I8 — Algorithm proof

- Pink heart with radar/pulse rings
- Heading: **Our algorithm does the hard part.**
- Copy: “Our compatibility engine scores every profile on 60+ factors from your answers. 83% of Premium users get a first date within 2 weeks.”
- CTA: **CONTINUE**

#### Q4.5 — Dealbreakers

**Any dealbreakers?**
*Choose all that apply*

- 🚬 Smoking
- 🚫 Doesn’t want a relationship
- 📍 Lives too far
- ⚖ Very different values
- ✕ None of the above

“None” is mutually exclusive with other answers.

#### Q4.6 — Activities to share

**What do you want to share with her?**
*Choose all that apply*

- ✈ Travel
- 🍴 Food & cooking
- 🎬 Movies & series
- ⚽ Sports
- 🎵 Music & concerts
- ✕ None of the above

“None” is mutually exclusive with other answers.

#### I9 — Success stories

Heading: **Success stories**

Three compact stat cards:

- **2.4M** — men with us
- **83%** — first date within 2 weeks
- **4.8** — App Store rating

Scrollable testimonial cards include avatar, name, age, location, verified badge, quote, and result tag.

Examples:

- **Abel, 31 · Addis Ababa:** “Three years of dead chats on other apps. Here my second match answered in an hour and we met that weekend.” Tag: **First date in 6 days**.
- **Biruk, 27 · Hawassa:** begins “Every profile was a real person. That alone...”

CTA: **CONTINUE**.

### 3.6 Section 5 — Almost There

#### Q5.1 — Current barriers

**What’s been holding you back from meeting someone?**
*Choose all that apply*

- 💼 Work takes all my time
- 💔 A hard breakup
- 💬 Not enough matches
- 👥 I’m shy at first
- 🧭 Wrong apps, wrong people

#### I10 — Product value

- Heading: **We’ll help you find her.**
- Copy: “With your Match Report, verified matches and daily picks, you'll have everything you need to meet the right woman.”
- Image: woman lying on a deck/porch with phone
- CTA: **CONTINUE**

#### Q5.2 — Age

**What’s your age?**

- Large centered numeric input, placeholder **Age**, suffix **years**
- Copy: “Available only to adults 18 and over.”
- Valid range: 18–100

After a valid value (reference: 26), show:

- “✓ Great news: women 25–34 are the most active group here”
- “Men your age get 2.3× more replies than the average.”

CTA: **NEXT STEP**.

#### Q5.3 — Location

**Where do you live?**

Search input with location/autocomplete suggestions. Default examples: Tokyo, Cairo, Hong Kong, Singapore. Query “ADIS” returns Addis Ababa, Adissan, Adiserai, and Ādis K’idamē.

After selecting Addis Ababa:

- “📍 11 women active in Addis Ababa this week”
- “Most of them replied to a message in the last 24 hours.”

CTA: **NEXT STEP**.

#### Q5.4 — Availability

**When are you usually free to meet?**
“We’ll match you with women who are free at the same time.”

Multi-select:

- 🌙 Weekday evenings
- ✨ Weekends
- 🍴 Lunch breaks
- 🧭 Flexible

#### I11 — Match growth

- Heading: **Here’s how your matches grow**
- Copy: “Most men with your profile go from 2 to 12 matches a week within a month of Premium.”
- Info card: “📅 40 women in Addis Ababa are free on weekends”
- Week 1–4 pink gradient line/area chart, 0–12 matches, endpoint markers
- CTA: **CONTINUE**

#### Q5.5 — Four-week outcome

**What would make the next 4 weeks a win for you?**

- ♡ One great first date
- 💬 A few real conversations going
- ⚭ Meeting someone I want to see again
- 🧭 Just getting back out there

#### Q5.6 — Readiness

**How ready are you to actually go on that date?**

- Ready, just need the right match
- Ready, but a bit rusty
- Nervous, but willing to try
- Not sure yet

Use abstract line icons.

#### I12 — Trust badges

Heading: **What makes us a trusted choice**

Three badge cards:

- Telegram Mini App of the Year — Telegram · 2025
- Top-10 Dating Apps — Google Play · 2026
- 4.8 rating, 340K reviews — App Store · 2026

CTA: **CONTINUE**.

#### Q5.7 — First move

**Who should make the first move?**

Full-length model image on the right; left-side pills:

- I do
- She can
- Doesn’t matter

---

## 4. Post-onboarding conversion

### R1 — Analyze answers

Heading: **Analyzing your answers...**

Animated checklist/progress bars:

1. About You
2. Your Type
3. Lifestyle
4. Relationship Goals
5. Match Potential

Completed rows turn white and show a check circle. Footer badge rotates between:

- Telegram Mini App of the Year 2025
- Top-10 Dating Apps, Google Play 2026

### R1b — Candidate-search simulation

Reference captures also include **Finding women who match your type...** with circular percentage progress (24%, 39%, 57%, etc.), rotating five-star reviews, and testimonial snippets such as “Met my girlfriend in 9 days” and “Finally, real people.” Treat this as an optional second analysis stage before the result.

### R2 — Match-potential result

Heading: **Here’s your dating profile**

Card:

- Label: **MATCH POTENTIAL**
- Score pill: **You: 87**
- Gradient scale: LOW — AVERAGE — HIGH — VERY HIGH
- Dot marker corresponding to score
- Profile image on right
- ✨ Your type: Natural, 25–30
- 💬 Dating style: Connector ⓘ
- 👥 Match pool: 57 women in Addis Ababa
- 🚩 Response rate: Above average, 2.3×

CTA: **CONTINUE**.

### R3 — Optional email

Heading: **Enter your email to get your personalized Match Report and meet her**

- Email input with mail icon
- Privacy copy: “We respect your privacy and never share your email. Your Match Report stays between us.”
- **CONTINUE** disabled until valid email
- Secondary action: **SKIP THIS STEP**

### R4 — Name

Heading: **What’s your name?**

- Large underline-style text input
- Placeholder: **Your name**
- **CONTINUE** disabled until non-empty

### R5 — Four-week plan

Heading: **[NAME], your 4-week Match Plan is ready**

Chart card:

- **YOUR MATCHES***
- Pink curve from **2/week · Now** to **12/week · After 4 weeks**
- Endpoint markers
- “This chart is for illustrative purposes only.”

Benefits:

- ⭐ Perfect for your dating style
- ✓ Customized based on your answers
- ➤ Goal: One great first date

Footnote: “*Based on Premium users with a similar profile. Results vary.”

CTA: **CONTINUE**.

### R6 — Scratch discount

Heading: **Scratch to reveal your special discount**
“We want you to start your journey with a nice surprise.”

Interactive canvas-based scratch card:

- Covered: textured gray layer, hand cursor, “Scratch it off,” dashed divider, Promo code label
- Revealed: huge **50%**, “discount,” “on your Premium,” promo code `dategram_oct26`, green check, “Applied automatically at checkout”
- Reveal automatically when the cleared percentage passes an accessible threshold; include a keyboard/tap alternative

After completion, enter the main app on Discover.

---

## 5. Bot-based verification

Verification deliberately uses Telegram’s native circular video-note capture rather than browser camera APIs.

### V1 — In-app modal

- Dimmed overlay and dark modal
- Circular profile image with blue verified check
- Heading: **Get your verification badge**
- Copy: “Verification helps build a safer, more trusting community. A badge helps people trust your profile”
- Secondary pill: **💬 Video selfie**
- Green primary CTA: **Get verified**
- Close icon

### V2 — Bot instructions

The CTA closes/minimizes the Mini App and returns to `@DategramAppBot`.

Pinned bot message: “You’re almost there! 🚀 Complete your registration to start meeting amazing people!” with **Return to Dategram 🖤**.

Bot sends an example round video note, then:

```text
One step away from the checkmark ✅

1️⃣ Press and hold the camera button in the bottom right corner.
2️⃣ Smile at the camera and slowly turn your head to the side.

💡 If you see a microphone icon, tap it once to switch to the camera.

I'm waiting for your video right here! 🤳
```

### V3 — Submission

The user replies with a native Telegram round video note. The backend listens for `video_note`, associates the Telegram sender with a Dategram user, stores the Telegram file ID/review record, and moves verification to pending. A moderation or AI process later sets `is_verified`.

---

## 6. Main navigation

Persistent five-item bottom navigation:

| Position | Icon | Tab | Destination |
|---:|---|---|---|
| 1 | stacked cards | Discover | swipe deck |
| 2 | sparkles | AI Picks | daily curation |
| 3 | heart | Likes | liked-you and matches |
| 4 | chat bubble | Chat | conversations |
| 5 | person | Profile | own profile/settings |

Active icons are white/filled; inactive icons are gray/outline. Respect Telegram and device bottom safe areas.

---

## 7. Discover

A nearly full-screen primary-photo card:

- Top-left boost/lightning circular control in pink
- Top-right filter/sliders circular control
- Right-middle up-arrow button to expand/view more
- Bottom gradient scrim
- Name, decorative ribbon emoji, age (example: **Rodas 🎀 19**)
- Location (example: **Addis Ababa, Ethiopia**)
- Truncated bio

Five circular actions:

1. Rewind — gray
2. Pass — red X
3. Super Like — gold star
4. Like — lavender heart
5. Direct message/send — blue paper plane

Support gesture swipes (left pass, right like), button parity, undo animation, and haptics. Do not allow a direct message to bypass the product’s mutual-match safety rule unless explicitly monetized and policy-approved.

---

## 8. AI Picks

Black loading/curation state with nav visible:

- Sparkle icon
- Gray **Please wait**
- Analyzing your preferences
- Searching for suitable candidates
- Preparing a personal selection

Incomplete steps use gray circles, active step pulses and ends in ellipsis, completed steps use white check circles. It may replay on tab entry to communicate active curation, but cache actual results and avoid unnecessary server work.

---

## 9. Likes and matches

Pill segmented control:

- Liked you
- Matches

Reference empty state (Matches selected):

- Gray clock/person icon
- Heading: **Inbox reactions**
- Copy: “When someone will send a reaction on your profile we will notify you”

Use improved grammar only if product copy is explicitly revised; otherwise retain captured wording.

---

## 10. Chat

Reference empty state:

- Overlapping pink/dark chat bubbles with ellipsis
- Heading: **No chats yet**
- Copy: **Send reactions to get matches**

Populated state (inferred requirement): matched-user rows with avatar, verified status, last-message preview, timestamp, unread count, and navigation to a one-to-one thread. Only matched, unblocked users can exchange messages.

---

## 11. Own profile

Header content:

- Centered circular profile image
- Uppercase bold name (reference: **ESKNDER ZINABIE**)
- Large age (26)
- Addis Ababa, Ethiopia

VIP card:

- Dategram wordmark
- Orange **VIP** tag
- **Free messages**
- Orange/red **Activate** pill

Verification row: green border, **✓ Get verified**, chevron.

Settings groups:

**Profile management**

- 👤 Edit profile
- 📄 Additional info
- 🤖 AI profile score
- 🔍 Looking for

**Support**

- ➤ Contact support
- ❓ FAQ
- 📄 Privacy policy

### AI Profile Score

- Heading: **Profile Score**
- Center loading/placeholder visual
- **Learning...**
- “We’ll let you know when the score is ready”
- Green **Find out the score** button
- **Profile statistics** section below

---

## 12. Other-user profile detail

- Name, ribbon emoji, age
- Truncated bio/intent
- Top-right down-arrow/scroll affordance
- Heading: **Make happy [NAME]**
- “Send her an exclusive gift”

Three gift cards:

- 💍 Ring — ⭐ 125
- 💎 Diamond — ⭐ 125
- 🌹 Rose — ⭐ 31

Then:

- **🎁 Send gift**
- **Report** destructive/pink text action
- Bottom actions: pass, super like, like, send message (no rewind)

---

## 13. Monetization

| Feature | Mechanism | Surface |
|---|---|---|
| Dategram VIP | Subscription; “Free messages” and future premium limits | own profile |
| Telegram Stars gifts | Ring, diamond, rose | profile detail |
| Premium promotion | scratch card, 50% code | post-onboarding |
| Verification | trust feature via video note; not assumed paid | modal + bot |
| Match Report | optional-email lead and personalized result | post-onboarding |
| AI Profile Score | delayed engagement/possible premium feature | profile |

All Telegram digital-goods purchases must use the currently required Telegram Stars invoice flow and must be confirmed server-side before fulfillment.

---

## 14. Design system

### Colors

| Token | Value | Use |
|---|---|---|
| Background | `#000000` | app canvas |
| Primary text | `#FFFFFF` | headings/body emphasis |
| Secondary text | `#9CA3AF` | supporting copy |
| Accent | `#FF2D55` | selections, highlights, key status |
| Success | `#22C55E` | verified/success |
| Card | `#171719`–`#262626` | surfaces/options |
| Border | `#29292D` | separators/outlines |
| Star | `#FBBF24` | gifts/super like |
| Like | `#C4B5FD` | like action |
| Message | `#3B82F6` | send/message action |

### Type

- System sans (`Inter`, SF Pro, Segoe UI fallback)
- Main headings: 24–32 px, bold, tight line height/negative tracking
- Body: 14–16 px
- Buttons: 14–16 px semibold/bold
- Section labels: 11–14 px; small caps or subtle gradient where captured

### Dimensions

- Horizontal screen padding: 20–24 px
- Stacked-option gap: 12–16 px
- Standard button height: 52–56 px
- Pills: fully rounded
- Cards/images: 16–20 px radius
- Circular action controls: 48–56 px
- Checkbox: about 24 px, 6 px radius
- Progress segments: 3–4 px high

### States

- Option default: dark surface, no bright border
- Selected: 2 px pink border; checkbox pink with white check
- Disabled CTA: dark gray surface/text, no shadow
- Active white CTA: black label and subtle pressed scale
- All controls need focus-visible, reduced-motion, and at least 44 px hit targets

---

## 15. Reusable component inventory

1. `OnboardingProgressBar`
2. `QuestionHeader`
3. `SingleSelectOption`
4. `MultiSelectOption`
5. `ImageGridOption`
6. `CategorizedMultiSelectList`
7. `InterstitialScreen`
8. `TestimonialCard`
9. `StatCard`
10. `NumericInputScreen`
11. `TextInputScreen`
12. `LocationAutocompleteInput`
13. `ResultScoreCard`
14. `LineChartCard`
15. `ScratchCard`
16. `LoadingAnalysisScreen`
17. `BottomNavBar`
18. `SwipeCard`
19. `SwipeActionButtons`
20. `ProfileDetailSheet`
21. `GiftShopGrid`
22. `EmptyState`
23. `SettingsListGroup`
24. `VerificationModal`
25. `TopBar`

---

## 16. Implementation rules

1. **Config-driven flow:** questions and interstitials live in a data/config module. Do not hardcode a large switch statement or one component per question.
2. **Stable keys:** every answer has a permanent snake-case key (for example `looking_for`, `body_type_preference`, `work_schedule`). UI copy may change without database migration.
3. **Resumable:** persist answer changes and current step; users reopening Telegram continue where they left off.
4. **Server validation:** accepted answer IDs, cardinality, age range, and location IDs are validated by the API, not only the UI.
5. **Mutual exclusion:** “None of the above” options clear conflicting selections.
6. **Accessibility:** use real buttons/inputs, visible labels, focus states, sufficient contrast, reduced motion, and non-canvas alternatives for scratch interaction.
7. **Safe areas:** account for Telegram content safe-area and iOS bottom inset.
8. **Telegram identity:** protected API identity always comes from server-validated `initData`; never accept a user ID from the request body.
9. **Privacy:** collect the minimum location precision and do not expose exact coordinates to another user.
10. **Adult-only:** enforce age 18+ at both client and server layers.
11. **Safety invariant:** messaging requires a valid mutual match and no block in either direction.
12. **Media rights:** production imagery must be licensed/owned; screenshot subjects are design references, not distributable assets.
13. **Claims:** award badges, user counts, ratings, response multipliers, and success-rate claims must not ship publicly unless substantiated and legally approved.
14. **Payments:** Telegram Stars fulfillment is idempotent and server-confirmed.
15. **Testing:** unit-test flow transitions/validation, API authorization, matching invariants, and payment/verification idempotency; include mobile viewport E2E coverage.
