const container = document.getElementById("main-container");

function getVideoElementForTrack(track, isLocal) {
  const newVideoElement = document.createElement("video");
  newVideoElement.muted = isLocal ? true : false;
  newVideoElement.playsInline = true;
  newVideoElement.autoplay = true;
  newVideoElement.controls = true;
  newVideoElement.srcObject = new MediaStream([track]);
  newVideoElement.classList.add("vid");
  return newVideoElement;
}
function addANewVideoElement(track, isLocal, text) {
  const newVideoElement = getVideoElementForTrack(track, isLocal);
  // Create the containing div.
  const div = document.createElement("div");
  div.classList.add("containerdiv");
  if (isLocal) {
    div.classList.add("local");
  }
  div.appendChild(newVideoElement);
  div.appendChild(document.createTextNode(text));
  container.appendChild(div);
  return div;
}

let consumerToVideoElementMap = {};
function addVideoElementAgainstId(Id, videoElement) {
  consumerToVideoElementMap[Id] = videoElement;
}
function removeElementForId(Id) {
  const element = consumerToVideoElementMap[Id];
  if (!element) {
    return;
  }
  container.removeChild(element);
  delete consumerToVideoElementMap[Id];
}

function removeAllElementsAndStartClean() {
  console.log(Object.keys(consumerToVideoElementMap));
  for (const key of Object.keys(consumerToVideoElementMap)) {
    container.removeChild(consumerToVideoElementMap[key]);
    delete consumerToVideoElementMap[key];
  }
}

async function main() {
  //////// SECTION 1 INITIALIZATION ///////
  // Initializing connection to the server.
  let roomClient = new mediasoup.RoomClient({
    roomId: "p6afwjkb",
    peerId: `${(Math.random() * 1000) | 0}`,
    displayName: `${(new Date().getTime() / 1000) | 0}`,
    baseUrl: "ws://localhost:4443",
    mode: mediasoup.MODES.VIDEO_ONLY,
    useSimulcast: false,
    forceH264: false,
    producerTopics: location.hash === "#teacher" ? ["teacher"] : ["students"],
    consumerTopics:
      location.hash === "#teacher" ? ["students", "teacher"] : ["teacher"],
  });
  await roomClient.join(false, false);
  // CONNECTED event occurs whenever we connect to the room
  // this happens the first time, and also when we loose the connection
  // and connect again.
  roomClient.on(mediasoup.EVENTS.ROOM.CONNECTED, () => {
    removeAllElementsAndStartClean();
  });
  //////// SECTION 2 PRODUCER EVENTS ///////
  // Listen for events on 'PRODUCER's. Local tracks.
  roomClient.on(mediasoup.EVENTS.PRODUCER.NEW_PRODUCER, (producer) => {
    const track = producer.track;
    // Producers are local tracks
    const element = addANewVideoElement(track, true, "LOCAL");
    addVideoElementAgainstId(producer.id, element);
  });
  // Listen for producers being removed. disableMic, disableShare, disableWebcam
  roomClient.on(mediasoup.EVENTS.PRODUCER.REMOVE_PRODUCER, (producer) => {
    removeElementForId(producer.id);
  });
  //////// SECTION 3 CONSUMER EVENTS ///////
  // Listen for events on 'CONSUMERS's. Remote tracks.
  roomClient.on(mediasoup.EVENTS.CONSUMER.NEW_CONSUMER, (data) => {
    const { consumer, peer } = data;
    // Consumers are remote tracks
    const element = addANewVideoElement(consumer.track, false, peer.id);
    addVideoElementAgainstId(consumer.id, element);
  });
  // Listen for consumers being removed.
  roomClient.on(mediasoup.EVENTS.CONSUMER.REMOVE_CONSUMER, (consumer) => {
    removeElementForId(consumer.id);
  });
  //////// SECTION 4 SUBSCRIBE TO ALL EVENTS ///////
  // Print all supported events
  console.log("Here's a list of mediasoup events supported.");
  console.log(mediasoup.EVENTS);
  //Subscribing to all events
  // First we subscribe to all the event groups.
  // NOTE: ERROR is not an event group
  let eventGroups = Object.keys(mediasoup.EVENTS);
  eventGroups = eventGroups.filter((e) => e !== "ERROR");
  for (const group of eventGroups) {
    let events = Object.keys(mediasoup.EVENTS[group]);
    // For each group we subscribe to all its
    // events.
    for (const ev of events) {
      roomClient.on(ev, (data) => {
        console.log(`Event Group: ${group} Event: ${ev}`, data);
      });
    }
  }
  // We subscribe to the ERROR event separately.
  roomClient.on(mediasoup.EVENTS.ERROR, (data) => {
    console.log(`Event: ERROR`, data);
  });

  window.roomClient = roomClient;
}

(async () => {
  await main();
})();
