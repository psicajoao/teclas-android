import Foundation
import AVFoundation
import Capacitor
import UIKit
import UniformTypeIdentifiers

/// Motor de amostras nativo (AVAudioUnitSampler): toca SoundFonts grandes direto do arquivo, fora do limite de memória da janela web.
/// Cada timbre nativo ganha seu próprio sampler (um por "id"); o app manda notas e controles por esta ponte.
@objc(PalcoSamplerPlugin)
public class PalcoSamplerPlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate {
    public let identifier = "PalcoSamplerPlugin"
    public let jsName = "PalcoSampler"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "load", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "noteOn", returnType: CAPPluginReturnNone),
        CAPPluginMethod(name: "noteOff", returnType: CAPPluginReturnNone),
        CAPPluginMethod(name: "cc", returnType: CAPPluginReturnNone),
        CAPPluginMethod(name: "bend", returnType: CAPPluginReturnNone),
        CAPPluginMethod(name: "allOff", returnType: CAPPluginReturnNone),
        CAPPluginMethod(name: "setGain", returnType: CAPPluginReturnNone),
        CAPPluginMethod(name: "setReverb", returnType: CAPPluginReturnNone),
        CAPPluginMethod(name: "pick", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "library", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removeFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
    ]

    private let engine = AVAudioEngine()
    private let reverb = AVAudioUnitReverb()
    private var samplers: [String: AVAudioUnitSampler] = [:]
    private let lock = NSLock()
    private let q = DispatchQueue(label: "palco.sampler.load")
    private var built = false

    private func build() {
        if built { return }
        built = true
        reverb.loadFactoryPreset(.largeHall)
        reverb.wetDryMix = 12
        engine.attach(reverb)
        engine.connect(reverb, to: engine.mainMixerNode, format: nil)
    }

    /// Depois de uma mudança de configuração do áudio, refaz as ligações do grafo (reverb e cada timbre).
    private func rewire() {
        engine.disconnectNodeOutput(reverb)
        engine.connect(reverb, to: engine.mainMixerNode, format: nil)
        lock.lock(); let all = Array(samplers.values); lock.unlock()
        for smp in all {
            engine.disconnectNodeOutput(smp)
            engine.connect(smp, to: reverb, format: nil)
        }
    }

    @discardableResult
    private func startEngine() -> String? {
        if engine.isRunning { return nil }
        let s = AVAudioSession.sharedInstance()
        try? s.setCategory(.playback, mode: .default, options: [.mixWithOthers])
        try? s.setPreferredIOBufferDuration(0.005)
        try? s.setActive(true)
        engine.prepare()
        do { try engine.start(); return nil } catch { return error.localizedDescription }
    }

    private var lastNoteAt = Date.distantPast
    private var observing = false
    private func observe() {
        if observing { return }
        observing = true
        NotificationCenter.default.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: nil) { [weak self] _ in
            self?.rewire()
            self?.startEngine()
        }
        NotificationCenter.default.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: nil) { [weak self] _ in
            guard let self = self else { return }
            if !self.engine.isRunning { self.rewire(); self.startEngine() }
        }
        NotificationCenter.default.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: nil) { [weak self] _ in
            self?.rewire()
            self?.startEngine()
        }
        // Vigia: se o motor parou (outro som do app mexeu na sessão de áudio) e há timbres carregados, religa.
        DispatchQueue.main.async { [weak self] in
            Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
                guard let self = self else { return }
                self.lock.lock(); let n = self.samplers.count; self.lock.unlock()
                if n > 0 && !self.engine.isRunning { self.rewire(); self.startEngine() }
            }
        }
        NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: nil) { [weak self] n in
            if let t = n.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt, t == AVAudioSession.InterruptionType.ended.rawValue { self?.startEngine() }
        }
    }

    private func sampler(_ id: String) -> AVAudioUnitSampler? {
        lock.lock(); defer { lock.unlock() }
        return samplers[id]
    }

    /// Caminho: "premium/arquivo.sf2" dentro do app (pasta public/sounds) ou "doc:arquivo.sf2" na pasta de documentos do app.
    private func resolve(_ file: String) -> URL? {
        if file.hasPrefix("doc:") {
            let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            return docs.appendingPathComponent("soundfonts").appendingPathComponent(String(file.dropFirst(4)))
        }
        return Bundle.main.bundleURL.appendingPathComponent("public/sounds").appendingPathComponent(file)
    }

    @objc func load(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let file = call.getString("file") else { return call.reject("faltam id e file") }
        let program = UInt8(max(0, min(127, call.getInt("program") ?? 0)))
        let lsb = UInt8(max(0, min(127, call.getInt("bank") ?? 0)))
        q.async { [weak self] in
            guard let self = self else { return }
            self.build()
            self.observe()
            if self.sampler(id) != nil { return call.resolve(["ok": true, "engine": self.engine.isRunning]) }
            guard let url = self.resolve(file), FileManager.default.fileExists(atPath: url.path) else { return call.reject("arquivo não encontrado: " + file) }
            let t0 = Date()
            let smp = AVAudioUnitSampler()
            self.engine.attach(smp)
            self.engine.connect(smp, to: self.reverb, format: nil)
            var err: String? = nil
            do {
                try smp.loadSoundBankInstrument(at: url, program: program, bankMSB: UInt8(kAUSampler_DefaultMelodicBankMSB), bankLSB: lsb)
            } catch {
                err = error.localizedDescription
                do { try smp.loadSoundBankInstrument(at: url, program: program, bankMSB: 0, bankLSB: lsb); err = nil } catch { err = error.localizedDescription }
            }
            if let e = err {
                self.engine.detach(smp)
                return call.reject("não carregou: " + e)
            }
            smp.overallGain = 6
            self.lock.lock(); self.samplers[id] = smp; self.lock.unlock()
            let se = self.startEngine()
            call.resolve(["ok": true, "engine": self.engine.isRunning, "engineError": se ?? "", "seconds": Date().timeIntervalSince(t0)])
        }
    }

    @objc func unload(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { return call.resolve() }
        q.async { [weak self] in
            guard let self = self else { return }
            self.lock.lock(); let smp = self.samplers.removeValue(forKey: id); self.lock.unlock()
            if let smp = smp { smp.reset(); self.engine.detach(smp) }
            call.resolve()
        }
    }

    @objc func noteOn(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let n = call.getInt("note"), let v = call.getInt("vel"), let s = sampler(id) else { return }
        // Depois de uns segundos parado o iOS pode ter pausado a sessão de áudio (o app mostra as teclas mas não sai som): reativa antes da nota.
        let now = Date()
        if !engine.isRunning || now.timeIntervalSince(lastNoteAt) > 2 {
            try? AVAudioSession.sharedInstance().setActive(true)
            if !engine.isRunning { startEngine() }
        }
        lastNoteAt = now
        s.startNote(UInt8(max(0, min(127, n))), withVelocity: UInt8(max(1, min(127, v))), onChannel: 0)
    }

    @objc func noteOff(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let n = call.getInt("note"), let s = sampler(id) else { return }
        s.stopNote(UInt8(max(0, min(127, n))), onChannel: 0)
    }

    @objc func cc(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let c = call.getInt("cc"), let v = call.getInt("value"), let s = sampler(id) else { return }
        s.sendController(UInt8(max(0, min(127, c))), withValue: UInt8(max(0, min(127, v))), onChannel: 0)
    }

    @objc func bend(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let v = call.getInt("value"), let s = sampler(id) else { return }
        s.sendPitchBend(UInt16(max(0, min(16383, v))), onChannel: 0)
    }

    @objc func allOff(_ call: CAPPluginCall) {
        lock.lock(); let snap = samplers; lock.unlock()
        let only = call.getString("id")
        for (id, s) in snap where only == nil || only == id {
            s.sendController(123, withValue: 0, onChannel: 0)
            s.sendController(120, withValue: 0, onChannel: 0)
        }
    }

    /// Ganho em dB (de -24 a +12) de um timbre nativo, para igualar o volume com os outros.
    @objc func setGain(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let g = call.getFloat("db"), let s = sampler(id) else { return }
        s.overallGain = max(-24, min(12, g))
    }

    @objc func setReverb(_ call: CAPPluginCall) {
        if let w = call.getFloat("wet") { reverb.wetDryMix = max(0, min(100, w)) }
    }

    // MARK: - Biblioteca do usuário (SoundFonts importados do app Arquivos)

    private var pendingPick: CAPPluginCall?
    private var libDir: URL {
        let d = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("soundfonts")
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }

    @objc func status(_ call: CAPPluginCall) {
        lock.lock(); let ids = Array(samplers.keys); lock.unlock()
        let route = AVAudioSession.sharedInstance().currentRoute.outputs.map { $0.portName }.joined(separator: ",")
        var err = ""
        if !engine.isRunning { err = startEngine() ?? "" }
        call.resolve(["engine": engine.isRunning, "engineError": err, "samplers": ids, "route": route, "volume": AVAudioSession.sharedInstance().outputVolume])
    }

    @objc func pick(_ call: CAPPluginCall) {
        NSLog("PK pick chamado")
        pendingPick = call
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.item], asCopy: true)
            picker.allowsMultipleSelection = true
            picker.delegate = self
            var top: UIViewController? = self.bridge?.viewController
            if top == nil {
                top = UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.windows.first(where: { $0.isKeyWindow })?.rootViewController }.first
            }
            while let p = top?.presentedViewController { top = p }
            guard let vc = top else {
                self.pendingPick = nil
                call.reject("sem tela para abrir o seletor")
                return
            }
            vc.present(picker, animated: true) {
                NSLog("PK seletor aberto")
            }
        }
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        pendingPick?.resolve(["added": 0, "skipped": [String]()])
        pendingPick = nil
    }

    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let call = pendingPick else { return }
        pendingPick = nil
        q.async { [weak self] in
            guard let self = self else { return }
            var added = 0
            var skipped: [String] = []
            for u in urls {
                let name = u.lastPathComponent
                guard name.lowercased().hasSuffix(".sf2") else { skipped.append(name); continue }
                let dest = self.libDir.appendingPathComponent(name)
                try? FileManager.default.removeItem(at: dest)
                do { try FileManager.default.copyItem(at: u, to: dest); added += 1 } catch { skipped.append(name) }
            }
            call.resolve(["added": added, "skipped": skipped])
        }
    }

    @objc func removeFile(_ call: CAPPluginCall) {
        guard let f = call.getString("file") else { return call.resolve() }
        let name = f.hasPrefix("doc:") ? String(f.dropFirst(4)) : f
        // descarrega os samplers deste arquivo
        lock.lock()
        let ids = samplers.keys.filter { $0.contains("doc:" + name) }
        lock.unlock()
        for id in ids {
            lock.lock(); let smp = samplers.removeValue(forKey: id); lock.unlock()
            if let smp = smp { smp.reset(); engine.detach(smp) }
        }
        try? FileManager.default.removeItem(at: libDir.appendingPathComponent(name))
        call.resolve()
    }

    @objc func library(_ call: CAPPluginCall) {
        q.async { [weak self] in
            guard let self = self else { return }
            let urls = (try? FileManager.default.contentsOfDirectory(at: self.libDir, includingPropertiesForKeys: [.fileSizeKey])) ?? []
            var files: [[String: Any]] = []
            for u in urls.sorted(by: { $0.lastPathComponent < $1.lastPathComponent }) where u.pathExtension.lowercased() == "sf2" {
                let size = (try? u.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
                files.append(["file": "doc:" + u.lastPathComponent, "name": u.lastPathComponent, "size": size, "path": u.path, "presets": self.presets(of: u)])
            }
            call.resolve(["files": files])
        }
    }

    private func le16(_ b: [UInt8], _ o: Int) -> Int { Int(b[o]) | (Int(b[o + 1]) << 8) }
    private func le32(_ b: [UInt8], _ o: Int) -> UInt64 { UInt64(b[o]) | (UInt64(b[o + 1]) << 8) | (UInt64(b[o + 2]) << 16) | (UInt64(b[o + 3]) << 24) }

    /// Lê só a lista de presets (bloco phdr) do SoundFont, sem carregar o arquivo.
    private func presets(of url: URL) -> [[String: Any]] {
        guard let fh = try? FileHandle(forReadingFrom: url) else { return [] }
        defer { try? fh.close() }
        guard let total = try? fh.seekToEnd() else { return [] }
        var pos: UInt64 = 12
        while pos + 12 <= total {
            guard (try? fh.seek(toOffset: pos)) != nil, let hd = try? fh.read(upToCount: 12), hd.count == 12 else { break }
            let h = [UInt8](hd)
            let id = String(bytes: h[0..<4], encoding: .ascii) ?? ""
            let size = le32(h, 4)
            if id == "LIST" && String(bytes: h[8..<12], encoding: .ascii) == "pdta" {
                var sp = pos + 12
                let end = pos + 8 + size
                while sp + 8 <= end {
                    guard (try? fh.seek(toOffset: sp)) != nil, let sd = try? fh.read(upToCount: 8), sd.count == 8 else { return [] }
                    let sh = [UInt8](sd)
                    let sid = String(bytes: sh[0..<4], encoding: .ascii) ?? ""
                    let ssz = le32(sh, 4)
                    if sid == "phdr" {
                        guard let body = try? fh.read(upToCount: Int(ssz)) else { return [] }
                        let b = [UInt8](body)
                        let n = b.count / 38
                        var out: [[String: Any]] = []
                        if n > 1 {
                            for i in 0..<(n - 1) {
                                let o = i * 38
                                let nameBytes = b[o..<(o + 20)].prefix { $0 != 0 }
                                let name = String(bytes: nameBytes, encoding: .isoLatin1)?.trimmingCharacters(in: .whitespaces) ?? "Preset"
                                let prog = le16(b, o + 20)
                                let bank = le16(b, o + 22)
                                if bank >= 128 { continue }
                                out.append(["name": name, "program": prog, "bank": bank])
                            }
                        }
                        return out
                    }
                    sp += 8 + ssz + (ssz & 1)
                }
                return []
            }
            pos += 8 + size + (size & 1)
        }
        return []
    }
}
