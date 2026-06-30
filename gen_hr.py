from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                 TableStyle, PageBreak, HRFlowable, KeepTogether)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
import datetime

OUTPUT = "/sessions/exciting-sweet-ritchie/mnt/Claude/Appletree_HR_Activity_Plan.pdf"
PAGE_W, PAGE_H = A4

DG   = colors.HexColor("#1B4332")
MG   = colors.HexColor("#2D6A4F")
LG   = colors.HexColor("#D8F3DC")
AG   = colors.HexColor("#52B788")
WH   = colors.white
LGR  = colors.HexColor("#F5F5F5")
MGR  = colors.HexColor("#CCCCCC")
DGR  = colors.HexColor("#333333")
RED  = colors.HexColor("#DC2626")
RED_L= colors.HexColor("#FEF2F2")
BLU  = colors.HexColor("#1D4ED8")
BLU_L= colors.HexColor("#EFF6FF")
ORG  = colors.HexColor("#C2410C")
ORG_L= colors.HexColor("#FFF7ED")
PUR  = colors.HexColor("#7C3AED")
PUR_L= colors.HexColor("#F5F3FF")
AMB  = colors.HexColor("#B45309")
AMB_L= colors.HexColor("#FFFBEB")
TEA  = colors.HexColor("#0F766E")
TEA_L= colors.HexColor("#F0FDFA")
PNK  = colors.HexColor("#BE185D")
PNK_L= colors.HexColor("#FDF2F8")

doc = SimpleDocTemplate(OUTPUT, pagesize=A4,
    leftMargin=18*mm, rightMargin=18*mm,
    topMargin=22*mm, bottomMargin=22*mm,
    title="Appletree Interiors HR Activity Plan")

def S(n, **k): return ParagraphStyle(n, **k)

sTITLE = S("sTITLE", fontSize=23, leading=29, textColor=WH, alignment=TA_CENTER, fontName="Helvetica-Bold")
sSTIT  = S("sSTIT",  fontSize=11, leading=15, textColor=LG,  alignment=TA_CENTER, fontName="Helvetica")
sH1    = S("sH1",    fontSize=13, leading=17, textColor=WH,  fontName="Helvetica-Bold")
sH2    = S("sH2",    fontSize=11, leading=15, textColor=DG,  fontName="Helvetica-Bold", spaceBefore=8, spaceAfter=3)
sH3    = S("sH3",    fontSize=10, leading=14, textColor=MG,  fontName="Helvetica-Bold", spaceBefore=5, spaceAfter=2)
sBODY  = S("sBODY",  fontSize=9,  leading=14, textColor=DGR, fontName="Helvetica", spaceAfter=3, alignment=TA_JUSTIFY)
sBUL   = S("sBUL",   fontSize=9,  leading=13, textColor=DGR, fontName="Helvetica", leftIndent=10, spaceAfter=2)
sTH    = S("sTH",    fontSize=8.5,leading=12, textColor=WH,  fontName="Helvetica-Bold", alignment=TA_CENTER)
sTD    = S("sTD",    fontSize=8,  leading=12, textColor=DGR, fontName="Helvetica")
sTDc   = S("sTDc",  fontSize=8,  leading=12, textColor=DGR, fontName="Helvetica", alignment=TA_CENTER)
sNOTE  = S("sNOTE",  fontSize=8,  leading=12, textColor=MG,  fontName="Helvetica-Oblique")
sCARDH = S("sCARDH", fontSize=10, leading=14, textColor=WH,  fontName="Helvetica-Bold")
sQUOTE = S("sQUOTE", fontSize=10, leading=15, textColor=DG,  fontName="Helvetica-Oblique", alignment=TA_CENTER)
sMONTH = S("sMONTH", fontSize=11, leading=15, textColor=WH,  fontName="Helvetica-Bold", alignment=TA_CENTER)

story = []

def sp(h=6): story.append(Spacer(1, h))
def body(t): story.append(Paragraph(t, sBODY))
def bul(t):  story.append(Paragraph("&#8226;  " + t, sBUL))
def note(t): story.append(Paragraph("&#9888;  " + t, sNOTE)); sp(3)
def sub(t):  story.append(Paragraph(t, sH2))

def sec(title):
    tbl = Table([[Paragraph(title, sH1)]], colWidths=[PAGE_W-36*mm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,-1),DG),
        ("TOPPADDING",(0,0),(-1,-1),8), ("BOTTOMPADDING",(0,0),(-1,-1),8),
        ("LEFTPADDING",(0,0),(-1,-1),10),
    ]))
    story.append(KeepTogether([tbl, Spacer(1,5)]))

def gtable(headers, rows, cw=None):
    hrow = [Paragraph(h, sTH) for h in headers]
    data = [hrow]
    for row in rows:
        data.append([Paragraph(str(c), sTD) for c in row])
    if not cw:
        cw = [(PAGE_W-36*mm)/len(headers)]*len(headers)
    tbl = Table(data, colWidths=cw, repeatRows=1)
    tbl.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,0),DG),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),[WH,LGR]),
        ("GRID",(0,0),(-1,-1),0.4,MGR),
        ("TOPPADDING",(0,0),(-1,-1),5), ("BOTTOMPADDING",(0,0),(-1,-1),5),
        ("LEFTPADDING",(0,0),(-1,-1),5), ("VALIGN",(0,0),(-1,-1),"TOP"),
    ]))
    story.append(tbl)
    sp(6)

def activity_card(title, bg, border, details):
    header = Table([[Paragraph(title, sCARDH)]], colWidths=[PAGE_W-36*mm])
    header.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,-1),border),
        ("TOPPADDING",(0,0),(-1,-1),7), ("BOTTOMPADDING",(0,0),(-1,-1),7),
        ("LEFTPADDING",(0,0),(-1,-1),10),
    ]))
    sK = S("sK", fontSize=8.5, leading=12, textColor=border, fontName="Helvetica-Bold")
    sV = S("sV", fontSize=8.5, leading=13, textColor=DGR, fontName="Helvetica")
    rows = [[Paragraph(k, sK), Paragraph(v, sV)] for k, v in details]
    btbl = Table(rows, colWidths=[32*mm, PAGE_W-36*mm-32*mm])
    btbl.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,-1),bg),
        ("GRID",(0,0),(-1,-1),0.3,border),
        ("TOPPADDING",(0,0),(-1,-1),5), ("BOTTOMPADDING",(0,0),(-1,-1),5),
        ("LEFTPADDING",(0,0),(-1,-1),8), ("VALIGN",(0,0),(-1,-1),"TOP"),
    ]))
    story.append(KeepTogether([header, btbl, Spacer(1,6)]))

def month_block(month, color, activities):
    m_hdr = Table([[Paragraph(month, sMONTH)]], colWidths=[PAGE_W-36*mm])
    m_hdr.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,-1),color),
        ("TOPPADDING",(0,0),(-1,-1),7), ("BOTTOMPADDING",(0,0),(-1,-1),7),
    ]))
    data = [[Paragraph(h, sTH) for h in ["Week / Date","Activity","Responsible","Notes"]]]
    for wk, act, resp, nt in activities:
        data.append([Paragraph(wk,sTDc), Paragraph(act,sTD), Paragraph(resp,sTDc), Paragraph(nt,sTD)])
    tbl = Table(data, colWidths=[22*mm,78*mm,28*mm,42*mm], repeatRows=1)
    tbl.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,0),color),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),[WH,LGR]),
        ("GRID",(0,0),(-1,-1),0.4,MGR),
        ("TOPPADDING",(0,0),(-1,-1),5), ("BOTTOMPADDING",(0,0),(-1,-1),5),
        ("LEFTPADDING",(0,0),(-1,-1),5), ("VALIGN",(0,0),(-1,-1),"TOP"),
    ]))
    story.append(KeepTogether([m_hdr, tbl, Spacer(1,8)]))

# COVER
for txt, bg, pad in [
    ("APPLETREE INTERIORS", DG, (26,10)),
    ("HR ACTIVITY PLAN — DAILY WAGE STAFF", MG, (11,11)),
    ("Carpenters and Polish Labour  |  Age Group: 18-55 Years  |  Kerala Factory", AG, (8,8)),
]:
    t = Table([[Paragraph(txt, sTITLE if bg==DG else sSTIT)]], colWidths=[PAGE_W-36*mm])
    t.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),bg),
        ("TOPPADDING",(0,0),(-1,-1),pad[0]),("BOTTOMPADDING",(0,0),(-1,-1),pad[1])]))
    story.append(t); sp(2)

sp(10)
qt = Table([[Paragraph(
    '"Our workers are not just labour. They are the craftsmen behind every home we build. '
    'Take care of them and they will take care of our quality." — Appletree Interiors', sQUOTE)]], colWidths=[PAGE_W-36*mm])
qt.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),LG),("BOX",(0,0),(-1,-1),1,AG),
    ("TOPPADDING",(0,0),(-1,-1),12),("BOTTOMPADDING",(0,0),(-1,-1),12),
    ("LEFTPADDING",(0,0),(-1,-1),16),("RIGHTPADDING",(0,0),(-1,-1),16)]))
story.append(qt); sp(10)

body("This HR Activity Plan is designed for Appletree Interiors daily wage workforce — carpenters and polish labourers aged 18 to 55. It balances the needs of young workers (growth, energy, recognition) with those of senior workers (respect, stability, health), building a motivated, loyal, and united production team.")
sp(6)
sub("Understanding Our Workforce — Age Groups")
gtable(
    ["Age Group","Profile","What They Need","How We Engage"],
    [
        ["18-25 Years\n(Young Workers)",
         "New entrants, apprentices, first job, energetic, in learning phase",
         "Skill development, guidance, recognition of potential, sense of belonging",
         "Training, skill competitions, mentorship from seniors, sports activities"],
        ["26-38 Years\n(Core Workforce)",
         "Experienced, family responsibilities, financial pressures, career-conscious",
         "Financial stability, respect, growth opportunities, work-life awareness",
         "Welfare support, performance rewards, savings awareness, festival bonuses"],
        ["39-55 Years\n(Senior Workers)",
         "Highly skilled, long experience, physically demanding work takes toll on body",
         "Dignity, health support, recognition of experience, reduced physical strain",
         "Senior recognition, health camps, mentor role, task rotation support"],
    ],
    cw=[26*mm, 44*mm, 52*mm, 48*mm]
)
story.append(PageBreak())

# SECTION 1 — DAILY
sec("SECTION 1 — DAILY ENGAGEMENT ACTIVITIES")
sp(4)
body("These run every single working day and form the culture of the factory floor.")

activity_card("Morning Kickoff — 7:00 AM (5 Minutes)", LG, DG, [
    ("What", "Brief team huddle before work. Dept Head addresses all workers present."),
    ("Content", "Good morning greeting. One safety reminder. Today's production target announced. Any key updates."),
    ("Tone", "Energetic, positive, respectful. A team start — not a lecture."),
    ("Age Note", "Senior workers get a nod of acknowledgement. Young workers encouraged with the day's target."),
    ("Responsible", "Raees (MOD) / Shafeer (CWF)"),
])

activity_card("Afternoon Check-In — 1:00 PM Lunch Break", ORG_L, ORG, [
    ("What", "Dept Head informally checks in with workers during lunch."),
    ("Content", "How is the task going? Any material or tool issues? Anyone unwell? A genuine human touch."),
    ("Age Note", "Senior workers (39-55): check physical wellbeing. Young workers: ask if they need guidance."),
    ("Tone", "Casual and caring — not supervisory during break time."),
    ("Responsible", "Raees or Shafeer by rotation"),
])

activity_card("Evening Wind-Down — 6:45 PM (3 Minutes)", BLU_L, BLU, [
    ("What", "Quick close before tool return and sign-out."),
    ("Content", "Today's output acknowledged. Good work if targets met. Tomorrow's priority mentioned briefly."),
    ("Tone", "Appreciation-first. End the day on a positive note. Workers leave feeling respected."),
    ("Responsible", "Dept Head"),
])

activity_card("Birthday Recognition — On the Day", PNK_L, PNK, [
    ("What", "Every worker's birthday acknowledged on the actual day."),
    ("How", "Afsal maintains birthday calendar. On the day: team claps, Dept Head gives sweet packet or Rs.100 gift. Name announced at morning kickoff."),
    ("Cost", "Approx Rs.100-200 per birthday. Budgeted monthly."),
    ("Age Note", "All ages — everyone deserves to feel remembered. This small act builds deep loyalty."),
    ("Responsible", "Afsal tracks. Dept Head delivers on the day."),
])
story.append(PageBreak())

# SECTION 2 — WEEKLY
sec("SECTION 2 — WEEKLY ACTIVITIES")
sp(4)

activity_card("Safety Minute — Every Monday 7:05 AM", AMB_L, AMB, [
    ("What", "One safety topic shared with all workers at Monday morning kickoff. 2 minutes maximum."),
    ("Topics Rotate", "Machine safety. Hand tool safety. Polish fume safety. Fire safety. Correct lifting. Eye protection. Electrical safety. First aid basics."),
    ("Format", "Dept Head speaks and demonstrates. Ask: 'Who can tell me what to do if this happens?' Encourage answers."),
    ("Age Note", "Young workers (18-25) need habit-building — energetic demos work well. Senior workers: acknowledge their experience and invite them to share a tip."),
    ("Responsible", "Raees or Shafeer — rotate topics each Monday"),
])

activity_card("Worker of the Week — Every Saturday Evening", AMB_L, AMB, [
    ("What", "One worker from each department publicly recognised at wage payment time."),
    ("Criteria", "Best output, best quality, best attendance, or most helpful to team — Dept Head decides each week."),
    ("Recognition", "Name announced in front of all workers. Verbal praise. Rs.200 cash bonus added to wage slip."),
    ("Display", "Worker's name on Star of the Week board in factory for the following week."),
    ("Age Note", "Rotate across age groups over time — ensure young and senior workers both get recognised."),
    ("Responsible", "Raees or Shafeer nominates. Afsal records. Basith adds Rs.200 to wage slip."),
])

activity_card("Clean Workplace Friday — Every Friday 6:30 PM", TEA_L, TEA, [
    ("What", "15-minute collective factory clean every Friday evening before sign-out."),
    ("Tasks", "All workers clear sawdust, stack offcuts, wipe machines, organise tool area, mop polish bay."),
    ("Why", "Builds ownership of the workspace. Clean Monday start = positive mindset and safety."),
    ("Fun Element", "Fastest and most thorough section gets a treat — biscuits or chai. Dept Head judges."),
    ("Responsible", "Mohanan leads. All workers participate. Dept Head supervises."),
])
story.append(PageBreak())

# SECTION 3 — MONTHLY
sec("SECTION 3 — MONTHLY ACTIVITIES")
sp(4)

activity_card("Monthly Best Worker Award — Last Saturday of Every Month", PUR_L, PUR, [
    ("What", "Formal monthly recognition of top performer in each department."),
    ("Scoring", "Attendance 30% + Output Achievement 40% + QC2 Pass Rate 20% + Attitude 10% — scored by Dept Head."),
    ("Award", "Printed certificate with worker name and month. Rs.500 cash bonus. Photo displayed in factory for the month."),
    ("Announcement", "At Saturday wage payment in front of all workers."),
    ("Annual Link", "Workers who win 6 or more months are eligible for Annual Star Worker Award."),
    ("Age Note", "Consider Junior (18-35) and Senior (36-55) categories if team size allows — fair competition for both groups."),
    ("Responsible", "Dept Head scores. Afsal prepares certificate. Basith processes Rs.500 bonus."),
])

activity_card("Monthly Team Tea and Snack — First Monday of Every Month", ORG_L, ORG, [
    ("What", "Company buys breakfast or evening snack for the entire team on the first Monday of every month."),
    ("Format", "Chai and biscuits or samosa or banana — simple and inclusive. Shared together on factory floor."),
    ("Why", "Says: the company values you. Breaks the routine. Builds belonging and team spirit."),
    ("Cost", "Approx Rs.500-1,000 for full team depending on size."),
    ("Responsible", "Afsal arranges. Director approves monthly budget."),
])

activity_card("Skill Tip of the Month — Any Wednesday Lunch", BLU_L, BLU, [
    ("What", "One experienced worker shares a craft tip or technique with the team. 10 minutes during lunch."),
    ("Examples", "Perfect edge band finish. Correct sanding sequence for PU polish. How to cut laminates without chipping. Right clamp placement for glue-up."),
    ("Why", "Elevates senior workers as knowledge-givers. Young workers learn from real experience. Builds pride."),
    ("Age Note", "Senior workers (35-55) as presenters. Young workers as active listeners — encourage their questions."),
    ("Responsible", "Dept Head facilitates. Afsal notes tips in a factory Knowledge Book."),
])

activity_card("Health Awareness Mid-Month — Notice Board and Kickoff", LG, MG, [
    ("What", "A simple health awareness tip at morning kickoff and posted on factory notice board in Malayalam."),
    ("Topics Rotate", "Hydration on long shifts. Back and posture care for carpenters. Solvent protection for polishers. Eye care for machine operators. Nutrition on a budget. Mental health and importance of rest."),
    ("Age Note", "Extra care conversation for workers aged 39-55 — joint pain, fatigue, eye strain noted and flagged to Director for welfare support if serious."),
    ("Responsible", "Afsal prepares content. Dept Head delivers at morning kickoff."),
])
story.append(PageBreak())

# SECTION 4 — QUARTERLY
sec("SECTION 4 — QUARTERLY ACTIVITIES")
sp(4)

activity_card("Factory Sports and Games Day — Once Per Quarter", RED_L, RED, [
    ("What", "Half-day recreational activity for all factory workers. Games suited for all ages."),
    ("Games", "Cricket (tape ball). Tug of War. Carom tournament (great for senior workers). Arm wrestling. Fun relay race."),
    ("Teams", "Mixed: one senior (39+), two mid-career (26-38), one junior (18-25) per team. Builds cross-age bonding."),
    ("Prizes", "Winning team Rs.200 per person. Certificates for Best Sportsman and Best Team Spirit."),
    ("Timing", "Saturday afternoon after wage payment or Sunday with one day's wage paid."),
    ("Cost", "Approx Rs.3,000-5,000 per event including prizes and refreshments."),
    ("Responsible", "Afsal organises. Director approves date and budget. Dept Heads join as team members."),
])

activity_card("Quarterly Safety Training — 1 Hour Formal Session", AMB_L, AMB, [
    ("What", "Formal 1-hour safety training for all factory workers. One focused topic per quarter."),
    ("Q1", "Machine safety and PPE — correct use of guards, glasses, and ear protection"),
    ("Q2", "Fire safety and emergency evacuation drill — with actual fire extinguisher demonstration"),
    ("Q3", "Chemical and solvent safety — focused on polish department workers and fume exposure"),
    ("Q4", "First aid basics and accident reporting procedure — hands-on practice"),
    ("Age Note", "Young workers: build safety habits from the start. Senior workers: ergonomics, back care, long-term health of skilled physical work."),
    ("Responsible", "Afsal coordinates. Dept Heads attend and reinforce in following weeks."),
])

activity_card("Worker Welfare Open Forum — Once Per Quarter", TEA_L, TEA, [
    ("What", "Open session where workers raise concerns, suggestions, and feedback to Afsal and Director."),
    ("Format", "Informal — all workers seated. Afsal facilitates. Director attends minimum 2 of 4 quarterly meetings. Anonymous suggestion box also available."),
    ("Topics Welcomed", "Workplace comfort. Tool or equipment requests. Safety concerns. Rest area improvements. Any personal welfare need."),
    ("Response", "Every suggestion noted. Afsal responds to each point within 1 week — even if not possible, the reason is explained with respect."),
    ("Age Note", "Senior workers given the floor first — their experience commands respect. Young workers actively encouraged to speak."),
    ("Responsible", "Afsal facilitates. Director attends. Basith notes financial implications."),
])
story.append(PageBreak())

# SECTION 5 — FESTIVALS
sec("SECTION 5 — FESTIVAL AND CULTURAL CELEBRATIONS")
sp(4)
body("Kerala is a multi-religious, multi-cultural state. Celebrating all festivals together builds unity and shows every worker that Appletree Interiors respects their identity and community.")
sp(4)

gtable(
    ["Festival","Approx Month","Activity","Budget Per Worker"],
    [
        ["Vishu / Kerala New Year",  "April",        "Special breakfast or lunch for all. Small cash gift or gift bag.",           "Rs.200"],
        ["Eid ul-Fitr",              "April",         "Half day off or early close. Sweets distributed. Warm wishes.",             "Rs.150"],
        ["Eid ul-Adha",              "June",          "Same as Eid ul-Fitr. Half day off and sweets for all.",                     "Rs.150"],
        ["ONAM",                     "Aug-Sept",      "Full Onam Sadya. Pookalam. Games. Onam gift bag for every worker.",         "Rs.500-800"],
        ["Christmas",                "December",      "Cake cutting, decorations, and sweets for all workers.",                    "Rs.200"],
        ["Milad / Prophet's Day",    "As per cal",    "Respectful acknowledgement. Sweets distributed to all.",                   "Rs.100"],
        ["Diwali",                   "Oct-Nov",       "Sweet distribution and small celebration.",                                 "Rs.150"],
        ["New Year January 1",       "January",       "Good wishes and small token gift for each worker.",                         "Rs.150"],
    ],
    cw=[36*mm, 22*mm, 84*mm, 28*mm]
)
sp(4)
note("Onam is the most important event. A full sit-down Sadya with the Director present builds more loyalty than any other activity in the entire year.")

activity_card("ONAM DAY — Appletree's Biggest Annual Worker Event", LG, DG, [
    ("What", "Full-day Onam celebration — the most important company event of the year for factory workers."),
    ("Morning", "Factory decorated with flowers. Pookalam made together by all workers as a team activity."),
    ("Lunch", "Full traditional Onam Sadya for all workers and staff. Everyone eats together — no hierarchy at the table."),
    ("Afternoon", "Fun games: tug of war, carom, cricket, musical chairs. Laughter and bonding."),
    ("Evening Gift", "Onam kit for every worker: rice, coconut oil, dry fruits, and fabric. Approx Rs.500-800 per person."),
    ("Director Role", "Yaseen joins for the Sadya and eats with the workers. This single act means more than any bonus to a daily wage worker."),
    ("Age Note", "Senior workers lead the pookalam — their traditional knowledge respected. Young workers organise games. All contribute."),
    ("Total Budget", "Approx Rs.15,000-25,000 depending on team size. The single best investment in worker loyalty for the year."),
    ("Responsible", "Afsal organises everything. Director attends and leads."),
])
story.append(PageBreak())

# SECTION 6 — ANNUAL
sec("SECTION 6 — ANNUAL RECOGNITION AND EVENTS")
sp(4)

activity_card("Annual Star Worker Award", AMB_L, AMB, [
    ("What", "The highest worker recognition at Appletree Interiors — one carpenter and one polisher per year."),
    ("Eligibility", "Minimum 90% attendance + 85% average output + Zero QC failures + No disciplinary incidents."),
    ("Award", "Trophy or plaque with name and year engraved. Rs.3,000-5,000 cash award. Certificate signed by Director. Photo permanently in factory."),
    ("Announcement", "At Onam Day or December year-end — Director presents personally in front of all workers."),
    ("Age Note", "No age restriction. A 52-year-old master carpenter is as eligible as a 24-year-old rising star."),
    ("Responsible", "Director selects based on Afsal's year-long performance records."),
])

activity_card("Annual Factory Outing and Picnic", BLU_L, BLU, [
    ("What", "One full-day outing for all factory staff — a trip together as a team outside the factory."),
    ("Destination", "Beach (Kappad, Beypore), hill station (Wayanad), or popular local destination — decided by majority worker vote."),
    ("Activities", "Lunch together at destination. Group games and photography. Relaxed free time."),
    ("Inclusivity", "Destination chosen so all age groups, physical abilities, and communities feel comfortable. No alcohol."),
    ("Timing", "January or February — good weather, after festival season."),
    ("Family Option", "Once every 2 years invite spouses and children for a Family Day — builds the deepest loyalty of all."),
    ("Cost", "Approx Rs.500-1,000 per person. Rs.10,000-20,000 total."),
    ("Responsible", "Afsal organises. Director joins for lunch at minimum."),
])

activity_card("Annual Craftsman Cup — Appletree Skill Competition", PUR_L, PUR, [
    ("What", "In-house skill competition celebrating the best craftsmen in the factory. Takes half a day."),
    ("Categories", "Best Carpentry Joint. Fastest Accurate Panel Cut. Best Polish Finish on sample board. Best Cabinet Assembly Speed and Quality."),
    ("Format", "Workers compete within category. Judges: Shafeer, Raees, and Director."),
    ("Prizes", "1st: Rs.2,000 plus Trophy. 2nd: Rs.1,000. 3rd: Rs.500. All participants receive a certificate."),
    ("Age Groups", "Junior (18-30) and Senior (31-55) compete separately — fair for both age groups."),
    ("Why", "Identifies talent for promotion or wage revision. Motivates craft improvement. Creates pride in skill and tradition."),
    ("Responsible", "Afsal organises. Dept Heads judge. Director presents prizes personally."),
])

activity_card("Long Service Recognition — Annual", TEA_L, TEA, [
    ("What", "Formal recognition of workers who completed significant service milestones with Appletree Interiors."),
    ("1 Year", "Certificate of Service signed by Director."),
    ("3 Years", "Certificate plus Rs.1,000 cash gift."),
    ("5 Years", "Certificate plus Rs.3,000 plus engraved plaque with name and year."),
    ("10 Years", "Special recognition — significant award at Director's discretion. Permanent display in factory."),
    ("Announcement", "At Onam Day or December year-end ceremony — public acknowledgement."),
    ("Age Note", "Primarily benefits workers aged 30-55. Makes long-tenured workers feel truly valued. Dramatically reduces attrition."),
    ("Responsible", "Afsal tracks joining dates. Basith processes gift amounts. Director presents personally."),
])
story.append(PageBreak())

# SECTION 7 — WELFARE
sec("SECTION 7 — WORKER WELFARE INITIATIVES")
sp(4)
body("Welfare is what separates a good employer from a great one. These initiatives cost relatively little but create deep loyalty — especially among workers aged 35-55 who have families and long-term concerns about health and financial security.")
sp(4)

activity_card("Annual Health Camp — Once Per Year", RED_L, RED, [
    ("What", "Free basic health check for all factory workers. Conducted at or near the factory."),
    ("Tests", "Blood pressure. Random blood sugar. BMI and weight. Basic eye check. Dental if available."),
    ("Partner", "Tie up with local clinic, government health initiative, or medical college camp for low or zero cost."),
    ("Age Focus", "18-25: General health and eye care. 26-38: Blood sugar and BP. 39-55: Joint health, BP, blood sugar, eye strain — critical for 12-hour physically demanding shifts."),
    ("Follow-Up", "Afsal reviews serious findings privately. Director sponsors treatment support for genuine cases through Emergency Welfare Fund."),
    ("Cost", "Free via government program or Rs.200-400 per worker with a private clinic."),
    ("Responsible", "Afsal coordinates. Director approves budget."),
])

activity_card("Emergency Welfare Fund", LG, MG, [
    ("What", "A company-funded emergency support for workers facing genuine personal crisis."),
    ("Triggers", "Worker hospitalised unexpectedly. Death of immediate family member. Natural disaster affecting worker home. Serious medical expense."),
    ("Support", "Rs.2,000-5,000 as a welfare gift — not a loan. Based on situation assessed by Afsal."),
    ("Process", "Worker informs Dept Head. Afsal verifies. Director approves. Basith disburses within 24 hours."),
    ("Fund Size", "Director sets aside Rs.20,000-30,000 annually. Unspent amount carries forward."),
    ("Responsible", "Afsal maintains fund register. Director is the sole approver of every disbursement."),
])

activity_card("Rest and Comfort Area", ORG_L, ORG, [
    ("Minimum Required", "Proper seating for lunch break. Cool drinking water all day. Clean toilet facility. Hand wash station near polish area."),
    ("Good Additions", "Fan and ventilation in rest area. Malayalam newspaper or magazine. Phone charging point. Radio for light music at lunch."),
    ("Why", "Workers doing 12-hour physically demanding shifts deserve a dignified rest space. Senior workers especially need proper seated rest between tasks."),
    ("Maintenance", "Mohanan responsible for daily cleanliness. Afsal checks standards monthly."),
    ("Responsible", "Mohanan maintains daily. Afsal oversees."),
])

activity_card("Financial Literacy Session — Once Per Year", BLU_L, BLU, [
    ("What", "Simple practical 30-minute session on money management for daily wage workers. Fully in Malayalam."),
    ("Topics", "How to save even on daily wages. Benefits of bank account and UPI over cash. PF and ESI awareness. Simple family budgeting. Avoiding money lenders."),
    ("Age Note", "Especially valuable for young workers (18-25) who are just starting to earn. Senior workers may want savings and retirement perspective."),
    ("Responsible", "Basith leads. Afsal organises. Invite bank representative if possible."),
])
story.append(PageBreak())

# SECTION 8 — CALENDAR
sec("SECTION 8 — ANNUAL HR ACTIVITY CALENDAR")
sp(4)
body("Month-by-month plan. Daily and weekly activities run throughout the year and are not repeated below.")
sp(6)

month_block("JANUARY", colors.HexColor("#1D4ED8"), [
    ("Week 1", "New Year celebration — sweets and good wishes for all workers at morning kickoff", "Afsal", "Warm and simple"),
    ("Week 2", "Q1 Safety Training — Machine Safety and PPE", "Afsal + Dept Heads", "1 hour formal"),
    ("Week 2", "Monthly Team Tea — First Monday", "Afsal", "Rs.500-1,000"),
    ("Week 3", "Annual Factory Outing and Picnic", "Afsal + Director", "Full day all workers"),
    ("Week 4", "Check Long Service milestones due this quarter", "Afsal", "Admin check"),
])

month_block("FEBRUARY", colors.HexColor("#7C3AED"), [
    ("Week 1", "Monthly Team Tea — First Monday", "Afsal", "First Monday"),
    ("Week 2", "Skill Tip of Month — senior worker presents craft technique", "Dept Head", "Lunch break 10 mins"),
    ("Week 3", "Worker Welfare Open Forum — Q1", "Afsal + Director", "Informal open session"),
    ("Week 4", "Sports and Games Day — Q1", "Afsal", "Mixed age teams Saturday"),
])

month_block("MARCH", colors.HexColor("#0F766E"), [
    ("Week 1", "Monthly Team Tea — First Monday", "Afsal", "First Monday"),
    ("Week 2", "Health Awareness — Hydration and heat as summer approaches", "Afsal", "Notice board and kickoff"),
    ("Week 3", "Monthly Best Worker Award", "Dept Heads", "Saturday wage time"),
    ("Week 4", "Prepare Long Service recognition for Q1 milestones", "Afsal", "Admin task"),
])

month_block("APRIL — VISHU AND EID", colors.HexColor("#B45309"), [
    ("Festival", "Vishu — Breakfast or lunch plus Rs.200 gift for all workers", "Afsal", "Date per calendar"),
    ("Festival", "Eid ul-Fitr — Half day off plus sweets for all workers", "Afsal", "Date per calendar"),
    ("Week 1", "Monthly Team Tea — First Monday", "Afsal", "First Monday"),
    ("Week 3", "Q2 Safety Training — Fire Safety and Evacuation Drill", "Afsal + Dept Heads", "With fire ext. demo"),
])

month_block("MAY", colors.HexColor("#166534"), [
    ("Week 1", "Monthly Team Tea — First Monday", "Afsal", "First Monday"),
    ("Week 2", "Health Awareness — Back and posture care for carpenters", "Afsal", "Poster and kickoff tip"),
    ("Week 4", "Sports and Games Day — Q2", "Afsal", "Mixed age teams"),
])

month_block("JUNE — EID UL-ADHA", colors.HexColor("#1D4ED8"), [
    ("Festival", "Eid ul-Adha — Half day off plus sweets distributed to all", "Afsal", "Date per calendar"),
    ("Week 1", "Monthly Team Tea — First Monday", "Afsal", "First Monday"),
    ("Week 2", "Skill Tip of Month — senior worker presents", "Dept Head", "Lunch break"),
    ("Week 3", "Worker Welfare Open Forum — Q2", "Afsal + Director", "Open session"),
])

month_block("JULY", colors.HexColor("#7C3AED"), [
    ("Week 1", "Monthly Team Tea — First Monday", "Afsal", "First Monday"),
    ("Week 2", "Annual Health Camp — basic check for all workers", "Afsal", "Clinic partnership"),
    ("Week 3", "Monthly Best Worker Award — mid-year highlight", "Dept Heads", "Saturday wage time"),
    ("Week 4", "Q3 Safety Training — Chemical and Solvent Safety (polish dept focus)", "Afsal + Raees", "1 hour"),
])

month_block("AUGUST AND SEPTEMBER — ONAM", colors.HexColor("#0F766E"), [
    ("Pre-Onam", "Pookalam and decoration prep — all workers involved as a team activity", "All Workers", "2-3 days before"),
    ("ONAM DAY", "Full Onam Sadya + Pookalam + Games + Onam Gift for every worker", "Afsal + Director", "BIGGEST EVENT OF YEAR"),
    ("Week 1", "Monthly Team Tea — First Monday", "Afsal", "First Monday"),
    ("Post-Onam", "Sports and Games Day — Q3 with post-Onam team energy", "Afsal", "Mixed age teams"),
])

month_block("OCTOBER — DIWALI", colors.HexColor("#DC2626"), [
    ("Festival", "Diwali — Sweets distributed to all workers", "Afsal", "Date per calendar"),
    ("Week 1", "Monthly Team Tea — First Monday", "Afsal", "First Monday"),
    ("Week 2", "Annual Craftsman Cup — Appletree Skill Competition", "Afsal + Dept Heads", "Half day event"),
    ("Week 4", "Q4 Safety Training — First Aid Basics and Accident Reporting", "Afsal", "Hands-on session"),
])

month_block("NOVEMBER", colors.HexColor("#7C3AED"), [
    ("Week 1", "Monthly Team Tea — First Monday", "Afsal", "First Monday"),
    ("Week 2", "Financial Literacy Session — Savings and money management in Malayalam", "Basith + Afsal", "30 minutes"),
    ("Week 3", "Sports and Games Day — Q4 year-end energy", "Afsal", "Mixed age teams"),
    ("Week 4", "Prepare Annual Star Worker and Long Service nominations for December", "Afsal", "Admin preparation"),
])

month_block("DECEMBER — CHRISTMAS AND YEAR END", colors.HexColor("#166534"), [
    ("Festival", "Christmas — Cake cutting, decorations and sweets for all workers", "Afsal", "24th or 25th Dec"),
    ("Week 1", "Monthly Team Tea — First Monday", "Afsal", "First Monday"),
    ("Week 2", "Annual Star Worker Award plus Long Service Recognition ceremony", "Director", "Director presents personally"),
    ("Week 3", "Year-End Welfare Forum — Q4 annual feedback session", "Afsal + Director", "Year-end open forum"),
    ("Week 4", "Director personally thanks each worker — individual or group", "Director", "Final working day of year"),
])
story.append(PageBreak())

# SECTION 9 — BUDGET
sec("SECTION 9 — ANNUAL HR ACTIVITY BUDGET ESTIMATE")
sp(4)
body("Approximate annual budget for a team of 15-20 daily wage workers. Adjust based on actual team size.")
sp(4)

gtable(
    ["Activity","Frequency","Cost Per Event","Annual Total"],
    [
        ["Birthday Recognition",            "Per birthday (15-20 workers)",    "Rs.150",       "Rs.2,500-3,000"],
        ["Worker of the Week Bonus",        "52 weeks x 2 depts x Rs.200",    "Rs.400/week",  "Rs.20,800"],
        ["Monthly Team Tea and Snack",      "12 per year",                     "Rs.750",       "Rs.9,000"],
        ["Monthly Best Worker Bonus",       "12 months x 2 depts x Rs.500",   "Rs.1,000/mo",  "Rs.12,000"],
        ["Quarterly Sports Day",            "4 per year",                      "Rs.4,000",     "Rs.16,000"],
        ["Quarterly Safety Training",       "4 per year",                      "Rs.1,000",     "Rs.4,000"],
        ["Quarterly Welfare Forum",         "4 per year",                      "Rs.500",       "Rs.2,000"],
        ["Festival Celebrations (7-8)",     "7-8 per year",                    "Rs.2,500 avg", "Rs.17,500-20,000"],
        ["Onam Grand Event",                "Once per year",                   "Rs.20,000",    "Rs.20,000"],
        ["Annual Outing and Picnic",        "Once per year",                   "Rs.15,000",    "Rs.15,000"],
        ["Annual Health Camp",              "Once per year",                   "Rs.5,000",     "Rs.5,000"],
        ["Annual Craftsman Cup",            "Once per year",                   "Rs.10,000",    "Rs.10,000"],
        ["Annual Awards (Star and Long Svc)","Once per year",                  "Rs.15,000",    "Rs.15,000"],
        ["Emergency Welfare Fund",          "As needed",                       "Set aside",    "Rs.25,000"],
        ["Friday Treats and Miscellaneous", "Weekly",                          "Rs.200/week",  "Rs.10,400"],
    ],
    cw=[60*mm, 36*mm, 32*mm, 42*mm]
)
sp(4)

total_row = Table([[
    Paragraph("ESTIMATED TOTAL ANNUAL HR ACTIVITY BUDGET", S("tb", fontSize=10, leading=14, textColor=WH, fontName="Helvetica-Bold")),
    Paragraph("Rs.1,87,000 - Rs.2,00,000 per year", S("tv", fontSize=11, leading=15, textColor=WH, fontName="Helvetica-Bold", alignment=TA_CENTER)),
]], colWidths=[115*mm, 55*mm])
total_row.setStyle(TableStyle([
    ("BACKGROUND",(0,0),(-1,-1),DG),
    ("TOPPADDING",(0,0),(-1,-1),12), ("BOTTOMPADDING",(0,0),(-1,-1),12),
    ("LEFTPADDING",(0,0),(-1,-1),10), ("VALIGN",(0,0),(-1,-1),"MIDDLE"),
]))
story.append(total_row); sp(6)

note("Rs.2 lakhs per year across 20 workers = Rs.835 per worker per month. A small investment for enormous gains in loyalty, retention, quality, and productivity.")
sp(8)

qt2 = Table([[Paragraph(
    '"Happy workers build beautiful homes. Invest in your people and they will invest in your quality."',
    sQUOTE)]], colWidths=[PAGE_W-36*mm])
qt2.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),LG),("BOX",(0,0),(-1,-1),1,AG),
    ("TOPPADDING",(0,0),(-1,-1),12),("BOTTOMPADDING",(0,0),(-1,-1),12),
    ("LEFTPADDING",(0,0),(-1,-1),16),("RIGHTPADDING",(0,0),(-1,-1),16)]))
story.append(qt2); sp(10)

sign_data = [[Paragraph(h, sTH) for h in ["Role","Name","Signature","Date"]]]
for r, n in [("Dept Head Modular","Raees"),("Dept Head Wood Working","Shafeer"),
              ("Admin and Project Coord.","Afsal"),("Director","Yaseen")]:
    sign_data.append([Paragraph(r,sTD),Paragraph(n,sTD),Paragraph("",sTD),Paragraph("",sTD)])
sb = Table(sign_data, colWidths=[55*mm,40*mm,45*mm,30*mm])
sb.setStyle(TableStyle([
    ("BACKGROUND",(0,0),(-1,0),AG),
    ("ROWBACKGROUNDS",(0,1),(-1,-1),[WH,LGR]),
    ("GRID",(0,0),(-1,-1),0.4,MGR),
    ("TOPPADDING",(0,0),(-1,-1),10),("BOTTOMPADDING",(0,0),(-1,-1),10),
    ("LEFTPADDING",(0,0),(-1,-1),6),
]))
story.append(sb)

def deco(c, d):
    c.saveState()
    c.setFont("Helvetica", 7)
    c.setFillColor(MG)
    c.drawString(18*mm, PAGE_H-12*mm,
        "APPLETREE INTERIORS — HR ACTIVITY PLAN  |  DAILY WAGE STAFF  |  CONFIDENTIAL")
    c.drawRightString(PAGE_W-18*mm, PAGE_H-12*mm,
        datetime.date.today().strftime("%d %B %Y"))
    c.setStrokeColor(AG); c.setLineWidth(0.5)
    c.line(18*mm, PAGE_H-14*mm, PAGE_W-18*mm, PAGE_H-14*mm)
    c.line(18*mm, 16*mm, PAGE_W-18*mm, 16*mm)
    c.drawString(18*mm, 10*mm,
        "Appletree Interiors, Calicut (Kozhikode), Kerala  |  sales.appletreeinteriors@gmail.com")
    c.drawRightString(PAGE_W-18*mm, 10*mm, f"Page {d.page}")
    c.restoreState()

doc.build(story, onFirstPage=deco, onLaterPages=deco)
print("HR Activity Plan PDF generated successfully.")
