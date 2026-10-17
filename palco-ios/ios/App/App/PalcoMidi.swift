import Foundation
import UIKit
import AVFoundation
import CoreMIDI
import Capacitor

/// Tela principal: registra o plugin de MIDI nativo (CoreMIDI) na ponte do Capacitor.
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(PalcoMidiPlugin())
    }
}

/// MIDI direto do iPad: lê os controladores ligados por USB/Bluetooth via CoreMIDI
/// e entrega os bytes ao app (substitui o Web MIDI que o Safari do iPad não tem).
@objc(PalcoMidiPlugin)
public class PalcoMidiPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PalcoMidiPlugin"
    public let jsName = "PalcoMidi"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "list", returnType: CAPPluginReturnPromise),
    ]

    private var client = MIDIClientRef()
    private var port = MIDIPortRef()
    private var connected = Set<MIDIUniqueID>()
    private var tokens: [Int: String] = [:]   // referência da conexão → id da porta
    private var nextToken = 1
    private let lock = NSLock()
    private var started = false

    @objc func start(_ call: CAPPluginCall) {
        if !started {
            started = true
            configureAudio()
            MIDIClientCreateWithBlock("PalcoKeys" as CFString, &client) { [weak self] note in
                let id = note.pointee.messageID
                if id == .msgObjectAdded || id == .msgObjectRemoved || id == .msgSetupChanged {
                    DispatchQueue.main.async { self?.scan() }
                }
            }
            MIDIInputPortCreateWithBlock(client, "Entrada" as CFString, &port) { [weak self] list, src in
                self?.receive(list, src)
            }
        }
        scan()
        call.resolve(["ports": describe()])
    }

    @objc func list(_ call: CAPPluginCall) {
        call.resolve(["ports": describe()])
    }

    /// Áudio em baixa latência: categoria de reprodução e buffer curto.
    private func configureAudio() {
        let s = AVAudioSession.sharedInstance()
        try? s.setCategory(.playback, mode: .default, options: [.mixWithOthers])
        try? s.setPreferredIOBufferDuration(0.005)
        try? s.setActive(true)
    }

    private func name(_ ep: MIDIEndpointRef) -> String {
        var cf: Unmanaged<CFString>?
        MIDIObjectGetStringProperty(ep, kMIDIPropertyDisplayName, &cf)
        return (cf?.takeRetainedValue() as String?) ?? "MIDI"
    }

    private func uid(_ ep: MIDIEndpointRef) -> MIDIUniqueID {
        var v: Int32 = 0
        MIDIObjectGetIntegerProperty(ep, kMIDIPropertyUniqueID, &v)
        return v
    }

    private func describe() -> [[String: Any]] {
        var out: [[String: Any]] = []
        for i in 0..<MIDIGetNumberOfSources() {
            let ep = MIDIGetSource(i)
            out.append(["id": String(uid(ep)), "name": name(ep)])
        }
        return out
    }

    /// Liga todas as entradas existentes e avisa o app da lista atual (para plugar/desplugar a quente).
    private func scan() {
        var now = Set<MIDIUniqueID>()
        for i in 0..<MIDIGetNumberOfSources() {
            let ep = MIDIGetSource(i)
            let u = uid(ep)
            now.insert(u)
            if !connected.contains(u) {
                let t = nextToken
                nextToken += 1
                lock.lock(); tokens[t] = String(u); lock.unlock()
                MIDIPortConnectSource(port, ep, UnsafeMutableRawPointer(bitPattern: t))
                connected.insert(u)
            }
        }
        connected = connected.intersection(now)
        notifyListeners("ports", data: ["ports": describe()])
    }

    private func receive(_ list: UnsafePointer<MIDIPacketList>, _ ref: UnsafeMutableRawPointer?) {
        // O CoreMIDI entrega vários pacotes juntos; cada um vira um evento (a ordem é mantida).
        let token = ref.map { Int(bitPattern: $0) } ?? 0
        lock.lock(); let portId = tokens[token] ?? ""; lock.unlock()
        var events: [[String: Any]] = []
        for packet in list.unsafeSequence() {
            let len = Int(packet.pointee.length)
            let bytes: [Int] = withUnsafeBytes(of: packet.pointee.data) { raw in
                raw.prefix(len).map { Int($0) }
            }
            events.append(["data": bytes, "t": Double(packet.pointee.timeStamp)])
        }
        if !events.isEmpty { notifyListeners("midi", data: ["port": portId, "events": events]) }
    }
}
