import { useMemo, useState } from "react";
import { DEFAULT_LOCALE, getDictionary, type Locale } from "../i18n";
import { ApiClient, type CharacterDto } from "../api/client";
import { AuthPanel } from "../screens/AuthPanel";
import { WorldOverview } from "../screens/WorldOverview";
import { CharacterSetup } from "../screens/CharacterSetup";
import { PlayPanel } from "../screens/PlayPanel";
import { AdminPanel } from "../screens/AdminPanel";
import { SecurityPanel } from "../screens/SecurityPanel";

type Screen = "title" | "intro" | "auth" | "setup" | "play" | "world" | "admin" | "security";

// Uretimde arayuz ve API ayni Worker'dan sunulur; varsayilan olarak ayni
// kaynak kullanilir (bos taban = goreli yol). Yerelde API ayri porttadir.
// Ayri kaynakli yayinda VITE_API_BASE_URL ile mutlak adres verilir.
const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  (import.meta.env.PROD ? "" : "http://localhost:8787");

export function App(): JSX.Element {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const [screen, setScreen] = useState<Screen>("title");
  const [account, setAccount] = useState<{
    token: string;
    accountId: string;
    role: "player" | "moderator" | "admin";
  } | null>(null);
  const [character, setCharacter] = useState<CharacterDto | null>(null);
  const t = useMemo(() => getDictionary(locale), [locale]);
  const client = useMemo(() => new ApiClient({ baseUrl: API_BASE_URL }), []);
  // Yonetim paneli moderator ve admin'e gorunur; yazma yalnizca admin'de.
  const canManage = account?.role === "admin" || account?.role === "moderator";

  return (
    <div className="kvt-root">
      <header className="kvt-topbar">
        <button type="button" className="kvt-brand" onClick={() => setScreen("title")}>
          {t.appTitle}
        </button>
        <div className="kvt-topright">
          {account && <span className="kvt-account">{t.auth.loggedInAs}</span>}
          {account && (
            <button
              type="button"
              className="kvt-navbtn"
              onClick={() => setScreen("world")}
            >
              {t.nav.map}
            </button>
          )}
          {account && (
            <button
              type="button"
              className="kvt-navbtn"
              onClick={() => setScreen(character ? "play" : "setup")}
            >
              {t.nav.character}
            </button>
          )}
          {account && (
            <button type="button" className="kvt-navbtn" onClick={() => setScreen("security")}>
              {t.admin.security}
            </button>
          )}
          {canManage && (
            <button type="button" className="kvt-adminbtn" onClick={() => setScreen("admin")}>
              {t.nav.admin}
            </button>
          )}
          <button
            type="button"
            className="kvt-lang"
            onClick={() => setLocale((prev) => (prev === "tr" ? "en" : "tr"))}
            aria-label="Dil değiştir / Switch language"
          >
            {locale === "tr" ? "TR" : "EN"}
          </button>
        </div>
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
              <button type="button" onClick={() => setScreen("auth")}>
                {t.menu.login}
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
            <button type="button" onClick={() => setScreen("auth")}>
              {t.menu.newJourney}
            </button>
          </section>
        )}

        {screen === "auth" && (
          <AuthPanel
            t={t}
            client={client}
            onAuthenticated={(token, accountId, role) => {
              setAccount({ token, accountId, role });
              setScreen("setup");
            }}
          />
        )}

        {screen === "setup" && account && (
          <CharacterSetup
            t={t}
            client={client}
            token={account.token}
            onCreated={(created) => {
              setCharacter(created);
              setScreen("play");
            }}
          />
        )}

        {screen === "play" && account && character && (
          <PlayPanel t={t} client={client} token={account.token} character={character} />
        )}

        {screen === "world" && <WorldOverview t={t} client={client} />}

        {screen === "security" && account && <SecurityPanel t={t} client={client} token={account.token} />}

        {screen === "admin" && account && canManage && (
          <AdminPanel t={t} client={client} token={account.token} role={account.role} />
        )}

        {screen === "admin" && account && !canManage && (
          <p className="kvt-error" role="alert">
            {t.admin.moderatorOnly}
          </p>
        )}
      </main>

      <nav className="kvt-bottomnav" aria-label="Ana gezinme">
        {(
          [
            ["map", "world"],
            ["character", character ? "play" : "setup"],
            ["inventory", "play"],
            ["quests", "play"],
            ["chat", "world"],
          ] as const
        ).map(([key, target]) => (
          <button
            key={key}
            type="button"
            className="kvt-navbtn"
            disabled={!account}
            onClick={() => setScreen(target)}
          >
            {t.nav[key]}
          </button>
        ))}
      </nav>
    </div>
  );
}
