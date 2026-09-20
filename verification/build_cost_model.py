import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.comments import Comment

BLUE = Font(name="Arial", color="0000FF")          # hardcoded inputs / levers
BLACK = Font(name="Arial", color="000000")
BOLD = Font(name="Arial", bold=True)
BOLDW = Font(name="Arial", bold=True, color="FFFFFF")
YELLOW = PatternFill("solid", fgColor="FFF2CC")
HEADER = PatternFill("solid", fgColor="1F3864")
SUBTOT = PatternFill("solid", fgColor="DDEBF7")
GREEN = Font(name="Arial", color="008000")
thin = Side(style="thin", color="BFBFBF")
BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)
USD = '$#,##0;($#,##0);-'
USD2 = '$#,##0.00'
PCT = '0.0%'

wb = openpyxl.Workbook()

# ---------------- Assumptions ----------------
a = wb.active
a.title = "Assumptions"
a["A1"] = "AdSniper — operating-cost assumptions (per dedicated customer instance, monthly USD)"
a["A1"].font = Font(name="Arial", bold=True, size=13)
a.merge_cells("A1:D1")
a["A2"] = ("MODELED, not yet reconciled against a real invoice. Provider figures are the Gate-2 pilot's job; "
           "every rate below is a documented baseline or public list price. Blue = input you can change; yellow = key lever.")
a["A2"].font = Font(name="Arial", italic=True, size=9)
a.merge_cells("A2:D2")

hdr = ["Cost line", "Base", "High", "Basis / source"]
for i, h in enumerate(hdr):
    c = a.cell(row=4, column=1+i, value=h); c.font = BOLDW; c.fill = HEADER; c.border = BORDER
    c.alignment = Alignment(horizontal="center" if i else "left")

rows = [
    ("Ads provider — Meta+Google, per tracked brand", 4.5, 9.0,
     "Modeled from README baseline ($60–120/mo at 100-ad caps, 9 brands, 3 libraries); scaled to 2 libraries. Reconcile in the Gate-2 pilot."),
    ("Organic provider — X+LinkedIn posts, per tracked brand", 0.5, 1.5,
     "README: X ~$3–6/mo, LinkedIn ~$2–4/mo across the brand set. Secondary module."),
    ("Apify subscription floor (dedicated token, Starter)", 19.0, 19.0,
     "apify.com/pricing — Starter $19/mo incl. $19 usage credit; usage above draws overage."),
    ("Hosting — Railway app service + Postgres + volume", 16.0, 30.0,
     "railway.com/pricing usage rates: RAM $0.00000386/GB/s, vCPU $0.00000772/vCPU/s. Small always-on Node + Postgres."),
    ("Storage — Cloudflare R2 (per instance)", 0.25, 2.0,
     "R2 $0.015/GB-mo, egress free, 10 GB free tier. ~0.5–1.5 GB/mo media growth."),
    ("AI briefings — Anthropic (per instance)", 2.0, 5.0,
     "Claude Sonnet 5 $2/$10 per MTok. Daily+weekly briefs are small; optional (facts-only fallback if unset)."),
    ("Email — Resend (per instance)", 0.0, 1.0,
     "resend.com/pricing free 3,000/mo covers login magic links; one account serves the fleet."),
    ("Support — internal operator effort (per instance)", 25.0, 75.0,
     "ESTIMATE, internal labor not cash. Onboarding + ongoing support. Confirm with the first real onboarding (Gate 5)."),
]
r = 5
addr = {}
keys = ["ads","organic","apify","hosting","r2","ai","email","support"]
for k,(label, base, high, src) in zip(keys, rows):
    a.cell(row=r, column=1, value=label).font = BLACK
    b = a.cell(row=r, column=2, value=base); b.font = BLUE; b.number_format = USD2; b.fill = YELLOW; b.border = BORDER
    h = a.cell(row=r, column=3, value=high); h.font = BLUE; h.number_format = USD2; h.fill = YELLOW; h.border = BORDER
    s = a.cell(row=r, column=4, value=src); s.font = Font(name="Arial", size=8); s.alignment = Alignment(wrap_text=True, vertical="top")
    a.cell(row=r,column=1).border = BORDER
    addr[k] = r
    r += 1

peg_row = r + 1
a.cell(row=peg_row, column=1, value="USD → SAR peg").font = BLACK
pc = a.cell(row=peg_row, column=2, value=3.75); pc.font = BLUE; pc.fill = YELLOW; pc.number_format = "0.00"; pc.border = BORDER
addr["peg"] = peg_row

a.column_dimensions["A"].width = 46
a.column_dimensions["B"].width = 11
a.column_dimensions["C"].width = 11
a.column_dimensions["D"].width = 70

def A(key, col):  # reference to an assumption cell; col 'B'(base) or 'C'(high)
    return f"Assumptions!${col}${addr[key]}"

# ---------------- CostModel ----------------
cm = wb.create_sheet("CostModel")
cm["A1"] = "Annual operating cost per instance — 3 / 5 / 9 tracked brands (self + competitors), Base vs High usage"
cm["A1"].font = Font(name="Arial", bold=True, size=13); cm.merge_cells("A1:H1")

# scenario columns: C..H
scen = [("3-brand","Base","B",3,"C"),("3-brand","High","C",3,"D"),
        ("5-brand","Base","B",5,"E"),("5-brand","High","C",5,"F"),
        ("9-brand","Base","B",9,"G"),("9-brand","High","C",9,"H")]
# header rows
cm.cell(row=3, column=1, value="Cost line (monthly USD)").font = BOLDW
cm.cell(row=3, column=1).fill = HEADER; cm.cell(row=3,column=1).border=BORDER
for name,scn,acol,brands,col in scen:
    c1 = cm[f"{col}2"]; c1.value = name; c1.font = BOLDW; c1.fill = HEADER; c1.alignment = Alignment(horizontal="center"); c1.border=BORDER
    c2 = cm[f"{col}3"]; c2.value = scn; c2.font = BOLDW; c2.fill = HEADER; c2.alignment = Alignment(horizontal="center"); c2.border=BORDER

# brand-count row
cm.cell(row=4, column=1, value="Tracked brands (self + competitors)").font = BOLD
for name,scn,acol,brands,col in scen:
    c = cm[f"{col}4"]; c.value = brands; c.font = BLUE; c.alignment=Alignment(horizontal="center"); c.number_format="0"; c.border=BORDER

lines = [
    ("apify",   "Apify (provider scraping) — MAX(floor, ads+organic usage)"),
    ("hosting", "Railway hosting (app + Postgres)"),
    ("r2",      "Cloudflare R2 storage"),
    ("ai",      "AI briefings (Anthropic)"),
    ("email",   "Email (Resend)"),
    ("support", "Support — internal operator effort"),
]
start = 5
for i,(k,label) in enumerate(lines):
    rr = start+i
    cm.cell(row=rr, column=1, value=label).font = BLACK
    cm.cell(row=rr, column=1).border=BORDER
    for name,scn,acol,brands,col in scen:
        cell = cm[f"{col}{rr}"]
        if k == "apify":
            cell.value = f"=MAX({A('apify',acol)}*{col}$4 + {A('organic',acol)}*{col}$4, {A('apify',acol.replace('apify','apify'))})"
            cell.value = f"=MAX({A('apify',acol)}, ({A('ads',acol)}+{A('organic',acol)})*{col}$4)"
        else:
            cell.value = f"={A(k,acol)}"
        cell.number_format = USD; cell.font = BLACK; cell.border=BORDER

mtot = start+len(lines)   # monthly total row
cm.cell(row=mtot, column=1, value="Monthly total (fully loaded)").font = BOLD
cm.cell(row=mtot, column=1).fill = SUBTOT; cm.cell(row=mtot,column=1).border=BORDER
for name,scn,acol,brands,col in scen:
    cell = cm[f"{col}{mtot}"]; cell.value = f"=SUM({col}{start}:{col}{mtot-1})"
    cell.number_format = USD; cell.font = BOLD; cell.fill = SUBTOT; cell.border=BORDER

ann = mtot+1
cm.cell(row=ann, column=1, value="ANNUAL total (fully loaded)").font = BOLD
cm.cell(row=ann, column=1).fill = SUBTOT; cm.cell(row=ann,column=1).border=BORDER
for name,scn,acol,brands,col in scen:
    cell = cm[f"{col}{ann}"]; cell.value = f"={col}{mtot}*12"; cell.number_format = USD; cell.font = Font(name="Arial",bold=True); cell.fill=SUBTOT; cell.border=BORDER

anncash = ann+1
cm.cell(row=anncash, column=1, value="ANNUAL cash cost (excl. internal support labor)").font = BLACK
suprow = start + [k for k,_ in lines].index("support")
for name,scn,acol,brands,col in scen:
    cell = cm[f"{col}{anncash}"]; cell.value = f"=({col}{mtot}-{col}{suprow})*12"; cell.number_format = USD; cell.font=BLACK; cell.border=BORDER

annsar = anncash+1
cm.cell(row=annsar, column=1, value="ANNUAL total in SAR (fully loaded)").font = BLACK
for name,scn,acol,brands,col in scen:
    cell = cm[f"{col}{annsar}"]; cell.value = f"={col}{ann}*{A('peg','B')}"; cell.number_format = '"SAR"#,##0'; cell.font=GREEN; cell.border=BORDER

cm.cell(row=annsar+2, column=1,
    value="Read: provider (Apify) and internal support dominate; hosting/storage/AI/email are small and near-fixed. "
          "The cost delta between 3 and 9 brands is modest — so pricing should NOT be cost-plus per brand (see Pricing).").font = Font(name="Arial", italic=True, size=9)
cm.merge_cells(f"A{annsar+2}:H{annsar+2}")

cm.column_dimensions["A"].width = 46
for col in "CDEFGH":
    cm.column_dimensions[col].width = 12

# stash row indices for Pricing
ANN_ROW = ann

# ---------------- Pricing ----------------
pr = wb.create_sheet("Pricing")
pr["A1"] = "Pricing recommendation — annual per dedicated instance (RECOMMENDATION; needs operator sign-off + beta validation)"
pr["A1"].font = Font(name="Arial", bold=True, size=13); pr.merge_cells("A1:F1")
pr["A2"] = ("Cost is the floor, not the anchor. Shared-seat tools ($9–159/mo ≈ $108–1,908/yr) are NOT comparable to a "
            "dedicated, isolated, Arabic-first instance with an executive briefing. Price on value; the model below shows margin is not the constraint.")
pr["A2"].font = Font(name="Arial", italic=True, size=9); pr.merge_cells("A2:F2")

ph = ["Scenario","Annual USD","Annual SAR","Fully-loaded COGS (9-brand High)","Gross margin","Notes"]
for i,h in enumerate(ph):
    c = pr.cell(row=4, column=1+i, value=h); c.font=BOLDW; c.fill=HEADER; c.border=BORDER; c.alignment=Alignment(horizontal="center" if i else "left", wrap_text=True)

# use the worst-case COGS (9-brand High = column H annual) as the conservative margin denominator
COGS = f"CostModel!$H${ANN_ROW}"
price_rows = [
    ("Standard — List (up to 5 competitors)", 25600, "Anchor. SAR 96,000. All features, standard isolation."),
    ("Standard — Target", 20000, "SAR 75,000. Expected close for a mid-size bank."),
    ("Standard — Floor (approval required)", 14667, "SAR 55,000. Below this needs exec sign-off."),
    ("Enterprise exception (up to 9 + separate Cloudflare acct)", 40000, "SAR 150,000. Strict-compliance buyers only."),
    ("Beta / design partner (year 1, first 2–3)", 8000, "SAR 30,000 (~60% off) for a reference + feedback + case study."),
]
rr = 5
for label, usd, note in price_rows:
    pr.cell(row=rr, column=1, value=label).font=BLACK; pr.cell(row=rr,column=1).border=BORDER
    c = pr.cell(row=rr, column=2, value=usd); c.font=BLUE; c.fill=YELLOW; c.number_format=USD; c.border=BORDER
    pr.cell(row=rr, column=3, value=f"=B{rr}*{A('peg','B')}").number_format='"SAR"#,##0'; pr.cell(row=rr,column=3).font=GREEN; pr.cell(row=rr,column=3).border=BORDER
    pr.cell(row=rr, column=4, value=f"={COGS}").number_format=USD; pr.cell(row=rr,column=4).font=BLACK; pr.cell(row=rr,column=4).border=BORDER
    pr.cell(row=rr, column=5, value=f"=(B{rr}-D{rr})/B{rr}").number_format=PCT; pr.cell(row=rr,column=5).font=BOLD; pr.cell(row=rr,column=5).border=BORDER
    pr.cell(row=rr, column=6, value=note).font=Font(name="Arial", size=8); pr.cell(row=rr,column=6).alignment=Alignment(wrap_text=True, vertical="top"); pr.cell(row=rr,column=6).border=BORDER
    rr += 1

pr.cell(row=rr+1, column=1, value="Provider ceiling per plan (MONTHLY_COST_CEILING_ADS_USD): Standard $60 · Enterprise $120. The ceiling is the margin guardrail.").font=Font(name="Arial", italic=True, size=9)
pr.merge_cells(f"A{rr+1}:F{rr+1}")
pr.cell(row=rr+2, column=1, value="Discount authority: Sales → Target freely · Floor needs head-of-function · below Floor needs exec. Record the final decision in docs/DECISIONS.md.").font=Font(name="Arial", italic=True, size=9)
pr.merge_cells(f"A{rr+2}:F{rr+2}")

pr.column_dimensions["A"].width = 42
for col in "BCD": pr.column_dimensions[col].width = 16
pr.column_dimensions["E"].width = 12
pr.column_dimensions["F"].width = 40

wb.save("/home/claude/adsniper/deliverables/AdSniper_cost_model.xlsx")
print("saved workbook")
