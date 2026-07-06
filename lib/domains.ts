/**
 * domains.ts — display labels for the question-set domains.
 *
 * Keys match the `domain` values in scripts/questions.json (one per OECD
 * directorate). Single source of truth for every component that renders a
 * domain name (heatmap, live-query picker, findings).
 */

export const DOMAIN_LABELS: Record<string, string> = {
  economics_growth: "Economics & growth",
  taxation: "Taxation",
  education: "Education",
  employment_social: "Employment & social",
  health: "Health",
  environment_climate: "Environment & climate",
  science_tech_innovation: "Science, tech & innovation",
  ai_governance: "AI governance",
  trade_agriculture: "Trade & agriculture",
  financial_enterprise: "Financial & enterprise",
  public_governance: "Public governance",
  development_cooperation: "Development co-operation",
  entrepreneurship_regions: "Entrepreneurship & regions",
  statistics_measurement: "Statistics & measurement",
};

export function domainLabel(domain: string): string {
  return DOMAIN_LABELS[domain] ?? domain;
}
