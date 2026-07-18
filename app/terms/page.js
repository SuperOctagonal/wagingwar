export const metadata = {
  title: 'Terms of Service — Waging War',
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

function Warning({ children }) {
  return (
    <div style={{ background: '#fef2f2', border: '0.5px solid #fecaca', borderRadius: 8, padding: '14px 18px', marginBottom: 12 }}>
      <div style={{ fontSize: 13, color: '#991b1b', lineHeight: 1.65 }}>{children}</div>
    </div>
  );
}

export default function TermsPage() {
  return (
    <div className="flex-1 overflow-y-auto mob-page" style={{ background: '#f8fafc' }}>

      {/* ── Header ── */}
      <div style={{ background: '#1B4332', padding: '44px 24px 36px', textAlign: 'center' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: '0 0 10px', letterSpacing: '-0.01em' }}>
            Terms of Service
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
            Please read these Terms of Service (&ldquo;Terms&rdquo;) carefully before using Waging War
            (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;), operated at wagingwar.com.au.
            By creating an account or using the platform you agree to be bound by these Terms.
            If you do not agree, do not use the service.
          </p>
        </div>

        <div style={{ background: '#fff', border: '0.5px solid #e5e7eb', borderRadius: 10, padding: '28px 32px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>

          <Section title="1. Not Financial Advice">
            <Warning>
              <strong>Waging War is an informational and analytics platform only. Nothing on this
              platform constitutes financial advice, betting advice, or a recommendation to place
              any bet or wager.</strong> All race analysis, scores, rankings, odds, and model outputs
              are provided for informational and entertainment purposes only. You must not treat any
              content on this platform as a recommendation to bet.
            </Warning>
            <P>
              Horse racing involves significant financial risk. Past model performance does not
              guarantee future results. You acknowledge that you may lose money by placing bets and
              that Waging War accepts no responsibility for any financial losses you incur.
            </P>
          </Section>

          <Section title="2. User Responsibility for Betting Decisions">
            <P>
              You are solely responsible for every betting or wagering decision you make. By using
              this platform you acknowledge and agree that:
            </P>
            <Ul items={[
              'All bets are placed at your own risk and at your own discretion',
              'You have assessed your own financial situation before betting',
              'You comply with all applicable laws regarding gambling in your jurisdiction',
              'You are of legal age to gamble in your state or territory',
              'Waging War is not a licensed bookmaker and does not accept bets',
              'Waging War is not responsible for the accuracy of odds sourced from third parties',
            ]} />
            <P>
              If gambling is causing you harm, please contact the{' '}
              <strong>National Gambling Helpline: 1800 858 858</strong> or visit gamblinghelponline.org.au.
            </P>
          </Section>

          <Section title="3. Subscription Plans and Free Trial">
            <P>Waging War offers the following paid subscription plans:</P>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              {[
                { label: 'Monthly', price: '$29 / month', detail: 'Billed monthly. Cancel any time.' },
                { label: 'Annual',  price: '$249 / year', detail: 'Billed annually. Best value.' },
              ].map(plan => (
                <div key={plan.label} style={{ background: '#f0fdf4', border: '0.5px solid #86efac', borderRadius: 8, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#065f46', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{plan.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#111827', marginBottom: 3 }}>{plan.price}</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>{plan.detail}</div>
                </div>
              ))}
            </div>
            <P>
              All new subscribers receive a <strong>7-day free trial</strong>. You will not be charged
              during the trial period. At the end of the trial, your chosen plan will automatically
              begin and your payment method will be charged unless you cancel before the trial ends.
            </P>
            <P>
              Subscription payments are processed securely by Stripe. By subscribing you authorise
              Stripe to charge your payment method on a recurring basis until you cancel.
            </P>
          </Section>

          <Section title="4. Cancellation Policy">
            <P>
              You may cancel your subscription at any time through your account settings or by
              contacting us at{' '}
              <a href="mailto:support@wagingwar.com.au" style={{ color: '#00471b', fontWeight: 600 }}>
                support@wagingwar.com.au
              </a>.
            </P>
            <Ul items={[
              'Cancellation takes effect at the end of your current billing period',
              'You retain full access to Pro features until the end of the period you have paid for',
              'Cancelling during the free trial incurs no charge',
              'After cancellation your account reverts to the free tier; your data is retained',
            ]} />
          </Section>

          <Section title="5. Refund Policy">
            <Warning>
              <strong>All subscription fees are non-refundable after the 7-day free trial period
              ends.</strong> If you cancel after being charged, you will not receive a refund for
              the current billing period. You will continue to have access until the end of that period.
            </Warning>
            <P>
              Refunds may be granted at our sole discretion in exceptional circumstances such as a
              significant service outage or billing error. To request a refund consideration, contact{' '}
              <a href="mailto:support@wagingwar.com.au" style={{ color: '#00471b', fontWeight: 600 }}>
                support@wagingwar.com.au
              </a>{' '}
              within 7 days of the charge.
            </P>
          </Section>

          <Section title="6. Acceptable Use">
            <P>You agree not to use Waging War to:</P>
            <Ul items={[
              'Violate any applicable law or regulation',
              'Scrape, copy, or redistribute our race analysis data or model outputs',
              'Attempt to reverse-engineer our scoring algorithms or models',
              'Post content that is abusive, defamatory, or harassing in the Community',
              'Create multiple accounts to abuse the free trial offer',
              'Share your account credentials with others',
              'Interfere with the operation of the platform or its servers',
            ]} />
          </Section>

          <Section title="7. Intellectual Property">
            <P>
              All content on Waging War — including race analysis models, scoring algorithms,
              software code, design, and written content — is owned by or licensed to Waging War
              and is protected by Australian and international intellectual property laws.
            </P>
            <P>
              You are granted a limited, non-exclusive, non-transferable licence to access and use
              the platform for your personal, non-commercial purposes during your subscription.
              This licence does not permit you to reproduce, distribute, or create derivative works
              from any platform content.
            </P>
          </Section>

          <Section title="8. Account Termination">
            <P>
              We reserve the right to suspend or permanently terminate your account at our discretion,
              without notice, if we reasonably believe you have:
            </P>
            <Ul items={[
              'Violated these Terms of Service',
              'Engaged in abusive, fraudulent, or harmful conduct',
              'Attempted to circumvent subscription restrictions',
              'Acted in a way that damages the platform or its community',
            ]} />
            <P>
              If your account is terminated for a breach of these Terms you will not be entitled to
              a refund of any fees paid. If you believe your account was terminated in error, contact
              us at{' '}
              <a href="mailto:support@wagingwar.com.au" style={{ color: '#00471b', fontWeight: 600 }}>
                support@wagingwar.com.au
              </a>.
            </P>
          </Section>

          <Section title="9. Limitation of Liability">
            <P>
              To the maximum extent permitted by Australian law, Waging War and its operators will
              not be liable for any indirect, incidental, special, consequential, or punitive damages
              arising from your use of the platform, including but not limited to:
            </P>
            <Ul items={[
              'Financial losses from betting decisions informed by platform content',
              'Loss of data or access due to service interruptions',
              'Errors or inaccuracies in race data, odds, or model outputs',
              'Unauthorised access to your account by third parties',
            ]} />
            <P>
              Our total liability to you for any claim arising from your use of the platform will not
              exceed the total subscription fees you paid in the three months preceding the claim.
            </P>
          </Section>

          <Section title="10. Governing Law">
            <P>
              These Terms are governed by and construed in accordance with the laws of{' '}
              <strong>Queensland, Australia</strong>. You agree to submit to the exclusive jurisdiction
              of the courts of Queensland for any dispute arising from these Terms or your use of
              the platform.
            </P>
            <P>
              Nothing in these Terms limits any rights you may have under the{' '}
              <strong>Australian Consumer Law</strong> (Schedule 2 of the Competition and Consumer
              Act 2010 (Cth)), which cannot be excluded by contract.
            </P>
          </Section>

          <Section title="11. Changes to These Terms">
            <P>
              We may update these Terms from time to time. When we do, we will update the
              &ldquo;Last updated&rdquo; date above. We will notify active subscribers of material
              changes by email. Continued use of the platform after changes are posted constitutes
              your acceptance of the revised Terms.
            </P>
          </Section>

          <Section title="12. Contact">
            <P>Questions about these Terms? Contact us:</P>
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
