import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorldOverview } from "./WorldOverview";
import { ApiClient } from "../api/client";
import { getDictionary } from "../i18n";

const t = getDictionary("tr");

function clientWith(handler: (path: string) => Response): ApiClient {
  return new ApiClient({
    baseUrl: "https://api.test",
    fetchImpl: (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      return handler(url.replace("https://api.test", ""));
    }) as typeof fetch,
  });
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const summary = { kingdoms: 5, freeCities: 3, neutralZones: 2, settlements: 130, settlementsTarget: 130 };
const time = { gameDay: 42, gameYear: 3, season: "spring", advancedDays: 42 };
const settlements = {
  count: 1,
  settlements: [
    { id: "varkhenn-drahkmar", name: "Drahkmar", kind: "capital", kingdomId: "varkhenn", x: 1, y: 2, primaryOutput: "grain" },
  ],
};
const assets = {
  count: 2,
  assets: [
    { assetKey: "icon/sword", category: "icon", license: "CC0", source: "self", r2Key: "icons/sword.webp", thumbnailKey: "icons/sword-64.webp", tags: ["combat"] },
    { assetKey: "portrait/pool/00", category: "portrait", license: "CC0", source: "self", r2Key: "portraits/pool-00.webp", thumbnailKey: "portraits/pool-00-96.webp", tags: ["npc"] },
  ],
  attributions: [],
};

describe("WorldOverview gorsel varliklar (belge 17)", () => {
  it("varlik galerisini ve tam boy dosya adini gosterir", async () => {
    const client = clientWith((path) => {
      if (path.startsWith("/api/world/summary")) return json(summary);
      if (path.startsWith("/api/world/time")) return json(time);
      if (path.startsWith("/api/world/settlements")) return json(settlements);
      if (path.startsWith("/api/assets/catalog")) return json(assets);
      return json({}, 404);
    });
    render(<WorldOverview t={t} client={client} />);
    await waitFor(() => expect(screen.getByText(t.world.assets)).toBeTruthy());
    expect(screen.getByText("icon/sword")).toBeTruthy();
    expect(screen.getByText("icons/sword.webp")).toBeTruthy();
  });

  it("veri tasarrufu modu kucuk turev dosyayi ister (belge 17.5)", async () => {
    const client = clientWith((path) => {
      if (path.startsWith("/api/world/summary")) return json(summary);
      if (path.startsWith("/api/world/time")) return json(time);
      if (path.startsWith("/api/world/settlements")) return json(settlements);
      if (path.startsWith("/api/assets/catalog")) return json(assets);
      return json({}, 404);
    });
    render(<WorldOverview t={t} client={client} />);
    await waitFor(() => expect(screen.getByText("icons/sword.webp")).toBeTruthy());
    await userEvent.click(screen.getByLabelText(t.world.dataSaver));
    await waitFor(() => expect(screen.getByText("icons/sword-64.webp")).toBeTruthy());
  });
});
