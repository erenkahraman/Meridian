"use client";

import { useState } from "react";
import Link from "next/link";
import { Modal } from "./Modal";
import { AboutContent } from "./AboutContent";
import { SocialLinks } from "./icons";

/** Right side of the header: nav links, About modal trigger, and social icons. */
export function HeaderActions() {
  const [aboutOpen, setAboutOpen] = useState(false);

  return (
    <div className="header-actions">
      <nav className="site-nav" aria-label="Main">
        <Link href="/">Overview</Link>
        <Link href="/geo">GEO Audit</Link>
        <Link href="/live">Live Query</Link>
        <button
          type="button"
          className="nav-btn"
          onClick={() => setAboutOpen(true)}
        >
          About
        </button>
      </nav>
      <span className="header-social">
        <SocialLinks />
      </span>

      <Modal
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        title="About Meridian"
        size="wide"
      >
        <AboutContent />
      </Modal>
    </div>
  );
}
