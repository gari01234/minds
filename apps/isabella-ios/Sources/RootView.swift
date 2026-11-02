import SwiftUI

// Window on iPhone: the app owns the session (one sign-in, here), its own tab bar
// (Chat · Ahora · Tiempo · Work · Bandeja) and the iOS integrations; the web app
// paints the rich surfaces and gets the session through the bridge.
// The older native Continuity, Chat and Agenda views stay in the project, not shown.
struct RootView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Group {
            if Self.webOnlyForUITests || model.isAuthenticated {
                MainTabView()
            } else if model.isLoading {
                Color(uiColor: .systemGroupedBackground).ignoresSafeArea()
            } else {
                NativeSignInView()
            }
        }
        .task { await model.bootstrap() }
        // The web app is light; native screens match it.
        .preferredColorScheme(.light)
    }

    #if DEBUG
    // The simulator smoke test drives the web app without signing in.
    static let webOnlyForUITests = ProcessInfo.processInfo.arguments.contains("-WindowUITestWebOnly")
    #else
    static let webOnlyForUITests = false
    #endif
}

private struct NativeSignInView: View {
    @Environment(AppModel.self) private var model
    @FocusState private var focused: Field?
    private enum Field { case email, code }

    var body: some View {
        @Bindable var model = model
        ZStack {
            Color(uiColor: .systemGroupedBackground).ignoresSafeArea()
            VStack(alignment: .leading, spacing: 18) {
                Text("Window")
                    .font(.system(size: 34, weight: .semibold))
                Text(model.codeSent
                     ? "Te enviamos un código a \(model.loginEmail). Escríbelo aquí."
                     : "Entra con el correo de tu cuenta. Te enviamos un código; solo lo haces una vez.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                if model.codeSent {
                    TextField("Código", text: $model.loginCode)
                        .textContentType(.oneTimeCode)
                        .keyboardType(.numberPad)
                        .font(.title3.monospacedDigit())
                        .padding(14)
                        .background(Color(uiColor: .systemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
                        .focused($focused, equals: .code)
                        .accessibilityIdentifier("native-login-code")
                    Button {
                        Task { await model.verifyCode() }
                    } label: {
                        Text("Entrar").frame(maxWidth: .infinity).padding(.vertical, 6)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(model.isAuthenticating || model.loginCode.count < 6)
                    Button("Usar otro correo") {
                        model.codeSent = false
                        model.loginCode = ""
                    }
                    .font(.footnote)
                } else {
                    TextField("tu@email.com", text: $model.loginEmail)
                        .keyboardType(.emailAddress)
                        .textContentType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .padding(14)
                        .background(Color(uiColor: .systemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
                        .focused($focused, equals: .email)
                        .accessibilityIdentifier("native-login-email")
                    Button {
                        Task { await model.sendCode() }
                    } label: {
                        Text("Enviar código").frame(maxWidth: .infinity).padding(.vertical, 6)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(model.isAuthenticating || !model.loginEmail.contains("@"))
                }
                if model.isAuthenticating { ProgressView() }
                if let error = model.errorMessage {
                    Text(error).font(.footnote).foregroundStyle(.red)
                }
            }
            .padding(24)
            // Buttons in Window's blue (the web app's Panorama: #0062cc).
            .tint(Color(red: 0, green: 0.384, blue: 0.8))
            .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 28))
            .padding(20)
            .frame(maxWidth: 460)
        }
        .onChange(of: model.codeSent) { _, sent in focused = sent ? .code : .email }
    }
}
