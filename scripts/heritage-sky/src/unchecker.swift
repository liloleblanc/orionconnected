import AppKit
import CoreGraphics

// Recovers alpha from a transparency-checkerboard preview.
//
// The preview is white cloud composited over a checkerboard:
//     pixel = a*white + (1-a)*bg
// and bg is a perfectly regular pattern, so it can be RECONSTRUCTED rather
// than guessed at. Then
//     a = (pixel - bg) / (white - bg)
// is exact, per pixel, and the soft edges survive intact — which keying on
// brightness would have eaten, since the cloud and the lighter checker square
// are close in tone.
//
// Cell size and the two greys are measured from the image, not assumed.

let src = CommandLine.arguments[1], out = CommandLine.arguments[2]
guard let im = NSImage(contentsOfFile: src),
      let cg = im.cgImage(forProposedRect: nil, context: nil, hints: nil) else { exit(1) }
let W = cg.width, H = cg.height
let cs = CGColorSpaceCreateDeviceRGB()
guard let ctx = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: W*4,
                          space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue),
      let p = ctx.data?.bindMemory(to: UInt8.self, capacity: W*H*4) else { exit(1) }
ctx.draw(cg, in: CGRect(x: 0, y: 0, width: W, height: H))

// the two checker greys are the two most common values in the image
var hist = [Int](repeating: 0, count: 256)
for i in stride(from: 0, to: W*H*4, by: 4) { hist[Int(p[i])] += 1 }
var order = (0..<256).sorted { hist[$0] > hist[$1] }
let g1 = order[0]
var g2 = g1
for v in order where abs(v - g1) > 6 { g2 = v; break }
let lo = Double(min(g1, g2)), hi = Double(max(g1, g2))

// cell size: walk the top row and measure the run length between grey changes
var runs: [Int] = []; var run = 1
for x in 1..<min(W, 4000) {
    let a = Int(p[(0*W + x)*4]), b = Int(p[(0*W + x - 1)*4])
    if abs(a - b) > 6 { runs.append(run); run = 1 } else { run += 1 }
}
runs = runs.filter { $0 > 3 }
let cellEst = runs.isEmpty ? 32 : runs.sorted()[runs.count/2]
// SUB-PIXEL CELL SIZE. An integer cell drifts: 164 against a true 163.84
// slides the reconstructed grid 8px across an 8192px image, and the residual
// checker that leaves is exactly the ghosting. The true size divides the
// width a whole number of times, so snap to that.
let cellsAcross = max(1.0, (Double(W) / Double(cellEst)).rounded())
let cell = Double(W) / cellsAcross

// phase: which grey sits at (0,0)
let firstIsHi = Double(p[0]) > (lo + hi) / 2

var cleared = 0
for y in 0..<H {
    for x in 0..<W {
        let i = (y*W + x)*4
        // and the two greys are only 13 apart, so a pixel sitting ON a square
        // boundary — which JPEG has blurred — must not be forced to one or the
        // other. Near a boundary the background is interpolated instead.
        let fx = Double(x) / cell, fy = Double(y) / cell
        let cxi = floor(fx), cyi = floor(fy)
        let even = (Int(cxi) + Int(cyi)) % 2 == 0
        let edgeX = min(fx - cxi, cxi + 1 - fx), edgeY = min(fy - cyi, cyi + 1 - fy)
        let soft = min(1.0, min(edgeX, edgeY) * cell / 2.5)
        let pure = (even == firstIsHi) ? hi : lo
        let bg = pure * soft + ((lo + hi) / 2) * (1 - soft)
        let v = Double(p[i]) * 0.299 + Double(p[i+1]) * 0.587 + Double(p[i+2]) * 0.114
        var a = (v - bg) / (255.0 - bg)
        a = max(0, min(1, a))
        // The two greys are only 13 levels apart, so the alpha solve has a
        // resolution of about 1/65 and JPEG noise lands right on top of it.
        // In the sheer halo that noise IS the residual checker. Anything
        // below a twentieth of opacity is cleared outright — it carries no
        // cloud worth keeping and all of the artefact.
        if a < 0.055 { a = 0; cleared += 1 } else { a = (a - 0.055) / 0.945 }
        let av = UInt8(a * 255)
        p[i] = av; p[i+1] = av; p[i+2] = av; p[i+3] = av   // premultiplied white
    }
}
guard let img = ctx.makeImage() else { exit(1) }
let rep = NSBitmapImageRep(cgImage: img)
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))
print("\(out)  \(W)x\(H)  checker cell \(cell)px  greys \(Int(lo))/\(Int(hi))  \(cleared*100/(W*H))% fully clear")
