import { Hero } from "@/components/Hero";
import { ValueProps } from "@/components/ValueProps";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <main className="flex flex-col">
      <Hero />
      <ValueProps />
      <Footer />
    </main>
  );
}
