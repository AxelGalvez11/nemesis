import { redirect } from "next/navigation";

// The landing surface is the Canvas home: one composer, and the learner's sessions below it.
//
// This used to be /sessions — the chat surface — which made a chat thread the thing you got by
// default and therefore the product's primary object. It is not: a Canvas session is. Chat is a
// capability inside a canvas, not a place.
export default function Home() {
  redirect("/learn");
}
