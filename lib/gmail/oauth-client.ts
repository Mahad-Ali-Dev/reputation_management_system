/**
 * Which Google OAuth client the Gmail integration uses.
 *
 * WHY THIS EXISTS — Google verifies an OAuth app **per client**, and the tier is
 * set by the most privileged scope that client requests:
 *
 *   business.manage            → SENSITIVE   (verification only)
 *   gmail.readonly / .send     → RESTRICTED  (verification + an independent
 *                                             CASA security assessment)
 *
 * While Gmail shares `AUTH_GOOGLE_ID` with the Business Profile connect flow,
 * the ENTIRE app is pulled into the restricted tier — which would gate
 * "connect your business" behind a months-long, paid security assessment.
 *
 * Point Gmail at its own OAuth client (its own Google Cloud project) and the
 * main client only ever asks for business.manage, so it verifies on the
 * sensitive track. Set these when that separate project exists:
 *
 *   GMAIL_OAUTH_CLIENT_ID
 *   GMAIL_OAUTH_CLIENT_SECRET
 *
 * Until then it falls back to the shared credentials, so nothing changes today.
 */
export function gmailOAuthClient(): {
  clientId: string | undefined;
  clientSecret: string | undefined;
  /** True once Gmail is isolated on its own client. */
  isolated: boolean;
} {
  const dedicatedId = process.env.GMAIL_OAUTH_CLIENT_ID;
  const dedicatedSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET;

  if (dedicatedId && dedicatedSecret) {
    return { clientId: dedicatedId, clientSecret: dedicatedSecret, isolated: true };
  }

  return {
    clientId: process.env.AUTH_GOOGLE_ID,
    clientSecret: process.env.AUTH_GOOGLE_SECRET,
    isolated: false,
  };
}
