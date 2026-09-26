import AppKit
import CoreGraphics

// Splits a sheet of isolated clouds into one file per cloud.
//
// Connected components on the alpha channel would shatter a ragged wispy
// cluster into dozens of fragments, which is the opposite of useful — those
// fragments ARE one cloud. So components are found first, then merged when
// their bounding boxes come within a proximity margin of each other, which
// regroups a torn cloud into a single element while keeping genuinely
// separate clouds apart.

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
guard let src = argS("src"), let outDir = argS("outdir"), let prefix = argS("prefix") else {
    print("usage: segment --src sheet.webp --outdir dir --prefix c --margin 0.04"); exit(1)
}
let margin = arg("margin", 0.04)          // proximity as a fraction of the long edge
let minArea = arg("minArea", 0.0006)      // drop specks below this fraction of the sheet
let alphaCut = UInt8(arg("alphaCut", 14))

guard let img = NSImage(contentsOfFile: src),
      let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    print("cannot read \(src)"); exit(1)
}
let W = cg.width, H = cg.height
let cs = CGColorSpaceCreateDeviceRGB()
guard let ctx = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: W * 4,
                          space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue),
      let buf = ctx.data else { exit(1) }
ctx.draw(cg, in: CGRect(x: 0, y: 0, width: W, height: H))
let p = buf.bindMemory(to: UInt8.self, capacity: W * H * 4)

// Grouping is done on a DILATED mask, not on bounding boxes. Boxes were the
// wrong tool: on a sheet where one cloud sits above and slightly overlapping
// another's box, box-overlap merges two clouds that never touch. Dilating the
// mask by a few pixels bridges the gaps inside a single torn cloud and nothing
// else, so ragged wisps regroup while separate clouds stay separate.
// The dilation is separable with prefix sums, so it stays O(W*H).
let r = Int(arg("dilate", 0.012) * Double(max(W, H)))
var opaque = [UInt8](repeating: 0, count: W * H)
for i in 0..<(W * H) { opaque[i] = p[i * 4 + 3] > alphaCut ? 1 : 0 }

func dilate(_ mask: [UInt8], _ rad: Int) -> [UInt8] {
    if rad <= 0 { return mask }
    var tmp = [UInt8](repeating: 0, count: W * H)
    for y in 0..<H {                                  // horizontal pass
        var run = [Int](repeating: 0, count: W + 1)
        for x in 0..<W { run[x + 1] = run[x] + Int(mask[y * W + x]) }
        for x in 0..<W {
            let a = max(0, x - rad), b = min(W - 1, x + rad)
            tmp[y * W + x] = (run[b + 1] - run[a]) > 0 ? 1 : 0
        }
    }
    var out = [UInt8](repeating: 0, count: W * H)
    for x in 0..<W {                                  // vertical pass
        var run = [Int](repeating: 0, count: H + 1)
        for y in 0..<H { run[y + 1] = run[y] + Int(tmp[y * W + x]) }
        for y in 0..<H {
            let a = max(0, y - rad), b = min(H - 1, y + rad)
            out[y * W + x] = (run[b + 1] - run[a]) > 0 ? 1 : 0
        }
    }
    return out
}
let grown = dilate(opaque, r)

var parent = [Int](repeating: -1, count: W * H)
func find(_ a: Int) -> Int { var x = a; while parent[x] != x { parent[x] = parent[parent[x]]; x = parent[x] }; return x }
func union(_ a: Int, _ b: Int) { let ra = find(a), rb = find(b); if ra != rb { parent[rb] = ra } }
for i in 0..<(W * H) { if grown[i] == 1 { parent[i] = i } }
for y in 0..<H {
    for x in 0..<W {
        let i = y * W + x
        if parent[i] == -1 { continue }
        for (dx, dy) in [(1, 0), (0, 1), (1, 1), (-1, 1)] {
            let nx = x + dx, ny = y + dy
            if nx < 0 || nx >= W || ny < 0 || ny >= H { continue }
            let j = ny * W + nx
            if parent[j] != -1 { union(i, j) }
        }
    }
}
// Boxes are measured on the ORIGINAL pixels, so the dilation groups without
// padding the crop.
struct Box { var x0: Int; var y0: Int; var x1: Int; var y1: Int; var n: Int }
var boxes: [Int: Box] = [:]
for y in 0..<H { for x in 0..<W {
    let i = y * W + x
    if opaque[i] == 0 { continue }
    let root = find(i)
    if var b = boxes[root] {
        b.x0 = min(b.x0, x); b.y0 = min(b.y0, y); b.x1 = max(b.x1, x); b.y1 = max(b.y1, y); b.n += 1
        boxes[root] = b
    } else { boxes[root] = Box(x0: x, y0: y, x1: x, y1: y, n: 1) }
} }
var list = boxes.values.filter { Double($0.n) / Double(W * H) >= minArea }
list.sort { ($0.x1 - $0.x0) * ($0.y1 - $0.y0) > ($1.x1 - $1.x0) * ($1.y1 - $1.y0) }

var idx = 0
for b in list {
    idx += 1
    let pad = 6
    let x0 = max(0, b.x0 - pad), y0 = max(0, b.y0 - pad)
    let x1 = min(W - 1, b.x1 + pad), y1 = min(H - 1, b.y1 + pad)
    let w = x1 - x0 + 1, h = y1 - y0 + 1
    // Render the box rather than CGImage.cropping. The analysis buffer and this
    // context are both bottom-up, so translating the full image by -x0,-y0
    // reproduces exactly the region that was measured — no coordinate flip to
    // get wrong, which is what was clipping elements into hard rectangles.
    guard let oc = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8,
                             bytesPerRow: w * 4, space: cs,
                             bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { continue }
    oc.interpolationQuality = .high
    oc.draw(cg, in: CGRect(x: -x0, y: -y0, width: W, height: H))
    // Feather the crop border — but ONLY on edges the cloud actually reaches.
    //
    // A blanket ramp on all four sides is a rectangular vignette, and on a
    // large soft element that vignette IS what you see: a faint rectangle
    // floating in the sky. The ramp exists to hide a cloud SLICED by a tight
    // box, so it is only needed where alpha is still high at the border.
    // Each edge is measured and left alone when the element already fades out
    // by itself.
    if let bp = oc.data?.bindMemory(to: UInt8.self, capacity: w * h * 4) {
        let probe = max(1, min(w, h) / 50)
        var edgeMax = [0, 0, 0, 0]                    // left, right, top, bottom
        for y in 0..<h { for d in 0..<probe {
            edgeMax[0] = max(edgeMax[0], Int(bp[(y * w + d) * 4 + 3]))
            edgeMax[1] = max(edgeMax[1], Int(bp[(y * w + (w - 1 - d)) * 4 + 3]))
        } }
        for x in 0..<w { for d in 0..<probe {
            edgeMax[2] = max(edgeMax[2], Int(bp[(d * w + x) * 4 + 3]))
            edgeMax[3] = max(edgeMax[3], Int(bp[((h - 1 - d) * w + x) * 4 + 3]))
        } }
        let cut = 26                                   // below this the cloud has faded on its own
        let fL = edgeMax[0] > cut, fR = edgeMax[1] > cut
        let fT = edgeMax[2] > cut, fB = edgeMax[3] > cut
        if fL || fR || fT || fB {
            // ELLIPTICAL, not rectangular. A ramp on four straight edges is a
            // rectangle, and on a large soft cloud that rectangle is exactly
            // what you see floating in the sky — the straight boundary is the
            // tell, not the fade. An elliptical falloff has no straight edge
            // anywhere, so a cut-off element loses its corners instead of
            // announcing its box.
            let cx = Double(w - 1) / 2, cy = Double(h - 1) / 2
            let inner = 0.86                     // untouched out to 86% of the radius
            for y in 0..<h {
                let ny = (Double(y) - cy) / max(1, cy)
                for x in 0..<w {
                    let nx = (Double(x) - cx) / max(1, cx)
                    let r = sqrt(nx * nx + ny * ny)
                    if r <= inner { continue }
                    var t = (1.0 - r) / (1.0 - inner)      // 1 at inner, 0 at the ellipse
                    t = max(0, min(1, t))
                    let k = t * t * (3 - 2 * t)
                    let i = (y * w + x) * 4
                    bp[i] = UInt8(Double(bp[i]) * k); bp[i+1] = UInt8(Double(bp[i+1]) * k)
                    bp[i+2] = UInt8(Double(bp[i+2]) * k); bp[i+3] = UInt8(Double(bp[i+3]) * k)
                }
            }
            FileHandle.standardError.write("    feathered edges L\(fL ? 1:0) R\(fR ? 1:0) T\(fT ? 1:0) B\(fB ? 1:0)\n".data(using: .utf8)!)
        }
    }
    guard let sub = oc.makeImage() else { continue }
    let rep = NSBitmapImageRep(cgImage: sub)
    let out = "\(outDir)/\(prefix)\(String(format: "%02d", idx)).png"
    if let d = rep.representation(using: .png, properties: [:]) {
        try? d.write(to: URL(fileURLWithPath: out))
        print("\(out)  \(w)x\(h)  (\(b.n) px)")
    }
}
print("\(list.count) element(s) from \(src)")
