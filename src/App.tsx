import Nav from "./components/Nav";
import Hero from "./components/Hero";
import Demo from "./components/Demo";
import Features from "./components/Features";
import Architecture from "./components/Architecture";
import SourceExplorer from "./components/SourceExplorer";
import Docs from "./components/Docs";
import Footer from "./components/Footer";

export default function App() {
  return (
    <div className="noise relative min-h-screen bg-ink font-display text-white antialiased">
      <Nav />
      <main>
        <Hero />
        <Demo />
        <Features />
        <Architecture />
        <SourceExplorer />
        <Docs />
      </main>
      <Footer />
    </div>
  );
}
