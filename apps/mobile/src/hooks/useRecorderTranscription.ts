import { Platform } from "react-native";
import { isNemesisAsrAvailable } from "../../modules/nemesis-asr";
import { selectAsrEngine, asrEngineReason, type AsrEngine } from "@/lib/asr-engine";
import { useAsrModel } from "./useAsrModel";
import { useLiveTranscription } from "./useLiveTranscription";
import { useParakeetTranscription } from "./useParakeetTranscription";

// The seam. RecordSession holds THIS, not either engine directly, so adding or
// removing an engine never touches the recorder.
//
// Both hooks are called unconditionally — hooks rules — and both are inert
// until started, so the one that loses costs nothing. Only the selected engine
// is ever started, and the loser is never subscribed to a live audio stream.

export interface RecorderTranscription {
  engine: AsrEngine;
  /** Plain line for a settings/status row. */
  engineReason: string;
  /** Retry a failed model download. No-op on the Apple path. */
  retryModel: () => void;
}

export function useRecorderTranscription() {
  const model = useAsrModel();
  const apple = useLiveTranscription();
  const parakeet = useParakeetTranscription();

  const capability = {
    platform: Platform.OS,
    nativeAvailable: isNemesisAsrAvailable(),
    modelState: model.state,
  };
  const engine = selectAsrEngine(capability);
  const active = engine === "parakeet" ? parakeet : apple;

  return {
    ...active,
    engine,
    engineReason: asrEngineReason(capability),
    retryModel: model.retry,
  };
}
