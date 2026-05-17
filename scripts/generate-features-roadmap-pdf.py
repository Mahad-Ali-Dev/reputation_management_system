"""
Generate Repulabs feature roadmap PDF.

Run:  python scripts/generate-features-roadmap-pdf.py
Output: docs/repulabs-feature-roadmap.pdf

The document is original content describing the candidate features for the
Repulabs platform. Each entry follows the same shape: What / Why it matters
/ What it requires / Effort / Impact. The phased rollout summary lives at
the end.
"""

from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    PageBreak,
    Table,
    TableStyle,
    KeepTogether,
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER

OUT = Path(__file__).resolve().parent.parent / "docs" / "repulabs-feature-roadmap.pdf"
OUT.parent.mkdir(parents=True, exist_ok=True)

INK = colors.HexColor("#0B0D0E")
INK2 = colors.HexColor("#1E2225")
MUTE = colors.HexColor("#61697A")
PRI = colors.HexColor("#2563EB")
PRI_BG = colors.HexColor("#ECFDF7")
LINE = colors.HexColor("#ECEEEA")
SURF2 = colors.HexColor("#FAFBF8")

styles = getSampleStyleSheet()

cover_kicker = ParagraphStyle(
    "cover_kicker",
    parent=styles["Normal"],
    fontName="Helvetica-Bold",
    fontSize=10,
    textColor=PRI,
    alignment=TA_CENTER,
    spaceAfter=10,
)
cover_title = ParagraphStyle(
    "cover_title",
    parent=styles["Heading1"],
    fontName="Helvetica-Bold",
    fontSize=34,
    leading=38,
    textColor=INK,
    alignment=TA_CENTER,
    spaceAfter=14,
)
cover_sub = ParagraphStyle(
    "cover_sub",
    parent=styles["Normal"],
    fontName="Helvetica",
    fontSize=13,
    leading=18,
    textColor=MUTE,
    alignment=TA_CENTER,
    spaceAfter=8,
)
cover_meta = ParagraphStyle(
    "cover_meta",
    parent=styles["Normal"],
    fontName="Helvetica",
    fontSize=10,
    textColor=MUTE,
    alignment=TA_CENTER,
)
h2 = ParagraphStyle(
    "h2",
    parent=styles["Heading2"],
    fontName="Helvetica-Bold",
    fontSize=20,
    leading=24,
    textColor=INK,
    spaceBefore=6,
    spaceAfter=6,
)
h3 = ParagraphStyle(
    "h3",
    parent=styles["Heading3"],
    fontName="Helvetica-Bold",
    fontSize=14,
    leading=18,
    textColor=INK,
    spaceBefore=6,
    spaceAfter=4,
)
body = ParagraphStyle(
    "body",
    parent=styles["BodyText"],
    fontName="Helvetica",
    fontSize=10.5,
    leading=15,
    textColor=INK2,
    spaceAfter=6,
)
small = ParagraphStyle(
    "small",
    parent=body,
    fontSize=9.5,
    leading=13,
    textColor=MUTE,
)
kicker = ParagraphStyle(
    "kicker",
    parent=styles["Normal"],
    fontName="Helvetica-Bold",
    fontSize=9,
    leading=11,
    textColor=PRI,
    spaceAfter=2,
)


def label_box(text: str, bg=PRI_BG, fg=PRI) -> Table:
    """Pill-shaped label used for feature numbers."""
    p = Paragraph(f"<font name='Helvetica-Bold' size='9'>{text}</font>", body)
    t = Table([[p]], colWidths=[42 * mm])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), bg),
                ("TEXTCOLOR", (0, 0), (-1, -1), fg),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("ROUNDEDCORNERS", [4, 4, 4, 4]),
            ]
        )
    )
    return t


def stat_row(items: list[tuple[str, str]]) -> Table:
    """4-up stat strip used inside feature pages."""
    cells = []
    for label, value in items:
        cells.append(
            [
                Paragraph(
                    f"<font name='Helvetica-Bold' size='8' color='#61697A'>{label.upper()}</font>",
                    small,
                ),
                Paragraph(
                    f"<font name='Helvetica-Bold' size='13' color='#0B0D0E'>{value}</font>",
                    body,
                ),
            ]
        )
    flat = [list(col) for col in zip(*cells)]
    col_count = len(items)
    col_widths = [(170 / col_count) * mm for _ in range(col_count)]
    t = Table(flat, colWidths=col_widths)
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), SURF2),
                ("BOX", (0, 0), (-1, -1), 0.5, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, LINE),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    return t


FEATURES = [
    {
        "n": "01",
        "title": "NFC Tap Products (Plaques, Cards, Stickers)",
        "kicker": "Hardware product line · Phase 2",
        "why": (
            "QR scanning requires opening a camera, framing the code, and tapping a notification. "
            "NFC is one motion: tap, done. We project a 35–45% lift in scan-to-review conversion "
            "purely from removing camera friction, especially for older customers and rushed lunch crowds. "
            "Same backend, same activation flow — the chip is a delivery mechanism, not a new feature surface."
        ),
        "needs": "NTAG216 chip supplier; NDEF programmer (~$50); minor schema migration (product_kind, nfc_chip_uid).",
        "effort": "5 days build + 2–4 weeks factory pilot.",
        "impact": "New $89 SKU tier above the current $59.99 plaque. Margin: 60–70%.",
    },
    {
        "n": "02",
        "title": "Airbnb Reviews Integration",
        "kicker": "Channel expansion · Phase 3",
        "why": (
            "Hospitality is one of the largest verticals for reputation management and Airbnb is the "
            "single biggest review source for short-term-rental operators. Airbnb has no public API, "
            "so this is a genuine moat — competitors avoid it because parsing emails feels gross. "
            "Done well, it unlocks an entire vertical (300K+ Airbnb hosts in US/AU/UK alone)."
        ),
        "needs": "Resend inbound DNS configuration; email template parser; new external_review_id column.",
        "effort": "5 days.",
        "impact": "Opens hospitality vertical; expected 25% TAM expansion.",
    },
    {
        "n": "03",
        "title": "WiFi NFC Cards",
        "kicker": "Hardware product line · Phase 4",
        "why": (
            "Adjacent SKU with zero backend complexity — customer programs the chip themselves "
            "using a free phone app. Sells as an accessory at the counter, gateway product for "
            "businesses not yet ready for review management. Drives top-of-funnel + brand familiarity."
        ),
        "needs": "NFC card SKU artwork; help page; supplier; 1-page printed insert.",
        "effort": "1 day.",
        "impact": "Low-effort revenue diversifier. $19–29 SKU.",
    },
    {
        "n": "04",
        "title": "AI Phone Receptionist + Calendar Booking",
        "kicker": "Already 80% built · Phase 1 add-on",
        "why": (
            "The full pipeline exists: Twilio webhooks, Claude Haiku dialog brain, ElevenLabs TTS, "
            "Cal.com integration for slot lookup and booking. Missing: branded confirmation emails to "
            "both the caller and the business owner (~6 hours of glue code). Closing this gap turns "
            "an internal feature into a customer-visible differentiator."
        ),
        "needs": "Resend transactional templates; PhoneBooking.notifiedAt column; per-org sender domain (already plumbed for outreach).",
        "effort": "6 hours.",
        "impact": "Activates an existing Pro tier feature; reduces support load on \"did we get the booking?\" questions.",
    },
    {
        "n": "05",
        "title": "AI Reputation Forecaster",
        "kicker": "Predictive analytics · Phase 6",
        "why": (
            "Every competitor shows past metrics. None show the future one. Predicting the next 90 "
            "days of star-rating trajectory with confidence bands and lever toggles (\"reply to all "
            "pending in 48h → +0.06\") turns reputation from a lagging indicator into a leading one. "
            "Massive retention moat — operators won't switch off the platform predicting their future."
        ),
        "needs": "ARIMA + Bayesian credible-interval model running nightly; new reputation_forecasts table.",
        "effort": "6 days build, 2 weeks of customer data before predictions stabilize.",
        "impact": "Headline marketing feature; reduces churn.",
    },
    {
        "n": "06",
        "title": "Phone-Call Sentiment Early-Warning",
        "kicker": "Real-time intervention · Phase 6",
        "why": (
            "Industry standard is \"respond within 24 hours of a 1-star review.\" Our standard would "
            "be \"intercept the upset caller before they leave one.\" Sentiment scoring on existing "
            "PhoneCallTurn rows + SMS-the-manager-now + auto-drafted recovery voucher = a measurable "
            "drop in 1-star reviews. Only possible because we own the phone channel; competitors don't."
        ),
        "needs": "Sentiment-classification tool call in brain.ts; new phone_call_escalations table; Twilio live-listen conference mode.",
        "effort": "5 days.",
        "impact": "Customer-recovery win-rate improvement; testimonial-grade feature.",
    },
    {
        "n": "07",
        "title": "Review-to-Marketing Asset Pipeline",
        "kicker": "Closed-loop value · Phase 5",
        "why": (
            "Competitors stop at \"got the review.\" We'd convert each 5-star review into six marketing "
            "assets in 30 seconds: Instagram square, LinkedIn carousel slide, embeddable website "
            "testimonial widget, Google Ads RSA variants, 1-page case study PDF, and an email signature "
            "trust badge. Closes the loop from review → asset → distribution → more customers."
        ),
        "needs": "next/og image rendering; Claude generation prompts; reuse of existing Meta/LinkedIn OAuth.",
        "effort": "7 days.",
        "impact": "Sellable as standalone Pro feature; visible ROI per review.",
    },
    {
        "n": "08",
        "title": "AI Reputation Coach — Monday Standup",
        "kicker": "Retention + engagement · Phase 5",
        "why": (
            "Replaces a fractional reputation manager ($800–2,000/month elsewhere). Weekly Monday "
            "voice memo + SMS + email synthesizing last week's data and prescribing this week's "
            "action. Built on top of the forecaster + topic engine + customer DB. Drives weekly "
            "platform engagement, which is the single biggest predictor of retention in SaaS."
        ),
        "needs": "Weekly cron; reputation_briefs table; ElevenLabs TTS (already integrated); SMS + email delivery (already integrated).",
        "effort": "5 days.",
        "impact": "Major retention lever; weekly touch keeps platform top-of-mind.",
    },
    {
        "n": "09",
        "title": "Competitor Pulse + AI Mystery Shopper",
        "kicker": "Premium add-on · Phase 7",
        "why": (
            "Every operator wants to know what the competing business across the street is doing "
            "better. Today they ask their friends; we'd answer with data. Nightly public-page "
            "scraping for review velocity + AI agent monthly calls competitors as a customer and "
            "scores them. Premium tier upsell driver — $59.99 → $99/mo."
        ),
        "needs": "Bright Data residential proxy (~$50/mo per portfolio); outbound calling reuses existing infrastructure; HTML-resilient parser.",
        "effort": "10 days.",
        "impact": "Highest revenue impact per customer; clear premium-tier driver.",
    },
    {
        "n": "10",
        "title": "Multi-Channel Inbox AI Triage",
        "kicker": "Workflow consolidation · Phase 6",
        "why": (
            "Reviews + Facebook comments + Instagram DMs + SMS replies + voicemails + emails arrive "
            "in six different inboxes. We'd unify them with AI-categorized urgency + sentiment + "
            "topic, routed to the right team member. Owners stop tab-juggling; response time drops "
            "from hours to minutes."
        ),
        "needs": "Provider webhook handlers (Meta, Instagram); unified message table; AI triage policy engine.",
        "effort": "8 days.",
        "impact": "Daily-use platform feature; sticky workflow.",
    },
    {
        "n": "11",
        "title": "Photo Review Booster",
        "kicker": "Targeted outreach · Phase 6",
        "why": (
            "Photo-attached Google reviews carry 2× the SEO weight of text-only ones. Customers most "
            "likely to attach photos are repeat high-spenders. We'd identify them automatically from "
            "review history + order data (when CRM-connected) and craft a tailored ask. Higher quality "
            "review yield with less outreach volume."
        ),
        "needs": "Reviewer-profile enrichment; CRM-data correlation; specialized request template.",
        "effort": "4 days.",
        "impact": "Higher-quality review yield; better Maps ranking signal.",
    },
    {
        "n": "12",
        "title": "Voice Survey via Phone",
        "kicker": "After-service NPS · Phase 7",
        "why": (
            "AI calls a customer 24–48 hours after a service for a 60-second voice survey. Tone "
            "analysis catches genuine sentiment that text NPS misses (one customer types \"great!\" "
            "while another sighs and says \"yeah it was fine\" — the difference is everything). "
            "Premium-tier feature; charged per completed call."
        ),
        "needs": "Outbound calling already exists; sentiment + transcription pass; survey-script engine; consent recording.",
        "effort": "6 days.",
        "impact": "Premium add-on; new revenue stream.",
    },
]

PHASES = [
    ("1 — this week", "Restore-from-trash + /signup + smart /not-activated + booking-confirmation emails", "~12h"),
    ("2 — next 2 weeks", "NFC product line (schema, factory workflow, admin UI)", "~5 days"),
    ("3 — next 4 weeks", "Airbnb via Resend inbound email parsing", "~5 days"),
    ("4 — opportunistic", "WiFi NFC SKU (product + insert + help page)", "~1 day"),
    ("5 — month 2", "Reputation Coach + Review-to-Marketing pipeline", "~12 days"),
    ("6 — month 3", "Phone Sentiment + Reputation Forecaster + Multi-channel Inbox + Photo Booster", "~25 days"),
    ("7 — month 4 (premium)", "Competitor Pulse + Mystery Shopper + Voice Survey", "~16 days"),
]


def feature_block(f: dict) -> list:
    flow = []
    pill = Table([[Paragraph(f"<b>{f['n']}</b>", body)]], colWidths=[12 * mm])
    pill.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), INK),
                ("TEXTCOLOR", (0, 0), (-1, -1), colors.white),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    title_tbl = Table(
        [[pill, Paragraph(f"<b>{f['title']}</b>", h2)]],
        colWidths=[14 * mm, 156 * mm],
    )
    title_tbl.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (1, 0), (1, 0), 8),
            ]
        )
    )
    flow.append(title_tbl)
    flow.append(Paragraph(f"<i>{f['kicker']}</i>", small))
    flow.append(Spacer(1, 6 * mm))
    flow.append(Paragraph("<b>Why it matters.</b>", h3))
    flow.append(Paragraph(f["why"], body))
    flow.append(Paragraph("<b>What it requires.</b>", h3))
    flow.append(Paragraph(f["needs"], body))

    flow.append(Spacer(1, 4 * mm))
    flow.append(stat_row([("Effort", f["effort"]), ("Impact", f["impact"])]))
    flow.append(Spacer(1, 8 * mm))
    return flow


def build_pdf() -> None:
    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=20 * mm,
        bottomMargin=18 * mm,
        title="Repulabs Feature Roadmap",
        author="Repulabs",
    )
    story: list = []

    # ---- Cover ----
    story.append(Spacer(1, 60 * mm))
    story.append(Paragraph("REPULABS · FEATURE ROADMAP", cover_kicker))
    story.append(Paragraph("12 candidate features for the next 4&nbsp;months.", cover_title))
    story.append(
        Paragraph(
            "An honest, dev-ready inventory of what to build, why each one matters, what it "
            "requires, and where it fits in a phased rollout.",
            cover_sub,
        )
    )
    story.append(Spacer(1, 30 * mm))
    story.append(Paragraph("v1.0 · May 18, 2026", cover_meta))
    story.append(Paragraph("Prepared for the Repulabs founding team", cover_meta))
    story.append(PageBreak())

    # ---- TOC-ish summary ----
    story.append(Paragraph("Contents", h2))
    story.append(Spacer(1, 4 * mm))
    toc_rows = [["#", "Feature", "Phase"]]
    for f in FEATURES:
        toc_rows.append([f["n"], f["title"], f["kicker"].split("·")[-1].strip()])
    toc_rows.append(["", "Phased rollout summary", "Page 14"])
    toc = Table(toc_rows, colWidths=[12 * mm, 110 * mm, 48 * mm])
    toc.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9.5),
                ("TEXTCOLOR", (0, 0), (-1, 0), MUTE),
                ("TEXTCOLOR", (0, 1), (-1, -1), INK2),
                ("BACKGROUND", (0, 0), (-1, 0), SURF2),
                ("LINEBELOW", (0, 0), (-1, 0), 0.5, LINE),
                ("LINEBELOW", (0, 1), (-1, -1), 0.25, LINE),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#FBFCFA")]),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(toc)
    story.append(Spacer(1, 16 * mm))
    story.append(
        Paragraph(
            "<b>How to read this document.</b> Each feature has the same shape — <i>Why it matters</i>, "
            "<i>What it requires</i>, and a stat row showing build effort + business impact. Features are "
            "ordered by rollout phase, not by importance. The phased summary at the end maps features "
            "to weeks of calendar time.",
            body,
        )
    )
    story.append(PageBreak())

    # ---- Features ----
    for f in FEATURES:
        story.extend(feature_block(f))

    # ---- Phased rollout ----
    story.append(PageBreak())
    story.append(Paragraph("Phased rollout summary", h2))
    story.append(
        Paragraph(
            "Each phase below is sized so a single founder + AI-paired engineer can ship it without "
            "blocking on the next phase. Phase 1 is already underway as of this document's date.",
            body,
        )
    )
    story.append(Spacer(1, 6 * mm))
    rows = [["Phase", "Scope", "Effort"]] + [list(r) for r in PHASES]
    t = Table(rows, colWidths=[44 * mm, 100 * mm, 26 * mm])
    t.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9.5),
                ("BACKGROUND", (0, 0), (-1, 0), INK),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("TEXTCOLOR", (0, 1), (-1, -1), INK2),
                ("LINEBELOW", (0, 1), (-1, -1), 0.25, LINE),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#FBFCFA")]),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    story.append(t)

    story.append(Spacer(1, 14 * mm))
    story.append(Paragraph("Footnotes", h3))
    story.append(
        Paragraph(
            "Effort estimates assume one full-time founder paired with AI-accelerated development. "
            "Calendar time may be longer due to factory pilot lead times (NFC, Phase 2) and OAuth "
            "verification waits (Phase 6 if integrating with Google's Business Profile sensitive scope).",
            small,
        )
    )
    story.append(
        Paragraph(
            "Revenue impact numbers are conservative. Several features (Reputation Coach, Competitor "
            "Pulse) double as standalone SKUs and could justify a $40–60/month price tier above the "
            "current $59.99 Pro plan.",
            small,
        )
    )
    story.append(
        Paragraph(
            "The roadmap is a living document. Customer feedback in the first 60 days will reorder "
            "Phase 5 and beyond — Reputation Coach and Review-to-Marketing pipeline both have signals "
            "from early users that they'd unblock close deals, but that's worth validating against "
            "real intent before committing engineering weeks.",
            small,
        )
    )

    doc.build(story)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    build_pdf()
