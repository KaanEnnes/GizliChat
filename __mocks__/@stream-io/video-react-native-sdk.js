// @stream-io/video-react-native-sdk wraps native WebRTC modules that don't
// exist in Jest's mocked native environment, so tests get a no-op stand-in.
const React = require('react');

const fakeCall = {
  ringing: false,
  isCreatedByMe: true,
  state: { custom: {} },
  camera: { disable: async () => {}, enable: async () => {} },
  microphone: { enable: async () => {}, disable: async () => {} },
};

const fakeClient = {
  call: () => ({
    ...fakeCall,
    getOrCreate: async () => ({}),
  }),
};

module.exports = {
  StreamVideoClient: {
    getOrCreateInstance: () => fakeClient,
  },
  StreamVideo: ({ children }) => React.createElement(React.Fragment, null, children),
  StreamCall: ({ children }) => React.createElement(React.Fragment, null, children),
  CallContent: () => null,
  RingingCallContent: () => null,
  useCalls: () => [],
  useCall: () => null,
  useCallStateHooks: () => ({
    useCallCallingState: () => 'idle',
  }),
  CallingState: {
    IDLE: 'idle',
    RINGING: 'ringing',
    JOINING: 'joining',
    JOINED: 'joined',
    LEFT: 'left',
    RECONNECTING: 'reconnecting',
    RECONNECTING_FAILED: 'reconnecting-failed',
  },
  callManager: {
    start: () => {},
    stop: () => {},
  },
};
