import { describe, expect, it } from "vitest";
import {
  accrueDeposit,
  collectDefault,
  deposit,
  isBankrupt,
  liquidate,
  loanStatus,
  openEscrow,
  payoffAmount,
  peerLoan,
  refundEscrow,
  releaseEscrow,
  withdraw,
  type Account,
  type BankLoan,
} from "./bank";

const account: Account = { id: "a1", ownerId: "c1", kind: "current", balance: 1000, interestRate: 3, openedGameDay: 1 };

describe("Banka cekirdegi (belge 20)", () => {
  it("mevduat faizi gun sayisina gore isler, kasa faizsizdir", () => {
    // 360 gun, %3 -> ~3% artis.
    expect(accrueDeposit(account, 360)).toBeGreaterThan(account.balance);
    const vault: Account = { ...account, kind: "vault", interestRate: 0 };
    expect(accrueDeposit(vault, 360)).toBe(vault.balance);
  });

  it("yatirma ve cekme bakiyeyi ve altini tutarli tutar", () => {
    const dep = deposit(account, 200, 500);
    expect(dep.ok).toBe(true);
    if (!dep.ok) return;
    expect(dep.account.balance).toBe(1200);
    expect(dep.ownerGold).toBe(300);

    const wd = withdraw(dep.account, 500);
    expect(wd.ok).toBe(true);
    if (!wd.ok) return;
    expect(wd.account.balance).toBe(700);
    expect(wd.payout).toBe(500);
  });

  it("yetersiz bakiye/altin ve gecersiz miktari reddeder", () => {
    expect(deposit(account, 100, 50).ok).toBe(false);
    expect(withdraw(account, 5000).ok).toBe(false);
    expect(deposit(account, -5, 500).ok).toBe(false);
  });
});

describe("Emanet (belge 20)", () => {
  it("acilis altini kilitler, yalnizca alici serbest birakir", () => {
    const opened = openEscrow("c1", "c2", 100, "esya teslimi", 500, 10);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.fromGold).toBe(400);
    // Gonderen tek tarafli serbest birakamaz.
    expect(releaseEscrow(opened.escrow, "c1").ok).toBe(false);
    const released = releaseEscrow(opened.escrow, "c2");
    expect(released.ok).toBe(true);
    if (!released.ok) return;
    expect(released.payoutTo).toBe("c2");
    expect(released.amount).toBe(100);
  });

  it("yalnizca gonderen iade alabilir; islem gormus emanet kapanir", () => {
    const opened = openEscrow("c1", "c2", 100, "kosul", 500, 10);
    if (!opened.ok) return;
    const refunded = refundEscrow(opened.escrow, "c1");
    expect(refunded.ok).toBe(true);
    if (!refunded.ok) return;
    expect(refunded.payoutTo).toBe("c1");
    // Kapanmis emanet tekrar islenemez.
    expect(releaseEscrow(refunded.escrow, "c2").ok).toBe(false);
  });
});

describe("Kredi, temerrut, iflas ve tasfiye (belge 20)", () => {
  const loan: BankLoan = { id: "l1", borrowerId: "b", lenderId: "l", principal: 1000, outstanding: 1000, interestRate: 5, issuedGameDay: 1, dueGameDay: 30 };

  it("vade veya asiri borclanma temerrut sayilir", () => {
    expect(loanStatus(loan, 10)).toBe("active");
    expect(loanStatus(loan, 40)).toBe("defaulted");
    expect(loanStatus({ ...loan, outstanding: 3000 }, 10)).toBe("defaulted");
    expect(loanStatus({ ...loan, outstanding: 0 }, 10)).toBe("repaid");
  });

  it("temerrut tahsilati teminatla sinirli, kalan silinir", () => {
    const collected = collectDefault({ ...loan, outstanding: 1500 }, 800);
    expect(collected.recovered).toBe(800);
    expect(collected.writtenOff).toBe(700);
    expect(collected.loan.outstanding).toBe(700);
  });

  it("iflas esigi ve oransal tasfiye dogru calisir", () => {
    expect(isBankrupt(-10)).toBe(true);
    expect(isBankrupt(10)).toBe(false);
    const { payouts, remaining } = liquidate(900, [
      { id: "l1", claim: 600 },
      { id: "l2", claim: 600 },
    ]);
    expect(payouts.l1).toBe(450);
    expect(payouts.l2).toBe(450);
    expect(remaining).toBe(0);
  });

  it("taraflar arasi kredi ve kapanis tutari hesaplanir", () => {
    const result = peerLoan("l", "b", { principal: 500, interestRate: 10, dueGameDay: 60 }, 1000, 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lenderGold).toBe(500);
    expect(payoffAmount(result.loan, 361)).toBeGreaterThan(500);
  });

  it("kendine kredi ve gecersiz oran reddedilir", () => {
    expect(peerLoan("l", "l", { principal: 100, interestRate: 5, dueGameDay: 30 }, 1000, 1).ok).toBe(false);
    expect(peerLoan("l", "b", { principal: 100, interestRate: 500, dueGameDay: 30 }, 1000, 1).ok).toBe(false);
  });
});
