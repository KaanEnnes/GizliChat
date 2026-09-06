// react-native-webview reaches for the RNCWebViewModule TurboModule at import
// time (`TurboModuleRegistry.getEnforcing`), which throws in Jest's mocked
// native environment — and because MessageBubble imports it transitively (via
// react-native-youtube-iframe), that failure took down the entire suite before
// a single test ran. Tests only need the component to exist, never to render a
// real web view.
const React = require('react');

const WebView = React.forwardRef((props, ref) =>
  React.createElement('WebView', { ...props, ref }, props.children),
);
WebView.displayName = 'WebView';

module.exports = WebView;
module.exports.WebView = WebView;
module.exports.default = WebView;
