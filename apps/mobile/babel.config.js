// babel-preset-expo wires the Expo Router + react-native-web transforms and (when
// react-native-reanimated is installed) the worklets plugin. reactCompiler is OFF
// (disabled in app.json) to keep the bleeding-edge SDK-56 surface predictable.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
  };
};
