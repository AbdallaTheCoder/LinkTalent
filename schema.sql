CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. ENUM TYPES
DO $$ BEGIN
  CREATE TYPE public.work_arrangement AS ENUM ('onsite', 'hybrid', 'remote');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.proficiency_level AS ENUM ('beginner', 'intermediate', 'advanced', 'expert');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.evidence_status AS ENUM ('submitted', 'under_review', 'verified', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.opportunity_category AS ENUM ('employment', 'internship', 'fellowship', 'apprenticeship', 'remote_work');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.opportunity_status AS ENUM ('draft', 'published', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.application_status AS ENUM ('submitted', 'under_review', 'shortlisted', 'interview', 'accepted', 'rejected', 'withdrawn');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.mentorship_status AS ENUM ('pending', 'accepted', 'rejected', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.outcome_type AS ENUM ('employment', 'internship', 'fellowship', 'apprenticeship', 'remote_contract');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. TABLES (NORMAL DATABASE - NO auth.users DEPENDENCY)

-- 2.1 organisations (Employers)
CREATE TABLE IF NOT EXISTS public.organisations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(trim(name)) >= 2),
  contact_name TEXT,
  contact_email TEXT,
  sector TEXT,
  location TEXT,
  website TEXT,
  description TEXT,
  is_verified BOOLEAN NOT NULL DEFAULT TRUE,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.2 talent_profiles
CREATE TABLE IF NOT EXISTS public.talent_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL CHECK (char_length(trim(full_name)) >= 2),
  email TEXT,
  headline TEXT,
  summary TEXT,
  location TEXT,
  education TEXT,
  years_experience INTEGER NOT NULL DEFAULT 0 CHECK (years_experience >= 0 AND years_experience <= 60),
  sector TEXT,
  languages TEXT[] NOT NULL DEFAULT '{}',
  employment_history TEXT,
  career_interests TEXT,
  preferred_work_arrangement public.work_arrangement NOT NULL DEFAULT 'hybrid',
  availability TEXT,
  portfolio_url TEXT,
  allow_mentor_discovery BOOLEAN NOT NULL DEFAULT TRUE,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.3 skills
CREATE TABLE IF NOT EXISTS public.skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE CHECK (char_length(trim(name)) >= 1),
  category TEXT NOT NULL DEFAULT 'General',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.4 talent_skills
CREATE TABLE IF NOT EXISTS public.talent_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_profile_id UUID NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  proficiency public.proficiency_level NOT NULL DEFAULT 'intermediate',
  years_used INTEGER NOT NULL DEFAULT 1 CHECK (years_used >= 0 AND years_used <= 50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (talent_profile_id, skill_id)
);

-- 2.5 portfolio_items
CREATE TABLE IF NOT EXISTS public.portfolio_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_profile_id UUID NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(trim(title)) >= 2),
  description TEXT NOT NULL CHECK (char_length(trim(description)) >= 10),
  project_url TEXT,
  evidence_status public.evidence_status NOT NULL DEFAULT 'submitted',
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.6 opportunities
CREATE TABLE IF NOT EXISTS public.opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(trim(title)) >= 3),
  description TEXT NOT NULL CHECK (char_length(trim(description)) >= 20),
  category public.opportunity_category NOT NULL,
  sector TEXT NOT NULL DEFAULT 'General',
  min_experience_years INTEGER NOT NULL DEFAULT 0 CHECK (min_experience_years >= 0 AND min_experience_years <= 50),
  experience_requirements TEXT,
  location TEXT NOT NULL,
  work_arrangement public.work_arrangement NOT NULL DEFAULT 'hybrid',
  duration TEXT,
  compensation TEXT,
  application_deadline DATE,
  eligibility_criteria TEXT,
  status public.opportunity_status NOT NULL DEFAULT 'published',
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.7 opportunity_skills
CREATE TABLE IF NOT EXISTS public.opportunity_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (opportunity_id, skill_id)
);

-- 2.8 applications
CREATE TABLE IF NOT EXISTS public.applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  talent_profile_id UUID NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  cover_note TEXT,
  match_score INTEGER CHECK (match_score >= 0 AND match_score <= 100),
  status public.application_status NOT NULL DEFAULT 'submitted',
  employer_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (opportunity_id, talent_profile_id)
);

-- 2.9 mentor_profiles
CREATE TABLE IF NOT EXISTS public.mentor_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL CHECK (char_length(trim(full_name)) >= 2),
  email TEXT,
  headline TEXT,
  organisation_name TEXT,
  sector TEXT,
  location TEXT,
  expertise TEXT[] NOT NULL DEFAULT '{}',
  bio TEXT,
  availability TEXT,
  max_mentees INTEGER NOT NULL DEFAULT 3 CHECK (max_mentees >= 1 AND max_mentees <= 20),
  is_accepting_requests BOOLEAN NOT NULL DEFAULT TRUE,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.10 mentorship_requests
CREATE TABLE IF NOT EXISTS public.mentorship_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_profile_id UUID NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  mentor_profile_id UUID NOT NULL REFERENCES public.mentor_profiles(id) ON DELETE CASCADE,
  goal TEXT NOT NULL CHECK (char_length(trim(goal)) >= 5),
  message TEXT,
  status public.mentorship_status NOT NULL DEFAULT 'pending',
  mentor_response TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.11 outcome_records
CREATE TABLE IF NOT EXISTS public.outcome_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_profile_id UUID REFERENCES public.talent_profiles(id) ON DELETE SET NULL,
  organisation_id UUID REFERENCES public.organisations(id) ON DELETE SET NULL,
  opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE SET NULL,
  application_id UUID REFERENCES public.applications(id) ON DELETE SET NULL,
  outcome_type public.outcome_type NOT NULL,
  outcome_status TEXT NOT NULL DEFAULT 'confirmed' CHECK (outcome_status IN ('recorded', 'confirmed')),
  notes TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. INDEXES
CREATE INDEX IF NOT EXISTS idx_talent_profiles_sector ON public.talent_profiles(sector);
CREATE INDEX IF NOT EXISTS idx_talent_profiles_location ON public.talent_profiles(location);
CREATE INDEX IF NOT EXISTS idx_skills_name_lower ON public.skills(lower(name));
CREATE INDEX IF NOT EXISTS idx_talent_skills_talent ON public.talent_skills(talent_profile_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_items_talent ON public.portfolio_items(talent_profile_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_status_category ON public.opportunities(status, category);
CREATE INDEX IF NOT EXISTS idx_opportunities_org ON public.opportunities(organisation_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_skills_opp ON public.opportunity_skills(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_applications_opp ON public.applications(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_applications_talent ON public.applications(talent_profile_id);
CREATE INDEX IF NOT EXISTS idx_mentorship_requests_mentor ON public.mentorship_requests(mentor_profile_id, status);
CREATE INDEX IF NOT EXISTS idx_outcome_records_status ON public.outcome_records(outcome_status);

-- 4. PUBLIC IMPACT METRICS RPC
CREATE OR REPLACE FUNCTION public.get_public_impact_metrics()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'registered_talent', (SELECT COUNT(*) FROM public.talent_profiles),
    'registered_employers', (SELECT COUNT(*) FROM public.organisations),
    'registered_mentors', (SELECT COUNT(*) FROM public.mentor_profiles),
    'total_organisations', (SELECT COUNT(*) FROM public.organisations),
    'published_opportunities', (SELECT COUNT(*) FROM public.opportunities WHERE status = 'published'),
    'submitted_applications', (SELECT COUNT(*) FROM public.applications),
    'shortlisted_candidates', (SELECT COUNT(*) FROM public.applications WHERE status IN ('shortlisted', 'interview', 'accepted')),
    'active_mentorship_requests', (SELECT COUNT(*) FROM public.mentorship_requests WHERE status IN ('pending', 'accepted')),
    'completed_mentorships', (SELECT COUNT(*) FROM public.mentorship_requests WHERE status = 'completed'),
    'verified_portfolio_items', (SELECT COUNT(*) FROM public.portfolio_items WHERE evidence_status = 'verified'),
    'recorded_employment_outcomes', (SELECT COUNT(*) FROM public.outcome_records WHERE outcome_status = 'confirmed'),
    'accepted_applications', (SELECT COUNT(*) FROM public.applications WHERE status = 'accepted')
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_impact_metrics() TO anon, authenticated;

-- 5. UPDATED_AT TRIGGERS

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'organisations', 'talent_profiles', 'talent_skills',
    'portfolio_items', 'opportunities', 'applications',
    'mentor_profiles', 'mentorship_requests', 'outcome_records'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I;', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();',
      t, t
    );
  END LOOP;
END $$;

-- 6. OPEN HACKATHON SHOWCASE ACCESS (NO LOGIN REQUIRED)
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

ALTER TABLE public.organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talent_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talent_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunity_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentorship_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outcome_records ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'organisations', 'talent_profiles', 'skills', 'talent_skills',
    'portfolio_items', 'opportunities', 'opportunity_skills',
    'applications', 'mentor_profiles', 'mentorship_requests', 'outcome_records'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "showcase_open_%I" ON public.%I;', t, t);
    EXECUTE format(
      'CREATE POLICY "showcase_open_%I" ON public.%I FOR ALL TO anon, authenticated USING (TRUE) WITH CHECK (TRUE);',
      t, t
    );
  END LOOP;
END $$;
