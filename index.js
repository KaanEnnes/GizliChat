/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { registerBackgroundHandlers } from './src/services/fcmService';

// Must run at module scope (before registerComponent, outside any React
// component) — this is what lets RN Firebase deliver a push message while
// the app is backgrounded or fully killed, see fcmService.ts.
registerBackgroundHandlers();

AppRegistry.registerComponent(appName, () => App);
