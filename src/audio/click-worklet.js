import { ClickDetector } from './click-detector.js';

class KeyClickProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.detector = new ClickDetector({ sampleRate, onClick: click => this.port.postMessage(click) });
    this.port.onmessage = ({ data }) => {
      if (data.type === 'reset') this.detector.reset();
      if (data.type === 'sensitivity') this.detector.sensitivity = data.value;
    };
  }

  process(inputs) {
    const channels = inputs[0];
    if (channels?.length) {
      // Average channels so stereo microphones behave like a mono microphone.
      const mono = new Float32Array(channels[0].length);
      for (const channel of channels) for (let i = 0; i < mono.length; i++) mono[i] += channel[i] / channels.length;
      this.detector.push(mono, currentTime);
    }
    // Outputs remain silent: microphone audio is never played through speakers.
    return true;
  }
}

registerProcessor('fidget-key-clicks', KeyClickProcessor);
