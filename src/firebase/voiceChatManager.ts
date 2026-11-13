import {
  Unsubscribe,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { createId } from '../shared/gameEngine';
import { auth, db } from './config';

export interface VoicePeerStatus {
  uid: string;
  name: string;
  joinedVoice: boolean;
  micEnabled: boolean;
  speaking: boolean;
}

export interface VoiceManagerSnapshot {
  joinedVoice: boolean;
  micEnabled: boolean;
  speakerMuted: boolean;
  speaking: boolean;
  connectingVoice: boolean;
  forcedMuteReason: string | null;
  voiceError: string | null;
  peers: Record<string, VoicePeerStatus>;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

interface PeerConnectionEntry {
  pc: RTCPeerConnection;
  pendingIce: RTCIceCandidateInit[];
  audioEl: HTMLAudioElement | null;
  sender: RTCRtpSender | null;
  makingOffer: boolean;
}

export class VoiceChatManager {
  private roomCode: string;
  private hostUid: string;
  private myUid: string;
  private myName: string;

  private joinedVoice = false;
  private userDesiredMic = false;
  private speakerMuted = false;
  private speaking = false;
  private connectingVoice = false;
  private forcedMuteReason: string | null = null;
  private voiceError: string | null = null;

  private localStream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private vadTimer: number | null = null;
  private lastSpokeAt = 0;

  private peers: Record<string, VoicePeerStatus> = {};
  private peerUnsubs: Record<string, Unsubscribe> = {};
  private signalsUnsub: Unsubscribe | null = null;
  private connections: Record<string, PeerConnectionEntry> = {};
  private processedSignalIds = new Set<string>();
  private hasPublishedPeerDoc = false;
  private destroyed = false;

  private onUpdate: (snapshot: VoiceManagerSnapshot) => void;

  constructor(
    roomCode: string,
    hostUid: string,
    myUid: string,
    myName: string,
    onUpdate: (snapshot: VoiceManagerSnapshot) => void
  ) {
    this.roomCode = roomCode;
    this.hostUid = hostUid;
    this.myUid = myUid;
    this.myName = myName;
    this.onUpdate = onUpdate;
    this.emit();
  }

  public updateMeta(hostUid: string, myName: string): void {
    this.hostUid = hostUid;
    this.myName = myName;
  }

  public syncHumanPeers(humanUids: string[]): void {
    if (this.destroyed) return;
    const validSet = new Set(humanUids);

    // Unsubscribe removed players
    for (const uid of Object.keys(this.peerUnsubs)) {
      if (!validSet.has(uid)) {
        this.peerUnsubs[uid]();
        delete this.peerUnsubs[uid];
        delete this.peers[uid];
        this.closePeerConnection(uid);
      }
    }

    // Subscribe new human players
    for (const uid of humanUids) {
      if (this.peerUnsubs[uid]) continue;
      this.peerUnsubs[uid] = onSnapshot(
        doc(db, 'rooms', this.roomCode, 'voicePeers', uid),
        (snap) => {
          if (this.destroyed) return;
          if (!snap.exists()) {
            delete this.peers[uid];
            this.closePeerConnection(uid);
          } else {
            const data = snap.data() as VoicePeerStatus;
            this.peers[uid] = {
              uid: data.uid,
              name: data.name,
              joinedVoice: Boolean(data.joinedVoice),
              micEnabled: Boolean(data.micEnabled),
              speaking: Boolean(data.speaking),
            };
            if (uid !== this.myUid) {
              if (data.joinedVoice && this.joinedVoice) {
                this.ensurePeerConnection(uid);
              } else if (!data.joinedVoice) {
                this.closePeerConnection(uid);
              }
            }
          }
          this.emit();
        },
        () => {
          // Ignore transient permission checks before memberUids propagates
        }
      );
    }

    this.emit();
  }

  public setForcedMuteReason(reason: string | null): void {
    if (this.forcedMuteReason === reason) return;
    this.forcedMuteReason = reason;
    this.applyLocalTrackMute();
    if (this.joinedVoice) {
      this.publishPeerDoc().catch(() => {});
    }
    this.emit();
  }

  public async toggleMicrophone(): Promise<void> {
    if (this.destroyed) return;
    this.voiceError = null;

    if (!this.joinedVoice) {
      await this.startVoice(true);
      return;
    }

    if (this.userDesiredMic) {
      this.userDesiredMic = false;
      this.speaking = false;
      this.applyLocalTrackMute();
      await this.publishPeerDoc().catch(() => {});
      this.emit();
      return;
    }

    // Turning mic back on
    this.userDesiredMic = true;
    if (!this.localStream) {
      const gotMic = await this.acquireMicrophone();
      if (!gotMic) {
        this.userDesiredMic = false;
        this.emit();
        return;
      }
      await this.attachLocalTrackToConnections();
    }
    this.applyLocalTrackMute();
    await this.publishPeerDoc().catch(() => {});
    this.emit();
  }

  public async toggleSpeakerOnly(): Promise<void> {
    if (this.destroyed) return;
    this.voiceError = null;

    if (!this.joinedVoice) {
      await this.startVoice(false);
      return;
    }

    this.speakerMuted = !this.speakerMuted;
    for (const entry of Object.values(this.connections)) {
      if (entry.audioEl) {
        entry.audioEl.muted = this.speakerMuted;
      }
    }
    this.emit();
  }

  public async leaveVoice(): Promise<void> {
    this.joinedVoice = false;
    this.userDesiredMic = false;
    this.speaking = false;
    this.connectingVoice = false;

    this.stopVadAndMic();

    if (this.signalsUnsub) {
      this.signalsUnsub();
      this.signalsUnsub = null;
    }

    for (const uid of Object.keys(this.connections)) {
      this.closePeerConnection(uid);
    }

    if (this.hasPublishedPeerDoc && auth.currentUser) {
      await deleteDoc(doc(db, 'rooms', this.roomCode, 'voicePeers', this.myUid)).catch(() => {});
      this.hasPublishedPeerDoc = false;
    }

    this.emit();
  }

  private async startVoice(withMic: boolean): Promise<void> {
    if (!auth.currentUser) {
      this.voiceError = 'يرجى تسجيل الدخول لاستخدام الصوت.';
      this.emit();
      return;
    }

    this.connectingVoice = true;
    this.voiceError = null;
    this.emit();

    if (withMic) {
      const ok = await this.acquireMicrophone();
      if (!ok) {
        this.connectingVoice = false;
        this.emit();
        return;
      }
      this.userDesiredMic = true;
      this.applyLocalTrackMute();
    } else {
      this.userDesiredMic = false;
    }

    this.joinedVoice = true;
    this.attachSignalListener();
    await this.publishPeerDoc().catch(() => {});

    for (const peer of Object.values(this.peers)) {
      if (peer.uid !== this.myUid && peer.joinedVoice) {
        this.ensurePeerConnection(peer.uid);
      }
    }

    this.connectingVoice = false;
    this.emit();
  }

  private async acquireMicrophone(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.voiceError = 'المتصفح الحالي لا يدعم تشغيل المايك.';
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      this.localStream = stream;
      this.startVad(stream);
      return true;
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        this.voiceError = 'تم رفض إذن المايك من المتصفح. اسمح بالمايك أو استخدم «سماعة الغرفة» للاستماع.';
      } else if (name === 'NotFoundError') {
        this.voiceError = 'لم يتم العثور على مايك متصل بهذا الجهاز.';
      } else {
        this.voiceError = 'تعذر تشغيل المايك حالياً. يمكنك الاستماع عبر سماعة الغرفة.';
      }
      return false;
    }
  }

  private startVad(stream: MediaStream): void {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      this.audioCtx = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const buffer = new Uint8Array(analyser.frequencyBinCount);

      this.vadTimer = window.setInterval(() => {
        if (this.destroyed) return;
        const effectiveOn = this.isEffectiveMicEnabled();
        if (!effectiveOn) {
          if (this.speaking) {
            this.speaking = false;
            this.publishPeerDoc().catch(() => {});
            this.emit();
          }
          return;
        }
        analyser.getByteTimeDomainData(buffer);
        let sumSq = 0;
        for (let i = 0; i < buffer.length; i++) {
          const norm = (buffer[i] - 128) / 128;
          sumSq += norm * norm;
        }
        const rms = Math.sqrt(sumSq / buffer.length);
        const now = Date.now();
        if (rms > 0.025) {
          this.lastSpokeAt = now;
        }
        const nextSpeaking = now - this.lastSpokeAt < 500;
        if (nextSpeaking !== this.speaking) {
          this.speaking = nextSpeaking;
          this.publishPeerDoc().catch(() => {});
          this.emit();
        }
      }, 180);
    } catch {
      // VAD is optional enhancement
    }
  }

  private stopVadAndMic(): void {
    if (this.vadTimer !== null) {
      clearInterval(this.vadTimer);
      this.vadTimer = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
  }

  private isEffectiveMicEnabled(): boolean {
    return this.joinedVoice && this.userDesiredMic && !this.forcedMuteReason && Boolean(this.localStream);
  }

  private applyLocalTrackMute(): void {
    if (!this.localStream) return;
    const enabled = this.isEffectiveMicEnabled();
    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
    if (!enabled) {
      this.speaking = false;
    }
  }

  private async attachLocalTrackToConnections(): Promise<void> {
    if (!this.localStream) return;
    const track = this.localStream.getAudioTracks()[0];
    if (!track) return;

    for (const [peerUid, entry] of Object.entries(this.connections)) {
      if (entry.sender) {
        await entry.sender.replaceTrack(track).catch(() => {});
      } else {
        entry.sender = entry.pc.addTrack(track, this.localStream);
        await this.sendOffer(peerUid, entry).catch(() => {});
      }
    }
  }

  private async publishPeerDoc(): Promise<void> {
    if (this.destroyed || !auth.currentUser) return;
    const ref = doc(db, 'rooms', this.roomCode, 'voicePeers', this.myUid);
    this.hasPublishedPeerDoc = true;
    await setDoc(ref, {
      uid: this.myUid,
      hostUid: this.hostUid,
      name: this.myName.slice(0, 32),
      joinedVoice: this.joinedVoice,
      micEnabled: this.isEffectiveMicEnabled(),
      speaking: this.speaking,
      updatedAt: serverTimestamp(),
    });
  }

  private attachSignalListener(): void {
    if (this.signalsUnsub) return;
    const q = query(
      collection(db, 'rooms', this.roomCode, 'voiceSignals'),
      where('toUid', '==', this.myUid)
    );
    this.signalsUnsub = onSnapshot(
      q,
      (snapshot) => {
        if (this.destroyed) return;
        for (const docSnap of snapshot.docs) {
          if (this.processedSignalIds.has(docSnap.id)) continue;
          this.processedSignalIds.add(docSnap.id);
          const data = docSnap.data() as {
            fromUid: string;
            toUid: string;
            signalType: 'offer' | 'answer' | 'ice';
            payload: string;
          };
          this.handleSignal(data).catch(() => {});
          deleteDoc(docSnap.ref).catch(() => {});
        }
      },
      () => {
        // Ignore transient signal listener errors
      }
    );
  }

  private ensurePeerConnection(peerUid: string): PeerConnectionEntry {
    if (this.connections[peerUid]) {
      return this.connections[peerUid];
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    const entry: PeerConnectionEntry = {
      pc,
      pendingIce: [],
      audioEl: null,
      sender: null,
      makingOffer: false,
    };
    this.connections[peerUid] = entry;

    const track = this.localStream?.getAudioTracks()[0];
    if (track && this.localStream) {
      entry.sender = pc.addTrack(track, this.localStream);
    } else {
      pc.addTransceiver('audio', { direction: 'recvonly' });
    }

    pc.onicecandidate = (ev) => {
      if (ev.candidate && !this.destroyed) {
        this.sendSignal(peerUid, 'ice', JSON.stringify(ev.candidate.toJSON())).catch(() => {});
      }
    };

    pc.ontrack = (ev) => {
      const remoteStream = ev.streams[0] || new MediaStream([ev.track]);
      if (!entry.audioEl) {
        const audio = document.createElement('audio');
        audio.autoplay = true;
        audio.setAttribute('playsinline', 'true');
        audio.muted = this.speakerMuted;
        audio.style.display = 'none';
        document.body.appendChild(audio);
        entry.audioEl = audio;
      }
      entry.audioEl.srcObject = remoteStream;
      entry.audioEl.play().catch(() => {});
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        if (this.myUid < peerUid) {
          this.sendOffer(peerUid, entry, true).catch(() => {});
        }
      }
    };

    if (this.myUid < peerUid) {
      this.sendOffer(peerUid, entry).catch(() => {});
    }

    return entry;
  }

  private async sendOffer(
    peerUid: string,
    entry: PeerConnectionEntry,
    iceRestart = false
  ): Promise<void> {
    if (entry.makingOffer || this.destroyed) return;
    entry.makingOffer = true;
    try {
      const offer = await entry.pc.createOffer({ iceRestart });
      await entry.pc.setLocalDescription(offer);
      await this.sendSignal(peerUid, 'offer', JSON.stringify(entry.pc.localDescription));
    } finally {
      entry.makingOffer = false;
    }
  }

  private async handleSignal(data: {
    fromUid: string;
    signalType: 'offer' | 'answer' | 'ice';
    payload: string;
  }): Promise<void> {
    if (!this.joinedVoice || this.destroyed) return;
    const entry = this.ensurePeerConnection(data.fromUid);
    const { pc } = entry;

    if (data.signalType === 'offer') {
      const sdp = JSON.parse(data.payload) as RTCSessionDescriptionInit;
      // Polite peer handles glare if needed
      const polite = this.myUid > data.fromUid;
      if (pc.signalingState !== 'stable') {
        if (!polite) return;
        await pc.setLocalDescription({ type: 'rollback' }).catch(() => {});
      }
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      for (const candidate of entry.pendingIce) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      }
      entry.pendingIce = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await this.sendSignal(data.fromUid, 'answer', JSON.stringify(pc.localDescription));
    } else if (data.signalType === 'answer') {
      const sdp = JSON.parse(data.payload) as RTCSessionDescriptionInit;
      if (pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        for (const candidate of entry.pendingIce) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
        }
        entry.pendingIce = [];
      }
    } else if (data.signalType === 'ice') {
      const candidate = JSON.parse(data.payload) as RTCIceCandidateInit;
      if (pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      } else {
        entry.pendingIce.push(candidate);
      }
    }
  }

  private async sendSignal(
    toUid: string,
    signalType: 'offer' | 'answer' | 'ice',
    payload: string
  ): Promise<void> {
    if (this.destroyed || !auth.currentUser) return;
    const sigId = createId('sig');
    await setDoc(doc(db, 'rooms', this.roomCode, 'voiceSignals', sigId), {
      fromUid: this.myUid,
      toUid,
      signalType,
      payload: payload.slice(0, 12000),
      createdAt: serverTimestamp(),
    });
  }

  private closePeerConnection(uid: string): void {
    const entry = this.connections[uid];
    if (!entry) return;
    entry.pc.onicecandidate = null;
    entry.pc.ontrack = null;
    entry.pc.onconnectionstatechange = null;
    entry.pc.close();
    if (entry.audioEl) {
      entry.audioEl.srcObject = null;
      entry.audioEl.remove();
    }
    delete this.connections[uid];
  }

  private emit(): void {
    this.onUpdate({
      joinedVoice: this.joinedVoice,
      micEnabled: this.isEffectiveMicEnabled(),
      speakerMuted: this.speakerMuted,
      speaking: this.speaking,
      connectingVoice: this.connectingVoice,
      forcedMuteReason: this.forcedMuteReason,
      voiceError: this.voiceError,
      peers: { ...this.peers },
    });
  }

  public destroy(): void {
    this.destroyed = true;
    this.stopVadAndMic();
    if (this.signalsUnsub) {
      this.signalsUnsub();
      this.signalsUnsub = null;
    }
    Object.values(this.peerUnsubs).forEach((u) => u());
    this.peerUnsubs = {};
    for (const uid of Object.keys(this.connections)) {
      this.closePeerConnection(uid);
    }
    if (this.hasPublishedPeerDoc && auth.currentUser) {
      deleteDoc(doc(db, 'rooms', this.roomCode, 'voicePeers', this.myUid)).catch(() => {});
    }
  }
}
