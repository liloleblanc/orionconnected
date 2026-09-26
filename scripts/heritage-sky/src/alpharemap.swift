import AppKit
// a' = ((a - floor) / (1 - floor))^gamma ; colour kept proportional (premultiplied). args: in out floor gamma
let a = CommandLine.arguments; let src = a[1], out = a[2], fl = Double(a[3])!, g = Double(a[4])!
guard let cg = NSImage(contentsOfFile: src)?.cgImage(forProposedRect: nil, context: nil, hints: nil) else { exit(1) }
let W = cg.width, H = cg.height
let ctx = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: W*4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.draw(cg, in: CGRect(x: 0, y: 0, width: W, height: H))
let p = ctx.data!.bindMemory(to: UInt8.self, capacity: W*H*4)
for i in stride(from: 0, to: W*H*4, by: 4) {
  let al = Double(p[i+3]) / 255; if al <= 0 { continue }
  let na = pow(max(0, (al - fl) / (1 - fl)), g)
  let k = na / al
  for c in 0..<3 { p[i+c] = UInt8(min(255, Double(p[i+c]) * k)) }
  p[i+3] = UInt8(min(255, na * 255))
}
try! NSBitmapImageRep(cgImage: ctx.makeImage()!).representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out)); print(out)
