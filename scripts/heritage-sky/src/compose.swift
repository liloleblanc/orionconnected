import AppKit
import CoreGraphics

// Builds a tileable cloud strip by PLACING isolated cloud elements, rather than
// cropping a rectangle out of a photograph of a sky.
//
// This is the difference that matters. A crop inherits whatever density and
// arrangement the photographer happened to have; placement lets each cloud be
// positioned, scaled, flipped and faded on purpose, which is how the shipped
// textures were evidently made and why they stack cleanly five deep.
//
// Tiling is handled by drawing every element TWICE, offset by exactly one strip
// width. Anything crossing the right edge reappears at the left, so the strip
// wraps with no mirror and no seam.
//
// Placement spec: "file,xFrac,yFrac,scale,flip,alpha" separated by ';'
//   xFrac/yFrac  0..1 position of the element's centre within the strip
//   scale        element height as a fraction of strip height
//   flip         1 to mirror horizontally (stops repeats reading as repeats)
//   alpha        0..1

func arg(_ n: String, _ d: Double) -> Double {
    guard let i = CommandLine.arguments.firstIndex(of: "--" + n), i + 1 < CommandLine.arguments.count,
          let v = Double(CommandLine.arguments[i + 1]) else { return d }
    return v
}
func argS(_ n: String) -> String? {
    guard let i = CommandLine.arguments.firstIndex(of: "--" + n), i + 1 < CommandLine.arguments.count
    else { return nil }
    return CommandLine.arguments[i + 1]
}
guard let spec = argS("place"), let outPath = argS("out") else {
    print("usage: compose --place 'c01.webp,0.2,0.6,0.8,0,1' --out o.png --outW 1250 --outH 260"); exit(1)
}
let outW = Int(arg("outW", 1250)), outH = Int(arg("outH", 260))
let fTop = arg("featherTop", 0.0), fBot = arg("featherBot", 0.0)

let cs = CGColorSpaceCreateDeviceRGB()
guard let ctx = CGContext(data: nil, width: outW, height: outH, bitsPerComponent: 8,
                          bytesPerRow: outW * 4, space: cs,
                          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { exit(1) }
ctx.interpolationQuality = .high
ctx.setBlendMode(.normal)

var cache: [String: CGImage] = [:]
for item in spec.split(separator: ";").map(String.init) {
    let f = item.split(separator: ",").map(String.init)
    guard f.count >= 6 else { continue }
    let path = f[0]
    let xF = Double(f[1]) ?? 0.5, yF = Double(f[2]) ?? 0.5
    let sc = Double(f[3]) ?? 0.8, flip = (Double(f[4]) ?? 0) > 0.5, al = Double(f[5]) ?? 1

    var cg = cache[path]
    if cg == nil {
        guard let im = NSImage(contentsOfFile: path),
              let c = im.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
            print("cannot read \(path)"); exit(1)
        }
        cg = c; cache[path] = c
    }
    let src = cg!
    let h = Double(outH) * sc
    let w = h * Double(src.width) / Double(src.height)
    let cx = xF * Double(outW), cy = yF * Double(outH)

    // draw at the position AND one strip-width either side, so it wraps
    for off in [-Double(outW), 0, Double(outW)] {
        let rect = CGRect(x: cx + off - w/2, y: cy - h/2, width: w, height: h)
        if rect.maxX < -1 || rect.minX > Double(outW) + 1 { continue }
        ctx.saveGState()
        ctx.setAlpha(CGFloat(al))
        if flip {
            ctx.translateBy(x: rect.midX, y: 0); ctx.scaleBy(x: -1, y: 1)
            ctx.draw(src, in: CGRect(x: -w/2, y: rect.minY, width: w, height: h))
        } else {
            ctx.draw(src, in: rect)
        }
        ctx.restoreGState()
    }
}

// HAZE. The reference sky is high-key and low-contrast: cloud barely separates
// from air. Ours read as cut-outs because they are too punchy. This lifts the
// blacks and pulls contrast and saturation toward a pale flat value on the
// PIXELS, which CSS opacity cannot do - opacity dims a cloud, it does not
// flatten it. Applied premultiplied, so alpha is the scale for each channel.
let haze = arg("haze", 0.0)
// WHITEN lifts the artwork toward white so a near cloud reads as lit rather
// than as a grey shape; haze cannot do this because it blends toward the sky.
let whiten = arg("whiten", 0.0)
if (haze > 0 || whiten > 0), let p = ctx.data?.bindMemory(to: UInt8.self, capacity: outW * outH * 4) {
    for i in stride(from: 0, to: outW * outH * 4, by: 4) {
        let a = Double(p[i+3]) / 255.0
        if a <= 0 { continue }
        for c in 0..<3 {
            let v = Double(p[i+c]) / 255.0 / a          // un-premultiply
            var lifted = v * (1 - haze * 0.55) + haze * 0.55   // toward white
            lifted = lifted * (1 - whiten) + whiten
            p[i+c] = UInt8(max(0, min(255, lifted * a * 255)))
        }
    }
}
// Optional softening, so depth comes from focus and not only from size.
let blurR = Int(arg("blur", 0))
if blurR > 0, let p = ctx.data?.bindMemory(to: UInt8.self, capacity: outW * outH * 4) {
    var src = [UInt8](repeating: 0, count: outW * outH * 4)
    for i in 0..<(outW * outH * 4) { src[i] = p[i] }
    for y in 0..<outH {
        for x in 0..<outW {
            var acc = [Double](repeating: 0, count: 4); var n = 0.0
            for dy in -blurR...blurR {
                let yy = y + dy; if yy < 0 || yy >= outH { continue }
                for dx in -blurR...blurR {
                    var xx = x + dx
                    xx = ((xx % outW) + outW) % outW        // wrap, so tiling survives
                    let j = (yy * outW + xx) * 4
                    for c in 0..<4 { acc[c] += Double(src[j+c]) }
                    n += 1
                }
            }
            let i = (y * outW + x) * 4
            for c in 0..<4 { p[i+c] = UInt8(max(0, min(255, acc[c] / n))) }
        }
    }
}
// optional vertical feather so the band has no hard top/bottom edge
if fTop > 0 || fBot > 0, let p = ctx.data?.bindMemory(to: UInt8.self, capacity: outW * outH * 4) {
    for y in 0..<outH {
        let vY = Double(y) / Double(outH - 1)
        var fade = 1.0
        if fBot > 0, vY < fBot { fade *= vY / fBot }
        if fTop > 0, vY > 1 - fTop { fade *= (1 - vY) / fTop }
        if fade >= 1 { continue }
        for x in 0..<outW {
            let i = (y * outW + x) * 4
            p[i]   = UInt8(Double(p[i])   * fade)
            p[i+1] = UInt8(Double(p[i+1]) * fade)
            p[i+2] = UInt8(Double(p[i+2]) * fade)
            p[i+3] = UInt8(Double(p[i+3]) * fade)
        }
    }
}
guard let final = ctx.makeImage() else { exit(1) }
let rep = NSBitmapImageRep(cgImage: final)
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: outPath))
print("\(outPath)  \(outW)x\(outH)")
