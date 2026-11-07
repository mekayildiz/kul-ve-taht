import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CharacterSetup } from "./CharacterSetup";
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

const settlements = {
  count: 2,
  settlements: [
    { id: "varkhenn-drahkmar", name: "Drahkmar", kind: "capital", kingdomId: "varkhenn", x: 10, y: 10, primaryOutput: "Demir" },
    { id: "varkhenn-kaldrast", name: "Kaldrast", kind: "village", kingdomId: "varkhenn", x: 12, y: 12, primaryOutput: "Tahıl" },
  ],
};

const panel = {
  settlementId: "varkhenn-drahkmar",
  name: "Drahkmar",
  kind: "capital",
  kingdomName: "Varkhenn",
  geography: "Geniş düzlük",
  climate: "Sert kışlar",
  economy: "Demir",
  politicalSituation: "Varkhenn yönetimi",
  militarySituation: "Ana garnizon",
  socialStructure: "Soylular ve zanaatkârlar",
  opportunities: ["Saray"],
  advantages: ["Yüksek siyasi erişim"],
  disadvantages: ["Yüksek rekabet"],
};

describe("CharacterSetup (belge 5.1)", () => {
  it("yerleşim seçilince karşılaştırmalı bilgi paneli gösterir", async () => {
    const client = clientWith((path) => {
      if (path.startsWith("/api/world/settlements")) return json(settlements);
      if (path.startsWith("/api/world/birthplaces")) return json(panel);
      return json({}, 404);
    });

    render(<CharacterSetup t={t} client={client} token="tok" onCreated={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Drahkmar/)).toBeTruthy());
    await userEvent.click(screen.getByRole("button", { name: /Drahkmar/ }));

    await waitFor(() => expect(screen.getByText(/Geniş düzlük/)).toBeTruthy());
    expect(screen.getByText(/Yüksek siyasi erişim/)).toBeTruthy();
    expect(screen.getByText(/Yüksek rekabet/)).toBeTruthy();
  });

  it("doğum yeri seçilmeden karakter oluşturulamaz", async () => {
    const client = clientWith((path) => {
      if (path.startsWith("/api/world/settlements")) return json(settlements);
      return json({}, 404);
    });

    render(<CharacterSetup t={t} client={client} token="tok" onCreated={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Drahkmar/)).toBeTruthy());
    const create = screen.getByRole("button", { name: t.setup.create });
    expect(create.hasAttribute("disabled")).toBe(true);
  });

  it("karakter oluşturunca oluşturulan karakteri bildirir", async () => {
    const onCreated = vi.fn();
    const client = clientWith((path) => {
      if (path.startsWith("/api/world/settlements")) return json(settlements);
      if (path.startsWith("/api/world/birthplaces")) return json(panel);
      if (path === "/api/characters") return json({ characterId: "ch-1" }, 201);
      return json({}, 404);
    });

    render(<CharacterSetup t={t} client={client} token="tok" onCreated={onCreated} />);
    await waitFor(() => expect(screen.getByText(/Drahkmar/)).toBeTruthy());
    await userEvent.type(screen.getByLabelText(t.setup.givenName), "Kael");
    await userEvent.type(screen.getByLabelText(t.setup.surname), "Veyr");
    await userEvent.click(screen.getByRole("button", { name: /Drahkmar/ }));
    await waitFor(() => expect(screen.getByText(/Geniş düzlük/)).toBeTruthy());
    await userEvent.click(screen.getByRole("button", { name: t.setup.create }));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(onCreated.mock.calls[0]?.[0]).toMatchObject({ id: "ch-1", given_name: "Kael", surname: "Veyr" });
  });
});
