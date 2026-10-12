import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [])
        try? AVAudioSession.sharedInstance().setActive(true)
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

// ===== Palco Keys: ponte CoreMIDI -> Web MIDI =====
import CoreMIDI
import WebKit
import AVFoundation

final class MidiBridge: NSObject, WKScriptMessageHandler {
    weak var webView: WKWebView?
    private var client = MIDIClientRef()
    private var inPort = MIDIPortRef()
    private var outPort = MIDIPortRef()
    private var connected = Set<MIDIEndpointRef>()

    static let shim = #"""
    (function () {
      var h = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.palcoMidi;
      if (!h || navigator.requestMIDIAccess) return;
      var inputs = new Map(), outputs = new Map();
      var access = { inputs: inputs, outputs: outputs, sysexEnabled: false, onstatechange: null };
      var started = false;
      function mkIn(p) {
        return { id: String(p.id), name: p.name, manufacturer: '', type: 'input', state: 'connected', connection: 'open',
          onmidimessage: null, open: function () { return Promise.resolve(this); }, close: function () { return Promise.resolve(this); },
          addEventListener: function () {}, removeEventListener: function () {} };
      }
      function mkOut(p) {
        return { id: String(p.id), name: p.name, manufacturer: '', type: 'output', state: 'connected', connection: 'open',
          send: function (d) { h.postMessage({ cmd: 'send', id: Number(p.id), d: Array.prototype.slice.call(d) }); },
          open: function () { return Promise.resolve(this); }, close: function () { return Promise.resolve(this); },
          addEventListener: function () {}, removeEventListener: function () {} };
      }
      window.__palcoMidiPorts = function (ins, outs) {
        var seenIn = {}, changed = false;
        ins.forEach(function (p) { seenIn[p.id] = 1; if (!inputs.has(String(p.id))) { inputs.set(String(p.id), mkIn(p)); changed = true; } });
        Array.from(inputs.keys()).forEach(function (k) { if (!seenIn[k]) { inputs.delete(k); changed = true; } });
        var seenOut = {};
        outs.forEach(function (p) { seenOut[p.id] = 1; if (!outputs.has(String(p.id))) { outputs.set(String(p.id), mkOut(p)); changed = true; } });
        Array.from(outputs.keys()).forEach(function (k) { if (!seenOut[k]) { outputs.delete(k); changed = true; } });
        if (changed && typeof access.onstatechange === 'function') { try { access.onstatechange({ target: access }); } catch (e) {} }
      };
      window.__palcoMidiIn = function (id, bytes) {
        var inp = inputs.get(String(id));
        if (!inp || typeof inp.onmidimessage !== 'function') return;
        var i = 0;
        while (i < bytes.length) {
          var s = bytes[i], n;
          if (s < 0x80) { i++; continue; }
          if (s === 0xF0) { while (i < bytes.length && bytes[i] !== 0xF7) i++; i++; continue; }
          if (s >= 0xF8) n = 1; else if (s === 0xF1 || s === 0xF3) n = 2; else if (s === 0xF2) n = 3; else if (s >= 0xF4) n = 1;
          else if (s >= 0xC0 && s < 0xE0) n = 2; else n = 3;
          var msg = new Uint8Array(bytes.slice(i, i + n));
          i += n;
          try { inp.onmidimessage({ data: msg, target: inp, timeStamp: performance.now() }); } catch (e) {}
        }
      };
      navigator.requestMIDIAccess = function () {
        if (!started) { started = true; h.postMessage({ cmd: 'start' }); }
        return Promise.resolve(access);
      };
    })();
    """#

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let cmd = body["cmd"] as? String else { return }
        if cmd == "start" { start() }
        if cmd == "send", let id = body["id"] as? Int, let d = body["d"] as? [Int] { send(id: id, bytes: d.map { UInt8(truncatingIfNeeded: $0) }) }
    }

    private func start() {
        if client != 0 { refresh(); return }
        MIDIClientCreateWithBlock("PalcoKeys" as CFString, &client) { [weak self] _ in
            DispatchQueue.main.async { self?.refresh() }
        }
        MIDIInputPortCreateWithBlock(client, "PalcoIn" as CFString, &inPort) { [weak self] list, refCon in
            self?.receive(list, refCon)
        }
        MIDIOutputPortCreate(client, "PalcoOut" as CFString, &outPort)
        refresh()
    }

    private func name(_ e: MIDIEndpointRef) -> String {
        var cf: Unmanaged<CFString>?
        MIDIObjectGetStringProperty(e, kMIDIPropertyDisplayName, &cf)
        if let s = cf?.takeRetainedValue() { return s as String }
        return "MIDI"
    }

    private func refresh() {
        var ins: [[String: Any]] = []
        var live = Set<MIDIEndpointRef>()
        for i in 0..<MIDIGetNumberOfSources() {
            let src = MIDIGetSource(i)
            if src == 0 { continue }
            live.insert(src)
            ins.append(["id": Int(src), "name": name(src)])
            if !connected.contains(src) {
                MIDIPortConnectSource(inPort, src, UnsafeMutableRawPointer(bitPattern: Int(src)))
                connected.insert(src)
            }
        }
        connected = connected.intersection(live)
        var outs: [[String: Any]] = []
        for i in 0..<MIDIGetNumberOfDestinations() {
            let d = MIDIGetDestination(i)
            if d == 0 { continue }
            outs.append(["id": Int(d), "name": name(d)])
        }
        guard let a = try? JSONSerialization.data(withJSONObject: ins), let b = try? JSONSerialization.data(withJSONObject: outs),
              let sa = String(data: a, encoding: .utf8), let sb = String(data: b, encoding: .utf8) else { return }
        webView?.evaluateJavaScript("window.__palcoMidiPorts && window.__palcoMidiPorts(\(sa), \(sb))", completionHandler: nil)
    }

    private func receive(_ list: UnsafePointer<MIDIPacketList>, _ refCon: UnsafeMutableRawPointer?) {
        let srcId = refCon.map { Int(bitPattern: $0) } ?? 0
        var all: [UInt8] = []
        var packet = list.pointee.packet
        for _ in 0..<list.pointee.numPackets {
            let len = Int(packet.length)
            withUnsafeBytes(of: &packet.data) { raw in all.append(contentsOf: raw.prefix(len)) }
            packet = MIDIPacketNext(&packet).pointee
        }
        if all.isEmpty { return }
        let js = "window.__palcoMidiIn && window.__palcoMidiIn(\(srcId), [\(all.map { String($0) }.joined(separator: ","))])"
        DispatchQueue.main.async { [weak self] in self?.webView?.evaluateJavaScript(js, completionHandler: nil) }
    }

    private func send(id: Int, bytes: [UInt8]) {
        if bytes.isEmpty { return }
        let size = 1024
        let buf = UnsafeMutableRawPointer.allocate(byteCount: size, alignment: 8)
        defer { buf.deallocate() }
        let pl = buf.bindMemory(to: MIDIPacketList.self, capacity: 1)
        let p = MIDIPacketListInit(pl)
        _ = MIDIPacketListAdd(pl, size, p, 0, bytes.count, bytes)
        MIDISend(outPort, MIDIEndpointRef(id), pl)
    }
}

class MainViewController: CAPBridgeViewController {
    let midi = MidiBridge()

    override func webView(with frame: CGRect, configuration: WKWebViewConfiguration) -> WKWebView {
        configuration.userContentController.add(midi, name: "palcoMidi")
        configuration.userContentController.addUserScript(WKUserScript(source: MidiBridge.shim, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        configuration.mediaTypesRequiringUserActionForPlayback = []
        let wv = super.webView(with: frame, configuration: configuration)
        midi.webView = wv
        return wv
    }
}
