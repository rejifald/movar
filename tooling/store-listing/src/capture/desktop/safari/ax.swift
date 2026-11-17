// Accessibility + window helper for the Safari desktop capture (macOS only).
// Compiled once per run by safari.ts (`swiftc -O ax.swift -o <cache>/movar-ax`);
// every subcommand prints ONE JSON object on stdout and exits non-zero on failure.
//
//   movar-ax windows <bundleId>
//       on-screen layer-0 windows of the app: [{id, x, y, width, height}]
//   movar-ax snapshot <bundleId>
//       front window frame, its AXWebArea frame, and every text the web area
//       exposes (AXTitle / AXDescription / AXValue) — what the shot asserts on
//   movar-ax act <bundleId> --action press|select|read|ensure-on|ensure-off
//       [--role R] [--match REGEX] [--identifier ID]
//       [--in-role R --in-match REGEX] [--last]
//       find ONE element (optionally inside the first container, by role or
//       subrole, whose subtree text matches) and act on it; `read` only reports
//       its AXValue
//   movar-ax fit <bundleId> <x> <y> <width> <height>
//       close every other standard window, then move/size the main one and
//       raise it (no AppleEvents: Safari's Automation consent never comes up)
//   movar-ax onscreen
//       every on-screen window of any app: [{owner, name, id, layer}] — finds a
//       system prompt (e.g. a TCC consent dialog) that would block the run
//   movar-ax dump <bundleId>
//       the whole tree of the front window as indented text (debug artifact)
//
// Reading another app's AX tree needs the Accessibility permission for the
// calling process; GitHub's macOS runners grant it to the shell.
import AppKit
import ApplicationServices
import CoreGraphics
import Foundation

func fail(_ message: String) -> Never {
    FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
    exit(1)
}

func emit(_ object: Any) {
    guard JSONSerialization.isValidJSONObject(object),
        let data = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
    else { fail("unserialisable output") }
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write("\n".data(using: .utf8)!)
}

func app(_ bundleId: String) -> NSRunningApplication {
    guard let running = NSRunningApplication.runningApplications(withBundleIdentifier: bundleId).first
    else { fail("\(bundleId) is not running") }
    return running
}

func attr(_ element: AXUIElement, _ name: String) -> AnyObject? {
    var value: AnyObject?
    let error = AXUIElementCopyAttributeValue(element, name as CFString, &value)
    return error == .success ? value : nil
}

func string(_ element: AXUIElement, _ name: String) -> String? {
    attr(element, name) as? String
}

func children(_ element: AXUIElement) -> [AXUIElement] {
    (attr(element, kAXChildrenAttribute) as? [AXUIElement]) ?? []
}

func role(_ element: AXUIElement) -> String { string(element, kAXRoleAttribute) ?? "" }

func frame(_ element: AXUIElement) -> [String: Double]? {
    guard let pos = attr(element, kAXPositionAttribute), let size = attr(element, kAXSizeAttribute)
    else { return nil }
    var point = CGPoint.zero
    var extent = CGSize.zero
    // swiftlint:disable:next force_cast
    AXValueGetValue(pos as! AXValue, .cgPoint, &point)
    // swiftlint:disable:next force_cast
    AXValueGetValue(size as! AXValue, .cgSize, &extent)
    return ["x": point.x, "y": point.y, "width": extent.width, "height": extent.height]
}

/// Every text an element carries for a reader: title, description, string value, identifier.
func labels(_ element: AXUIElement) -> [String] {
    [kAXTitleAttribute, kAXDescriptionAttribute, kAXValueAttribute, kAXHelpAttribute, "AXIdentifier"]
        .compactMap { string(element, $0) }
        .filter { !$0.isEmpty }
}

let nodeBudget = 20_000

/// Depth-first walk, bounded so a runaway tree cannot hang the capture.
func walk(_ root: AXUIElement, _ visit: (AXUIElement, Int) -> Bool) {
    var stack: [(AXUIElement, Int)] = [(root, 0)]
    var seen = 0
    while let (element, depth) = stack.popLast(), seen < nodeBudget {
        seen += 1
        if !visit(element, depth) { return }
        if depth < 80 {
            for child in children(element).reversed() { stack.append((child, depth + 1)) }
        }
    }
}

func subtreeText(_ root: AXUIElement) -> String {
    var parts: [String] = []
    walk(root) { element, _ in
        parts.append(contentsOf: labels(element))
        return parts.count < 400
    }
    return parts.joined(separator: " ")
}

func frontWindow(_ appElement: AXUIElement) -> AXUIElement {
    if let main = attr(appElement, kAXMainWindowAttribute) {
        // swiftlint:disable:next force_cast
        return main as! AXUIElement
    }
    if let first = (attr(appElement, kAXWindowsAttribute) as? [AXUIElement])?.first { return first }
    fail("no window")
}

func regex(_ pattern: String?) -> NSRegularExpression? {
    guard let pattern else { return nil }
    do { return try NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) } catch {
        fail("bad regex \(pattern)")
    }
}

func matches(_ re: NSRegularExpression, _ text: String) -> Bool {
    re.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) != nil
}

struct Options {
    var action = "press"
    var role: String?
    var match: String?
    var identifier: String?
    var inRole: String?
    var inMatch: String?
    var last = false
}

func parseOptions(_ args: ArraySlice<String>) -> Options {
    var options = Options()
    var iterator = args.makeIterator()
    while let flag = iterator.next() {
        switch flag {
        case "--last": options.last = true
        case "--action": options.action = iterator.next() ?? ""
        case "--role": options.role = iterator.next()
        case "--match": options.match = iterator.next()
        case "--identifier": options.identifier = iterator.next()
        case "--in-role": options.inRole = iterator.next()
        case "--in-match": options.inMatch = iterator.next()
        default: fail("unknown flag \(flag)")
        }
    }
    return options
}

func find(_ root: AXUIElement, _ options: Options) -> AXUIElement? {
    var scope = root
    if let inRole = options.inRole {
        let inRe = regex(options.inMatch)
        var container: AXUIElement?
        walk(root) { element, _ in
            // A role or a subrole (`AXDialog`, `AXSystemDialog`) names the container.
            let kind = role(element) == inRole || string(element, kAXSubroleAttribute) == inRole
            if kind, inRe.map({ matches($0, subtreeText(element)) }) ?? true {
                container = element
                return false
            }
            return true
        }
        guard let found = container else { return nil }
        scope = found
    }
    let re = regex(options.match)
    var hits: [AXUIElement] = []
    walk(scope) { element, _ in
        if let wanted = options.role, role(element) != wanted { return true }
        if let id = options.identifier, string(element, "AXIdentifier") != id { return true }
        if let re, !labels(element).contains(where: { matches(re, $0) }) { return true }
        hits.append(element)
        return options.last || hits.isEmpty
    }
    return options.last ? hits.last : hits.first
}

func numericValue(_ element: AXUIElement) -> Int? {
    if let number = attr(element, kAXValueAttribute) as? NSNumber { return number.intValue }
    return nil
}

func act(_ bundleId: String, _ options: Options) {
    let running = app(bundleId)
    let appElement = AXUIElementCreateApplication(running.processIdentifier)
    guard let element = find(appElement, options) else {
        fail("no element for role=\(options.role ?? "*") match=\(options.match ?? "*") id=\(options.identifier ?? "*") in=\(options.inMatch ?? "*")")
    }
    let before = numericValue(element)
    var performed = false
    switch options.action {
    case "read": break
    case "press":
        performed = AXUIElementPerformAction(element, kAXPressAction as CFString) == .success
    case "select":
        performed =
            AXUIElementSetAttributeValue(element, kAXSelectedAttribute as CFString, kCFBooleanTrue) == .success
    case "ensure-on", "ensure-off":
        let want = options.action == "ensure-on" ? 1 : 0
        if before != want {
            performed = AXUIElementPerformAction(element, kAXPressAction as CFString) == .success
        }
    default: fail("unknown action \(options.action)")
    }
    Thread.sleep(forTimeInterval: 0.4)
    emit([
        "role": role(element), "labels": labels(element), "performed": performed,
        "before": before.map { $0 as Any } ?? NSNull(), "after": numericValue(element).map { $0 as Any } ?? NSNull(),
    ])
}

func snapshot(_ bundleId: String) {
    let running = app(bundleId)
    let window = frontWindow(AXUIElementCreateApplication(running.processIdentifier))
    var webArea: AXUIElement?
    walk(window) { element, _ in
        if role(element) == "AXWebArea" {
            webArea = element
            return false
        }
        return true
    }
    var texts: [String] = []
    if let webArea {
        walk(webArea) { element, _ in
            texts.append(contentsOf: labels(element))
            return true
        }
    }
    let url = webArea.flatMap { attr($0, "AXURL") as? URL }?.absoluteString
    emit([
        "window": frame(window).map { $0 as Any } ?? NSNull(),
        "webArea": webArea.flatMap(frame).map { $0 as Any } ?? NSNull(),
        "url": url.map { $0 as Any } ?? NSNull(),
        "texts": texts,
    ])
}

func dump(_ bundleId: String) {
    let running = app(bundleId)
    var lines: [String] = []
    for window in (attr(AXUIElementCreateApplication(running.processIdentifier), kAXWindowsAttribute) as? [AXUIElement]) ?? [] {
        walk(window) { element, depth in
            lines.append(String(repeating: "  ", count: depth) + role(element) + " " + labels(element).joined(separator: " | "))
            return true
        }
    }
    emit(["tree": lines.joined(separator: "\n")])
}

func windows(_ bundleId: String) {
    let pid = app(bundleId).processIdentifier
    let info = (CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]) ?? []
    let list: [[String: Any]] = info.compactMap { entry in
        guard (entry[kCGWindowOwnerPID as String] as? Int32) == pid,
            (entry[kCGWindowLayer as String] as? Int) == 0,
            let id = entry[kCGWindowNumber as String] as? Int,
            let bounds = entry[kCGWindowBounds as String] as? [String: Double]
        else { return nil }
        return [
            "id": id, "x": bounds["X"] ?? 0, "y": bounds["Y"] ?? 0,
            "width": bounds["Width"] ?? 0, "height": bounds["Height"] ?? 0,
        ]
    }
    emit(["windows": list])
}

func fit(_ bundleId: String, _ rect: [Double]) {
    guard rect.count == 4 else { fail("fit needs x y width height") }
    let appElement = AXUIElementCreateApplication(app(bundleId).processIdentifier)
    let all = ((attr(appElement, kAXWindowsAttribute) as? [AXUIElement]) ?? [])
        .filter { string($0, kAXSubroleAttribute) == "AXStandardWindow" }
    guard let main = all.first else { fail("no standard window") }
    for extra in all.dropFirst() {
        if let close = attr(extra, kAXCloseButtonAttribute) {
            // swiftlint:disable:next force_cast
            AXUIElementPerformAction(close as! AXUIElement, kAXPressAction as CFString)
        }
    }
    var point = CGPoint(x: rect[0], y: rect[1])
    var size = CGSize(width: rect[2], height: rect[3])
    if let position = AXValueCreate(.cgPoint, &point) {
        AXUIElementSetAttributeValue(main, kAXPositionAttribute as CFString, position)
    }
    if let extent = AXValueCreate(.cgSize, &size) {
        AXUIElementSetAttributeValue(main, kAXSizeAttribute as CFString, extent)
    }
    AXUIElementPerformAction(main, kAXRaiseAction as CFString)
    Thread.sleep(forTimeInterval: 0.5)
    emit(["window": frame(main).map { $0 as Any } ?? NSNull(), "closed": all.count - 1])
}

func onscreen() {
    let info = (CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]) ?? []
    let list: [[String: Any]] = info.map { entry in
        [
            "owner": entry[kCGWindowOwnerName as String] as? String ?? "",
            "name": entry[kCGWindowName as String] as? String ?? "",
            "id": entry[kCGWindowNumber as String] as? Int ?? 0,
            "layer": entry[kCGWindowLayer as String] as? Int ?? 0,
        ]
    }
    emit(["windows": list])
}

let argv = CommandLine.arguments
if argv.count == 2, argv[1] == "onscreen" {
    onscreen()
    exit(0)
}
guard argv.count >= 3 else { fail("usage: movar-ax windows|snapshot|act|dump <bundleId> …") }
switch argv[1] {
case "windows": windows(argv[2])
case "snapshot": snapshot(argv[2])
case "dump": dump(argv[2])
case "act": act(argv[2], parseOptions(argv.dropFirst(3)))
case "fit": fit(argv[2], argv.dropFirst(3).compactMap { Double($0) })
default: fail("unknown subcommand \(argv[1])")
}
