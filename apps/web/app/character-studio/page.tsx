import { redirect } from "next/navigation";

/** The short URL the studio is referred to by. The page itself lives with the other
 *  dev previews, which is where this app keeps things the product does not ship. */
export default function CharacterStudioAlias() {
  redirect("/dev-preview/character-studio");
}
