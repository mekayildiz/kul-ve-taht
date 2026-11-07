import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthPanel } from "./AuthPanel";
import { ApiClient } from "../api/client";
import { getDictionary } from "../i18n";

const t = getDictionary();

function clientWith(handler: (path: string, init?: RequestInit) => Response): ApiClient {
  return new ApiClient({
    baseUrl: "https://api.test",
    fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      return handler(url.replace("https://api.test", ""), init);
    }) as typeof fetch,
  });
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Formu kapsam alir; sekme dugmeleriyle karismayi onler. */
function form(): HTMLElement {
  const element = document.querySelector("form");
  if (!element) throw new Error("form bulunamadi");
  return element as HTMLElement;
}

describe("AuthPanel", () => {
  it("giris basarili oldugunda token ve hesap kimligini bildirir", async () => {
    const onAuthenticated = vi.fn();
    const client = clientWith((path) => {
      if (path === "/api/auth/login") return json({ token: "tok-1", expiresAt: Date.now() + 1000 });
      if (path === "/api/me") return json({ accountId: "acc-9", role: "player" });
      return json({}, 404);
    });

    render(<AuthPanel t={t} client={client} onAuthenticated={onAuthenticated} />);
    await userEvent.type(screen.getByLabelText(t.auth.email), "oyuncu@valedorn.tr");
    await userEvent.type(screen.getByLabelText(/Parola/), "cok-guclu-parola-1");
    await userEvent.click(within(form()).getByRole("button", { name: t.auth.submitLogin }));

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith("tok-1", "acc-9", "player"));
  });

  it("hatali giriste Turkce hata mesaji gosterir", async () => {
    const client = clientWith(() => json({ error: { code: "invalid_credentials", message: "hata" } }, 401));
    render(<AuthPanel t={t} client={client} onAuthenticated={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(t.auth.email), "x@valedorn.tr");
    await userEvent.type(screen.getByLabelText(/Parola/), "yanlis-parola-99");
    await userEvent.click(within(form()).getByRole("button", { name: t.auth.submitLogin }));

    expect(await screen.findByRole("alert")).toHaveTextContent(t.auth.errorInvalidCredentials);
  });

  it("kota siniri (throttled) icin anlasilir mesaj gosterir", async () => {
    const client = clientWith(() => json({ error: { code: "throttled", message: "x" } }, 429));
    render(<AuthPanel t={t} client={client} onAuthenticated={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(t.auth.email), "x@valedorn.tr");
    await userEvent.type(screen.getByLabelText(/Parola/), "cok-guclu-parola-1");
    await userEvent.click(within(form()).getByRole("button", { name: t.auth.submitLogin }));

    expect(await screen.findByRole("alert")).toHaveTextContent(t.status.quotaLimited);
  });

  it("kayit modunda once kayit sonra giris yapar", async () => {
    const calls: string[] = [];
    const onAuthenticated = vi.fn();
    const client = clientWith((path) => {
      calls.push(path);
      if (path === "/api/auth/register") return json({ accountId: "acc-7" }, 201);
      if (path === "/api/auth/login") return json({ token: "tok-7", expiresAt: Date.now() + 1000 });
      if (path === "/api/me") return json({ accountId: "acc-7", role: "player" });
      return json({}, 404);
    });

    render(<AuthPanel t={t} client={client} onAuthenticated={onAuthenticated} />);
    await userEvent.click(screen.getByRole("button", { name: t.menu.register }));
    await userEvent.type(screen.getByLabelText(t.auth.email), "yeni@valedorn.tr");
    await userEvent.type(screen.getByLabelText(/Parola/), "cok-guclu-parola-1");
    await userEvent.click(within(form()).getByRole("button", { name: t.auth.submitRegister }));

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith("tok-7", "acc-7", "player"));
    expect(calls).toEqual(["/api/auth/register", "/api/auth/login", "/api/me"]);
  });
});
