# Baseline — v0.5.0 scorer (before fix 2)

- Scorer source: src/ tree 0d1700e75321 (check: git rev-parse <commit>:src)
- Date: 2026-11-13
- Ranker: findApis(query, no constraints, top 3) over the 68 bundled entries

| Set | Queries | Top-1 accuracy | Top-3 accuracy | Must-not violation rate |
|-----|---------|----------------|----------------|-------------------------|
| dev | 26 | 21/26 (80.8%) | 25/26 (96.2%) | 8/21 (38.1%) |
| holdout | 42 | 16/42 (38.1%) | 30/42 (71.4%) | 13/42 (31.0%) |

Top-1: rank-1 slug is an acceptable answer. Top-3: an acceptable answer is in the top 3. Violation rate: share of queries with a must-not list where a forbidden slug appeared in the top 3.

## dev — failures

- **d01** "send transactional emails" — must-not in top 3: stripe. Got: resend, stripe, postmark. Wanted top-1: resend / sendgrid / postmark / mailgun
- **d04** "store files and images" — must-not in top 3: stripe. Got: cloudinary, stripe, mux. Wanted top-1: cloudinary / uploadthing / aws-s3 / cloudflare-r2
- **d05** "full-text search for my app" — must-not in top 3: twilio. Got: algolia, twilio, ably. Wanted top-1: algolia
- **d08** "need to know when my app crashes in production" — must-not in top 3: stripe. Got: sentry, stripe, posthog. Wanted top-1: sentry
- **d13** "I want to track how users interact with my product" — top-3 miss; must-not in top 3: stripe. Got: stripe, paddle, shopify-api. Wanted top-1: posthog
- **d18** "real-time anything" — top-1 miss. Got: stream-chat, supabase, mux. Wanted top-1: pusher / ably / supabase
- **d19** "I need everything — auth, database, storage" — top-1 miss. Got: clerk, supabase, cloudinary. Wanted top-1: supabase / firebase
- **d21** "store user uploaded images and resize them" — top-1 miss; must-not in top 3: stripe. Got: stripe, cloudinary, mux. Wanted top-1: cloudinary
- **d22** "speech to text transcription" — top-1 miss. Got: mux, deepgram, twilio. Wanted top-1: deepgram
- **d23** "generate images from text" — must-not in top 3: anthropic. Got: openai, anthropic, eleven-labs. Wanted top-1: stability-ai / replicate / openai
- **d24** "full text search for my product catalog" — must-not in top 3: twilio, stripe. Got: algolia, twilio, stripe. Wanted top-1: algolia

## holdout — failures

- **h04** "transcribe customer support phone calls with speaker labels" — top-1 miss; must-not in top 3: mux. Got: mux, deepgram, twilio. Wanted top-1: deepgram
- **h05** "convert my blog posts into spoken audio with a natural voice" — top-3 miss. Got: mux, twilio, ably. Wanted top-1: eleven-labs / resemble-ai
- **h06** "summarize long legal contracts with an LLM" — must-not in top 3: eleven-labs. Got: openai, anthropic, eleven-labs. Wanted top-1: anthropic / openai
- **h07** "generate embeddings for semantic search over my docs" — must-not in top 3: eleven-labs. Got: openai, anthropic, eleven-labs. Wanted top-1: openai
- **h08** "remove the background from product photos automatically" — top-3 miss; must-not in top 3: stripe. Got: cloudinary, stripe, uploadthing. Wanted top-1: replicate / stability-ai
- **h09** "serve responsive WebP images from my existing S3 bucket" — top-1 miss. Got: aws-s3, cloudflare-r2, cloudinary. Wanted top-1: imgix / cloudinary
- **h10** "let users upload PDF attachments in my Next.js app" — top-1 miss. Got: cloudinary, uploadthing, supabase. Wanted top-1: uploadthing
- **h11** "cheap object storage for large user video files with no egress fees" — top-1 miss. Got: cloudinary, cloudflare-r2, mux. Wanted top-1: cloudflare-r2
- **h13** "accept Apple Pay at my coffee shop's counter" — top-1 miss; must-not in top 3: paddle. Got: stripe, paddle, square. Wanted top-1: square
- **h14** "sell an ebook online and have someone handle EU VAT for me" — top-1 miss. Got: stripe, paddle, shopify-api. Wanted top-1: lemonsqueezy / paddle
- **h15** "split payments between sellers and my platform in a marketplace" — must-not in top 3: paddle. Got: stripe, paddle, square. Wanted top-1: stripe
- **h18** "offline-first data sync for a React Native app" — top-1 miss. Got: supabase, planetscale, firebase. Wanted top-1: firebase
- **h19** "rate limit my login endpoint to stop brute force attempts" — top-3 miss. Got: clerk, auth0, stream-chat. Wanted top-1: arcjet / upstash
- **h20** "get alerted when a new CVE affects my production dependencies" — top-3 miss; must-not in top 3: stripe. Got: stripe, knock, onesignal. Wanted top-1: snyk
- **h22** "alert me when my checkout flow breaks in production" — top-3 miss; must-not in top 3: stripe, paddle. Got: stripe, paddle, knock. Wanted top-1: checkly / sentry
- **h23** "record user sessions to see where people get stuck in my UI" — top-1 miss. Got: supabase, planetscale, posthog. Wanted top-1: posthog
- **h24** "capture unhandled exceptions in my Node backend with stack traces" — top-1 miss. Got: supabase, planetscale, sentry. Wanted top-1: sentry
- **h25** "retry failed webhook processing with durable steps" — top-3 miss; must-not in top 3: stripe. Got: clerk, stripe, nango. Wanted top-1: inngest / trigger-dev / temporal
- **h26** "long-running order fulfillment workflow that waits days for a human approval" — top-1 miss. Got: stripe, paddle, temporal. Wanted top-1: temporal
- **h27** "run a nightly cron job that cleans up old records" — top-3 miss. Got: supabase, planetscale, neon. Wanted top-1: inngest / trigger-dev / temporal / railway
- **h28** "let users connect their HubSpot account to my app via OAuth" — top-1 miss; must-not in top 3: clerk, auth0. Got: clerk, nango, auth0. Wanted top-1: nango
- **h29** "post a Slack message whenever a Typeform is submitted, without writing code" — top-3 miss. Got: twilio, ably, pusher. Wanted top-1: zapier
- **h30** "address autocomplete on my checkout form" — top-1 miss. Got: stripe, algolia, google-maps. Wanted top-1: google-maps / mapbox
- **h31** "headless CMS that I can self-host" — top-1 miss. Got: sanity, contentful, strapi. Wanted top-1: strapi
- **h32** "let our marketing team edit landing page content in multiple languages" — must-not in top 3: stripe. Got: sanity, contentful, stripe. Wanted top-1: contentful / sanity
- **h34** "receive and parse inbound emails sent to our support address" — top-3 miss. Got: resend, postmark, google-maps. Wanted top-1: mailgun
- **h35** "push live sports scores to thousands of browsers in real time" — top-3 miss. Got: stream-chat, knock, onesignal. Wanted top-1: ably / pusher
- **h36** "chat between buyers and sellers in my marketplace app" — must-not in top 3: stripe. Got: stream-chat, sendbird, stripe. Wanted top-1: stream-chat / sendbird
- **h39** "run auth middleware at the CDN edge" — top-1 miss. Got: clerk, cloudinary, cloudflare-workers. Wanted top-1: cloudflare-workers
- **h40** "speech recognition for voice commands in a mobile app" — top-3 miss. Got: twilio, mux, ably. Wanted top-1: deepgram / openai
- **h42** "open source alternative to Shopify that I can host myself" — top-3 miss; must-not in top 3: stripe. Got: stripe, paddle, supabase. Wanted top-1: medusa

## dev — all results

| id | query | top 3 | top-1 | top-3 | violations |
|----|-------|-------|-------|-------|------------|
| d01 | send transactional emails | resend, stripe, postmark | ✓ | ✓ | stripe |
| d02 | process credit card payments | stripe, paddle, razorpay | ✓ | ✓ |  |
| d03 | user authentication for web app | clerk, auth0, stream-chat | ✓ | ✓ |  |
| d04 | store files and images | cloudinary, stripe, mux | ✓ | ✓ | stripe |
| d05 | full-text search for my app | algolia, twilio, ably | ✓ | ✓ | twilio |
| d06 | my users need to log in with Google and GitHub | clerk, auth0, stream-chat | ✓ | ✓ |  |
| d07 | I want to add a chat feature to my app | stream-chat, sendbird, twilio | ✓ | ✓ |  |
| d08 | need to know when my app crashes in production | sentry, stripe, posthog | ✓ | ✓ | stripe |
| d09 | let users upload profile pictures | cloudinary, uploadthing, mux | ✓ | ✓ |  |
| d10 | send an SMS when someone places an order | twilio, ably, pusher | ✓ | ✓ |  |
| d11 | I'm building a SaaS and need billing | stripe, paddle, square | ✓ | ✓ |  |
| d12 | I need a backend for my mobile app | supabase, planetscale, neon | ✓ | ✓ |  |
| d13 | I want to track how users interact with my product | stripe, paddle, shopify-api | ✗ | ✗ | stripe |
| d14 | I need to store data but I'm on Vercel | supabase, planetscale, neon | ✓ | ✓ |  |
| d15 | I need AI in my app | openai, anthropic, eleven-labs | ✓ | ✓ |  |
| d16 | cheapest way to send emails | resend, postmark, mailgun | ✓ | ✓ |  |
| d17 | most reliable payment processor | stripe, paddle, square | ✓ | ✓ |  |
| d18 | real-time anything | stream-chat, supabase, mux | ✗ | ✓ |  |
| d19 | I need everything — auth, database, storage | clerk, supabase, cloudinary | ✗ | ✓ |  |
| d20 | something like Firebase but open source | supabase, stripe, replicate | ✓ | ✓ |  |
| d21 | store user uploaded images and resize them | stripe, cloudinary, mux | ✗ | ✓ | stripe |
| d22 | speech to text transcription | mux, deepgram, twilio | ✗ | ✓ |  |
| d23 | generate images from text | openai, anthropic, eleven-labs | ✓ | ✓ | anthropic |
| d24 | full text search for my product catalog | algolia, twilio, stripe | ✓ | ✓ | twilio, stripe |
| d25 | send push notifications to iOS and Android users | onesignal, knock, novu | ✓ | ✓ |  |
| d26 | deploy a Next.js app to production | vercel, paddle, netlify | ✓ | ✓ |  |

## holdout — all results

| id | query | top 3 | top-1 | top-3 | violations |
|----|-------|-------|-------|-------|------------|
| h01 | verify a user's phone number with a one-time code | twilio, ably, vonage | ✓ | ✓ |  |
| h02 | add an in-app notification bell to my SaaS dashboard | knock, onesignal, novu | ✓ | ✓ |  |
| h03 | send push notifications to web browsers | onesignal, knock, novu | ✓ | ✓ |  |
| h04 | transcribe customer support phone calls with speaker labels | mux, deepgram, twilio | ✗ | ✓ | mux |
| h05 | convert my blog posts into spoken audio with a natural voice | mux, twilio, ably | ✗ | ✗ |  |
| h06 | summarize long legal contracts with an LLM | openai, anthropic, eleven-labs | ✓ | ✓ | eleven-labs |
| h07 | generate embeddings for semantic search over my docs | openai, anthropic, eleven-labs | ✓ | ✓ | eleven-labs |
| h08 | remove the background from product photos automatically | cloudinary, stripe, uploadthing | ✗ | ✗ | stripe |
| h09 | serve responsive WebP images from my existing S3 bucket | aws-s3, cloudflare-r2, cloudinary | ✗ | ✓ |  |
| h10 | let users upload PDF attachments in my Next.js app | cloudinary, uploadthing, supabase | ✗ | ✓ |  |
| h11 | cheap object storage for large user video files with no egress fees | cloudinary, cloudflare-r2, mux | ✗ | ✓ |  |
| h12 | live stream our conference talks to viewers | mux, stream-chat, deepgram | ✓ | ✓ |  |
| h13 | accept Apple Pay at my coffee shop's counter | stripe, paddle, square | ✗ | ✓ | paddle |
| h14 | sell an ebook online and have someone handle EU VAT for me | stripe, paddle, shopify-api | ✗ | ✓ |  |
| h15 | split payments between sellers and my platform in a marketplace | stripe, paddle, square | ✓ | ✓ | paddle |
| h16 | postgres database for my serverless Next.js app | supabase, planetscale, neon | ✓ | ✓ |  |
| h17 | MySQL compatible database with non-blocking schema migrations | planetscale, supabase, neon | ✓ | ✓ |  |
| h18 | offline-first data sync for a React Native app | supabase, planetscale, firebase | ✗ | ✓ |  |
| h19 | rate limit my login endpoint to stop brute force attempts | clerk, auth0, stream-chat | ✗ | ✗ |  |
| h20 | get alerted when a new CVE affects my production dependencies | stripe, knock, onesignal | ✗ | ✗ | stripe |
| h21 | run Playwright tests on real iPhones and Safari | browserstack, checkly, supabase | ✓ | ✓ |  |
| h22 | alert me when my checkout flow breaks in production | stripe, paddle, knock | ✗ | ✗ | stripe, paddle |
| h23 | record user sessions to see where people get stuck in my UI | supabase, planetscale, posthog | ✗ | ✓ |  |
| h24 | capture unhandled exceptions in my Node backend with stack traces | supabase, planetscale, sentry | ✗ | ✓ |  |
| h25 | retry failed webhook processing with durable steps | clerk, stripe, nango | ✗ | ✗ | stripe |
| h26 | long-running order fulfillment workflow that waits days for a human approval | stripe, paddle, temporal | ✗ | ✓ |  |
| h27 | run a nightly cron job that cleans up old records | supabase, planetscale, neon | ✗ | ✗ |  |
| h28 | let users connect their HubSpot account to my app via OAuth | clerk, nango, auth0 | ✗ | ✓ | clerk, auth0 |
| h29 | post a Slack message whenever a Typeform is submitted, without writing code | twilio, ably, pusher | ✗ | ✗ |  |
| h30 | address autocomplete on my checkout form | stripe, algolia, google-maps | ✗ | ✓ |  |
| h31 | headless CMS that I can self-host | sanity, contentful, strapi | ✗ | ✓ |  |
| h32 | let our marketing team edit landing page content in multiple languages | sanity, contentful, stripe | ✓ | ✓ | stripe |
| h33 | build a custom storefront on top of an existing Shopify store | shopify-api, stripe, medusa | ✓ | ✓ |  |
| h34 | receive and parse inbound emails sent to our support address | resend, postmark, google-maps | ✗ | ✗ |  |
| h35 | push live sports scores to thousands of browsers in real time | stream-chat, knock, onesignal | ✗ | ✗ |  |
| h36 | chat between buyers and sellers in my marketplace app | stream-chat, sendbird, stripe | ✓ | ✓ | stripe |
| h37 | deploy a Docker container close to users in multiple regions | fly-io, netlify, vercel | ✓ | ✓ |  |
| h38 | host a static Astro site with built-in form handling | netlify, clerk, stream-chat | ✓ | ✓ |  |
| h39 | run auth middleware at the CDN edge | clerk, cloudinary, cloudflare-workers | ✗ | ✓ |  |
| h40 | speech recognition for voice commands in a mobile app | twilio, mux, ably | ✗ | ✗ |  |
| h41 | AI chatbot that answers questions about our documentation | openai, anthropic, eleven-labs | ✓ | ✓ |  |
| h42 | open source alternative to Shopify that I can host myself | stripe, paddle, supabase | ✗ | ✗ | stripe |
