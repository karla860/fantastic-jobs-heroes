// Jobs the skyline cards cycle through, three at a time (card 1, card 2, card 3), then loop.
// From https://files.fantastic.jobs/sample-ats.json. The first card's job also fills the terminal's
// example response, so salaryMin and arrangement are the API's ai_salary_min_value and
// ai_work_arrangement. Set 1 keeps the shortened Relativity Space and Foji titles from Figma.
// source is the platform the job was collected from (its icon is in assets/sources) and page is the
// listing page it was found on: the URL in the sample, or the employer's careers page where the
// sample gives none (Cribl was checked against its Greenhouse board; Foji's job came from LinkedIn).
window.SKYLINE_JOBS = [
  { title: "Sr Software Engineer, Cribl AI", organization: "Cribl", location: "United States", salaryMin: 185000, salaryMax: 215000, arrangement: "Remote Solely", logo: "cribl.jpg", source: "greenhouse", page: "cribl.io/job-detail" },
  { title: "Staff Software Engineer", organization: "Relativity Space", location: "Long Beach, California", salaryMin: 181000, salaryMax: 271000, arrangement: "On-site", logo: "relativity-space.jpg", source: "greenhouse", page: "relativityspace.com/careers" },
  { title: "Software Engineer", organization: "Foji", location: "Atlanta, Georgia", salaryMin: 95000, salaryMax: 125000, arrangement: "Remote Solely", logo: "foji.jpg", source: "linkedin", page: "linkedin.com/jobs" },

  { title: "Network Engineer (Starlink Maritime)", organization: "SpaceX", location: "Redmond, Washington", salaryMin: 125000, salaryMax: 200000, arrangement: "On-site", logo: "spacex.jpg", source: "greenhouse", page: "boards.greenhouse.io/spacex" },
  { title: "Security Engineer", organization: "Cala Health", location: "United States", salaryMin: 155000, salaryMax: 190000, arrangement: "Hybrid", logo: "cala-health.jpg", source: "greenhouse", page: "job-boards.greenhouse.io/calahealth" },
  { title: "Product Manager II", organization: "Coinbase", location: "United States", salaryMin: 148835, salaryMax: 171500, arrangement: "Hybrid", logo: "coinbase.jpg", source: "greenhouse", page: "coinbase.com/careers" },

  { title: "AI Solutions Engineer", organization: "Stratolaunch", location: "Mojave, California", salaryMin: 142000, salaryMax: 165000, arrangement: "On-site", logo: "stratolaunch.jpg", source: "greenhouse", page: "job-boards.greenhouse.io/stratolaunch" },
  { title: "Staff UX Designer", organization: "Endor Labs", location: "Palo Alto, California", salaryMin: 140000, salaryMax: 200000, arrangement: "On-site", logo: "endor-labs.jpg", source: "greenhouse", page: "job-boards.greenhouse.io/endorlabs" },
  { title: "Sr. Project Manager", organization: "Esri", location: "Redlands, California", salaryMin: 74880, salaryMax: 150280, arrangement: "On-site", logo: "esri.jpg", source: "greenhouse", page: "esri.com/careers" },
];
