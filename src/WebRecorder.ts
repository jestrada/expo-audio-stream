import { AudioAnalysisData, RecordingConfig } from "./ExpoAudioStream.types";
import {
  EmitAudioAnalysisFunction,
  EmitAudioEventFunction,
} from "./ExpoAudioStreamModule.web";
import { InlineProcessorScrippt } from "./inlineAudioWebWorker";
import { encodingToBitDepth } from "./utils";
interface AudioWorkletEvent {
  data: {
    command: string;
    recordedData?: ArrayBuffer;
    sampleRate?: number;
  };
}

interface AudioFeaturesEvent {
  data: {
    command: string;
    result: AudioAnalysisData;
  };
}

const DEFAULT_WEB_BITDEPTH = 32;
const DEFAULT_WEB_POINTS_PER_SECOND = 20;
const DEFAULT_WEB_INTERVAL = 500;
const DEFAULT_WEB_NUMBER_OF_CHANNELS = 1;

// const log = debug("expo-audio-stream:WebRecorder");
const log = console.log;
export class WebRecorder {
  private audioContext: AudioContext;
  private audioWorkletNode!: AudioWorkletNode;
  private featureExtractorWorker: Worker;
  private source: MediaStreamAudioSourceNode;
  private emitAudioEventCallback: EmitAudioEventFunction;
  private emitAudioAnalysisCallback: EmitAudioAnalysisFunction;
  private config: RecordingConfig;
  private position: number; // Track the cumulative position
  private numberOfChannels: number; // Number of audio channels
  private bitDepth: number; // Bit depth of the audio
  private exportBitDepth: number; // Bit depth of the audio
  private buffers: ArrayBuffer[]; // Array to store the buffers
  private audioAnalysisData: AudioAnalysisData; // Keep updating the full audio analysis data with latest events

  constructor({
    audioContext,
    source,
    recordingConfig,
    emitAudioEventCallback,
    emitAudioAnalysisCallback,
  }: {
    audioContext: AudioContext;
    source: MediaStreamAudioSourceNode;
    recordingConfig: RecordingConfig;
    emitAudioEventCallback: EmitAudioEventFunction;
    emitAudioAnalysisCallback: EmitAudioAnalysisFunction;
  }) {
    this.audioContext = audioContext;
    this.source = source;
    this.emitAudioEventCallback = emitAudioEventCallback;
    this.emitAudioAnalysisCallback = emitAudioAnalysisCallback;
    this.config = recordingConfig;
    this.position = 0;
    this.buffers = []; // Initialize the buffers array

    const audioContextFormat = this.checkAudioContextFormat({
      sampleRate: this.audioContext.sampleRate,
    });
    log("Initialized WebRecorder with config:", {
      sampleRate: audioContextFormat.sampleRate,
      bitDepth: audioContextFormat.bitDepth,
      numberOfChannels: audioContextFormat.numberOfChannels,
    });

    this.bitDepth = audioContextFormat.bitDepth;
    this.numberOfChannels =
      audioContextFormat.numberOfChannels || DEFAULT_WEB_NUMBER_OF_CHANNELS; // Default to 1 if not available
    this.exportBitDepth =
      encodingToBitDepth({
        encoding: recordingConfig.encoding ?? "pcm_32bit",
      }) ||
      audioContextFormat.bitDepth ||
      DEFAULT_WEB_BITDEPTH;

    this.audioAnalysisData = {
      amplitudeRange: { min: 0, max: 0 },
      dataPoints: [],
      durationMs: 0,
      bitDepth: this.bitDepth,
      numberOfChannels: this.numberOfChannels,
      sampleRate: this.config.sampleRate || this.audioContext.sampleRate,
      pointsPerSecond:
        this.config.pointsPerSecond || DEFAULT_WEB_POINTS_PER_SECOND,
      speakerChanges: [],
    };

    // Initialize the feature extractor worker
    //TODO: create audio feature extractor from a Blob instead of url since we cannot include the url directly in the library
    // We keep the url during dev and use the blob in production.
    this.featureExtractorWorker = new Worker(
      new URL("/audio-features-extractor.js", window.location.href),
    );
    this.featureExtractorWorker.onmessage =
      this.handleFeatureExtractorMessage.bind(this);
  }

  async init() {
    try {
      const blob = new Blob([InlineProcessorScrippt], {
        type: "application/javascript",
      });
      const url = URL.createObjectURL(blob);

      // await this.audioContext.audioWorklet.addModule(url);
      await this.audioContext.audioWorklet.addModule("/audioworklet.js");

      this.audioWorkletNode = new AudioWorkletNode(
        this.audioContext,
        "recorder-processor",
      );

      this.audioWorkletNode.port.onmessage = async (
        event: AudioWorkletEvent,
      ) => {
        const command = event.data.command;
        if (command === "recordedData") {
          const rawPCMDataFull = event.data.recordedData as ArrayBuffer;

          // Compute duration of the recorded data
          const duration =
            rawPCMDataFull.byteLength /
            (this.audioContext.sampleRate *
              (this.exportBitDepth / this.numberOfChannels));
          log(
            `Received recorded data -- Duration: ${duration} vs ${rawPCMDataFull.byteLength / this.audioContext.sampleRate} seconds`,
          );
          log(
            `recordedData.length=${rawPCMDataFull.byteLength} vs transmittedData.length=${this.buffers[0].byteLength}`,
          );
          // const mergedBuffers = mergeBuffers(this.buffers); // Int16Array or Int32Array
          // this.playRecordedData({
          //   recordedData: mergedBuffers,
          //   mimeType: 'audio/wav'
          // });
          // this.playRecordedData({recordedData: wavMergedBuffer, sampleRate: this.config.sampleRate ?? this.audioContext.sampleRate, numberOfChannels: this.numberOfChannels, bitDepth: this.bitDepth});
          return;
        }

        // Handle the audio blob (e.g., send it to the server or process it further)
        log("Received audio blob from processor", event);
        const pcmBuffer = event.data.recordedData;

        if (!pcmBuffer) {
          return;
        }

        this.buffers.push(pcmBuffer); // Store the buffer
        const sampleRate =
          event.data.sampleRate ?? this.audioContext.sampleRate;
        const otherSampleRate = this.audioContext.sampleRate;

        // Pass the intermediary buffer to the feature extractor worker
        const pcmBufferCopy = pcmBuffer.slice(0);
        const channelData = new Float32Array(pcmBufferCopy);

        const duration = channelData.length / sampleRate; // Calculate duration of the current buffer
        const otherDuration =
          pcmBuffer.byteLength /
          (otherSampleRate * (this.exportBitDepth / this.numberOfChannels)); // Calculate duration of the current buffer
        log(
          `sampleRate=${sampleRate} Duration: ${duration} -- otherSampleRate=${otherSampleRate} Other duration: ${otherDuration}`,
        );

        this.emitAudioEventCallback({
          data: pcmBuffer,
          position: this.position,
        });
        this.position += duration; // Update position

        this.featureExtractorWorker.postMessage(
          {
            command: "process",
            channelData,
            sampleRate: this.audioContext.sampleRate,
            pointsPerSecond:
              this.config.pointsPerSecond || DEFAULT_WEB_POINTS_PER_SECOND,
            algorithm: this.config.algorithm || "rms",
            bitDepth: this.bitDepth,
            fullAudioDurationMs: this.position * 1000,
            numberOfChannels: this.numberOfChannels,
            features: this.config.features,
          },
          [],
        );
      };

      log(
        `WebRecorder initialized -- recordSampleRate=${this.audioContext.sampleRate}`,
        this.config,
      );
      this.audioWorkletNode.port.postMessage({
        command: "init",
        recordSampleRate: this.audioContext.sampleRate, // Pass the original sample rate
        exportSampleRate:
          this.config.sampleRate ?? this.audioContext.sampleRate,
        bitDepth: this.bitDepth,
        exportBitDepth: this.exportBitDepth,
        channels: this.numberOfChannels,
        interval: this.config.interval ?? DEFAULT_WEB_INTERVAL,
      });

      // Connect the source to the AudioWorkletNode and start recording
      this.source.connect(this.audioWorkletNode);
      this.audioWorkletNode.connect(this.audioContext.destination);
    } catch (error) {
      console.error("Failed to initialize WebRecorder", error);
    }
  }

  handleFeatureExtractorMessage(event: AudioFeaturesEvent) {
    if (event.data.command === "features") {
      const segmentResult = event.data.result;

      // Merge the segment result with the full audio analysis data
      this.audioAnalysisData.dataPoints.push(...segmentResult.dataPoints);
      this.audioAnalysisData.speakerChanges?.push(
        ...(segmentResult.speakerChanges ?? []),
      );
      this.audioAnalysisData.durationMs = segmentResult.durationMs;
      if (segmentResult.amplitudeRange) {
        this.audioAnalysisData.amplitudeRange = {
          min: Math.min(
            this.audioAnalysisData.amplitudeRange.min,
            segmentResult.amplitudeRange.min,
          ),
          max: Math.max(
            this.audioAnalysisData.amplitudeRange.max,
            segmentResult.amplitudeRange.max,
          ),
        };
      }
      // Handle the extracted features (e.g., emit an event or log them)
      log("features event segmentResult", segmentResult);
      log("features event audioAnalysisData", this.audioAnalysisData);
      this.emitAudioAnalysisCallback(segmentResult);
    }
  }

  start() {
    this.source.connect(this.audioWorkletNode);
    this.audioWorkletNode.connect(this.audioContext.destination);
  }

  stop() {
    if (this.audioWorkletNode) {
      this.source.disconnect(this.audioWorkletNode);
      this.audioWorkletNode.disconnect(this.audioContext.destination);
      this.audioWorkletNode.port.postMessage({ command: "stop" });
    }

    // Stop all media stream tracks to stop the browser recording
    this.stopMediaStreamTracks();
  }

  pause() {
    this.source.disconnect(this.audioWorkletNode); // Disconnect the source from the AudioWorkletNode
    this.audioWorkletNode.disconnect(this.audioContext.destination); // Disconnect the AudioWorkletNode from the destination
    this.audioWorkletNode.port.postMessage({ command: "pause" });
  }

  stopAndPlay() {
    this.stop();
    this.audioWorkletNode.port.postMessage({ command: "getRecordedData" });
  }

  stopMediaStreamTracks() {
    // Stop all audio tracks to stop the recording icon
    const tracks = this.source.mediaStream.getTracks();
    tracks.forEach((track) => track.stop());
  }

  async playRecordedData({
    recordedData,
  }: {
    recordedData: ArrayBuffer;
    mimeType?: string;
  }) {
    try {
      const blob = new Blob([recordedData]);
      const url = URL.createObjectURL(blob);
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();

      // Decode the audio data
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

      // Create a buffer source node and play the audio
      const bufferSource = this.audioContext.createBufferSource();
      bufferSource.buffer = audioBuffer;
      bufferSource.connect(this.audioContext.destination);
      bufferSource.start();
      log("Playing recorded data", recordedData);
    } catch (error) {
      console.error(`Failed to play recorded data:`, error);
    }
  }

  private checkAudioContextFormat({ sampleRate }: { sampleRate: number }) {
    // Create a silent AudioBuffer
    const frameCount = sampleRate * 1.0; // 1 second buffer
    const audioBuffer = this.audioContext.createBuffer(
      1,
      frameCount,
      sampleRate,
    );

    // Check the format
    const channelData = audioBuffer.getChannelData(0);
    const bitDepth = channelData.BYTES_PER_ELEMENT * 8; // 4 bytes per element means 32-bit

    return {
      sampleRate: audioBuffer.sampleRate,
      bitDepth,
      numberOfChannels: audioBuffer.numberOfChannels,
    };
  }

  resume() {
    this.source.connect(this.audioWorkletNode);
    this.audioWorkletNode.connect(this.audioContext.destination);
    this.audioWorkletNode.port.postMessage({ command: "resume" });
  }
}