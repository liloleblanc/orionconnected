import AppKit
// Crop (x y w h, top-down) and scale to a width, alpha preserved. args: in out x y w h outW
let a = CommandLine.arguments; let src = a[1], out = a[2]
let x = Int(a[3])!, y = Int(a[4])!, w = Int(a[5])!, h = Int(a[6])!, outW = Double(a[7])!
guard let cg = NSImage(contentsOfFile: src)?.cgImage(forProposedRect: nil, context: nil, hints: nil) else { exit(1) }
let H = cg.height
guard let c = cg.cropping(to: CGRect(x: x, y: H - y - h, width: w, height: h)) else { print("crop failed"); exit(2) }
let s = outW / Double(w); let oW = Int(outW), oH = max(1, Int((Double(h) * s).rounded()))
let ctx = CGContext(data: nil, width: oW, height: oH, bitsPerComponent: 8, bytesPerRow: oW*4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.interpolationQuality = .high; ctx.draw(c, in: CGRect(x: 0, y: 0, width: oW, height: oH))
try! NSBitmapImageRep(cgImage: ctx.makeImage()!).representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out)); print(out, oW, oH)
