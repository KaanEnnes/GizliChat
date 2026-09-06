// Wraps react-native-webview (see its mock alongside this one) and a native
// web view, neither of which exists under Jest — the chat's song messages only
// need the component to be importable and renderable as an inert placeholder.
const React = require('react');

const YoutubeIframe = React.forwardRef((props, ref) =>
  React.createElement('YoutubeIframe', { ...props, ref }),
);
YoutubeIframe.displayName = 'YoutubeIframe';

module.exports = YoutubeIframe;
module.exports.default = YoutubeIframe;
module.exports.getYoutubeMeta = () => Promise.resolve({});
