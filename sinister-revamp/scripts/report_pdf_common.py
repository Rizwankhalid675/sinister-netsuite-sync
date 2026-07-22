from __future__ import annotations

import html
import os
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    HRFlowable,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    PageTemplate,
    Paragraph,
    Preformatted,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "reports"

NAVY = colors.HexColor("#071427")
NAVY_2 = colors.HexColor("#0B1F3A")
BLUE = colors.HexColor("#2447E8")
BLUE_2 = colors.HexColor("#4168FF")
BLUE_PALE = colors.HexColor("#E9EFFF")
GOLD = colors.HexColor("#D8A817")
INK = colors.HexColor("#0D1322")
TEXT = colors.HexColor("#3E485D")
MUTED = colors.HexColor("#758099")
LINE = colors.HexColor("#D8E0EE")
PAPER = colors.HexColor("#F5F7FB")
WHITE = colors.white
GREEN = colors.HexColor("#087F5B")
GREEN_PALE = colors.HexColor("#E4F6EF")
AMBER = colors.HexColor("#A96500")
AMBER_PALE = colors.HexColor("#FFF2D6")
RED = colors.HexColor("#B42318")
RED_PALE = colors.HexColor("#FEECE9")


def register_fonts() -> None:
    font = Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts" / "bahnschrift.ttf"
    if font.exists():
        try:
            pdfmetrics.registerFont(TTFont("SDDisplay", str(font)))
            return
        except Exception:
            pass


register_fonts()
DISPLAY = "SDDisplay" if "SDDisplay" in pdfmetrics.getRegisteredFontNames() else "Helvetica-Bold"


def build_styles():
    base = getSampleStyleSheet()
    return {
        "cover_kicker": ParagraphStyle("cover_kicker", fontName="Courier-Bold", fontSize=8, leading=11, textColor=colors.HexColor("#9DB4FF"), spaceAfter=14, tracking=1.2),
        "cover_title": ParagraphStyle("cover_title", fontName=DISPLAY, fontSize=35, leading=38, textColor=WHITE, spaceAfter=18),
        "cover_sub": ParagraphStyle("cover_sub", fontName="Helvetica", fontSize=13, leading=19, textColor=colors.HexColor("#DDE5F5"), spaceAfter=18),
        "h1": ParagraphStyle("h1", fontName=DISPLAY, fontSize=27, leading=31, textColor=NAVY, spaceBefore=6, spaceAfter=13),
        "h2": ParagraphStyle("h2", fontName=DISPLAY, fontSize=19, leading=23, textColor=NAVY, spaceBefore=15, spaceAfter=9, keepWithNext=True),
        "h3": ParagraphStyle("h3", fontName=DISPLAY, fontSize=13, leading=17, textColor=BLUE, spaceBefore=12, spaceAfter=6, keepWithNext=True),
        "body": ParagraphStyle("body", parent=base["BodyText"], fontName="Helvetica", fontSize=9.2, leading=13.8, textColor=TEXT, spaceAfter=7),
        "body_small": ParagraphStyle("body_small", parent=base["BodyText"], fontName="Helvetica", fontSize=7.8, leading=11.5, textColor=MUTED, spaceAfter=5),
        "body_white": ParagraphStyle("body_white", parent=base["BodyText"], fontName="Helvetica", fontSize=9, leading=13.5, textColor=WHITE),
        "metric": ParagraphStyle("metric", fontName=DISPLAY, fontSize=22, leading=25, textColor=NAVY, alignment=TA_CENTER),
        "metric_label": ParagraphStyle("metric_label", fontName="Courier-Bold", fontSize=6.8, leading=9, textColor=MUTED, alignment=TA_CENTER, tracking=.5),
        "table": ParagraphStyle("table", fontName="Helvetica", fontSize=7.2, leading=9.7, textColor=TEXT),
        "table_head": ParagraphStyle("table_head", fontName="Helvetica-Bold", fontSize=7, leading=9, textColor=WHITE),
        "table_head_dark": ParagraphStyle("table_head_dark", fontName="Helvetica-Bold", fontSize=7, leading=9, textColor=NAVY),
        "callout": ParagraphStyle("callout", fontName="Helvetica", fontSize=9, leading=13.5, textColor=NAVY),
        "code": ParagraphStyle(
            "code",
            fontName="Courier",
            fontSize=6.7,
            leading=9.2,
            textColor=colors.HexColor("#DDE7FF"),
            backColor=NAVY_2,
            borderPadding=9,
            spaceBefore=4,
            spaceAfter=8,
        ),
        "toc": ParagraphStyle("toc", fontName="Helvetica", fontSize=9.2, leading=14, textColor=TEXT, leftIndent=6),
    }


STYLES = build_styles()


def safe(text: str) -> str:
    text = re.sub(r"BranchKey=[A-Za-z0-9_-]+", "BranchKey=[redacted]", text)
    text = html.escape(text, quote=False)
    code_spans = []

    def preserve_code(match):
        code_spans.append(match.group(1))
        return f"@@SDCODE{len(code_spans) - 1}@@"

    text = re.sub(r"`([^`]+)`", preserve_code, text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"\*([^*]+)\*", r"<i>\1</i>", text)
    text = re.sub(r"\[([^]]+)\]\(([^)]+)\)", r"<u>\1</u>", text)
    for index, code in enumerate(code_spans):
        text = text.replace(f"@@SDCODE{index}@@", f"<font name='Courier'>{code}</font>")
    return text


def p(text: str, style="body"):
    return Paragraph(safe(text), STYLES[style])


class BrandDocTemplate(BaseDocTemplate):
    def __init__(self, filename, title, **kwargs):
        super().__init__(
            filename,
            pagesize=letter,
            leftMargin=.58 * inch,
            rightMargin=.58 * inch,
            topMargin=.62 * inch,
            bottomMargin=.55 * inch,
            title=title,
            author="Sinister Diesel",
            creator="Sinister Diesel V2 reporting system",
            **kwargs,
        )
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="content", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        self.addPageTemplates(PageTemplate(id="brand", frames=[frame], onPage=self._page))

    def _page(self, canvas, doc):
        canvas.saveState()
        w, h = letter
        canvas.setFillColor(PAPER)
        canvas.rect(0, 0, w, h, fill=1, stroke=0)
        canvas.setFillColor(NAVY)
        canvas.rect(0, h - .16 * inch, w, .16 * inch, fill=1, stroke=0)
        canvas.setFillColor(BLUE)
        canvas.rect(w - 1.18 * inch, h - .16 * inch, 1.18 * inch, .16 * inch, fill=1, stroke=0)
        canvas.setStrokeColor(LINE)
        canvas.line(self.leftMargin, .35 * inch, w - self.rightMargin, .35 * inch)
        canvas.setFont("Courier-Bold", 6.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(self.leftMargin, .21 * inch, "SINISTER DIESEL / V2 RELEASE EVIDENCE")
        canvas.drawRightString(w - self.rightMargin, .21 * inch, f"{doc.page:02d}")
        canvas.restoreState()


class HeroPanel(Flowable):
    def __init__(self, title, subtitle, kicker, height=3.1 * inch):
        super().__init__()
        self.title, self.subtitle, self.kicker, self.height = title, subtitle, kicker, height

    def wrap(self, availWidth, availHeight):
        self.width = availWidth
        return availWidth, self.height

    def draw(self):
        c = self.canv
        c.setFillColor(NAVY)
        c.roundRect(0, 0, self.width, self.height, 16, fill=1, stroke=0)
        c.setFillColor(BLUE)
        c.rect(self.width * .67, 0, self.width * .33, self.height, fill=1, stroke=0)
        c.setStrokeColor(colors.Color(1, 1, 1, .13))
        for x in [self.width * .22, self.width * .44, self.width * .66, self.width * .84]:
            c.line(x, 0, x, self.height)
        for y in [self.height * .33, self.height * .66]:
            c.line(0, y, self.width, y)
        kicker = Paragraph(safe(self.kicker), STYLES["cover_kicker"])
        title = Paragraph(safe(self.title), STYLES["cover_title"])
        sub = Paragraph(safe(self.subtitle), STYLES["cover_sub"])
        kicker.wrapOn(c, self.width * .58, .4 * inch)
        kicker.drawOn(c, .34 * inch, self.height - .52 * inch)
        tw, th = title.wrap(self.width * .58, self.height)
        title.drawOn(c, .34 * inch, self.height - .72 * inch - th)
        sw, sh = sub.wrap(self.width * .58, self.height)
        sub.drawOn(c, .34 * inch, .32 * inch)
        c.setFillColor(WHITE)
        c.setFont(DISPLAY, 43)
        c.drawCentredString(self.width * .835, self.height * .45, "V2")
        c.setFont("Courier-Bold", 6.5)
        c.setFillColor(colors.HexColor("#C5D3FF"))
        c.drawCentredString(self.width * .835, self.height * .34, "MEASURE / VERIFY / RELEASE")


class DeltaBar(Flowable):
    def __init__(self, label, legacy, v2, unit="", better="lower", width=None):
        super().__init__()
        self.label, self.legacy, self.v2, self.unit, self.better = label, legacy, v2, unit, better
        self.requested_width = width
        self.height = .55 * inch

    def wrap(self, availWidth, availHeight):
        self.width = self.requested_width or availWidth
        return self.width, self.height

    def draw(self):
        c = self.canv
        maxv = max(float(self.legacy), float(self.v2), 1)
        good = self.v2 < self.legacy if self.better == "lower" else self.v2 > self.legacy
        c.setFont("Helvetica-Bold", 7.5)
        c.setFillColor(NAVY)
        c.drawString(0, self.height - 9, self.label)
        c.setFont("Helvetica", 6.5)
        c.setFillColor(MUTED)
        c.drawRightString(self.width, self.height - 9, f"Legacy {self.legacy}{self.unit}  /  V2 {self.v2}{self.unit}")
        y = 10
        c.setFillColor(colors.HexColor("#DCE2ED"))
        c.roundRect(0, y + 8, self.width * float(self.legacy) / maxv, 5, 2.5, fill=1, stroke=0)
        c.setFillColor(GREEN if good else AMBER)
        c.roundRect(0, y, self.width * float(self.v2) / maxv, 5, 2.5, fill=1, stroke=0)


class MermaidPanel(Flowable):
    def __init__(self, code: str):
        super().__init__()
        self.code = code
        self.labels = []
        for label in re.findall(r"\[([^\]]+)\]", code):
            if label not in self.labels:
                self.labels.append(label)
        if not self.labels:
            self.labels = [line.strip().lstrip(":").strip() for line in code.splitlines() if ":" in line and not line.strip().startswith("title")][:8]
        self.labels = self.labels[:9]
        self.height = max(1.05 * inch, (.43 * inch * len(self.labels)) + .38 * inch)

    def wrap(self, availWidth, availHeight):
        self.width = availWidth
        return availWidth, self.height

    def draw(self):
        c = self.canv
        c.setFillColor(NAVY_2)
        c.roundRect(0, 0, self.width, self.height, 11, fill=1, stroke=0)
        c.setFont("Courier-Bold", 6.2)
        c.setFillColor(colors.HexColor("#9DB4FF"))
        c.drawString(14, self.height - 17, "SYSTEM FLOW / STATIC RENDER")
        y = self.height - 34
        for i, label in enumerate(self.labels):
            c.setFillColor(BLUE if i % 2 == 0 else colors.HexColor("#17336A"))
            c.roundRect(16, y - 12, self.width - 32, 21, 6, fill=1, stroke=0)
            c.setFillColor(WHITE)
            c.setFont("Helvetica-Bold", 7.2)
            c.drawString(26, y - 4, f"{i + 1:02d}  {label[:95]}")
            y -= .43 * inch


def table(data, widths=None, header=True, font_size=7.2, repeatRows=1):
    cells = []
    for r, row in enumerate(data):
        style = "table_head" if header and r == 0 else "table"
        cells.append([Paragraph(safe(str(v)), STYLES[style]) for v in row])
    t = Table(cells, colWidths=widths, repeatRows=repeatRows if header else 0, hAlign="LEFT")
    commands = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("GRID", (0, 0), (-1, -1), .35, LINE),
        ("ROWBACKGROUNDS", (0, 1 if header else 0), (-1, -1), [WHITE, colors.HexColor("#F8FAFD")]),
    ]
    if header:
        commands += [("BACKGROUND", (0, 0), (-1, 0), NAVY), ("TEXTCOLOR", (0, 0), (-1, 0), WHITE)]
    t.setStyle(TableStyle(commands))
    return t


def metric_cards(items):
    cells = []
    for label, value, tone in items:
        color = {"good": GREEN_PALE, "warn": AMBER_PALE, "bad": RED_PALE, "blue": BLUE_PALE}.get(tone, WHITE)
        content = Table([[Paragraph(str(value), STYLES["metric"])], [Paragraph(label.upper(), STYLES["metric_label"])]], colWidths=[1.35 * inch])
        content.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), color), ("BOX", (0, 0), (-1, -1), .6, LINE), ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 7)]))
        cells.append(content)
    outer = Table([cells], colWidths=[1.48 * inch] * len(cells), hAlign="LEFT")
    outer.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 7)]))
    return outer


def callout(title, body, tone="blue"):
    bg, accent = {"blue": (BLUE_PALE, BLUE), "good": (GREEN_PALE, GREEN), "warn": (AMBER_PALE, AMBER), "bad": (RED_PALE, RED)}[tone]
    content = Paragraph(f"<b>{safe(title)}</b><br/>{safe(body)}", STYLES["callout"])
    t = Table([[content]], colWidths=[7.15 * inch])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), bg), ("LINEBEFORE", (0, 0), (0, -1), 4, accent), ("BOX", (0, 0), (-1, -1), .4, LINE), ("LEFTPADDING", (0, 0), (-1, -1), 12), ("RIGHTPADDING", (0, 0), (-1, -1), 12), ("TOPPADDING", (0, 0), (-1, -1), 10), ("BOTTOMPADDING", (0, 0), (-1, -1), 10)]))
    return t


def section_title(number, title, subtitle=None):
    parts = [Paragraph(f"<font color='#2447E8'>{number}</font>  {safe(title)}", STYLES["h1"])]
    if subtitle:
        parts.append(p(subtitle, "body"))
    parts.append(HRFlowable(width="100%", thickness=1.2, color=BLUE, spaceAfter=9))
    return KeepTogether(parts)


def cover_story(title, subtitle, kicker, meta_lines):
    return [
        Spacer(1, .12 * inch),
        HeroPanel(title, subtitle, kicker),
        Spacer(1, .28 * inch),
        metric_cards(meta_lines[:4]),
        Spacer(1, .23 * inch),
        callout("Release evidence", "Prepared from direct V2 preview measurement, the supplied legacy baseline, source-level regression evidence, and clearly stated limitations.", "blue"),
        PageBreak(),
    ]


def markdown_blocks(markdown: str):
    lines = markdown.splitlines()
    out = []
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        if not line:
            i += 1
            continue
        if line.startswith("```"):
            lang = line[3:].strip()
            buf = []
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                buf.append(lines[i])
                i += 1
            code = "\n".join(buf)
            out.append(MermaidPanel(code) if lang == "mermaid" else Preformatted(code, STYLES["code"]))
            i += 1
            continue
        if line.startswith("| "):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                vals = [v.strip() for v in lines[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r":?-{3,}:?", v) for v in vals):
                    rows.append(vals)
                i += 1
            if rows:
                count = len(rows[0])
                widths = [7.15 * inch / count] * count
                out.append(table(rows, widths=widths))
                out.append(Spacer(1, 6))
            continue
        if line.startswith(">"):
            buf = []
            while i < len(lines) and lines[i].startswith(">"):
                text = lines[i].lstrip(">").strip()
                if text and not text.startswith("[!"):
                    buf.append(text)
                i += 1
            if buf:
                out.append(callout("Document note", " ".join(buf), "blue"))
                out.append(Spacer(1, 7))
            continue
        if re.match(r"^#{1,3} ", line):
            level = len(line) - len(line.lstrip("#"))
            text = line[level:].strip()
            if level == 1:
                out.append(Paragraph(safe(text), STYLES["h1"]))
            elif level == 2:
                out.append(PageBreak())
                out.append(Paragraph(safe(text), STYLES["h1"]))
                out.append(HRFlowable(width="100%", thickness=1.2, color=BLUE, spaceAfter=8))
            else:
                out.append(Paragraph(safe(text), STYLES["h3"]))
            i += 1
            continue
        if line.startswith("---"):
            out.append(HRFlowable(width="100%", thickness=.5, color=LINE, spaceBefore=4, spaceAfter=8))
            i += 1
            continue
        if re.match(r"^\s*[-*] ", line) or re.match(r"^\s*\d+\. ", line):
            items = []
            ordered = bool(re.match(r"^\s*\d+\. ", line))
            while i < len(lines) and (re.match(r"^\s*[-*] ", lines[i]) or re.match(r"^\s*\d+\. ", lines[i])):
                txt = re.sub(r"^\s*(?:[-*]|\d+\.)\s+", "", lines[i]).replace("[ ]", "□").replace("[x]", "■")
                items.append(ListItem(Paragraph(safe(txt), STYLES["body"]), leftIndent=12))
                i += 1
            out.append(ListFlowable(items, bulletType="1" if ordered else "bullet", leftIndent=16, bulletFontName="Helvetica-Bold", bulletFontSize=7, bulletColor=BLUE, spaceAfter=6))
            continue
        buf = [line]
        i += 1
        while i < len(lines) and lines[i].strip() and not re.match(r"^(#{1,3} |```|\||>|---|\s*[-*] |\s*\d+\. )", lines[i]):
            buf.append(lines[i].strip())
            i += 1
        out.append(p(" ".join(buf)))
    return out
