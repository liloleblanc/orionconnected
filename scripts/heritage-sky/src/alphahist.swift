import AppKit
import CoreGraphics
let path = CommandLine.arguments[1]
guard let im = NSImage(contentsOfFile: path),
      let cg = im.cgImage(forProposedRect: nil, context: nil, hints: nil) else { exit(1) }
let W = min(cg.width, 900), H = max(1, cg.height * W / max(1, cg.width))
let cs = CGColorSpaceCreateDeviceRGB()
guard let c = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: W*4,
                        space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { exit(1) }
c.draw(cg, in: CGRect(x: 0, y: 0, width: W, height: H))
guard let p = c.data?.bindMemory(to: UInt8.self, capacity: W*H*4) else { exit(1) }
var buckets = [Int](repeating: 0, count: 9)
// corner sample: the four 3% corners should be empty sky
var cornerMax = 0
let cw = max(1, W/33), ch = max(1, H/33)
for y in 0..<ch { for x in 0..<cw {
    for (xx,yy) in [(x,y),(W-1-x,y),(x,H-1-y),(W-1-x,H-1-y)] {
        cornerMax = max(cornerMax, Int(p[(yy*W+xx)*4+3])) } } }
for i in stride(from: 0, to: W*H*4, by: 4) {
    let a = Int(p[i+3])
    let b = a == 0 ? 0 : (a < 4 ? 1 : (a < 8 ? 2 : (a < 14 ? 3 : (a < 26 ? 4 : (a < 60 ? 5 : (a < 120 ? 6 : (a < 220 ? 7 : 8)))))))
    buckets[b] += 1
}
let tot = Double(W*H)
let names = ["0","1-3","4-7","8-13","14-25","26-59","60-119","120-219","220+"]
var out = "\((path as NSString).lastPathComponent)  cornerMaxAlpha=\(cornerMax)  "
for (i,n) in names.enumerated() { if buckets[i] > 0 { out += "\(n):\(String(format: "%.1f", Double(buckets[i])/tot*100))% " } }
print(out)
