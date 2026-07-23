import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import * as Network from "expo-network";
import * as SecureStore from "expo-secure-store";
import { isNemesisAsrAvailable, NemesisAsr } from "../../modules/nemesis-asr";
import {
  nextModelState,
  planAsrModel,
  readStoredModelState,
  storedValueFor,
  type AsrModelState,
} from "@/lib/asr-model";

// Owns the on-device speech model: is it here, should it download, did that
// work. All the decisions are in lib/asr-model.ts; this is the I/O around them
// (SecureStore, the network check, and the one call that may download).
//
// The download can only happen through prepare() — the native start() throws
// rather than downloading — so the wifi gate below is the only door and cannot
// be bypassed by a call site that forgets.

const STORE_KEY = "nemesis_asr_model_v1";

async function isUnmetered(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    // Known-wifi only. Cellular, unknown, and "no idea" all read as metered:
    // a few hundred megabytes is not something to guess about.
    return state.type === Network.NetworkStateType.WIFI && state.isConnected === true;
  } catch {
    return false;
  }
}

export function useAsrModel() {
  const [state, setState] = useState<AsrModelState>("absent");
  const supported = Platform.OS === "ios" && isNemesisAsrAvailable();
  // Guards against a second download starting while one is in flight, without
  // waiting for the state re-render to land.
  const inFlightRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    if (!supported) return;
    void SecureStore.getItemAsync(STORE_KEY)
      .then((raw) => {
        if (!cancelled) setState(readStoredModelState(raw));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [supported]);

  const download = useCallback(async () => {
    if (!NemesisAsr || inFlightRef.current) return;
    inFlightRef.current = true;
    setState((current) => nextModelState(current, "start"));
    try {
      await NemesisAsr.prepare();
      setState((current) => nextModelState(current, "success"));
      const value = storedValueFor("ready");
      if (value) await SecureStore.setItemAsync(STORE_KEY, value);
    } catch {
      // Deliberately NOT persisted: a failure should be retried on a later
      // launch, not remembered forever.
      setState((current) => nextModelState(current, "failure"));
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  /** Fetch it ahead of time so it is there when a lecture starts, not during. */
  const ensure = useCallback(
    async (retryRequested = false) => {
      if (!supported) return;
      const unmetered = await isUnmetered();
      const action = planAsrModel({ state, supported, unmetered, retryRequested });
      if (action === "download") await download();
    },
    [download, state, supported],
  );

  // One attempt when the recorder screen opens. Retrying a failure is an
  // explicit tap, never automatic — see lib/asr-model.ts.
  useEffect(() => {
    if (state === "absent") void ensure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, supported]);

  const retry = useCallback(() => ensure(true), [ensure]);

  return { state, supported, retry };
}
