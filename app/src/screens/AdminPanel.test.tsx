import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminPanel } from "./AdminPanel";
import { ApiClient } from "../api/client";
import { getDictionary } from "../i18n";

const t = getDictionary("tr");

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

const overview = {
  accounts: 3,
  characters: 5,
  aliveCharacters: 4,
  settlements: 130,
  kingdoms: 5,
  totalGold: 1234,
  properties: 7,
  companies: 2,
  auctionsOpen: 1,
  gameDay: 42,
  gameYear: 3,
};

const characters = {
  characters: [
    { id: "ch-1", givenName: "Kael", surname: "Veyr", accountId: "a1", alive: true, gold: 20, reputation: 5, currentSettlement: "varkhenn-drahkmar" },
    { id: "ch-2", givenName: "Elif", surname: "Veyr", accountId: "a2", alive: false, gold: 0, reputation: 1, currentSettlement: null },
  ],
};

const economy = { economy: [{ settlementId: "varkhenn-drahkmar", itemId: "wheat", supply: 120, demand: 90, price: 2 }] };

const accounts = {
  accounts: [
    { id: "a1", email: "oyuncu@valedorn.tr", role: "player", status: "active", protected: false, createdAt: 1, characterCount: 1 },
    { id: "a2", email: "mod@valedorn.tr", role: "moderator", status: "active", protected: false, createdAt: 2, characterCount: 0 },
    { id: "a3", email: "kurucu@valedorn.tr", role: "admin", status: "active", protected: true, createdAt: 0, characterCount: 1 },
  ],
};

describe("AdminPanel (belge 20)", () => {
  it("ozet ve karakter listesini gosterir", async () => {
    const client = clientWith((path) => {
      if (path.startsWith("/api/admin/overview")) return json(overview);
      if (path.startsWith("/api/admin/characters")) return json(characters);
      if (path.startsWith("/api/admin/economy")) return json(economy);
      return json({}, 404);
    });
    render(<AdminPanel t={t} client={client} token="tok" role="admin" />);
    await waitFor(() => expect(screen.getByText(t.admin.adminTitle)).toBeTruthy());
    expect(screen.getByText("130")).toBeTruthy();
    expect(screen.getByText("Kael Veyr")).toBeTruthy();
    expect(screen.getByText("wheat")).toBeTruthy();
  });

  it("karakter durumunu degistirme aksiyonunu gonderir", async () => {
    const sent: unknown[] = [];
    const client = clientWith((path, init) => {
      if (path.endsWith("/status")) {
        sent.push(JSON.parse(String(init?.body)));
        return json({ ok: true });
      }
      if (path.startsWith("/api/admin/overview")) return json(overview);
      if (path.startsWith("/api/admin/characters")) return json(characters);
      if (path.startsWith("/api/admin/economy")) return json(economy);
      return json({}, 404);
    });
    render(<AdminPanel t={t} client={client} token="tok" role="admin" />);
    await waitFor(() => expect(screen.getByText("Kael Veyr")).toBeTruthy());
    await userEvent.click(screen.getByRole("button", { name: `${t.admin.markDead}: Kael Veyr` }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect((sent[0] as { status: string }).status).toBe("dead");
  });

  it("yetkisiz oturumda uyari gosterir", async () => {
    const client = clientWith(() => json({ error: { code: "forbidden", message: "yok" } }, 403));
    render(<AdminPanel t={t} client={client} token="tok" role="admin" />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByText(t.admin.adminOnly)).toBeTruthy();
  });

  it("yonetici hesap listesini ve rol kaydetmeyi gosterir", async () => {
    const sent: unknown[] = [];
    const client = clientWith((path, init) => {
      if (path.endsWith("/role")) {
        sent.push({ path, body: JSON.parse(String(init?.body)) });
        return json({ ok: true, role: "moderator" });
      }
      if (path.startsWith("/api/admin/overview")) return json(overview);
      if (path.startsWith("/api/admin/characters")) return json(characters);
      if (path.startsWith("/api/admin/economy")) return json(economy);
      if (path.startsWith("/api/admin/accounts")) return json(accounts);
      return json({}, 404);
    });
    render(<AdminPanel t={t} client={client} token="tok" role="admin" />);
    await waitFor(() => expect(screen.getByText("oyuncu@valedorn.tr")).toBeTruthy());
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: `${t.admin.role}: oyuncu@valedorn.tr` }),
      "moderator",
    );
    await waitFor(() => expect(sent).toHaveLength(1));
    expect((sent[0] as { path: string }).path).toBe("/api/admin/accounts/a1/role");
    expect((sent[0] as { body: { role: string } }).body.role).toBe("moderator");
  });

  it("moderator salt okunur: rol atama ve tohumlama gorunmez", async () => {
    const client = clientWith((path) => {
      if (path.startsWith("/api/admin/overview")) return json(overview);
      if (path.startsWith("/api/admin/characters")) return json(characters);
      if (path.startsWith("/api/admin/economy")) return json(economy);
      return json({}, 404);
    });
    render(<AdminPanel t={t} client={client} token="tok" role="moderator" />);
    await waitFor(() => expect(screen.getByText(t.admin.roleReadOnly)).toBeTruthy());
    expect(screen.queryByText(t.admin.accountList)).toBeNull();
    expect(screen.queryByRole("button", { name: t.admin.seedWorld })).toBeNull();
    expect(screen.queryByRole("button", { name: `${t.admin.markDead}: Kael Veyr` })).toBeNull();
  });

  it("hesabi banlar ve ban kaldirir", async () => {
    const sent: { path: string; body: { status: string } }[] = [];
    const client = clientWith((path, init) => {
      if (path.endsWith("/status") && path.includes("/accounts/")) {
        sent.push({ path, body: JSON.parse(String(init?.body)) });
        return json({ ok: true, status: "banned" });
      }
      if (path.startsWith("/api/admin/overview")) return json(overview);
      if (path.startsWith("/api/admin/characters")) return json(characters);
      if (path.startsWith("/api/admin/economy")) return json(economy);
      if (path.startsWith("/api/admin/accounts")) return json(accounts);
      return json({}, 404);
    });
    render(<AdminPanel t={t} client={client} token="tok" role="admin" />);
    await waitFor(() => expect(screen.getByText("oyuncu@valedorn.tr")).toBeTruthy());
    await userEvent.click(screen.getByRole("button", { name: `${t.admin.ban}: oyuncu@valedorn.tr` }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.path).toBe("/api/admin/accounts/a1/status");
    expect(sent[0]!.body.status).toBe("banned");
  });

  it("korumali (kurucu) hesapta rol ve ban kontrolleri kilitli", async () => {
    const client = clientWith((path) => {
      if (path.startsWith("/api/admin/overview")) return json(overview);
      if (path.startsWith("/api/admin/characters")) return json(characters);
      if (path.startsWith("/api/admin/economy")) return json(economy);
      if (path.startsWith("/api/admin/accounts")) return json(accounts);
      return json({}, 404);
    });
    render(<AdminPanel t={t} client={client} token="tok" role="admin" />);
    await waitFor(() => expect(screen.getByText("kurucu@valedorn.tr")).toBeTruthy());
    expect(screen.getByRole("combobox", { name: `${t.admin.role}: kurucu@valedorn.tr` })).toBeDisabled();
    expect(screen.getByRole("button", { name: `${t.admin.ban}: kurucu@valedorn.tr` })).toBeDisabled();
  });
});
