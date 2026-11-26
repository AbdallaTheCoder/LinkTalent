import { getSupabase, isSupabaseConfigured } from "./config.js";

const STORAGE_KEY = "talentlink_hackathon_db_v2";

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

// LABELS & COMPLIANCE FORMATTERS

const WORK_AUTH_LABELS = {
  verified_refugee_work_permit: "Refugee ID / Work Permit Ready",
  kenyan_national_id: "Kenyan National ID Ready",
  eac_citizen_work_eligible: "EAC Citizen Work Eligible",
  remote_contractor_eligible: "Remote Contractor Eligible",
  onboarding_support_needed: "Work-Auth Onboarding Support Needed",
};

const PAYOUT_LABELS = {
  mpesa_and_bank_ready: "KES Bank & M-Pesa Ready",
  mpesa_ready: "M-Pesa Payout Ready",
  bank_account_ready: "KES Bank Account Ready",
  assistance_needed: "Payout Account Setup Needed",
};

const BRIDGING_STATUS_LABELS = {
  certified: "Bridging / Credential Certified",
  in_progress: "Bridging Pathway In Progress",
  not_needed: "Standard Credential Verified",
};

const EVIDENCE_TYPE_LABELS = {
  project_portfolio: "Project Portfolio",
  bridging_credential: "Bridging Credential",
  rpl_assessment: "RPL / Trade Assessment",
  work_sample: "Verified Work Sample",
};

const VERIFICATION_SOURCE_LABELS = {
  credential_verified: "Credential Verified",
  mentor_endorsed: "Mentor Endorsed",
  portfolio_backed: "Portfolio Backed",
  self_reported: "Self-Reported",
};

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
    shortlisted: "badge-blue",
    interview: "badge-blue",
    accepted: "badge-green",
    rejected: "badge-red",
    withdrawn: "badge-red",
    pending: "badge-amber",
    completed: "badge-green",
    verified: "badge-green",
    confirmed: "badge-green",
    recorded: "badge-teal",
    certified: "badge-green",
    in_progress: "badge-amber",
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

// EXPLAINABLE MATCH & READINESS ENGINE

const PROFICIENCY_WEIGHT = {
  beginner: 0.6,
  intermediate: 0.8,
  advanced: 0.93,
  expert: 1.0,
};

const VERIFICATION_BONUS = {
  credential_verified: 1.0,
  mentor_endorsed: 0.98,
  portfolio_backed: 0.95,
  self_reported: 0.82,
};

function computeMatchBreakdown(talentProfile, talentSkills = [], opportunity, opportunitySkills = []) {
  const oppSkillList = Array.isArray(opportunitySkills) ? opportunitySkills : [];
  const talSkillList = Array.isArray(talentSkills) ? talentSkills : [];

  const talentSkillMap = new Map();
  for (const ts of talSkillList) {
    const skillId = ts.skill_id || ts.skills?.id;
    const skillName = (ts.skills?.name || "").toLowerCase();
    const record = {
      name: ts.skills?.name || "",
      proficiency: ts.proficiency || "intermediate",
      verification_source: ts.verification_source || "self_reported",
    };
    if (skillId) talentSkillMap.set(String(skillId), record);
    if (skillName) talentSkillMap.set(skillName, record);
  }

  let skillScore = 65;
  const matchedSkills = [];
  const verifiedMatchedSkills = [];
  const missingRequiredSkills = [];

  if (oppSkillList.length > 0) {
    let earnedWeight = 0;
    let totalWeight = 0;
    for (const os of oppSkillList) {
      const skillId = os.skill_id || os.skills?.id;
      const skillName = os.skills?.name || "Skill";
      const weight = os.is_required ? 2 : 1;
      totalWeight += weight;

      const match =
        (skillId && talentSkillMap.get(String(skillId))) ||
        talentSkillMap.get(skillName.toLowerCase());

      if (match) {
        const profFactor = PROFICIENCY_WEIGHT[match.proficiency] ?? 0.8;
        const verFactor = VERIFICATION_BONUS[match.verification_source] ?? 0.82;
        earnedWeight += weight * profFactor * verFactor;
        matchedSkills.push(skillName);
        if (match.verification_source !== "self_reported") {
          verifiedMatchedSkills.push(skillName);
        }
      } else if (os.is_required) {
        missingRequiredSkills.push(skillName);
      }
    }
    skillScore = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 70;
  }

  // Verification & Portfolio Readiness Score (15% weight)
  const verifiedItems = (talentProfile?.portfolio_items || []).filter((p) => p.evidence_status === "verified").length;
  const bridgingCertified = talentProfile?.bridging_status === "certified";
  let verificationScore = 50;
  if (verifiedItems > 0 && bridgingCertified) verificationScore = 100;
  else if (verifiedItems > 0 || bridgingCertified) verificationScore = 88;
  else if ((talentProfile?.portfolio_items || []).length > 0) verificationScore = 70;

  // Sector & Experience Fit (20% weight)
  const oppSector = (opportunity.sector || "").trim().toLowerCase();
  const talSector = (talentProfile?.sector || "").trim().toLowerCase();
  let sectorScore = 65;
  if (!oppSector || oppSector === "general") sectorScore = 80;
  else if (talSector && (talSector === oppSector || talSector.includes(oppSector) || oppSector.includes(talSector))) {
    sectorScore = 100;
  }

  const reqYears = Number(opportunity.min_experience_years || 0);
  const talYears = Number(talentProfile?.years_experience || 0);
  const expScore = reqYears <= 0 || talYears >= reqYears ? 100 : Math.max(30, Math.round((talYears / reqYears) * 85));
  const experienceAndSectorScore = Math.round(sectorScore * 0.5 + expScore * 0.5);

  // Access, Compliance & Arrangement Readiness (15% weight)
  const workAuthOk = talentProfile?.work_authorization_status && talentProfile.work_authorization_status !== "onboarding_support_needed";
  const payoutOk = talentProfile?.payout_readiness && talentProfile.payout_readiness !== "assistance_needed";
  let arrangementFit = 80;
  if (opportunity.work_arrangement && talentProfile?.preferred_work_arrangement === opportunity.work_arrangement) {
    arrangementFit = 100;
  } else if (opportunity.work_arrangement === "remote" || talentProfile?.preferred_work_arrangement === "remote") {
    arrangementFit = 90;
  }
  const complianceScore = Math.round(
    (workAuthOk ? 40 : 15) + (payoutOk ? 30 : 10) + arrangementFit * 0.3
  );

  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        skillScore * 0.5 +
        verificationScore * 0.15 +
        experienceAndSectorScore * 0.2 +
        complianceScore * 0.15
      )
    )
  );

  const gapText = missingRequiredSkills.length
    ? `Missing required: ${missingRequiredSkills.join(", ")}.`
    : "All required role skills covered.";

  return {
    score,
    skillScore,
    verificationScore,
    experienceAndSectorScore,
    complianceScore,
    matchedSkills,
    verifiedMatchedSkills,
    missingRequiredSkills,
    workAuthOk,
    payoutOk,
    summary: `${matchedSkills.length}/${oppSkillList.length} skills matched (${verifiedMatchedSkills.length} verified). ${gapText}`,
  };
}

// LOCAL FALLBACK SEED DATA (MIRRORS seed.sql)

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
    {
      id: "org-1",
      name: "Savanna Cloud Systems",
      organisation_type: "Private Tech Employer",
      contact_name: "David Ochieng",
      sector: "Technology",
      location: "Nairobi, Kenya",
      supports_refugee_onboarding: true,
      payout_methods: ["KES Bank Transfer", "M-Pesa", "USD Wise/Payoneer"],
      is_verified: true,
    },
    {
      id: "org-2",
      name: "Nairobi Digital Craft Studio",
      organisation_type: "Digital Agency Partner",
      contact_name: "Kevin Kamau",
      sector: "Design & Digital Media",
      location: "Nairobi, Kenya",
      supports_refugee_onboarding: true,
      payout_methods: ["KES Bank Transfer", "M-Pesa"],
      is_verified: true,
    },
    {
      id: "org-3",
      name: "Rift Valley Solar & AgriTech",
      organisation_type: "Social Enterprise Employer",
      contact_name: "Beatrice Chebet",
      sector: "Clean Energy",
      location: "Nakuru & Turkana, Kenya",
      supports_refugee_onboarding: true,
      payout_methods: ["M-Pesa", "KES Bank Transfer"],
      is_verified: true,
    },
    {
      id: "org-4",
      name: "East Africa Humanitarian Analytics",
      organisation_type: "NGO & Institutional Partner",
      contact_name: "Josephine Mutua",
      sector: "Humanitarian & Development",
      location: "Nairobi, Kenya",
      supports_refugee_onboarding: true,
      payout_methods: ["KES Bank Transfer", "M-Pesa"],
      is_verified: true,
    },
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
      cohort_tag: "Cohort 2026-A - Turkana Digital",
      education: "Diploma in Software Development - Power Learn Project",
      bridging_pathway: "Power Learn Project Software Track + GitHub Code Audit",
      bridging_status: "certified",
      years_experience: 3,
      sector: "Technology",
      languages: ["English", "Somali", "Swahili"],
      preferred_work_arrangement: "remote",
      availability: "Immediate",
      portfolio_url: "https://github.com/abdirahman-dev-demo",
      work_authorization_status: "verified_refugee_work_permit",
      payout_readiness: "mpesa_and_bank_ready",
      odpc_consent_granted: true,
      talent_skills: [
        { skill_id: "sk-1", proficiency: "advanced", years_used: 3, verification_source: "mentor_endorsed", endorsed_by: "Grace Wanjiku", skills: skillByName["JavaScript"] },
        { skill_id: "sk-2", proficiency: "intermediate", years_used: 2, verification_source: "portfolio_backed", endorsed_by: "Coop Portal Repo", skills: skillByName["PostgreSQL"] },
      ],
      portfolio_items: [
        {
          id: "pi-1",
          talent_profile_id: "tal-1",
          title: "Community Cooperative Inventory Portal",
          evidence_type: "project_portfolio",
          bridging_body: "Power Learn Project / GitHub Audit",
          description: "Role-based web portal with JavaScript and PostgreSQL tracking daily sales and inventory.",
          evidence_status: "verified",
          verified_by_name: "Grace Wanjiku",
          review_notes: "Verified repository commit history and relational schema.",
          project_url: "https://github.com/abdirahman-dev-demo/coop-portal",
        },
      ],
    },
    {
      id: "tal-2",
      full_name: "Halima Osman",
      email: "halima@demo.org",
      headline: "Remote Customer Operations & Cloud Support Associate",
      summary: "Bilingual communicator skilled in CRM ticketing, technical troubleshooting, and digital onboarding.",
      location: "Dadaab, Kenya",
      cohort_tag: "Cohort 2026-A - Garissa & Dadaab Cloud",
      education: "Certificate in Digital Literacy & Azure Fundamentals (AZ-900)",
      bridging_pathway: "Microsoft Azure Fundamentals (AZ-900) Bridging Credential",
      bridging_status: "certified",
      years_experience: 1,
      sector: "Digital Operations",
      languages: ["Somali", "English", "Swahili"],
      preferred_work_arrangement: "remote",
      availability: "Immediate",
      portfolio_url: "https://halima-ops.example.org",
      work_authorization_status: "verified_refugee_work_permit",
      payout_readiness: "mpesa_ready",
      odpc_consent_granted: true,
      talent_skills: [
        { skill_id: "sk-11", proficiency: "intermediate", years_used: 1, verification_source: "self_reported", endorsed_by: null, skills: skillByName["Customer Support (CRM)"] },
        { skill_id: "sk-12", proficiency: "beginner", years_used: 1, verification_source: "credential_verified", endorsed_by: "Microsoft AZ-900", skills: skillByName["Cloud Fundamentals (Azure)"] },
      ],
      portfolio_items: [
        {
          id: "pi-3",
          talent_profile_id: "tal-2",
          title: "Microsoft Azure Fundamentals (AZ-900) & Helpdesk Playbook",
          evidence_type: "bridging_credential",
          bridging_body: "Microsoft Learn / AZ-900",
          description: "AZ-900 certification and remote helpdesk escalation playbook for distributed teams.",
          evidence_status: "under_review",
          verified_by_name: null,
          review_notes: "Awaiting final mentor endorsement on ticket simulation.",
          project_url: "https://halima-ops.example.org/az900-playbook",
        },
      ],
    },
    {
      id: "tal-3",
      full_name: "Nyabol Gatluak",
      email: "nyabol@demo.org",
      headline: "Monitoring, Evaluation & Data Analyst (SQL & Python)",
      summary: "Quantitative analyst specializing in household survey design, KoboToolbox pipelines, and SQL cleaning.",
      location: "Nairobi, Kenya",
      cohort_tag: "Cohort 2026-B - Nairobi Urban Livelihoods",
      education: "BSc in Statistics & Data Analytics Certificate",
      bridging_pathway: "Foreign Degree Equivalency + KNQA / Portfolio SQL Audit",
      bridging_status: "certified",
      years_experience: 4,
      sector: "Humanitarian & Development",
      languages: ["English", "Arabic", "Nuer", "Swahili"],
      preferred_work_arrangement: "hybrid",
      availability: "2 weeks notice",
      portfolio_url: "https://nyabol-analytics.example.org",
      work_authorization_status: "eac_citizen_work_eligible",
      payout_readiness: "mpesa_and_bank_ready",
      odpc_consent_granted: true,
      talent_skills: [
        { skill_id: "sk-3", proficiency: "intermediate", years_used: 2, verification_source: "mentor_endorsed", endorsed_by: "Samuel Deng", skills: skillByName["Python"] },
        { skill_id: "sk-4", proficiency: "advanced", years_used: 3, verification_source: "portfolio_backed", endorsed_by: "Turkana Dashboard", skills: skillByName["SQL Analytics"] },
        { skill_id: "sk-5", proficiency: "expert", years_used: 4, verification_source: "portfolio_backed", endorsed_by: "Turkana Dashboard", skills: skillByName["KoboToolbox"] },
        { skill_id: "sk-6", proficiency: "expert", years_used: 4, verification_source: "mentor_endorsed", endorsed_by: "Samuel Deng", skills: skillByName["Monitoring & Evaluation"] },
      ],
      portfolio_items: [
        {
          id: "pi-2",
          talent_profile_id: "tal-3",
          title: "Turkana Youth Livelihoods Dashboard",
          evidence_type: "work_sample",
          bridging_body: "East Africa Humanitarian Analytics",
          description: "Analyzed 1,400 anonymized KoboToolbox survey responses to map training outcomes.",
          evidence_status: "verified",
          verified_by_name: "Samuel Deng",
          review_notes: "Methodology, SQL cleaning scripts, and ODPC anonymization verified.",
          project_url: "https://nyabol-analytics.example.org/turkana-dashboard",
        },
      ],
    },
    {
      id: "tal-4",
      full_name: "Dawit Tesfaye",
      email: "dawit@demo.org",
      headline: "Certified Solar PV Installation & Mini-Grid Technician",
      summary: "Electrical and solar energy technician with five years maintaining off-grid solar arrays and water pumps.",
      location: "Kakuma, Kenya",
      cohort_tag: "Cohort 2026-A - Turkana Green Energy",
      education: "NITA Grade II Electrical Wireman & EPRA T2 Solar PV Training",
      bridging_pathway: "NITA Recognition of Prior Learning (RPL) + EPRA T2 Solar Licensing",
      bridging_status: "in_progress",
      years_experience: 5,
      sector: "Clean Energy",
      languages: ["Amharic", "English", "Swahili"],
      preferred_work_arrangement: "onsite",
      availability: "Immediate",
      portfolio_url: "",
      work_authorization_status: "verified_refugee_work_permit",
      payout_readiness: "mpesa_and_bank_ready",
      odpc_consent_granted: true,
      talent_skills: [
        { skill_id: "sk-9", proficiency: "expert", years_used: 5, verification_source: "credential_verified", endorsed_by: "NITA Grade II RPL", skills: skillByName["Solar PV Installation"] },
        { skill_id: "sk-10", proficiency: "advanced", years_used: 4, verification_source: "self_reported", endorsed_by: null, skills: skillByName["Off-Grid Mini-Grids"] },
      ],
      portfolio_items: [
        {
          id: "pi-4",
          talent_profile_id: "tal-4",
          title: "NITA Grade II RPL & 12kW Solar Borehole Commissioning Log",
          evidence_type: "rpl_assessment",
          bridging_body: "NITA / EPRA T2 Pathway",
          description: "Installation, load testing, and maintenance log for a community solar water pumping station.",
          evidence_status: "under_review",
          verified_by_name: null,
          review_notes: "Field commissioning log submitted for EPRA T2 supervisor sign-off.",
          project_url: "",
        },
      ],
    },
  ];

  const makeOppSkills = (names) =>
    names.map((n, idx) => ({ skill_id: skillByName[n].id, is_required: idx === 0, skills: skillByName[n] }));

  const opportunities = [
    {
      id: "opp-1",
      organisation_id: "org-1",
      organisations: orgById["org-1"],
      title: "Customer Support & Cloud Onboarding Associate",
      description: "Provide responsive email and chat support for SaaS clients and assist with cloud account onboarding.",
      deliverables: "Resolve 25+ daily tickets within 2-hour SLA; author 4 cloud onboarding guides per month.",
      screening_criteria: "Practical CRM ticket simulation + verified AZ-900 or cloud fundamentals evidence.",
      category: "employment",
      sector: "Digital Operations",
      min_experience_years: 1,
      location: "Nairobi, Kenya",
      work_arrangement: "hybrid",
      duration: "Full-time permanent",
      compensation: "KES 70,000 / month",
      payout_channel: "KES Bank Transfer / M-Pesa",
      work_auth_requirement: "Kenyan ID, Refugee Work Permit, or EAC Eligible",
      status: "published",
      opportunity_skills: makeOppSkills(["Customer Support (CRM)", "Cloud Fundamentals (Azure)"]),
    },
    {
      id: "opp-2",
      organisation_id: "org-3",
      organisations: orgById["org-3"],
      title: "Community Solar Operations Technician",
      description: "Install, commission, and maintain off-grid solar cold-storage units for smallholder cooperatives.",
      deliverables: "Commission 3 cold-storage solar arrays per quarter and submit monthly voltage logs.",
      screening_criteria: "NITA electrical RPL/certificate + field commissioning safety checklist review.",
      category: "employment",
      sector: "Clean Energy",
      min_experience_years: 3,
      location: "Kakuma, Kenya",
      work_arrangement: "onsite",
      duration: "Full-time",
      compensation: "KES 75,000 / month",
      payout_channel: "M-Pesa / KES Bank Transfer",
      work_auth_requirement: "Refugee Work Permit or Kenyan National ID",
      status: "published",
      opportunity_skills: makeOppSkills(["Solar PV Installation", "Off-Grid Mini-Grids"]),
    },
    {
      id: "opp-3",
      organisation_id: "org-2",
      organisations: orgById["org-2"],
      title: "Product Design Intern (UI/UX & Accessibility)",
      description: "Build Figma component libraries, run usability tests, and improve mobile web accessibility.",
      deliverables: "Deliver 1 accessible mobile component kit and 2 usability test summaries.",
      screening_criteria: "Portfolio review of at least one Figma case study demonstrating WCAG compliance.",
      category: "internship",
      sector: "Design & Digital Media",
      min_experience_years: 0,
      location: "Nairobi, Kenya",
      work_arrangement: "hybrid",
      duration: "4-month paid internship",
      compensation: "KES 45,000 / month",
      payout_channel: "M-Pesa / KES Bank Transfer",
      work_auth_requirement: "Open to Youth, Students & Refugee ID Holders",
      status: "published",
      opportunity_skills: makeOppSkills(["Figma", "UI/UX Design"]),
    },
    {
      id: "opp-4",
      organisation_id: "org-1",
      organisations: orgById["org-1"],
      title: "Backend PostgreSQL & API Engineering Intern",
      description: "Learn production database modeling, SQL optimization, and REST API testing alongside senior engineers.",
      deliverables: "Write 10+ automated API integration tests and optimize slow SQL queries.",
      screening_criteria: "Live SQL schema walkthrough + GitHub repository review.",
      category: "internship",
      sector: "Technology",
      min_experience_years: 0,
      location: "Nairobi, Kenya",
      work_arrangement: "hybrid",
      duration: "6-month paid internship",
      compensation: "KES 50,000 / month",
      payout_channel: "KES Bank Transfer / M-Pesa",
      work_auth_requirement: "Kenyan ID, Refugee Work Permit, or Remote Stipend Eligible",
      status: "published",
      opportunity_skills: makeOppSkills(["PostgreSQL", "JavaScript"]),
    },
    {
      id: "opp-5",
      organisation_id: "org-4",
      organisations: orgById["org-4"],
      title: "Livelihoods Data & M&E Fellow",
      description: "Clean KoboToolbox survey datasets, automate SQL validation queries, and publish quarterly impact reports.",
      deliverables: "Clean 2,000+ household survey records and maintain an automated SQL/Python dashboard.",
      screening_criteria: "Technical SQL data-cleaning exercise + verified M&E work sample.",
      category: "fellowship",
      sector: "Humanitarian & Development",
      min_experience_years: 2,
      location: "Nairobi, Kenya",
      work_arrangement: "hybrid",
      duration: "9-month paid fellowship",
      compensation: "KES 85,000 / month",
      payout_channel: "KES Bank Transfer / M-Pesa",
      work_auth_requirement: "Refugee ID / Work Permit or EAC Work Eligible",
      status: "published",
      opportunity_skills: makeOppSkills(["SQL Analytics", "KoboToolbox", "Monitoring & Evaluation"]),
    },
    {
      id: "opp-6",
      organisation_id: "org-4",
      organisations: orgById["org-4"],
      title: "Civic Tech & Open Data Research Fellow",
      description: "Analyze regional labor market datasets in Python and build open-access visualizations for partner NGOs.",
      deliverables: "Publish 2 open-data policy briefs and reproducible Python notebooks.",
      screening_criteria: "Review of a reproducible Python/SQL analytical notebook.",
      category: "fellowship",
      sector: "Humanitarian & Development",
      min_experience_years: 1,
      location: "Nairobi, Kenya",
      work_arrangement: "hybrid",
      duration: "6-month fellowship",
      compensation: "KES 80,000 / month",
      payout_channel: "KES Bank Transfer / M-Pesa",
      work_auth_requirement: "Refugee ID / Work Permit or EAC Work Eligible",
      status: "published",
      opportunity_skills: makeOppSkills(["Python", "SQL Analytics"]),
    },
    {
      id: "opp-7",
      organisation_id: "org-3",
      organisations: orgById["org-3"],
      title: "Solar Mini-Grid Field Technician Apprentice",
      description: "Support installation, diagnostics, and routine maintenance of 15kW-50kW community solar mini-grids.",
      deliverables: "Complete 120 supervised field commissioning hours toward EPRA T2 licensing.",
      screening_criteria: "Practical wiring diagnostic test + NITA RPL enrollment or equivalent.",
      category: "apprenticeship",
      sector: "Clean Energy",
      min_experience_years: 1,
      location: "Kakuma & Lodwar, Kenya",
      work_arrangement: "onsite",
      duration: "6-month apprenticeship",
      compensation: "KES 55,000 / month",
      payout_channel: "M-Pesa / KES Bank Transfer",
      work_auth_requirement: "Refugee Work Permit or Kenyan National ID",
      status: "published",
      opportunity_skills: makeOppSkills(["Solar PV Installation", "Off-Grid Mini-Grids"]),
    },
    {
      id: "opp-8",
      organisation_id: "org-2",
      organisations: orgById["org-2"],
      title: "Digital Accessibility & Web Production Apprentice",
      description: "Audit websites for WCAG accessibility and build responsive UI components with senior designers.",
      deliverables: "Audit 5 partner NGO web pages for WCAG AA compliance and ship responsive fixes.",
      screening_criteria: "Short accessibility critique exercise + basic Figma wireframe.",
      category: "apprenticeship",
      sector: "Design & Digital Media",
      min_experience_years: 0,
      location: "Nairobi, Kenya",
      work_arrangement: "hybrid",
      duration: "6-month apprenticeship",
      compensation: "KES 48,000 / month",
      payout_channel: "M-Pesa / KES Bank Transfer",
      work_auth_requirement: "Open to Youth & Refugee ID Holders",
      status: "published",
      opportunity_skills: makeOppSkills(["UI/UX Design", "Figma"]),
    },
    {
      id: "opp-9",
      organisation_id: "org-1",
      organisations: orgById["org-1"],
      title: "Junior Full-Stack Web Developer (Remote)",
      description: "Build modular web applications, PostgreSQL schemas, and REST integrations for East African SMEs.",
      deliverables: "Ship 2 production feature sprints per month with documented PostgreSQL migrations.",
      screening_criteria: "Verified GitHub repository review + 45-minute practical pair-programming session.",
      category: "remote_work",
      sector: "Technology",
      min_experience_years: 2,
      location: "Remote (East Africa)",
      work_arrangement: "remote",
      duration: "12-month contract",
      compensation: "KES 120,000 / month",
      payout_channel: "KES Bank Transfer / M-Pesa / USD Wise",
      work_auth_requirement: "Remote Independent Contractor Eligible (No Relocation Needed)",
      status: "published",
      opportunity_skills: makeOppSkills(["JavaScript", "PostgreSQL"]),
    },
    {
      id: "opp-10",
      organisation_id: "org-1",
      organisations: orgById["org-1"],
      title: "Remote Cloud Helpdesk & CRM Specialist",
      description: "Manage distributed client support queues, troubleshoot cloud permissions, and maintain knowledge bases.",
      deliverables: "Maintain 95%+ CSAT across remote queues and update 10 troubleshooting runbooks monthly.",
      screening_criteria: "Written escalation simulation + AZ-900 or verified support portfolio.",
      category: "remote_work",
      sector: "Digital Operations",
      min_experience_years: 1,
      location: "Remote (Kenya)",
      work_arrangement: "remote",
      duration: "12-month remote contract",
      compensation: "KES 78,000 / month",
      payout_channel: "M-Pesa / KES Bank Transfer",
      work_auth_requirement: "Remote Independent Contractor Eligible",
      status: "published",
      opportunity_skills: makeOppSkills(["Customer Support (CRM)", "Cloud Fundamentals (Azure)"]),
    },
  ];

  const mentors = [
    { id: "men-1", full_name: "Grace Wanjiku", headline: "Staff Software Engineer & Technical Interview Coach", organisation_name: "Safaricom Digital Labs", sector: "Technology", location: "Nairobi, Kenya", expertise: ["JavaScript", "PostgreSQL", "GitHub Portfolios", "Technical Interviews"], bio: "Ten years building scalable web platforms across East Africa.", availability: "2 hours/week (Tue & Thu evenings EAT)", max_mentees: 4, is_accepting_requests: true, can_verify_credentials: true },
    { id: "men-2", full_name: "Samuel Deng", headline: "Regional M&E and Data Science Lead", organisation_name: "East Africa Livelihoods Initiative", sector: "Humanitarian & Development", location: "Kampala, Uganda (Remote)", expertise: ["SQL Analytics", "Python", "KoboToolbox", "Impact Evaluation"], bio: "Leads regional data teams measuring youth employment outcomes.", availability: "1.5 hours/week (Saturdays EAT)", max_mentees: 3, is_accepting_requests: true, can_verify_credentials: true },
    { id: "men-3", full_name: "Farah Abdi", headline: "Renewable Energy Operations & Licensing Advisor", organisation_name: "SunGrid East Africa", sector: "Clean Energy", location: "Nairobi, Kenya", expertise: ["Solar PV Installation", "Off-Grid Mini-Grids", "EPRA Licensing"], bio: "Advises technicians transitioning into certified commercial mini-grid operations.", availability: "1 hour/week (Wednesdays EAT)", max_mentees: 2, is_accepting_requests: true, can_verify_credentials: true },
    { id: "men-4", full_name: "Lydia Mwangi", headline: "Senior Product Designer & Career Coach", organisation_name: "Nairobi Design Collective", sector: "Design & Digital Media", location: "Nairobi, Kenya", expertise: ["Figma", "UI/UX Design", "Portfolio Reviews"], bio: "Supports emerging UI/UX designers with accessible design critiques.", availability: "2 hours/week (Fridays EAT)", max_mentees: 3, is_accepting_requests: true, can_verify_credentials: true },
  ];

  const applications = [
    { id: "app-1", opportunity_id: "opp-9", talent_profile_id: "tal-1", cover_note: "Built production JavaScript and PostgreSQL apps for community cooperatives.", match_score: 96, status: "accepted", employer_notes: "Strong verified portfolio, mentor endorsement, and clean technical interview." },
    { id: "app-2", opportunity_id: "opp-5", talent_profile_id: "tal-3", cover_note: "Over four years managing KoboToolbox surveys and SQL reporting.", match_score: 94, status: "accepted", employer_notes: "Top-scoring candidate in SQL assessment with verified dashboard." },
    { id: "app-3", opportunity_id: "opp-10", talent_profile_id: "tal-2", cover_note: "Combining AZ-900 certification with trilingual helpdesk experience.", match_score: 90, status: "shortlisted", employer_notes: "Shortlisted for written simulation." },
    { id: "app-4", opportunity_id: "opp-7", talent_profile_id: "tal-4", cover_note: "Certified NITA Grade II technician ready to complete EPRA T2 field hours.", match_score: 95, status: "interview", employer_notes: "Scheduled for field commissioning review." },
  ];

  const mentorshipRequests = [
    { id: "mr-1", talent_profile_id: "tal-1", mentor_profile_id: "men-1", goal: "Prepare for full-stack technical interviews and PostgreSQL reviews", message: "Looking for mock interview practice.", status: "completed", mentor_response: "Completed four sessions covering system design and SQL indexing." },
    { id: "mr-2", talent_profile_id: "tal-3", mentor_profile_id: "men-2", goal: "Strengthen Python automation for humanitarian M&E pipelines", message: "Want to automate KoboToolbox cleaning scripts.", status: "accepted", mentor_response: "Glad to work together during our Saturday check-in." },
    { id: "mr-3", talent_profile_id: "tal-4", mentor_profile_id: "men-3", goal: "Navigate EPRA T2 commercial solar licensing requirements", message: "Need advice on logging field hours.", status: "pending", mentor_response: "" },
    { id: "mr-4", talent_profile_id: "tal-2", mentor_profile_id: "men-4", goal: "Transition from customer support into digital product accessibility", message: "Interested in Figma basics and user research.", status: "pending", mentor_response: "" },
  ];

  const outcomes = [
    { id: "out-1", talent_profile_id: "tal-1", organisation_id: "org-1", opportunity_id: "opp-9", application_id: "app-1", outcome_type: "remote_contract", outcome_status: "confirmed", notes: "Signed 12-month remote engineering contract after mentorship and portfolio verification.", recorded_at: new Date().toISOString() },
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
        supabase
          .from("talent_profiles")
          .select("*, talent_skills(id, skill_id, proficiency, years_used, verification_source, endorsed_by, skills(id, name, category)), portfolio_items(id, talent_profile_id, title, evidence_type, bridging_body, description, project_url, evidence_status, verified_by_name, review_notes)")
          .order("created_at", { ascending: false }),
        supabase
          .from("opportunities")
          .select("*, organisations(id, name, organisation_type, sector, location, supports_refugee_onboarding, payout_methods, is_verified), opportunity_skills(id, skill_id, is_required, skills(id, name, category))")
          .eq("status", "published")
          .order("created_at", { ascending: false }),
        supabase.from("mentor_profiles").select("*").order("created_at", { ascending: false }),
        supabase
          .from("applications")
          .select("*, opportunities(id, title, category, organisation_id, payout_channel, work_auth_requirement, organisations(name)), talent_profiles(id, full_name, headline, location, work_authorization_status, payout_readiness, bridging_status)")
          .order("created_at", { ascending: false }),
        supabase
          .from("mentorship_requests")
          .select("*, talent_profiles(id, full_name, headline), mentor_profiles(id, full_name, organisation_name)")
          .order("created_at", { ascending: false }),
        supabase
          .from("outcome_records")
          .select("*, talent_profiles(full_name), organisations(name), opportunities(title)")
          .order("recorded_at", { ascending: false }),
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
  const verifiedSkillsCount = state.talents.reduce(
    (acc, t) => acc + (t.talent_skills || []).filter((s) => s.verification_source && s.verification_source !== "self_reported").length,
    0
  );
  const complianceReadyCount = state.talents.filter(
    (t) =>
      t.work_authorization_status &&
      t.work_authorization_status !== "onboarding_support_needed" &&
      t.payout_readiness &&
      t.payout_readiness !== "assistance_needed"
  ).length;

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
    verified_skills_count: verifiedSkillsCount,
    compliance_ready_talent: complianceReadyCount,
    recorded_employment_outcomes: state.outcomes.filter((o) => o.outcome_status === "confirmed").length,
    accepted_applications: state.applications.filter((a) => a.status === "accepted").length,
  };
}

function getMentorActiveMenteesCount(mentorId) {
  return state.mentorshipRequests.filter(
    (mr) => String(mr.mentor_profile_id) === String(mentorId) && mr.status === "accepted"
  ).length;
}

// RENDERING SECTIONS

function renderAllSections() {
  renderOpportunities();
  renderTalentPool();
  renderVerificationQueue();
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
      (opp.payout_channel || "").toLowerCase().includes(q) ||
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
      const orgType = opp.organisations?.organisation_type || "Verified Partner";
      const verifiedBadge = opp.organisations?.is_verified ? `<span class="badge badge-green">${escapeHtml(orgType)}</span>` : "";
      const skills = (opp.opportunity_skills || [])
        .slice(0, 4)
        .map((s) => `<span class="tag">${escapeHtml(s.skills?.name || "")}${s.is_required ? " *" : ""}</span>`)
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
              ${opp.compensation ? `<span>&middot; <strong>${escapeHtml(opp.compensation)}</strong></span>` : ""}
            </div>
            <p class="opp-desc" style="margin-top:10px;">${escapeHtml(opp.description)}</p>
            <div class="readiness-strip">
              ${opp.deliverables ? `<div><strong>Deliverables:</strong> ${escapeHtml(opp.deliverables)}</div>` : ""}
              <div><strong>Payout:</strong> ${escapeHtml(opp.payout_channel || "KES Bank / M-Pesa")}</div>
              <div><strong>Eligibility:</strong> ${escapeHtml(opp.work_auth_requirement || "Work Permit / Remote Eligible")}</div>
            </div>
            ${skills ? `<div class="tag-cloud" style="margin-top:10px;margin-bottom:0;">${skills}</div>` : ""}
          </div>
          <div class="opp-footer">
            <button type="button" class="btn btn-outline btn-sm" data-view-opp="${escapeHtml(opp.id)}">Details &amp; Screening</button>
            <button type="button" class="btn btn-primary btn-sm" data-apply-opp="${escapeHtml(opp.id)}">Apply &amp; Match</button>
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
  const readinessFilter = document.getElementById("talent-readiness-filter")?.value || "";

  const filtered = state.talents.filter((tp) => {
    if (readinessFilter === "work_ready") {
      const ok = tp.work_authorization_status !== "onboarding_support_needed" && tp.payout_readiness !== "assistance_needed";
      if (!ok) return false;
    } else if (readinessFilter === "bridging_certified") {
      if (tp.bridging_status !== "certified") return false;
    } else if (readinessFilter === "verified_portfolio") {
      const hasVer = (tp.portfolio_items || []).some((p) => p.evidence_status === "verified");
      if (!hasVer) return false;
    }

    if (!q) return true;
    const skillText = (tp.talent_skills || []).map((ts) => ts.skills?.name || "").join(" ").toLowerCase();
    return (
      (tp.full_name || "").toLowerCase().includes(q) ||
      (tp.headline || "").toLowerCase().includes(q) ||
      (tp.location || "").toLowerCase().includes(q) ||
      (tp.sector || "").toLowerCase().includes(q) ||
      (tp.bridging_pathway || "").toLowerCase().includes(q) ||
      (tp.cohort_tag || "").toLowerCase().includes(q) ||
      skillText.includes(q)
    );
  });

  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">No talent profiles match your search or readiness filter.</div>`;
    return;
  }

  grid.innerHTML = filtered
    .map((tp) => {
      const skillsHtml = (tp.talent_skills || [])
        .map((ts) => {
          const vSrc = ts.verification_source || "self_reported";
          const isVerified = vSrc !== "self_reported";
          const tagCls = vSrc === "credential_verified" || vSrc === "portfolio_backed" ? "tag tag-verified" : vSrc === "mentor_endorsed" ? "tag tag-endorsed" : "tag";
          const marker = isVerified ? " &#10003;" : "";
          return `<span class="${tagCls}" title="${escapeHtml(VERIFICATION_SOURCE_LABELS[vSrc] || vSrc)}">${escapeHtml(ts.skills?.name || "")} (${escapeHtml(ts.proficiency)})${marker}</span>`;
        })
        .join("");

      const verifiedItems = (tp.portfolio_items || []).filter((p) => p.evidence_status === "verified").length;
      const workAuthLabel = WORK_AUTH_LABELS[tp.work_authorization_status] || "Work-Auth Checked";
      const payoutLabel = PAYOUT_LABELS[tp.payout_readiness] || "Payout Ready";
      const workAuthBadge = tp.work_authorization_status === "onboarding_support_needed" ? "badge-amber" : "badge-green";
      const payoutBadge = tp.payout_readiness === "assistance_needed" ? "badge-amber" : "badge-blue";

      return `
        <article class="opp-card">
          <div>
            <div class="opp-top">
              <span class="badge badge-teal">${escapeHtml(tp.sector || "Talent")}</span>
              <div style="display:flex;gap:6px;flex-wrap:wrap;">
                ${tp.cohort_tag ? `<span class="badge badge-navy">${escapeHtml(tp.cohort_tag)}</span>` : ""}
                <span class="badge ${workAuthBadge}">${escapeHtml(workAuthLabel)}</span>
              </div>
            </div>
            <h3 class="opp-title">${escapeHtml(tp.full_name)}</h3>
            <div class="opp-org">${escapeHtml(tp.headline || "Skilled Professional")} &middot; ${escapeHtml(tp.location || "East Africa")}</div>
            <div class="opp-meta" style="margin-top:6px;">
              <span>${escapeHtml(tp.years_experience ?? 0)} yr(s) exp</span>
              <span>&middot; ${escapeHtml(tp.preferred_work_arrangement || "hybrid")}</span>
              <span>&middot; ${verifiedItems} verified evidence item(s)</span>
            </div>
            <p class="opp-desc" style="margin-top:8px;">${escapeHtml(tp.summary || "")}</p>

            <div class="readiness-strip">
              <div><strong>Bridging / Recognition:</strong> ${escapeHtml(tp.bridging_pathway || tp.education || "Skills-First Portfolio Track")} (${escapeHtml(BRIDGING_STATUS_LABELS[tp.bridging_status] || tp.bridging_status || "Active")})</div>
              <div><strong>Compliance &amp; Payout:</strong> <span class="badge ${payoutBadge}">${escapeHtml(payoutLabel)}</span> ${tp.odpc_consent_granted ? "&middot; ODPC Consent Recorded" : ""}</div>
            </div>

            ${skillsHtml ? `<div class="tag-cloud" style="margin-top:10px;margin-bottom:0;">${skillsHtml}</div>` : ""}
          </div>
          <div class="opp-footer">
            <button type="button" class="btn btn-outline btn-sm" data-view-talent="${escapeHtml(tp.id)}">Profile &amp; Evidence</button>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button type="button" class="btn btn-outline btn-sm" data-endorse-talent="${escapeHtml(tp.id)}">Endorse Skill</button>
              <button type="button" class="btn btn-teal btn-sm" data-match-talent="${escapeHtml(tp.id)}">Match to Roles</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderVerificationQueue() {
  const wrap = document.getElementById("verification-table");
  if (!wrap) return;

  const allItems = [];
  for (const tp of state.talents) {
    for (const pi of tp.portfolio_items || []) {
      allItems.push({ ...pi, talent_id: tp.id, talent_name: tp.full_name, talent_location: tp.location });
    }
  }

  if (!allItems.length) {
    wrap.innerHTML = `<div class="empty-state">No portfolio or bridging evidence submitted yet.</div>`;
    return;
  }

  const mentorOptions = state.mentors
    .map((m) => `<option value="${escapeHtml(m.full_name)}">${escapeHtml(m.full_name)} (${escapeHtml(m.sector || "Verifier")})</option>`)
    .join("");

  wrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Candidate</th>
          <th>Evidence / Bridging Item</th>
          <th>Pathway / Body</th>
          <th>Status</th>
          <th>Mentor / Verifier Audit</th>
        </tr>
      </thead>
      <tbody>
        ${allItems
          .map((item) => {
            const typeLabel = EVIDENCE_TYPE_LABELS[item.evidence_type] || "Portfolio Evidence";
            return `
              <tr>
                <td>
                  <strong>${escapeHtml(item.talent_name)}</strong>
                  <div class="small" style="color:var(--slate-500);">${escapeHtml(item.talent_location || "")}</div>
                </td>
                <td>
                  <span class="badge badge-teal" style="margin-bottom:4px;">${escapeHtml(typeLabel)}</span><br/>
                  <strong>${escapeHtml(item.title)}</strong>
                  ${item.description ? `<div class="small" style="color:var(--slate-600);margin-top:3px;">${escapeHtml(item.description)}</div>` : ""}
                  ${item.project_url ? `<div class="small" style="margin-top:4px;"><a href="${escapeHtml(item.project_url)}" target="_blank" rel="noopener">Inspect Evidence Link &nearr;</a></div>` : ""}
                </td>
                <td>
                  <span>${escapeHtml(item.bridging_body || "Direct Portfolio Audit")}</span>
                  ${item.verified_by_name ? `<div class="small" style="color:var(--green);margin-top:4px;">Verifier: ${escapeHtml(item.verified_by_name)}</div>` : ""}
                </td>
                <td>
                  ${statusBadge(item.evidence_status)}
                  ${item.review_notes ? `<div class="small" style="color:var(--slate-500);margin-top:4px;">${escapeHtml(item.review_notes)}</div>` : ""}
                </td>
                <td>
                  <div class="inline-controls">
                    <select class="ev-verifier-select" data-ev-id="${escapeHtml(item.id)}">
                      ${mentorOptions}
                    </select>
                    <select class="ev-status-select" data-ev-id="${escapeHtml(item.id)}">
                      ${["submitted", "under_review", "verified", "rejected"]
                        .map((st) => `<option value="${st}" ${item.evidence_status === st ? "selected" : ""}>${escapeHtml(st.replace(/_/g, " "))}</option>`)
                        .join("")}
                    </select>
                    <input type="text" class="ev-notes-input" data-ev-id="${escapeHtml(item.id)}" value="${escapeHtml(item.review_notes || "")}" placeholder="Verification audit note..." />
                    <button type="button" class="btn btn-primary btn-sm" data-save-ev="${escapeHtml(item.id)}" data-ev-talent="${escapeHtml(item.talent_id)}">Verify / Save</button>
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

function renderMentors() {
  const grid = document.getElementById("mentors-grid");
  if (!grid) return;

  if (!state.mentors.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">No mentors registered yet.</div>`;
    return;
  }

  grid.innerHTML = state.mentors
    .map((m) => {
      const activeCount = getMentorActiveMenteesCount(m.id);
      const maxMentees = Number(m.max_mentees ?? 3);
      const hasCapacity = m.is_accepting_requests && activeCount < maxMentees;

      return `
        <article class="opp-card">
          <div>
            <div class="opp-top">
              <span class="badge badge-teal">${escapeHtml(m.sector || "Mentorship")}</span>
              <div style="display:flex;gap:6px;flex-wrap:wrap;">
                ${m.can_verify_credentials !== false ? `<span class="badge badge-blue">Credential Verifier</span>` : ""}
                <span class="badge ${hasCapacity ? "badge-green" : "badge-amber"}">${hasCapacity ? `Open (${activeCount}/${maxMentees} slots)` : `At Capacity (${activeCount}/${maxMentees})`}</span>
              </div>
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
            <span class="small" style="color:var(--slate-500);">Active Mentees: ${activeCount} / ${maxMentees}</span>
            <button type="button" class="btn btn-primary btn-sm" data-request-mentor="${escapeHtml(m.id)}" ${hasCapacity ? "" : "disabled"}>
              ${hasCapacity ? "Request Mentorship" : "Full Capacity"}
            </button>
          </div>
        </article>
      `;
    })
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
        <tr><th>Candidate &amp; Readiness</th><th>Opportunity</th><th>Match</th><th>Stage &amp; Notes</th><th>Outcome</th></tr>
      </thead>
      <tbody>
        ${state.applications
          .map((app) => {
            const fullTal = talentMap.get(app.talent_profile_id) || app.talent_profiles || {};
            const opp = oppMap.get(app.opportunity_id) || app.opportunities || {};
            const alreadyRecorded = recordedAppIds.has(app.id);
            const authText = WORK_AUTH_LABELS[fullTal.work_authorization_status] || "Work-Auth Checked";
            const payText = PAYOUT_LABELS[fullTal.payout_readiness] || "Payout Ready";
            return `
              <tr>
                <td>
                  <strong>${escapeHtml(fullTal.full_name || "Candidate")}</strong>
                  <div class="small" style="color:var(--slate-500);">${escapeHtml(fullTal.headline || "")}</div>
                  <div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap;">
                    <span class="badge badge-green">${escapeHtml(authText)}</span>
                    <span class="badge badge-blue">${escapeHtml(payText)}</span>
                  </div>
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
        <tr><th>Candidate</th><th>Opportunity</th><th>Partner Organisation</th><th>Type</th><th>Status</th><th>Date</th></tr>
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
  const localComputed = computeLocalImpact();
  const m = { ...localComputed, ...(state.impact || {}) };
  if (m.verified_skills_count === undefined) m.verified_skills_count = localComputed.verified_skills_count;
  if (m.compliance_ready_talent === undefined) m.compliance_ready_talent = localComputed.compliance_ready_talent;

  const val = (k) => escapeHtml(m[k] ?? 0);

  container.innerHTML = `
    <h3 class="metrics-group-title">Cohort Scale &amp; Opportunity Pipeline</h3>
    <div class="metrics-grid">
      <div class="metric-card"><div class="metric-value">${val("registered_talent")}</div><div class="metric-label">Registered Talent</div></div>
      <div class="metric-card"><div class="metric-value">${val("registered_employers")}</div><div class="metric-label">Verified Partner Organisations</div></div>
      <div class="metric-card"><div class="metric-value">${val("registered_mentors")}</div><div class="metric-label">Accredited Mentors</div></div>
      <div class="metric-card"><div class="metric-value">${val("published_opportunities")}</div><div class="metric-label">Published Roles</div></div>
    </div>
    <h3 class="metrics-group-title">Credential Verification, Compliance &amp; Placement Outcomes</h3>
    <div class="metrics-grid" style="margin-bottom:0;">
      <div class="metric-card metric-card-highlight"><div class="metric-value">${val("verified_portfolio_items")}</div><div class="metric-label">Verified Portfolio &amp; Bridging Items</div></div>
      <div class="metric-card metric-card-highlight"><div class="metric-value">${val("verified_skills_count")}</div><div class="metric-label">Verified / Endorsed Skills</div></div>
      <div class="metric-card metric-card-highlight"><div class="metric-value">${val("compliance_ready_talent")}</div><div class="metric-label">Work-Auth &amp; Payout Ready Talent</div></div>
      <div class="metric-card metric-card-highlight"><div class="metric-value">${val("recorded_employment_outcomes")}</div><div class="metric-label">Confirmed Placement Outcomes</div></div>
    </div>
  `;

  const sdgGrid = document.getElementById("sdg-mapping-grid");
  if (sdgGrid) {
    sdgGrid.innerHTML = `
      <div class="sdg-card">
        <span class="sdg-code">SDG 4</span>
        <strong>Quality Education &amp; RPL</strong>
        <p>${val("verified_portfolio_items")} verified bridging credentials &amp; portfolios (NITA RPL, AZ-900, EPRA).</p>
      </div>
      <div class="sdg-card">
        <span class="sdg-code">SDG 8</span>
        <strong>Decent Work &amp; Growth</strong>
        <p>${val("recorded_employment_outcomes")} confirmed placements &amp; ${val("published_opportunities")} formal/remote roles in KES.</p>
      </div>
      <div class="sdg-card">
        <span class="sdg-code">SDG 10</span>
        <strong>Reduced Inequalities</strong>
        <p>${val("compliance_ready_talent")} refugee &amp; host-community professionals cleared for compliant work &amp; payouts.</p>
      </div>
      <div class="sdg-card">
        <span class="sdg-code">SDG 16</span>
        <strong>Accountable Institutions</strong>
        <p>Auditable verification notes, ODPC consent logging, and transparent hiring stage records.</p>
      </div>
      <div class="sdg-card">
        <span class="sdg-code">SDG 17</span>
        <strong>Multi-Stakeholder Partnerships</strong>
        <p>${val("registered_employers")} NGO, private, and social-enterprise partners + ${val("registered_mentors")} industry mentors.</p>
      </div>
    `;
  }
}

// INTAKE MODALS (NO LOGIN, NO PASSWORD, WITH COMPLIANCE & BRIDGING)

function openIntakeModal(role) {
  const titleEl = document.getElementById("intake-modal-title");
  const bodyEl = document.getElementById("intake-modal-body");
  if (!titleEl || !bodyEl) return;

  if (role === "talent") {
    titleEl.textContent = "Join as Talent - Skills, Bridging & Work-Readiness";
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
            <input id="it-location" class="input" type="text" required placeholder="e.g., Kakuma / Nairobi, Kenya" />
          </div>
          <div class="form-group">
            <label for="it-cohort">Cohort / Training Partner (optional)</label>
            <input id="it-cohort" class="input" type="text" placeholder="e.g., Cohort 2026-B - Power Learn Project" />
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
            <label for="it-work-auth">Work-Authorization &amp; Eligibility Readiness *</label>
            <select id="it-work-auth" class="input">
              <option value="verified_refugee_work_permit">Refugee ID / Work Permit Ready</option>
              <option value="kenyan_national_id">Kenyan National ID Ready</option>
              <option value="eac_citizen_work_eligible">EAC Citizen Work Eligible</option>
              <option value="remote_contractor_eligible">Remote Independent Contractor Eligible</option>
              <option value="onboarding_support_needed">Work-Auth Onboarding Support Needed</option>
            </select>
          </div>
          <div class="form-group">
            <label for="it-payout">Financial &amp; Payout Readiness *</label>
            <select id="it-payout" class="input">
              <option value="mpesa_and_bank_ready">KES Bank &amp; M-Pesa Ready</option>
              <option value="mpesa_ready">M-Pesa Mobile Money Ready</option>
              <option value="bank_account_ready">KES Bank Account Ready</option>
              <option value="assistance_needed">Payout Account Setup Needed</option>
            </select>
          </div>
          <div class="form-group">
            <label for="it-bridging">Bridging / Recognition Pathway</label>
            <input id="it-bridging" class="input" type="text" placeholder="e.g., NITA RPL, EPRA T2, AZ-900, Power Learn Project" />
          </div>
          <div class="form-group">
            <label for="it-bridging-status">Bridging Verification Status</label>
            <select id="it-bridging-status" class="input">
              <option value="certified">Certified / Completed</option>
              <option value="in_progress" selected>In Progress</option>
              <option value="not_needed">Standard Credential Verified</option>
            </select>
          </div>
          <div class="form-group">
            <label for="it-languages">Languages (comma-separated)</label>
            <input id="it-languages" class="input" type="text" placeholder="English, Swahili, Somali" />
          </div>
          <div class="form-group">
            <label for="it-portfolio">Portfolio / GitHub / Evidence URL</label>
            <input id="it-portfolio" class="input" type="url" placeholder="https://github.com/..." />
          </div>
        </div>
        <div class="form-group">
          <label for="it-education">Education &amp; Certifications</label>
          <input id="it-education" class="input" type="text" placeholder="e.g., Diploma in Web Development / AZ-900" />
        </div>
        <div class="form-group">
          <label for="it-summary">Professional Summary *</label>
          <textarea id="it-summary" class="input" required placeholder="Briefly describe your practical skills, projects, and experience..."></textarea>
        </div>
        <div class="form-group">
          <label for="it-skills">Your Skills (comma-separated) *</label>
          <input id="it-skills" class="input" type="text" required placeholder="e.g., JavaScript, PostgreSQL, Solar PV Installation" />
        </div>
        <label class="consent-box">
          <input id="it-odpc-consent" type="checkbox" required checked />
          <span><strong>Kenya ODPC Data Privacy Consent:</strong> I consent to sharing my skills, work-readiness status, and portfolio links with verified employers and mentors without exposing sensitive national or refugee ID numbers.</span>
        </label>
        <div class="btn-row">
          <button type="submit" class="btn btn-teal">Save Talent Profile</button>
          <button type="button" class="btn btn-outline" data-modal-close="intake-modal">Cancel</button>
        </div>
      </form>
    `;
  } else if (role === "employer") {
    titleEl.textContent = "Hire Skilled Talent - Post Role & Screening Criteria";
    bodyEl.innerHTML = `
      <form id="intake-employer-form">
        <div class="form-grid-2">
          <div class="form-group">
            <label for="ie-org-name">Organisation Name *</label>
            <input id="ie-org-name" class="input" type="text" required minlength="2" placeholder="e.g., Horizon CleanTech" />
          </div>
          <div class="form-group">
            <label for="ie-org-type">Organisation Type *</label>
            <select id="ie-org-type" class="input">
              <option value="Private Tech Employer">Private Employer</option>
              <option value="Social Enterprise Employer">Social Enterprise</option>
              <option value="NGO & Institutional Partner">NGO / Institutional Partner</option>
              <option value="Digital Agency Partner">Agency / Remote Partner</option>
            </select>
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
            <label for="ie-comp">Compensation (KES) *</label>
            <input id="ie-comp" class="input" type="text" required placeholder="e.g., KES 80,000 / month" />
          </div>
          <div class="form-group">
            <label for="ie-payout-channel">Payout Channel *</label>
            <input id="ie-payout-channel" class="input" type="text" value="KES Bank Transfer / M-Pesa" required />
          </div>
          <div class="form-group">
            <label for="ie-work-auth-req">Work-Authorization &amp; Onboarding Policy *</label>
            <input id="ie-work-auth-req" class="input" type="text" value="Refugee Work Permit, Kenyan ID, or Remote Eligible" required />
          </div>
        </div>
        <div class="form-group">
          <label for="ie-desc">Role Description (at least 20 characters) *</label>
          <textarea id="ie-desc" class="input" required minlength="20" placeholder="Describe core responsibilities, tools, and team context..."></textarea>
        </div>
        <div class="form-group">
          <label for="ie-deliverables">Expected Deliverables *</label>
          <input id="ie-deliverables" class="input" type="text" required placeholder="e.g., Ship 2 production sprints monthly and maintain SQL dashboards" />
        </div>
        <div class="form-group">
          <label for="ie-screening">Practical Screening Criteria *</label>
          <input id="ie-screening" class="input" type="text" required placeholder="e.g., Verified GitHub portfolio review + 30-min practical task" />
        </div>
        <div class="form-group">
          <label for="ie-skills">Required Skills (comma-separated) *</label>
          <input id="ie-skills" class="input" type="text" required placeholder="e.g., SQL Analytics, Python, KoboToolbox" />
        </div>
        <div class="btn-row">
          <button type="submit" class="btn btn-primary">Publish Opportunity</button>
          <button type="button" class="btn btn-outline" data-modal-close="intake-modal">Cancel</button>
        </div>
      </form>
    `;
  } else if (role === "mentor") {
    titleEl.textContent = "Become a Mentor & Credential Verifier";
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
            <label for="im-max">Max Active Mentees</label>
            <input id="im-max" class="input" type="number" min="1" max="20" value="3" />
          </div>
        </div>
        <div class="form-group">
          <label for="im-expertise">Expertise &amp; Verification Domains (comma-separated) *</label>
          <input id="im-expertise" class="input" type="text" required placeholder="JavaScript, SQL, GitHub Audits, Technical Interviews" />
        </div>
        <div class="form-group">
          <label for="im-bio">Short Bio *</label>
          <textarea id="im-bio" class="input" required placeholder="Share your background and how you mentor and verify candidate work..."></textarea>
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

// INTERACTIVE MODALS (EVIDENCE SUBMISSION, ENDORSEMENT, DETAILS, MATCHING)

function handleOpenSubmitEvidenceModal(preselectedTalentId = "") {
  if (!state.talents.length) {
    showToast("Register a talent profile first before attaching evidence.", "error");
    return;
  }

  const talentOptions = state.talents
    .map(
      (t) =>
        `<option value="${escapeHtml(t.id)}" ${String(t.id) === String(preselectedTalentId) ? "selected" : ""}>${escapeHtml(t.full_name)} (${escapeHtml(t.sector || "Talent")})</option>`
    )
    .join("");

  openDetailModal(
    "Submit Portfolio or Bridging Credential Evidence",
    `
      <p class="small" style="color:var(--slate-600);margin-top:0;">Attach a project repository, RPL trade assessment, or bridging credential (e.g., NITA RPL, EPRA T2, AZ-900) for live mentor verification.</p>
      <form id="submit-evidence-form">
        <div class="form-grid-2">
          <div class="form-group">
            <label for="ev-talent-id">Candidate Profile *</label>
            <select id="ev-talent-id" class="input" required>${talentOptions}</select>
          </div>
          <div class="form-group">
            <label for="ev-type">Evidence Category *</label>
            <select id="ev-type" class="input">
              <option value="project_portfolio">Project Portfolio / GitHub</option>
              <option value="bridging_credential">Bridging Credential (AZ-900, PLP, Coursera)</option>
              <option value="rpl_assessment">Recognition of Prior Learning (NITA RPL / EPRA)</option>
              <option value="work_sample">Verified Field / Analytical Work Sample</option>
            </select>
          </div>
          <div class="form-group">
            <label for="ev-title">Evidence / Credential Title *</label>
            <input id="ev-title" class="input" type="text" required minlength="3" placeholder="e.g., NITA Grade II Solar Installation Log" />
          </div>
          <div class="form-group">
            <label for="ev-body">Issuing / Bridging Body</label>
            <input id="ev-body" class="input" type="text" placeholder="e.g., NITA RPL, Microsoft AZ-900, Power Learn Project" />
          </div>
        </div>
        <div class="form-group">
          <label for="ev-url">Evidence / Repository / Certificate URL (optional)</label>
          <input id="ev-url" class="input" type="url" placeholder="https://github.com/..." />
        </div>
        <div class="form-group">
          <label for="ev-desc">Competency Demonstrated (at least 10 chars) *</label>
          <textarea id="ev-desc" class="input" required minlength="10" placeholder="Describe the practical work, tools used, and measurable output..."></textarea>
        </div>
        <div class="btn-row">
          <button type="submit" class="btn btn-primary">Submit for Verification</button>
          <button type="button" class="btn btn-outline" data-modal-close="detail-modal">Cancel</button>
        </div>
      </form>
    `
  );
}

function handleOpenEndorseSkillModal(talentId) {
  const tp = state.talents.find((t) => String(t.id) === String(talentId));
  if (!tp) return;

  const skillOptions = (tp.talent_skills || [])
    .map(
      (ts) =>
        `<option value="${escapeHtml(ts.skill_id)}">${escapeHtml(ts.skills?.name || "Skill")} (Current: ${escapeHtml(VERIFICATION_SOURCE_LABELS[ts.verification_source] || ts.verification_source || "Self-Reported")})</option>`
    )
    .join("");

  if (!skillOptions) {
    showToast("This talent has no listed skills to endorse yet.", "error");
    return;
  }

  const mentorOptions = state.mentors
    .map((m) => `<option value="${escapeHtml(m.full_name)}">${escapeHtml(m.full_name)} (${escapeHtml(m.organisation_name || m.sector || "Mentor")})</option>`)
    .join("");

  openDetailModal(
    `Verify / Endorse Skill - ${tp.full_name}`,
    `
      <p class="small" style="color:var(--slate-600);margin-top:0;">Upgrade a self-reported skill to mentor-endorsed, portfolio-backed, or credential-verified status.</p>
      <form id="endorse-skill-form" data-talent-id="${escapeHtml(tp.id)}">
        <div class="form-group">
          <label for="es-skill-id">Select Skill *</label>
          <select id="es-skill-id" class="input" required>${skillOptions}</select>
        </div>
        <div class="form-group">
          <label for="es-source">Verification Signal *</label>
          <select id="es-source" class="input">
            <option value="mentor_endorsed">Mentor Endorsed (Practical Review)</option>
            <option value="portfolio_backed">Portfolio Backed (Code / Work Sample)</option>
            <option value="credential_verified">Credential Verified (NITA / EPRA / AZ-900)</option>
          </select>
        </div>
        <div class="form-group">
          <label for="es-endorser">Verified / Endorsed By *</label>
          <select id="es-endorser" class="input">${mentorOptions}</select>
        </div>
        <div class="btn-row">
          <button type="submit" class="btn btn-teal">Confirm Skill Verification</button>
          <button type="button" class="btn btn-outline" data-modal-close="detail-modal">Cancel</button>
        </div>
      </form>
    `
  );
}

function handleViewOpportunity(oppId) {
  const opp = state.opportunities.find((o) => String(o.id) === String(oppId));
  if (!opp) return;
  const org = opp.organisations || {};
  const skillsHtml = (opp.opportunity_skills || [])
    .map((s) => `<span class="tag">${escapeHtml(s.skills?.name || "")}${s.is_required ? " (Required)" : ""}</span>`)
    .join(" ");

  openDetailModal(
    opp.title,
    `
      <dl class="detail-dl">
        <dt>Organisation</dt><dd>${escapeHtml(org.name || "Organisation")} (${escapeHtml(org.organisation_type || "Verified Partner")})</dd>
        <dt>Category</dt><dd>${escapeHtml(formatCategory(opp.category))}</dd>
        <dt>Sector</dt><dd>${escapeHtml(opp.sector || "General")}</dd>
        <dt>Location</dt><dd>${escapeHtml(opp.location)} (${escapeHtml(opp.work_arrangement)})</dd>
        <dt>Min. Experience</dt><dd>${escapeHtml(opp.min_experience_years ?? 0)} year(s)</dd>
        <dt>Duration</dt><dd>${escapeHtml(opp.duration || "Flexible")}</dd>
        <dt>Compensation</dt><dd><strong>${escapeHtml(opp.compensation || "Competitive")}</strong></dd>
        <dt>Payout Channel</dt><dd>${escapeHtml(opp.payout_channel || "KES Bank / M-Pesa")}</dd>
        <dt>Work Authorization</dt><dd>${escapeHtml(opp.work_auth_requirement || "Refugee Work Permit / Kenyan ID / Remote Eligible")}</dd>
      </dl>
      <div style="margin-top:14px;">
        <strong>Role Overview</strong>
        <p class="small" style="margin:6px 0 0;color:var(--slate-700);">${escapeHtml(opp.description)}</p>
      </div>
      ${opp.deliverables ? `<div style="margin-top:12px;"><strong>Expected Deliverables</strong><p class="small" style="margin:4px 0 0;color:var(--slate-700);">${escapeHtml(opp.deliverables)}</p></div>` : ""}
      ${opp.screening_criteria ? `<div style="margin-top:12px;"><strong>Practical Screening Criteria</strong><p class="small" style="margin:4px 0 0;color:var(--slate-700);">${escapeHtml(opp.screening_criteria)}</p></div>` : ""}
      ${skillsHtml ? `<div style="margin-top:14px;"><strong>Skills</strong><div class="tag-cloud" style="margin-top:6px;">${skillsHtml}</div></div>` : ""}
      <div class="btn-row">
        <button type="button" class="btn btn-primary" data-apply-opp="${escapeHtml(opp.id)}">Apply &amp; View Match Breakdown</button>
        <button type="button" class="btn btn-outline" data-modal-close="detail-modal">Close</button>
      </div>
    `
  );
}

function renderMatchBreakdownHtml(match) {
  return `
    <div class="match-breakdown-box">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <strong>Explainable Match &amp; Readiness Score</strong>
        <span class="badge badge-navy">${match.score}% Overall Fit</span>
      </div>
      <div class="small" style="color:var(--slate-600);margin-top:4px;">${escapeHtml(match.summary)}</div>
      <div class="match-bar-grid">
        <div class="match-factor"><span>Skills &amp; Proficiency (50%)</span><strong>${match.skillScore}%</strong></div>
        <div class="match-factor"><span>Verification &amp; Bridging (15%)</span><strong>${match.verificationScore}%</strong></div>
        <div class="match-factor"><span>Experience &amp; Sector (20%)</span><strong>${match.experienceAndSectorScore}%</strong></div>
        <div class="match-factor"><span>Work-Auth &amp; Payout Fit (15%)</span><strong>${match.complianceScore}%</strong></div>
      </div>
    </div>
  `;
}

function handleOpenApplyModal(oppId) {
  const opp = state.opportunities.find((o) => String(o.id) === String(oppId));
  if (!opp) return;
  if (!state.talents.length) {
    showToast("Add a talent profile first to apply.", "error");
    return;
  }

  const talentOptions = state.talents
    .map((t) => {
      const m = computeMatchBreakdown(t, t.talent_skills || [], opp, opp.opportunity_skills || []);
      return `<option value="${escapeHtml(t.id)}">${escapeHtml(t.full_name)} - ${m.score}% fit (${escapeHtml(t.headline || "Talent")})</option>`;
    })
    .join("");

  const firstTalent = state.talents[0];
  const initialMatch = computeMatchBreakdown(firstTalent, firstTalent.talent_skills || [], opp, opp.opportunity_skills || []);

  openDetailModal(
    `Apply - ${opp.title}`,
    `
      <form id="apply-opp-form" data-opp-id="${escapeHtml(opp.id)}">
        <div class="form-group">
          <label for="apply-talent-id">Select Candidate Profile *</label>
          <select id="apply-talent-id" class="input" required>${talentOptions}</select>
        </div>
        <div id="live-apply-match-preview">${renderMatchBreakdownHtml(initialMatch)}</div>
        <div class="form-group">
          <label for="apply-cover-note">Cover Note &amp; Deliverables Fit</label>
          <textarea id="apply-cover-note" class="input" placeholder="Highlight your verified portfolio items, bridging credentials, and availability..."></textarea>
        </div>
        <div class="btn-row">
          <button type="submit" class="btn btn-primary">Submit Application</button>
          <button type="button" class="btn btn-outline" data-modal-close="detail-modal">Cancel</button>
        </div>
      </form>
    `
  );

  const selectEl = document.getElementById("apply-talent-id");
  const previewEl = document.getElementById("live-apply-match-preview");
  selectEl?.addEventListener("change", () => {
    const selected = state.talents.find((t) => String(t.id) === String(selectEl.value));
    if (selected && previewEl) {
      const m = computeMatchBreakdown(selected, selected.talent_skills || [], opp, opp.opportunity_skills || []);
      previewEl.innerHTML = renderMatchBreakdownHtml(m);
    }
  });
}

function handleViewTalent(talentId) {
  const tp = state.talents.find((t) => String(t.id) === String(talentId));
  if (!tp) return;
  const skills = (tp.talent_skills || [])
    .map((ts) => {
      const vSrc = ts.verification_source || "self_reported";
      const label = VERIFICATION_SOURCE_LABELS[vSrc] || "Self-Reported";
      return `<span class="tag ${vSrc !== "self_reported" ? "tag-verified" : ""}">${escapeHtml(ts.skills?.name || "")} &middot; ${escapeHtml(ts.proficiency)} (${escapeHtml(label)})</span>`;
    })
    .join(" ");

  const evidenceList = (tp.portfolio_items || [])
    .map(
      (pi) => `
        <div class="readiness-strip" style="margin-top:8px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <strong>${escapeHtml(pi.title)}</strong>
            ${statusBadge(pi.evidence_status)}
          </div>
          <div>${escapeHtml(pi.description || "")}</div>
          ${pi.verified_by_name ? `<div class="small" style="color:var(--green);">Verified by ${escapeHtml(pi.verified_by_name)}</div>` : ""}
        </div>
      `
    )
    .join("");

  openDetailModal(
    tp.full_name,
    `
      <dl class="detail-dl">
        <dt>Headline</dt><dd>${escapeHtml(tp.headline || "-")}</dd>
        <dt>Cohort / Location</dt><dd>${escapeHtml(tp.location || "-")} ${tp.cohort_tag ? `(${escapeHtml(tp.cohort_tag)})` : ""}</dd>
        <dt>Bridging Pathway</dt><dd>${escapeHtml(tp.bridging_pathway || tp.education || "-")} (${escapeHtml(BRIDGING_STATUS_LABELS[tp.bridging_status] || tp.bridging_status || "Active")})</dd>
        <dt>Work Authorization</dt><dd>${escapeHtml(WORK_AUTH_LABELS[tp.work_authorization_status] || tp.work_authorization_status || "-")}</dd>
        <dt>Payout Readiness</dt><dd>${escapeHtml(PAYOUT_LABELS[tp.payout_readiness] || tp.payout_readiness || "-")}</dd>
        <dt>ODPC Data Consent</dt><dd>${tp.odpc_consent_granted !== false ? "Granted & Logged" : "Pending"}</dd>
        <dt>Experience</dt><dd>${escapeHtml(tp.years_experience ?? 0)} year(s) &middot; ${escapeHtml(tp.preferred_work_arrangement || "hybrid")}</dd>
        <dt>Languages</dt><dd>${escapeHtml((tp.languages || []).join(", ") || "-")}</dd>
      </dl>
      ${tp.summary ? `<div style="margin-top:12px;"><strong>Summary</strong><p class="small">${escapeHtml(tp.summary)}</p></div>` : ""}
      ${skills ? `<div style="margin-top:12px;"><strong>Skills &amp; Verification Status</strong><div class="tag-cloud" style="margin-top:6px;">${skills}</div></div>` : ""}
      <div style="margin-top:12px;">
        <strong>Portfolio &amp; Bridging Evidence (${(tp.portfolio_items || []).length})</strong>
        ${evidenceList || `<p class="small muted-note">No evidence items attached yet.</p>`}
      </div>
      <div class="btn-row">
        <button type="button" class="btn btn-primary" data-attach-evidence-for="${escapeHtml(tp.id)}">+ Attach Evidence</button>
        <button type="button" class="btn btn-outline" data-endorse-talent="${escapeHtml(tp.id)}">Endorse Skill</button>
        <button type="button" class="btn btn-teal" data-match-talent="${escapeHtml(tp.id)}">Match to Roles</button>
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
    `Explainable Role Matches for ${tp.full_name}`,
    `
      <div style="display:flex;flex-direction:column;gap:12px;">
        ${ranked
          .map(
            ({ opp, match }) => `
              <div class="card" style="padding:14px;">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
                  <strong>${escapeHtml(opp.title)}</strong>
                  <span class="badge badge-navy">${match.score}% Overall Fit</span>
                </div>
                <div class="small" style="color:var(--slate-600);margin-top:4px;">${escapeHtml(opp.organisations?.name || "")} &middot; ${escapeHtml(formatCategory(opp.category))} &middot; ${escapeHtml(opp.compensation || "")}</div>
                <div class="small" style="margin-top:6px;">${escapeHtml(match.summary)}</div>
                <div class="match-bar-grid">
                  <div class="match-factor"><span>Skills (50%)</span><strong>${match.skillScore}%</strong></div>
                  <div class="match-factor"><span>Verification (15%)</span><strong>${match.verificationScore}%</strong></div>
                  <div class="match-factor"><span>Exp/Sector (20%)</span><strong>${match.experienceAndSectorScore}%</strong></div>
                  <div class="match-factor"><span>Compliance (15%)</span><strong>${match.complianceScore}%</strong></div>
                </div>
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

  const activeCount = getMentorActiveMenteesCount(m.id);
  const maxMentees = Number(m.max_mentees ?? 3);
  if (!m.is_accepting_requests || activeCount >= maxMentees) {
    showToast(`${m.full_name} is currently at full capacity (${activeCount}/${maxMentees} mentees).`, "error");
    return;
  }

  const talentOptions = state.talents
    .map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.full_name)} (${escapeHtml(t.headline || "Talent")})</option>`)
    .join("");

  openDetailModal(
    `Request Mentorship - ${m.full_name} (${activeCount}/${maxMentees} slots filled)`,
    `
      <form id="request-mentor-form" data-mentor-id="${escapeHtml(m.id)}">
        <div class="form-group">
          <label for="mr-talent-id">Requesting As *</label>
          <select id="mr-talent-id" class="input" required>${talentOptions}</select>
        </div>
        <div class="form-group">
          <label for="mr-goal">Mentorship / Credential Verification Goal *</label>
          <input id="mr-goal" class="input" type="text" required minlength="5" placeholder="e.g., Portfolio audit & EPRA T2 / technical interview prep" />
        </div>
        <div class="form-group">
          <label for="mr-message">Message</label>
          <textarea id="mr-message" class="input" placeholder="Share your current bridging pathway or target role..."></textarea>
        </div>
        <div class="btn-row">
          <button type="submit" class="btn btn-primary">Send Request</button>
          <button type="button" class="btn btn-outline" data-modal-close="detail-modal">Cancel</button>
        </div>
      </form>
    `
  );
}

// MUTATIONS (SUPABASE OR LOCAL STORE)

async function ensureSkillIdsSupabase(skillNames, category) {
  const supabase = getSupabase();
  const uniqueNames = [];
  const seen = new Set();
  for (const raw of skillNames) {
    const clean = raw.trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      uniqueNames.push(clean);
    }
  }
  if (!uniqueNames.length) return [];

  const existingMap = new Map(state.skills.map((s) => [s.name.toLowerCase(), s.id]));
  const missing = uniqueNames.filter((n) => !existingMap.has(n.toLowerCase()));

  if (missing.length) {
    const rows = missing.map((name) => ({ name, category: category || "General" }));
    const { error: insertErr } = await supabase.from("skills").upsert(rows, { onConflict: "name", ignoreDuplicates: true });
    if (insertErr) console.warn("Skill insert warning:", insertErr.message);

    const { data: refreshed } = await supabase.from("skills").select("id, name, category");
    if (refreshed) {
      state.skills = refreshed;
      for (const s of refreshed) existingMap.set(s.name.toLowerCase(), s.id);
    }
  }

  return uniqueNames.map((n) => existingMap.get(n.toLowerCase())).filter(Boolean);
}

function ensureSkillIdsLocal(local, skillNames, category) {
  const existingMap = new Map(local.skills.map((s) => [s.name.toLowerCase(), s]));
  const result = [];
  const seen = new Set();
  for (const raw of skillNames) {
    const clean = raw.trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    let skill = existingMap.get(key);
    if (!skill) {
      skill = { id: generateId(), name: clean, category: category || "General" };
      local.skills.push(skill);
      existingMap.set(key, skill);
    }
    result.push(skill);
  }
  return result;
}

async function handleTalentIntakeSubmit() {
  const skillNames = parseCsvList(document.getElementById("it-skills").value);
  const portfolioUrl = document.getElementById("it-portfolio").value.trim() || null;
  const bridgingPathway = document.getElementById("it-bridging").value.trim() || null;
  const bridgingStatus = document.getElementById("it-bridging-status").value;

  const payload = {
    full_name: document.getElementById("it-name").value.trim(),
    email: document.getElementById("it-email").value.trim() || null,
    headline: document.getElementById("it-headline").value.trim(),
    sector: document.getElementById("it-sector").value.trim(),
    location: document.getElementById("it-location").value.trim(),
    cohort_tag: document.getElementById("it-cohort").value.trim() || null,
    years_experience: Number(document.getElementById("it-years").value || 0),
    preferred_work_arrangement: document.getElementById("it-arrangement").value,
    work_authorization_status: document.getElementById("it-work-auth").value,
    payout_readiness: document.getElementById("it-payout").value,
    bridging_pathway: bridgingPathway,
    bridging_status: bridgingStatus,
    odpc_consent_granted: Boolean(document.getElementById("it-odpc-consent")?.checked),
    availability: "Immediate",
    languages: parseCsvList(document.getElementById("it-languages").value),
    portfolio_url: portfolioUrl,
    education: document.getElementById("it-education").value.trim() || null,
    summary: document.getElementById("it-summary").value.trim(),
    allow_mentor_discovery: true,
  };

  const initialVerSource = bridgingStatus === "certified" ? "credential_verified" : portfolioUrl ? "portfolio_backed" : "self_reported";

  if (state.mode === "supabase") {
    const supabase = getSupabase();
    const { data: created, error } = await supabase.from("talent_profiles").insert(payload).select("*").single();
    if (error) {
      showToast(error.message, "error");
      return;
    }
    const skillIds = await ensureSkillIdsSupabase(skillNames, payload.sector);
    if (skillIds.length) {
      await supabase.from("talent_skills").insert(
        skillIds.map((skillId) => ({
          talent_profile_id: created.id,
          skill_id: skillId,
          proficiency: "intermediate",
          years_used: Math.max(1, payload.years_experience),
          verification_source: initialVerSource,
          endorsed_by: bridgingPathway || null,
        }))
      );
    }
    if (portfolioUrl || bridgingPathway) {
      await supabase.from("portfolio_items").insert({
        talent_profile_id: created.id,
        title: bridgingPathway || `${payload.full_name} - Primary Portfolio`,
        evidence_type: bridgingPathway ? "bridging_credential" : "project_portfolio",
        bridging_body: bridgingPathway || "Direct Portfolio Submission",
        description: payload.summary.slice(0, 220),
        project_url: portfolioUrl,
        evidence_status: "submitted",
      });
    }
  } else {
    const local = loadLocalStore();
    const resolvedSkills = ensureSkillIdsLocal(local, skillNames, payload.sector);
    const newId = generateId();
    const initialPortfolio =
      portfolioUrl || bridgingPathway
        ? [
            {
              id: generateId(),
              talent_profile_id: newId,
              title: bridgingPathway || `${payload.full_name} - Primary Portfolio`,
              evidence_type: bridgingPathway ? "bridging_credential" : "project_portfolio",
              bridging_body: bridgingPathway || "Direct Portfolio Submission",
              description: payload.summary.slice(0, 220),
              project_url: portfolioUrl,
              evidence_status: "submitted",
              verified_by_name: null,
              review_notes: "",
            },
          ]
        : [];

    local.talents.unshift({
      id: newId,
      ...payload,
      talent_skills: resolvedSkills.map((sk) => ({
        skill_id: sk.id,
        proficiency: "intermediate",
        years_used: Math.max(1, payload.years_experience),
        verification_source: initialVerSource,
        endorsed_by: bridgingPathway || null,
        skills: sk,
      })),
      portfolio_items: initialPortfolio,
    });
    saveLocalStore(local);
  }

  closeModal("intake-modal");
  showToast(`${payload.full_name} added with readiness & verification profile!`, "success");
  await refreshAllData();
  document.getElementById("talent-section")?.scrollIntoView({ behavior: "smooth" });
}

async function handleEmployerIntakeSubmit() {
  const skillNames = parseCsvList(document.getElementById("ie-skills").value);
  const orgPayload = {
    name: document.getElementById("ie-org-name").value.trim(),
    organisation_type: document.getElementById("ie-org-type").value,
    contact_name: document.getElementById("ie-contact-name").value.trim(),
    sector: document.getElementById("ie-sector").value.trim(),
    location: document.getElementById("ie-location").value.trim(),
    supports_refugee_onboarding: true,
    is_verified: true,
  };
  const oppPayload = {
    title: document.getElementById("ie-title").value.trim(),
    category: document.getElementById("ie-category").value,
    sector: document.getElementById("ie-sector").value.trim(),
    location: document.getElementById("ie-location").value.trim(),
    work_arrangement: document.getElementById("ie-arrangement").value,
    min_experience_years: Number(document.getElementById("ie-min-exp").value || 0),
    compensation: document.getElementById("ie-comp").value.trim() || null,
    payout_channel: document.getElementById("ie-payout-channel").value.trim() || "KES Bank / M-Pesa",
    work_auth_requirement: document.getElementById("ie-work-auth-req").value.trim(),
    deliverables: document.getElementById("ie-deliverables").value.trim(),
    screening_criteria: document.getElementById("ie-screening").value.trim(),
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
    const skillIds = await ensureSkillIdsSupabase(skillNames, oppPayload.sector);
    if (skillIds.length) {
      await supabase.from("opportunity_skills").insert(
        skillIds.map((skillId) => ({ opportunity_id: opp.id, skill_id: skillId, is_required: true }))
      );
    }
  } else {
    const local = loadLocalStore();
    const resolvedSkills = ensureSkillIdsLocal(local, skillNames, oppPayload.sector);
    const newOrg = { id: generateId(), ...orgPayload };
    const newOpp = {
      id: generateId(),
      organisation_id: newOrg.id,
      organisations: newOrg,
      ...oppPayload,
      opportunity_skills: resolvedSkills.map((sk) => ({ skill_id: sk.id, is_required: true, skills: sk })),
    };
    local.organisations.unshift(newOrg);
    local.opportunities.unshift(newOpp);
    saveLocalStore(local);
  }

  closeModal("intake-modal");
  showToast(`"${oppPayload.title}" published with screening criteria!`, "success");
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
    can_verify_credentials: true,
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
  showToast(`${payload.full_name} registered as Mentor & Credential Verifier!`, "success");
  await refreshAllData();
  document.getElementById("mentorship-section")?.scrollIntoView({ behavior: "smooth" });
}

async function handleSubmitEvidenceForm() {
  const talentId = document.getElementById("ev-talent-id").value;
  const payload = {
    talent_profile_id: talentId,
    evidence_type: document.getElementById("ev-type").value,
    title: document.getElementById("ev-title").value.trim(),
    bridging_body: document.getElementById("ev-body").value.trim() || "Direct Portfolio Audit",
    project_url: document.getElementById("ev-url").value.trim() || null,
    description: document.getElementById("ev-desc").value.trim(),
    evidence_status: "submitted",
  };

  if (state.mode === "supabase") {
    const { error } = await getSupabase().from("portfolio_items").insert(payload);
    if (error) {
      showToast(error.message, "error");
      return;
    }
  } else {
    const local = loadLocalStore();
    const tp = local.talents.find((t) => String(t.id) === String(talentId));
    if (tp) {
      tp.portfolio_items = tp.portfolio_items || [];
      tp.portfolio_items.unshift({ id: generateId(), ...payload, verified_by_name: null, review_notes: "" });
      saveLocalStore(local);
    }
  }

  closeModal("detail-modal");
  showToast("Evidence submitted to Verification Desk!", "success");
  await refreshAllData();
  document.getElementById("verification-section")?.scrollIntoView({ behavior: "smooth" });
}

async function handleEndorseSkillSubmit(form) {
  const talentId = form.dataset.talentId;
  const skillId = document.getElementById("es-skill-id").value;
  const source = document.getElementById("es-source").value;
  const endorser = document.getElementById("es-endorser").value;

  if (state.mode === "supabase") {
    const { error } = await getSupabase()
      .from("talent_skills")
      .update({ verification_source: source, endorsed_by: endorser })
      .eq("talent_profile_id", talentId)
      .eq("skill_id", skillId);
    if (error) {
      showToast(error.message, "error");
      return;
    }
  } else {
    const local = loadLocalStore();
    const tp = local.talents.find((t) => String(t.id) === String(talentId));
    const ts = tp?.talent_skills?.find((x) => String(x.skill_id) === String(skillId));
    if (ts) {
      ts.verification_source = source;
      ts.endorsed_by = endorser;
      saveLocalStore(local);
    }
  }

  closeModal("detail-modal");
  showToast(`Skill verified by ${endorser}!`, "success");
  await refreshAllData();
}

async function handleApplySubmit(form) {
  const oppId = form.dataset.oppId;
  const talentId = document.getElementById("apply-talent-id").value;
  const coverNote = document.getElementById("apply-cover-note").value.trim() || null;

  const opp = state.opportunities.find((o) => String(o.id) === String(oppId));
  const tp = state.talents.find((t) => String(t.id) === String(talentId));
  const match = opp && tp ? computeMatchBreakdown(tp, tp.talent_skills || [], opp, opp.opportunity_skills || []) : { score: 75 };

  if (state.mode === "supabase") {
    const { error } = await getSupabase().from("applications").insert({
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
    const dup = local.applications.find((a) => String(a.opportunity_id) === String(oppId) && String(a.talent_profile_id) === String(talentId));
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
  showToast(`Application submitted (${match.score}% explainable fit)!`, "success");
  await refreshAllData();
  document.getElementById("pipeline-section")?.scrollIntoView({ behavior: "smooth" });
}

async function handleMentorRequestSubmit(form) {
  const mentorId = form.dataset.mentorId;
  const talentId = document.getElementById("mr-talent-id").value;
  const goal = document.getElementById("mr-goal").value.trim();
  const message = document.getElementById("mr-message").value.trim() || null;

  const mentor = state.mentors.find((m) => String(m.id) === String(mentorId));
  const activeCount = getMentorActiveMenteesCount(mentorId);
  if (mentor && (!mentor.is_accepting_requests || activeCount >= Number(mentor.max_mentees ?? 3))) {
    showToast("Mentor has reached maximum active mentee capacity.", "error");
    return;
  }

  if (state.mode === "supabase") {
    const { error } = await getSupabase().from("mentorship_requests").insert({
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
    document.getElementById("public-nav")?.classList.toggle("open");
  });

  document.getElementById("opp-search")?.addEventListener("input", renderOpportunities);
  document.getElementById("opp-category")?.addEventListener("change", renderOpportunities);
  document.getElementById("talent-search")?.addEventListener("input", renderTalentPool);
  document.getElementById("talent-readiness-filter")?.addEventListener("change", renderTalentPool);
  document.getElementById("refresh-impact-btn")?.addEventListener("click", refreshAllData);
  document.getElementById("open-submit-evidence-btn")?.addEventListener("click", () => handleOpenSubmitEvidenceModal());

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

    const attachEvBtn = e.target.closest("[data-attach-evidence-for]");
    if (attachEvBtn) {
      handleOpenSubmitEvidenceModal(attachEvBtn.dataset.attachEvidenceFor);
      return;
    }

    const endorseBtn = e.target.closest("[data-endorse-talent]");
    if (endorseBtn) {
      handleOpenEndorseSkillModal(endorseBtn.dataset.endorseTalent);
      return;
    }

    const saveEvBtn = e.target.closest("[data-save-ev]");
    if (saveEvBtn) {
      const evId = saveEvBtn.dataset.saveEv;
      const talId = saveEvBtn.dataset.evTalent;
      const status = document.querySelector(`.ev-status-select[data-ev-id="${evId}"]`)?.value;
      const verifier = document.querySelector(`.ev-verifier-select[data-ev-id="${evId}"]`)?.value || "Accredited Verifier";
      const notes = document.querySelector(`.ev-notes-input[data-ev-id="${evId}"]`)?.value ?? "";

      if (state.mode === "supabase") {
        const { error } = await getSupabase()
          .from("portfolio_items")
          .update({
            evidence_status: status,
            verified_by_name: status === "verified" ? verifier : null,
            review_notes: notes,
          })
          .eq("id", evId);
        if (error) {
          showToast(error.message, "error");
          return;
        }
        if (status === "verified" && talId) {
          await getSupabase()
            .from("talent_skills")
            .update({ verification_source: "portfolio_backed", endorsed_by: verifier })
            .eq("talent_profile_id", talId)
            .eq("verification_source", "self_reported");
        }
      } else {
        const local = loadLocalStore();
        for (const tp of local.talents) {
          const item = (tp.portfolio_items || []).find((x) => String(x.id) === String(evId));
          if (item) {
            item.evidence_status = status;
            item.verified_by_name = status === "verified" ? verifier : null;
            item.review_notes = notes;
            if (status === "verified") {
              for (const ts of tp.talent_skills || []) {
                if (!ts.verification_source || ts.verification_source === "self_reported") {
                  ts.verification_source = "portfolio_backed";
                  ts.endorsed_by = verifier;
                }
              }
            }
          }
        }
        saveLocalStore(local);
      }
      showToast(`Evidence status updated to "${status.replace(/_/g, " ")}"!`, "success");
      await refreshAllData();
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
      const existingReq = state.mentorshipRequests.find((x) => String(x.id) === String(mrId));

      if (status === "accepted" && existingReq && existingReq.status !== "accepted") {
        const mentor = state.mentors.find((m) => String(m.id) === String(existingReq.mentor_profile_id));
        const currentActive = getMentorActiveMenteesCount(existingReq.mentor_profile_id);
        if (mentor && currentActive >= Number(mentor.max_mentees ?? 3)) {
          showToast(`Cannot accept: ${mentor.full_name} is already at max capacity (${currentActive}/${mentor.max_mentees}).`, "error");
          return;
        }
      }

      if (state.mode === "supabase") {
        const { error } = await getSupabase().from("mentorship_requests").update({ status, mentor_response: responseText }).eq("id", mrId);
        if (error) {
          showToast(error.message, "error");
          return;
        }
      } else {
        const local = loadLocalStore();
        const item = local.mentorshipRequests.find((x) => String(x.id) === String(mrId));
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
        const item = local.applications.find((x) => String(x.id) === String(appId));
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

    if (form.id === "intake-talent-form") await handleTalentIntakeSubmit();
    else if (form.id === "intake-employer-form") await handleEmployerIntakeSubmit();
    else if (form.id === "intake-mentor-form") await handleMentorIntakeSubmit();
    else if (form.id === "submit-evidence-form") await handleSubmitEvidenceForm();
    else if (form.id === "endorse-skill-form") await handleEndorseSkillSubmit(form);
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
