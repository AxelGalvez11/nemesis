import { NextResponse } from "next/server";

// Stable download address for the latest signed macOS installer. The account
// page, the welcome email, and the desktop app's own update notice all point
// here, so links in old emails and old app builds keep working even if release
// hosting moves later. GitHub's /releases/latest/download path always serves
// the newest published release's asset by exact name — publishing a release
// must include an asset named Nemesis-mac-arm64.dmg.
const LATEST_MAC_DMG_URL =
  "https://github.com/AxelGalvez11/nemesis-desktop/releases/latest/download/Nemesis-mac-arm64.dmg";

export function GET(): NextResponse {
  return NextResponse.redirect(LATEST_MAC_DMG_URL, 307);
}
