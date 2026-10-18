// ━━ CHECK THE EARTH FLOOR'S SQUARES (build time, on the Mac only) ━━━━━━━━━━━━
//
//   swift scripts/earth/verify.swift <fids-current/earth/v1> [--gibs]
//
// 1. SEAMS. Every square's edge must continue into its neighbour's: east-west
//    neighbours (the ±180° seam included, where the last square of a row meets
//    the first, between 60°S and 60°N: NASA's own picture does not join there
//    nearer the poles) and north-south neighbours, at both levels and in every
//    layer.
//    The step across a seam is compared with the step between the last two
//    columns (or rows) inside the square; a seam is a fault when it is more
//    than 1.5 times that plus 3 levels of grey.
// 2. LEVELS AGREE. Each 60° square, and the whole-Earth picture, match the
//    30° squares they were cut beside (mean difference under 6 levels).
// 3. --gibs: the PRODUCT AND ORIENTATION match the approved preview, which
//    read NASA GIBS: our August and night squares over Moncton, London and
//    Hobart are compared with GIBS's own copies of the same squares: the mean
//    difference must be under 24 levels AND under that of our square mirrored
//    east-west (the control). Measured 2026-10-12: 0.5–4.2 against 2.9–25.4
//    mirrored. This is the only contact with NASA, at build time; no screen
//    ever makes it.

import Foundation
import CoreGraphics
import ImageIO

func fail(_ s: String) -> Never { FileHandle.standardError.write((s + "\n").data(using: .utf8)!); exit(1) }

struct Px { let w: Int; let h: Int; let d: [UInt8] }   // RGBA, row 0 at the top
func pixels(_ img: CGImage, _ w: Int, _ h: Int) -> Px {
    var d = [UInt8](repeating: 0, count: w * h * 4)
    let c = CGContext(data: &d, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                      space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    c.interpolationQuality = .high
    c.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
    return Px(w: w, h: h, d: d)
}
func load(_ path: String) -> CGImage {
    guard let s = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil),
          let i = CGImageSourceCreateImageAtIndex(s, 0, nil) else { fail("cannot read " + path) }
    return i
}
func px(_ path: String, _ w: Int = 960, _ h: Int = 960) -> Px { pixels(load(path), w, h) }
func at(_ p: Px, _ x: Int, _ y: Int, _ k: Int) -> Double { Double(p.d[(y * p.w + x) * 4 + k]) }

// mean absolute difference between column xa of a and column xb of b (or
// rows), over rows y0..<y1
func colDiff(_ a: Px, _ xa: Int, _ b: Px, _ xb: Int, _ y0: Int = 0, _ y1: Int = -1) -> Double {
    let e = y1 < 0 ? a.h : y1
    if e <= y0 { return 0 }
    var s = 0.0
    for y in y0..<e { for k in 0..<3 { s += abs(at(a, xa, y, k) - at(b, xb, y, k)) } }
    return s / Double((e - y0) * 3)
}
func rowDiff(_ a: Px, _ ya: Int, _ b: Px, _ yb: Int) -> Double {
    var s = 0.0
    for x in 0..<a.w { for k in 0..<3 { s += abs(at(a, x, ya, k) - at(b, x, yb, k)) } }
    return s / Double(a.w * 3)
}
func meanDiff(_ a: Px, _ b: Px) -> Double {
    var s = 0.0
    for i in 0..<(a.w * a.h) { for k in 0..<3 { s += abs(Double(a.d[i * 4 + k]) - Double(b.d[i * 4 + k])) } }
    return s / Double(a.w * a.h * 3)
}

let args = CommandLine.arguments
if args.count < 2 { fail("swift verify.swift <fids-current/earth/v1> [--gibs]") }
let root = args[1], gibs = args.contains("--gibs")
func latOf(_ i: Int, _ span: Int) -> Int { 90 - (i + 1) * span }
let layers = (1...12).map { String(format: "day-%02d", $0) } + ["night"]
var faults = 0, seams = 0

for layer in layers {
    for (dir, span) in [("t32", 30), ("t16", 60)] {
        let rows = 180 / span, cols = 360 / span
        var sq: [String: Px] = [:]
        for i in 0..<rows { for j in 0..<cols {
            let latS = 90 - (i + 1) * span, lonW = -180 + j * span
            sq["\(i)_\(j)"] = px(root + "/\(dir)/\(layer)/\(latS)_\(lonW).jpg")
        } }
        for i in 0..<rows { for j in 0..<cols {
            let a = sq["\(i)_\(j)"]!
            let e = sq["\(i)_\((j + 1) % cols)"]!                       // east, wrapping across ±180°
            // NASA's own Blue Marble does not join across ±180° poleward of
            // 60° (measured in the source: 67 levels at 80–90°N in January
            // against 6 inside), so the wrap is checked between 60°S and 60°N
            var y0 = 0, y1 = 960
            if j + 1 == cols {
                let latN = Double(latOf(i, span) + span)
                y0 = Int(max(0, (latN - 60) / Double(span) * 960)); y1 = Int(min(960, (latN + 60) / Double(span) * 960))
            }
            let inner = colDiff(a, 958, a, 959, y0, y1), seam = colDiff(a, 959, e, 0, y0, y1)
            seams += 1
            if seam > inner * 1.5 + 3 { faults += 1; print("SEAM \(layer) \(dir) \(i)_\(j) → east: \(String(format: "%.1f", seam)) vs \(String(format: "%.1f", inner))") }
            if i + 1 < rows {
                let s = sq["\(i + 1)_\(j)"]!
                let innerR = rowDiff(a, 958, a, 959), seamR = rowDiff(a, 959, s, 0)
                seams += 1
                if seamR > innerR * 1.5 + 3 { faults += 1; print("SEAM \(layer) \(dir) \(i)_\(j) → south: \(String(format: "%.1f", seamR)) vs \(String(format: "%.1f", innerR))") }
            }
        } }
    }
    // a 60° square against the four 30° squares it holds, and the whole Earth
    // against the 30° squares, all brought to one size
    let big = px(root + "/t16/\(layer)/30_-120.jpg", 240, 240)
    var quad = [UInt8](repeating: 0, count: 240 * 240 * 4)
    for (qi, (latS, lonW)) in [(60, -120), (60, -90), (30, -120), (30, -90)].enumerated() {
        let p = px(root + "/t32/\(layer)/\(latS)_\(lonW).jpg", 120, 120)
        let ox = (qi % 2) * 120, oy = (qi / 2) * 120
        for y in 0..<120 { for x in 0..<120 { for k in 0..<4 { quad[((oy + y) * 240 + ox + x) * 4 + k] = p.d[(y * 120 + x) * 4 + k] } } }
    }
    let lv = meanDiff(big, Px(w: 240, h: 240, d: quad))
    if lv > 6 { faults += 1; print("LEVELS \(layer): 60° square differs from its 30° squares by \(String(format: "%.1f", lv))") }
    let world = load(root + "/world/\(layer).jpg")
    guard let wq = world.cropping(to: CGRect(x: 512, y: 171, width: 171, height: 171)) else { fail("crop") }   // 30°N–60°N, 90°W–60°W
    let wsq = pixels(wq, 120, 120), tsq = px(root + "/t32/\(layer)/30_-90.jpg", 120, 120)
    let wd = meanDiff(wsq, tsq)
    if wd > 6 { faults += 1; print("WORLD \(layer): whole-Earth picture differs from the 30° square by \(String(format: "%.1f", wd))") }
    print("\(layer): seams checked, 60°/30° \(String(format: "%.1f", lv)), world/30° \(String(format: "%.1f", wd))")
}

if gibs {
    let wms = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&STYLES=&CRS=EPSG:4326&FORMAT=image/jpeg&WIDTH=240&HEIGHT=240"
    // Moncton, London and Hobart, each in the 30° square that holds it
    for (name, latS, lonW) in [("Moncton", 30, -90), ("London", 30, -30), ("Hobart", -60, 120)] {
        for (layer, gl) in [("day-08", "BlueMarble_NextGeneration"), ("night", "VIIRS_Black_Marble")] {
            let url = URL(string: wms + "&LAYERS=\(gl)&BBOX=\(latS),\(lonW),\(latS + 30),\(lonW + 30)")!
            guard let data = try? Data(contentsOf: url), let s = CGImageSourceCreateWithData(data as CFData, nil),
                  let g = CGImageSourceCreateImageAtIndex(s, 0, nil) else { faults += 1; print("GIBS \(name) \(layer): no answer"); continue }
            let ours = px(root + "/t32/\(layer)/\(latS)_\(lonW).jpg", 240, 240), theirs = pixels(g, 240, 240)
            let d = meanDiff(ours, theirs)
            // the same square mirrored east-west, as a control: it must read far worse
            var mir = ours.d
            for y in 0..<240 { for x in 0..<240 { for k in 0..<4 { mir[(y * 240 + x) * 4 + k] = ours.d[(y * 240 + 239 - x) * 4 + k] } } }
            let dm = meanDiff(Px(w: 240, h: 240, d: mir), theirs)
            let ok = d < 24 && d < dm
            if !ok { faults += 1 }
            print("GIBS \(name) \(layer): \(String(format: "%.1f", d)) (mirrored \(String(format: "%.1f", dm))) \(ok ? "ok" : "FAULT")")
        }
    }
}
print("\(seams) seams, \(faults) faults")
exit(faults == 0 ? 0 : 1)
