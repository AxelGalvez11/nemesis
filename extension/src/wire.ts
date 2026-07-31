// The shapes the extension sends to Nemesis.
//
// TYPE-ONLY re-export from packages/shared, so there is exactly one definition
// of this contract in the repository and no chance of the two sides drifting.
// Types vanish at build time, so this costs the bundle nothing and does not
// make the extension a workspace member of the monorepo.
//
// The runtime half of that shared module — the sanitiser — is deliberately NOT
// used here. It runs on the RECEIVING side, in the web app, because the whole
// point is that the receiver must not trust this sender.

export type {
  LmsKind,
  LmsScan,
  ScrapedCourse,
  ScrapedItem,
  ScrapedKind,
  ScrapedLink,
} from "../../packages/shared/src/lms-import.ts";
