export const metadata = {
  title: 'Privacy Policy — Waging War',
};

const LAST_UPDATED = '18 July 2026';

function Section({ title, children }) {
  return (
    <section style={{ marginBottom: 36 }}>
      <h2 style={{ fontSize: 16, fontWeight: 800, color: '#111827', marginBottom: 10, paddingBottom: 8, borderBottom: '0.5px solid #e5e7eb' }}>
        {title}
      </h2>
      <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.75 }}>
        {children}
      </div>
    </section>
  );
}

function P({ children }) {
  return <p style={{ marginBottom: 10 }}>{children}</p>;
}

function Ul({ items }) {
  return (
    <ul style={{ paddingLeft: 20, marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
      {items.map((item, i) => (
        <li key={i} style={{ listStyleType: 'disc', color: '#374151' }}>{item}</li>
      ))}
    </ul>
  );
}

export default function PrivacyPage() {
  return (
    <div className="flex-1 overflow-y-auto mob-page" style={{ background: '#f8fafc' }}>

      {/* ── Header ── */}
      <div style={{ background: '#1B4332', padding: '44px 24px 36px', textAlign: 'center' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: '0 0 10px', letterSpacing: '-0.01em' }}>
            Privacy Policy
          </h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: 0 }}>
            Last updated {LAST_UPDATED} · Waging War (wagingwar.com.au)
          </p>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px 48px' }}>

        {/* Intro card */}
        <div style={{ background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 10, padding: '20px 24px', marginBottom: 36, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.75, margin: 0 }}>
            Waging War (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) operates wagingwar.com.au, an Australian
            horse racing analytics and community platform. This Privacy Policy explains how we collect,
            use, store, and protect your personal information in accordance with the{' '}
            <strong>Australian Privacy Act 1988 (Cth)</strong> and the Australian Privacy Principles (APPs).
            By using our platform you agree to the practices described in this policy.
          </p>
        </div>

        <div style={{ background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 10, padding: '28px 32px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>

          <Section title="1. Information We Collect">
            <P>We collect the following categories of personal information when you use Waging War:</P>

            <p style={{ fontWeight: 700, color: '#111827', marginBottom: 4 }}>Account information</p>
            <Ul items={[
              'Email address (collected via Clerk authentication at sign-up)',
              'Name (first and/or last name, if provided)',
              'Profile display name chosen by you',
            ]} />

            <p style={{ fontWeight: 700, color: '#111827', marginBottom: 4 }}>Betting and racing data</p>
            <Ul items={[
              'Bets you log manually: horse name, race, stake, odds, bookmaker, bet type',
              'Bet outcomes (win/loss) when you update your records',
              'Blackbook entries: horses you save with notes, tags and priority ratings',
            ]} />

            <p style={{ fontWeight: 700, color: '#111827', marginBottom: 4 }}>Community activity</p>
            <Ul items={[
              'Posts and replies you publish on the Community page',
              'Upvotes you cast on posts and replies',
              'Points earned through platform activity',
            ]} />

            <p style={{ fontWeight: 700, color: '#111827', marginBottom: 4 }}>Usage data</p>
            <Ul items={[
              'Pages visited and features used within the platform',
              'Browser type and device category (mobile / desktop)',
              'Session metadata collected automatically by our infrastructure providers',
            ]} />
          </Section>

          <Section title="2. How We Use Your Information">
            <P>We use the information we collect solely to operate and improve Waging War. Specifically:</P>
            <Ul items={[
              'To create and manage your account and authenticate you securely',
              'To display your betting history, ROI, and statistics back to you',
              'To calculate and display your community points, rank and tier',
              'To enable community features such as posting, replying and upvoting',
              'To send transactional emails related to your account (e.g. password reset)',
              'To analyse aggregate usage patterns and improve platform features',
              'To comply with our legal obligations under Australian law',
            ]} />
            <P>We do not use your personal information for automated decision-making that produces legal or similarly significant effects.</P>
          </Section>

          <Section title="3. Authentication — Clerk">
            <P>
              We use <strong>Clerk</strong> (clerk.com) to handle all user authentication. When you sign up
              or sign in, your credentials are processed directly by Clerk. We store only the Clerk-issued
              user ID on our own servers; we do not store or handle your password.
            </P>
            <P>
              Clerk may store your email address and authentication tokens on servers located in the
              United States. Clerk is SOC 2 Type II certified. You can review Clerk&apos;s privacy
              practices at clerk.com/privacy.
            </P>
          </Section>

          <Section title="4. Data Storage — Supabase">
            <P>
              All application data — including your profile, bets, blackbook entries, community posts,
              and points — is stored in <strong>Supabase</strong> (supabase.com), a managed PostgreSQL
              database platform. Our Supabase project is hosted in Australia (Sydney region), and your
              data is stored there.
            </P>
            <P>
              Data at rest is encrypted by Supabase. We implement row-level access controls so that your
              data is only accessible to you and authorised platform administrators. You can review
              Supabase&apos;s privacy practices at supabase.com/privacy.
            </P>
          </Section>

          <Section title="5. Payments — Stripe">
            <P>
              Subscription payments are processed by <strong>Stripe</strong> (stripe.com). We do not
              collect or store your payment card details. Stripe processes payment information directly
              and provides us only with a subscription status confirmation. Stripe is PCI DSS Level 1
              certified. You can review Stripe&apos;s privacy practices at stripe.com/privacy.
            </P>
          </Section>

          <Section title="6. No Sale of Personal Information">
            <P>
              <strong>We do not sell, rent, trade, or otherwise transfer your personal information to
              third parties for marketing or commercial purposes.</strong> Your data is used exclusively
              to operate the Waging War platform and is shared with third-party service providers only
              to the extent necessary to deliver our services (Clerk, Supabase, Stripe as described above).
            </P>
          </Section>

          <Section title="7. Cookies and Local Storage">
            <P>We use the following technologies to maintain your session and preferences:</P>
            <Ul items={[
              'Session cookies set by Clerk to keep you signed in across page loads',
              'Browser localStorage to cache your most recent race data and bet records for offline access',
              'No third-party advertising cookies or cross-site tracking cookies are used',
            ]} />
            <P>
              We use Google Analytics (GA4) to understand aggregate usage patterns across the platform.
              Google may set its own cookies for this purpose. Google&apos;s privacy practices can be
              reviewed at policies.google.com/privacy.
            </P>
            <P>
              You can clear cookies and local storage at any time via your browser settings. Clearing
              session cookies will sign you out of the platform.
            </P>
          </Section>

          <Section title="8. Data Retention">
            <P>
              We retain your personal information for as long as your account is active or as needed to
              provide our services. If you request deletion of your account, we will delete or anonymise
              your personal data within 30 days, except where we are required by law to retain it.
            </P>
          </Section>

          <Section title="9. Your Rights — Australian Privacy Act">
            <P>
              Under the <strong>Australian Privacy Act 1988 (Cth)</strong> and the Australian Privacy
              Principles you have the right to:
            </P>
            <Ul items={[
              'Access the personal information we hold about you',
              'Request correction of inaccurate or incomplete personal information',
              'Request deletion of your personal information (subject to legal retention obligations)',
              'Complain about a breach of the Australian Privacy Principles',
            ]} />
            <P>
              To exercise any of these rights, contact us at{' '}
              <a href="mailto:support@wagingwar.com.au" style={{ color: '#00471b', fontWeight: 600 }}>
                support@wagingwar.com.au
              </a>
              . We will respond within 30 days. If you are unsatisfied with our response you may lodge
              a complaint with the{' '}
              <strong>Office of the Australian Information Commissioner (OAIC)</strong> at oaic.gov.au.
            </P>
          </Section>

          <Section title="10. Security">
            <P>
              We take reasonable steps to protect your personal information from misuse, interference,
              loss, unauthorised access, modification, and disclosure. All data is transmitted over HTTPS.
              Access to production databases is restricted to authorised personnel only.
            </P>
            <P>
              Despite these measures, no method of internet transmission is completely secure. We cannot
              guarantee the absolute security of information transmitted to or from our platform.
            </P>
          </Section>

          <Section title="11. Changes to This Policy">
            <P>
              We may update this Privacy Policy from time to time. When we do, we will update the
              &ldquo;Last updated&rdquo; date at the top of this page. Continued use of the platform
              after changes are posted constitutes acceptance of the revised policy. We encourage you to
              review this page periodically.
            </P>
          </Section>

          <Section title="12. Contact Us">
            <P>
              If you have any questions, concerns, or requests regarding this Privacy Policy or how we
              handle your personal information, please contact:
            </P>
            <div style={{ background: '#f0fdf4', border: '0.5px solid #86efac', borderRadius: 8, padding: '16px 20px', marginTop: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 4 }}>Waging War</div>
              <div style={{ fontSize: 13, color: '#374151' }}>
                Email:{' '}
                <a href="mailto:support@wagingwar.com.au" style={{ color: '#00471b', fontWeight: 600 }}>
                  support@wagingwar.com.au
                </a>
              </div>
              <div style={{ fontSize: 13, color: '#374151', marginTop: 2 }}>Website: wagingwar.com.au</div>
            </div>
          </Section>

        </div>
      </div>
    </div>
  );
}
