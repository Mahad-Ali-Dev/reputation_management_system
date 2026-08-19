/**
 * Dev-only: seed a realistic demo business so screenshots show populated UI.
 * Idempotent — wipes + reseeds a stable demo org ("Summit Dental Studio").
 * Bypasses RLS via DIRECT_URL. Writes the org id to .pdf-build/_demo_org.txt.
 *
 * Run:  node scripts/dev-seed-demo.mjs
 */
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient({ datasources: { db: { url } } });

const SLUG = "summit-dental-studio";
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const ri = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const daysAgo = (d, jitterH = 0) => new Date(Date.now() - d * 864e5 - ri(0, jitterH) * 36e5);
const h = (s) => createHash("sha256").update(s).digest("hex");
const bytes = () => Buffer.from(randomBytes(16));

const FIRST = ["James","Maria","David","Sarah","Michael","Jennifer","Robert","Lisa","William","Karen","Daniel","Nancy","Chris","Amy","Kevin","Ashley","Brian","Emily","Jason","Megan","Carlos","Priya","Wei","Fatima","Diego","Hannah","Omar","Grace","Tyler","Olivia"];
const LAST = ["Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Rodriguez","Martinez","Hernandez","Lopez","Gonzalez","Wilson","Anderson","Thomas","Lee","Patel","Nguyen","Kim","Chen","Singh","Brooks","Reed","Foster","Hughes","Price","Bennett","Wood","Ross"];
const name = () => `${pick(FIRST)} ${pick(LAST)}`;
const emailOf = (n) => n.toLowerCase().replace(/[^a-z]/g, ".") + ri(1, 99) + "@gmail.com";
const phone = () => `+1512${ri(2000000, 9999999)}`;

const REV5 = [
  "Dr. Chen and the whole team are fantastic. Cleaning was thorough and totally painless. Best dental experience I've had in years.",
  "Absolutely love this place. The hygienist was gentle and explained everything. Office is spotless and modern.",
  "Booked a same-day appointment for a chipped tooth and they fixed it perfectly. Friendly staff, zero wait.",
  "Been coming here for 3 years. Always on time, always professional. Highly recommend for the whole family.",
  "The new patient experience was seamless. They walked me through my insurance and there were no surprise bills.",
  "Genuinely the friendliest front desk team. My kids actually look forward to the dentist now!",
];
const REV4 = [
  "Great care and very knowledgeable staff. Took a little longer than expected but the result was worth it.",
  "Good experience overall. Clean office and friendly dentist. Parking can be tricky at peak hours.",
  "Solid checkup and cleaning. The reminder texts are super helpful. Would recommend.",
];
const REV3 = [
  "Decent visit but I waited about 25 minutes past my appointment time. The actual treatment was fine.",
  "The dental work was good but the billing took a few calls to sort out. Staff were apologetic.",
];
const REV12 = [
  "Waited almost 40 minutes and felt rushed once I was finally seen. Expected more for the price.",
  "Was quoted one price and charged another. Disappointed with the billing experience.",
];
const REPLIES = [
  "Thank you so much for the kind words! It was a pleasure seeing you — see you at your next cleaning.",
  "We really appreciate you taking the time to share this. Glad we could help, and thanks for trusting us with your smile!",
  "Thanks for the feedback! We're sorry about the wait and are actively working on our scheduling. We'd love to make the next visit smoother.",
  "We appreciate your patience and apologize for the billing mix-up. Please reach out and we'll make it right.",
];
const TOPICS = ["wait time","friendly staff","cleanliness","pricing","insurance","painless","scheduling","kids"];

async function wipe(orgId) {
  const ops = [
    "reviewDispute","reviewReply","review","reviewRequest","reviewRequestTemplate","outreachTemplate",
    "surveyCoupon","surveyResponse","surveyResponseToken","surveyCampaign",
    "contact","deviceScan","reviewPlatformChoice","device","hardwareOrder",
    "inboxThread","socialPost","socialComment","phoneCallTurn","phoneCall","phoneBooking","phoneCampaign",
    "phoneNumber","phoneAssistant","phoneVoice","aiDocument","aiTrainingProfile","notification","connection",
    "subscription","faq","commentBlacklist","chatAutomationRule","liveChatVisitor","widgetKey","establishment",
  ];
  for (const m of ops) {
    try { await prisma[m].deleteMany({ where: { organizationId: orgId } }); } catch (e) { /* some lack organizationId/order */ }
  }
}

async function main() {
  // ---- org + owner + team ----
  let org = await prisma.organization.findUnique({ where: { slug: SLUG } });
  if (org) { await wipe(org.id); }
  let owner = await prisma.user.findUnique({ where: { email: "sarah.chen@summitdental.demo" } });
  if (!owner) owner = await prisma.user.create({ data: { email: "sarah.chen@summitdental.demo", name: "Dr. Sarah Chen", emailVerified: new Date() } });
  if (!org) {
    org = await prisma.organization.create({ data: { name: "Summit Dental Studio", slug: SLUG, plan: "pro" } });
    await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "owner" } });
  } else {
    await prisma.organization.update({ where: { id: org.id }, data: { plan: "pro" } });
  }
  await prisma.organization.update({ where: { id: org.id }, data: {
    ownerName: "Dr. Sarah Chen", ownerEmail: "sarah.chen@summitdental.demo", phone: "+15125550142",
    country: "US", websiteUrl: "https://summitdental.example.com",
    businessDescription: "Modern family & cosmetic dentistry in Austin, TX. Gentle care, transparent pricing, same-day emergencies.",
    onboardingStep: 5,
  }});
  // extra team members
  for (const [em, nm, role] of [["maya.ortiz@summitdental.demo","Maya Ortiz","manager"],["front.desk@summitdental.demo","Jordan Reyes","member"]]) {
    let u = await prisma.user.findUnique({ where: { email: em } });
    if (!u) u = await prisma.user.create({ data: { email: em, name: nm, emailVerified: new Date() } });
    try { await prisma.membership.create({ data: { organizationId: org.id, userId: u.id, role } }); } catch {}
  }
  const oid = org.id;

  // ---- subscription ----
  await prisma.subscription.create({ data: { organizationId: oid, plan: "pro_monthly", status: "active", currentPeriodEnd: new Date(Date.now() + 22 * 864e5), stripeSubscriptionId: "sub_demo_" + randomBytes(6).toString("hex") } });

  // ---- establishments ----
  const hours = { mon: "8:00-17:00", tue: "8:00-17:00", wed: "8:00-17:00", thu: "8:00-19:00", fri: "8:00-15:00", sat: "Closed", sun: "Closed" };
  const est = await prisma.establishment.create({ data: {
    organizationId: oid, kind: "business", name: "Summit Dental Studio — Downtown", category: "Dentist",
    address: { line1: "412 Congress Ave", city: "Austin", state: "TX", postalCode: "78701", country: "US" },
    timezone: "America/Chicago", phone: "+15125550142", websiteUrl: "https://summitdental.example.com",
    googlePlaceId: "ChIJDemoSummitDental001", businessHours: hours,
    brandVoice: { tone: "warm, professional, concise", emoji: false },
  }});
  const est2 = await prisma.establishment.create({ data: {
    organizationId: oid, kind: "business", name: "Summit Dental Studio — Westside", category: "Dentist",
    address: { line1: "9001 Bee Cave Rd", city: "Austin", state: "TX", postalCode: "78733", country: "US" },
    timezone: "America/Chicago", phone: "+15125550188", googlePlaceId: "ChIJDemoSummitDental002", businessHours: hours,
  }});

  // ---- reviews + replies ----
  const reviews = [];
  let ri_ = 0;
  const mk = async (rating, body, est_, replyKind) => {
    ri_++;
    const r = await prisma.review.create({ data: {
      organizationId: oid, establishmentId: est_.id, source: pick(["google","google","google","facebook","yelp"]),
      externalId: `ext-${est_.id.slice(0,6)}-${ri_}`, reviewerName: name(), rating, body,
      language: "en", postedAt: daysAgo(ri(0, 120), 23),
      sentiment: rating >= 4 ? 0.7 + Math.random() * 0.3 : rating === 3 ? 0.4 : 0.1 + Math.random() * 0.2,
      topics: [pick(TOPICS), pick(TOPICS)], topicsExtractedAt: new Date(), sentimentExtractedAt: new Date(),
    }});
    reviews.push(r);
    if (replyKind === "published") {
      await prisma.reviewReply.create({ data: { reviewId: r.id, organizationId: oid, body: pick(REPLIES), status: "published", generatedBy: "ai", publishedAt: daysAgo(ri(0, 100)) } });
    } else if (replyKind === "pending") {
      await prisma.reviewReply.create({ data: { reviewId: r.id, organizationId: oid, body: pick(REPLIES), status: "pending_review", generatedBy: "ai" } });
    }
    return r;
  };
  for (let i = 0; i < 18; i++) await mk(5, pick(REV5), est, i % 3 === 0 ? "pending" : "published");
  for (let i = 0; i < 9; i++) await mk(4, pick(REV4), est, i % 2 === 0 ? "published" : null);
  for (let i = 0; i < 4; i++) await mk(3, pick(REV3), est, i % 2 === 0 ? "pending" : null);
  for (let i = 0; i < 3; i++) await mk(ri(1, 2), pick(REV12), est, null);
  for (let i = 0; i < 6; i++) await mk(pick([5,5,4,3]), pick([...REV5, ...REV4]), est2, i % 2 ? "published" : null);

  // ---- templates + review requests ----
  await prisma.reviewRequestTemplate.create({ data: { organizationId: oid, establishmentId: est.id, name: "Post-Visit Follow-Up", channel: "both", subject: "How was your visit, {{first_name}}?", body: "Hi {{first_name}}, thanks for visiting {{business_name}}! Mind sharing a quick review? {{review_link}}", isDefault: true } });
  await prisma.outreachTemplate.create({ data: { organizationId: oid, establishmentId: est.id, channel: "sms", name: "Quick SMS Ask", body: "Hi {{customerName}}! Thanks for choosing {{businessName}}. We'd love a quick review: {{reviewLink}}", isDefault: true, aiTone: "friendly" } });
  await prisma.outreachTemplate.create({ data: { organizationId: oid, establishmentId: est.id, channel: "email", name: "Warm Email Ask", subject: "A quick favor", body: "Hi {{customerName}}, it was great seeing you at {{businessName}}. Would you share your experience? {{reviewLink}}", isAiGenerated: true, aiTone: "warm" } });
  // valid statuses: queued | sent | delivered | failed | unsubscribed | bounced | converted
  // funnel (opened/clicked) lives in timestamps, not status
  for (let i = 0; i < 44; i++) {
    const ch = pick(["email", "sms"]);
    const nm = name();
    const stage = pick(["delivered","delivered","delivered","converted","converted","sent","queued","failed","bounced"]);
    const base = daysAgo(ri(0, 60));
    const data = { organizationId: oid, establishmentId: est.id, channel: ch, recipient: ch === "sms" ? phone() : emailOf(nm), recipientName: nm, scheduledFor: base, status: stage, triggerSource: pick(["manual","manual","shopify","calendar"]) };
    if (stage !== "queued") data.sentAt = base;
    if (["delivered", "converted"].includes(stage)) {
      data.deliveredAt = base;
      if (Math.random() < 0.7) data.openedAt = new Date(base.getTime() + 36e5);
      if (data.openedAt && Math.random() < 0.6) data.clickedAt = new Date(base.getTime() + 72e5);
    }
    if (stage === "converted") {
      data.openedAt = data.openedAt || new Date(base.getTime() + 36e5);
      data.clickedAt = data.clickedAt || new Date(base.getTime() + 72e5);
      data.convertedAt = new Date(base.getTime() + 9e6);
    }
    if (stage === "failed") data.error = "Carrier rejected (landline)";
    if (stage === "bounced") data.error = "Mailbox not found";
    await prisma.reviewRequest.create({ data });
  }

  // ---- contacts ----
  for (let i = 0; i < 42; i++) {
    const nm = name();
    await prisma.contact.create({ data: { organizationId: oid, establishmentId: est.id, source: pick(["manual","csv","shopify","google_review","live_chat","sms"]), name: nm, email: emailOf(nm), phone: phone(), tags: Math.random() < 0.25 ? ["VIP"] : (Math.random() < 0.3 ? ["new patient"] : []), lastContactedAt: daysAgo(ri(0, 90)), createdAt: daysAgo(ri(0, 200)) } });
  }

  // ---- survey campaign + responses ----
  const camp = await prisma.surveyCampaign.create({ data: { organizationId: oid, establishmentId: est.id, name: "Patient Satisfaction (NPS)", type: "nps", channel: "email", status: "active", triggerEvent: "after_visit", delayMinutes: 1440 } });
  const qNps = await prisma.surveyQuestion.create({ data: { campaignId: camp.id, position: 0, type: "nps", prompt: "How likely are you to recommend Summit Dental to a friend?" } });
  const qRate = await prisma.surveyQuestion.create({ data: { campaignId: camp.id, position: 1, type: "rating", prompt: "How would you rate your visit?" } });
  const qText = await prisma.surveyQuestion.create({ data: { campaignId: camp.id, position: 2, type: "text", prompt: "Anything we could do better?", required: false } });
  const txts = ["Everything was perfect!","Maybe shorter wait times.","Loved the staff.","More evening slots please.","Great experience overall."];
  for (let i = 0; i < 26; i++) {
    const score = pick([10,10,9,9,9,8,8,7,6,10,9,5,3,10,8]);
    // smart_route_to allowed: review_request | internal_alert | none
    const route = score >= 9 ? "review_request" : score >= 7 ? "none" : "internal_alert";
    const resp = await prisma.surveyResponse.create({ data: { campaignId: camp.id, organizationId: oid, recipient: emailOf(name()), ratingSummary: (score / 2).toFixed(2), smartRouteTo: route, completedAt: daysAgo(ri(0, 70)) } });
    await prisma.surveyAnswer.create({ data: { responseId: resp.id, questionId: qNps.id, value: score } });
    await prisma.surveyAnswer.create({ data: { responseId: resp.id, questionId: qRate.id, value: Math.min(5, Math.round(score / 2)) } });
    if (Math.random() < 0.5) await prisma.surveyAnswer.create({ data: { responseId: resp.id, questionId: qText.id, value: pick(txts) } });
  }

  // ---- hardware products + order + devices + scans ----
  const prods = {};
  for (const [sku, nm, cents, kind] of [["RB-CARD","Repulabs Card",2900,"nfc"],["RB-PLAQUE","Repulabs Plaque",4900,"qr"],["RB-STAND","Repulabs Stand",6900,"qr"]]) {
    prods[kind] = await prisma.hardwareProduct.upsert({ where: { sku }, update: {}, create: { sku, name: nm, priceCents: cents, hasNfc: kind === "nfc" } }).catch(async () => prisma.hardwareProduct.findUnique({ where: { sku } }));
  }
  const order = await prisma.hardwareOrder.create({ data: { organizationId: oid, status: "delivered", shippingAddress: { line1: "412 Congress Ave", city: "Austin", state: "TX", postalCode: "78701", country: "US" }, totalCents: 11700, deliveredAt: daysAgo(40), items: { create: [ { productId: prods.qr.id, establishmentId: est.id, quantity: 1, unitPriceCents: 4900 }, { productId: prods.nfc.id, establishmentId: est.id, quantity: 2, unitPriceCents: 2900 } ] } } });
  const devs = [];
  for (const [sku, kind, label] of [["RB-PLAQUE","qr","Front Desk Plaque"],["RB-CARD","nfc","Checkout Card"],["RB-STAND","qr","Waiting Room Stand"]]) {
    const slug = randomBytes(5).toString("hex");
    const d = await prisma.device.create({ data: { organizationId: oid, establishmentId: est.id, orderId: order.id, productSku: sku, productKind: kind, serial: "SN-" + randomBytes(4).toString("hex").toUpperCase(), shortSlug: slug, slugSignature: h(slug).slice(0, 32), activationCodeHash: h("code" + slug), status: "active", scanCount: ri(20, 120), lastScanAt: daysAgo(ri(0, 5)), activatedAt: daysAgo(45), redirectUrl: "https://g.page/r/summit-dental/review" } });
    devs.push(d);
    const n = ri(25, 70);
    for (let i = 0; i < n; i++) {
      try { await prisma.deviceScan.create({ data: { deviceId: d.id, organizationId: oid, scanId: randomBytes(6).toString("hex"), scannedAt: daysAgo(ri(0, 60), 23), userAgent: pick(["iPhone","Android","iPad"]), country: "US" } }); } catch {}
    }
  }

  // ---- inbox threads + messages ----
  const channels = ["facebook_msg","instagram_dm","gbp_qa","webchat","sms","email"];
  const msgs = ["Hi! Do you take Delta Dental insurance?","Are you open this Saturday?","Can I reschedule my cleaning to next week?","Do you offer teeth whitening?","What's the cost for a new patient exam?","My filling feels off, can I come in?"];
  const replies = ["Yes we do! We're in-network with Delta Dental PPO. Want me to check your appointment?","We're open Mon–Fri. Thursdays we're open until 7pm for your convenience!","Of course — I have Tuesday 10am or Wednesday 2pm open. Which works?","Yes! We offer in-office and take-home whitening. Happy to book a consult."];
  for (let i = 0; i < 11; i++) {
    const ch = pick(channels);
    const who = name();
    const last = pick(msgs);
    const t = await prisma.inboxThread.create({ data: { organizationId: oid, establishmentId: est.id, channel: ch, externalThreadId: "thr-" + randomBytes(4).toString("hex"), subject: ch === "email" ? "Question about appointment" : null, participant: { name: who, handle: "@" + who.split(" ")[0].toLowerCase() }, status: pick(["open","open","open","closed"]), lastMessageAt: daysAgo(ri(0, 14), 23), lastMessageBody: last, lastMessageDirection: "inbound", unreadCount: pick([0, 0, 1, 2]) } });
    await prisma.inboxMessage.create({ data: { threadId: t.id, organizationId: oid, direction: "inbound", body: last, sentAt: daysAgo(ri(2, 14)), aiSuggested: pick(replies) } });
    if (Math.random() < 0.6) await prisma.inboxMessage.create({ data: { threadId: t.id, organizationId: oid, direction: "outbound", body: pick(replies), sentAt: daysAgo(ri(0, 2)) } });
  }

  // ---- social posts + comments ----
  const caps = ["Brighten your smile this spring ☀️ Book your cleaning today!","Meet Dr. Chen — 15 years of gentle, expert care 🦷","Nervous about the dentist? We've got you. Sedation options available.","New patient special: exam + X-rays + cleaning. Link in bio!","Thank you for 500+ five-star reviews, Austin! 💙"];
  for (let i = 0; i < 8; i++) {
    const status = pick(["posted","posted","posted","scheduled","draft"]);
    await prisma.socialPost.create({ data: { organizationId: oid, establishmentId: est.id, platforms: pick([["facebook","instagram"],["instagram"],["facebook"],["facebook","instagram","linkedin"]]), caption: pick(caps), hashtags: ["dentist","austintx","smile"], status, postedAt: status === "posted" ? daysAgo(ri(1, 40)) : null, scheduledFor: status === "scheduled" ? daysAgo(-ri(1, 10)) : null, isAiCaption: Math.random() < 0.5 } });
  }
  for (let i = 0; i < 12; i++) {
    const who = name();
    await prisma.socialComment.create({ data: { organizationId: oid, establishmentId: est.id, platform: pick(["facebook","instagram"]), externalPostId: "post-" + ri(1, 8), externalId: "cm-" + randomBytes(5).toString("hex"), authorName: who, body: pick(["Love this place!","Do you take walk-ins?","Best dentist in Austin 🙌","How much for whitening?","Booked thanks to this post!"]), status: pick(["needs_reply","needs_reply","replied","hidden"]), aiSuggested: "Thanks so much! DM us and we'll get you booked 😊", postedAt: daysAgo(ri(0, 20)) } });
  }

  // ---- phone (number, assistant, calls, turns, bookings, voice) ----
  await prisma.phoneNumber.create({ data: { organizationId: oid, establishmentId: est.id, phoneE164: "+15125550199", twilioSid: "PN" + randomBytes(8).toString("hex"), friendlyName: "Main Line (AI)", forwardToE164: "+15125550142", capabilities: { voice: true, sms: true }, status: "active" } });
  await prisma.phoneAssistant.create({ data: { organizationId: oid, greeting: "Thanks for calling Summit Dental Studio! How can I help you today?", voice: "alice", enabled: true, customInstructions: "Be warm and concise. Offer to book new-patient exams. Mention Thursday evening hours.", handoffNumber: "+15125550142", voiceProvider: "elevenlabs", bookingProvider: "cal_com" } });
  await prisma.phoneVoice.create({ data: { organizationId: oid, provider: "elevenlabs", externalVoiceId: "voice_demo_sarah", displayName: "Front Desk (Friendly Female)", description: "Warm, professional reception voice", status: "active" } });
  const intents = ["book_appointment","hours_inquiry","insurance_question","reschedule","pricing","emergency"];
  for (let i = 0; i < 12; i++) {
    const dur = ri(45, 360);
    const started = daysAgo(ri(0, 21), 23);
    const ln = name();
    const call = await prisma.phoneCall.create({ data: { organizationId: oid, twilioCallSid: "CA" + randomBytes(8).toString("hex"), fromE164: phone(), toE164: "+15125550199", direction: "inbound", status: "completed", startedAt: started, endedAt: new Date(started.getTime() + dur * 1000), durationSeconds: dur, aiTotalTurns: ri(3, 8), leadName: ln, intent: pick(intents), summary: pick(["Caller booked a new-patient exam for next Tuesday.","Answered insurance question (Delta PPO in-network).","Caller rescheduled cleaning to Thursday evening.","Provided pricing for whitening; sent follow-up text.","Handled after-hours emergency; forwarded to on-call."]), callerState: "TX" } });
    for (let t = 0; t < ri(3, 6); t++) {
      await prisma.phoneCallTurn.create({ data: { callId: call.id, organizationId: oid, turnNumber: t, role: t % 2 === 0 ? "caller" : "assistant", text: t % 2 === 0 ? pick(["Hi, do you have any openings this week?","What does a cleaning cost?","Are you in network with my insurance?"]) : pick(["I can help with that! We have Tuesday at 10am or Thursday at 6pm.","A standard cleaning is $120 without insurance.","Yes, we're in-network with Delta Dental PPO."]), confidence: 0.8 + Math.random() * 0.2 } });
    }
    if (Math.random() < 0.4) await prisma.phoneBooking.create({ data: { organizationId: oid, callId: call.id, provider: "cal_com", attendeeName: ln, attendeeEmail: emailOf(ln), attendeePhone: phone(), startAt: daysAgo(-ri(1, 14)), status: "confirmed", notes: "New patient exam + cleaning" } });
  }

  // ---- AI KB docs + training profile ----
  for (const [title, st, content] of [["Services & Pricing","manual","Cleanings $120, exams $90, whitening $399, Invisalign from $3,500. New patient special $149."],["Insurance & Payment","manual","In-network: Delta Dental PPO, Cigna, MetLife. CareCredit financing available. We file claims for you."],["Hours & Location","gbp_listing","412 Congress Ave, Austin TX. Mon–Wed 8–5, Thu 8–7, Fri 8–3. Free parking in rear lot."],["Website FAQ","url","Scraped from summitdental.example.com — covers emergencies, sedation, and new-patient process."]]) {
    await prisma.aiDocument.create({ data: { organizationId: oid, establishmentId: est.id, title, sourceType: st, sourceUri: st === "url" ? "https://summitdental.example.com/faq" : null, content, contentHash: h(content), status: "indexed", lastIndexedAt: daysAgo(ri(1, 20)) } });
  }
  await prisma.aiTrainingProfile.create({ data: { organizationId: oid, businessOverview: "Summit Dental Studio — modern family & cosmetic dentistry in Austin, TX.", servicesProducts: "Cleanings, exams, whitening, Invisalign, emergency care, sedation dentistry.", operatingHours: hours, pricingDetails: "Cleaning $120 · Exam $90 · Whitening $399 · New patient special $149.", aiPersonalityStyle: "friendly", confidentTopics: ["hours","pricing","insurance","booking"], unsureTopics: ["complex oral surgery quotes"], satisfactionAvg: 4.6 } });

  // ---- disputes (on low-rating reviews) ----
  const lowReviews = reviews.filter((r) => r.rating <= 2).slice(0, 3);
  const dStatus = ["submitted","submitted_to_google","rejected"];
  for (let i = 0; i < lowReviews.length; i++) {
    await prisma.reviewDispute.create({ data: { reviewId: lowReviews[i].id, organizationId: oid, reason: pick(["fake","offensive","conflict_of_interest"]), details: "This reviewer has no record of being a patient at our practice.", status: dStatus[i] || "submitted", submittedBy: owner.id, submittedToProviderAt: i > 0 ? daysAgo(10) : null, resolvedAt: dStatus[i] === "rejected" ? daysAgo(3) : null } });
  }

  // ---- notifications, connections, faqs, blacklist, chat rules, visitors, widget ----
  for (const [type, title, body] of [["new_review","New 5★ review","James S. left a 5-star review on Google"],["reply_needed","3 reviews need a reply","You have 3 reviews awaiting a response"],["dispute_update","Dispute update","Google is reviewing your dispute"],["digest_ready","Daily digest ready","Your Tuesday summary is ready to view"],["new_comment","New Instagram comment","Someone asked about whitening pricing"]]) {
    await prisma.notification.create({ data: { organizationId: oid, type, title, body, readAt: Math.random() < 0.4 ? new Date() : null, createdAt: daysAgo(ri(0, 6)) } });
  }
  for (const [provider, label] of [["google_business","Summit Dental — Google"],["meta","Summit Dental — Facebook/Instagram"],["shopify","Summit Store"]]) {
    try { await prisma.connection.create({ data: { organizationId: oid, establishmentId: est.id, provider, accountLabel: label, externalId: "acct-" + randomBytes(4).toString("hex"), accessTokenCt: bytes(), iv: bytes(), encryptionCtx: { aad: provider }, status: "active", scopes: ["read","write"], lastSyncedAt: daysAgo(0, 5) } }); } catch (e) { console.warn("connection", provider, e.message); }
  }
  let fp = 0;
  for (const [t, d] of [["Do you take my insurance?","We're in-network with Delta Dental PPO, Cigna, and MetLife, and we file claims for you."],["How much is a cleaning?","A standard cleaning is $120 without insurance; new patients get a $149 exam+cleaning special."],["Do you handle dental emergencies?","Yes — call us and we reserve same-day emergency slots daily."],["Where do I park?","Free parking is available in the rear lot off 4th Street."]]) {
    await prisma.faq.create({ data: { organizationId: oid, establishmentId: est.id, title: t, description: d, position: fp++ } });
  }
  for (const kw of ["spam","scam","competitor.com"]) { try { await prisma.commentBlacklist.create({ data: { organizationId: oid, keyword: kw, hiddenCount: ri(0, 5) } }); } catch {} }
  for (const [k, nm, msg, trig] of [["greeting","Welcome greeting","Hi! 👋 How can we help you smile today?","on_open"],["ask_contact","Ask for contact","Can I grab your name and number so we can follow up?","after_seconds"]]) {
    try { await prisma.chatAutomationRule.create({ data: { organizationId: oid, ruleKey: k, name: nm, message: msg, trigger: trig, isActive: true, delaySeconds: trig === "after_seconds" ? 20 : 0 } }); } catch {}
  }
  for (let i = 0; i < 6; i++) { const nm = name(); try { await prisma.liveChatVisitor.create({ data: { organizationId: oid, visitorId: "vis-" + randomBytes(5).toString("hex"), displayName: nm, email: emailOf(nm), city: "Austin", region: "TX", country: "US", lastActivityAt: daysAgo(ri(0, 4)), tags: Math.random() < 0.3 ? ["lead"] : [] } }); } catch {} }
  try { await prisma.widgetKey.create({ data: { organizationId: oid, establishmentId: est.id, publicKey: "wk_" + randomBytes(8).toString("hex"), hmacSecret: randomBytes(16).toString("hex"), originAllowlist: ["https://summitdental.example.com"] } }); } catch {}

  writeFileSync(".pdf-build/_demo_org.txt", oid);
  // counts
  const c = {
    reviews: await prisma.review.count({ where: { organizationId: oid } }),
    replies: await prisma.reviewReply.count({ where: { organizationId: oid } }),
    requests: await prisma.reviewRequest.count({ where: { organizationId: oid } }),
    contacts: await prisma.contact.count({ where: { organizationId: oid } }),
    surveyResponses: await prisma.surveyResponse.count({ where: { organizationId: oid } }),
    devices: await prisma.device.count({ where: { organizationId: oid } }),
    scans: await prisma.deviceScan.count({ where: { organizationId: oid } }),
    inbox: await prisma.inboxThread.count({ where: { organizationId: oid } }),
    social: await prisma.socialPost.count({ where: { organizationId: oid } }),
    calls: await prisma.phoneCall.count({ where: { organizationId: oid } }),
    disputes: await prisma.reviewDispute.count({ where: { organizationId: oid } }),
  };
  console.log("✔ Seeded 'Summit Dental Studio'", oid);
  console.log(JSON.stringify(c, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
