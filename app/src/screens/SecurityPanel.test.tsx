import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SecurityPanel } from "./SecurityPanel";
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

const sessions = {
  sessions: [
    { id: "s1", issuedAt: 1, expiresAt: 2, userAgent: "Masaustu", current: true },
    { id: "s2", issuedAt: 3, expiresAt: 4, userAgent: "Telefon", current: false },
  ],
};

describe("SecurityPanel (belge 21.1)", () => {
  it("oturumlari listeler ve tek oturumu iptal eder", async () => {
    const sent: string[] = [];
    const client = clientWith((path, _init) => {
      if (path.endsWith("/revoke")) {
        sent.push(path);
        return json({ ok: true });
      }
      if (path.endsWith("/revoke-others")) {
        sent.push(path);
        return json({ ok: true, revoked: 1 });
      }
      if (path.endsWith("/sessions")) return json(sessions);
      if (path.endsWith("/2fa")) return json({ enabled: false });
      return json({}, 404);
    });

    render(<SecurityPanel client={client} token="tok" t={t} />);
    await waitFor(() => expect(screen.getByText(/Telefon/)).toBeTruthy());
    // Mevcut cihaz icin iptal dugmesi yok; digeri icin var.
    const revokeButtons = screen.getAllByRole("button", { name: t.admin.revoke });
    expect(revokeButtons).toHaveLength(1);
    await userEvent.click(revokeButtons[0]!);
    await waitFor(() => expect(sent).toContain("/api/account/sessions/s2/revoke"));
  });

  it("2FA kurulumunu baslatir ve kurtarma kodlarini gosterir", async () => {
    const client = clientWith((path) => {
      if (path.endsWith("/2fa/setup")) return json({ secret: "ABCDEF234567", uri: "otpauth://totp/x" });
      if (path.endsWith("/2fa/confirm")) return json({ ok: true, recoveryCodes: ["aaaa-bbbb", "cccc-dddd"] });
      if (path.endsWith("/sessions")) return json({ sessions: [] });
      if (path.endsWith("/2fa")) return json({ enabled: false });
      return json({}, 404);
    });

    render(<SecurityPanel client={client} token="tok" t={t} />);
    await userEvent.click(await screen.findByRole("button", { name: t.admin.enable2fa }));
    await waitFor(() => expect(screen.getByText("ABCDEF234567")).toBeTruthy());
    await userEvent.type(screen.getByLabelText(t.admin.twoFactorCode), "123456");
    await userEvent.click(screen.getByRole("button", { name: t.admin.confirm2fa }));
    await waitFor(() => expect(screen.getByText("aaaa-bbbb")).toBeTruthy());
  });
});
