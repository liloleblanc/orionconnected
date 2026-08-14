# -*- coding: utf-8 -*-
import xml.etree.ElementTree as ET, re, os, copy, base64
from PIL import ImageFont
SVG='http://www.w3.org/2000/svg'; NS='{%s}'%SVG
ET.register_namespace('', SVG)

FDIR='/tmp/wx2/fonts/'
_FW={900:'Inter-Black.ttf',700:'Inter-Bold.ttf',600:'Inter-SemiBold.ttf',400:'Inter-Regular.ttf'}
_fc={}
def font(size,w):
    k=(round(size,1),w)
    if k not in _fc: _fc[k]=ImageFont.truetype(FDIR+_FW[w],int(round(size)))
    return _fc[k]
def measure(s,size,w,track=0.0):
    return font(size,w).getlength(s)+track*max(len(s)-1,0)
def dbearing(s,size,w=700):
    return font(size,w).getbbox(s)[0]
def lum(h):
    r,g,b=[int(h[i:i+2],16)/255.0 for i in (1,3,5)]
    f=lambda c: c/12.92 if c<=0.03928 else ((c+0.055)/1.055)**2.4
    return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)

# ── grid: 1920 = the shipping board width ────────────────────────────────
MARGIN=64; CARD_W=272; GUTTER=32; PAD=20; BAR=8
CARD_H=688; TILE_H=152; HEADER=120
SHEET_W=MARGIN*2+CARD_W*6+GUTTER*5          # == 1920
SHEET_H=MARGIN+HEADER+CARD_H+40+TILE_H+MARGIN
RAD=16
CAP=0.727

DAYS=['THU','FRI','SAT','SUN','MON','TUE','WED']

CARDS=[
 dict(icon='partly-cloudy',city='MONCTON',iata='YQM',when='Thu 14:35',t=15,feels=13,wind=12,hum=68,
      cond='Partly cloudy',c0='#5ED0FA',c1='#2BA8EE',unit='C',
      car='AC',carname='AIR CANADA',flt='AC 8912',acc='#D82F2E',
      week=[('partly-cloudy',16,9),('sunny',19,11),('sunny',21,12),('rain',14,10),
            ('rain',12,8),('partly-cloudy',15,9),('cloudy-night',13,7)]),
 dict(icon='sunny',city='ORLANDO',iata='MCO',when='Thu 14:35',t=30,feels=34,wind=8,hum=54,
      cond='Sunny',c0='#FFD24A',c1='#EC8A12',unit='F',
      car='WS',carname='WESTJET',flt='WS 1602',acc='#00B2A9',
      week=[('sunny',31,22),('sunny',32,23),('storm',29,23),('storm',28,22),
            ('partly-cloudy',30,22),('sunny',31,23),('sunny',32,23)]),
 dict(icon='rain',city='TORONTO',iata='YYZ',when='Thu 14:35',t=8,feels=5,wind=24,hum=91,
      cond='Rain',c0='#45AEF4',c1='#0B7FE0',unit='C',
      car='PD',carname='PORTER',flt='PD 2244',acc='#254D87',
      week=[('rain',9,4),('rain',8,3),('partly-cloudy',11,4),('partly-cloudy',13,6),
            ('sunny',15,7),('rain',12,6),('rain',10,5)]),
 dict(icon='cloudy-night',city='MONTRÉAL',iata='YUL',when='Thu 23:10',t=12,feels=10,wind=9,hum=77,
      cond='Cloudy',c0='#6B63F0',c1='#3F2FCE',unit='C',
      car='TS',carname='AIR TRANSAT',flt='TS 302',acc='#002868',
      week=[('cloudy-night',13,6),('partly-cloudy',15,7),('sunny',18,9),('sunny',19,10),
            ('rain',14,8),('rain',11,6),('partly-cloudy',12,5)]),
 dict(icon='snow',city='HALIFAX',iata='YHZ',when='Thu 14:35',t=-2,feels=-7,wind=31,hum=84,
      cond='Snow',c0='#A9E9F7',c1='#46CDEF',unit='C',
      car='F8',carname='FLAIR',flt='F8 511',acc='#7AFF94',
      week=[('snow',-2,-9),('snow',-3,-11),('partly-cloudy',1,-6),('partly-cloudy',3,-4),
            ('rain',5,-1),('snow',0,-7),('snow',-1,-8)]),
 dict(icon='storm',city='OTTAWA',iata='YOW',when='Thu 14:35',t=5,feels=1,wind=38,hum=88,
      cond='Thunderstorm',c0='#1657D8',c1='#05238C',unit='C',
      car='WG',carname='SUNWING',flt='WG 618',acc='#F7941D',
      week=[('storm',6,1),('storm',5,0),('rain',7,2),('partly-cloudy',9,3),
            ('partly-cloudy',11,4),('sunny',12,5),('rain',8,3)]),
]
for c in CARDS:
    c['ink']='#0B2A4A' if (lum(c['c0'])+lum(c['c1']))/2.0>0.50 else '#FFFFFF'

def C2(v,unit):    # convert + format
    return int(round(v*9/5.0+32)) if unit=='F' else v

# ── icon vectors ─────────────────────────────────────────────────────────
ref=re.compile(r'url\(#([^)]+)\)')
def load_icon(name,pfx,light=False):
    r=ET.parse('/tmp/wx2/%sopt-%s.svg'%('light-' if light else '',name)).getroot()
    vb=r.get('viewBox'); ids={e.get('id') for e in r.iter() if e.get('id')}
    def fix(e):
        for k,v in list(e.attrib.items()):
            if not isinstance(v,str): continue
            if k=='id' and v in ids: e.set(k,pfx+v)
            else:
                nv=ref.sub(lambda m:'url(#%s%s)'%(pfx,m.group(1)) if m.group(1) in ids else m.group(0),v)
                if k.endswith('href') and v.startswith('#') and v[1:] in ids: nv='#'+pfx+v[1:]
                if nv!=v: e.set(k,nv)
        for c in e: fix(c)
    fix(r)
    return vb,[c for c in r if c.tag==NS+'defs'],[c for c in r if c.tag!=NS+'defs']

PX={}; PXL={}
for n in ['partly-cloudy','sunny','rain','cloudy-night','snow','storm']:
    PX[n]='data:image/png;base64,'+base64.b64encode(open('/tmp/wx2/px-%s.png'%n,'rb').read()).decode()
    PXL[n]='data:image/png;base64,'+base64.b64encode(open('/tmp/wx2/pxl-%s.png'%n,'rb').read()).decode()

def el(p,tag,**a):
    return ET.SubElement(p,NS+tag,{k.replace('_','-'):str(v) for k,v in a.items()})
def text(p,x,y,s,size,w=400,fill='#fff',op=1.0,anchor='start',track=0):
    t=el(p,'text',x=round(x,2),y=round(y,2),fill=fill,font_family='Inter',font_size=size,
         font_weight=w,text_anchor=anchor,opacity=op)
    if track: t.set('letter-spacing',str(track))
    t.text=s; return t

root=ET.Element(NS+'svg',{'width':str(SHEET_W),'height':str(SHEET_H),
                          'viewBox':'0 0 %d %d'%(SHEET_W,SHEET_H)})
DEFS=ET.SubElement(root,NS+'defs')
bgg=el(DEFS,'linearGradient',id='sheetbg',x1='0',y1='0',x2='0',y2='1')
el(bgg,'stop',offset='0',stop_color='#123561'); el(bgg,'stop',offset='1',stop_color='#09182D')
el(root,'rect',x=0,y=0,width=SHEET_W,height=SHEET_H,fill='url(#sheetbg)')

text(root,MARGIN,MARGIN+48,'WEATHER',42,900,'#FFFFFF',1,'start',7)
text(root,MARGIN,MARGIN+76,'ORION CONNECTED   ·   LIVE AIRPORT CONDITIONS   ·   7-DAY OUTLOOK',
     12,600,'#8FB4E4',1,'start',3.2)
el(root,'rect',x=MARGIN,y=MARGIN+96,width=SHEET_W-MARGIN*2,height=2,fill='#FFFFFF',opacity=.12)

ICONS={}
def place(parent,i,X,Y,W,H):
    vb,body=ICONS[i]
    x0,y0,w,h=[float(v) for v in vb.replace(',',' ').split()]
    sc=min(W/w,H/h)
    g=ET.SubElement(parent,NS+'g',{'transform':'translate(%.2f,%.2f) scale(%.5f)'%(
        X+(W-w*sc)/2.0-x0*sc, Y+(H-h*sc)/2.0-y0*sc, sc)})
    for b in body: g.append(copy.deepcopy(b))

for i,c in enumerate(CARDS):
    g=el(DEFS,'linearGradient',id='cg%d'%i,x1='0',y1='0',x2='0.18',y2='1')
    el(g,'stop',offset='0',stop_color=c['c0']); el(g,'stop',offset='1',stop_color=c['c1'])
    sh=el(DEFS,'linearGradient',id='sh%d'%i,x1='0',y1='0',x2='0',y2='1')
    el(sh,'stop',offset='0',stop_color='#FFFFFF',stop_opacity='0.18')
    el(sh,'stop',offset='0.34',stop_color='#FFFFFF',stop_opacity='0')
    el(sh,'stop',offset='1',stop_color='#FFFFFF',stop_opacity='0')
    vb,dfs,body=load_icon(c['icon'],'i%d_'%i, False)
    for d in dfs:
        for ch in d: DEFS.append(ch)
    ICONS[i]=(vb,body)

TOP=MARGIN+HEADER

for i,c in enumerate(CARDS):
    X=MARGIN+i*(CARD_W+GUTTER); ink=c['ink']; dark=ink!='#FFFFFF'
    faint=0.55 if dark else 0.66
    rule=0.20 if dark else 0.26
    edge=('#0B2A4A',0.16) if dark else ('#FFFFFF',0.28)
    L=X+PAD+BAR+4; Rt=X+CARD_W-PAD

    card=ET.SubElement(root,NS+'g',{'id':'Card · %s'%c['city']})
    cp=ET.SubElement(DEFS,NS+'clipPath',{'id':'cc%d'%i})
    el(cp,'rect',x=X,y=TOP,width=CARD_W,height=CARD_H,rx=RAD,ry=RAD)
    body_g=ET.SubElement(card,NS+'g',{'clip-path':'url(#cc%d)'%i})
    el(body_g,'rect',x=X,y=TOP,width=CARD_W,height=CARD_H,fill='url(#cg%d)'%i)
    el(body_g,'rect',x=X,y=TOP,width=CARD_W,height=CARD_H,fill='url(#sh%d)'%i)
    el(body_g,'rect',x=X,y=TOP,width=BAR,height=CARD_H,fill=c['acc'])   # carrier accent edge
    el(body_g,'rect',x=X+BAR,y=TOP,width=1.5,height=CARD_H,fill='#FFFFFF',opacity=0.30)
    el(card,'rect',x=X+1,y=TOP+1,width=CARD_W-2,height=CARD_H-2,rx=RAD-1,ry=RAD-1,
       fill='none',stroke=edge[0],stroke_opacity=edge[1],stroke_width=2)

    # carrier
    text(card,L,TOP+30,c['carname']+'   ·   '+c['flt'],10,700,ink,faint,'start',1.6)
    # place
    text(card,L,TOP+58,c['city'],19,700,ink,0.97,'start',0.4)
    text(card,L,TOP+78,c['iata']+'   ·   '+c['when'],11,600,ink,faint,'start',1.3)

    # ── temperature: fixed-width block, degree never moves ──
    TS=76; track=-2.5; base=TOP+156
    tv=C2(c['t'],c['unit']); neg=tv<0; dg=str(abs(tv))
    slot=measure('-',TS,900)+track                # minus slot always reserved
    if neg: text(card,L,base,'-',TS,900,ink,1,'start',track)
    text(card,L+slot,base,dg,TS,900,ink,1,'start',track)
    US=26
    dxu=L+slot+measure(dg,TS,900,track)+track+5-dbearing('°',US)
    text(card,dxu,(base-TS*CAP)+US*CAP,'°'+c['unit'],US,700,ink,0.9,'start',0.5)

    place(card,i,X+CARD_W/2-64,TOP+172,128,128)

    text(card,X+CARD_W/2.0,TOP+330,c['cond'],17,700,ink,0.97,'middle',0.2)
    el(card,'rect',x=L,y=TOP+348,width=Rt-L,height=1.4,fill=ink,opacity=rule)

    mets=[('FEELS',u'%d°'%C2(c['feels'],c['unit'])),('WIND','%d km/h'%c['wind']),('HUMIDITY','%d%%'%c['hum'])]
    colw=(Rt-L)/3.0
    for k,(lab,val) in enumerate(mets):
        mx=L+colw*k+colw/2.0
        text(card,mx,TOP+372,lab,9,700,ink,faint,'middle',1.1)
        text(card,mx,TOP+392,val,14,700,ink,0.97,'middle',0)
        if k: el(card,'rect',x=L+colw*k-0.7,y=TOP+358,width=1.4,height=42,fill=ink,opacity=rule*0.8)

    el(card,'rect',x=L,y=TOP+412,width=Rt-L,height=1.4,fill=ink,opacity=rule)
    text(card,L,TOP+436,'7-DAY OUTLOOK',9,700,ink,faint,'start',1.4)

    y0=TOP+456; pitch=32
    for k,(icn,hi,lo) in enumerate(c['week']):
        yy=y0+k*pitch
        if k: el(card,'rect',x=L,y=yy-9,width=Rt-L,height=1,fill=ink,opacity=rule*0.55)
        text(card,L,yy+8,DAYS[k],10,700,ink,0.90,'start',1.1)
        el(card,'image',href=(PXL if dark else PX)[icn],x=L+46,y=yy-9,width=26,height=26,preserveAspectRatio='xMidYMid meet')
        text(card,Rt-30,yy+8,u'%d°'%C2(hi,c['unit']),13,700,ink,0.97,'end',0)
        text(card,Rt,yy+8,u'%d°'%C2(lo,c['unit']),13,600,ink,faint,'end',0)

# ── board tiles ──────────────────────────────────────────────────────────
TT=TOP+CARD_H+40
for i,c in enumerate(CARDS):
    X=MARGIN+i*(CARD_W+GUTTER); ink=c['ink']; dark=ink!='#FFFFFF'
    faint=0.58 if dark else 0.68
    edge=('#0B2A4A',0.16) if dark else ('#FFFFFF',0.28)
    tile=ET.SubElement(root,NS+'g',{'id':'Tile · %s'%c['city']})
    cp=ET.SubElement(DEFS,NS+'clipPath',{'id':'tc%d'%i})
    el(cp,'rect',x=X,y=TT,width=CARD_W,height=TILE_H,rx=RAD,ry=RAD)
    bg=ET.SubElement(tile,NS+'g',{'clip-path':'url(#tc%d)'%i})
    el(bg,'rect',x=X,y=TT,width=CARD_W,height=TILE_H,fill='url(#cg%d)'%i)
    el(bg,'rect',x=X,y=TT,width=BAR,height=TILE_H,fill=c['acc'])
    el(bg,'rect',x=X+BAR,y=TT,width=1.5,height=TILE_H,fill='#FFFFFF',opacity=0.30)
    el(tile,'rect',x=X+1,y=TT+1,width=CARD_W-2,height=TILE_H-2,rx=RAD-1,ry=RAD-1,
       fill='none',stroke=edge[0],stroke_opacity=edge[1],stroke_width=2)
    L=X+PAD+BAR+4
    text(tile,L,TT+34,c['iata'],18,900,ink,0.97,'start',1.6)
    text(tile,L,TT+52,c['city'],10,600,ink,faint,'start',1.1)
    TS2=42; tr2=-1.2; b2=TT+118
    tv=C2(c['t'],c['unit']); neg=tv<0; dg=str(abs(tv))
    slot2=measure('-',TS2,900)+tr2
    if neg: text(tile,L,b2,'-',TS2,900,ink,1,'start',tr2)
    text(tile,L+slot2,b2,dg,TS2,900,ink,1,'start',tr2)
    dxu2=L+slot2+measure(dg,TS2,900,tr2)+tr2+3-dbearing('°',18)
    text(tile,dxu2,(b2-TS2*CAP)+18*CAP,'°'+c['unit'],18,700,ink,0.9,'start',0.4)
    place(tile,i,X+CARD_W-104,TT+22,88,88)

ET.ElementTree(root).write('/tmp/wx2/weather-v3.svg',encoding='utf-8',xml_declaration=True)
print('written',os.path.getsize('/tmp/wx2/weather-v3.svg'),SHEET_W,'x',SHEET_H)
