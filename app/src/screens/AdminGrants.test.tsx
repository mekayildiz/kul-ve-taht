import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminGrants } from "./AdminGrants";
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

const characters = [
  { id: "ch-1", givenName: "Kael", surname: "Veyr", accountId: "a1", alive: true, gold: 20, reputation: 5, currentSettlement: null },
];

const attributes = {
  attributes: { strength: 5, agility: 6, endurance: 7, intellect: 8, charisma: 9, perception: 10, leadership: 11 },
};

describe("AdminGrants (belge 20)", () => {
  it("altin islemini gonderir ve denetim kaydini gosterir", async () => {
    const sent: unknown[] = [];
    const client = clientWith((path, init) => {
      if (path.includes("/gold")) {
        sent.push({ path, body: JSON.parse(String(init?.body)) });
        return json({ ok: true, gold: 120 });
      }
      if (path.startsWith("/api/admin/items")) return json({ items: [{ id: "bread", name: "Ekmek", category: "food", baseValue: 1 }] });
      if (path.startsWith("/api/admin/audit"))
        return json({
          entries: [
            { id: "log-1", actorId: "admin-1", action: "admin_grant_gold", targetType: "character", targetId: "ch-1", detail: "{}", createdAt: 1 },
          ],
        });
      if (path.includes("/attributes")) return json(attributes);
      return json({}, 404);
    });

    render(<AdminGrants client={client} token="tok" t={t} characters={characters} />);
    await waitFor(() => expect(screen.getByText("admin_grant_gold")).toBeTruthy());

    const goldInput = screen.getByLabelText(t.admin.goldDelta);
    await userEvent.clear(goldInput);
    await userEvent.type(goldInput, "100");
    await userEvent.click(screen.getByRole("button", { name: t.admin.grantGold }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect((sent[0] as { path: string }).path).toBe("/api/admin/characters/ch-1/gold");
    expect((sent[0] as { body: { delta: number } }).body.delta).toBe(100);
  });

  it("nitelik degerlerini yukler ve kaydeder", async () => {
    const sent: unknown[] = [];
    const client = clientWith((path, init) => {
      if (path.includes("/attributes") && init?.method === "POST") {
        sent.push(JSON.parse(String(init.body)));
        return json({ ok: true, value: 5 });
      }
      if (path.startsWith("/api/admin/items")) return json({ items: [] });
      if (path.startsWith("/api/admin/audit")) return json({ entries: [] });
      if (path.includes("/attributes")) return json(attributes);
      return json({}, 404);
    });

    render(<AdminGrants client={client} token="tok" t={t} characters={characters} />);
    const strength = await screen.findByLabelText(t.admin.attributeNames.strength);
    expect((strength as HTMLInputElement).value).toBe("5");
    await userEvent.click(screen.getByRole("button", { name: t.admin.attributeSaved }));
    await waitFor(() => expect(sent.length).toBe(7));
    expect((sent[0] as { attribute: string }).attribute).toBe("strength");
  });
});
