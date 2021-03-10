const FFmpegStatic = require("ffmpeg-static");
const Process = require("child_process");
const fs = require("fs");

function getSdpVp8(audioPort, audioPortRtcp, videoPort, videoPortRtcp) {
  return `v=0\no=- 0 0 IN IP4 127.0.0.1\ns=-\nc=IN IP4 127.0.0.1\nt=0 0\nm=audio ${audioPort} RTP/AVPF 111\na=rtcp:${audioPortRtcp}\na=rtpmap:111 opus/48000/2\na=fmtp:111 minptime=10;useinbandfec=1\nm=video ${videoPort} RTP/AVPF 96\na=rtcp:${videoPortRtcp}\na=rtpmap:96 VP8/90000\n`;
}

function getSdpH264(audioPort, audioPortRtcp, videoPort, videoPortRtcp) {
  return `v=0\no=- 0 0 IN IP4 127.0.0.1\ns=-\nc=IN IP4 127.0.0.1\nt=0 0\nm=audio ${audioPort} RTP/AVPF 111\na=rtcp:${audioPortRtcp}\na=rtpmap:111 opus/48000/2\na=fmtp:111 minptime=10;useinbandfec=1\nm=video ${videoPort} RTP/AVPF 125\na=rtcp:${videoPortRtcp}\na=rtpmap:125 H264/90000\na=fmtp:125 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f\n`;
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
  let cmdOutputPath = `${__dirname}/recording/${outputFileName}.mp4`;

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

  let cmdCodec = "";
  // Audio only
  if (useAudio && !useVideo) {
    // -i - means we are reading the first input
    // from stdin which in audio only case will be
    // an audio only stream.
    cmdCodec += "-i -";
    // Add an empty video stream size 1280x720 @25 FPS.
    // We are adding -shortest flag because this is an
    // infinite stream.
    cmdCodec += " -f lavfi -i color=s=10x10 -shortest";
    // Map the audio from the first input and don't re-encode
    cmdCodec += " -map 0:a:0 -c:a aac";
    // Map the video from the second input and encode using vp8
    // because the second input is raw.
    cmdCodec += " -map 1:v:0 -c:v libx264";
  }
  // Video only
  if (useVideo && !useAudio) {
    // -i - means we are reading the first input
    // from stdin which in video only case will be
    // a video only stream. we'll read in at 25fps.
    cmdCodec += "-i -";
    // Add a silent audio track as the second input.
    // -shortest because this is an infinite audio track.
    cmdCodec += " -f lavfi -i anullsrc=r=48000:cl=stereo -shortest";
    // Map the audio from the second and encode using opus.
    cmdCodec += " -map 1:a:0 -c:a aac";
    // Map the video from the first stream and pass on without re-encoding.
    cmdCodec += " -map 0:v:0 -c:v copy";
  }
  // Audio and Video
  if (useVideo && useAudio) {
    // -i - means we are reading the first input
    // from stdin which in audio only case will be
    // an audio only stream.
    cmdCodec += "-i -";
    cmdCodec += " -map 0:a:0 -c:a aac";
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
    cmdCodec,
    "-movflags +faststart -preset ultrafast -r 15",
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
    // getSdpVp8(audioPort, audioPortRtcp, videoPort, videoPortRtcp)
    getSdpH264(audioPort, audioPortRtcp, videoPort, videoPortRtcp)
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
  let cmdOutputPath = `${__dirname}/recording/${outputFileName}.mp4`;

  let inputFilesString = inputFiles
    .map((f, _) => `-i ${__dirname}/recording/${f}.mp4`)
    .join(" ");
  let filterComplexString = inputFiles
    .map(
      (_, index) =>
        `[${index}:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:-1:-1,setsar=1,fps=15,format=yuv420p[v${index}];`
    )
    .join("");
  filterComplexString += inputFiles
    .map((_, index) => `[v${index}][${index}:a]`)
    .join("");
  filterComplexString += `concat=n=${inputFiles.length}:v=1:a=1[v][a]`;

  // Run process
  const cmdArgStr = [
    inputFilesString,
    `-filter_complex ${filterComplexString}`,
    `-map [v] -map [a] -c:v libx264 -c:a aac -movflags +faststart -preset ultrafast -threads 1 -r 15 -y ${cmdOutputPath}`,
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
    // for (file of inputFiles) {
    //   fs.unlink(`${__dirname}/recording/${file}.webm`, () => {});
    // }
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
    this.audioConsumer = null;
    this.videoConsumer = null;
    if (audioProducerId) {
      this.audioConsumer = await this.audioTransport.consume({
        producerId: audioProducerId,
        rtpCapabilities: this.router.rtpCapabilities, // Assume the recorder supports same formats as mediasoup's router
        paused: true,
      });
    }
    if (videoProducerId) {
      this.videoConsumer = await this.videoTransport.consume({
        producerId: videoProducerId,
        rtpCapabilities: this.router.rtpCapabilities, // Assume the recorder supports same formats as mediasoup's router
        paused: true,
      });
    }

    // Consumer cleanup closures.
    // Currently there's no good way to detect
    // when audio and video consumers go inactive.
    // So as a work around we use a heuristic, where
    // if there is no rtp activity for 'this.recordingTimeout'
    // - in miliseconds - we consider it inactive and kill the recorder.
    {
      let audioActive = false;
      let videoActive = false;

      if (this.videoConsumer) {
        this.videoConsumer.enableTraceEvent(["rtp"]);
        this.videoConsumer.on("trace", (trace) => {
          videoActive = true;
        });
      }
      if (this.audioConsumer) {
        this.audioConsumer.enableTraceEvent(["rtp"]);
        this.audioConsumer.on("trace", (trace) => {
          audioActive = true;
        });
      }

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
      this.audioConsumer ? true : false,
      this.videoConsumer ? true : false,
      recordFileName,
      audioAndVideoPorts
    );
    this.recordedFiles.push(recordFileName);

    setTimeout(() => {
      this._resumeConsumers();
    }, 500);
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
      this.audioTransport = null;
      this.videoTransport = null;

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
