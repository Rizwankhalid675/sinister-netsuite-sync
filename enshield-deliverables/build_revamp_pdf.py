# -*- coding: utf-8 -*-
"""Generates the V2 Revamp Status PDF. Analysis only - reads no code, writes only a PDF."""
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                TableStyle, HRFlowable)
from reportlab.lib.enums import TA_LEFT

OUT = "V2-Revamp-Status-Report.pdf"
RED = colors.HexColor("#c0392b")
DARK = colors.HexColor("#1a1a1a")
GREY = colors.HexColor("#666666")
LGREY = colors.HexColor("#eeeeee")
GREEN = colors.HexColor("#2e7d32")
AMBER = colors.HexColor("#b8860b")

styles = getSampleStyleSheet()
H1 = ParagraphStyle('H1', parent=styles['Heading1'], fontSize=20, textColor=RED, spaceAfter=4, leading=24)
SUB = ParagraphStyle('SUB', parent=styles['Normal'], fontSize=10, textColor=GREY, spaceAfter=12)
H2 = ParagraphStyle('H2', parent=styles['Heading2'], fontSize=13.5, textColor=DARK, spaceBefore=14, spaceAfter=6)
BODY = ParagraphStyle('BODY', parent=styles['Normal'], fontSize=9.6, leading=14, textColor=DARK, alignment=TA_LEFT)
CELL = ParagraphStyle('CELL', parent=styles['Normal'], fontSize=8.6, leading=11.5, textColor=DARK)
CELLB = ParagraphStyle('CELLB', parent=CELL, fontName='Helvetica-Bold')
SMALL = ParagraphStyle('SMALL', parent=styles['Normal'], fontSize=8, textColor=GREY, leading=11)

story = []

def hr(c=RED, w=1.2):
    story.append(Spacer(1, 4)); story.append(HRFlowable(width="100%", thickness=w, color=c)); story.append(Spacer(1, 4))

# ---- Header ----
story.append(Paragraph("Sinister Diesel &mdash; V2 Website Revamp", H1))
story.append(Paragraph("Status Report for Brain &nbsp;&bull;&nbsp; branch <b>Revamp_v2</b> (id 37) &nbsp;&bull;&nbsp; prepared from working directory analysis, no code changed", SUB))
hr()

# ---- Executive summary ----
story.append(Paragraph("1.&nbsp; Executive Summary", H2))
story.append(Paragraph(
    "The V2 revamp rebuilds the storefront on a new global design system (<b>sd2-global.css</b>, "
    "<b>sd2-v2-components.js</b>) with a fresh set of V2 templates and partials. The core commerce "
    "path and account area are built and wired in Miva Admin; the largest remaining bucket is "
    "content/QA finishing &mdash; placeholder copy, image feeds, and a full human QA pass on staging "
    "before the site can be flipped live. Overall the revamp is roughly <b>80% complete</b>.", BODY))
story.append(Spacer(1, 6))

# ---- Overall gauge table ----
prog = [
    ["Area", "Status", "Est. %"],
    ["Design system (CSS/JS foundation)", "Complete", "100%"],
    ["Core commerce path (home, PLP, PDP, cart, checkout)", "Built &amp; wired", "95%"],
    ["Account &amp; order area (login, dashboard, orders, wishlist)", "Built &amp; wired", "90%"],
    ["Static / help / policy pages", "Mostly migrated", "85%"],
    ["Native help/contact forms system (NEW)", "Built &amp; wired", "85%"],
    ["Forms&rarr;monday.com sync service (NEW)", "Built + tested", "80%"],
    ["Motion / animation system (sd2-motion.js) (NEW)", "Built", "75%"],
    ["Content: placeholder copy &amp; product image feeds", "In progress", "55%"],
    ["Final QA pass on staging (mobile, motion, cross-browser)", "Not started", "10%"],
]
t = Table([[Paragraph(c, CELLB) if i==0 else Paragraph(c, CELL) for c in r] for i,r in enumerate(prog)],
          colWidths=[3.5*inch, 1.9*inch, 0.9*inch])
t.setStyle(TableStyle([
    ('BACKGROUND',(0,0),(-1,0),DARK), ('TEXTCOLOR',(0,0),(-1,0),colors.white),
    ('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'), ('FONTSIZE',(0,0),(-1,0),9),
    ('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white, LGREY]),
    ('GRID',(0,0),(-1,-1),0.4,colors.HexColor("#cccccc")),
    ('VALIGN',(0,0),(-1,-1),'MIDDLE'), ('ALIGN',(2,0),(2,-1),'CENTER'),
    ('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),
]))
story.append(t)

# ---- By the numbers ----
story.append(Paragraph("2.&nbsp; By the Numbers", H2))
nums = [
    ["Metric", "Value"],
    ["V2 templates built", "75"],
    ["V2 reusable partials built", "52"],
    ["Live account/order templates migrated to V2", "19"],
    ["Live static/help/policy pages migrated to V2", "19"],
    ["Native help/contact form templates (NEW)", "38"],
    ["Forms&rarr;monday.com sync service files (NEW)", "14 (incl. 5 test suites)"],
    ["Global stylesheet (sd2-global.css)", "7,363 lines / ~443 KB"],
    ["Global component JS (sd2-v2-components.js)", "1,427 lines / ~66 KB"],
    ["Motion system (sd2-motion.js) (NEW)", "876 lines"],
    ["Templates still carrying [Placeholder] content", "55"],
]
t2 = Table([[Paragraph(c, CELLB) if i==0 else Paragraph(c, CELL) for c in r] for i,r in enumerate(nums)],
           colWidths=[4.4*inch, 1.9*inch])
t2.setStyle(TableStyle([
    ('BACKGROUND',(0,0),(-1,0),RED), ('TEXTCOLOR',(0,0),(-1,0),colors.white),
    ('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),
    ('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white, LGREY]),
    ('GRID',(0,0),(-1,-1),0.4,colors.HexColor("#cccccc")),
    ('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),
]))
story.append(t2)

# ---- Done ----
story.append(Paragraph("3.&nbsp; What Is Done", H2))
for txt in [
    "<b>Design system foundation.</b> Global V2 stylesheet and component JS are complete and "
    "loaded across the store; tokens for spacing, typography, and components are standardized.",
    "<b>Core commerce path.</b> Home, product listing, product detail (PDP), mega-menu, cart, "
    "and checkout templates are built and wired into Miva Admin on the Revamp_v2 branch.",
    "<b>Account &amp; orders.</b> Login, dashboard, order history/detail, address book, and "
    "wishlist templates are migrated to V2 (19 live account/order templates rebuilt).",
    "<b>Static &amp; policy pages.</b> Help center, about, reviews, resellers, FAQs, warranty, "
    "rewards, and policy/terms pages migrated to V2 (19 pages).",
    "<b>Navigation.</b> Mega-menu category links fixed to resolve per nav item (commit 7c1d8a8).",
    "<b>Native forms system (NEW, 2026-07-15).</b> 38 help/contact form templates built &mdash; "
    "help center, order status, sales inquiry, tech support, warranty inquiry, tracking, "
    "returns/exchanges, online account issues, and shipping-protection requests, each with "
    "header/footer/form-note partials.",
    "<b>Forms sync service (NEW).</b> A dedicated <b>forms-sync</b> Node service (14 files) wires "
    "help and sales form submissions into monday.com, backed by 5 automated test suites.",
    "<b>Motion system (NEW).</b> sd2-motion.js (876 lines) adds the animation/motion layer across "
    "the V2 store.",
]:
    story.append(Paragraph("&bull;&nbsp; " + txt, BODY)); story.append(Spacer(1,3))

# ---- Remaining ----
story.append(Paragraph("4.&nbsp; What Is Left", H2))
rem = [
    ["Remaining item", "Effort", "Blocks go-live?"],
    ["Replace [Placeholder] copy in 55 templates", "~2&ndash;3 days", "Yes"],
    ["Finish product image / merchant feed cleanup", "~1&ndash;2 days", "Yes"],
    ["Full QA pass on staging URL (mobile, motion, cross-browser)", "~2&ndash;3 days", "Yes"],
    ["Confirm dynamic content/blog cards render on live data", "~1 day", "Partial"],
    ["Final visual sign-off &amp; production cutover", "~0.5 day", "Yes"],
]
t3 = Table([[Paragraph(c, CELLB) if i==0 else Paragraph(c, CELL) for c in r] for i,r in enumerate(rem)],
           colWidths=[3.7*inch, 1.4*inch, 1.2*inch])
t3.setStyle(TableStyle([
    ('BACKGROUND',(0,0),(-1,0),AMBER), ('TEXTCOLOR',(0,0),(-1,0),colors.white),
    ('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),
    ('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white, LGREY]),
    ('GRID',(0,0),(-1,-1),0.4,colors.HexColor("#cccccc")),
    ('ALIGN',(1,0),(2,-1),'CENTER'),
    ('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),
]))
story.append(t3)
story.append(Spacer(1,6))
story.append(Paragraph(
    "<b>Estimated time remaining to go-live: ~6&ndash;9 working days</b> (roughly 1.5&ndash;2 weeks "
    "of calendar time), the bulk of which is content finishing and a proper QA pass on staging &mdash; "
    "not new build work. The technical structure is essentially in place.", BODY))

# ---- Live vs revamp diff ----
story.append(Paragraph("5.&nbsp; Current Live Site vs. Revamped (V2) Site", H2))
diff = [
    ["Aspect", "Current LIVE site", "Revamped V2 site"],
    ["Design system", "Legacy per-page CSS, inconsistent spacing/type", "Unified sd2-global.css tokens + shared V2 components"],
    ["Templates", "Original legacy .mvt (untouched, still live)", "75 new V2 templates + 52 reusable partials"],
    ["Component JS", "Ad-hoc / page-level scripts", "Single sd2-v2-components.js (1,427 lines)"],
    ["Navigation", "Legacy mega-menu", "Rebuilt mega-menu, per-item category link fix"],
    ["Account/orders", "Legacy account area", "19 rebuilt V2 account/order templates"],
    ["Content state", "Final production copy &amp; images", "55 templates still on [Placeholder] copy"],
    ["Where it lives", "Production branch (live to customers)", "Miva branch Revamp_v2 (id 37), not public yet"],
]
t4 = Table([[Paragraph(c, CELLB) if i==0 else Paragraph(c, CELL) for c in r] for i,r in enumerate(diff)],
           colWidths=[1.35*inch, 2.55*inch, 2.55*inch])
t4.setStyle(TableStyle([
    ('BACKGROUND',(0,0),(-1,0),DARK), ('TEXTCOLOR',(0,0),(-1,0),colors.white),
    ('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'), ('FONTSIZE',(0,0),(-1,0),8.6),
    ('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white, LGREY]),
    ('GRID',(0,0),(-1,-1),0.4,colors.HexColor("#cccccc")),
    ('VALIGN',(0,0),(-1,-1),'TOP'),
    ('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),
]))
story.append(t4)
story.append(Spacer(1,4))
story.append(Paragraph(
    "Note: the legacy live templates remain untouched &mdash; the V2 work sits on a separate Miva "
    "branch, so nothing shown to customers changes until we deliberately publish the revamp.", SMALL))

hr(GREY, 0.6)
story.append(Paragraph(
    "Prepared from a read-only analysis of the sinister-revamp working directory (branch Revamp_v2, "
    "config branch id 37). No code, templates, or Miva settings were modified in producing this report.",
    SMALL))

SimpleDocTemplate(OUT, pagesize=letter, topMargin=0.7*inch, bottomMargin=0.6*inch,
                  leftMargin=0.75*inch, rightMargin=0.75*inch,
                  title="V2 Revamp Status Report").build(story)
print("WROTE", OUT)
