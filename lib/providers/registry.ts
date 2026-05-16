/**
 * Provider registry — the static catalog of every platform we support.
 *
 * Each entry is the metadata needed to render the Connections UI + drive the
 * OAuth flow. The actual OAuth client_id/client_secret + tokens live in the
 * `provider_apps` table (admin-managed) and `connections` table (per-tenant).
 *
 * To go live on each platform, an admin must:
 *   1. Register an OAuth app with the platform (e.g. Facebook for Developers)
 *   2. Paste client_id + client_secret in /admin/providers
 *   3. Some platforms also require App Review approval (Meta, Twitter, LinkedIn)
 *
 * For platforms WITHOUT OAuth (e.g. Manual CSV Import), `oauthUrl` is null.
 * They use a different connection flow (form submit, file upload, etc.)
 */

export type ProviderCategory =
  | "social"
  | "crm"
  | "ecommerce"
  | "pos"
  | "accounting"
  | "email_marketing"
  | "live_chat"
  | "review_source"
  | "import";

export type ProviderEntry = {
  id: string;
  displayName: string;
  category: ProviderCategory;
  description: string;
  /** Set true when our implementation is complete + tested + ready to go live */
  ready: boolean;
  /** External dependency note explaining why ready=false (App Review, paid tier, etc.) */
  blockerNote?: string;
  /** OAuth scopes we'll request */
  scopes?: string[];
  /** OAuth authorization URL template (with {client_id}, {redirect_uri}, {scopes}, {state}) */
  oauthUrl?: string;
  /** OAuth token exchange URL */
  tokenUrl?: string;
  /** Logo for the connection card */
  logoEmoji?: string;
  /** Documentation URL for the user */
  docsUrl?: string;
};

export const PROVIDERS: Record<string, ProviderEntry> = {
  // ─────────────────────────────────────────────────────────────────────────
  // Review sources
  // ─────────────────────────────────────────────────────────────────────────
  google_business: {
    id: "google_business",
    displayName: "Google Business Profile",
    category: "review_source",
    description: "Sync Google reviews + post AI-drafted replies.",
    ready: true,
    scopes: ["https://www.googleapis.com/auth/business.manage"],
    oauthUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    logoEmoji: "🔍",
    docsUrl: "https://developers.google.com/my-business",
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Social Media
  // ─────────────────────────────────────────────────────────────────────────
  facebook: {
    id: "facebook",
    displayName: "Facebook Pages",
    category: "social",
    description: "Read + reply to Facebook page comments. Post + schedule content.",
    ready: false,
    blockerNote: "Requires Meta App Review (2-6 weeks). We've built the OAuth flow; submit your app at developers.facebook.com.",
    scopes: ["pages_manage_posts", "pages_read_engagement", "pages_manage_engagement"],
    oauthUrl: "https://www.facebook.com/v18.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v18.0/oauth/access_token",
    logoEmoji: "📘",
    docsUrl: "https://developers.facebook.com/docs/facebook-login",
  },
  instagram: {
    id: "instagram",
    displayName: "Instagram Business",
    category: "social",
    description: "Read DMs + comments. Post photos, reels, and stories.",
    ready: false,
    blockerNote: "Requires Meta App Review (same as Facebook). Account must be a Business or Creator profile.",
    scopes: ["instagram_basic", "instagram_manage_comments", "instagram_manage_messages"],
    oauthUrl: "https://api.instagram.com/oauth/authorize",
    tokenUrl: "https://api.instagram.com/oauth/access_token",
    logoEmoji: "📷",
    docsUrl: "https://developers.facebook.com/docs/instagram-api",
  },
  twitter: {
    id: "twitter",
    displayName: "X (Twitter)",
    category: "social",
    description: "Post tweets + threads. Read mentions and DMs.",
    ready: false,
    blockerNote: "Requires X API paid tier ($100+/mo). OAuth flow is built.",
    scopes: ["tweet.read", "tweet.write", "users.read", "dm.read", "dm.write"],
    oauthUrl: "https://twitter.com/i/oauth2/authorize",
    tokenUrl: "https://api.twitter.com/2/oauth2/token",
    logoEmoji: "🐦",
    docsUrl: "https://developer.twitter.com",
  },
  linkedin: {
    id: "linkedin",
    displayName: "LinkedIn Pages",
    category: "social",
    description: "Post to company pages + read engagement.",
    ready: false,
    blockerNote: "Requires LinkedIn Marketing Developer Platform (review takes 2-4 weeks).",
    scopes: ["w_member_social", "r_organization_social", "w_organization_social"],
    oauthUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    logoEmoji: "💼",
    docsUrl: "https://learn.microsoft.com/linkedin",
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CRM
  // ─────────────────────────────────────────────────────────────────────────
  hubspot: {
    id: "hubspot",
    displayName: "HubSpot",
    category: "crm",
    description: "Sync contacts + trigger review requests after deals close.",
    ready: false,
    blockerNote: "Free HubSpot Developer account required. OAuth flow ready.",
    scopes: ["contacts", "crm.objects.contacts.read", "crm.objects.deals.read"],
    oauthUrl: "https://app.hubspot.com/oauth/authorize",
    tokenUrl: "https://api.hubapi.com/oauth/v1/token",
    logoEmoji: "🟠",
    docsUrl: "https://developers.hubspot.com",
  },
  salesforce: {
    id: "salesforce",
    displayName: "Salesforce",
    category: "crm",
    description: "Sync leads + accounts. Trigger flows after Closed-Won.",
    ready: false,
    blockerNote: "Connected App setup in Salesforce admin. OAuth flow ready.",
    scopes: ["api", "refresh_token"],
    oauthUrl: "https://login.salesforce.com/services/oauth2/authorize",
    tokenUrl: "https://login.salesforce.com/services/oauth2/token",
    logoEmoji: "☁️",
    docsUrl: "https://developer.salesforce.com",
  },
  zoho: {
    id: "zoho",
    displayName: "Zoho CRM",
    category: "crm",
    description: "Sync contacts and trigger review requests.",
    ready: false,
    blockerNote: "Self-Client / OAuth credentials from Zoho API Console.",
    scopes: ["ZohoCRM.modules.contacts.READ"],
    oauthUrl: "https://accounts.zoho.com/oauth/v2/auth",
    tokenUrl: "https://accounts.zoho.com/oauth/v2/token",
    logoEmoji: "🔶",
    docsUrl: "https://www.zoho.com/crm/developer/docs",
  },
  pipedrive: {
    id: "pipedrive",
    displayName: "Pipedrive",
    category: "crm",
    description: "Trigger requests after deal stages.",
    ready: false,
    blockerNote: "Marketplace app setup in Pipedrive Developer Hub.",
    scopes: ["deals:read", "contacts:read"],
    oauthUrl: "https://oauth.pipedrive.com/oauth/authorize",
    tokenUrl: "https://oauth.pipedrive.com/oauth/token",
    logoEmoji: "🟢",
    docsUrl: "https://developers.pipedrive.com",
  },
  keap: {
    id: "keap",
    displayName: "Keap (Infusionsoft)",
    category: "crm",
    description: "Sync contacts + invoices.",
    ready: false,
    blockerNote: "Keap Developer account required.",
    oauthUrl: "https://accounts.infusionsoft.com/app/oauth/authorize",
    tokenUrl: "https://api.infusionsoft.com/token",
    logoEmoji: "💚",
    docsUrl: "https://developer.keap.com",
  },
  monday: {
    id: "monday",
    displayName: "Monday.com",
    category: "crm",
    description: "Project board sync for service businesses.",
    ready: false,
    blockerNote: "OAuth app from monday.com Developer Center.",
    oauthUrl: "https://auth.monday.com/oauth2/authorize",
    tokenUrl: "https://auth.monday.com/oauth2/token",
    logoEmoji: "🟣",
    docsUrl: "https://developer.monday.com",
  },
  freshsales: {
    id: "freshsales",
    displayName: "Freshsales",
    category: "crm",
    description: "Sync contacts + deal pipelines.",
    ready: false,
    blockerNote: "API key + OAuth flow available.",
    oauthUrl: "https://oauth.freshworks.com/oauth/v2/authorize",
    tokenUrl: "https://oauth.freshworks.com/oauth/v2/token",
    logoEmoji: "🟢",
    docsUrl: "https://developers.freshworks.com",
  },
  activecampaign: {
    id: "activecampaign",
    displayName: "ActiveCampaign",
    category: "crm",
    description: "Marketing + sales automation triggers.",
    ready: false,
    blockerNote: "API key auth (no OAuth). Paste API key in connection setup.",
    logoEmoji: "🔵",
    docsUrl: "https://developers.activecampaign.com",
  },
  zendesk: {
    id: "zendesk",
    displayName: "Zendesk",
    category: "crm",
    description: "Read support tickets to trigger post-resolution reviews.",
    ready: false,
    blockerNote: "Zendesk OAuth app registration.",
    oauthUrl: "https://{subdomain}.zendesk.com/oauth/authorizations/new",
    tokenUrl: "https://{subdomain}.zendesk.com/oauth/tokens",
    logoEmoji: "🟢",
    docsUrl: "https://developer.zendesk.com",
  },
  ms_dynamics: {
    id: "ms_dynamics",
    displayName: "Microsoft Dynamics 365",
    category: "crm",
    description: "Enterprise CRM sync.",
    ready: false,
    blockerNote: "Azure AD App Registration required.",
    oauthUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    logoEmoji: "🔷",
    docsUrl: "https://learn.microsoft.com/dynamics365",
  },

  // ─────────────────────────────────────────────────────────────────────────
  // E-commerce
  // ─────────────────────────────────────────────────────────────────────────
  shopify: {
    id: "shopify",
    displayName: "Shopify",
    category: "ecommerce",
    description: "Trigger review requests after order fulfillment.",
    ready: false,
    blockerNote: "Shopify Partner account + custom app. OAuth flow ready.",
    scopes: ["read_orders", "read_customers"],
    oauthUrl: "https://{shop}.myshopify.com/admin/oauth/authorize",
    tokenUrl: "https://{shop}.myshopify.com/admin/oauth/access_token",
    logoEmoji: "🛍️",
    docsUrl: "https://shopify.dev",
  },
  woocommerce: {
    id: "woocommerce",
    displayName: "WooCommerce",
    category: "ecommerce",
    description: "WordPress e-commerce integration.",
    ready: false,
    blockerNote: "REST API key + secret from your WooCommerce admin.",
    logoEmoji: "🛒",
    docsUrl: "https://woocommerce.github.io/woocommerce-rest-api-docs",
  },
  bigcommerce: {
    id: "bigcommerce",
    displayName: "BigCommerce",
    category: "ecommerce",
    description: "Sync orders to trigger post-purchase flows.",
    ready: false,
    blockerNote: "Custom app in BigCommerce Developer Portal.",
    oauthUrl: "https://login.bigcommerce.com/oauth2/authorize",
    tokenUrl: "https://login.bigcommerce.com/oauth2/token",
    logoEmoji: "🛒",
    docsUrl: "https://developer.bigcommerce.com",
  },
  squarespace: {
    id: "squarespace",
    displayName: "Squarespace",
    category: "ecommerce",
    description: "Squarespace Commerce orders + customers.",
    ready: false,
    blockerNote: "API key required (no full OAuth).",
    logoEmoji: "⬛",
    docsUrl: "https://developers.squarespace.com",
  },
  prestashop: {
    id: "prestashop",
    displayName: "PrestaShop",
    category: "ecommerce",
    description: "Order + customer sync.",
    ready: false,
    blockerNote: "Webservice key from PrestaShop admin.",
    logoEmoji: "🛍️",
    docsUrl: "https://devdocs.prestashop-project.org",
  },
  magento: {
    id: "magento",
    displayName: "Magento",
    category: "ecommerce",
    description: "Adobe Commerce orders + customers.",
    ready: false,
    blockerNote: "Integration token from Magento admin.",
    logoEmoji: "🟠",
    docsUrl: "https://developer.adobe.com/commerce",
  },
  ecwid: {
    id: "ecwid",
    displayName: "Ecwid",
    category: "ecommerce",
    description: "Multi-platform e-commerce.",
    ready: false,
    blockerNote: "Public Application token from Ecwid Control Panel.",
    logoEmoji: "🛒",
    docsUrl: "https://developers.ecwid.com",
  },
  opencart: {
    id: "opencart",
    displayName: "OpenCart",
    category: "ecommerce",
    description: "Self-hosted e-commerce sync.",
    ready: false,
    blockerNote: "OpenCart REST API extension required.",
    logoEmoji: "🛒",
    docsUrl: "https://www.opencart.com",
  },
  wix: {
    id: "wix",
    displayName: "Wix",
    category: "ecommerce",
    description: "Wix Stores order + visitor data.",
    ready: false,
    blockerNote: "Wix Developer Center app registration.",
    oauthUrl: "https://www.wix.com/installer/install",
    tokenUrl: "https://www.wixapis.com/oauth/access",
    logoEmoji: "🌐",
    docsUrl: "https://dev.wix.com",
  },
  shift4shop: {
    id: "shift4shop",
    displayName: "Shift4Shop",
    category: "ecommerce",
    description: "Order webhook sync.",
    ready: false,
    blockerNote: "API key from Shift4Shop admin.",
    logoEmoji: "🛒",
    docsUrl: "https://apirest.3dcart.com",
  },

  // ─────────────────────────────────────────────────────────────────────────
  // POS systems
  // ─────────────────────────────────────────────────────────────────────────
  square_pos: {
    id: "square_pos",
    displayName: "Square POS",
    category: "pos",
    description: "Trigger reviews after each transaction.",
    ready: false,
    blockerNote: "Square Developer app required.",
    scopes: ["PAYMENTS_READ", "CUSTOMERS_READ"],
    oauthUrl: "https://connect.squareup.com/oauth2/authorize",
    tokenUrl: "https://connect.squareup.com/oauth2/token",
    logoEmoji: "⬛",
    docsUrl: "https://developer.squareup.com",
  },
  toast_pos: {
    id: "toast_pos",
    displayName: "Toast POS",
    category: "pos",
    description: "Restaurant POS — trigger reviews after table closes.",
    ready: false,
    blockerNote: "Toast Partner Program required.",
    logoEmoji: "🍞",
    docsUrl: "https://doc.toasttab.com",
  },
  clover_pos: {
    id: "clover_pos",
    displayName: "Clover POS",
    category: "pos",
    description: "Retail + restaurant POS integration.",
    ready: false,
    blockerNote: "Clover Developer + Partner approval.",
    oauthUrl: "https://www.clover.com/oauth/authorize",
    tokenUrl: "https://www.clover.com/oauth/token",
    logoEmoji: "🍀",
    docsUrl: "https://docs.clover.com",
  },
  lightspeed_pos: {
    id: "lightspeed_pos",
    displayName: "Lightspeed POS",
    category: "pos",
    description: "Multi-vertical POS sync.",
    ready: false,
    blockerNote: "Lightspeed Developer account + API key.",
    oauthUrl: "https://cloud.lightspeedapp.com/oauth/authorize.php",
    tokenUrl: "https://cloud.lightspeedapp.com/oauth/access_token.php",
    logoEmoji: "⚡",
    docsUrl: "https://developers.lightspeedhq.com",
  },
  touchbistro: {
    id: "touchbistro",
    displayName: "TouchBistro",
    category: "pos",
    description: "iPad-based restaurant POS.",
    ready: false,
    blockerNote: "Partner integration required.",
    logoEmoji: "🍴",
    docsUrl: "https://www.touchbistro.com",
  },
  upserve_pos: {
    id: "upserve_pos",
    displayName: "Upserve POS",
    category: "pos",
    description: "Restaurant management + POS.",
    ready: false,
    blockerNote: "Upserve API partner program.",
    logoEmoji: "🍷",
    docsUrl: "https://upserve.com",
  },
  lavu_pos: {
    id: "lavu_pos",
    displayName: "Lavu POS",
    category: "pos",
    description: "Restaurant POS sync.",
    ready: false,
    blockerNote: "Lavu API access required.",
    logoEmoji: "🥄",
    docsUrl: "https://lavu.com",
  },
  epos_now: {
    id: "epos_now",
    displayName: "Epos Now",
    category: "pos",
    description: "UK-based POS integration.",
    ready: false,
    blockerNote: "Epos Now Marketplace partner.",
    logoEmoji: "🇬🇧",
    docsUrl: "https://developer.eposnowhq.com",
  },
  revel_pos: {
    id: "revel_pos",
    displayName: "Revel Systems",
    category: "pos",
    description: "iPad POS for restaurants + retail.",
    ready: false,
    blockerNote: "Revel API partner application.",
    logoEmoji: "🔵",
    docsUrl: "https://revelsystems.com",
  },
  micros_pos: {
    id: "micros_pos",
    displayName: "Oracle Micros",
    category: "pos",
    description: "Enterprise hospitality POS.",
    ready: false,
    blockerNote: "Oracle Hospitality API partner.",
    logoEmoji: "🔴",
    docsUrl: "https://www.oracle.com/industries/hospitality",
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Accounting
  // ─────────────────────────────────────────────────────────────────────────
  quickbooks: {
    id: "quickbooks",
    displayName: "QuickBooks Online",
    category: "accounting",
    description: "Trigger review requests after invoices are paid.",
    ready: false,
    blockerNote: "Intuit Developer + app certification.",
    scopes: ["com.intuit.quickbooks.accounting"],
    oauthUrl: "https://appcenter.intuit.com/connect/oauth2",
    tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    logoEmoji: "💚",
    docsUrl: "https://developer.intuit.com",
  },
  xero: {
    id: "xero",
    displayName: "Xero",
    category: "accounting",
    description: "Sync invoices + contacts.",
    ready: false,
    blockerNote: "Xero Developer account + custom app.",
    scopes: ["accounting.transactions.read", "accounting.contacts.read"],
    oauthUrl: "https://login.xero.com/identity/connect/authorize",
    tokenUrl: "https://identity.xero.com/connect/token",
    logoEmoji: "🔵",
    docsUrl: "https://developer.xero.com",
  },
  freshbooks: {
    id: "freshbooks",
    displayName: "FreshBooks",
    category: "accounting",
    description: "Freelancer + SMB accounting.",
    ready: false,
    blockerNote: "FreshBooks Developer Portal.",
    oauthUrl: "https://my.freshbooks.com/service/auth/oauth/authorize",
    tokenUrl: "https://api.freshbooks.com/auth/oauth/token",
    logoEmoji: "📗",
    docsUrl: "https://www.freshbooks.com/api",
  },
  sage50: {
    id: "sage50",
    displayName: "Sage 50",
    category: "accounting",
    description: "Sage 50 / Sage Business Cloud integration.",
    ready: false,
    blockerNote: "Sage Developer Hub.",
    oauthUrl: "https://www.sageone.com/oauth2/auth/central",
    tokenUrl: "https://oauth.accounting.sage.com/token",
    logoEmoji: "🟢",
    docsUrl: "https://developer.sage.com",
  },
  netsuite: {
    id: "netsuite",
    displayName: "NetSuite",
    category: "accounting",
    description: "Enterprise ERP integration.",
    ready: false,
    blockerNote: "TBA (Token-Based Auth) or OAuth 2.0 setup.",
    logoEmoji: "🔷",
    docsUrl: "https://docs.oracle.com/cloud/latest/netsuitecs_gs",
  },
  myob: {
    id: "myob",
    displayName: "MYOB",
    category: "accounting",
    description: "Australian SMB accounting.",
    ready: false,
    blockerNote: "MYOB Developer Center app registration.",
    oauthUrl: "https://secure.myob.com/oauth2/account/authorize",
    tokenUrl: "https://secure.myob.com/oauth2/v1/authorize",
    logoEmoji: "🟣",
    docsUrl: "https://developer.myob.com",
  },
  zoho_books: {
    id: "zoho_books",
    displayName: "Zoho Books",
    category: "accounting",
    description: "Zoho accounting integration.",
    ready: false,
    blockerNote: "Zoho API client + scopes setup.",
    oauthUrl: "https://accounts.zoho.com/oauth/v2/auth",
    tokenUrl: "https://accounts.zoho.com/oauth/v2/token",
    logoEmoji: "🟠",
    docsUrl: "https://www.zoho.com/books/api",
  },
  kashoo: {
    id: "kashoo",
    displayName: "Kashoo",
    category: "accounting",
    description: "Small-business cloud accounting.",
    ready: false,
    blockerNote: "Kashoo API access.",
    logoEmoji: "🟡",
    docsUrl: "https://kashoo.com",
  },
  wave: {
    id: "wave",
    displayName: "Wave Accounting",
    category: "accounting",
    description: "Free SMB accounting + invoicing.",
    ready: false,
    blockerNote: "Wave Developer Portal.",
    oauthUrl: "https://api.waveapps.com/oauth2/authorize",
    tokenUrl: "https://api.waveapps.com/oauth2/token",
    logoEmoji: "🌊",
    docsUrl: "https://developer.waveapps.com",
  },
  tally_erp: {
    id: "tally_erp",
    displayName: "Tally ERP",
    category: "accounting",
    description: "Popular Indian SMB accounting software.",
    ready: false,
    blockerNote: "Tally local-network XML/REST gateway required.",
    logoEmoji: "🟢",
    docsUrl: "https://tallysolutions.com",
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Email Marketing
  // ─────────────────────────────────────────────────────────────────────────
  mailchimp: {
    id: "mailchimp",
    displayName: "Mailchimp",
    category: "email_marketing",
    description: "Sync audiences + trigger campaigns.",
    ready: false,
    blockerNote: "Mailchimp OAuth app registration.",
    oauthUrl: "https://login.mailchimp.com/oauth2/authorize",
    tokenUrl: "https://login.mailchimp.com/oauth2/token",
    logoEmoji: "🐵",
    docsUrl: "https://mailchimp.com/developer",
  },
  klaviyo: {
    id: "klaviyo",
    displayName: "Klaviyo",
    category: "email_marketing",
    description: "E-commerce email + SMS.",
    ready: false,
    blockerNote: "Klaviyo OAuth + API key.",
    oauthUrl: "https://www.klaviyo.com/oauth/authorize",
    tokenUrl: "https://a.klaviyo.com/oauth/token",
    logoEmoji: "🟣",
    docsUrl: "https://developers.klaviyo.com",
  },
  convertkit: {
    id: "convertkit",
    displayName: "ConvertKit",
    category: "email_marketing",
    description: "Creator email marketing.",
    ready: false,
    blockerNote: "API key authentication.",
    logoEmoji: "🟢",
    docsUrl: "https://developers.convertkit.com",
  },
  aweber: {
    id: "aweber",
    displayName: "AWeber",
    category: "email_marketing",
    description: "Long-running SMB email tool.",
    ready: false,
    blockerNote: "AWeber Developer Portal app.",
    oauthUrl: "https://auth.aweber.com/oauth2/authorize",
    tokenUrl: "https://auth.aweber.com/oauth2/token",
    logoEmoji: "🟠",
    docsUrl: "https://developer.aweber.com",
  },
  getresponse: {
    id: "getresponse",
    displayName: "GetResponse",
    category: "email_marketing",
    description: "Email + landing pages.",
    ready: false,
    blockerNote: "GetResponse API key.",
    logoEmoji: "🟢",
    docsUrl: "https://apidocs.getresponse.com",
  },
  constant_contact: {
    id: "constant_contact",
    displayName: "Constant Contact",
    category: "email_marketing",
    description: "SMB email marketing.",
    ready: false,
    blockerNote: "OAuth app from V3 Developer Portal.",
    oauthUrl: "https://authz.constantcontact.com/oauth2/default/v1/authorize",
    tokenUrl: "https://authz.constantcontact.com/oauth2/default/v1/token",
    logoEmoji: "🔵",
    docsUrl: "https://developer.constantcontact.com",
  },
  campaign_monitor: {
    id: "campaign_monitor",
    displayName: "Campaign Monitor",
    category: "email_marketing",
    description: "Designer-friendly email marketing.",
    ready: false,
    blockerNote: "OAuth or API key authentication.",
    oauthUrl: "https://api.createsend.com/oauth",
    tokenUrl: "https://api.createsend.com/oauth/token",
    logoEmoji: "📧",
    docsUrl: "https://www.campaignmonitor.com/api",
  },
  brevo: {
    id: "brevo",
    displayName: "Brevo (Sendinblue)",
    category: "email_marketing",
    description: "Email + SMS + chat platform.",
    ready: false,
    blockerNote: "API v3 key authentication.",
    logoEmoji: "🟢",
    docsUrl: "https://developers.brevo.com",
  },
  omnisend: {
    id: "omnisend",
    displayName: "Omnisend",
    category: "email_marketing",
    description: "E-commerce email + SMS.",
    ready: false,
    blockerNote: "API key authentication.",
    logoEmoji: "🟣",
    docsUrl: "https://api-docs.omnisend.com",
  },
  ac_email: {
    id: "ac_email",
    displayName: "ActiveCampaign Email",
    category: "email_marketing",
    description: "Marketing automation + email.",
    ready: false,
    blockerNote: "API key from your ActiveCampaign account.",
    logoEmoji: "🔵",
    docsUrl: "https://developers.activecampaign.com",
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Live Chat
  // ─────────────────────────────────────────────────────────────────────────
  website_widget: {
    id: "website_widget",
    displayName: "Website Live Chat Widget",
    category: "live_chat",
    description: "Embed our AI chatbot on any website with one script tag.",
    ready: true,
    logoEmoji: "💬",
    docsUrl: "/ai",
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Import
  // ─────────────────────────────────────────────────────────────────────────
  csv_import: {
    id: "csv_import",
    displayName: "Manual CSV Import",
    category: "import",
    description: "Upload customer contacts as a CSV file.",
    ready: true,
    logoEmoji: "📥",
    docsUrl: "/contacts",
  },
};

export const PROVIDER_LIST = Object.values(PROVIDERS);

export const CATEGORY_LABELS: Record<ProviderCategory, string> = {
  review_source: "Review Sources",
  social: "Social Media",
  crm: "CRM",
  ecommerce: "E-commerce",
  pos: "POS Systems",
  accounting: "Accounting",
  email_marketing: "Email Marketing",
  live_chat: "Live Chat",
  import: "Import",
};

export function getProvidersByCategory(): Record<ProviderCategory, ProviderEntry[]> {
  const grouped: Record<string, ProviderEntry[]> = {};
  for (const p of PROVIDER_LIST) {
    if (!grouped[p.category]) grouped[p.category] = [];
    grouped[p.category]!.push(p);
  }
  return grouped as Record<ProviderCategory, ProviderEntry[]>;
}
