//
//  ScreenshotTests.swift
//  MovarScreenshotsUITests
//
//  Capture the macOS host app's App Store screenshots from the app that ships.
//
//  WHY A UI-TEST TARGET AND NOT A SCRIPT. `capture-host-app-screenshots.mts`
//  drives the iOS simulator with `simctl`, which can boot, launch and
//  screenshot but cannot TAP — so its two host-app scenes are an operator's
//  manual step, and it says so. macOS has no `simctl` at all, and the obvious
//  substitutes do not work from an automation context: `screencapture -R`
//  photographs whatever Space the display is showing (the app's window is
//  routinely not on it, and you get wallpaper at the exact right size, which
//  looks like success), and `screencapture -l<windowid>` is refused outright
//  with "could not create image from window". A UI test runs inside the app's
//  own session, so `XCUIElement.screenshot()` returns the window's real
//  pixels and needs no Accessibility grant, no Space juggling, and no human.
//
//  SIZE. The Mac App Store accepts 1280x800, 1440x900, 2560x1600 and
//  2880x1800 — all 16:10, and the app's default window (940x668pt) is none of
//  them. `XCUIScreenshot` renders at the display's native scale, so on a 2x
//  Retina display a window resized to 1280x800 POINTS comes out at exactly
//  2560x1600 pixels. `resize(_:to:)` below drags the window's bottom-right
//  corner by the measured difference rather than assuming a starting size, so
//  it lands on the target whatever the window was restored to.
//
//  The run FAILS rather than writing an off-size image: a screenshot that is
//  quietly the wrong size is rejected by App Store Connect long after the fact,
//  which is precisely the sort of late, quiet failure this repo gates against.
//
//  Locale comes from the MOVAR_SHOT_LOCALE environment variable and is passed
//  to the app as `-AppleLanguages`, so one scheme captures both listings.
//  `scripts/capture-macos-screenshots.mts` runs it once per locale and lifts
//  the attachments out of the .xcresult bundle.
//

import XCTest

final class ScreenshotTests: XCTestCase {
    /// Window size in POINTS. At 2x this is 2560x1600 — an accepted Mac App
    /// Store size. Keep it 16:10 or App Store Connect will reject the upload.
    private let targetSize = CGSize(width: 1280, height: 800)

    /// Pixel sizes the Mac App Store accepts, to check the shot before it ships.
    private let allowedPixelSizes: Set<[Int]> = [
        [1280, 800], [1440, 900], [2560, 1600], [2880, 1800],
    ]

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testCaptureStoreScreenshots() throws {
        let locale = ProcessInfo.processInfo.environment["MOVAR_SHOT_LOCALE"] ?? "en"

        let app = XCUIApplication()
        // `-AppleLanguages` as a launch argument lands in NSArgumentDomain,
        // which wins over the user's own setting for this process only — the
        // machine's language is left alone.
        app.launchArguments += ["-AppleLanguages", "(\(locale))", "-AppleLocale", locale]
        app.launch()

        let window = app.windows.firstMatch
        XCTAssertTrue(window.waitForExistence(timeout: 30), "the app never showed a window")

        resize(window, to: targetSize)

        // The tab picker is a segmented SwiftUI Picker. Its labels are
        // localized, so address the segments BY INDEX — a label lookup would
        // pass in one locale and fail in the other, which is the whole reason
        // this test runs twice.
        let tabs = window.radioButtons
        XCTAssertEqual(tabs.count, 3, "expected three tabs, found \(tabs.count)")

        for (index, name) in ["01-detector", "02-audit", "03-settings"].enumerated() {
            let tab = tabs.element(boundBy: index)
            XCTAssertTrue(tab.waitForExistence(timeout: 10), "tab \(index) never appeared")
            tab.click()

            // Let the pane settle before the shutter: SwiftUI swaps the detail
            // view a frame after the click, and a screenshot taken into that
            // gap catches the OUTGOING tab — a wrong picture that still has
            // the right dimensions and so passes every other check here.
            Thread.sleep(forTimeInterval: 1.5)

            // The Detector opens on sample text with no verdict, which makes a
            // listless store shot: half the pane is empty. Running it fills the
            // evidence card, and the detection is local — no network, so this
            // stays deterministic. The Audit tab is deliberately NOT run here:
            // its results come from actually fetching a site, and a screenshot
            // test that needs the network fails on a plane. That one scene
            // stays an operator's step, the same bargain
            // `capture-host-app-screenshots.mts` documents for iOS.
            if name.hasSuffix("detector") {
                runDetector(in: window)
            }

            capture(window, named: "\(locale)-\(name)")
        }
    }

    /// Click the Detector's action button and wait for the verdict.
    ///
    /// Found by POSITION, not by label: the button reads "Визначити" or
    /// "Detect" depending on the locale this run is capturing, and a label
    /// lookup would pass in one and fail in the other. It is the lowest button
    /// in the window — the window's own close/minimise/zoom controls sit at the
    /// top, so the largest `maxY` is unambiguous.
    private func runDetector(in window: XCUIElement) {
        let buttons = window.buttons.allElementsBoundByIndex.filter { $0.isHittable }
        guard let action = buttons.max(by: { $0.frame.maxY < $1.frame.maxY }) else {
            XCTFail("the Detector pane has no clickable button")
            return
        }
        action.click()

        // The verdict renders from a local comparison, so this is fast; the
        // wait is for SwiftUI to lay the evidence card out, not for any I/O.
        Thread.sleep(forTimeInterval: 2.5)
    }

    /// Drag the window's bottom-right corner by the difference between where it
    /// is and where it needs to be. Measured rather than assumed: macOS restores
    /// a window's frame across launches, so the starting size is not knowable
    /// from the storyboard's `contentRect`.
    private func resize(_ window: XCUIElement, to size: CGSize) {
        for _ in 0..<3 {
            let frame = window.frame
            let dx = size.width - frame.width
            let dy = size.height - frame.height
            if abs(dx) < 1, abs(dy) < 1 { return }

            let corner = window.coordinate(withNormalizedOffset: CGVector(dx: 1, dy: 1))
            corner.press(
                forDuration: 0.2,
                thenDragTo: corner.withOffset(CGVector(dx: dx, dy: dy))
            )
            Thread.sleep(forTimeInterval: 0.5)
        }

        let frame = window.frame
        XCTAssertEqual(frame.width, size.width, accuracy: 1, "window did not reach the target width")
        XCTAssertEqual(frame.height, size.height, accuracy: 1, "window did not reach the target height")
    }

    /// Screenshot the window and attach it, refusing any size the App Store
    /// would reject.
    private func capture(_ window: XCUIElement, named name: String) {
        let screenshot = window.screenshot()

        guard let image = NSBitmapImageRep(data: screenshot.pngRepresentation) else {
            XCTFail("\(name): the screenshot did not decode as a PNG")
            return
        }
        let pixels = [image.pixelsWide, image.pixelsHigh]
        XCTAssertTrue(
            allowedPixelSizes.contains(pixels),
            """
            \(name): captured \(pixels[0])x\(pixels[1]), which the Mac App Store does not accept. \
            Expected one of \(allowedPixelSizes.map { "\($0[0])x\($0[1])" }.sorted().joined(separator: ", ")). \
            A non-Retina display halves the pixel size — capture on a 2x display.
            """
        )

        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
