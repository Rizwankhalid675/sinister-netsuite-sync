from __future__ import annotations

import json
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import Image, PageBreak, Paragraph, Spacer, Table, TableStyle

from report_pdf_common import (
    AMBER,
    BLUE,
    BLUE_PALE,
    BrandDocTemplate,
    DeltaBar,
    DISPLAY,
    GREEN,
    INK,
    LINE,
    MUTED,
    NAVY,
    PAPER,
    RED,
    REPORTS,
    ROOT,
    STYLES,
    WHITE,
    callout,
    cover_story,
    metric_cards,
    p,
    safe,
    section_title,
    table,
)


DATA_PATH = REPORTS / "performance-proof-pack" / "v2-performance-results.json"
OUT = REPORTS / "Sinister-Diesel-V2-Performance-Proof-Pack.pdf"
SCREEN = REPORTS / "performance-proof-pack" / "v2-homepage.png"


def pct_change(old, new, lower_is_better=False):
    raw = ((new - old) / old) * 100 if old else 0
    improved = raw < 0 if lower_is_better else raw > 0
    return raw, improved


def verdict_row(label, legacy, v2, delta, verdict, tone):
    return [label, legacy, v2, delta, verdict]


def build():
    d = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    gt_l, gt_v = d["gtmetrix"]["legacy"], d["gtmetrix"]["v2"]
    lh_l, lh_v = d["controlled_lighthouse"]["median"]["legacy"], d["controlled_lighthouse"]["median"]["v2"]
    doc = BrandDocTemplate(str(OUT), "Sinister Diesel V2 Performance Proof Pack")
    story = cover_story(
        "PERFORMANCE\nPROOF PACK",
        "Legacy baseline vs. the Sinister Diesel V2 release candidate — measured, attributed, and ready for executive review.",
        "BRIAN REVIEW / JULY 21, 2026",
        [("GTmetrix structure", "90%", "good"), ("Payload reduction", "52.8%", "good"), ("Request reduction", "51.5%", "good"), ("Current verdict", "TUNE", "warn")],
    )

    story.append(section_title("01", "Executive Verdict", "The evidence supports a precise conclusion—not a blanket speed claim."))
    story.append(callout("Decision statement", "V2 is materially leaner, structurally stronger, and more visually stable. It is not yet faster on initial render: Performance and LCP still require an optimization pass before publication can claim an overall speed win.", "warn"))
    story.append(Spacer(1, 12))
    story.append(metric_cards([("Structure", "77 to 90", "good"), ("Blocking time", "618 to 558ms", "good"), ("Layout shift", ".02 to .01", "good"), ("Performance", "59 to 51", "bad")]))
    story.append(Spacer(1, 12))
    story.append(p("Why this is still meaningful: V2 cuts the median transferred payload from 5.29 MB to 2.50 MB and median requests from 169 to 82 under identical local conditions. Those are foundational engineering gains. The remaining delay is concentrated in server response and the critical render path, making the next optimization phase specific and measurable."))
    story.append(Spacer(1, 8))
    if SCREEN.exists():
        img = Image(str(SCREEN), width=7.15 * inch, height=4.47 * inch)
        story.append(img)
        story.append(p("Directly captured V2 preview homepage at 1440 × 900. Preview credential omitted from all artifacts.", "body_small"))
    story.append(PageBreak())

    story.append(section_title("02", "GTmetrix Head-to-Head", "Two remote tests, fifteen minutes apart, from Seattle using Chrome 142 and Lighthouse 12.6.1."))
    rows = [
        ["Metric", "Legacy 3:07 PM", "V2 3:22 PM", "Delta", "Verdict"],
        verdict_row("GTmetrix grade", gt_l["grade"], gt_v["grade"], "—", "UNCHANGED", "neutral"),
        verdict_row("Performance", f'{gt_l["performance"]}%', f'{gt_v["performance"]}%', "−8 pts", "NEEDS WORK", "loss"),
        verdict_row("Structure", f'{gt_l["structure"]}%', f'{gt_v["structure"]}%', "+13 pts", "V2 WIN", "win"),
        verdict_row("Largest Contentful Paint", f'{gt_l["lcp_seconds"]:.1f}s', f'{gt_v["lcp_seconds"]:.1f}s', "+0.1s", "ESSENTIALLY FLAT", "watch"),
        verdict_row("Total Blocking Time", f'{gt_l["tbt_ms"]}ms', f'{gt_v["tbt_ms"]}ms', "−60ms", "V2 WIN", "win"),
        verdict_row("Cumulative Layout Shift", f'{gt_l["cls"]:.2f}', f'{gt_v["cls"]:.2f}', "−0.01", "V2 WIN", "win"),
    ]
    story.append(table(rows, widths=[2.0*inch, 1.15*inch, 1.15*inch, .85*inch, 1.5*inch]))
    story.append(Spacer(1, 14))
    story.append(DeltaBar("Structure score — higher is better", 77, 90, "%", "higher"))
    story.append(DeltaBar("Total Blocking Time — lower is better", 618, 558, "ms", "lower"))
    story.append(DeltaBar("Cumulative Layout Shift — lower is better", .02, .01, "", "lower"))
    story.append(DeltaBar("Largest Contentful Paint — lower is better", 2.1, 2.2, "s", "lower"))
    story.append(Spacer(1, 8))
    story.append(callout("What GTmetrix proves", "V2 improves page construction quality, blocking time, and visual stability. It also proves the initial-render path is not yet optimized enough to outperform legacy on the composite Performance score.", "blue"))
    story.append(PageBreak())

    story.append(section_title("03", "Controlled Six-Run Comparison", "Three fresh desktop runs per version under identical local Lighthouse 13.4.1 conditions; medians shown."))
    local_rows = [
        ["Metric", "Legacy median", "V2 median", "Change", "Interpretation"],
        ["Performance score", str(lh_l["score"]), str(lh_v["score"]), "−8 pts", "Legacy faster initially"],
        ["First Contentful Paint", f'{lh_l["fcp_ms"]/1000:.2f}s', f'{lh_v["fcp_ms"]/1000:.2f}s', "+46.4%", "Optimize V2 render path"],
        ["Largest Contentful Paint", f'{lh_l["lcp_ms"]/1000:.2f}s', f'{lh_v["lcp_ms"]/1000:.2f}s', "+14.9%", "Optimize V2 LCP"],
        ["Speed Index", f'{lh_l["speed_index_ms"]/1000:.2f}s', f'{lh_v["speed_index_ms"]/1000:.2f}s', "+58.3%", "Visual completion slower"],
        ["Cumulative Layout Shift", f'{lh_l["cls"]:.3f}', f'{lh_v["cls"]:.3f}', "−76.5%", "Major V2 stability win"],
        ["Transferred bytes", f'{lh_l["bytes"]/1_000_000:.2f} MB', f'{lh_v["bytes"]/1_000_000:.2f} MB', "−52.8%", "Major V2 payload win"],
        ["Network requests", str(lh_l["requests"]), str(lh_v["requests"]), "−51.5%", "Major V2 request win"],
        ["Server response", f'{lh_l["ttfb_ms"]}ms', f'{lh_v["ttfb_ms"]}ms', "+2.7%", "Platform/server opportunity"],
    ]
    story.append(table(local_rows, widths=[1.55*inch, 1.0*inch, 1.0*inch, .8*inch, 2.2*inch]))
    story.append(Spacer(1, 12))
    story.append(metric_cards([("Payload", "5.29 → 2.50 MB", "good"), ("Requests", "169 → 82", "good"), ("CLS", ".034 → .008", "good"), ("LCP", "1.39 → 1.60s", "warn")]))
    story.append(Spacer(1, 11))
    story.append(p("The local score differs from GTmetrix because Lighthouse version, execution environment, and remote network/server conditions differ. The fair comparison is within each environment: GTmetrix-to-GTmetrix and local-median-to-local-median, never one tool's number against the other tool's number."))
    story.append(PageBreak())

    story.append(section_title("04", "Why V2 Is Better Engineered", "The strongest V2 gains are structural and operational, not yet an across-the-board speed win."))
    wins = [
        ["Evidence", "Measured change", "Customer/business significance"],
        ["GTmetrix Structure", "77% → 90%", "Cleaner technical construction and fewer structural penalties."],
        ["Transferred payload", "5.29 MB → 2.50 MB median", "Less data for customers to download; more headroom for mobile and slower connections."],
        ["Network requests", "169 → 82 median", "Fewer connection, queueing, and third-party failure opportunities."],
        ["Layout stability", "CLS .034 → .008 local; .02 → .01 remote", "Less visual movement while customers read and interact."],
        ["Remote blocking time", "618ms → 558ms", "Less time where the main thread cannot respond."],
        ["Commerce regression coverage", "13+ source contracts plus route audits", "Changes are safer to release and diagnose than a screenshot-only redesign."],
        ["SEO controls", "Dynamic metadata, canonicals, robots, schema", "A stronger technical foundation for production crawling and indexing."],
    ]
    story.append(table(wins, widths=[1.45*inch, 1.55*inch, 3.65*inch]))
    story.append(Spacer(1, 12))
    story.append(callout("Credible positioning for Brian", "V2 is the stronger platform and the better customer experience. Before promising that it is the faster homepage, complete the focused performance phase and retest against this baseline.", "good"))
    story.append(PageBreak())

    story.append(section_title("05", "SEMrush Baseline and V2 SEO Readiness", "The supplied dashboard describes the production legacy domain. A private preview cannot have independent rankings or traffic."))
    sem = d["semrush_legacy"]
    story.append(metric_cards([("Site health", f'{sem["site_health_percent"]}%', "warn"), ("Errors", str(sem["errors"]), "bad"), ("Warnings", f'{sem["warnings"]:,}', "warn"), ("Organic traffic", sem["organic_traffic"], "blue")]))
    story.append(Spacer(1, 12))
    seo_rows = [
        ["Legacy SEMrush baseline", "Observed value", "V2 position before publish"],
        ["Authority Score", str(sem["authority_score"]), "Domain-level value; shared until V2 becomes production"],
        ["Organic keywords", sem["organic_keywords"], "Cannot be attributed to private preview"],
        ["Referring domains", sem["referring_domains"], "Domain asset; preserved through URL/canonical discipline"],
        ["Site Health", f'{sem["site_health_percent"]}% across {sem["crawled_pages"]} pages', "Re-crawl after production publication"],
        ["Errors / warnings", f'{sem["errors"]} / {sem["warnings"]:,}', "Resolve from post-launch V2 crawl, not estimated"],
        ["Position visibility", f'{sem["position_tracking_visibility_percent"]:.2f}%', "Measure after indexing stabilizes"],
        ["AI visibility", str(sem["ai_visibility"]), "Production-domain outcome; monitor post-launch"],
    ]
    story.append(table(seo_rows, widths=[1.55*inch, 1.55*inch, 3.55*inch]))
    story.append(Spacer(1, 12))
    story.append(Paragraph("V2 source-verified SEO controls", STYLES["h3"]))
    for item in d["seo_v2_readiness"]["source_verified_controls"]:
        story.append(p("• " + item))
    story.append(callout("What cannot be claimed yet", "No responsible report can claim higher V2 rankings, authority, traffic, conversions, or SEMrush Site Health before V2 is published and crawled. This pack records readiness, not invented outcomes.", "warn"))
    story.append(PageBreak())

    story.append(section_title("06", "Focused Performance Roadmap", "The audit isolates a practical sequence for converting structural gains into a speed win."))
    opportunities = d["v2_opportunities"]
    roadmap = [
        ["Priority", "Action", "Evidence", "Expected direction"],
        ["P0", "Reduce initial HTML/server response latency", opportunities[0]["observed"], "Earlier FCP/LCP"],
        ["P0", "Split or defer noncritical JavaScript", opportunities[1]["observed"], "Lower parse/evaluation and blocking"],
        ["P0", "Extract critical CSS and load page-family CSS intentionally", opportunities[2]["observed"], "Faster first render"],
        ["P1", "Remove render-blocking requests", opportunities[3]["observed"], "Potential ~380ms lab saving"],
        ["P1", "Minify CSS and JavaScript", "37 KiB CSS + 10 KiB JS opportunity", "Smaller transfer/parse cost"],
        ["P1", "Optimize hero/LCP image delivery", opportunities[5]["observed"], "Faster LCP without redesign"],
        ["P2", "Retest GTmetrix three times after changes", "Use same Seattle/Chrome class", "Prove the speed claim"],
    ]
    story.append(table(roadmap, widths=[.55*inch, 2.25*inch, 2.05*inch, 1.8*inch]))
    story.append(Spacer(1, 14))
    story.append(callout("Acceptance target", "Retain Structure ≥ 90, CLS ≤ 0.01 and the ~50% payload/request reductions while raising GTmetrix Performance above 59 and reducing LCP below 2.1s under the same test class.", "blue"))
    story.append(PageBreak())

    story.append(section_title("07", "Methodology, Limits, and Audit Trail"))
    method = [
        ["Evidence class", "Source", "Use in this report"],
        ["Legacy GTmetrix", "User-supplied report generated 3:07 PM", "Baseline remote performance"],
        ["V2 GTmetrix", "Direct report q7RFhvsw generated 3:22 PM", "Remote V2 performance; credential redacted"],
        ["Controlled Lighthouse", "3 V2 + 3 legacy fresh desktop runs", "Median payload, requests, paint and stability comparison"],
        ["Legacy SEMrush", "User-supplied July 21 dashboard", "Production domain baseline only"],
        ["V2 SEO readiness", "Repository tests and template inspection", "Implemented controls, not ranking claims"],
        ["Visual evidence", "Direct V2 preview capture", "Confirms tested release-candidate identity"],
    ]
    story.append(table(method, widths=[1.45*inch, 2.2*inch, 3.0*inch]))
    story.append(Spacer(1, 12))
    story.append(p("GTmetrix remote tests are highly comparable because they used the same location, browser version, Lighthouse version, target domain, and a fifteen-minute window. The V2 report was run through the preview state and its credential was removed from saved evidence. Local Lighthouse medians are a second evidence track and are never mixed numerically with GTmetrix scores."))
    story.append(p("Performance varies with origin response, third-party availability, cache state, and test infrastructure. A single test is evidence, not a permanent guarantee. Production Core Web Vitals require real traffic after publication."))
    story.append(Spacer(1, 10))
    story.append(callout("Final recommendation", "Approve V2 as the stronger storefront platform and customer experience, subject to the documented release gates. Complete the focused performance optimization pass before using 'faster' as a public or executive claim.", "good"))
    doc.build(story)
    print(f"WROTE {OUT}")


if __name__ == "__main__":
    build()
