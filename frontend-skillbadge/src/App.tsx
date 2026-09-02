import { lazy, Suspense, useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import Footer from "./components/Footer";
import Navbar from "./components/Navbar";
import { SkillBadgeProvider } from "./context/SkillBadgeContext";

const Home = lazy(() => import("./pages/Home"));
const Badges = lazy(() => import("./pages/Badges"));
const Claim = lazy(() => import("./pages/Claim"));
const NotFound = lazy(() => import("./pages/NotFound"));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <SkillBadgeProvider>
      <div className="bg-grid" aria-hidden="true" />
      <ScrollToTop />
      <Navbar />
      <main className="main">
        <Suspense
          fallback={
            <div className="page-loading" role="status" aria-live="polite">
              <span className="spinner" aria-hidden="true" />
              Loading…
            </div>
          }
        >
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/badges" element={<Badges />} />
            <Route path="/claim" element={<Claim />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
      <Footer />
    </SkillBadgeProvider>
  );
}