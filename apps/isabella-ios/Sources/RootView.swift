import SwiftUI

struct RootView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        Group {
            if model.isLoading {
                ProgressView("Conectando MINDS…")
            } else if !model.isAuthenticated {
                NativeSignInView()
            } else {
                TabView(selection: $model.section) {
                    FullMINDSView()
                        .tabItem { Label("MINDS", systemImage: "square.grid.2x2") }
                        .tag(AppModel.Section.web)
                    ContinuityView()
                        .tabItem { Label("Continuidad", systemImage: "circle.dotted.circle") }
                        .tag(AppModel.Section.continuity)
                    ChatView()
                        .tabItem { Label("Isabella", systemImage: "message") }
                        .tag(AppModel.Section.chat)
                    CalendarHomeView()
                        .tabItem { Label("Agenda", systemImage: "calendar") }
                        .tag(AppModel.Section.calendar)
                }
                .tint(.primary)
            }
        }
        .task { await model.bootstrap() }
    }
}

private struct NativeSignInView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        VStack(spacing: 23) {
            Spacer()
            OrbView()
                .frame(width: 160, height: 160)
            Text("Isabella").font(.system(size: 36, weight: .light))
            Text("Conecta tu cuenta existente de MINDS.")
                .foregroundStyle(.secondary)
            TextField("Correo de MINDS", text: $model.loginEmail)
                .keyboardType(.emailAddress)
                .textContentType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .textFieldStyle(.roundedBorder)
                .disabled(model.codeSent)
                .accessibilityIdentifier("native-login-email")
            if model.codeSent {
                TextField("Código recibido por correo", text: $model.loginCode)
                    .textContentType(.oneTimeCode)
                    .keyboardType(.numberPad)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityIdentifier("native-login-code")
                Button("Verificar e iniciar sesión") {
                    Task { await model.verifyCode() }
                }
                .buttonStyle(.borderedProminent)
                .disabled(model.isAuthenticating || model.loginCode.isEmpty)
                Button("Cambiar correo") {
                    model.codeSent = false
                    model.loginCode = ""
                }
                .font(.footnote)
            } else {
                Button("Enviarme un código") {
                    Task { await model.sendCode() }
                }
                .buttonStyle(.borderedProminent)
                .disabled(model.isAuthenticating || model.loginEmail.isEmpty)
            }
            if model.isAuthenticating { ProgressView() }
            if let error = model.errorMessage {
                Text(error).foregroundStyle(.red).font(.footnote)
            }
            Spacer()
        }
        .padding(26)
        .frame(maxWidth: 440)
    }
}
