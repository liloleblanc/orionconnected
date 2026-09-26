import AppKit
import CoreGraphics

// Carries a livery stripe across a nacelle the original artwork left white.
//
// It does NOT flood a rectangle of colour on. For each row it reads the hue
// from a reference column on the painted nacelle and re-applies it at the
// TARGET pixel's own luminance, so the cowling's highlight and shadow survive
// and the stripe curves with the metal instead of sitting flat on top of it.
// Only near-neutral pixels are touched, so panel lines and the dark intake
// stay as they are.

func arg(_ n: String, _ d: Double) -> Double {
    guard let i = CommandLine.arguments.firstIndex(of: "--" + n), i + 1 < CommandLine.arguments.count,
          let v = Double(CommandLine.arguments[i + 1]) else { return d }
    return v
}
func argS(_ n: String) -> String? {
    guard let i = CommandLine.arguments.firstIndex(of: "--" + n), i + 1 < CommandLine.arguments.count
    else { return nil } ; return CommandLine.arguments[i + 1]
}
guard let src = argS("src"), let out = argS("out") else { print("usage"); exit(1) }
guard let im = NSImage(contentsOfFile: src),
      let cg = im.cgImage(forProposedRect: nil, context: nil, hints: nil) else { print("read fail"); exit(1) }
let W = cg.width, H = cg.height
let cs = CGColorSpaceCreateDeviceRGB()
guard let ctx = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: W * 4,
                          space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue),
      let p = ctx.data?.bindMemory(to: UInt8.self, capacity: W * H * 4) else { exit(1) }
ctx.draw(cg, in: CGRect(x: 0, y: 0, width: W, height: H))

// image coords are top-left in the arguments; the buffer is bottom-up
let x0 = Int(arg("xFrom", 0)), x1 = Int(arg("xTo", 0))
let yT = Int(arg("yTop", 0)), yB = Int(arg("yBot", 0))
let refX = Int(arg("refX", 0))
let satMin = arg("satMin", 0.16)        // a ref pixel must be coloured to count
let neutralMax = arg("neutralMax", 0.14) // a target pixel must be near-neutral
let whiteRef = arg("whiteRef", 243)      // the cowling white being replaced
// Only the WHITE cowling gets painted. The intake lip and the fan ring are
// silver — neutral, so a saturation test alone lets them through, but much
// darker than the cowling. A luminance floor is what separates them.
let lumMin = arg("lumMin", 205)

// A CGBitmapContext stores row 0 at the TOP of the rendered image, so an
// image-space y indexes straight in. Flipping it here is what produced a
// zero-pixel pass: the "reference" rows were sampled off the other end of the
// aeroplane entirely.
func idx(_ x: Int, _ yTop: Int) -> Int { (yTop * W + x) * 4 }
func lum(_ i: Int) -> Double { (Double(p[i]) * 0.299 + Double(p[i+1]) * 0.587 + Double(p[i+2]) * 0.114) }
func sat(_ i: Int) -> Double {
    let r = Double(p[i]), g = Double(p[i+1]), b = Double(p[i+2])
    let mx = max(r, max(g, b)), mn = min(r, min(g, b))
    return mx <= 0 ? 0 : (mx - mn) / mx
}

var painted = 0
for y in yT...yB {
    let ri = idx(refX, y)
    if p[ri+3] < 250 { continue }
    if sat(ri) < satMin { continue }               // reference row is not on the stripe
    _ = lum(ri)
    let rr = Double(p[ri]), rg = Double(p[ri+1]), rb = Double(p[ri+2])
    for x in x0...x1 {
        let i = idx(x, y)
        if p[i+3] < 250 { continue }               // don't paint the background
        if sat(i) > neutralMax { continue }        // already coloured — leave it
        if lum(i) < lumMin { continue }            // silver intake / fan ring, not cowling
        // Shading is measured against the UNPAINTED WHITE, not against the
        // reference red. Dividing white (~243) by red (~90) gives 2.7 and
        // blows the stripe out to pink; dividing by the white it is replacing
        // gives ~1.0 on flat cowling and correctly darkens in shadow.
        let k = min(1.12, max(0.55, lum(i) / whiteRef))
        p[i]   = UInt8(max(0, min(255, rr * k)))
        p[i+1] = UInt8(max(0, min(255, rg * k)))
        p[i+2] = UInt8(max(0, min(255, rb * k)))
        painted += 1
    }
}
guard let img = ctx.makeImage() else { exit(1) }
let rep = NSBitmapImageRep(cgImage: img)
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))
print("\(out)  \(painted) px painted  rows \(yT)..\(yB)  cols \(x0)..\(x1)  ref \(refX)")
