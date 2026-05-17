export const dynamic = "force-static";

export const metadata = {
  title: "Cookie Policy · Repulabs",
};

export default function CookiesPage() {
  return (
    <>
      <h1>Cookie Policy</h1>
      <p className="text-sm text-muted-foreground">
        Effective: 2026-05-17 · Last updated: 2026-05-17
      </p>

      <p>
        Repulabs uses a small number of cookies to keep you signed in, remember your preferences,
        and measure aggregate usage. We don&rsquo;t use cookies for third-party advertising and we
        never sell personal data.
      </p>

      <h2>1. What is a cookie?</h2>
      <p>
        A cookie is a small text file stored on your device by your browser. It can hold values like
        a session identifier or a preference flag. Some cookies expire when you close the browser;
        others persist for a set duration.
      </p>

      <h2>2. Cookies we set</h2>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Purpose</th>
            <th>Duration</th>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>authjs.session-token</code>
            </td>
            <td>
              Keeps you signed in to your tenant workspace. Set by Auth.js after a successful
              magic-link or SSO login.
            </td>
            <td>30 days, sliding</td>
            <td>Essential</td>
          </tr>
          <tr>
            <td>
              <code>admin_session</code>
            </td>
            <td>
              Admin session for staff members at <code>admin.repulabs.com</code>. Separate from
              tenant sessions. <code>SameSite=Strict</code>.
            </td>
            <td>12 hours, fixed</td>
            <td>Essential</td>
          </tr>
          <tr>
            <td>
              <code>oauth_state_*</code>
            </td>
            <td>
              CSRF protection during the OAuth handshake to connect Google, Meta, or other
              providers.
            </td>
            <td>10 minutes</td>
            <td>Essential</td>
          </tr>
          <tr>
            <td>
              <code>rl-theme</code>
            </td>
            <td>
              Stores your preferred theme (light / dark / system). Set only if you change the
              default.
            </td>
            <td>1 year</td>
            <td>Preference</td>
          </tr>
        </tbody>
      </table>

      <h2>3. Analytics</h2>
      <p>
        We use a privacy-preserving analytics solution (Plausible) that does not set cookies and
        does not track individual users. Aggregate pageviews and conversion events are recorded from
        the server side using an anonymized hash of IP + user-agent that rotates daily.
      </p>

      <h2>4. Third-party cookies</h2>
      <p>
        Some embedded checkout flows (Stripe) and OAuth providers (Google, Meta) set their own
        cookies during your interaction with them. Those are subject to their respective cookie
        policies. We do not have access to or control over those cookies.
      </p>

      <h2>5. Your choices</h2>
      <ul>
        <li>
          <strong>Browser controls</strong> — every major browser lets you block or delete cookies.
          Blocking essential cookies will sign you out and disable OAuth connections.
        </li>
        <li>
          <strong>Do Not Track</strong> — we respect the DNT header. Sites with DNT enabled receive
          no preference cookies and no analytics pings.
        </li>
        <li>
          <strong>Delete your account</strong> — see <a href="/legal/privacy">our Privacy Policy</a>{" "}
          for the full data-deletion pipeline.
        </li>
      </ul>

      <h2>6. Changes</h2>
      <p>
        If we add new cookie types we&rsquo;ll update this page and notify signed-in users via a
        dashboard banner at least 14 days before the change takes effect.
      </p>
    </>
  );
}
