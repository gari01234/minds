import XCTest

// Reproduces what Gari does on the iPhone: open Window, tap a field and type.
// The app must still be running afterwards. Never asks for a sign-in code:
// no request is sent to MINDS (the backend is also blocked on the runner).
final class WebSignInSmokeTests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    func testNativeSignInAcceptsTypingWithoutSendingAnything() throws {
        let app = XCUIApplication()
        app.launch()
        let email = app.textFields["native-login-email"]
        let appeared = email.waitForExistence(timeout: 30)
        print("WINDOW-SMOKE native sign-in appeared: \(appeared), state \(app.state.rawValue)")
        attach(app, "0-native-sign-in")
        XCTAssertTrue(appeared, "The native sign-in did not appear")
        email.tap()
        email.typeText("prueba@example.com")
        sleep(2)
        attach(app, "0b-native-sign-in-typed")
        XCTAssertEqual(app.state, .runningForeground, "Window ended while typing in the native sign-in")
        XCTAssertTrue(app.buttons["Enviar código"].exists)
    }

    func testOpeningWindowAndTypingTheEmailKeepsTheAppRunning() throws {
        let app = XCUIApplication()
        // Debug-only: show the web app without signing in.
        app.launchArguments = ["-WindowUITestWebOnly"]
        app.launch()
        print("WINDOW-SMOKE launched, state \(app.state.rawValue)")

        // Any text input of the web app: the chat composer (or a sign-in field).
        let found = firstWebInput(app, timeout: 60)
        let appeared = found != nil
        let field = found ?? app.webViews.textFields.firstMatch
        print("WINDOW-SMOKE web input appeared: \(appeared), state \(app.state.rawValue)")
        // The field is in the accessibility tree before the page has painted.
        sleep(5)
        attach(app, "1-after-launch")
        XCTAssertEqual(app.state, .runningForeground, "Window ended before the sign-in appeared")
        XCTAssertTrue(appeared, "No text input of the web app appeared")

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

    func testTabsMoveTheSharedWebPageAndShowTheNativeScreens() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-WindowUITestWebOnly"]
        app.launch()
        let composer = firstWebInput(app, timeout: 60)
        XCTAssertNotNil(composer, "The chat did not load")
        sleep(3)
        attach(app, "t1-chat")
        let bar = app.tabBars.firstMatch
        XCTAssertTrue(bar.waitForExistence(timeout: 10), "No tab bar")
        // Build 14 drew the page under the tab bar and hid the composer.
        if let composer {
            XCTAssertLessThanOrEqual(composer.frame.maxY, bar.frame.minY + 1, "The chat composer is hidden by the tab bar")
        }
        for name in ["Chat", "Ahora", "Tiempo", "Work", "Bandeja"] {
            XCTAssertTrue(bar.buttons[name].exists, "Missing tab " + name)
        }
        bar.buttons["Tiempo"].tap()
        sleep(4)
        attach(app, "t2-tiempo")
        XCTAssertEqual(app.state, .runningForeground)
        XCTAssertTrue(app.webViews.firstMatch.exists, "Tiempo shows the web page")
        bar.buttons["Work"].tap()
        sleep(4)
        attach(app, "t3-work")
        bar.buttons["Bandeja"].tap()
        XCTAssertTrue(app.staticTexts["Bandeja"].waitForExistence(timeout: 10), "Native Bandeja")
        attach(app, "t4-bandeja")
        bar.buttons["Ahora"].tap()
        XCTAssertTrue(app.staticTexts["Ahora"].waitForExistence(timeout: 10), "Native Ahora")
        attach(app, "t5-ahora")
        let ideas = app.buttons["Ideas"]
        if ideas.waitForExistence(timeout: 5) {
            ideas.tap()
            sleep(4)
            attach(app, "t6-ideas")
        }
        bar.buttons["Chat"].tap()
        XCTAssertNotNil(firstWebInput(app, timeout: 20), "Back in Chat, the page is there again")
        attach(app, "t7-chat-again")
        print("WINDOW-SMOKE tabs done, state \(app.state.rawValue)")
        XCTAssertEqual(app.state, .runningForeground)
    }

    private func firstWebInput(_ app: XCUIApplication, timeout: TimeInterval) -> XCUIElement? {
        let deadline = Date().addingTimeInterval(timeout)
        repeat {
            // The chat composer first; only a field the finger can actually reach.
            let area = app.webViews.textViews.firstMatch
            if area.exists && area.isHittable { return area }
            let field = app.webViews.textFields.firstMatch
            if field.exists && field.isHittable { return field }
            sleep(1)
        } while Date() < deadline
        return nil
    }

    private func attach(_ app: XCUIApplication, _ name: String) {
        guard app.state == .runningForeground else { return }
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }
}
