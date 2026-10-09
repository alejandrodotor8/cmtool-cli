// Convierte assets/icon.svg en assets/icon.png (1024×1024, fondo transparente) con AppKit.
// Solo hace falta si cambias el SVG: swift scripts/render-icon.swift
import AppKit

let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
let svg = root.appendingPathComponent("assets/icon.svg")
let png = root.appendingPathComponent("assets/icon.png")

guard let image = NSImage(contentsOf: svg) else { fatalError("No pude leer \(svg.path)") }
let size = 1024
guard let bitmap = NSBitmapImageRep(
  bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4,
  hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0
) else { fatalError("No pude crear la imagen") }

NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
image.draw(in: NSRect(x: 0, y: 0, width: size, height: size))
NSGraphicsContext.restoreGraphicsState()

try! bitmap.representation(using: .png, properties: [:])!.write(to: png)
print("Listo: \(png.path)")
