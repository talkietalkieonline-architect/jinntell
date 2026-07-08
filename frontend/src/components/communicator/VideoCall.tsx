"use client";
import { useEffect, useRef, useState } from "react";

const ICE: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

type SignalData = { sdp?: string; candidate?: RTCIceCandidateInit };

export default function VideoCall({
  role,
  peerId,
  peerName,
  sendSignal,
  signalRef,
  onEnd,
}: {
  role: "caller" | "callee";
  peerId: number;
  peerName: string;
  sendSignal: (to: number, signal: string, extra?: Record<string, unknown>) => void;
  signalRef: { current: ((type: string, data: SignalData) => void) | null };
  onEnd: () => void;
}) {
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const remoteSet = useRef(false);
  const endedRef = useRef(false);
  const [status, setStatus] = useState(role === "caller" ? "Соединение…" : "Соединение…");
  const [error, setError] = useState("");

  const cleanup = () => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    try { pcRef.current?.close(); } catch { /* noop */ }
    pcRef.current = null;
  };

  const end = (notify: boolean) => {
    if (endedRef.current) return;
    endedRef.current = true;
    if (notify) sendSignal(peerId, "end");
    cleanup();
    onEnd();
  };

  useEffect(() => {
    let alive = true;
    const pc = new RTCPeerConnection(ICE);
    pcRef.current = pc;

    pc.onicecandidate = (e) => {
      if (e.candidate) sendSignal(peerId, "ice", { candidate: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => {
      if (remoteRef.current && e.streams[0]) {
        remoteRef.current.srcObject = e.streams[0];
        setStatus("На связи");
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setStatus("На связи");
    };

    signalRef.current = async (type, data) => {
      const p = pcRef.current;
      if (!p) return;
      if (type === "call_offer" && data.sdp) {
        // Вызываемый: получили offer — отвечаем
        await p.setRemoteDescription({ type: "offer", sdp: data.sdp });
        remoteSet.current = true;
        for (const c of pendingIce.current) { try { await p.addIceCandidate(c); } catch { /* noop */ } }
        pendingIce.current = [];
        const ans = await p.createAnswer();
        await p.setLocalDescription(ans);
        sendSignal(peerId, "answer", { sdp: ans.sdp });
      } else if (type === "call_answer" && data.sdp) {
        await p.setRemoteDescription({ type: "answer", sdp: data.sdp });
        remoteSet.current = true;
        for (const c of pendingIce.current) { try { await p.addIceCandidate(c); } catch { /* noop */ } }
        pendingIce.current = [];
      } else if (type === "call_ice" && data.candidate) {
        if (remoteSet.current) { try { await p.addIceCandidate(data.candidate); } catch { /* noop */ } }
        else pendingIce.current.push(data.candidate);
      } else if (type === "call_end" || type === "call_reject") {
        end(false);
      }
    };

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (!alive) { stream.getTracks().forEach((t) => t.stop()); return; }
        localStreamRef.current = stream;
        if (localRef.current) localRef.current.srcObject = stream;
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));

        if (role === "caller") {
          // Звонящий инициирует offer после того, как вызываемый принял звонок
          const off = await pc.createOffer();
          await pc.setLocalDescription(off);
          sendSignal(peerId, "offer", { sdp: off.sdp });
        }
        // callee: ждёт call_offer через signalRef и отвечает
      } catch {
        setError("Нет доступа к камере/микрофону");
      }
    })();

    return () => { alive = false; signalRef.current = null; cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0" style={{ zIndex: 130, background: "#000" }}>
      <video ref={remoteRef} autoPlay playsInline className="absolute inset-0 w-full h-full" style={{ objectFit: "cover" }} />
      <video ref={localRef} autoPlay playsInline muted className="absolute" style={{ width: 118, height: 160, objectFit: "cover", borderRadius: 14, bottom: 110, right: 16, border: "2px solid rgba(255,255,255,0.5)", transform: "scaleX(-1)" }} />
      <div className="absolute top-8 left-0 right-0 text-center text-white">
        <div className="text-lg font-semibold">{peerName}</div>
        <div className="text-sm opacity-80">{error || status}</div>
      </div>
      <div className="absolute bottom-10 left-0 right-0 flex justify-center">
        <button onClick={() => end(true)} className="w-16 h-16 rounded-full flex items-center justify-center transition-all active:scale-95" style={{ background: "#e74c3c" }} title="Завершить">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
            <path d="M3 3l18 18" />
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72" />
          </svg>
        </button>
      </div>
    </div>
  );
}
