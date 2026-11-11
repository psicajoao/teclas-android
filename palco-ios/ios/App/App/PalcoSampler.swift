import Foundation
import AVFoundation
import Capacitor

/// Motor de amostras nativo (AVAudioUnitSampler): toca SoundFonts grandes direto do arquivo, fora do limite de memória da janela web.
/// Cada timbre nativo ganha seu próprio sampler (um por "id"); o app manda notas e controles por esta ponte.
@objc(PalcoSamplerPlugin)
public class PalcoSamplerPlugin: CAPPlugin, CAPBridgedPlugin {
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

    private func startEngine() {
        if engine.isRunning { return }
        let s = AVAudioSession.sharedInstance()
        try? s.setCategory(.playback, mode: .default, options: [.mixWithOthers])
        try? s.setPreferredIOBufferDuration(0.005)
        try? s.setActive(true)
        engine.prepare()
        try? engine.start()
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
        let program = UInt8(call.getInt("program") ?? 0)
        q.async { [weak self] in
            guard let self = self else { return }
            self.build()
            if self.sampler(id) != nil { return call.resolve(["ok": true]) }
            guard let url = self.resolve(file), FileManager.default.fileExists(atPath: url.path) else { return call.reject("arquivo não encontrado: " + file) }
            let smp = AVAudioUnitSampler()
            self.engine.attach(smp)
            self.engine.connect(smp, to: self.reverb, format: nil)
            do {
                do {
                    try smp.loadSoundBankInstrument(at: url, program: program, bankMSB: UInt8(kAUSampler_DefaultMelodicBankMSB), bankLSB: UInt8(kAUSampler_DefaultBankLSB))
                } catch {
                    try smp.loadSoundBankInstrument(at: url, program: program, bankMSB: 0, bankLSB: 0)
                }
            } catch {
                self.engine.detach(smp)
                return call.reject("não carregou: \(error.localizedDescription)")
            }
            self.lock.lock(); self.samplers[id] = smp; self.lock.unlock()
            self.startEngine()
            call.resolve(["ok": true])
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
}
