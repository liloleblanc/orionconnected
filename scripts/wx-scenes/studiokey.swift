// The generator for the studio set (fids-current/logos/Backgrounds/wx-studio-set.png):
// cuts one frame of the licensed green-screen studio clip the way the board shows
// it (cover into 976 x 857), keys the monitor's green to transparency and prints
// the screen's rectangle — the same percentages the CSS places the scene loop in.
//
//   swiftc -O -o studiokey studiokey.swift && ./studiokey <clip.mp4> <seconds> <tag>
//
// The source clip is not in the repository (Vecteezy Pro licence); the PNG is.
import AVFoundation
import AppKit
// Cut the studio frame the way the board shows it (cover into 976x857), find
// the monitor's green screen, and write (a) the frame with the green replaced
// by opaque navy, (b) a debug copy with the rect outlined.
let src = CommandLine.arguments[1]; let t = Double(CommandLine.arguments[2])!; let tag = CommandLine.arguments[3]
let PW = 976, PH = 857
let a = AVURLAsset(url: URL(fileURLWithPath: src))
let g = AVAssetImageGenerator(asset: a); g.appliesPreferredTrackTransform = true
g.requestedTimeToleranceBefore = .zero; g.requestedTimeToleranceAfter = .zero
let cg = try! g.copyCGImage(at: CMTime(seconds: t, preferredTimescale: 600), actualTime: nil)
let W = CGFloat(cg.width), H = CGFloat(cg.height)
let aspect = CGFloat(PW)/CGFloat(PH)
var cw = W, ch = H
if W/H > aspect { cw = H*aspect } else { ch = W/aspect }
let crop = cg.cropping(to: CGRect(x: (W-cw)/2, y: (H-ch)/2, width: cw, height: ch))!
let cs = CGColorSpaceCreateDeviceRGB(); let rb = PW*4
var buf = [UInt8](repeating: 0, count: rb*PH)
buf.withUnsafeMutableBytes { raw in
  let c = CGContext(data: raw.baseAddress, width: PW, height: PH, bitsPerComponent: 8, bytesPerRow: rb, space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  c.interpolationQuality = .high
  c.draw(crop, in: CGRect(x: 0, y: 0, width: PW, height: PH))
}
// green mask + bbox (rows are bottom-up in the CGContext buffer; convert to top-left y)
var minX = PW, maxX = -1, minY = PH, maxY = -1, n = 0
var rowCount = [Int](repeating: 0, count: PH)
for y in 0..<PH { for x in 0..<PW {
  let p = y*rb + x*4; let r = Int(buf[p]), gg = Int(buf[p+1]), b = Int(buf[p+2])
  if gg > r + 40 && gg > b + 40 && gg > 90 { n += 1; rowCount[y] += 1; if x<minX {minX=x}; if x>maxX {maxX=x}; if y<minY {minY=y}; if y>maxY {maxY=y} }
}}
let top = PH-1-maxY, bottom = PH-1-minY
print(String(format: "t=%.1f  source %dx%d  crop %.0fx%.0f  green px %d (%.1f%%)", t, cg.width, cg.height, cw, ch, n, Double(n)*100/Double(PW*PH)))
print("green bbox (top-left space): x \(minX)…\(maxX)  y \(top)…\(bottom)  → w \(maxX-minX+1) h \(bottom-top+1)  aspect \(String(format: "%.3f", Double(maxX-minX+1)/Double(bottom-top+1)))")
// fill of bbox by green (is it a clean rectangle?)
let fill = Double(n) / Double((maxX-minX+1)*(bottom-top+1))
print(String(format: "bbox fill by green: %.1f%% (100%% = perfect rectangle)", fill*100))
// key the green out (alpha), despill the fringe
var out = buf
for y in 0..<PH { for x in 0..<PW {
  let p = y*rb + x*4; let r = Int(out[p]), gg = Int(out[p+1]), b = Int(out[p+2])
  if gg > r + 40 && gg > b + 40 && gg > 90 { out[p]=0; out[p+1]=0; out[p+2]=0; out[p+3]=0 }
}}
func write(_ bytes: [UInt8], _ path: String, outline: Bool) {
  var bb = bytes
  bb.withUnsafeMutableBytes { raw in
    let c = CGContext(data: raw.baseAddress, width: PW, height: PH, bitsPerComponent: 8, bytesPerRow: rb, space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    if outline { c.setStrokeColor(CGColor(red: 1, green: 0.2, blue: 0.2, alpha: 1)); c.setLineWidth(3)
      c.stroke(CGRect(x: minX, y: minY, width: maxX-minX+1, height: maxY-minY+1)) }
    let img = c.makeImage()!
    let rep = NSBitmapImageRep(cgImage: img)
    let data = rep.representation(using: path.hasSuffix(".jpg") ? .jpeg : .png, properties: [.compressionFactor: 0.92])!
    try! data.write(to: URL(fileURLWithPath: path))
  }
}
write(out, "studio-set-\(tag).png", outline: false)
write(out, "studio-set-\(tag)-debug.jpg", outline: true)
