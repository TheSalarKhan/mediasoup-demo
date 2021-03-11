/**
 * IMPORTANT (PLEASE READ THIS):
 *
 * This is not the "configuration file" of mediasoup. This is the configuration
 * file of the mediasoup-demo app. mediasoup itself is a server-side library, it
 * does not read any "configuration file". Instead it exposes an API. This demo
 * application just reads settings from this file (once copied to config.js) and
 * calls the mediasoup API with those settings when appropriate.
 */

const os = require("os");

module.exports = {
  // Flags for the 'debug' module.
  debug: "*mediasoup* *INFO* *WARN* *ERROR*",
  // The server starts with an interactive shell if 'true'.
  interactive: false,
  // Snapshots of the heap are dumped to this folder if set to a string. This
  // happens in the interactive mode.
  heapSnapshotDir: false,
  // Network throttle secret. When network throttle is requested from the client side
  // they have to provide this secret in order to succeed.
  networkThrottleSecret: "y2bi0vh11IUGoQulqDWY",
  // Signaling settings (protoo WebSocket server and HTTP API server).
  http: {
    listenIp: "0.0.0.0",
    // NOTE: Don't change listenPort (client app assumes 4443).
    listenPort: 4443,
  },
  // mediasoup settings.
  mediasoup: {
    // Number of mediasoup workers to launch.
    numWorkers: Object.keys(os.cpus()).length,
    // mediasoup WorkerSettings.
    // See https://mediasoup.org/documentation/v3/mediasoup/api/#WorkerSettings
    workerSettings: {
      logLevel: "warn",
      logTags: [
        "info",
        "ice",
        "dtls",
        "rtp",
        "srtp",
        "rtcp",
        "rtx",
        "bwe",
        "score",
        "simulcast",
        "svc",
        "sctp",
      ],
      rtcMinPort: 40000,
      rtcMaxPort: 49999,
    },
    // mediasoup Router options.
    // See https://mediasoup.org/documentation/v3/mediasoup/api/#RouterOptions
    routerOptions: {
      mediaCodecs: [
        {
          kind: "audio",
          mimeType: "audio/opus",
          preferredPayloadType: 111,
          clockRate: 48000,
          channels: 2,
          parameters: { minptime: 10, useinbandfec: 1 },
        },
        {
          kind: "video",
          mimeType: "video/h264",
          preferredPayloadType: 125,
          clockRate: 90000,
          parameters: {
            "level-asymmetry-allowed": 1,
            "packetization-mode": 1,
            "profile-level-id": "42e01f",
          },
        },
      ],
    },
    // mediasoup WebRtcTransport options for WebRTC endpoints (mediasoup-client,
    // libmediasoupclient).
    // See https://mediasoup.org/documentation/v3/mediasoup/api/#WebRtcTransportOptions
    webRtcTransportOptions: {
      listenIps: [
        {
          // The Ip of the interface to listen on
          ip: "127.0.0.1",
          // The public Ip or the Ip that's reachable by the clients
          announcedIp: "127.0.0.1",
        },
      ],
      initialAvailableOutgoingBitrate: 1000000,
      minimumAvailableOutgoingBitrate: 600000,
      maxSctpMessageSize: 262144,
      // Additional options that are not part of WebRtcTransportOptions.
      maxIncomingBitrate: 1500000,
    },
    // mediasoup PlainTransport options for legacy RTP endpoints (FFmpeg,
    // GStreamer).
    // See https://mediasoup.org/documentation/v3/mediasoup/api/#PlainTransportOptions
    plainTransportOptions: {
      listenIp: {
        // The Ip of the interface to listen on.
        ip: "127.0.0.1",
        // The public Ip or the Ip that's reachable by the clients
        announcedIp: "127.0.0.1",
      },
      maxSctpMessageSize: 262144,
    },
  },
};
