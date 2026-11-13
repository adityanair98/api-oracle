# After fix 2 — relevance-gated scorer

- Scorer source: src/ tree 449564f70593 (check: git rev-parse <commit>:src)
- Date: 2026-11-13
- Ranker: findApis(query, no constraints, top 3) over the 68 bundled entries

| Set | Queries | Top-1 accuracy | Top-3 accuracy | Must-not violation rate |
|-----|---------|----------------|----------------|-------------------------|
| dev | 26 | 25/26 (96.2%) | 26/26 (100.0%) | 0/21 (0.0%) |
| holdout | 42 | 39/42 (92.9%) | 40/42 (95.2%) | 1/42 (2.4%) |

Top-1: rank-1 slug is an acceptable answer. Top-3: an acceptable answer is in the top 3. Violation rate: share of queries with a must-not list where a forbidden slug appeared in the top 3.

## dev — failures

- **d03** "user authentication for web app" — top-1 miss. Got: firebase, clerk, auth0. Wanted top-1: clerk / auth0

## holdout — failures

- **h13** "accept Apple Pay at my coffee shop's counter" — top-3 miss; must-not in top 3: paddle. Got: paypal, stripe, paddle. Wanted top-1: square
- **h14** "sell an ebook online and have someone handle EU VAT for me" — top-1 miss. Got: stripe, paddle, lemonsqueezy. Wanted top-1: lemonsqueezy / paddle
- **h22** "alert me when my checkout flow breaks in production" — top-3 miss. Got: shopify-api. Wanted top-1: checkly / sentry

## dev — all results

| id | query | top 3 | top-1 | top-3 | violations |
|----|-------|-------|-------|-------|------------|
| d01 | send transactional emails | resend, postmark, mailgun | ✓ | ✓ |  |
| d02 | process credit card payments | stripe, paypal, razorpay | ✓ | ✓ |  |
| d03 | user authentication for web app | firebase, clerk, auth0 | ✗ | ✓ |  |
| d04 | store files and images | aws-s3, cloudinary | ✓ | ✓ |  |
| d05 | full-text search for my app | algolia | ✓ | ✓ |  |
| d06 | my users need to log in with Google and GitHub | clerk | ✓ | ✓ |  |
| d07 | I want to add a chat feature to my app | stream-chat, pusher, sendbird | ✓ | ✓ |  |
| d08 | need to know when my app crashes in production | sentry, posthog, checkly | ✓ | ✓ |  |
| d09 | let users upload profile pictures | uploadthing | ✓ | ✓ |  |
| d10 | send an SMS when someone places an order | twilio, vonage, knock | ✓ | ✓ |  |
| d11 | I'm building a SaaS and need billing | stripe, lemonsqueezy | ✓ | ✓ |  |
| d12 | I need a backend for my mobile app | firebase | ✓ | ✓ |  |
| d13 | I want to track how users interact with my product | posthog | ✓ | ✓ |  |
| d14 | I need to store data but I'm on Vercel | upstash, firebase, google-maps | ✓ | ✓ |  |
| d15 | I need AI in my app | anthropic, openai, stability-ai | ✓ | ✓ |  |
| d16 | cheapest way to send emails | resend, postmark, mailgun | ✓ | ✓ |  |
| d17 | most reliable payment processor | stripe, square, razorpay | ✓ | ✓ |  |
| d18 | real-time anything | supabase, eleven-labs, sanity | ✓ | ✓ |  |
| d19 | I need everything — auth, database, storage | supabase, firebase, nango | ✓ | ✓ |  |
| d20 | something like Firebase but open source | supabase | ✓ | ✓ |  |
| d21 | store user uploaded images and resize them | cloudinary, aws-s3, cloudflare-r2 | ✓ | ✓ |  |
| d22 | speech to text transcription | deepgram | ✓ | ✓ |  |
| d23 | generate images from text | replicate, stability-ai, openai | ✓ | ✓ |  |
| d24 | full text search for my product catalog | algolia, supabase | ✓ | ✓ |  |
| d25 | send push notifications to iOS and Android users | onesignal | ✓ | ✓ |  |
| d26 | deploy a Next.js app to production | vercel | ✓ | ✓ |  |

## holdout — all results

| id | query | top 3 | top-1 | top-3 | violations |
|----|-------|-------|-------|-------|------------|
| h01 | verify a user's phone number with a one-time code | vonage | ✓ | ✓ |  |
| h02 | add an in-app notification bell to my SaaS dashboard | novu, pusher, knock | ✓ | ✓ |  |
| h03 | send push notifications to web browsers | onesignal | ✓ | ✓ |  |
| h04 | transcribe customer support phone calls with speaker labels | deepgram | ✓ | ✓ |  |
| h05 | convert my blog posts into spoken audio with a natural voice | eleven-labs | ✓ | ✓ |  |
| h06 | summarize long legal contracts with an LLM | anthropic | ✓ | ✓ |  |
| h07 | generate embeddings for semantic search over my docs | openai | ✓ | ✓ |  |
| h08 | remove the background from product photos automatically | stability-ai | ✓ | ✓ |  |
| h09 | serve responsive WebP images from my existing S3 bucket | imgix | ✓ | ✓ |  |
| h10 | let users upload PDF attachments in my Next.js app | uploadthing | ✓ | ✓ |  |
| h11 | cheap object storage for large user video files with no egress fees | cloudflare-r2, aws-s3 | ✓ | ✓ |  |
| h12 | live stream our conference talks to viewers | mux, stream-chat, ably | ✓ | ✓ |  |
| h13 | accept Apple Pay at my coffee shop's counter | paypal, stripe, paddle | ✗ | ✗ | paddle |
| h14 | sell an ebook online and have someone handle EU VAT for me | stripe, paddle, lemonsqueezy | ✗ | ✓ |  |
| h15 | split payments between sellers and my platform in a marketplace | stripe | ✓ | ✓ |  |
| h16 | postgres database for my serverless Next.js app | neon, supabase, railway | ✓ | ✓ |  |
| h17 | MySQL compatible database with non-blocking schema migrations | planetscale | ✓ | ✓ |  |
| h18 | offline-first data sync for a React Native app | firebase | ✓ | ✓ |  |
| h19 | rate limit my login endpoint to stop brute force attempts | arcjet, upstash | ✓ | ✓ |  |
| h20 | get alerted when a new CVE affects my production dependencies | snyk, checkly, sentry | ✓ | ✓ |  |
| h21 | run Playwright tests on real iPhones and Safari | browserstack, checkly | ✓ | ✓ |  |
| h22 | alert me when my checkout flow breaks in production | shopify-api | ✗ | ✗ |  |
| h23 | record user sessions to see where people get stuck in my UI | posthog | ✓ | ✓ |  |
| h24 | capture unhandled exceptions in my Node backend with stack traces | sentry | ✓ | ✓ |  |
| h25 | retry failed webhook processing with durable steps | inngest, temporal | ✓ | ✓ |  |
| h26 | long-running order fulfillment workflow that waits days for a human approval | temporal | ✓ | ✓ |  |
| h27 | run a nightly cron job that cleans up old records | inngest, trigger-dev, railway | ✓ | ✓ |  |
| h28 | let users connect their HubSpot account to my app via OAuth | nango | ✓ | ✓ |  |
| h29 | post a Slack message whenever a Typeform is submitted, without writing code | zapier | ✓ | ✓ |  |
| h30 | address autocomplete on my checkout form | google-maps | ✓ | ✓ |  |
| h31 | headless CMS that I can self-host | strapi, sanity | ✓ | ✓ |  |
| h32 | let our marketing team edit landing page content in multiple languages | contentful | ✓ | ✓ |  |
| h33 | build a custom storefront on top of an existing Shopify store | shopify-api | ✓ | ✓ |  |
| h34 | receive and parse inbound emails sent to our support address | mailgun | ✓ | ✓ |  |
| h35 | push live sports scores to thousands of browsers in real time | ably, pusher | ✓ | ✓ |  |
| h36 | chat between buyers and sellers in my marketplace app | sendbird, stream-chat | ✓ | ✓ |  |
| h37 | deploy a Docker container close to users in multiple regions | fly-io | ✓ | ✓ |  |
| h38 | host a static Astro site with built-in form handling | netlify, formspark | ✓ | ✓ |  |
| h39 | run auth middleware at the CDN edge | cloudflare-workers | ✓ | ✓ |  |
| h40 | speech recognition for voice commands in a mobile app | deepgram | ✓ | ✓ |  |
| h41 | AI chatbot that answers questions about our documentation | openai, anthropic | ✓ | ✓ |  |
| h42 | open source alternative to Shopify that I can host myself | medusa, supabase, cal-com | ✓ | ✓ |  |
