import type { useRouter } from "expo-router";

/** Back, or Notes when the screen was opened by a link and has nothing behind it (avoids the GO_BACK error). */
export function goBack(router: Pick<ReturnType<typeof useRouter>, "canGoBack" | "back" | "replace">) {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}
