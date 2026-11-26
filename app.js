import { getSupabase, isSupabaseConfigured } from "./config.js";

const STORAGE_KEY = "talentlink_hackathon_db_v1";

const state = {
  mode: "local", // "supabase" | "local"
  skills: [],
  organisations: [],
  talents: [],
  opportunities: [],
  mentors: [],
  applications: [],
  mentorshipRequests: [],
  outcomes: [],
  impact: null,
};

// UTILITIES

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "id-" + Math.random().toString(36).slice(2, 11) + "-" + Date.now();
}

function parseCsvList(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function formatCategory(cat) {
  return String(cat || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(iso) {
  if (!iso) return "Open";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function statusBadge(status) {
  const map = {
    published: "badge-green",
    submitted: "badge-navy",
    under_review: "badge-amber",
    shortlisted: "badge-teal",
    interview: "badge-teal",
    accepted: "badge-green",
    rejected: "badge-red",
    withdrawn: "badge-red",
    pending: "badge-amber",
    completed: "badge-green",
    verified: "badge-green",
    confirmed: "badge-green",
    recorded: "badge-teal",
  };
  const cls = map[status] || "badge-navy";
  return `<span class="badge ${cls}">${escapeHtml(String(status || "").replace(/_/g, " "))}</span>`;
}

function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type === "error" ? "toast-error" : type === "success" ? "toast-success" : ""}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.2s ease";
    setTimeout(() => toast.remove(), 220);
  }, 3600);
}

function openModal(id) {
  document.getElementById(id)?.classList.remove("hidden");
}

function closeModal(id) {
  document.getElementById(id)?.classList.add("hidden");
}

function openDetailModal(title, bodyHtml) {
  const t = document.getElementById("detail-modal-title");
  const b = document.getElementById("detail-modal-body");
  if (t) t.textContent = title;
  if (b) b.innerHTML = bodyHtml;
  openModal("detail-modal");
}


// MATCH ENGINE (ADVISORY SCORING)

const PROFICIENCY_WEIGHT = {
  beginner: 0.55,
  intermediate: 0.78,
  advanced: 0.92,
  expert: 1.0,
};

function computeMatchBreakdown(talentProfile, talentSkills = [], opportunity, opportunitySkills = []) {
  const oppSkillList = Array.isArray(opportunitySkills) ? opportunitySkills : [];
  const talSkillList = Array.isArray(talentSkills) ? talentSkills : [];

  const talentSkillMap = new Map();
  for (const ts of talSkillList) {
    const skillId = ts.skill_id || ts.skills?.id;
    if (skillId) {
      talentSkillMap.set(skillId, {
        name: ts.skills?.name || "",
        proficiency: ts.proficiency || "intermediate",
      });
    }
  }

  let skillScore = 65;
  const matchedSkills = [];
  const missingRequiredSkills = [];

  if (oppSkillList.length > 0) {
    let earnedWeight = 0;
    let totalWeight = 0;
    for (const os of oppSkillList) {
      const skillId = os.skill_id || os.skills?.id;
      const skillName = os.skills?.name || "Skill";
      const weight = os.is_required ? 2 : 1;
      totalWeight += weight;

      const match = talentSkillMap.get(skillId);
      if (match) {
        const profFactor = PROFICIENCY_WEIGHT[match.proficiency] ?? 0.78;
        earnedWeight += weight * profFactor;
        matchedSkills.push(skillName);
      } else if (os.is_required) {
        missingRequiredSkills.push(skillName);
      }
    }
    skillScore = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 70;
  }

  const oppSector = (opportunity.sector || "").trim().toLowerCase();
  const talSector = (talentProfile?.sector || "").trim().toLowerCase();
  let sectorScore = 60;
  if (!oppSector || oppSector === "general") sectorScore = 75;
  else if (talSector && (talSector === oppSector || talSector.includes(oppSector) || oppSector.includes(talSector))) {
    sectorScore = 100;
  }

  const reqYears = Number(opportunity.min_experience_years || 0);
  const talYears = Number(talentProfile?.years_experience || 0);
  const expScore = reqYears <= 0 || talYears >= reqYears ? 100 : Math.max(25, Math.round((talYears / reqYears) * 85));

  let arrangementScore = 75;
  if (opportunity.work_arrangement && talentProfile?.preferred_work_arrangement === opportunity.work_arrangement) {
    arrangementScore = 100;
  } else if (opportunity.work_arrangement === "remote" || talentProfile?.preferred_work_arrangement === "remote") {
    arrangementScore = 85;
  }

  const score = Math.max(
    0,
    Math.min(100, Math.round(skillScore * 0.55 + sectorScore * 0.2 + expScore * 0.15 + arrangementScore * 0.1))
  );

  return {
    score,
    matchedSkills,
    missingRequiredSkills,
    summary: `${matchedSkills.length} of ${oppSkillList.length} listed skills matched${talYears >= reqYears ? "; experience requirement met" : ""}.`,
  };
}

// LOCAL FALLBACK SEED DATA (MIRRORS seed.sql: 2 PER CATEGORY)

function buildInitialLocalSeed() {
  const skills = [
    { id: "sk-1", name: "JavaScript", category: "Software Development" },
    { id: "sk-2", name: "PostgreSQL", category: "Software Development" },
    { id: "sk-3", name: "Python", category: "Data & Analytics" },
    { id: "sk-4", name: "SQL Analytics", category: "Data & Analytics" },
    { id: "sk-5", name: "KoboToolbox", category: "Humanitarian & M&E" },
    { id: "sk-6", name: "Monitoring & Evaluation", category: "Humanitarian & M&E" },
    { id: "sk-7", name: "Figma", category: "Design" },
    { id: "sk-8", name: "UI/UX Design", category: "Design" },
    { id: "sk-9", name: "Solar PV Installation", category: "Clean Energy" },
    { id: "sk-10", name: "Off-Grid Mini-Grids", category: "Clean Energy" },
    { id: "sk-11", name: "Customer Support (CRM)", category: "Digital Operations" },
    { id: "sk-12", name: "Cloud Fundamentals (Azure)", category: "Digital Operations" },
  ];

  const skillByName = Object.fromEntries(skills.map((s) => [s.name, s]));

  const organisations = [
    { id: "org-1", name: "Savanna Cloud Systems", contact_name: "David Ochieng", sector: "Technology", location: "Nairobi, Kenya", is_verified: true },
    { id: "org-2", name: "Nairobi Digital Craft Studio", contact_name: "Kevin Kamau", sector: "Design & Digital Media", location: "Nairobi, Kenya", is_verified: true },
    { id: "org-3", name: "Rift Valley Solar & AgriTech", contact_name: "Beatrice Chebet", sector: "Clean Energy", location: "Nakuru & Turkana, Kenya", is_verified: true },
    { id: "org-4", name: "East Africa Humanitarian Analytics", contact_name: "Josephine Mutua", sector: "Humanitarian & Development", location: "Nairobi, Kenya", is_verified: true },
  ];
  const orgById = Object.fromEntries(organisations.map((o) => [o.id, o]));

  const talents = [
    {
      id: "tal-1",
      full_name: "Abdirahman Farah",
      email: "abdirahman@demo.org",
      headline: "Full-Stack JavaScript & PostgreSQL Developer",
      summary: "Self-driven web developer experienced in building responsive applications with JavaScript and PostgreSQL.",
      location: "Kakuma, Kenya",
      education: "Diploma in Software Development - Power Learn Project",
      years_experience: 3,
      sector: "Technology",
      languages: ["English", "Somali", "Swahili"],
      preferred_work_arrangement: "remote",
      availability: "Immediate",
      portfolio_url: "https://github.com/abdirahman-dev-demo",
      talent_skills: [
        { skill_id: "sk-1", proficiency: "advanced", years_used: 3, skills: skillByName["JavaScript"] },
        { skill_id: "sk-2", proficiency: "intermediate", years_used: 2, skills: skillByName["PostgreSQL"] },
      ],
      portfolio_items: [
        { id: "pi-1", title: "Community Cooperative Inventory Portal", evidence_status: "verified", project_url: "https://github.com/abdirahman-dev-demo/coop-portal" },
      ],
    },
    {
      id: "tal-2",
      full_name: "Halima Osman",
      email: "halima@demo.org",
      headline: "Remote Customer Operations & Cloud Support Associate",
      summary: "Bilingual communicator skilled in CRM ticketing, technical troubleshooting, and digital onboarding.",
      location: "Dadaab, Kenya",
      education: "Certificate in Digital Literacy & Azure Fundamentals (AZ-900)",
      years_experience: 1,
      sector: "Digital Operations",
      languages: ["Somali", "English", "Swahili"],
      preferred_work_arrangement: "remote",
      availability: "Immediate",
      portfolio_url: "https://halima-ops.example.org",
      talent_skills: [
        { skill_id: "sk-11", proficiency: "intermediate", years_used: 1, skills: skillByName["Customer Support (CRM)"] },
        { skill_id: "sk-12", proficiency: "beginner", years_used: 1, skills: skillByName["Cloud Fundamentals (Azure)"] },
      ],
      portfolio_items: [
        { id: "pi-3", title: "Azure Fundamentals Onboarding Playbook", evidence_status: "under_review", project_url: "https://halima-ops.example.org/az900-playbook" },
      ],
    },
    {
      id: "tal-3",
      full_name: "Nyabol Gatluak",
      email: "nyabol@demo.org",
      headline: "Monitoring, Evaluation & Data Analyst (SQL & Python)",
      summary: "Quantitative analyst specializing in household survey design, KoboToolbox pipelines, and SQL cleaning.",
      location: "Nairobi, Kenya",
      education: "BSc in Statistics & Data Analytics Certificate",
      years_experience: 4,
      sector: "Humanitarian & Development",
      languages: ["English", "Arabic", "Nuer", "Swahili"],
      preferred_work_arrangement: "hybrid",
      availability: "2 weeks notice",
      portfolio_url: "https://nyabol-analytics.example.org",
      talent_skills: [
        { skill_id: "sk-3", proficiency: "intermediate", years_used: 2, skills: skillByName["Python"] },
        { skill_id: "sk-4", proficiency: "advanced", years_used: 3, skills: skillByName["SQL Analytics"] },
        { skill_id: "sk-5", proficiency: "expert", years_used: 4, skills: skillByName["KoboToolbox"] },
        { skill_id: "sk-6", proficiency: "expert", years_used: 4, skills: skillByName["Monitoring & Evaluation"] },
      ],
      portfolio_items: [
        { id: "pi-2", title: "Turkana Youth Livelihoods Dashboard", evidence_status: "verified", project_url: "https://nyabol-analytics.example.org/turkana-dashboard" },
      ],
    },
    {
      id: "tal-4",
      full_name: "Dawit Tesfaye",
      email: "dawit@demo.org",
      headline: "Certified Solar PV Installation & Mini-Grid Technician",
      summary: "Electrical and solar energy technician with five years maintaining off-grid solar arrays and water pumps.",
      location: "Kakuma, Kenya",
      education: "NITA Grade II Electrical Wireman & EPRA T2 Solar PV Training",
      years_experience: 5,
      sector: "Clean Energy",
      languages: ["Amharic", "English", "Swahili"],
      preferred_work_arrangement: "onsite",
      availability: "Immediate",
      portfolio_url: "",
      talent_skills: [
        { skill_id: "sk-9", proficiency: "expert", years_used: 5, skills: skillByName["Solar PV Installation"] },
        { skill_id: "sk-10", proficiency: "advanced", years_used: 4, skills: skillByName["Off-Grid Mini-Grids"] },
      ],
      portfolio_items: [
        { id: "pi-4", title: "12kW Solar Borehole Commissioning Log", evidence_status: "under_review", project_url: "" },
      ],
    },
  ];

  const makeOppSkills = (names) =>
    names.map((n, idx) => ({ skill_id: skillByName[n].id, is_required: idx === 0, skills: skillByName[n] }));

  const opportunities = [
    { id: "opp-1", organisation_id: "org-1", organisations: orgById["org-1"], title: "Customer Support & Cloud Onboarding Associate", description: "Provide responsive email and chat support for SaaS clients and assist with cloud account onboarding.", category: "employment", sector: "Digital Operations", min_experience_years: 1, location: "Nairobi, Kenya", work_arrangement: "hybrid", duration: "Full-time permanent", compensation: "KES 70,000 / month", status: "published", opportunity_skills: makeOppSkills(["Customer Support (CRM)", "Cloud Fundamentals (Azure)"]) },
    { id: "opp-2", organisation_id: "org-3", organisations: orgById["org-3"], title: "Community Solar Operations Technician", description: "Install, commission, and maintain off-grid solar cold-storage units for smallholder cooperatives.", category: "employment", sector: "Clean Energy", min_experience_years: 3, location: "Kakuma, Kenya", work_arrangement: "onsite", duration: "Full-time", compensation: "KES 75,000 / month", status: "published", opportunity_skills: makeOppSkills(["Solar PV Installation", "Off-Grid Mini-Grids"]) },
    { id: "opp-3", organisation_id: "org-2", organisations: orgById["org-2"], title: "Product Design Intern (UI/UX & Accessibility)", description: "Build Figma component libraries, run usability tests, and improve mobile web accessibility.", category: "internship", sector: "Design & Digital Media", min_experience_years: 0, location: "Nairobi, Kenya", work_arrangement: "hybrid", duration: "4-month paid internship", compensation: "KES 45,000 / month", status: "published", opportunity_skills: makeOppSkills(["Figma", "UI/UX Design"]) },
    { id: "opp-4", organisation_id: "org-1", organisations: orgById["org-1"], title: "Backend PostgreSQL & API Engineering Intern", description: "Learn production database modeling, SQL optimization, and REST API testing alongside senior engineers.", category: "internship", sector: "Technology", min_experience_years: 0, location: "Nairobi, Kenya", work_arrangement: "hybrid", duration: "6-month paid internship", compensation: "KES 50,000 / month", status: "published", opportunity_skills: makeOppSkills(["PostgreSQL", "JavaScript"]) },
    { id: "opp-5", organisation_id: "org-4", organisations: orgById["org-4"], title: "Livelihoods Data & M&E Fellow", description: "Clean KoboToolbox survey datasets, automate SQL validation queries, and publish quarterly impact reports.", category: "fellowship", sector: "Humanitarian & Development", min_experience_years: 2, location: "Nairobi, Kenya", work_arrangement: "hybrid", duration: "9-month paid fellowship", compensation: "KES 85,000 / month", status: "published", opportunity_skills: makeOppSkills(["SQL Analytics", "KoboToolbox", "Monitoring & Evaluation"]) },
    { id: "opp-6", organisation_id: "org-4", organisations: orgById["org-4"], title: "Civic Tech & Open Data Research Fellow", description: "Analyze regional labor market datasets in Python and build open-access visualizations for partner NGOs.", category: "fellowship", sector: "Humanitarian & Development", min_experience_years: 1, location: "Nairobi, Kenya", work_arrangement: "hybrid", duration: "6-month fellowship", compensation: "KES 80,000 / month", status: "published", opportunity_skills: makeOppSkills(["Python", "SQL Analytics"]) },
    { id: "opp-7", organisation_id: "org-3", organisations: orgById["org-3"], title: "Solar Mini-Grid Field Technician Apprentice", description: "Support installation, diagnostics, and routine maintenance of 15kW-50kW community solar mini-grids.", category: "apprenticeship", sector: "Clean Energy", min_experience_years: 1, location: "Kakuma & Lodwar, Kenya", work_arrangement: "onsite", duration: "6-month apprenticeship", compensation: "KES 55,000 / month", status: "published", opportunity_skills: makeOppSkills(["Solar PV Installation", "Off-Grid Mini-Grids"]) },
    { id: "opp-8", organisation_id: "org-2", organisations: orgById["org-2"], title: "Digital Accessibility & Web Production Apprentice", description: "Audit websites for WCAG accessibility and build responsive UI components with senior designers.", category: "apprenticeship", sector: "Design & Digital Media", min_experience_years: 0, location: "Nairobi, Kenya", work_arrangement: "hybrid", duration: "6-month apprenticeship", compensation: "KES 48,000 / month", status: "published", opportunity_skills: makeOppSkills(["UI/UX Design", "Figma"]) },
    { id: "opp-9", organisation_id: "org-1", organisations: orgById["org-1"], title: "Junior Full-Stack Web Developer (Remote)", description: "Build modular web applications, PostgreSQL schemas, and REST integrations for East African SMEs.", category: "remote_work", sector: "Technology", min_experience_years: 2, location: "Remote (East Africa)", work_arrangement: "remote", duration: "12-month contract", compensation: "KES 120,000 / month", status: "published", opportunity_skills: makeOppSkills(["JavaScript", "PostgreSQL"]) },
    { id: "opp-10", organisation_id: "org-1", organisations: orgById["org-1"], title: "Remote Cloud Helpdesk & CRM Specialist", description: "Manage distributed client support queues, troubleshoot cloud permissions, and maintain knowledge bases.", category: "remote_work", sector: "Digital Operations", min_experience_years: 1, location: "Remote (Kenya)", work_arrangement: "remote", duration: "12-month remote contract", compensation: "KES 78,000 / month", status: "published", opportunity_skills: makeOppSkills(["Customer Support (CRM)", "Cloud Fundamentals (Azure)"]) },
  ];

  const mentors = [
    { id: "men-1", full_name: "Grace Wanjiku", headline: "Staff Software Engineer & Technical Interview Coach", organisation_name: "Safaricom Digital Labs", sector: "Technology", location: "Nairobi, Kenya", expertise: ["JavaScript", "PostgreSQL", "GitHub Portfolios", "Technical Interviews"], bio: "Ten years building scalable web platforms across East Africa.", availability: "2 hours/week (Tue & Thu evenings EAT)", max_mentees: 4, is_accepting_requests: true },
    { id: "men-2", full_name: "Samuel Deng", headline: "Regional M&E and Data Science Lead", organisation_name: "East Africa Livelihoods Initiative", sector: "Humanitarian & Development", location: "Kampala, Uganda (Remote)", expertise: ["SQL Analytics", "Python", "KoboToolbox", "Impact Evaluation"], bio: "Leads regional data teams measuring youth employment outcomes.", availability: "1.5 hours/week (Saturdays EAT)", max_mentees: 3, is_accepting_requests: true },
    { id: "men-3", full_name: "Farah Abdi", headline: "Renewable Energy Operations & Licensing Advisor", organisation_name: "SunGrid East Africa", sector: "Clean Energy", location: "Nairobi, Kenya", expertise: ["Solar PV Installation", "Off-Grid Mini-Grids", "EPRA Licensing"], bio: "Advises technicians transitioning into certified commercial mini-grid operations.", availability: "1 hour/week (Wednesdays EAT)", max_mentees: 2, is_accepting_requests: true },
    { id: "men-4", full_name: "Lydia Mwangi", headline: "Senior Product Designer & Career Coach", organisation_name: "Nairobi Design Collective", sector: "Design & Digital Media", location: "Nairobi, Kenya", expertise: ["Figma", "UI/UX Design", "Portfolio Reviews"], bio: "Supports emerging UI/UX designers with accessible design critiques.", availability: "2 hours/week (Fridays EAT)", max_mentees: 3, is_accepting_requests: true },
  ];

  const applications = [
    { id: "app-1", opportunity_id: "opp-9", talent_profile_id: "tal-1", cover_note: "Built production JavaScript and PostgreSQL apps for community cooperatives.", match_score: 94, status: "accepted", employer_notes: "Strong verified portfolio and clean technical interview." },
    { id: "app-2", opportunity_id: "opp-5", talent_profile_id: "tal-3", cover_note: "Over four years managing KoboToolbox surveys and SQL reporting.", match_score: 92, status: "accepted", employer_notes: "Top-scoring candidate in SQL assessment." },
    { id: "app-3", opportunity_id: "opp-10", talent_profile_id: "tal-2", cover_note: "Combining AZ-900 certification with trilingual helpdesk experience.", match_score: 88, status: "shortlisted", employer_notes: "Shortlisted for written simulation." },
    { id: "app-4", opportunity_id: "opp-7", talent_profile_id: "tal-4", cover_note: "Certified NITA Grade II technician ready to mentor incoming apprentices.", match_score: 96, status: "interview", employer_notes: "Scheduled for field commissioning review." },
  ];

  const mentorshipRequests = [
    { id: "mr-1", talent_profile_id: "tal-1", mentor_profile_id: "men-1", goal: "Prepare for full-stack technical interviews and PostgreSQL reviews", message: "Looking for mock interview practice.", status: "completed", mentor_response: "Completed four sessions covering system design and SQL indexing." },
    { id: "mr-2", talent_profile_id: "tal-3", mentor_profile_id: "men-2", goal: "Strengthen Python automation for humanitarian M&E pipelines", message: "Want to automate KoboToolbox cleaning scripts.", status: "accepted", mentor_response: "Glad to work together during our Saturday check-in." },
    { id: "mr-3", talent_profile_id: "tal-4", mentor_profile_id: "men-3", goal: "Navigate EPRA T2 commercial solar licensing requirements", message: "Need advice on logging field hours.", status: "pending", mentor_response: "" },
    { id: "mr-4", talent_profile_id: "tal-2", mentor_profile_id: "men-4", goal: "Transition from customer support into digital product accessibility", message: "Interested in Figma basics and user research.", status: "pending", mentor_response: "" },
  ];

  const outcomes = [
    { id: "out-1", talent_profile_id: "tal-1", organisation_id: "org-1", opportunity_id: "opp-9", application_id: "app-1", outcome_type: "remote_contract", outcome_status: "confirmed", notes: "Signed 12-month remote engineering contract.", recorded_at: new Date().toISOString() },
    { id: "out-2", talent_profile_id: "tal-3", organisation_id: "org-4", opportunity_id: "opp-5", application_id: "app-2", outcome_type: "fellowship", outcome_status: "confirmed", notes: "Confirmed start date for 9-month paid fellowship.", recorded_at: new Date().toISOString() },
  ];

  return { skills, organisations, talents, opportunities, mentors, applications, mentorshipRequests, outcomes };
}

function loadLocalStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (err) {
    console.warn("LocalStorage read failed:", err);
  }
  const seed = buildInitialLocalSeed();
  saveLocalStore(seed);
  return seed;
}

function saveLocalStore(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn("LocalStorage write failed:", err);
  }
}

// DATA LOADING (SUPABASE OR LOCAL FALLBACK)

async function refreshAllData() {
  const supabase = getSupabase();

  if (supabase) {
    try {
      const [skillsRes, orgsRes, talRes, oppRes, menRes, appRes, mrRes, outRes, impRes] = await Promise.all([
        supabase.from("skills").select("id, name, category").order("category").order("name"),
        supabase.from("organisations").select("*").order("created_at", { ascending: false }),
        supabase.from("talent_profiles").select("*, talent_skills(id, skill_id, proficiency, years_used, skills(id, name, category)), portfolio_items(id, title, project_url, evidence_status)").order("created_at", { ascending: false }),
        supabase.from("opportunities").select("*, organisations(id, name, sector, location, is_verified), opportunity_skills(id, skill_id, is_required, skills(id, name, category))").eq("status", "published").order("created_at", { ascending: false }),
        supabase.from("mentor_profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("applications").select("*, opportunities(id, title, category, organisation_id, organisations(name)), talent_profiles(id, full_name, headline, location)").order("created_at", { ascending: false }),
        supabase.from("mentorship_requests").select("*, talent_profiles(id, full_name, headline), mentor_profiles(id, full_name, organisation_name)").order("created_at", { ascending: false }),
        supabase.from("outcome_records").select("*, talent_profiles(full_name), organisations(name), opportunities(title)").order("recorded_at", { ascending: false }),
        supabase.rpc("get_public_impact_metrics"),
      ]);

      if (skillsRes.error) throw skillsRes.error;

      state.mode = "supabase";
      state.skills = skillsRes.data || [];
      state.organisations = orgsRes.data || [];
      state.talents = talRes.data || [];
      state.opportunities = oppRes.data || [];
      state.mentors = menRes.data || [];
      state.applications = appRes.data || [];
      state.mentorshipRequests = mrRes.data || [];
      state.outcomes = outRes.data || [];
      state.impact = impRes.data || computeLocalImpact();

      renderAllSections();
      return;
    } catch (err) {
      console.warn("Supabase fetch failed, falling back to local demo store:", err);
    }
  }

  const local = loadLocalStore();
  state.mode = "local";
  state.skills = local.skills;
  state.organisations = local.organisations;
  state.talents = local.talents;
  state.opportunities = local.opportunities;
  state.mentors = local.mentors;
  state.applications = local.applications;
  state.mentorshipRequests = local.mentorshipRequests;
  state.outcomes = local.outcomes;
  state.impact = computeLocalImpact();

  renderAllSections();
}

function computeLocalImpact() {
  return {
    registered_talent: state.talents.length,
    registered_employers: state.organisations.length,
    registered_mentors: state.mentors.length,
    total_organisations: state.organisations.length,
    published_opportunities: state.opportunities.filter((o) => o.status === "published").length,
    submitted_applications: state.applications.length,
    shortlisted_candidates: state.applications.filter((a) => ["shortlisted", "interview", "accepted"].includes(a.status)).length,
    active_mentorship_requests: state.mentorshipRequests.filter((m) => ["pending", "accepted"].includes(m.status)).length,
    completed_mentorships: state.mentorshipRequests.filter((m) => m.status === "completed").length,
    verified_portfolio_items: state.talents.reduce((acc, t) => acc + (t.portfolio_items || []).filter((p) => p.evidence_status === "verified").length, 0),
    recorded_employment_outcomes: state.outcomes.filter((o) => o.outcome_status === "confirmed").length,
    accepted_applications: state.applications.filter((a) => a.status === "accepted").length,
  };
}

// RENDERING SECTIONS

function renderAllSections() {
  renderOpportunities();
  renderTalentPool();
  renderMentors();
  renderMentorshipRequests();
  renderApplicationsTable();
  renderOutcomesTable();
  renderImpactMetrics();
}

function renderOpportunities() {
  const grid = document.getElementById("opportunities-grid");
  if (!grid) return;

  const q = (document.getElementById("opp-search")?.value || "").trim().toLowerCase();
  const cat = document.getElementById("opp-category")?.value || "";

  const filtered = state.opportunities.filter((opp) => {
    if (cat && opp.category !== cat) return false;
    if (!q) return true;
    const skillNames = (opp.opportunity_skills || []).map((s) => s.skills?.name || "").join(" ").toLowerCase();
    const orgName = (opp.organisations?.name || "").toLowerCase();
    return (
      (opp.title || "").toLowerCase().includes(q) ||
      (opp.location || "").toLowerCase().includes(q) ||
      (opp.sector || "").toLowerCase().includes(q) ||
      orgName.includes(q) ||
      skillNames.includes(q)
    );
  });

  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">No opportunities match your current filter.</div>`;
    return;
  }

  grid.innerHTML = filtered
    .map((opp) => {
      const orgName = opp.organisations?.name || "Participating Organisation";
      const verifiedBadge = opp.organisations?.is_verified ? `<span class="badge badge-green">Verified</span>` : "";
      const skills = (opp.opportunity_skills || [])
        .slice(0, 4)
        .map((s) => `<span class="tag">${escapeHtml(s.skills?.name || "")}</span>`)
        .join("");

      return `
        <article class="opp-card">
          <div>
            <div class="opp-top">
              <span class="badge badge-teal">${escapeHtml(formatCategory(opp.category))}</span>
              ${verifiedBadge}
            </div>
            <h3 class="opp-title">${escapeHtml(opp.title)}</h3>
            <div class="opp-org">${escapeHtml(orgName)} &middot; ${escapeHtml(opp.location)}</div>
            <div class="opp-meta" style="margin-top:8px;">
              <span>${escapeHtml(opp.work_arrangement)}</span>
              ${opp.duration ? `<span>&middot; ${escapeHtml(opp.duration)}</span>` : ""}
              ${opp.compensation ? `<span>&middot; ${escapeHtml(opp.compensation)}</span>` : ""}
            </div>
            <p class="opp-desc" style="margin-top:10px;">${escapeHtml(opp.description)}</p>
            ${skills ? `<div class="tag-cloud" style="margin-top:12px;margin-bottom:0;">${skills}</div>` : ""}
          </div>
          <div class="opp-footer">
            <button type="button" class="btn btn-outline btn-sm" data-view-opp="${escapeHtml(opp.id)}">Details</button>
            <button type="button" class="btn btn-primary btn-sm" data-apply-opp="${escapeHtml(opp.id)}">Apply Now</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderTalentPool() {
  const grid = document.getElementById("talent-grid");
  if (!grid) return;

  const q = (document.getElementById("talent-search")?.value || "").trim().toLowerCase();
  const filtered = state.talents.filter((tp) => {
    if (!q) return true;
    const skillText = (tp.talent_skills || []).map((ts) => ts.skills?.name || "").join(" ").toLowerCase();
    return (
      (tp.full_name || "").toLowerCase().includes(q) ||
      (tp.headline || "").toLowerCase().includes(q) ||
      (tp.location || "").toLowerCase().includes(q) ||
      (tp.sector || "").toLowerCase().includes(q) ||
      skillText.includes(q)
    );
  });

  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">No talent profiles match your search.</div>`;
    return;
  }

  grid.innerHTML = filtered
    .map((tp) => {
      const skillsHtml = (tp.talent_skills || [])
        .map((ts) => `<span class="tag">${escapeHtml(ts.skills?.name || "")} (${escapeHtml(ts.proficiency)})</span>`)
        .join("");
      const verifiedItems = (tp.portfolio_items || []).filter((p) => p.evidence_status === "verified").length;

      return `
        <article class="opp-card">
          <div>
            <div class="opp-top">
              <span class="badge badge-teal">${escapeHtml(tp.sector || "Talent")}</span>
              <span class="badge badge-navy">${escapeHtml(tp.preferred_work_arrangement || "hybrid")}</span>
            </div>
            <h3 class="opp-title">${escapeHtml(tp.full_name)}</h3>
            <div class="opp-org">${escapeHtml(tp.headline || "Skilled Professional")} &middot; ${escapeHtml(tp.location || "East Africa")}</div>
            <div class="opp-meta" style="margin-top:6px;">
              <span>${escapeHtml(tp.years_experience ?? 0)} yr(s) experience</span>
              <span>&middot; ${escapeHtml(tp.availability || "Available")}</span>
              ${verifiedItems ? `<span>&middot; ${verifiedItems} verified portfolio</span>` : ""}
            </div>
            <p class="opp-desc" style="margin-top:10px;">${escapeHtml(tp.summary || "")}</p>
            ${skillsHtml ? `<div class="tag-cloud" style="margin-top:10px;margin-bottom:0;">${skillsHtml}</div>` : ""}
          </div>
          <div class="opp-footer">
            <button type="button" class="btn btn-outline btn-sm" data-view-talent="${escapeHtml(tp.id)}">View Profile</button>
            <button type="button" class="btn btn-teal btn-sm" data-match-talent="${escapeHtml(tp.id)}">Match to Roles</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderMentors() {
  const grid = document.getElementById("mentors-grid");
  if (!grid) return;

  if (!state.mentors.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">No mentors registered yet.</div>`;
    return;
  }

  grid.innerHTML = state.mentors
    .map((m) => `
      <article class="opp-card">
        <div>
          <div class="opp-top">
            <span class="badge badge-teal">${escapeHtml(m.sector || "Mentorship")}</span>
            <span class="badge ${m.is_accepting_requests ? "badge-green" : "badge-amber"}">${m.is_accepting_requests ? "Accepting Requests" : "At Capacity"}</span>
          </div>
          <h3 class="opp-title">${escapeHtml(m.full_name)}</h3>
          <div class="opp-org">${escapeHtml(m.headline || "")}${m.organisation_name ? ` &middot; ${escapeHtml(m.organisation_name)}` : ""}</div>
          <div class="opp-meta" style="margin-top:6px;">
            <span>${escapeHtml(m.location || "")}</span>
            ${m.availability ? `<span>&middot; ${escapeHtml(m.availability)}</span>` : ""}
          </div>
          <p class="opp-desc" style="margin-top:10px;">${escapeHtml(m.bio || "")}</p>
          <div class="tag-cloud" style="margin-top:10px;margin-bottom:0;">
            ${(m.expertise || []).map((ex) => `<span class="tag">${escapeHtml(ex)}</span>`).join("")}
          </div>
        </div>
        <div class="opp-footer">
          <span class="small" style="color:var(--slate-500);">Capacity: ${escapeHtml(m.max_mentees ?? 3)} mentees</span>
          <button type="button" class="btn btn-primary btn-sm" data-request-mentor="${escapeHtml(m.id)}">Request Mentorship</button>
        </div>
      </article>
    `)
    .join("");
}

function renderMentorshipRequests() {
  const wrap = document.getElementById("mentorship-requests-table");
  if (!wrap) return;

  if (!state.mentorshipRequests.length) {
    wrap.innerHTML = `<div class="empty-state">No mentorship requests yet.</div>`;
    return;
  }

  const talentMap = new Map(state.talents.map((t) => [t.id, t]));
  const mentorMap = new Map(state.mentors.map((m) => [m.id, m]));

  wrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr><th>Talent</th><th>Mentor</th><th>Goal</th><th>Status</th><th>Mentor Action</th></tr>
      </thead>
      <tbody>
        ${state.mentorshipRequests
          .map((mr) => {
            const talName = mr.talent_profiles?.full_name || talentMap.get(mr.talent_profile_id)?.full_name || "Talent";
            const menName = mr.mentor_profiles?.full_name || mentorMap.get(mr.mentor_profile_id)?.full_name || "Mentor";
            return `
              <tr>
                <td><strong>${escapeHtml(talName)}</strong></td>
                <td>${escapeHtml(menName)}</td>
                <td>
                  <strong>${escapeHtml(mr.goal)}</strong>
                  ${mr.mentor_response ? `<div class="small" style="color:var(--slate-500);margin-top:4px;">Reply: ${escapeHtml(mr.mentor_response)}</div>` : ""}
                </td>
                <td>${statusBadge(mr.status)}</td>
                <td>
                  <div class="inline-controls">
                    <select class="mr-status-select" data-mr-id="${escapeHtml(mr.id)}">
                      ${["pending", "accepted", "completed", "rejected"]
                        .map((st) => `<option value="${st}" ${mr.status === st ? "selected" : ""}>${escapeHtml(st)}</option>`)
                        .join("")}
                    </select>
                    <input type="text" class="mr-response-input" data-mr-id="${escapeHtml(mr.id)}" value="${escapeHtml(mr.mentor_response || "")}" placeholder="Mentor note..." />
                    <button type="button" class="btn btn-primary btn-sm" data-save-mr="${escapeHtml(mr.id)}">Update</button>
                  </div>
                </td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function renderApplicationsTable() {
  const wrap = document.getElementById("applications-table");
  if (!wrap) return;

  if (!state.applications.length) {
    wrap.innerHTML = `<div class="empty-state">No applications submitted yet.</div>`;
    return;
  }

  const talentMap = new Map(state.talents.map((t) => [t.id, t]));
  const oppMap = new Map(state.opportunities.map((o) => [o.id, o]));
  const recordedAppIds = new Set(state.outcomes.map((o) => o.application_id).filter(Boolean));
  const stages = ["submitted", "under_review", "shortlisted", "interview", "accepted", "rejected"];

  wrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr><th>Candidate</th><th>Opportunity</th><th>Match</th><th>Stage &amp; Notes</th><th>Outcome</th></tr>
      </thead>
      <tbody>
        ${state.applications
          .map((app) => {
            const tal = app.talent_profiles || talentMap.get(app.talent_profile_id) || {};
            const opp = app.opportunities || oppMap.get(app.opportunity_id) || {};
            const alreadyRecorded = recordedAppIds.has(app.id);
            return `
              <tr>
                <td>
                  <strong>${escapeHtml(tal.full_name || "Candidate")}</strong>
                  <div class="small" style="color:var(--slate-500);">${escapeHtml(tal.headline || "")}</div>
                </td>
                <td>
                  <strong>${escapeHtml(opp.title || "Opportunity")}</strong>
                  <div class="small" style="color:var(--slate-500);">${escapeHtml(opp.organisations?.name || "")}</div>
                </td>
                <td><strong>${app.match_score !== null && app.match_score !== undefined ? `${escapeHtml(app.match_score)}%` : "-"}</strong></td>
                <td>
                  <div class="inline-controls">
                    <select class="app-status-select" data-app-id="${escapeHtml(app.id)}">
                      ${stages.map((st) => `<option value="${st}" ${app.status === st ? "selected" : ""}>${escapeHtml(st.replace(/_/g, " "))}</option>`).join("")}
                    </select>
                    <input type="text" class="app-notes-input" data-app-id="${escapeHtml(app.id)}" value="${escapeHtml(app.employer_notes || "")}" placeholder="Employer note..." />
                    <button type="button" class="btn btn-primary btn-sm" data-save-app="${escapeHtml(app.id)}">Save</button>
                  </div>
                </td>
                <td>
                  ${
                    alreadyRecorded
                      ? `<span class="badge badge-green">Outcome Confirmed</span>`
                      : app.status === "accepted"
                        ? `<button type="button" class="btn btn-teal btn-sm" data-record-outcome="${escapeHtml(app.id)}">Confirm Outcome</button>`
                        : `<span class="small" style="color:var(--slate-500);">Accept to confirm</span>`
                  }
                </td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function renderOutcomesTable() {
  const wrap = document.getElementById("outcomes-table");
  if (!wrap) return;

  if (!state.outcomes.length) {
    wrap.innerHTML = `<div class="empty-state">No placement outcomes recorded yet.</div>`;
    return;
  }

  const talentMap = new Map(state.talents.map((t) => [t.id, t]));
  const orgMap = new Map(state.organisations.map((o) => [o.id, o]));
  const oppMap = new Map(state.opportunities.map((o) => [o.id, o]));

  wrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr><th>Candidate</th><th>Opportunity</th><th>Organisation</th><th>Type</th><th>Status</th><th>Date</th></tr>
      </thead>
      <tbody>
        ${state.outcomes
          .map((o) => {
            const talName = o.talent_profiles?.full_name || talentMap.get(o.talent_profile_id)?.full_name || "Talent";
            const orgName = o.organisations?.name || orgMap.get(o.organisation_id)?.name || "Organisation";
            const oppTitle = o.opportunities?.title || oppMap.get(o.opportunity_id)?.title || "Placement";
            return `
              <tr>
                <td><strong>${escapeHtml(talName)}</strong></td>
                <td>${escapeHtml(oppTitle)}</td>
                <td>${escapeHtml(orgName)}</td>
                <td>${escapeHtml(formatCategory(o.outcome_type))}</td>
                <td>${statusBadge(o.outcome_status)}</td>
                <td>${escapeHtml(formatDate(o.recorded_at))}</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function renderImpactMetrics() {
  const container = document.getElementById("impact-container");
  if (!container) return;
  const m = state.impact || computeLocalImpact();
  const val = (k) => escapeHtml(m[k] ?? 0);

  container.innerHTML = `
    <h3 class="metrics-group-title">Platform Activity &amp; Pipeline</h3>
    <div class="metrics-grid">
      <div class="metric-card"><div class="metric-value">${val("registered_talent")}</div><div class="metric-label">Registered Talent</div></div>
      <div class="metric-card"><div class="metric-value">${val("registered_employers")}</div><div class="metric-label">Registered Employers</div></div>
      <div class="metric-card"><div class="metric-value">${val("registered_mentors")}</div><div class="metric-label">Registered Mentors</div></div>
      <div class="metric-card"><div class="metric-value">${val("published_opportunities")}</div><div class="metric-label">Published Opportunities</div></div>
    </div>
    <h3 class="metrics-group-title">Verification &amp; Confirmed Outcomes</h3>
    <div class="metrics-grid" style="margin-bottom:0;">
      <div class="metric-card"><div class="metric-value">${val("submitted_applications")}</div><div class="metric-label">Submitted Applications</div></div>
      <div class="metric-card"><div class="metric-value">${val("shortlisted_candidates")}</div><div class="metric-label">Shortlisted / Interview / Accepted</div></div>
      <div class="metric-card metric-card-highlight"><div class="metric-value">${val("verified_portfolio_items")}</div><div class="metric-label">Verified Portfolio Items</div></div>
      <div class="metric-card metric-card-highlight"><div class="metric-value">${val("recorded_employment_outcomes")}</div><div class="metric-label">Confirmed Outcome Records</div></div>
    </div>
  `;
}

// INTAKE MODALS (NO LOGIN, NO PASSWORD, NO EMAIL CONFIRMATION)

function openIntakeModal(role) {
  const titleEl = document.getElementById("intake-modal-title");
  const bodyEl = document.getElementById("intake-modal-body");
  if (!titleEl || !bodyEl) return;

  const skillChips = state.skills
    .map(
      (s) => `
        <label class="checkbox-chip">
          <input type="checkbox" name="intake-skill" value="${escapeHtml(s.id)}" />
          <span>${escapeHtml(s.name)}</span>
        </label>
      `
    )
    .join("");

  if (role === "talent") {
    titleEl.textContent = "Join as Talent - Enter Your Details";
    bodyEl.innerHTML = `
      <form id="intake-talent-form">
        <div class="form-grid-2">
          <div class="form-group">
            <label for="it-name">Full Name *</label>
            <input id="it-name" class="input" type="text" required minlength="2" placeholder="e.g., Amina Hassan" />
          </div>
          <div class="form-group">
            <label for="it-email">Contact Email (optional)</label>
            <input id="it-email" class="input" type="email" placeholder="amina@example.org" />
          </div>
          <div class="form-group">
            <label for="it-headline">Professional Headline *</label>
            <input id="it-headline" class="input" type="text" required placeholder="e.g., Junior Software Developer" />
          </div>
          <div class="form-group">
            <label for="it-sector">Primary Sector *</label>
            <input id="it-sector" class="input" type="text" required placeholder="e.g., Technology, Clean Energy" />
          </div>
          <div class="form-group">
            <label for="it-location">Location *</label>
            <input id="it-location" class="input" type="text" required placeholder="e.g., Nairobi, Kenya" />
          </div>
          <div class="form-group">
            <label for="it-years">Years of Experience</label>
            <input id="it-years" class="input" type="number" min="0" max="50" value="2" />
          </div>
          <div class="form-group">
            <label for="it-arrangement">Preferred Work Arrangement</label>
            <select id="it-arrangement" class="input">
              <option value="remote">Remote</option>
              <option value="hybrid" selected>Hybrid</option>
              <option value="onsite">Onsite</option>
            </select>
          </div>
          <div class="form-group">
            <label for="it-availability">Availability</label>
            <input id="it-availability" class="input" type="text" value="Immediate" />
          </div>
          <div class="form-group">
            <label for="it-languages">Languages (comma-separated)</label>
            <input id="it-languages" class="input" type="text" placeholder="English, Swahili" />
          </div>
          <div class="form-group">
            <label for="it-portfolio">Portfolio / GitHub URL</label>
            <input id="it-portfolio" class="input" type="url" placeholder="https://github.com/..." />
          </div>
        </div>
        <div class="form-group">
          <label for="it-education">Education &amp; Certifications</label>
          <input id="it-education" class="input" type="text" placeholder="e.g., Diploma in Web Development" />
        </div>
        <div class="form-group">
          <label for="it-summary">Professional Summary *</label>
          <textarea id="it-summary" class="input" required placeholder="Briefly describe your skills, projects, and experience..."></textarea>
        </div>
        <div class="form-group">
          <label>Select Your Skills</label>
          <div class="checkbox-grid">${skillChips}</div>
        </div>
        <div class="btn-row">
          <button type="submit" class="btn btn-teal">Save Talent Profile</button>
          <button type="button" class="btn btn-outline" data-modal-close="intake-modal">Cancel</button>
        </div>
      </form>
    `;
  } else if (role === "employer") {
    titleEl.textContent = "Hire Skilled Talent - Post an Opportunity";
    bodyEl.innerHTML = `
      <form id="intake-employer-form">
        <div class="form-grid-2">
          <div class="form-group">
            <label for="ie-org-name">Organisation Name *</label>
            <input id="ie-org-name" class="input" type="text" required minlength="2" placeholder="e.g., Horizon CleanTech" />
          </div>
          <div class="form-group">
            <label for="ie-contact-name">Hiring Contact Name *</label>
            <input id="ie-contact-name" class="input" type="text" required placeholder="e.g., Peter Kariuki" />
          </div>
          <div class="form-group">
            <label for="ie-title">Opportunity Title *</label>
            <input id="ie-title" class="input" type="text" required minlength="3" placeholder="e.g., Junior Data Analyst" />
          </div>
          <div class="form-group">
            <label for="ie-category">Category *</label>
            <select id="ie-category" class="input">
              <option value="employment">Employment</option>
              <option value="internship">Internship</option>
              <option value="fellowship">Fellowship</option>
              <option value="apprenticeship">Apprenticeship</option>
              <option value="remote_work">Remote Work</option>
            </select>
          </div>
          <div class="form-group">
            <label for="ie-sector">Sector *</label>
            <input id="ie-sector" class="input" type="text" required placeholder="e.g., Technology" />
          </div>
          <div class="form-group">
            <label for="ie-location">Location *</label>
            <input id="ie-location" class="input" type="text" required placeholder="e.g., Nairobi, Kenya" />
          </div>
          <div class="form-group">
            <label for="ie-arrangement">Work Arrangement</label>
            <select id="ie-arrangement" class="input">
              <option value="hybrid" selected>Hybrid</option>
              <option value="remote">Remote</option>
              <option value="onsite">Onsite</option>
            </select>
          </div>
          <div class="form-group">
            <label for="ie-min-exp">Minimum Experience (Years)</label>
            <input id="ie-min-exp" class="input" type="number" min="0" max="30" value="1" />
          </div>
          <div class="form-group">
            <label for="ie-duration">Duration</label>
            <input id="ie-duration" class="input" type="text" placeholder="e.g., 12-month contract" />
          </div>
          <div class="form-group">
            <label for="ie-comp">Compensation</label>
            <input id="ie-comp" class="input" type="text" placeholder="e.g., KES 80,000 / month" />
          </div>
        </div>
        <div class="form-group">
          <label for="ie-desc">Role Description (at least 20 characters) *</label>
          <textarea id="ie-desc" class="input" required minlength="20" placeholder="Describe responsibilities, tools, and impact..."></textarea>
        </div>
        <div class="form-group">
          <label>Required Skills</label>
          <div class="checkbox-grid">${skillChips}</div>
        </div>
        <div class="btn-row">
          <button type="submit" class="btn btn-primary">Publish Opportunity</button>
          <button type="button" class="btn btn-outline" data-modal-close="intake-modal">Cancel</button>
        </div>
      </form>
    `;
  } else if (role === "mentor") {
    titleEl.textContent = "Become a Mentor - Share Your Expertise";
    bodyEl.innerHTML = `
      <form id="intake-mentor-form">
        <div class="form-grid-2">
          <div class="form-group">
            <label for="im-name">Full Name *</label>
            <input id="im-name" class="input" type="text" required minlength="2" placeholder="e.g., Dr. Wanjiru Njoroge" />
          </div>
          <div class="form-group">
            <label for="im-email">Contact Email (optional)</label>
            <input id="im-email" class="input" type="email" placeholder="mentor@example.org" />
          </div>
          <div class="form-group">
            <label for="im-headline">Mentor Headline *</label>
            <input id="im-headline" class="input" type="text" required placeholder="e.g., Senior Cloud Architect" />
          </div>
          <div class="form-group">
            <label for="im-org">Organisation</label>
            <input id="im-org" class="input" type="text" placeholder="e.g., East Africa Tech Hub" />
          </div>
          <div class="form-group">
            <label for="im-sector">Sector *</label>
            <input id="im-sector" class="input" type="text" required placeholder="e.g., Technology" />
          </div>
          <div class="form-group">
            <label for="im-location">Location *</label>
            <input id="im-location" class="input" type="text" required placeholder="e.g., Nairobi, Kenya" />
          </div>
          <div class="form-group">
            <label for="im-availability">Weekly Availability</label>
            <input id="im-availability" class="input" type="text" placeholder="e.g., 2 hours/week (Saturdays)" />
          </div>
          <div class="form-group">
            <label for="im-max">Max Mentees</label>
            <input id="im-max" class="input" type="number" min="1" max="20" value="3" />
          </div>
        </div>
        <div class="form-group">
          <label for="im-expertise">Expertise Topics (comma-separated) *</label>
          <input id="im-expertise" class="input" type="text" required placeholder="JavaScript, SQL, Technical Interviews" />
        </div>
        <div class="form-group">
          <label for="im-bio">Short Bio *</label>
          <textarea id="im-bio" class="input" required placeholder="Share your background and how you help mentees..."></textarea>
        </div>
        <div class="btn-row">
          <button type="submit" class="btn btn-primary">Register as Mentor</button>
          <button type="button" class="btn btn-outline" data-modal-close="intake-modal">Cancel</button>
        </div>
      </form>
    `;
  }

  openModal("intake-modal");
}

// INTERACTIVE MODALS (DETAILS, APPLY, MATCHING, MENTOR REQUEST)

function handleViewOpportunity(oppId) {
  const opp = state.opportunities.find((o) => String(o.id) === String(oppId));
  if (!opp) return;
  const org = opp.organisations || {};
  const skillsHtml = (opp.opportunity_skills || [])
    .map((s) => `<span class="tag">${escapeHtml(s.skills?.name || "")}</span>`)
    .join(" ");

  openDetailModal(
    opp.title,
    `
      <dl class="detail-dl">
        <dt>Organisation</dt><dd>${escapeHtml(org.name || "Organisation")}</dd>
        <dt>Category</dt><dd>${escapeHtml(formatCategory(opp.category))}</dd>
        <dt>Sector</dt><dd>${escapeHtml(opp.sector || "General")}</dd>
        <dt>Location</dt><dd>${escapeHtml(opp.location)} (${escapeHtml(opp.work_arrangement)})</dd>
        <dt>Min. Experience</dt><dd>${escapeHtml(opp.min_experience_years ?? 0)} year(s)</dd>
        <dt>Duration</dt><dd>${escapeHtml(opp.duration || "Flexible")}</dd>
        <dt>Compensation</dt><dd>${escapeHtml(opp.compensation || "Competitive")}</dd>
      </dl>
      <div style="margin-top:14px;">
        <strong>Role Overview</strong>
        <p class="small" style="margin:6px 0 0;color:var(--slate-700);">${escapeHtml(opp.description)}</p>
      </div>
      ${skillsHtml ? `<div style="margin-top:14px;"><strong>Skills</strong><div class="tag-cloud" style="margin-top:6px;">${skillsHtml}</div></div>` : ""}
      <div class="btn-row">
        <button type="button" class="btn btn-primary" data-apply-opp="${escapeHtml(opp.id)}">Apply Now</button>
        <button type="button" class="btn btn-outline" data-modal-close="detail-modal">Close</button>
      </div>
    `
  );
}

function handleOpenApplyModal(oppId) {
  const opp = state.opportunities.find((o) => String(o.id) === String(oppId));
  if (!opp) return;

  const talentOptions = state.talents
    .map((t) => {
      const m = computeMatchBreakdown(t, t.talent_skills || [], opp, opp.opportunity_skills || []);
      return `<option value="${escapeHtml(t.id)}">${escapeHtml(t.full_name)} - ${m.score}% match (${escapeHtml(t.headline || "Talent")})</option>`;
    })
    .join("");

  openDetailModal(
    `Apply - ${opp.title}`,
    `
      <p class="small" style="color:var(--slate-600);margin-top:0;">Select a Talent profile to submit an application with live match scoring.</p>
      <form id="apply-opp-form" data-opp-id="${escapeHtml(opp.id)}">
        <div class="form-group">
          <label for="apply-talent-id">Applying As *</label>
          <select id="apply-talent-id" class="input" required>${talentOptions}</select>
        </div>
        <div class="form-group">
          <label for="apply-cover-note">Cover Note</label>
          <textarea id="apply-cover-note" class="input" placeholder="Briefly explain why your skills fit this role..."></textarea>
        </div>
        <div class="btn-row">
          <button type="submit" class="btn btn-primary">Submit Application</button>
          <button type="button" class="btn btn-outline" data-modal-close="detail-modal">Cancel</button>
        </div>
      </form>
    `
  );
}

function handleViewTalent(talentId) {
  const tp = state.talents.find((t) => String(t.id) === String(talentId));
  if (!tp) return;
  const skills = (tp.talent_skills || [])
    .map((ts) => `<span class="tag">${escapeHtml(ts.skills?.name || "")} (${escapeHtml(ts.proficiency)})</span>`)
    .join(" ");

  openDetailModal(
    tp.full_name,
    `
      <dl class="detail-dl">
        <dt>Headline</dt><dd>${escapeHtml(tp.headline || "-")}</dd>
        <dt>Sector</dt><dd>${escapeHtml(tp.sector || "-")}</dd>
        <dt>Location</dt><dd>${escapeHtml(tp.location || "-")} (${escapeHtml(tp.preferred_work_arrangement || "hybrid")})</dd>
        <dt>Experience</dt><dd>${escapeHtml(tp.years_experience ?? 0)} year(s)</dd>
        <dt>Education</dt><dd>${escapeHtml(tp.education || "-")}</dd>
        <dt>Languages</dt><dd>${escapeHtml((tp.languages || []).join(", ") || "-")}</dd>
        <dt>Availability</dt><dd>${escapeHtml(tp.availability || "-")}</dd>
      </dl>
      ${tp.summary ? `<div style="margin-top:12px;"><strong>Summary</strong><p class="small">${escapeHtml(tp.summary)}</p></div>` : ""}
      ${skills ? `<div style="margin-top:12px;"><strong>Skills</strong><div class="tag-cloud" style="margin-top:6px;">${skills}</div></div>` : ""}
      <div class="btn-row">
        <button type="button" class="btn btn-teal" data-match-talent="${escapeHtml(tp.id)}">Match to Opportunities</button>
        <button type="button" class="btn btn-outline" data-modal-close="detail-modal">Close</button>
      </div>
    `
  );
}

function handleMatchTalentToRoles(talentId) {
  const tp = state.talents.find((t) => String(t.id) === String(talentId));
  if (!tp) return;

  const ranked = state.opportunities
    .map((opp) => ({
      opp,
      match: computeMatchBreakdown(tp, tp.talent_skills || [], opp, opp.opportunity_skills || []),
    }))
    .sort((a, b) => b.match.score - a.match.score)
    .slice(0, 5);

  openDetailModal(
    `Top Role Matches for ${tp.full_name}`,
    `
      <div style="display:flex;flex-direction:column;gap:12px;">
        ${ranked
          .map(
            ({ opp, match }) => `
              <div class="card" style="padding:14px;">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
                  <strong>${escapeHtml(opp.title)}</strong>
                  <span class="badge badge-navy">${match.score}% Match</span>
                </div>
                <div class="small" style="color:var(--slate-600);margin-top:4px;">${escapeHtml(opp.organisations?.name || "")} &middot; ${escapeHtml(formatCategory(opp.category))}</div>
                <div class="small" style="margin-top:6px;">${escapeHtml(match.summary)}</div>
              </div>
            `
          )
          .join("")}
      </div>
    `
  );
}

function handleOpenMentorRequest(mentorId) {
  const m = state.mentors.find((x) => String(x.id) === String(mentorId));
  if (!m) return;

  const talentOptions = state.talents
    .map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.full_name)} (${escapeHtml(t.headline || "Talent")})</option>`)
    .join("");

  openDetailModal(
    `Request Mentorship - ${m.full_name}`,
    `
      <form id="request-mentor-form" data-mentor-id="${escapeHtml(m.id)}">
        <div class="form-group">
          <label for="mr-talent-id">Requesting As *</label>
          <select id="mr-talent-id" class="input" required>${talentOptions}</select>
        </div>
        <div class="form-group">
          <label for="mr-goal">Mentorship Goal (at least 5 characters) *</label>
          <input id="mr-goal" class="input" type="text" required minlength="5" placeholder="e.g., Technical portfolio review and interview prep" />
        </div>
        <div class="form-group">
          <label for="mr-message">Message</label>
          <textarea id="mr-message" class="input" placeholder="Share your current focus..."></textarea>
        </div>
        <div class="btn-row">
          <button type="submit" class="btn btn-primary">Send Request</button>
          <button type="button" class="btn btn-outline" data-modal-close="detail-modal">Cancel</button>
        </div>
      </form>
    `
  );
}

// MUTATIONS (SAVES TO SUPABASE OR LOCAL DEMO STORE & UPDATES ALL VIEWS)

async function handleTalentIntakeSubmit(form) {
  const checkedSkillIds = Array.from(form.querySelectorAll('input[name="intake-skill"]:checked')).map((cb) => cb.value);
  const payload = {
    full_name: document.getElementById("it-name").value.trim(),
    email: document.getElementById("it-email").value.trim() || null,
    headline: document.getElementById("it-headline").value.trim(),
    sector: document.getElementById("it-sector").value.trim(),
    location: document.getElementById("it-location").value.trim(),
    years_experience: Number(document.getElementById("it-years").value || 0),
    preferred_work_arrangement: document.getElementById("it-arrangement").value,
    availability: document.getElementById("it-availability").value.trim() || "Immediate",
    languages: parseCsvList(document.getElementById("it-languages").value),
    portfolio_url: document.getElementById("it-portfolio").value.trim() || null,
    education: document.getElementById("it-education").value.trim() || null,
    summary: document.getElementById("it-summary").value.trim(),
    allow_mentor_discovery: true,
  };

  if (state.mode === "supabase") {
    const supabase = getSupabase();
    const { data: created, error } = await supabase.from("talent_profiles").insert(payload).select("*").single();
    if (error) {
      showToast(error.message, "error");
      return;
    }
    if (checkedSkillIds.length) {
      await supabase.from("talent_skills").insert(
        checkedSkillIds.map((skillId) => ({
          talent_profile_id: created.id,
          skill_id: skillId,
          proficiency: "intermediate",
          years_used: Math.max(1, payload.years_experience),
        }))
      );
    }
  } else {
    const local = loadLocalStore();
    const skillMap = new Map(local.skills.map((s) => [s.id, s]));
    const newTalent = {
      id: generateId(),
      ...payload,
      talent_skills: checkedSkillIds.map((id) => ({
        skill_id: id,
        proficiency: "intermediate",
        years_used: Math.max(1, payload.years_experience),
        skills: skillMap.get(id),
      })),
      portfolio_items: [],
    };
    local.talents.unshift(newTalent);
    saveLocalStore(local);
  }

  closeModal("intake-modal");
  showToast(`${payload.full_name} added to the Talent Pool!`, "success");
  await refreshAllData();
  document.getElementById("talent-section")?.scrollIntoView({ behavior: "smooth" });
}

async function handleEmployerIntakeSubmit(form) {
  const checkedSkillIds = Array.from(form.querySelectorAll('input[name="intake-skill"]:checked')).map((cb) => cb.value);
  const orgPayload = {
    name: document.getElementById("ie-org-name").value.trim(),
    contact_name: document.getElementById("ie-contact-name").value.trim(),
    sector: document.getElementById("ie-sector").value.trim(),
    location: document.getElementById("ie-location").value.trim(),
    is_verified: true,
  };
  const oppPayload = {
    title: document.getElementById("ie-title").value.trim(),
    category: document.getElementById("ie-category").value,
    sector: document.getElementById("ie-sector").value.trim(),
    location: document.getElementById("ie-location").value.trim(),
    work_arrangement: document.getElementById("ie-arrangement").value,
    min_experience_years: Number(document.getElementById("ie-min-exp").value || 0),
    duration: document.getElementById("ie-duration").value.trim() || null,
    compensation: document.getElementById("ie-comp").value.trim() || null,
    description: document.getElementById("ie-desc").value.trim(),
    status: "published",
  };

  if (state.mode === "supabase") {
    const supabase = getSupabase();
    const { data: org, error: orgErr } = await supabase.from("organisations").insert(orgPayload).select("*").single();
    if (orgErr) {
      showToast(orgErr.message, "error");
      return;
    }
    const { data: opp, error: oppErr } = await supabase
      .from("opportunities")
      .insert({ ...oppPayload, organisation_id: org.id })
      .select("*")
      .single();
    if (oppErr) {
      showToast(oppErr.message, "error");
      return;
    }
    if (checkedSkillIds.length) {
      await supabase.from("opportunity_skills").insert(
        checkedSkillIds.map((skillId) => ({ opportunity_id: opp.id, skill_id: skillId, is_required: true }))
      );
    }
  } else {
    const local = loadLocalStore();
    const skillMap = new Map(local.skills.map((s) => [s.id, s]));
    const newOrg = { id: generateId(), ...orgPayload };
    const newOpp = {
      id: generateId(),
      organisation_id: newOrg.id,
      organisations: newOrg,
      ...oppPayload,
      opportunity_skills: checkedSkillIds.map((id) => ({ skill_id: id, is_required: true, skills: skillMap.get(id) })),
    };
    local.organisations.unshift(newOrg);
    local.opportunities.unshift(newOpp);
    saveLocalStore(local);
  }

  closeModal("intake-modal");
  showToast(`"${oppPayload.title}" published to Opportunities!`, "success");
  await refreshAllData();
  document.getElementById("opportunities-section")?.scrollIntoView({ behavior: "smooth" });
}

async function handleMentorIntakeSubmit() {
  const payload = {
    full_name: document.getElementById("im-name").value.trim(),
    email: document.getElementById("im-email").value.trim() || null,
    headline: document.getElementById("im-headline").value.trim(),
    organisation_name: document.getElementById("im-org").value.trim() || null,
    sector: document.getElementById("im-sector").value.trim(),
    location: document.getElementById("im-location").value.trim(),
    availability: document.getElementById("im-availability").value.trim() || "Flexible",
    max_mentees: Math.max(1, Math.min(20, Number(document.getElementById("im-max").value || 3))),
    expertise: parseCsvList(document.getElementById("im-expertise").value),
    bio: document.getElementById("im-bio").value.trim(),
    is_accepting_requests: true,
  };

  if (state.mode === "supabase") {
    const supabase = getSupabase();
    const { error } = await supabase.from("mentor_profiles").insert(payload);
    if (error) {
      showToast(error.message, "error");
      return;
    }
  } else {
    const local = loadLocalStore();
    local.mentors.unshift({ id: generateId(), ...payload });
    saveLocalStore(local);
  }

  closeModal("intake-modal");
  showToast(`${payload.full_name} is now listed in Available Mentors!`, "success");
  await refreshAllData();
  document.getElementById("mentorship-section")?.scrollIntoView({ behavior: "smooth" });
}

async function handleApplySubmit(form) {
  const oppId = form.dataset.oppId;
  const talentId = document.getElementById("apply-talent-id").value;
  const coverNote = document.getElementById("apply-cover-note").value.trim() || null;

  const opp = state.opportunities.find((o) => String(o.id) === String(oppId));
  const tp = state.talents.find((t) => String(t.id) === String(talentId));
  const match = opp && tp ? computeMatchBreakdown(tp, tp.talent_skills || [], opp, opp.opportunity_skills || []) : { score: 75 };

  if (state.mode === "supabase") {
    const supabase = getSupabase();
    const { error } = await supabase.from("applications").insert({
      opportunity_id: oppId,
      talent_profile_id: talentId,
      cover_note: coverNote,
      match_score: match.score,
      status: "submitted",
    });
    if (error) {
      showToast(error.message, "error");
      return;
    }
  } else {
    const local = loadLocalStore();
    const dup = local.applications.find((a) => a.opportunity_id === oppId && a.talent_profile_id === talentId);
    if (dup) {
      showToast("This talent profile has already applied to this opportunity.", "error");
      return;
    }
    local.applications.unshift({
      id: generateId(),
      opportunity_id: oppId,
      talent_profile_id: talentId,
      cover_note: coverNote,
      match_score: match.score,
      status: "submitted",
      employer_notes: "",
    });
    saveLocalStore(local);
  }

  closeModal("detail-modal");
  showToast(`Application submitted (${match.score}% match)!`, "success");
  await refreshAllData();
  document.getElementById("pipeline-section")?.scrollIntoView({ behavior: "smooth" });
}

async function handleMentorRequestSubmit(form) {
  const mentorId = form.dataset.mentorId;
  const talentId = document.getElementById("mr-talent-id").value;
  const goal = document.getElementById("mr-goal").value.trim();
  const message = document.getElementById("mr-message").value.trim() || null;

  if (state.mode === "supabase") {
    const supabase = getSupabase();
    const { error } = await supabase.from("mentorship_requests").insert({
      talent_profile_id: talentId,
      mentor_profile_id: mentorId,
      goal,
      message,
      status: "pending",
    });
    if (error) {
      showToast(error.message, "error");
      return;
    }
  } else {
    const local = loadLocalStore();
    local.mentorshipRequests.unshift({
      id: generateId(),
      talent_profile_id: talentId,
      mentor_profile_id: mentorId,
      goal,
      message,
      status: "pending",
      mentor_response: "",
    });
    saveLocalStore(local);
  }

  closeModal("detail-modal");
  showToast("Mentorship request sent!", "success");
  await refreshAllData();
}

// EVENT BINDING & BOOTSTRAP

function bindEvents() {
  document.getElementById("public-menu-toggle")?.addEventListener("click", () => {
    const nav = document.getElementById("public-nav");
    nav?.classList.toggle("open");
  });

  document.getElementById("opp-search")?.addEventListener("input", renderOpportunities);
  document.getElementById("opp-category")?.addEventListener("change", renderOpportunities);
  document.getElementById("talent-search")?.addEventListener("input", renderTalentPool);
  document.getElementById("refresh-impact-btn")?.addEventListener("click", refreshAllData);

  document.addEventListener("click", async (e) => {
    const closeBtn = e.target.closest("[data-modal-close]");
    if (closeBtn) {
      closeModal(closeBtn.dataset.modalClose);
      return;
    }

    const intakeBtn = e.target.closest("[data-open-intake]");
    if (intakeBtn) {
      openIntakeModal(intakeBtn.dataset.openIntake);
      return;
    }

    const viewOppBtn = e.target.closest("[data-view-opp]");
    if (viewOppBtn) {
      handleViewOpportunity(viewOppBtn.dataset.viewOpp);
      return;
    }

    const applyOppBtn = e.target.closest("[data-apply-opp]");
    if (applyOppBtn) {
      handleOpenApplyModal(applyOppBtn.dataset.applyOpp);
      return;
    }

    const viewTalBtn = e.target.closest("[data-view-talent]");
    if (viewTalBtn) {
      handleViewTalent(viewTalBtn.dataset.viewTalent);
      return;
    }

    const matchTalBtn = e.target.closest("[data-match-talent]");
    if (matchTalBtn) {
      handleMatchTalentToRoles(matchTalBtn.dataset.matchTalent);
      return;
    }

    const reqMenBtn = e.target.closest("[data-request-mentor]");
    if (reqMenBtn) {
      handleOpenMentorRequest(reqMenBtn.dataset.requestMentor);
      return;
    }

    const saveMrBtn = e.target.closest("[data-save-mr]");
    if (saveMrBtn) {
      const mrId = saveMrBtn.dataset.saveMr;
      const status = document.querySelector(`.mr-status-select[data-mr-id="${mrId}"]`)?.value;
      const responseText = document.querySelector(`.mr-response-input[data-mr-id="${mrId}"]`)?.value ?? "";
      if (state.mode === "supabase") {
        const { error } = await getSupabase().from("mentorship_requests").update({ status, mentor_response: responseText }).eq("id", mrId);
        if (error) {
          showToast(error.message, "error");
          return;
        }
      } else {
        const local = loadLocalStore();
        const item = local.mentorshipRequests.find((x) => x.id === mrId);
        if (item) {
          item.status = status;
          item.mentor_response = responseText;
          saveLocalStore(local);
        }
      }
      showToast("Mentorship request updated.", "success");
      await refreshAllData();
      return;
    }

    const saveAppBtn = e.target.closest("[data-save-app]");
    if (saveAppBtn) {
      const appId = saveAppBtn.dataset.saveApp;
      const status = document.querySelector(`.app-status-select[data-app-id="${appId}"]`)?.value;
      const notes = document.querySelector(`.app-notes-input[data-app-id="${appId}"]`)?.value ?? "";
      if (state.mode === "supabase") {
        const { error } = await getSupabase().from("applications").update({ status, employer_notes: notes }).eq("id", appId);
        if (error) {
          showToast(error.message, "error");
          return;
        }
      } else {
        const local = loadLocalStore();
        const item = local.applications.find((x) => x.id === appId);
        if (item) {
          item.status = status;
          item.employer_notes = notes;
          saveLocalStore(local);
        }
      }
      showToast("Application stage updated.", "success");
      await refreshAllData();
      return;
    }

    const recOutBtn = e.target.closest("[data-record-outcome]");
    if (recOutBtn) {
      const appId = recOutBtn.dataset.recordOutcome;
      const app = state.applications.find((a) => String(a.id) === String(appId));
      const opp = state.opportunities.find((o) => String(o.id) === String(app?.opportunity_id));
      if (!app || !opp) return;

      const outcomeType = opp.category === "remote_work" ? "remote_contract" : opp.category;
      const payload = {
        talent_profile_id: app.talent_profile_id,
        organisation_id: opp.organisation_id,
        opportunity_id: opp.id,
        application_id: app.id,
        outcome_type: outcomeType,
        outcome_status: "confirmed",
        notes: `Confirmed placement for ${opp.title}.`,
        recorded_at: new Date().toISOString(),
      };

      if (state.mode === "supabase") {
        const { error } = await getSupabase().from("outcome_records").insert(payload);
        if (error) {
          showToast(error.message, "error");
          return;
        }
      } else {
        const local = loadLocalStore();
        local.outcomes.unshift({ id: generateId(), ...payload });
        saveLocalStore(local);
      }
      showToast("Placement outcome confirmed!", "success");
      await refreshAllData();
    }
  });

  document.addEventListener("submit", async (e) => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    e.preventDefault();

    if (form.id === "intake-talent-form") await handleTalentIntakeSubmit(form);
    else if (form.id === "intake-employer-form") await handleEmployerIntakeSubmit(form);
    else if (form.id === "intake-mentor-form") await handleMentorIntakeSubmit();
    else if (form.id === "apply-opp-form") await handleApplySubmit(form);
    else if (form.id === "request-mentor-form") await handleMentorRequestSubmit(form);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  if (typeof isSupabaseConfigured === "function" && !isSupabaseConfigured()) {
    console.info("Supabase not configured; running interactive local showcase mode.");
  }
  refreshAllData();
});
