# Palco Keys para iPad (projeto iOS com Capacitor)

App iOS que embrulha o Palco Keys e liga o teclado MIDI (CoreMIDI) ao app.
A ponte MIDI está em `ios/App/App/AppDelegate.swift` (classes `MidiBridge` e `MainViewController`).

## Como montar em outro Mac
1. Instale o Xcode e o Node.
2. Nesta pasta: `npm install`
3. Gere o site do Palco Keys (pasta `teclas-android`): `npm run build`, e copie o conteúdo de `dist/` para `palco-ios/www/`.
4. Nesta pasta: `npx cap copy ios`
5. Abra `ios/App/App.xcodeproj` no Xcode, escolha o iPad como destino, entre com o Apple ID em Signing & Capabilities (Team) e aperte Run.
   Assinatura grátis dura 7 dias. No iPad: Ajustes > Privacidade e Segurança > Modo de Desenvolvedor.
