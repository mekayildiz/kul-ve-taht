import { useMemo, useState } from "react";
import { DEFAULT_LOCALE, getDictionary, type Locale } from "../i18n";

type Screen = "title" | "intro" | "home";

export function App(): JSX.Element {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const [screen, setScreen] = useState<Screen>("title");
  const t = useMemo(() => getDictionary(locale), [locale]);

  return (
    <div className="kvt-root">
      <header className="kvt-topbar">
        <span className="kvt-brand">{t.appTitle}</span>
        <button
          type="button"
          className="kvt-lang"
          onClick={() => setLocale((prev) => (prev === "tr" ? "en" : "tr"))}
          aria-label="Dil değiştir / Switch language"
        >
          {locale === "tr" ? "TR" : "EN"}
        </button>
      </header>

      <main className="kvt-main">
        {screen === "title" && (
          <section className="kvt-title">
            <h1>{t.appTitle}</h1>
            <p className="kvt-slogan">{t.slogan}</p>
            <div className="kvt-actions">
              <button type="button" onClick={() => setScreen("intro")}>
                {t.menu.newJourney}
              </button>
              <button type="button" disabled>
                {t.menu.continue}
              </button>
              <button type="button" disabled>
                {t.menu.settings}
              </button>
            </div>
          </section>
        )}

        {screen === "intro" && (
          <section className="kvt-intro">
            <ol>
              <li>{t.intro.part1}</li>
              <li>{t.intro.part2}</li>
              <li>{t.intro.part3}</li>
              <li>{t.intro.part4}</li>
            </ol>
            <p className="kvt-closing">{t.intro.closing}</p>
            <button type="button" onClick={() => setScreen("home")}>
              {t.intro.part4}
            </button>
          </section>
        )}

        {screen === "home" && (
          <section className="kvt-home">
            <p>{t.status.loading}</p>
            <p className="kvt-note">{t.status.dataSaver}: off</p>
          </section>
        )}
      </main>

      <nav className="kvt-bottomnav" aria-label="Ana gezinme">
        {[t.nav.map, t.nav.character, t.nav.inventory, t.nav.quests, t.nav.chat].map((label) => (
          <button key={label} type="button" className="kvt-navbtn" disabled>
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
