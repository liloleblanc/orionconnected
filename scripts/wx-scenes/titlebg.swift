// The generator for the title's backdrop (fids-current/logos/Backgrounds/video/wx-title-globe-bg.mp4):
// the globe section of the licensed studio clip, luminance-inverted and tinted
// violet, with the amber field wipe — and NO lettering. The board paints the words
// over it (fids-core.js, _wxIntroPaintHtml) in its own face and languages, with
// the choreography this file's sibling once baked in: the timings in the CSS
// block "THE TITLE, PAINTED ON BY THE BOARD" are this file's `seg()` windows.
//
//   swiftc -O -o run all.swift && ./run <clip.mp4> wx-title-globe-bg.mp4 0.0 5.6
//
// The source clip is not in the repository (Vecteezy Pro licence); the backdrop is.
struct Rng { var s: UInt64
    init(_ seed: UInt64) { s = seed &* 6364136223846793005 &+ 1442695040888963407 }
    mutating func next() -> Double {
        s ^= s << 13; s ^= s >> 7; s ^= s << 17
        return Double(s % 1_000_000) / 1_000_000.0
    }
}
import AVFoundation
var BG_FRAME: CGImage? = nil

func draw_bc_news(_ ctx: CGContext, _ w: Double, _ h: Double, _ t: Double, _ dur: Double) {

    // ── easing / colour helpers ──────────────────────────────────────────
    func cl(_ x: Double, _ a: Double = 0, _ b: Double = 1) -> Double { min(max(x, a), b) }
    func seg(_ a: Double, _ b: Double) -> Double { a >= b ? (t >= b ? 1 : 0) : cl((t - a) / (b - a)) }
    func oCube(_ x: Double) -> Double { let u = 1 - x; return 1 - u * u * u }
    func oQuint(_ x: Double) -> Double { let u = 1 - x; return 1 - u * u * u * u * u }
    func ioCube(_ x: Double) -> Double { x < 0.5 ? 4 * x * x * x : 1 - pow(-2 * x + 2, 3) / 2 }
    func oBack(_ x: Double) -> Double { let c1 = 1.28, c3 = c1 + 1.0, u = x - 1; return 1 + c3 * u * u * u + c1 * u * u }
    func mx(_ a: Double, _ b: Double, _ k: Double) -> Double { a + (b - a) * k }
    func C(_ r: Double, _ g: Double, _ b: Double, _ a: Double = 1) -> CGColor {
        CGColor(red: r / 255, green: g / 255, blue: b / 255, alpha: a)
    }

    let cs = CGColorSpaceCreateDeviceRGB()
    let WHITE = C(255, 255, 255)
    let COOL  = C(206, 225, 250)
    let AMBER = C(255, 178, 38)

    var rng = Rng(70418)
    var noise = [Double](repeating: 0, count: 48)
    for i in 0..<48 { noise[i] = rng.next() }

    ctx.textMatrix = .identity
    ctx.interpolationQuality = .high
    ctx.setAllowsAntialiasing(true)

    // ── type helpers ─────────────────────────────────────────────────────
    func mkLine(_ s: String, _ fontName: String, _ size: Double, _ kernPts: Double,
                _ color: CGColor, _ rtl: Bool = false) -> CTLine {
        let f = NSFont(name: fontName, size: CGFloat(size)) ?? NSFont.boldSystemFont(ofSize: CGFloat(size))
        let ps = NSMutableParagraphStyle()
        ps.baseWritingDirection = rtl ? .rightToLeft : .leftToRight
        let att = NSMutableAttributedString(string: s, attributes: [
            .font: f,
            NSAttributedString.Key(kCTForegroundColorAttributeName as String): color,
            .paragraphStyle: ps
        ])
        let n = s.utf16.count
        if kernPts != 0 && n > 1 {
            att.addAttribute(.kern, value: NSNumber(value: kernPts), range: NSRange(location: 0, length: n - 1))
        }
        return CTLineCreateWithAttributedString(att as CFAttributedString)
    }
    func lineW(_ l: CTLine) -> Double { CTLineGetTypographicBounds(l, nil, nil, nil) }
    func capOf(_ fontName: String, _ size: Double) -> Double {
        Double((NSFont(name: fontName, size: CGFloat(size)) ?? NSFont.boldSystemFont(ofSize: CGFloat(size))).capHeight)
    }
    func put(_ l: CTLine, _ x: Double, _ y: Double) {
        ctx.textMatrix = .identity
        ctx.textPosition = CGPoint(x: x, y: y)
        CTLineDraw(l, ctx)
    }

    // ── the words ────────────────────────────────────────────────────────
    let HERO_F = "HelveticaNeue-CondensedBlack"
    let EN = "WEATHER REPORT"
    let FR = "BULLETIN MÉTÉO"

    let M = 76.0
    let measure = w - 2 * M

    let wEN100 = lineW(mkLine(EN, HERO_F, 100, 0, WHITE))
    let wFR100 = lineW(mkLine(FR, HERO_F, 100, 0, WHITE))
    let gaps = 13.0                                   // both lines are 14 characters
    let trackEm = 0.012
    let sEN = measure / (wEN100 / 100 + trackEm * gaps)
    let sFR = measure / (wFR100 / 100 + trackEm * gaps)
    let heroSize = min(sEN, sFR)                      // one size for both languages
    let kEN = (measure - wEN100 * heroSize / 100) / gaps
    let kFR = (measure - wFR100 * heroSize / 100) / gaps
    let heroCap = capOf(HERO_F, heroSize)

    let lnEN = mkLine(EN, HERO_F, heroSize, kEN, WHITE)
    let lnFR = mkLine(FR, HERO_F, heroSize, kFR, WHITE)
    let lnENa = mkLine(EN, HERO_F, heroSize, kEN, AMBER)
    let lnFRa = mkLine(FR, HERO_F, heroSize, kFR, AMBER)

    // supporting rank — the other seven languages, quiet but legible
    let RANK_F = "HelveticaNeue-Medium"
    let rankSize = 33.0
    let rankKern = rankSize * 0.045
    struct Sup { let s: String; let f: String; let sz: Double; let rtl: Bool }
    let rows: [[Sup]] = [
        [Sup(s: "Informe del clima", f: RANK_F, sz: rankSize, rtl: false),
         Sup(s: "Wetterbericht",     f: RANK_F, sz: rankSize, rtl: false)],
        [Sup(s: "Bollettino meteo",       f: RANK_F, sz: rankSize, rtl: false),
         Sup(s: "Boletim meteorológico",  f: RANK_F, sz: rankSize, rtl: false)],
        [Sup(s: "天気予報",     f: "HiraginoSans-W6",    sz: 31.0, rtl: false),
         Sup(s: "天气预报",     f: "PingFangSC-Semibold", sz: 31.0, rtl: false),
         Sup(s: "نشرة الطقس",  f: "GeezaPro-Bold",       sz: 35.0, rtl: true)]
    ]
    let rankCap = capOf(RANK_F, rankSize)

    // ── vertical rhythm (walked top-down, then flipped into CG space) ────
    let kickH = 10.0, kickGap = 34.0
    let enFrGap = heroCap * 0.54      // the É accents need air above them
    let ruleGap = 48.0, ruleH = 6.0
    let rankGap = 56.0, rankPitch = 46.0
    let contentH = kickH + kickGap + heroCap + enFrGap + heroCap
                 + ruleGap + ruleH + rankGap + rankCap + 2 * rankPitch
    var cur = (h - contentH) / 2
    let kickTopTD = cur;  cur += kickH + kickGap
    let enCapTD   = cur;  cur += heroCap + enFrGap
    let frCapTD   = cur;  cur += heroCap + ruleGap
    let ruleTopTD = cur;  cur += ruleH + rankGap
    let rankTopTD = cur

    let enBase = h - enCapTD - heroCap
    let frBase = h - frCapTD - heroCap
    let ruleY  = h - ruleTopTD - ruleH
    let kickY  = h - kickTopTD - kickH

    // ── wipe geometry ────────────────────────────────────────────────────
    let SLANT = 0.085
    func ex(_ X: Double, _ y: Double) -> Double { X + (y - h * 0.5) * SLANT }
    func sidePath(_ X: Double, _ keepLeft: Bool) -> CGPath {
        let p = CGMutablePath(), y0 = -80.0, y1 = h + 80
        let far = keepLeft ? -140.0 : w + 140
        p.move(to: CGPoint(x: far, y: y0))
        p.addLine(to: CGPoint(x: ex(X, y0), y: y0))
        p.addLine(to: CGPoint(x: ex(X, y1), y: y1))
        p.addLine(to: CGPoint(x: far, y: y1))
        p.closeSubpath()
        return p
    }
    func slabPath(_ A: Double, _ B: Double) -> CGPath {
        let p = CGMutablePath(), y0 = -80.0, y1 = h + 80
        p.move(to: CGPoint(x: ex(A, y0), y: y0))
        p.addLine(to: CGPoint(x: ex(B, y0), y: y0))
        p.addLine(to: CGPoint(x: ex(B, y1), y: y1))
        p.addLine(to: CGPoint(x: ex(A, y1), y: y1))
        p.closeSubpath()
        return p
    }

    // timings
    let p1 = seg(0.08, 0.86)                 // field wipe, L→R
    let p2 = seg(0.54, 1.20)                 // English line, L→R
    let p3 = seg(0.98, 1.64)                 // French line, R→L
    let p4 = seg(1.78, 2.58)                 // the rule draws itself
    let pK = seg(0.92, 1.42)                 // accent kicker
    let pS = seg(1.62, 2.46)                 // the settle
    let X1 = mx(-150, w + 150, ioCube(p1))
    let X2 = mx(-150, w + 150, ioCube(p2))
    let X3 = mx(w + 150, -150, ioCube(p3))

    let settle = -8.0 * (1 - oQuint(pS))     // lockup rides up onto its mark

    // ── 1. THE FIELD ─────────────────────────────────────────────────────
    ctx.saveGState()
    ctx.addPath(sidePath(X1, true))
    ctx.clip()

    // The field is a frame of the supplied background video, aspect-filled and
    // drawn inside the SAME wipe clip as the original — so the amber slab still
    // paints the studio wall on rather than it simply being there from frame 0.
    if let bg = BG_FRAME {
        let bw = Double(bg.width), bh = Double(bg.height)
        let s = max(w / bw, h / bh)
        let dw = bw * s, dh = bh * s
        ctx.draw(bg, in: CGRect(x: (w - dw) / 2, y: (h - dh) / 2, width: dw, height: dh))
    }

    // Scrim: the studio wall is a bright blue, and the lockup is white.
    ctx.setFillColor(C(2, 8, 20, 0.34))
    ctx.fill(CGRect(x: -200, y: -200, width: w + 400, height: h + 400))

    ctx.setFillColor(C(0, 0, 0, 0.055))
    var sy = 0.0
    while sy < h { ctx.fill(CGRect(x: 0, y: sy, width: w, height: 1.4)); sy += 3.0 }

    if let g = CGGradient(colorsSpace: cs, colors: [C(0, 0, 0, 0.0), C(0, 0, 0, 0.24), C(0, 0, 0, 0.62)] as CFArray,
                          locations: [0.0, 0.62, 1.0]) {
        ctx.drawRadialGradient(g, startCenter: CGPoint(x: w * 0.5, y: h * 0.52), startRadius: h * 0.20,
                               endCenter: CGPoint(x: w * 0.5, y: h * 0.52), endRadius: h * 0.92, options: [])
    }
    ctx.restoreGState()

    // ── 2. THE ACCENT KICKER ─────────────────────────────────────────────
    if false && pK > 0 {
        let e = oBack(pK)
        ctx.setFillColor(AMBER)
        ctx.fill(CGRect(x: M, y: kickY + settle, width: 126 * e, height: kickH))
        if pK > 0.45 {
            let e2 = oBack(cl((pK - 0.45) / 0.55))
            ctx.setFillColor(C(206, 225, 250, 0.95))
            ctx.fill(CGRect(x: M + 126 + 14, y: kickY + settle, width: 40 * e2, height: kickH))
        }
    }

    // ── 3. THE TITLE ─────────────────────────────────────────────────────
    func revealLine(_ white: CTLine, _ amber: CTLine, _ baseY: Double, _ capTop: Double,
                    _ X: Double, _ leftward: Bool, _ prog: Double, _ slide: Double) {
        if prog <= 0 { return }
        let band = CGRect(x: 0, y: baseY - heroCap * 0.36, width: w, height: heroCap * 1.70)
        let dx = (1 - oQuint(prog)) * slide

        // the letters, revealed behind the bar
        ctx.saveGState()
        ctx.clip(to: band)
        if prog < 1 { ctx.addPath(sidePath(X, leftward)); ctx.clip() }
        put(white, M + dx, baseY + settle)
        ctx.restoreGState()

        // amber heat trailing the bar
        if prog > 0 && prog < 1 {
            let slices = 9, sw = 19.0
            for k in 0..<slices {
                let a0 = leftward ? X - Double(k + 1) * sw : X + Double(k) * sw
                let a1 = leftward ? X - Double(k) * sw : X + Double(k + 1) * sw
                ctx.saveGState()
                ctx.clip(to: band)
                ctx.addPath(slabPath(min(a0, a1), max(a0, a1)))
                ctx.clip()
                ctx.setAlpha(0.70 * (1 - Double(k) / Double(slices)))
                put(amber, M + dx, baseY + settle)
                ctx.restoreGState()
            }
        }

        // the bar itself
        if prog > 0.001 && prog < 0.999 {
            let bw = 78.0
            let a = leftward ? X : X - bw
            ctx.saveGState()
            ctx.clip(to: band)
            ctx.addPath(slabPath(a, a + bw))
            ctx.setFillColor(AMBER)
            ctx.fillPath()
            let le = leftward ? a + bw - 7 : a
            ctx.addPath(slabPath(le, le + 7))
            ctx.setFillColor(WHITE)
            ctx.fillPath()
            ctx.restoreGState()
        }
    }
    // (wordless cut: the board draws the words)
    _ = (lnEN, lnENa, lnFR, lnFRa, enBase, frBase, enCapTD, frCapTD, X2, X3, p2, p3)

    // ── 4. THE RULE, DRAWING ITSELF ──────────────────────────────────────
    if false && p4 > 0 {
        // draws across on a smoothstep, overruns its mark by a hair, settles back
        let grow = ioCube(cl(p4 / 0.80))
        let over = 0.026 * sin(cl((p4 - 0.80) / 0.20) * 3.14159265)
        let len = measure * (grow + over)
        ctx.setFillColor(C(206, 225, 250, 0.90))
        ctx.fill(CGRect(x: M, y: ruleY, width: len, height: ruleH))
        ctx.setFillColor(AMBER)
        ctx.fill(CGRect(x: M, y: ruleY, width: min(len, 152), height: ruleH))
        if p4 < 1 {
            ctx.setFillColor(WHITE)
            ctx.fill(CGRect(x: M + len - 5, y: ruleY - 6, width: 5, height: ruleH + 12))
        }
    }

    // ── 5. THE SUPPORTING RANK ───────────────────────────────────────────
    var idx = 0
    for (ri, row) in [[Sup]]().enumerated() {
        var built: [(CTLine, Double, Int)] = []
        var total = 0.0
        for s in row {
            let l = mkLine(s.s, s.f, s.sz, s.f == RANK_F ? rankKern : s.sz * 0.03, COOL, s.rtl)
            let lw = lineW(l)
            built.append((l, lw, idx))
            total += lw
            idx += 1
        }
        let sepW = 58.0
        total += sepW * Double(row.count - 1)
        var x = (w - total) / 2
        let baseY = h - (rankTopTD + rankCap + Double(ri) * rankPitch)
        for (i, b) in built.enumerated() {
            let k = Double(b.2)
            let pR = seg(2.44 + k * 0.085, 3.06 + k * 0.085)
            if pR > 0 {
                ctx.saveGState()
                ctx.setAlpha(cl(pR * 1.05))
                put(b.0, x, baseY - (1 - oCube(pR)) * 12)
                ctx.restoreGState()
            }
            x += b.1
            if i < built.count - 1 {
                let pD = seg(2.52 + k * 0.085, 3.06 + k * 0.085)
                if pD > 0 {
                    ctx.setFillColor(C(255, 178, 38, 0.90 * pD))
                    let r = 4.0
                    ctx.fillEllipse(in: CGRect(x: x + sepW / 2 - r, y: baseY + rankCap * 0.34 - r,
                                               width: r * 2, height: r * 2))
                }
                x += sepW
            }
        }
    }

    // ── 6. THE FIELD WIPE'S OWN BAR (over everything, it is the wipe) ────
    if p1 > 0.001 && p1 < 0.999 {
        ctx.saveGState()
        ctx.addPath(slabPath(X1, X1 + 104))
        ctx.setFillColor(AMBER)
        ctx.fillPath()
        ctx.addPath(slabPath(X1 + 104, X1 + 112))
        ctx.setFillColor(WHITE)
        ctx.fillPath()
        ctx.addPath(slabPath(X1 - 26, X1))
        ctx.setFillColor(C(9, 34, 70, 0.85))
        ctx.fillPath()
        ctx.restoreGState()
    }
}
import AVFoundation
import AppKit

// Title integrated over the globe section, full frame — not inside the monitor.
// That section is shot on white (mean 100-222), so the luminance relationship is
// inverted first: the white ground drops away and the globe lifts, then the whole
// thing is tinted to keep the source's violet identity.
let src = CommandLine.arguments[1]
let out = CommandLine.arguments[2]
let T0  = Double(CommandLine.arguments[3])!
let T1  = Double(CommandLine.arguments[4])!
func argD(_ i: Int, _ dflt: Double) -> Double {
    CommandLine.arguments.count > i ? (Double(CommandLine.arguments[i]) ?? dflt) : dflt
}
let TR = argD(5, 0.42)     // tint r
let TG = argD(6, 0.30)     // tint g
let TB = argD(7, 0.98)     // tint b

let PW = 976, PH = 856
let FPS: Int32 = 30
let DUR = 6.0

let asset = AVURLAsset(url: URL(fileURLWithPath: src))
let gen = AVAssetImageGenerator(asset: asset)
gen.appliesPreferredTrackTransform = true
gen.requestedTimeToleranceBefore = CMTime(value: 1, timescale: 90)
gen.requestedTimeToleranceAfter  = CMTime(value: 1, timescale: 90)
let cs = CGColorSpaceCreateDeviceRGB()

func graded(_ img: CGImage) -> CGImage {
    let W = img.width, H = img.height, rb = W*4
    var s = [UInt8](repeating: 0, count: rb*H)
    s.withUnsafeMutableBytes { raw in
        let c = CGContext(data: raw.baseAddress, width: W, height: H, bitsPerComponent: 8,
                          bytesPerRow: rb, space: cs,
                          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        c.draw(img, in: CGRect(x: 0, y: 0, width: Double(W), height: Double(H)))
    }
    let ctx = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: 0,
                        space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    let dst = ctx.data!.assumingMemoryBound(to: UInt8.self)
    let dRow = ctx.bytesPerRow
    func q(_ v: Double) -> UInt8 { v.isFinite ? UInt8(max(0, min(255, v*255))) : 0 }
    for y in 0..<H { for x in 0..<W {
        let p = y*rb + x*4, d = y*dRow + x*4
        let ir = 1 - Double(s[p])/255, ig = 1 - Double(s[p+1])/255, ib = 1 - Double(s[p+2])/255
        let l = 0.2126*ir + 0.7152*ig + 0.0722*ib
        // tinted luminance, plus a trace of the inverted chroma so the globe's
        // shading survives instead of flattening to a single hue
        dst[d]   = q(l*TR + ir*0.10)
        dst[d+1] = q(l*TG + ig*0.14)
        dst[d+2] = q(l*TB + ib*0.16)
        dst[d+3] = 255
    } }
    return ctx.makeImage()!
}

try? FileManager.default.removeItem(atPath: out)
let writer = try! AVAssetWriter(url: URL(fileURLWithPath: out), fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: PW, AVVideoHeightKey: PH,
    AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 5_500_000]])
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input,
    sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32ARGB),
        kCVPixelBufferWidthKey as String: PW, kCVPixelBufferHeightKey as String: PH])
writer.add(input); writer.startWriting(); writer.startSession(atSourceTime: .zero)

let cs0 = CGColorSpaceCreateDeviceRGB()
let total = Int(DUR * Double(FPS))
var i = 0
while i < total {
    guard input.isReadyForMoreMediaData else { usleep(3000); continue }
    let t = Double(i) / Double(FPS)
    let srcT = T0 + (T1 - T0) * (t / DUR)
    if let f = try? gen.copyCGImage(at: CMTime(seconds: srcT, preferredTimescale: 600), actualTime: nil) {
        BG_FRAME = graded(f)
    }
    var pb: CVPixelBuffer?
    CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pb)
    guard let buf = pb else { break }
    CVPixelBufferLockBaseAddress(buf, [])
    let ctx = CGContext(data: CVPixelBufferGetBaseAddress(buf), width: PW, height: PH,
                        bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(buf),
                        space: cs0, bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue)!
    ctx.setFillColor(CGColor(red: 0, green: 0, blue: 0, alpha: 1))
    ctx.fill(CGRect(x: 0, y: 0, width: PW, height: PH))
    draw_bc_news(ctx, Double(PW), Double(PH), t, DUR)
    CVPixelBufferUnlockBaseAddress(buf, [])
    adaptor.append(buf, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: FPS))
    i += 1
}
input.markAsFinished()
let sem = DispatchSemaphore(value: 0)
writer.finishWriting { sem.signal() }
sem.wait()
print("wrote \(i) frames, source \(T0)–\(T1)s -> \(out)  [\(writer.status == .completed ? "OK" : "FAILED")]")
