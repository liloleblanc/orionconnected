import AVFoundation
import AppKit

let args = CommandLine.arguments
guard args.count >= 3 else { print("usage: grabframes <movie> <outdir> [times...]"); exit(1) }
let url = URL(fileURLWithPath: args[1])
let outDir = args[2]
let times: [Double] = args.count > 3 ? args[3...].compactMap { Double($0) } : [2, 6, 10, 14]

let asset = AVURLAsset(url: url)
let gen = AVAssetImageGenerator(asset: asset)
gen.appliesPreferredTrackTransform = true
gen.requestedTimeToleranceBefore = .zero
gen.requestedTimeToleranceAfter = .zero

for t in times {
    let cmt = CMTime(seconds: t, preferredTimescale: 600)
    do {
        let cg = try gen.copyCGImage(at: cmt, actualTime: nil)
        let rep = NSBitmapImageRep(cgImage: cg)
        guard let data = rep.representation(using: .png, properties: [:]) else { continue }
        let out = "\(outDir)/frame_\(String(format: "%05.2f", t)).png"
        try data.write(to: URL(fileURLWithPath: out))
        print("\(out)  \(cg.width)x\(cg.height)")
    } catch {
        print("failed at \(t): \(error.localizedDescription)")
    }
}
