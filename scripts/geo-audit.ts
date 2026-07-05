/**
 * geo-audit.ts — Phase 4 GEO audit CLI.
 *
 * Fetches an OECD.org (or any) URL and prints its AI-readability report.
 * Usage:  npm run geo -- https://www.oecd.org/tax/
 */

import { auditUrl, type GeoCheck } from "../lib/geo";

const ICON: Record<GeoCheck["status"], string> = {
  pass: "✓",
  warn: "!",
  fail: "✗",
};

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error("Usage: npm run geo -- <url>");
    process.exit(1);
  }

  const report = await auditUrl(url);

  console.log(`\nGEO AUDIT — ${report.url}`);
  console.log(`Fetched: ${report.fetchedAt}`);
  console.log(`\nOVERALL GEO SCORE: ${report.overallScore}/100\n`);

  console.log("PLATFORM READINESS (derived, not part of the composite):");
  for (const p of report.platforms) {
    console.log(`   ${p.label.padEnd(22)} ${String(p.score).padStart(3)}/100`);
    for (const b of p.blockers) console.log(`      – ${b}`);
  }
  console.log("");

  for (const cat of report.categories) {
    console.log(
      `── ${cat.label}  ${cat.score}/100  (weight ${cat.weight})`,
    );
    for (const c of cat.checks) {
      console.log(`   ${ICON[c.status]} ${c.label} — ${c.detail}`);
    }
    console.log("");
  }

  if (report.recommendations.length > 0) {
    console.log(`RECOMMENDATIONS (${report.recommendations.length}):`);
    report.recommendations.forEach((r, i) => console.log(`  ${i + 1}. ${r}`));
  } else {
    console.log("No recommendations — page is well optimized for AI readability.");
  }
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
