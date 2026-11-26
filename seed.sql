BEGIN;

-- 1. SKILLS TAXONOMY 

INSERT INTO public.skills (name, category)
VALUES
  ('JavaScript', 'Software Development'),
  ('PostgreSQL', 'Software Development'),
  ('Python', 'Data & Analytics'),
  ('SQL Analytics', 'Data & Analytics'),
  ('KoboToolbox', 'Humanitarian & M&E'),
  ('Monitoring & Evaluation', 'Humanitarian & M&E'),
  ('Figma', 'Design'),
  ('UI/UX Design', 'Design'),
  ('Solar PV Installation', 'Clean Energy'),
  ('Off-Grid Mini-Grids', 'Clean Energy'),
  ('Customer Support (CRM)', 'Digital Operations'),
  ('Cloud Fundamentals (Azure)', 'Digital Operations')
ON CONFLICT (name) DO NOTHING;

-- 2. ORGANISATIONS / EMPLOYERS
INSERT INTO public.organisations (
  id, name, contact_name, contact_email, sector, location, website, description, is_verified, is_demo
)
VALUES
  ('20000000-0000-4000-8000-000000000001',
   'Savanna Cloud Systems', 'David Ochieng', 'david@savannacloud.example.org',
   'Technology', 'Nairobi, Kenya', 'https://savannacloud.example.org',
   'East African SaaS engineering firm building cloud infrastructure and civic software with distributed teams.',
   TRUE, TRUE),

  ('20000000-0000-4000-8000-000000000002',
   'Nairobi Digital Craft Studio', 'Kevin Kamau', 'kevin@digitalcraft.example.org',
   'Design & Digital Media', 'Nairobi, Kenya', 'https://digitalcraft.example.org',
   'Independent product design and brand studio partnering with startups and NGOs on accessible web interfaces.',
   TRUE, TRUE),

  ('20000000-0000-4000-8000-000000000003',
   'Rift Valley Solar & AgriTech', 'Beatrice Chebet', 'beatrice@riftvalleysolar.example.org',
   'Clean Energy', 'Nakuru & Turkana, Kenya', 'https://riftvalleysolar.example.org',
   'Social enterprise deploying off-grid solar mini-grids and solar-powered irrigation across rural settlements.',
   TRUE, TRUE),

  ('20000000-0000-4000-8000-000000000004',
   'East Africa Humanitarian Analytics', 'Josephine Mutua', 'josephine@eahanalytics.example.org',
   'Humanitarian & Development', 'Nairobi, Kenya', 'https://eahanalytics.example.org',
   'Applied research and monitoring partner supporting livelihoods, education, and inclusive labor market programs.',
   TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

-- 3. TALENT PROFILES 
INSERT INTO public.talent_profiles (
  id, full_name, email, headline, summary, location, education, years_experience,
  sector, languages, employment_history, career_interests,
  preferred_work_arrangement, availability, portfolio_url, allow_mentor_discovery, is_demo
)
VALUES
  ('40000000-0000-4000-8000-000000000001',
   'Abdirahman Farah', 'abdirahman@demo.org',
   'Full-Stack JavaScript & PostgreSQL Developer',
   'Self-driven web developer experienced in building responsive applications with JavaScript, HTML/CSS, and PostgreSQL for community organizations.',
   'Kakuma, Kenya',
   'Diploma in Software Development - Power Learn Project',
   3, 'Technology', ARRAY['English', 'Somali', 'Swahili'],
   'Built operational tracking tools and inventory web apps for local community businesses (2023-2026).',
   'Junior to mid-level full-stack engineering and remote SaaS roles.',
   'remote', 'Immediate', 'https://github.com/abdirahman-dev-demo', TRUE, TRUE),

  ('40000000-0000-4000-8000-000000000002',
   'Halima Osman', 'halima@demo.org',
   'Remote Customer Operations & Cloud Support Associate',
   'Detail-oriented bilingual communicator skilled in CRM ticketing, technical troubleshooting, and digital onboarding.',
   'Dadaab, Kenya',
   'Certificate in Digital Literacy & Azure Fundamentals (AZ-900)',
   1, 'Digital Operations', ARRAY['Somali', 'English', 'Swahili'],
   'Community helpdesk coordinator and digital literacy peer tutor (2025-2026).',
   'Remote customer support and entry-level cloud operations.',
   'remote', 'Immediate', 'https://halima-ops.example.org', TRUE, TRUE),

  ('40000000-0000-4000-8000-000000000003',
   'Nyabol Gatluak', 'nyabol@demo.org',
   'Monitoring, Evaluation & Data Analyst (SQL & Python)',
   'Quantitative analyst specializing in household survey design, KoboToolbox pipelines, and SQL data cleaning.',
   'Nairobi, Kenya',
   'BSc in Statistics & Data Analytics Certificate',
   4, 'Humanitarian & Development', ARRAY['English', 'Arabic', 'Nuer', 'Swahili'],
   'Field Data Enumerator and M&E Assistant for inclusive livelihood assessments (2022-2026).',
   'Data analytics fellowships and M&E officer roles.',
   'hybrid', '2 weeks notice', 'https://nyabol-analytics.example.org', TRUE, TRUE),

  ('40000000-0000-4000-8000-000000000004',
   'Dawit Tesfaye', 'dawit@demo.org',
   'Certified Solar PV Installation & Mini-Grid Technician',
   'Hands-on electrical and solar energy technician with five years maintaining off-grid solar arrays and water pumps.',
   'Kakuma, Kenya',
   'NITA Grade II Electrical Wireman & EPRA T2 Solar PV Training',
   5, 'Clean Energy', ARRAY['Amharic', 'English', 'Swahili'],
   'Lead technician for community solar kiosks and borehole pump electrification (2021-2026).',
   'Solar field engineering and clean energy apprenticeships.',
   'onsite', 'Immediate', NULL, TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

-- 4. TALENT SKILLS
INSERT INTO public.talent_skills (talent_profile_id, skill_id, proficiency, years_used)
SELECT v.tp_id, s.id, v.prof::public.proficiency_level, v.yrs
FROM (VALUES
  ('40000000-0000-4000-8000-000000000001'::uuid, 'JavaScript', 'advanced', 3),
  ('40000000-0000-4000-8000-000000000001'::uuid, 'PostgreSQL', 'intermediate', 2),
  ('40000000-0000-4000-8000-000000000002'::uuid, 'Customer Support (CRM)', 'intermediate', 1),
  ('40000000-0000-4000-8000-000000000002'::uuid, 'Cloud Fundamentals (Azure)', 'beginner', 1),
  ('40000000-0000-4000-8000-000000000003'::uuid, 'Python', 'intermediate', 2),
  ('40000000-0000-4000-8000-000000000003'::uuid, 'SQL Analytics', 'advanced', 3),
  ('40000000-0000-4000-8000-000000000003'::uuid, 'KoboToolbox', 'expert', 4),
  ('40000000-0000-4000-8000-000000000003'::uuid, 'Monitoring & Evaluation', 'expert', 4),
  ('40000000-0000-4000-8000-000000000004'::uuid, 'Solar PV Installation', 'expert', 5),
  ('40000000-0000-4000-8000-000000000004'::uuid, 'Off-Grid Mini-Grids', 'advanced', 4)
) AS v(tp_id, skill_name, prof, yrs)
JOIN public.skills s ON s.name = v.skill_name
ON CONFLICT (talent_profile_id, skill_id) DO NOTHING;

-- 5. PORTFOLIO ITEMS 
INSERT INTO public.portfolio_items (id, talent_profile_id, title, description, project_url, evidence_status, review_notes)
VALUES
  ('60000000-0000-4000-8000-000000000001',
   '40000000-0000-4000-8000-000000000001',
   'Community Cooperative Inventory Portal',
   'Built a role-based web portal with JavaScript and PostgreSQL to track daily sales and inventory levels.',
   'https://github.com/abdirahman-dev-demo/coop-portal',
   'verified', 'Verified repository ownership and SQL schema.'),

  ('60000000-0000-4000-8000-000000000002',
   '40000000-0000-4000-8000-000000000003',
   'Turkana Youth Livelihoods Dashboard',
   'Analyzed 1,400 anonymized household survey responses collected via KoboToolbox to map training outcomes.',
   'https://nyabol-analytics.example.org/turkana-dashboard',
   'verified', 'Methodology and data anonymization verified.'),

  ('60000000-0000-4000-8000-000000000003',
   '40000000-0000-4000-8000-000000000002',
   'Azure Fundamentals (AZ-900) Onboarding Playbook',
   'Documented a remote helpdesk escalation playbook and cloud onboarding checklist for distributed teams.',
   'https://halima-ops.example.org/az900-playbook',
   'under_review', NULL),

  ('60000000-0000-4000-8000-000000000004',
   '40000000-0000-4000-8000-000000000004',
   '12kW Solar Borehole Pump Commissioning Log',
   'Led installation, load testing, and maintenance documentation for a community solar water pumping station.',
   NULL,
   'under_review', NULL)
ON CONFLICT (id) DO NOTHING;

-- 6. MENTOR PROFILES 

INSERT INTO public.mentor_profiles (
  id, full_name, email, headline, organisation_name, sector, location,
  expertise, bio, availability, max_mentees, is_accepting_requests, is_demo
)
VALUES
  ('30000000-0000-4000-8000-000000000001',
   'Grace Wanjiku', 'grace.mentor@demo.org',
   'Staff Software Engineer & Technical Interview Coach',
   'Safaricom Digital Labs', 'Technology', 'Nairobi, Kenya',
   ARRAY['JavaScript', 'PostgreSQL', 'GitHub Portfolios', 'Technical Interviews'],
   'Ten years building scalable web platforms across East Africa. Mentors emerging developers into remote and local engineering roles.',
   '2 hours/week (Tue & Thu evenings EAT)', 4, TRUE, TRUE),

  ('30000000-0000-4000-8000-000000000002',
   'Samuel Deng', 'samuel.mentor@demo.org',
   'Regional M&E and Data Science Lead',
   'East Africa Livelihoods Initiative', 'Humanitarian & Development', 'Kampala, Uganda (Remote)',
   ARRAY['SQL Analytics', 'Python', 'KoboToolbox', 'Impact Evaluation'],
   'Leads regional data teams measuring youth employment outcomes. Helps analysts turn field experience into analytical portfolios.',
   '1.5 hours/week (Saturdays EAT)', 3, TRUE, TRUE),

  ('30000000-0000-4000-8000-000000000003',
   'Farah Abdi', 'farah.mentor@demo.org',
   'Renewable Energy Operations & Licensing Advisor',
   'SunGrid East Africa', 'Clean Energy', 'Nairobi, Kenya',
   ARRAY['Solar PV Installation', 'Off-Grid Mini-Grids', 'EPRA Licensing', 'Field Safety'],
   'Advises technicians transitioning from informal solar repairs into certified commercial mini-grid operations.',
   '1 hour/week (Wednesdays EAT)', 2, TRUE, TRUE),

  ('30000000-0000-4000-8000-000000000004',
   'Lydia Mwangi', 'lydia.mentor@demo.org',
   'Senior Product Designer & Career Coach',
   'Nairobi Design Collective', 'Design & Digital Media', 'Nairobi, Kenya',
   ARRAY['Figma', 'UI/UX Design', 'Portfolio Reviews', 'Design Systems'],
   'Supports emerging UI/UX designers with accessible design critiques and portfolio storytelling.',
   '2 hours/week (Fridays EAT)', 3, TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

-- 7. OPPORTUNITIES 

INSERT INTO public.opportunities (
  id, organisation_id, title, description, category, sector, min_experience_years,
  experience_requirements, location, work_arrangement, duration, compensation,
  application_deadline, eligibility_criteria, status, is_demo
)
VALUES
  -- Category 1: employment (2)
  ('50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   'Customer Support & Cloud Onboarding Associate',
   'Provide responsive email and chat support for SaaS clients, document troubleshooting steps, and assist with cloud account onboarding.',
   'employment', 'Digital Operations', 1,
   'Strong written English, familiarity with CRM tools, and foundational cloud knowledge.',
   'Nairobi, Kenya', 'hybrid', 'Full-time permanent', 'KES 70,000 / month',
   (CURRENT_DATE + 30)::DATE, 'Open to candidates nationwide; multilingual skills are an advantage.', 'published', TRUE),

  ('50000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003',
   'Community Solar Operations Technician',
   'Install, commission, and maintain off-grid solar cold-storage units for smallholder and market cooperatives.',
   'employment', 'Clean Energy', 3,
   'NITA electrical certification and off-grid inverter troubleshooting experience.',
   'Kakuma, Kenya', 'onsite', 'Full-time', 'KES 75,000 / month',
   (CURRENT_DATE + 25)::DATE, 'Certified technicians residing in or willing to relocate to Turkana County.', 'published', TRUE),

  -- Category 2: internship (2)
  ('50000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002',
   'Product Design Intern (UI/UX & Accessibility)',
   'Collaborate with product designers to build Figma component libraries, run usability tests, and improve mobile web accessibility.',
   'internship', 'Design & Digital Media', 0,
   'At least one documented UI/UX case study in Figma.',
   'Nairobi, Kenya', 'hybrid', '4-month paid internship', 'KES 45,000 / month',
   (CURRENT_DATE + 40)::DATE, 'Open to emerging designers interested in inclusive digital products.', 'published', TRUE),

  ('50000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001',
   'Backend PostgreSQL & API Engineering Intern',
   'Learn production database modeling, SQL query optimization, and REST API testing alongside senior backend engineers.',
   'internship', 'Technology', 0,
   'Foundational knowledge of SQL and JavaScript.',
   'Nairobi, Kenya', 'hybrid', '6-month paid internship', 'KES 50,000 / month',
   (CURRENT_DATE + 35)::DATE, 'Open to bootcamp graduates and self-taught developers.', 'published', TRUE),

  -- Category 3: fellowship (2)
  ('50000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000004',
   'Livelihoods Data & M&E Fellow',
   'Work alongside senior researchers to clean KoboToolbox survey datasets, automate SQL validation queries, and publish quarterly impact reports.',
   'fellowship', 'Humanitarian & Development', 2,
   'Hands-on experience with household survey tools, SQL, or Python.',
   'Nairobi, Kenya', 'hybrid', '9-month paid fellowship', 'KES 85,000 / month',
   (CURRENT_DATE + 28)::DATE, 'Open to early-career analysts with refugee or host-community backgrounds.', 'published', TRUE),

  ('50000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000004',
   'Civic Tech & Open Data Research Fellow',
   'Analyze regional labor market datasets in Python and build open-access visualizations for partner NGOs.',
   'fellowship', 'Humanitarian & Development', 1,
   'Experience with Python data analysis and impact reporting.',
   'Nairobi, Kenya (Hybrid)', 'hybrid', '6-month fellowship', 'KES 80,000 / month',
   (CURRENT_DATE + 32)::DATE, 'Open to quantitative graduates and community researchers.', 'published', TRUE),

  -- Category 4: apprenticeship (2)
  ('50000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000003',
   'Solar Mini-Grid Field Technician Apprentice',
   'Support installation, diagnostics, and routine maintenance of 15kW-50kW community solar mini-grids across Turkana and Nakuru.',
   'apprenticeship', 'Clean Energy', 1,
   'Basic electrical wiring certification or practical solar PV repair background.',
   'Kakuma & Lodwar, Kenya', 'onsite', '6-month apprenticeship', 'KES 55,000 / month',
   (CURRENT_DATE + 20)::DATE, 'Priority given to technicians residing in Kakuma and Turkana.', 'published', TRUE),

  ('50000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000002',
   'Digital Accessibility & Web Production Apprentice',
   'Shadow senior front-end designers to audit websites for WCAG accessibility and build responsive UI components.',
   'apprenticeship', 'Design & Digital Media', 0,
   'Interest in UI/UX Design and basic Figma familiarity.',
   'Nairobi, Kenya', 'hybrid', '6-month apprenticeship', 'KES 48,000 / month',
   (CURRENT_DATE + 45)::DATE, 'Open to creative youth and career-switchers.', 'published', TRUE),

  -- Category 5: remote_work (2)
  ('50000000-0000-4000-8000-000000000009', '20000000-0000-4000-8000-000000000001',
   'Junior Full-Stack Web Developer (Remote)',
   'Join our engineering squad building modular web applications, PostgreSQL schemas, and REST integrations for East African SMEs.',
   'remote_work', 'Technology', 2,
   'Proven portfolio projects in JavaScript and PostgreSQL.',
   'Remote (East Africa)', 'remote', '12-month renewable contract', 'KES 120,000 / month',
   (CURRENT_DATE + 35)::DATE, 'Open to developers across Kenya and Uganda with reliable internet.', 'published', TRUE),

  ('50000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000001',
   'Remote Cloud Helpdesk & CRM Specialist',
   'Manage distributed client support queues, troubleshoot cloud permissions, and maintain knowledge base articles.',
   'remote_work', 'Digital Operations', 1,
   'CRM ticketing experience and Azure or cloud fundamentals.',
   'Remote (Kenya)', 'remote', '12-month remote contract', 'KES 78,000 / month',
   (CURRENT_DATE + 30)::DATE, 'Open to bilingual remote candidates nationwide.', 'published', TRUE)
ON CONFLICT (id) DO NOTHING;

-- 8. OPPORTUNITY SKILLS

INSERT INTO public.opportunity_skills (opportunity_id, skill_id, is_required)
SELECT v.opp_id::uuid, s.id, v.req
FROM (VALUES
  ('50000000-0000-4000-8000-000000000001', 'Customer Support (CRM)', TRUE),
  ('50000000-0000-4000-8000-000000000001', 'Cloud Fundamentals (Azure)', FALSE),
  ('50000000-0000-4000-8000-000000000002', 'Solar PV Installation', TRUE),
  ('50000000-0000-4000-8000-000000000002', 'Off-Grid Mini-Grids', TRUE),
  ('50000000-0000-4000-8000-000000000003', 'Figma', TRUE),
  ('50000000-0000-4000-8000-000000000003', 'UI/UX Design', TRUE),
  ('50000000-0000-4000-8000-000000000004', 'PostgreSQL', TRUE),
  ('50000000-0000-4000-8000-000000000004', 'JavaScript', TRUE),
  ('50000000-0000-4000-8000-000000000005', 'SQL Analytics', TRUE),
  ('50000000-0000-4000-8000-000000000005', 'KoboToolbox', TRUE),
  ('50000000-0000-4000-8000-000000000005', 'Monitoring & Evaluation', TRUE),
  ('50000000-0000-4000-8000-000000000006', 'Python', TRUE),
  ('50000000-0000-4000-8000-000000000006', 'SQL Analytics', FALSE),
  ('50000000-0000-4000-8000-000000000007', 'Solar PV Installation', TRUE),
  ('50000000-0000-4000-8000-000000000007', 'Off-Grid Mini-Grids', FALSE),
  ('50000000-0000-4000-8000-000000000008', 'UI/UX Design', TRUE),
  ('50000000-0000-4000-8000-000000000008', 'Figma', FALSE),
  ('50000000-0000-4000-8000-000000000009', 'JavaScript', TRUE),
  ('50000000-0000-4000-8000-000000000009', 'PostgreSQL', TRUE),
  ('50000000-0000-4000-8000-000000000010', 'Customer Support (CRM)', TRUE),
  ('50000000-0000-4000-8000-000000000010', 'Cloud Fundamentals (Azure)', TRUE)
) AS v(opp_id, skill_name, req)
JOIN public.skills s ON s.name = v.skill_name
ON CONFLICT (opportunity_id, skill_id) DO NOTHING;

-- 9. APPLICATIONS 
INSERT INTO public.applications (id, opportunity_id, talent_profile_id, cover_note, match_score, status, employer_notes)
VALUES
  ('71000000-0000-4000-8000-000000000001',
   '50000000-0000-4000-8000-000000000009', '40000000-0000-4000-8000-000000000001',
   'Built production JavaScript and PostgreSQL apps for community cooperatives.',
   94, 'accepted', 'Strong verified portfolio and clean technical interview.'),

  ('71000000-0000-4000-8000-000000000002',
   '50000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000003',
   'Over four years managing KoboToolbox surveys and SQL reporting.',
   92, 'accepted', 'Top-scoring candidate in SQL assessment.'),

  ('71000000-0000-4000-8000-000000000003',
   '50000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000002',
   'Combining my AZ-900 certification with trilingual helpdesk experience.',
   88, 'shortlisted', 'Shortlisted for written customer-response simulation.'),

  ('71000000-0000-4000-8000-000000000004',
   '50000000-0000-4000-8000-000000000007', '40000000-0000-4000-8000-000000000004',
   'Certified NITA Grade II technician ready to mentor incoming apprentices.',
   96, 'interview', 'Scheduled for field safety & commissioning review.')
ON CONFLICT (opportunity_id, talent_profile_id) DO NOTHING;

-- 10. MENTORSHIP REQUESTS 

INSERT INTO public.mentorship_requests (id, talent_profile_id, mentor_profile_id, goal, message, status, mentor_response)
VALUES
  ('70000000-0000-4000-8000-000000000001',
   '40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
   'Prepare for full-stack technical interviews and PostgreSQL reviews',
   'Looking for mock interview practice ahead of remote engineering roles.',
   'completed', 'Completed four sessions covering system design and SQL indexing.'),

  ('70000000-0000-4000-8000-000000000002',
   '40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000002',
   'Strengthen Python automation for humanitarian M&E pipelines',
   'Want to automate KoboToolbox cleaning scripts using Python pandas.',
   'accepted', 'Glad to work together during our Saturday check-in.'),

  ('70000000-0000-4000-8000-000000000003',
   '40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000003',
   'Navigate EPRA T2 commercial solar licensing requirements',
   'Need advice on logging field hours for commercial solar licensing.',
   'pending', NULL),

  ('70000000-0000-4000-8000-000000000004',
   '40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000004',
   'Transition from customer support into digital product accessibility',
   'Interested in learning Figma basics and user research.',
   'pending', NULL)
ON CONFLICT (id) DO NOTHING;

-- 11. OUTCOME RECORDS

INSERT INTO public.outcome_records (
  id, talent_profile_id, organisation_id, opportunity_id, application_id,
  outcome_type, outcome_status, notes, recorded_at, is_demo
)
VALUES
  ('80000000-0000-4000-8000-000000000001',
   '40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   '50000000-0000-4000-8000-000000000009', '71000000-0000-4000-8000-000000000001',
   'remote_contract', 'confirmed',
   'Signed 12-month remote engineering contract after mentorship and portfolio verification.',
   NOW() - INTERVAL '3 days', TRUE),

  ('80000000-0000-4000-8000-000000000002',
   '40000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000004',
   '50000000-0000-4000-8000-000000000005', '71000000-0000-4000-8000-000000000002',
   'fellowship', 'confirmed',
   'Confirmed start date for 9-month paid Livelihoods Data & M&E Fellowship in Nairobi.',
   NOW() - INTERVAL '5 days', TRUE)
ON CONFLICT (id) DO NOTHING;

COMMIT;

SELECT public.get_public_impact_metrics();
