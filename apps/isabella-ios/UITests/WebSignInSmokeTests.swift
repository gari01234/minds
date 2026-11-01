import XCTest

// Reproduces what Gari does on the iPhone: open Window, tap the e-mail field of
// the web sign-in and start typing. The app must still be running afterwards.
// Never asks for the sign-in code: no request is sent to MINDS.
final class WebSignInSmokeTests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    func testOpeningWindowAndTypingTheEmailKeepsTheAppRunning() throws {
        let app = XCUIApplication()
        app.launch()
        print("WINDOW-SMOKE launched, state \(app.state.rawValue)")

        let field = app.webViews.textFields.firstMatch
        let appeared = field.waitForExistence(timeout: 45)
        print("WINDOW-SMOKE sign-in field appeared: \(appeared), state \(app.state.rawValue)")
        // The field is in the accessibility tree before the page has painted.
        sleep(5)
        attach(app, "1-after-launch")
        XCTAssertEqual(app.state, .runningForeground, "Window ended before the sign-in appeared")
        XCTAssertTrue(appeared, "The web sign-in field did not appear")

        field.tap()
        sleep(3)
        print("WINDOW-SMOKE after tapping the field, state \(app.state.rawValue)")
        attach(app, "2-after-tap")
        XCTAssertEqual(app.state, .runningForeground, "Window ended when the e-mail field took focus")

        field.typeText("prueba@example.com")
        sleep(5)
        print("WINDOW-SMOKE after typing, state \(app.state.rawValue)")
        attach(app, "3-after-typing")
        XCTAssertEqual(app.state, .runningForeground, "Window ended while typing the e-mail")

        // Leave the app idle a little longer: a crash on a timer would show here.
        sleep(20)
        print("WINDOW-SMOKE after 20 s idle, state \(app.state.rawValue)")
        XCTAssertEqual(app.state, .runningForeground, "Window ended while idle")
    }

    private func attach(_ app: XCUIApplication, _ name: String) {
        guard app.state == .runningForeground else { return }
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }
}
