import AppKit
// White cloud on a dark ground: alpha = smoothstep(lo..hi) of luminance; colour white, premultiplied. args: in out lo hi
let a = CommandLine.arguments; let src = a[1], out = a[2], lo = Double(a[3])!, hi = Double(a[4])!
guard let cg = NSImage(contentsOfFile: src)?.cgImage(forProposedRect: nil, context: nil, hints: nil) else { exit(1) }
let W = cg.width, H = cg.height
let ctx = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: W*4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.draw(cg, in: CGRect(x: 0, y: 0, width: W, height: H))
let p = ctx.data!.bindMemory(to: UInt8.self, capacity: W*H*4)
for i in stride(from: 0, to: W*H*4, by: 4) {
  let L = 0.299*Double(p[i]) + 0.587*Double(p[i+1]) + 0.114*Double(p[i+2])
  var t = (L - lo) / (hi - lo); t = max(0, min(1, t)); let al = t*t*(3 - 2*t)
  let v = UInt8(al * 255); p[i] = v; p[i+1] = v; p[i+2] = v; p[i+3] = v
}
try! NSBitmapImageRep(cgImage: ctx.makeImage()!).representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out)); print(out, W, H)
