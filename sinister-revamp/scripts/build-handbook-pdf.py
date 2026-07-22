from __future__ import annotations

import re

from reportlab.lib.units import inch
from reportlab.platypus import PageBreak, Paragraph, Spacer

from report_pdf_common import BrandDocTemplate, REPORTS, ROOT, STYLES, callout, cover_story, markdown_blocks, p


SOURCE = ROOT / "docs" / "SINISTER-DIESEL-V2-WEBSITE-HANDBOOK.md"
OUT = REPORTS / "Sinister-Diesel-V2-Website-Handbook.pdf"


def build():
    md = SOURCE.read_text(encoding="utf-8")
    headings = re.findall(r"^## (.+)$", md, flags=re.MULTILINE)
    doc = BrandDocTemplate(str(OUT), "Sinister Diesel V2 Website, Commerce, and Operations Handbook")
    story = cover_story(
        "V2 WEBSITE\nHANDBOOK",
        "The canonical guide to how Sinister Diesel V2 works, what changed, how it is released, and how the company operates it safely.",
        "RELEASE-CANDIDATE EDITION / JULY 21, 2026",
        [("Platform", "MIVA", "blue"), ("Branch", "REVAMP V2", "blue"), ("Sections", str(len(headings)), "good"), ("Status", "RC", "warn")],
    )
    story.append(Paragraph("DOCUMENT CONTROL", STYLES["h1"]))
    story.append(callout("Canonical source", "docs/SINISTER-DIESEL-V2-WEBSITE-HANDBOOK.md — update the Markdown first, then regenerate this PDF.", "blue"))
    story.append(Spacer(1, 10))
    story.append(p("This edition records the release-candidate state of the Revamp_v2 preview. It does not state that V2 is already the production/default storefront. External dependencies, owner-controlled publication, and post-launch measurement remain explicit."))
    story.append(Spacer(1, 12))
    story.append(Paragraph("CONTENTS", STYLES["h2"]))
    for n, heading in enumerate(headings, 1):
        story.append(Paragraph(f"<font color='#2447E8'>{n:02d}</font>&nbsp;&nbsp;{heading}", STYLES["toc"]))
    story.append(PageBreak())
    story.extend(markdown_blocks(md))
    doc.build(story)
    print(f"WROTE {OUT}")


if __name__ == "__main__":
    build()
