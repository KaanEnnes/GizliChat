// Wraps a native video player module that doesn't exist in Jest's mocked
// native environment, so tests get a no-op stand-in instead.
const React = require('react');

module.exports = () => React.createElement(React.Fragment, null);
