const FFmpegStatic = require("ffmpeg-static");
const Process = require("child_process");
const fs = require("fs");

function getSdp(audioPort, audioPortRtcp, videoPort, videoPortRtcp) {
  return `v=0\no=- 0 0 IN IP4 127.0.0.1\ns=-\nc=IN IP4 127.0.0.1\nt=0 0\nm=audio ${audioPort} RTP/AVPF 111\na=rtcp:${audioPortRtcp}\na=rtpmap:111 opus/48000/2\na=fmtp:111 minptime=10;useinbandfec=1\nm=video ${videoPort} RTP/AVPF 96\na=rtcp:${videoPortRtcp}\na=rtpmap:96 VP8/90000\n`;
}

function startRecordingFfmpeg(
  useAudio,
  useVideo,
  outputFileName,
  { audioPort, audioPortRtcp, videoPort, videoPortRtcp }
) {
  // Return a Promise that can be awaited
  let recResolve;
  const promise = new Promise((res, _rej) => {
    recResolve = res;
  });

  const cmdProgram = FFmpegStatic; // From package "ffmpeg-static"

  // let cmdInputPath = `${__dirname}/recording/input-vp8.sdp`;
  let cmdOutputPath = `${__dirname}/recording/${outputFileName}.webm`;
  let cmdCodec = "";
  let cmdFormat = "-f webm -flags +global_header";

  // Ensure correct FFmpeg version is installed
  const ffmpegOut = Process.execSync(cmdProgram + " -version", {
    encoding: "utf8",
  });
  const ffmpegVerMatch = /ffmpeg version (\d+)\.(\d+)\.(\d+)/.exec(ffmpegOut);
  let ffmpegOk = false;
  if (ffmpegOut.startsWith("ffmpeg version git")) {
    // Accept any Git build (it's up to the developer to ensure that a recent
    // enough version of the FFmpeg source code has been built)
    ffmpegOk = true;
  } else if (ffmpegVerMatch) {
    const ffmpegVerMajor = parseInt(ffmpegVerMatch[1], 10);
    if (ffmpegVerMajor >= 4) {
      ffmpegOk = true;
    }
  }

  if (!ffmpegOk) {
    console.error("FFmpeg >= 4.0.0 not found in $PATH; please install it");
    process.exit(1);
  }

  if (useAudio) {
    cmdCodec += " -map 0:a:0 -c:a copy";
  }
  if (useVideo) {
    cmdCodec += " -map 0:v:0 -c:v copy";
  }

  // Run process
  const cmdArgStr = [
    "-nostdin",
    "-protocol_whitelist file,rtp,udp,pipe",
    // "-loglevel debug",
    // "-analyzeduration 5M",
    // "-probesize 5M",
    "-fflags +genpts",
    `-i -`, // The input - means it will be passed via stdin.
    cmdCodec,
    cmdFormat,
    `-y ${cmdOutputPath}`,
  ]
    .join(" ")
    .trim();

  console.log(`Run command: ${cmdProgram} ${cmdArgStr}`);

  let recProcess = Process.spawn(cmdProgram, cmdArgStr.split(/\s+/));
  let promiseResolveReturnObj = {
    process: recProcess,
    onError: (err) => {},
    onExit: (code, signal) => {},
  };

  // Write the sdp in stdin.
  recProcess.stdin.setDefaultEncoding("utf-8");
  recProcess.stdin.write(
    getSdp(audioPort, audioPortRtcp, videoPort, videoPortRtcp)
  );
  recProcess.stdin.end();

  recProcess.on("error", (err) => {
    console.error("Recording process error:", err);
    promiseResolveReturnObj.onError(err);
  });

  recProcess.on("exit", (code, signal) => {
    console.log("Recording process exit, code: %d, signal: %s", code, signal);
    promiseResolveReturnObj.onExit(code, signal);

    if (!signal || signal === "SIGINT") {
      console.log("Recording stopped");
    } else {
      console.warn(
        "Recording process didn't exit cleanly, output file might be corrupt"
      );
    }
  });

  // FFmpeg writes its logs to stderr
  recProcess.stderr.on("data", (chunk) => {
    chunk
      .toString()
      .split(/\r?\n/g)
      .filter(Boolean) // Filter out empty strings
      .forEach((line) => {
        console.log(line);
        if (line.startsWith("ffmpeg version")) {
          // setTimeout(() => {
          recResolve(promiseResolveReturnObj);
          // }, 1000);
        }
      });
  });

  return promise;
}

function concatFiles(inputFiles, outputFileName) {
  // Return a Promise that can be awaited
  const cmdProgram = FFmpegStatic; // From package "ffmpeg-static"
  let cmdOutputPath = `${__dirname}/recording/${outputFileName}.webm`;

  let concatFile = `${__dirname}/recording/${outputFileName}-concat.txt`;

  let concatFileContent = inputFiles
    .map((fileName) => `file '${__dirname}/recording/${fileName}.webm'\n`)
    .join("");

  fs.writeFileSync(concatFile, concatFileContent);

  // Run process
  const cmdArgStr = [
    "-f concat",
    "-safe 0",
    `-i ${concatFile}`,
    "-c copy",
    `-y ${cmdOutputPath}`,
  ]
    .join(" ")
    .trim();

  let recProcess = Process.spawn(cmdProgram, cmdArgStr.split(/\s+/));

  recProcess.on("error", (err) => {
    console.error("Concat process error:", err);
    promiseResolveReturnObj.onError(err);
  });

  recProcess.on("exit", (code, signal) => {
    console.log("Concat process exit, code: %d, signal: %s", code, signal);
    // Upon successful exit delete the partials recordings and the concat file.
    for (file of inputFiles) {
      fs.unlink(`${__dirname}/recording/${file}.webm`, () => {});
    }
    fs.unlink(concatFile, () => {});
  });

  // FFmpeg writes its logs to stderr
  recProcess.stderr.on("data", (chunk) => {
    chunk
      .toString()
      .split(/\r?\n/g)
      .filter(Boolean) // Filter out empty strings
      .forEach((line) => {
        console.log(line);
      });
  });
}

function PortGenerator() {
  let portCounter = 0;
  return () => {
    portCounter += 1;
    portCounter = portCounter % 1000;

    return portCounter + 5000;
  };
}

const getNextPortNumber = PortGenerator();

class Recorder {
  constructor(router, sessionId, recordingTimeout, onRecordingStop) {
    this.router = router;
    this.audioTransport = null;
    this.videoTransport = null;
    this.audioConsumer = null;
    this.videoConsumer = null;
    this.recordingHandler = null;

    this.consumersResumed = false;

    // Used for generating file names.
    this.sessionId = sessionId;
    this.recordFileNumber = 0;
    // Used for concatenating at the end.
    this.recordedFiles = [];

    this.rtpMonitorInterval = null;

    this.recordingTimeout = recordingTimeout;

    this._onRecordingStop = onRecordingStop;
  }

  _getNextFileName() {
    this.recordFileNumber += 1;
    return `${this.sessionId}-${this.recordFileNumber}`;
  }

  async initialize(audioAndVideoPorts) {
    this.audioTransport = await this.router.createPlainTransport({
      comedia: false,
      rtcpMux: false,
      listenIp: { ip: "127.0.0.1", announcedIp: null },
    });
    await this.audioTransport.connect({
      ip: "127.0.0.1",
      port: audioAndVideoPorts.audioPort,
      rtcpPort: audioAndVideoPorts.audioPortRtcp,
    });

    this.videoTransport = await this.router.createPlainTransport({
      // No RTP will be received from the remote side
      comedia: false,
      // FFmpeg and GStreamer don't support RTP/RTCP multiplexing ("a=rtcp-mux" in SDP)
      rtcpMux: false,
      listenIp: { ip: "127.0.0.1", announcedIp: null },
    });
    await this.videoTransport.connect({
      ip: "127.0.0.1",
      port: audioAndVideoPorts.videoPort,
      rtcpPort: audioAndVideoPorts.videoPortRtcp,
    });
  }

  async record(audioProducerId, videoProducerId) {
    // We don't await on this to save time.
    this._killCurrentRecorderAndTransport();

    // Get the next unused port numbers for this recording.
    const audioAndVideoPorts = {
      audioPort: getNextPortNumber(),
      audioPortRtcp: getNextPortNumber(),
      videoPort: getNextPortNumber(),
      videoPortRtcp: getNextPortNumber(),
    };

    await this.initialize(audioAndVideoPorts);
    // Algo:
    // Call consume with paused true on both the transports
    // to get a consumer object.
    // Start the ffmpeg recording process and save its handler.
    // after the process has started resume both the consumers.
    this.audioConsumer = await this.audioTransport.consume({
      producerId: audioProducerId,
      rtpCapabilities: this.router.rtpCapabilities, // Assume the recorder supports same formats as mediasoup's router
      paused: true,
    });
    this.videoConsumer = await this.videoTransport.consume({
      producerId: videoProducerId,
      rtpCapabilities: this.router.rtpCapabilities, // Assume the recorder supports same formats as mediasoup's router
      paused: true,
    });

    // Consumer cleanup closures.
    // Currently there's no good way to detect
    // when audio and video consumers go inactive.
    // So as a work around we use a heuristic, where
    // if there is no rtp activity for 'this.recordingTimeout'
    // - in miliseconds - we consider it inactive and kill the recorder.
    {
      let audioActive = false;
      let videoActive = false;

      this.videoConsumer.enableTraceEvent(["rtp"]);
      this.videoConsumer.on("trace", (trace) => {
        videoActive = true;
      });
      this.audioConsumer.enableTraceEvent(["rtp"]);
      this.audioConsumer.on("trace", (trace) => {
        audioActive = true;
      });

      this.rtpMonitorInterval = setInterval(() => {
        if (audioActive === false && videoActive === false) {
          // this._killCurrentRecorderAndTransport();
          this.stopRecording();
          return;
        }
        audioActive = false;
        videoActive = false;
        // recordingTimeout / 2 because the moment rtp incoming dies
        // both audioActive and videoActive are true, and when the monitor
        // Interval runs it does not trigger the if condition above, and then sets
        // both to false. Then on the second execution of the rtpMonitorInterval
        // the if gets triggered and we kill the recording.
      }, (this.recordingTimeout / 2) | 0);
    }

    console.log("Starting recording process");
    const recordFileName = this._getNextFileName();
    this.recordingHandler = await startRecordingFfmpeg(
      true,
      true,
      recordFileName,
      audioAndVideoPorts
    );
    this.recordedFiles.push(recordFileName);
    this._resumeConsumers();
  }

  _resumeConsumers() {
    this.audioConsumer && this.audioConsumer.resume();
    this.videoConsumer && this.videoConsumer.resume();
    this.consumersResumed = true;
  }

  _killCurrentRecorderAndTransport() {
    return new Promise((resolve, reject) => {
      if (!this.recordingHandler) {
        resolve();
        return;
      }
      this.recordingHandler.process.kill("SIGINT");
      this.recordingHandler = null;

      // Clear the interval that monitors rtp inactivity.
      clearInterval(this.rtpMonitorInterval);

      // We can't use this.audioTransport in the setTimeout
      // becuase when it executes 'this.audioTransport' might be
      // a different one if startRecording was called after 'stopRecording'.
      const currentAudioTransport = this.audioTransport;
      const currentVideoTransport = this.videoTransport;

      // Close the consumers after 1 second for proper clean up.
      // We have to do this because if we close the transport immediately
      // after sending a SIGINT to the process the process hangs and does not exit.
      setTimeout(() => {
        currentAudioTransport && currentAudioTransport.close();
        currentVideoTransport && currentVideoTransport.close();
        resolve();
      }, 1000);
    });
  }

  async stopRecording() {
    await this._killCurrentRecorderAndTransport();
    concatFiles(
      this.recordedFiles,
      `${this.sessionId}-${(new Date().getTime() / 1000) | 0}`
    );
    this._onRecordingStop();
  }
}

async function createRecorder(router, sessionId, recordingTimeout = 10000) {
  let isRecording = false;
  const recorder = new Recorder(router, sessionId, recordingTimeout, () => {
    isRecording = false;
  });
  return {
    record: async (audioProducerId, videoProducerId) => {
      await recorder.record(audioProducerId, videoProducerId);
      isRecording = true;
    },
    stopRecording: async () => {
      isRecording = false;
      await recorder.stopRecording();
    },
    isRecording: () => {
      return isRecording;
    },
  };
}

module.exports = {
  createRecorder,
};
