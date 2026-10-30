-- NOT APPLIED. Written for review only -- do not run until approved.
--
-- Ad attribution for the admin dashboard's "Ads to sign-ups" panel.
--
-- signup_attribution: first-touch ad source for a user, one row per Clerk
--   user, written once by POST /api/attribution/signup when the user signs
--   up -- only if they accepted cookies (the browser keeps the first-touch
--   values only after consent). Stores just the three UTM values and the
--   landing path. No IP, no email, no other personal data.
-- ad_landings: one row per landing on a URL carrying utm_content, written by
--   POST /api/attribution/landing for every visitor (anonymous: utm_content
--   and a timestamp, nothing else -- deliberately no id column, no IP, no
--   user or session identifier).
-- ad_spend: spend per ad per day in AUD, entered by the admin through the
--   dashboard form (POST /api/admin/ad-spend). Negative amounts (credits /
--   refunds) are allowed and shown as-is.
--
-- Access: written and read only server-side with the service key, after
-- the route's own checks (admin routes re-check isSiteAdmin()). RLS on with
-- no policies, AND every privilege revoked from anon and authenticated:
-- this project's default privileges grant anon/authenticated full access
-- on new public tables, so RLS alone would leave the grants in place.

create table if not exists public.signup_attribution (
  clerk_user_id text primary key,
  utm_source    text check (char_length(utm_source)   <= 100),
  utm_campaign  text check (char_length(utm_campaign) <= 100),
  utm_content   text check (char_length(utm_content)  <= 100),
  landing_path  text check (char_length(landing_path) <= 200),
  created_at    timestamptz not null default now()
);

create table if not exists public.ad_landings (
  utm_content text        not null check (char_length(utm_content) between 1 and 100),
  created_at  timestamptz not null default now()
);
create index if not exists ad_landings_created_at_idx on public.ad_landings (created_at);

create table if not exists public.ad_spend (
  id          bigint generated always as identity primary key,
  date        date          not null,
  utm_content text          not null check (char_length(utm_content) between 1 and 100),
  amount_aud  numeric(10,2) not null,
  created_at  timestamptz   not null default now(),
  updated_at  timestamptz   not null default now(),
  unique (date, utm_content)
);

alter table public.signup_attribution enable row level security;
alter table public.ad_landings        enable row level security;
alter table public.ad_spend           enable row level security;

revoke all on table public.signup_attribution from anon, authenticated;
revoke all on table public.ad_landings        from anon, authenticated;
revoke all on table public.ad_spend           from anon, authenticated;
revoke all on sequence public.ad_spend_id_seq from anon, authenticated;

-- Verification after applying (expect rls = true and no rows from the grants query):
--   select relname, relrowsecurity from pg_class
--    where relname in ('signup_attribution','ad_landings','ad_spend');
--   select table_name, grantee, privilege_type from information_schema.role_table_grants
--    where table_schema = 'public'
--      and table_name in ('signup_attribution','ad_landings','ad_spend')
--      and grantee in ('anon','authenticated');
