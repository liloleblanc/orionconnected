// Exemplar-based inpainting (Criminisi et al.) for removing parked aircraft
// from the GeoNB airfield photo.
//   inpaint <mosaic.png> <fixes.json> <out.png> <reviewdir>
// fixes.json: [{ "name": "jet", "poly": [[x,y],...], "grow": 4, "margin": 70 }, ...]
// (mosaic pixel coordinates, top-left origin). Each fix is filled from its own
// window (the polygon's box plus `margin`), the best 9x9 match found anywhere
// in that window outside every hole; the front is filled in priority order
// (confidence x strength of the line crossing it), so markings carry through.
// "tight": true keeps only the aircraft's own pixels inside the outline;
// "offset": [dx, dy] copies the patch that far away instead (clone mode).
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

struct Fix: Codable { let name: String; let poly: [[Double]]; let grow: Int?; let margin: Int?; let offset: [Int]?; let feather: Int?; let tight: Bool? }

func load(_ p: String) -> CGImage {
    let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: p) as CFURL, nil)!
    return CGImageSourceCreateImageAtIndex(src, 0, nil)!
}
func save(_ img: CGImage, _ p: String) {
    let type = (p.hasSuffix(".jpg") ? UTType.jpeg : UTType.png).identifier as CFString
    let dst = CGImageDestinationCreateWithURL(URL(fileURLWithPath: p) as CFURL, type, 1, nil)!
    CGImageDestinationAddImage(dst, img, [kCGImageDestinationLossyCompressionQuality: 0.9] as CFDictionary)
    CGImageDestinationFinalize(dst)
}

let args = CommandLine.arguments
let base = load(args[1])
let W = base.width, H = base.height
let cs = CGColorSpace(name: CGColorSpace.sRGB)!
let ctx = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: W * 4, space: cs,
                    bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
ctx.draw(base, in: CGRect(x: 0, y: 0, width: W, height: H))
let buf = ctx.data!.bindMemory(to: UInt8.self, capacity: W * H * 4)   // row 0 = top in memory for CGBitmapContext
let fixes = try! JSONDecoder().decode([Fix].self, from: Data(contentsOf: URL(fileURLWithPath: args[2])))
let review = args[4]
try? FileManager.default.createDirectory(atPath: review, withIntermediateDirectories: true)

func inside(_ x: Double, _ y: Double, _ poly: [[Double]]) -> Bool {
    var c = false; var j = poly.count - 1
    for i in 0..<poly.count {
        let xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1]
        if ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi) { c.toggle() }
        j = i
    }
    return c
}
func crop(_ x0: Int, _ y0: Int, _ w: Int, _ h: Int, _ name: String) {
    let c2 = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: cs,
                       bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    let d = c2.data!.bindMemory(to: UInt8.self, capacity: w * h * 4)
    for y in 0..<h { for x in 0..<w { for k in 0..<4 { d[(y * w + x) * 4 + k] = buf[((y0 + y) * W + (x0 + x)) * 4 + k] } } }
    save(c2.makeImage()!, review + "/" + name + ".png")
}

let P = 4   // half patch: 9x9
// every fix's hole, so no fill borrows a piece of another aircraft
func anyHole(_ x: Double, _ y: Double) -> Bool { for g in fixes { if inside(x, y, g.poly) { return true } }; return false }
for f in fixes {
    let grow = f.grow ?? 4, margin = f.margin ?? 70
    let xs = f.poly.map { $0[0] }, ys = f.poly.map { $0[1] }
    let bx0 = max(0, Int(xs.min()!) - grow - margin), by0 = max(0, Int(ys.min()!) - grow - margin)
    let bx1 = min(W - 1, Int(xs.max()!) + grow + margin), by1 = min(H - 1, Int(ys.max()!) + grow + margin)
    let w = bx1 - bx0 + 1, h = by1 - by0 + 1
    crop(bx0, by0, w, h, f.name + "-before")
    // the window's pixels and its hole
    var img = [Double](repeating: 0, count: w * h * 3)
    var hole = [Bool](repeating: false, count: w * h)
    for y in 0..<h { for x in 0..<w {
        let o = ((by0 + y) * W + (bx0 + x)) * 4
        img[(y * w + x) * 3] = Double(buf[o]); img[(y * w + x) * 3 + 1] = Double(buf[o + 1]); img[(y * w + x) * 3 + 2] = Double(buf[o + 2])
        if inside(Double(bx0 + x) + 0.5, Double(by0 + y) + 0.5, f.poly) {
            // TIGHT: inside the outline, only the aircraft itself -- white
            // paint, its dark shadow, red trim -- not the apron or lawn round it
            if f.tight == true {
                let r = Double(buf[o]), g = Double(buf[o + 1]), b = Double(buf[o + 2])
                let l = 0.299 * r + 0.587 * g + 0.114 * b
                if l > 188 || (l < 128 && g - b < 9) || l < 96 || r - g > 35 { hole[y * w + x] = true }
            } else { hole[y * w + x] = true }
        }
    } }
    // grow the hole
    for _ in 0..<grow {
        var g = hole
        for y in 1..<(h - 1) { for x in 1..<(w - 1) where !hole[y * w + x] {
            if hole[y * w + x - 1] || hole[y * w + x + 1] || hole[(y - 1) * w + x] || hole[(y + 1) * w + x] { g[y * w + x] = true }
        } }
        hole = g
    }
    // CLONE MODE: the hole takes the pixels `offset` away (a matching place
    // on the airfield), blended into its surroundings over `feather` pixels
    if let off = f.offset {
        let fe = f.feather ?? 4
        // distance (in steps) from each hole pixel to the nearest kept pixel
        var dist = hole.map { $0 ? Int.max : 0 }
        for _ in 0..<fe { var d2 = dist
            for y in 1..<(h - 1) { for x in 1..<(w - 1) where dist[y * w + x] == Int.max {
                let n = [dist[y * w + x - 1], dist[y * w + x + 1], dist[(y - 1) * w + x], dist[(y + 1) * w + x]].min()!
                if n != Int.max { d2[y * w + x] = n + 1 } } }
            dist = d2 }
        for y in 0..<h { for x in 0..<w where hole[y * w + x] {
            let sx = bx0 + x + off[0], sy = by0 + y + off[1]
            if sx < 0 || sy < 0 || sx >= W || sy >= H { continue }
            let o = (sy * W + sx) * 4
            let t = dist[y * w + x] == Int.max ? 1.0 : min(1.0, Double(dist[y * w + x]) / Double(fe + 1))
            for k in 0..<3 { img[(y * w + x) * 3 + k] = img[(y * w + x) * 3 + k] * (1 - t) + Double(buf[o + k]) * t }
        } }
        for y in 0..<h { for x in 0..<w {
            let o = ((by0 + y) * W + (bx0 + x)) * 4
            for k in 0..<3 { buf[o + k] = UInt8(max(0, min(255, img[(y * w + x) * 3 + k]))) }
        } }
        crop(bx0, by0, w, h, f.name + "-after")
        print(f.name, "cloned from", off)
        continue
    }
    var conf = hole.map { $0 ? 0.0 : 1.0 }
    // candidate source patches: fully outside the hole
    var srcs: [(Int, Int)] = []
    var banned = [Bool](repeating: false, count: w * h)
    for y in 0..<h { for x in 0..<w { banned[y * w + x] = hole[y * w + x] || anyHole(Double(bx0 + x) + 0.5, Double(by0 + y) + 0.5) } }
    for y in P..<(h - P) { for x in P..<(w - P) {
        var ok = true
        outer: for dy in -P...P { for dx in -P...P { if banned[(y + dy) * w + x + dx] { ok = false; break outer } } }
        if ok { srcs.append((x, y)) }
    } }
    func lum(_ i: Int) -> Double { return 0.299 * img[i * 3] + 0.587 * img[i * 3 + 1] + 0.114 * img[i * 3 + 2] }
    var remaining = hole.filter { $0 }.count
    var iters = 0
    while remaining > 0 && iters < 20000 {
        iters += 1
        // the fill front, and the best point on it
        var best = -1.0, bp = (0, 0), bestC = 0.0
        for y in P..<(h - P) { for x in P..<(w - P) where hole[y * w + x] {
            let edge = !hole[y * w + x - 1] || !hole[y * w + x + 1] || !hole[(y - 1) * w + x] || !hole[(y + 1) * w + x]
            if !edge { continue }
            var c = 0.0
            for dy in -P...P { for dx in -P...P { c += conf[(y + dy) * w + x + dx] } }
            c /= Double((2 * P + 1) * (2 * P + 1))
            // data term: the strongest known gradient near p, against the front's normal
            var gx = 0.0, gy = 0.0, gm = 0.0
            for dy in -2...2 { for dx in -2...2 {
                let xx = x + dx, yy = y + dy
                if xx < 1 || yy < 1 || xx >= w - 1 || yy >= h - 1 { continue }
                if hole[yy * w + xx] || hole[yy * w + xx - 1] || hole[yy * w + xx + 1] || hole[(yy - 1) * w + xx] || hole[(yy + 1) * w + xx] { continue }
                let ix = (lum(yy * w + xx + 1) - lum(yy * w + xx - 1)) / 2, iy = (lum((yy + 1) * w + xx) - lum((yy - 1) * w + xx)) / 2
                let m = ix * ix + iy * iy
                if m > gm { gm = m; gx = ix; gy = iy }
            } }
            let nx = (hole[y * w + x + 1] ? 1.0 : 0.0) - (hole[y * w + x - 1] ? 1.0 : 0.0)
            let ny = (hole[(y + 1) * w + x] ? 1.0 : 0.0) - (hole[(y - 1) * w + x] ? 1.0 : 0.0)
            let nn = max(1e-6, (nx * nx + ny * ny).squareRoot())
            let d = abs(-gy * nx / nn + gx * ny / nn) / 255.0
            let pr = c * (d + 0.001)
            if pr > best { best = pr; bp = (x, y); bestC = c }
        } }
        if best < 0 { break }
        let (px, py) = bp
        // best source patch by SSD over the known pixels of the target patch
        var bestS = Double.greatestFiniteMagnitude, bs = srcs[0]
        for s in srcs {
            var ssd = 0.0
            for dy in -P...P { for dx in -P...P {
                let t = (py + dy) * w + px + dx
                if hole[t] { continue }
                let q = (s.1 + dy) * w + s.0 + dx
                let r = img[t * 3] - img[q * 3], g = img[t * 3 + 1] - img[q * 3 + 1], b = img[t * 3 + 2] - img[q * 3 + 2]
                ssd += r * r + g * g + b * b
                if ssd >= bestS { break }
            }; if ssd >= bestS { break } }
            if ssd < bestS { bestS = ssd; bs = s }
        }
        for dy in -P...P { for dx in -P...P {
            let t = (py + dy) * w + px + dx
            if !hole[t] { continue }
            let q = (bs.1 + dy) * w + bs.0 + dx
            img[t * 3] = img[q * 3]; img[t * 3 + 1] = img[q * 3 + 1]; img[t * 3 + 2] = img[q * 3 + 2]
            hole[t] = false; conf[t] = bestC
            remaining -= 1
        } }
    }
    for y in 0..<h { for x in 0..<w {
        let o = ((by0 + y) * W + (bx0 + x)) * 4
        buf[o] = UInt8(max(0, min(255, img[(y * w + x) * 3]))); buf[o + 1] = UInt8(max(0, min(255, img[(y * w + x) * 3 + 1]))); buf[o + 2] = UInt8(max(0, min(255, img[(y * w + x) * 3 + 2])))
    } }
    crop(bx0, by0, w, h, f.name + "-after")
    print(f.name, "filled in", iters, "steps")
}
save(ctx.makeImage()!, args[3])
print("saved")
