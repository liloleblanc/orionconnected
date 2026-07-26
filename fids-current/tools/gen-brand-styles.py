#!/usr/bin/env python3
"""
Generate the PER-BRAND IDENTITY CSS section of css/accor-slide.css.

Same slide structure for every hotel; this swaps palette + type per brand,
keyed off the article's data-brand-code. Two treatments:
  elegant — luxury/boutique: serif, brand lockup dominant, italic amenities
            with accent dots, slim endorsement, cream/accent QR card.
  modern  — premium/midscale/economy: clean sans, accent stars + dot amenities,
            brand-tinted ALL endorsement band.

Edit the TABLE below to tune any brand, then re-run:  python3 tools/gen-brand-styles.py --write
Palettes are grounded in each brand's established identity + the project's
existing ACCOR_BRAND_COLORS; refine against a brand's guideline as needed.
"""
import sys

SERIF = "'Didot','Bodoni 72',Georgia,'Times New Roman',serif"

# code: (name, treatment, bg, accent, ink)
TABLE = [
 ("FAI","Fairmont","elegant","#14161C","#B88D5B","#EFE6D6"),
 ("SOF","Sofitel","elegant","#0B0B0D","#B6912E","#ECE6DA"),
 ("SLE","Sofitel Legend","elegant","#0B0B0D","#B6912E","#ECE6DA"),
 ("RAF","Raffles","elegant","#15241F","#C2A35C","#EFE9DD"),
 ("RAH","Raffles","elegant","#15241F","#C2A35C","#EFE9DD"),
 ("EMB","Emblems","elegant","#1A1A1A","#B89B6E","#ECE6DA"),
 ("BAN","Banyan Tree","elegant","#163A33","#C2A35C","#EDE7D7"),
 ("ORI","Orient Express","elegant","#0E1B2A","#B99653","#EDE6D6"),
 ("OE","Orient Express","elegant","#0E1B2A","#B99653","#EDE6D6"),
 ("FAE","Faena","elegant","#5E1417","#C8A24A","#F2E7D6"),
 ("RIX","Rixos","elegant","#1A1712","#C2A35C","#EFE7D6"),
 ("MAN","Mantis","elegant","#1C2A1E","#B89B6E","#EDE7D7"),
 ("MGH","MGallery","elegant","#12120D","#C2A35C","#F0E7DB"),
 ("MGA","MGallery","elegant","#12120D","#C2A35C","#F0E7DB"),
 ("MOV","Movenpick","elegant","#2A1418","#C8A24A","#F1E8DC"),
 ("DEL","Delano","elegant","#111214","#C9A227","#F0ECE3"),
 # premium / midscale / lifestyle — modern
 ("PUL","Pullman","modern","#0C0C0E","#D2A24B","#F0EFEC"),
 ("SWI","Swissotel","modern","#16181C","#E2001A","#F2F2F2"),
 ("NOV","Novotel","modern","#14163C","#3D63FF","#FFFFFF"),
 ("MER","Mercure","modern","#14233F","#B59A5E","#F0ECDF"),
 ("GRA","Grand Mercure","modern","#16233C","#C2A35C","#F0ECDF"),
 ("HOF","Handwritten","modern","#1C1C22","#D8A24B","#F0ECE3"),
 ("SOU","Handwritten","modern","#1C1C22","#D8A24B","#F0ECE3"),  # live catalog code
 ("TRB","Tribe","modern","#111114","#C8A24A","#F0EFEC"),
 ("TRI","Tribe","modern","#111114","#C8A24A","#F0EFEC"),
 ("HB","The Hoxton","modern","#1E1A16","#D98E4B","#F0E7DB"),
 ("MAS","Mama Shelter","modern","#141414","#F4C20D","#FFFFFF"),
 ("MSH","Mama Shelter","modern","#141414","#F4C20D","#FFFFFF"),
 ("N25","25hours","modern","#121212","#F25C05","#FFFFFF"),
 ("25H","25hours","modern","#121212","#F25C05","#FFFFFF"),
 ("MON","Mondrian","modern","#101018","#C77DFF","#F0EFF5"),
 ("HYD","Hyde","modern","#14141A","#C9A227","#F0ECE3"),
 ("SLS","SLS","modern","#0E0E12","#C9A227","#F0ECE3"),
 ("SO","SO/","modern","#121016","#E6007E","#FFFFFF"),
 ("SEQ","SO/","modern","#121016","#E6007E","#FFFFFF"),
 ("ART","Art Series","modern","#1A1A1A","#C9A227","#F0ECE3"),
 ("SEB","The Sebel","elegant","#1A2230","#B59A5E","#F0ECDF"),
 ("TSB","The Sebel","elegant","#1A2230","#B59A5E","#F0ECDF"),
 ("ADA","Adagio","modern","#14233F","#E08A2E","#F0ECDF"),
 ("ADG","Adagio","modern","#14233F","#E08A2E","#F0ECDF"),
 # economy — modern, bright accents
 ("IBS","ibis","modern","#0E0A0F","#E2231A","#FFFFFF"),
 ("IBH","ibis","modern","#0E0A0F","#E2231A","#FFFFFF"),
 ("IBI","ibis Styles","modern","#0E0A0F","#E40046","#FFFFFF"),
 ("IBB","ibis budget","modern","#0A1A3A","#F39200","#FFFFFF"),
 ("JO","JO&JOE","modern","#1A1A1A","#FFD400","#FFFFFF"),
 ("JOJ","JO&JOE","modern","#1A1A1A","#FFD400","#FFFFFF"),
 ("GRT","greet","modern","#12241A","#7AB648","#FFFFFF"),
 ("BRK","BreakFree","modern","#102A3A","#27AAE1","#FFFFFF"),
 ("BKF","BreakFree","modern","#102A3A","#27AAE1","#FFFFFF"),
]

def rgba(hex6, a):
    h=hex6.lstrip('#'); r,g,b=int(h[0:2],16),int(h[2:4],16),int(h[4:6],16)
    return f"rgba({r},{g},{b},{a})"

def elegant(code,bg,accent,ink):
    s=f'.axr[data-brand-code="{code}"]'
    return f"""{s}{{ --all-blue:{bg}; --axr-tint:{bg}; --all-gold:{accent}; --all-light:#EFE9DE; }}
{s} .axr-logo{{ height:clamp(124px,23vh,224px); }}
{s} .axr-logo img{{ max-width:min(94%,600px); max-height:100%; }}
{s} .axr-name{{ font-family:{SERIF}; font-weight:400; letter-spacing:.01em; font-size:calc(var(--axr-logo)*0.52); }}
{s} .axr-sub{{ font-size:calc(var(--axr-info)*0.80); margin-top:calc(var(--axr-info)*0.2); }}
{s} .axr-addr{{ font-family:{SERIF}; font-weight:400; letter-spacing:.12em; text-transform:uppercase; font-size:.8em; color:{ink}; }}
{s} .axr-stars{{ color:{accent}; letter-spacing:.12em; }}
{s} .axr-score{{ font-family:{SERIF}; color:#fff; }}
{s} .axr-score small{{ color:{accent}; }}
{s} .axr-amen{{ gap:0; }}
{s} .axr-amen span{{ background:none; border:none; padding:0; font-family:{SERIF}; font-style:italic; color:{ink}; font-size:calc(var(--axr-info)*0.82); }}
{s} .axr-amen span:not(:last-child)::after{{ content:"·"; margin:0 .55em; color:{accent}; font-style:normal; }}
{s} .axr-bubble{{ background:#EFE9DE; color:{bg}; border:1px solid {accent}; border-radius:2px 2px 2px 0; }}
{s} .axr-bubble::after{{ border-top-color:#EFE9DE; }}
{s} .axr-bubble-copy{{ font-family:{SERIF}; letter-spacing:.02em; }}
{s} .axr-all{{ background:transparent; border-top:1px solid {rgba(accent,.6)}; padding:14px 0 8px; }}
{s} .axr-all img{{ filter:none; opacity:.92; max-height:30px; }}"""

def modern(code,bg,accent,ink):
    s=f'.axr[data-brand-code="{code}"]'
    return f"""{s}{{ --all-blue:{bg}; --axr-tint:{bg}; --all-gold:{accent}; }}
{s} .axr-logo{{ height:clamp(120px,22vh,216px); }}
{s} .axr-logo img{{ max-width:min(92%,580px); max-height:100%; }}
{s} .axr-name{{ color:{ink}; font-size:calc(var(--axr-logo)*0.55); font-weight:600; letter-spacing:0; }}
{s} .axr-sub{{ font-size:calc(var(--axr-info)*0.86); }}
{s} .axr-addr{{ color:{ink}; font-weight:500; letter-spacing:.02em; }}
{s} .axr-stars{{ color:{accent}; }}
{s} .axr-amen{{ gap:0; }}
{s} .axr-amen span{{ background:none; border:none; padding:0; color:{ink}; font-weight:500; font-size:calc(var(--axr-info)*0.80); }}
{s} .axr-amen span:not(:last-child)::after{{ content:"•"; margin:0 .5em; color:{accent}; }}
{s} .axr-all{{ background:color-mix(in srgb, {bg} 86%, #000); }}"""

blocks=[]
for code,name,treat,bg,accent,ink in TABLE:
    fn = elegant if treat=="elegant" else modern
    blocks.append(f"/* {code} — {name} ({treat}) */\n"+fn(code,bg,accent,ink))

header="""/* ════════════════════════════════════════════════════════════════════════
   PER-BRAND IDENTITY — AUTO-GENERATED by tools/gen-brand-styles.py
   Same slide structure for every hotel; this swaps palette + type per brand,
   keyed off the article's data-brand-code. Branding is by brand, not the
   Accor/ALL umbrella. Edit the TABLE in the generator + re-run to tune.
   ════════════════════════════════════════════════════════════════════════ */"""
out=header+"\n\n"+"\n\n".join(blocks)+"\n"

with open("tools/brand-styles.generated.css","w") as f:
    f.write(out)
print("brands:",len(TABLE),"| wrote tools/brand-styles.generated.css", len(out),"bytes")
