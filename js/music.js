// Music for the night descent. The owner's own copies of two songs play in turn from assets/audio/ when they are there
// (see README there; they are not shipped with the site); otherwise the song plays through Spotify's embedded player,
// and if Spotify cannot load, HALCYON RADIO: an original score made here in Web Audio, slow and warm and a little sad,
// an 80s synth night drive (pads, a plucked arpeggio through a long echo, a round bass, soft drums). Never autoplays:
// the sound button starts it.
const PLAYLIST = [
  { src: "assets/audio/i-really-want-to-stay-at-your-house.mp3", title: "I Really Want to Stay at Your House — Rosa Walton" },
  { src: "assets/audio/still-love-you-slowed.mp3", title: "still love you (Slowed) — GLM-RST" },
];
const RADIO_TITLE = "HALCYON RADIO — Night Descent 07";
// the song itself, played through Spotify's own embedded player: audio only, the player shown small as Spotify asks
// (signed-in listeners hear the whole track; everyone else gets Spotify's 30-second preview)
const SPOTIFY = { uri: "spotify:track:7mykoq6R3BArsSpNDjFQTm", title: "I Really Want to Stay at Your House — Rosa Walton" };

/** A small Spotify card in the corner, loaded on first use. Resolves with its controller when ready, or null. */
let spot = null, spotBox = null;
function spotify() {
  if (spot) return Promise.resolve(spot);
  return new Promise((resolve) => {
    spotBox = Object.assign(document.createElement("div"), { className: "spmini" });
    spotBox.innerHTML = `<div class="sp-head"><i></i><span>NOW PLAYING · ${SPOTIFY.title}</span></div><div id="sp-player"></div>`;
    document.body.append(spotBox);
    const make = (API) => {
      API.createController(document.getElementById("sp-player"), { uri: SPOTIFY.uri, width: "100%", height: 80 }, (ctl) => {
        spot = ctl;
        ctl.addListener("ready", () => resolve(ctl));
      });
    };
    if (window.__spotifyAPI) make(window.__spotifyAPI);
    else {
      window.onSpotifyIframeApiReady = (API) => {
        window.__spotifyAPI = API;
        make(API);
      };
      const sc = Object.assign(document.createElement("script"), { src: "https://open.spotify.com/embed/iframe-api/v1", async: true });
      sc.onerror = () => resolve(null);
      document.head.append(sc);
    }
    setTimeout(() => resolve(spot), 9000);
  });
}

export function createMusic({ onTitle } = {}) {
  let ctx = null, master = null, radio = null, el = null, mode = null, at = 0;
  // which songs are actually here (checked once, quietly)
  const found = (async () => {
    const ok = await Promise.all(
      PLAYLIST.map(async (t) => {
        try {
          const r = await fetch(t.src, { method: "HEAD" });
          return r.ok && (r.headers.get("content-type") ?? "").startsWith("audio");
        } catch {
          return false;
        }
      }),
    );
    return PLAYLIST.filter((_, i) => ok[i]);
  })();

  async function start() {
    const songs = await found;
    if (!songs.length) {
      const sp = await spotify();
      if (sp) {
        spotBox.classList.add("is-on");
        sp.play();
        mode = "spotify";
        return SPOTIFY.title;
      }
      spotBox?.remove();
      spotBox = null;
    }
    if (songs.length) {
      if (!el) {
        el = new Audio();
        el.volume = 0.6;
        // one after the other, round and round
        el.addEventListener("ended", () => {
          at = (at + 1) % songs.length;
          el.src = songs[at].src;
          el.play().catch(() => {});
          onTitle?.(songs[at].title);
        });
        el.src = songs[at].src;
      }
      await el.play().catch(() => {});
      mode = "track";
      return songs[at].title;
    }
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") await ctx.resume();
    if (!master) {
      master = ctx.createGain();
      master.gain.value = 0;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 3;
      master.connect(comp).connect(ctx.destination);
    }
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(0.34, ctx.currentTime, 0.8);
    radio ??= nightDrive(ctx, master);
    radio.play();
    mode = "radio";
    return RADIO_TITLE;
  }
  function stop() {
    if (mode === "track") el?.pause();
    if (mode === "spotify") {
      spot?.pause();
      spotBox?.classList.remove("is-on");
    }
    if (mode === "radio" && ctx) {
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
      setTimeout(() => radio?.pause(), 1600);
    }
    mode = null;
  }
  return {
    /** Turn the music on or off; resolves with what is playing. */
    async toggle(on) {
      if (on) return start();
      stop();
      return "";
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// HALCYON RADIO: a slow night drive in A minor, 84 bpm. Am9 · Fmaj7 · Cmaj7 · G6sus, two bars each.
// ---------------------------------------------------------------------------------------------------------------------
function nightDrive(ctx, out) {
  const BPM = 84, BEAT = 60 / BPM, BAR = BEAT * 4;
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
  const CHORDS = [
    [57, 60, 64, 67, 71], // Am9: A C E G B
    [53, 57, 60, 64, 69], // Fmaj7: F A C E A
    [48, 52, 55, 59, 64], // Cmaj7: C E G B E
    [55, 59, 62, 64, 69], // G6 with A on top
  ];
  const ROOTS = [45, 41, 36, 43];

  // a long echo and a hall of noise for space
  const echo = ctx.createDelay(2);
  echo.delayTime.value = BEAT * 0.75;
  const fb = ctx.createGain();
  fb.gain.value = 0.42;
  const echoTone = ctx.createBiquadFilter();
  echoTone.type = "lowpass";
  echoTone.frequency.value = 2400;
  echo.connect(echoTone).connect(fb).connect(echo);
  const echoOut = ctx.createGain();
  echoOut.gain.value = 0.5;
  echoTone.connect(echoOut).connect(out);
  const hall = ctx.createConvolver();
  {
    const len = ctx.sampleRate * 3.2, buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    hall.buffer = buf;
  }
  const hallOut = ctx.createGain();
  hallOut.gain.value = 0.32;
  hall.connect(hallOut).connect(out);
  const noise = (() => {
    const len = ctx.sampleRate, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  })();

  const pad = (notes, t, dur) => {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(600, t);
    f.frequency.linearRampToValueAtTime(1500, t + dur * 0.5);
    f.frequency.linearRampToValueAtTime(700, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.055, t + 1.4);
    g.gain.setValueAtTime(0.055, t + dur - 1.0);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.6);
    f.connect(g);
    g.connect(out);
    g.connect(hall);
    for (const n of notes.slice(0, 4)) for (const det of [-7, 6]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = midi(n);
      o.detune.value = det;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.7);
    }
  };
  const pluck = (n, t, v = 1) => {
    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.value = midi(n);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(3200, t);
    f.frequency.exponentialRampToValueAtTime(500, t + 0.32);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05 * v, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    o.connect(f).connect(g);
    g.connect(out);
    g.connect(echo);
    o.start(t);
    o.stop(t + 0.5);
  };
  const bass = (n, t, dur) => {
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = midi(n);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.06, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  };
  const kick = (t) => {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.32, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.4);
  };
  const hit = (t, { freq, q, gain, dur, toHall = 0 }) => {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g);
    g.connect(out);
    if (toHall) {
      const h = ctx.createGain();
      h.gain.value = toHall;
      g.connect(h).connect(hall);
    }
    s.start(t);
    s.stop(t + dur + 0.02);
  };

  // the arpeggio's shape over two bars: up through the chord and back, a rest, then the top again
  const ARP = [0, 1, 2, 3, 4, 3, 2, 1, 0, 2, 4, -1, 3, 2, 4, 1];
  let next = 0, step = 0, timer = null;
  const schedule = () => {
    while (next < ctx.currentTime + 0.25) {
      const bar = Math.floor(step / 8);
      const ci = Math.floor(bar / 2) % 4;
      const inBar = step % 8; // eighth notes
      const t = next;
      if (step % 16 === 0) pad(CHORDS[ci], t, BAR * 2);
      if (inBar === 0 || inBar === 4) bass(ROOTS[ci] + (inBar === 4 && bar % 2 ? 7 : 0), t, BEAT * 1.8);
      const a = ARP[step % 16];
      if (a >= 0) pluck(CHORDS[ci][a] + 12, t, step % 2 ? 0.7 : 1);
      if (inBar === 0 || inBar === 5) kick(t);
      if (inBar === 2 || inBar === 6) hit(t, { freq: 1800, q: 0.7, gain: 0.12, dur: 0.22, toHall: 0.6 });
      hit(t, { freq: 9000, q: 1.2, gain: step % 2 ? 0.018 : 0.03, dur: 0.05 });
      next += BEAT / 2;
      step++;
    }
  };
  return {
    play() {
      if (timer) return;
      next = ctx.currentTime + 0.1;
      timer = setInterval(schedule, 40);
      schedule();
    },
    pause() {
      clearInterval(timer);
      timer = null;
    },
  };
}
