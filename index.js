/**
 * @format
 */

// Must be the very first import, before anything (directly or transitively)
// imports `tweetnacl` — it polyfills `crypto.getRandomValues`, which nacl's
// key generation and nonce generation need and RN doesn't provide natively.
// Without this, e2eService.ts's nacl.box.keyPair()/nacl.randomBytes() throw
// on-device (works fine in a browser, since browsers already have it).
import 'react-native-get-random-values';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { registerBackgroundHandlers } from './src/services/fcmService';

// Must run at module scope (before registerComponent, outside any React
// component) — this is what lets RN Firebase deliver a push message while
// the app is backgrounded or fully killed, see fcmService.ts.
registerBackgroundHandlers();

AppRegistry.registerComponent(appName, () => App);
