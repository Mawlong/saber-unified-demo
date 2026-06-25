"use client";

import { useEffect, useState } from "react";
import { Button, Field, Select, Card, StatusPill } from "@/components/ui";
import { EngineeringPanel } from "@/components/api-view";
import {
  clients,
  getClient,
  priceFor,
  buildQuoteFor,
  toQuoteResponse,
  resolveRouting,
  buildCreateRequest,
  explainPrice,
  partyTypes,
  SENDER_ADDRESS,
  RECEIVER_ADDRESS,
  type ClientConfig,
  type Quote,
  type Price,
  type PriceExplain,
  type RoutingDecision,
  type AccountType,
  type PartnerType,
  type SellCurrency,
  type TxnType,
  type AmountBasis,
  type CreateInput,
} from "@/lib/transactions";

/*
  Unified transaction demo. ONE editable config drives everything:
  edit it in the flow's Config step or in the Calculator tab, and the prices, quote, and
  create-transaction all follow. Stages: Config -> Quote -> Result -> Create -> Process -> Done.
  Off-ramp (sell) only. Amount can be fixed by from_amount (crypto) or to_amount (INR).
*/

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const pct = (f: number) => `${(f * 100).toFixed(2)}%`;
const num = (s: string) => { const n = parseFloat(s); return isNaN(n) ? 0 : n; };
const cx = (n: number, ccy: string) => `${n} ${ccy}`;

const STAGES = [
  { label: "Config", step: 0 }, { label: "Quote", step: 1 }, { label: "Result", step: 3 },
  { label: "Create", step: 4 }, { label: "Process", step: 5 }, { label: "Done", step: 6 },
];
type View = "flow" | "calc";

/* ---------- the editable config form ---------- */
type CfgForm = {
  label: string; kind: string; ccy: SellCurrency;
  srcStables: string; srcD9: string;
  spread: string; priceLock: string; tds: string; taxOnFee: string; platFee: string;
  platformPct: string; clientFeePct: string; discountPct: string;
  minP: string; maxP: string; compensate: boolean;
  payoutAgg: string; payoutMethod: string; payoutAcct: string;
  nreOn: boolean; nreAgg: string; nreAcct: string;
  tradSpread: string; tradMin: string; tradMax: string;
};
function cfgToForm(c: ClientConfig): CfgForm {
  const p = c.pricing_config;
  const t = p.traditional_rail;
  return {
    label: c.label, kind: c.kind, ccy: c.from_currency,
    srcStables: String(c._source.stables), srcD9: String(c._source.d9 || 88.5),
    spread: String(p.client_spread * 100), priceLock: String(p.price_lock_spread * 100),
    tds: String(p.tds * 100), taxOnFee: String(p.tax_on_fee * 100), platFee: String(p.platform_fee_usd),
    platformPct: String(p.platform_fee * 100), clientFeePct: String(p.client_fee * 100), discountPct: String(p.discount * 100),
    minP: String(p.min_price), maxP: String(p.max_price), compensate: !!p.compensate_tds,
    payoutAgg: c.partner_config.payout_partner.AggregatorName, payoutMethod: c.partner_config.payout_partner.PaymentMethodName,
    payoutAcct: c.partner_config.payout_partner.AccountNumber || "",
    nreOn: !!c.partner_config.nre_payout_partner,
    nreAgg: c.partner_config.nre_payout_partner?.AggregatorName || "D9",
    nreAcct: c.partner_config.nre_payout_partner?.AccountNumber || "D9-IN-001",
    tradSpread: String((t?.client_spread ?? 0.003) * 100), tradMin: String(t?.min_price ?? 80), tradMax: String(t?.max_price ?? 100),
  };
}
function formToCfg(f: CfgForm): ClientConfig {
  const frac = (s: string) => num(s) / 100;
  const pinned = num(f.minP) === num(f.maxP) && num(f.minP) !== 0;
  return {
    id: "_active", label: f.label || "Custom", kind: f.kind || "editable config", from_currency: f.ccy,
    partner_config: {
      payout_partner: { type: "RPFS", AggregatorName: f.payoutAgg || "Transxt", PaymentMethodName: f.payoutMethod || "bank_transfer", AccountNumber: f.payoutAcct || undefined },
      ...(f.nreOn ? { nre_payout_partner: { type: "D9" as PartnerType, AggregatorName: f.nreAgg || "D9", PaymentMethodName: "bank_transfer", AccountNumber: f.nreAcct || undefined } } : {}),
    },
    pricing_config: {
      platform_fee_usd: num(f.platFee), platform_fee: frac(f.platformPct), tax_on_fee: frac(f.taxOnFee), discount: frac(f.discountPct), client_fee: frac(f.clientFeePct),
      client_spread: frac(f.spread), price_lock_spread: frac(f.priceLock), tds: frac(f.tds), compensate_tds: f.compensate,
      min_price: num(f.minP), max_price: num(f.maxP), price_stream: pinned ? undefined : "Xe",
      ...(f.nreOn ? { traditional_rail: { client_spread: frac(f.tradSpread), price_stream: "Xe", min_price: num(f.tradMin), max_price: num(f.tradMax) } } : {}),
    },
    _source: { stables: num(f.srcStables), d9: num(f.srcD9) },
  };
}

export default function Page() {
  const [view, setView] = useState<View>("flow");
  const [step, setStep] = useState(0);

  // the single editable config (defaults to the template with two prices)
  const [form, setForm] = useState<CfgForm>(() => cfgToForm(getClient("d")));
  const set = <K extends keyof CfgForm>(k: K, v: CfgForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const cfg = formToCfg(form);

  // quote inputs (off-ramp / sell only)
  const [basis, setBasis] = useState<AmountBasis>("from_amount");
  const [fromAmt, setFromAmt] = useState("100"); // crypto
  const [toAmt, setToAmt] = useState("8500"); // INR
  const amountValue = basis === "from_amount" ? num(fromAmt) : num(toAmt);
  const [txnType, setTxnType] = useState<TxnType>("C2C");
  const [isNri, setIsNri] = useState(true);
  const [quote, setQuote] = useState<Quote | null>(null);

  // create inputs
  const [purpose, setPurpose] = useState("IR001");
  const [sourceIncome, setSourceIncome] = useState("SALARY");
  const [sFirst, setSFirst] = useState("Jane");
  const [sLast, setSLast] = useState("Public");
  const [sDob, setSDob] = useState("1990-05-12");
  const [sNat, setSNat] = useState("IN");
  const [rFirst, setRFirst] = useState("Rahul");
  const [rLast, setRLast] = useState("Sharma");
  const [bizName, setBizName] = useState("Acme Exports Pvt Ltd");
  const [bizReg, setBizReg] = useState("U74999KA2015PTC000000");
  const [rcvBiz, setRcvBiz] = useState("Globex Ltd");
  const [accountType, setAccountType] = useState<AccountType>("NRE");
  const [accountNo, setAccountNo] = useState("1234567890");
  const [ifsc, setIfsc] = useState("HDFC0001234");

  const pt = partyTypes(txnType);
  // party scope is derived from is_nri: NRI => first party, resident => third party.
  const firstParty = isNri;
  const mirror = firstParty && !pt.senderBusiness && !pt.receiverBusiness; // receiver = sender (individual self)

  const createInput: CreateInput = {
    client_id: "_active", quote_id: quote?.quote_id ?? "", transaction_type: txnType,
    party_scope: firstParty ? "FIRST_PARTY" : "THIRD_PARTY", purpose_code: purpose, source_of_income: sourceIncome, message: "June support",
    sender: { is_business: pt.senderBusiness, legal_name: bizName, registration_number: bizReg, first_name: sFirst, last_name: sLast, date_of_birth: sDob, nationality: sNat, is_nri: isNri, id_type: "PASSPORT", id_number: "P1234567", email: "jane@example.com", mobile: "+919876543210", address: SENDER_ADDRESS },
    receiver: { is_business: pt.receiverBusiness, legal_name: rcvBiz, first_name: mirror ? sFirst : rFirst, last_name: mirror ? sLast : rLast, relationship: mirror ? "SELF" : pt.receiverBusiness ? "SUPPLIER" : "PARENT", address: mirror ? SENDER_ADDRESS : RECEIVER_ADDRESS, account_number: accountNo, ifsc, account_type: accountType },
  };

  const routing = quote ? resolveRouting(cfg, accountType, quote) : null;
  const createRequest = buildCreateRequest(createInput);

  function makeQuote() {
    setQuote(buildQuoteFor(cfg, { amount_basis: basis, amount_value: amountValue, transaction_type: txnType, is_nri: isNri }));
  }
  function restart() { setStep(0); setQuote(null); setView("flow"); }
  function goStage(s: number) { setView("flow"); setStep(s); }

  return (
    <div>
      <TopBar view={view} setView={setView} step={step} goStage={goStage} />

      {view === "calc" && <CalcView form={form} set={set} cfg={cfg} onBack={() => setView("flow")} />}

      {view === "flow" && (
        <>
          {step === 0 && <ConfigStep form={form} set={set} cfg={cfg} onLoad={(id) => setForm(cfgToForm(getClient(id)))} onNext={() => setStep(1)} />}

          {step === 1 && (
            <QuoteInputStep client={cfg.label} currency={cfg.from_currency}
              basis={basis} setBasis={setBasis} fromAmt={fromAmt} setFromAmt={setFromAmt} toAmt={toAmt} setToAmt={setToAmt}
              txnType={txnType} setTxnType={setTxnType} isNri={isNri} setIsNri={setIsNri}
              onBack={() => setStep(0)} onNext={() => { makeQuote(); setStep(2); }} />
          )}

          {step === 2 && <QuoteLoadingStep client={cfg.label} onDone={() => setStep(3)} />}

          {step === 3 && quote && (
            <QuoteResultStep key={quote.quote_id} quote={quote} clientName={cfg.label} txnType={txnType} isNri={isNri} currency={cfg.from_currency}
              onBack={() => setStep(1)} onRequote={makeQuote} onNext={() => setStep(4)} />
          )}

          {step === 4 && quote && (
            <CreateInputStep quoteId={quote.quote_id} txnType={txnType} isNri={isNri}
              senderBusiness={pt.senderBusiness} receiverBusiness={pt.receiverBusiness} firstParty={firstParty} mirror={mirror}
              purpose={purpose} setPurpose={setPurpose} sourceIncome={sourceIncome} setSourceIncome={setSourceIncome}
              sFirst={sFirst} setSFirst={setSFirst} sLast={sLast} setSLast={setSLast} sDob={sDob} setSDob={setSDob} sNat={sNat} setSNat={setSNat}
              rFirst={rFirst} setRFirst={setRFirst} rLast={rLast} setRLast={setRLast}
              bizName={bizName} setBizName={setBizName} bizReg={bizReg} setBizReg={setBizReg} rcvBiz={rcvBiz} setRcvBiz={setRcvBiz}
              accountType={accountType} setAccountType={setAccountType} accountNo={accountNo} setAccountNo={setAccountNo} ifsc={ifsc} setIfsc={setIfsc}
              nreEnabled={!!cfg.partner_config.nre_payout_partner} createRequest={createRequest} onBack={() => setStep(3)} onCreate={() => setStep(5)} />
          )}

          {step === 5 && routing && quote && (
            <ProcessingStep routing={routing} business={pt.senderBusiness || pt.receiverBusiness} createRequest={createRequest} onDone={() => setStep(6)} />
          )}

          {step === 6 && routing && (
            <DoneStep routing={routing} currency={cfg.from_currency} business={pt.senderBusiness || pt.receiverBusiness} createRequest={createRequest} onRestart={restart} />
          )}
        </>
      )}
    </div>
  );
}

/* ---------------- top bar ---------------- */
function TopBar({ view, setView, step, goStage }: { view: View; setView: (v: View) => void; step: number; goStage: (s: number) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
      <div className="flex items-center gap-1.5">
        {STAGES.map((s, i) => {
          const isCurrent = view === "flow" && step >= s.step && (i === STAGES.length - 1 || step < STAGES[i + 1].step);
          const reachable = s.step <= step;
          const done = view === "flow" && step > s.step;
          return (
            <div key={s.label} className="flex items-center gap-1.5">
              <button disabled={!reachable} onClick={() => goStage(s.step)}
                className={`flex items-center gap-1 h-7 px-2.5 rounded-full text-[12px] font-medium transition-colors ${
                  isCurrent ? "bg-[var(--color-accent)] text-[var(--color-accent-ink)]"
                  : done ? "bg-[var(--color-good-bg)] text-[var(--color-good)] hover:opacity-80 cursor-pointer"
                  : reachable ? "bg-[var(--color-line)] text-[var(--color-muted)] hover:opacity-80 cursor-pointer"
                  : "bg-[var(--color-line)] text-[var(--color-faint)] cursor-not-allowed opacity-60"}`}>
                {done ? "✓" : i + 1} {s.label}
              </button>
              {i < STAGES.length - 1 && <span className="w-3 h-px bg-[var(--color-line)]" />}
            </div>
          );
        })}
      </div>
      <button onClick={() => setView(view === "calc" ? "flow" : "calc")}
        className={`h-8 px-3 rounded-[var(--radius)] text-[12px] font-medium border ${view === "calc" ? "bg-[var(--color-ink)] text-white border-[var(--color-ink)]" : "border-[var(--color-line)] text-[var(--color-muted)] hover:bg-[var(--color-bg)]"}`}>
        Pricing calculator
      </button>
    </div>
  );
}

/* ---------------- editable pricing + partner editors ---------------- */
function PricingEditor({ form: f, set }: { form: CfgForm; set: <K extends keyof CfgForm>(k: K, v: CfgForm[K]) => void }) {
  const pinned = num(f.minP) === num(f.maxP) && num(f.minP) !== 0;
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <Select label="Sell currency" value={f.ccy} onChange={(v) => set("ccy", v as SellCurrency)} options={[{ value: "USDC", label: "USDC" }, { value: "USDT", label: "USDT" }]} />
        <Field label="Source price (live)" value={f.srcStables} onChange={(e) => set("srcStables", e.target.value)} hint={pinned ? "ignored — min = max (static)" : "from the price stream"} />
        <Field label="Client spread %" value={f.spread} onChange={(e) => set("spread", e.target.value)} hint="negative = better rate" />
        <Field label="Price-lock spread %" value={f.priceLock} onChange={(e) => set("priceLock", e.target.value)} hint="extra spread, applied only when output (INR) is fixed" />
        <Field label="Min price" value={f.minP} onChange={(e) => set("minP", e.target.value)} />
        <Field label="Max price" value={f.maxP} onChange={(e) => set("maxP", e.target.value)} hint="set min = max to pin a static price" />
        <Field label={`Service charge (flat, ${f.ccy})`} value={f.platFee} onChange={(e) => set("platFee", e.target.value)} hint="flat per-txn fee in crypto; changes the net, not the rate" />
        <Field label="Platform fee %" value={f.platformPct} onChange={(e) => set("platformPct", e.target.value)} hint="% of converted INR; GST applies to this" />
        <Field label="GST on platform fee %" value={f.taxOnFee} onChange={(e) => set("taxOnFee", e.target.value)} hint="only bites if platform fee % > 0" />
        <Field label="Client fee %" value={f.clientFeePct} onChange={(e) => set("clientFeePct", e.target.value)} hint="% of converted INR" />
        <Field label="Discount %" value={f.discountPct} onChange={(e) => set("discountPct", e.target.value)} hint="% of INR added back to the net" />
        <Field label="TDS %" value={f.tds} onChange={(e) => set("tds", e.target.value)} hint="on converted INR; RPFS + resident only" />
        <Select label="compensate_tds" value={f.compensate ? "yes" : "no"} onChange={(v) => set("compensate", v === "yes")} options={[{ value: "no", label: "No" }, { value: "yes", label: "Yes — Saber absorbs TDS" }]} />
      </div>
      <div>
        <Select label="NRE payout partner / traditional rail" value={f.nreOn ? "on" : "off"} onChange={(v) => set("nreOn", v === "on")}
          options={[{ value: "off", label: "Not set (one price)" }, { value: "on", label: "Set — adds the D9 traditional price" }]} />
        {f.nreOn && (
          <div className="grid sm:grid-cols-2 gap-3 mt-3">
            <Field label="D9 source price" value={f.srcD9} onChange={(e) => set("srcD9", e.target.value)} />
            <Field label="D9 spread %" value={f.tradSpread} onChange={(e) => set("tradSpread", e.target.value)} />
            <Field label="D9 min" value={f.tradMin} onChange={(e) => set("tradMin", e.target.value)} />
            <Field label="D9 max" value={f.tradMax} onChange={(e) => set("tradMax", e.target.value)} />
          </div>
        )}
      </div>
    </div>
  );
}
function PartnerEditor({ form: f, set }: { form: CfgForm; set: <K extends keyof CfgForm>(k: K, v: CfgForm[K]) => void }) {
  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Payout partner" value={f.payoutAgg} onChange={(e) => set("payoutAgg", e.target.value)} />
        <Field label="Payment method" value={f.payoutMethod} onChange={(e) => set("payoutMethod", e.target.value)} />
        <Field label="Account number" value={f.payoutAcct} onChange={(e) => set("payoutAcct", e.target.value)} />
      </div>
      {f.nreOn && (
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="NRE payout partner" value={f.nreAgg} onChange={(e) => set("nreAgg", e.target.value)} />
          <Field label="NRE account" value={f.nreAcct} onChange={(e) => set("nreAcct", e.target.value)} />
        </div>
      )}
      <p className="text-[12px] text-[var(--color-faint)]">An NRE account uses the NRE payout partner if one is set; every other account uses the payout partner.</p>
    </div>
  );
}

/* Reusable live quote preview (right column of Config + Calculator). */
function QuotePreview({ cfg, showCalc }: { cfg: ClientConfig; showCalc?: boolean }) {
  const ccy = cfg.from_currency;
  const [basis, setBasis] = useState<AmountBasis>("from_amount");
  const [fromAmt, setFromAmt] = useState("100");
  const [toAmt, setToAmt] = useState("8500");
  const [isNri, setIsNri] = useState(false);
  const value = basis === "from_amount" ? num(fromAmt) : num(toAmt);
  const rails: PartnerType[] = [cfg.partner_config.payout_partner.type, ...(cfg.partner_config.nre_payout_partner ? [cfg.partner_config.nre_payout_partner.type] : [])];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Select label="Amount basis" value={basis} onChange={(v) => setBasis(v as AmountBasis)}
          options={[{ value: "from_amount", label: `from_amount (${ccy})` }, { value: "to_amount", label: "to_amount (INR)" }]} />
        {basis === "from_amount"
          ? <Field label={`Sell (${ccy})`} inputMode="decimal" value={fromAmt} onChange={(e) => setFromAmt(e.target.value.replace(/[^0-9.]/g, ""))} />
          : <Field label="Convert (INR)" inputMode="numeric" value={toAmt} onChange={(e) => setToAmt(e.target.value.replace(/[^0-9]/g, ""))} />}
      </div>
      <Select label="Recipient NRI (is_nri)" value={isNri ? "yes" : "no"} onChange={(v) => setIsNri(v === "yes")} options={[{ value: "no", label: "Resident (TDS on stables)" }, { value: "yes", label: "NRI (no TDS)" }]} />
      <div className="space-y-3">{rails.map((r) => <PriceCard key={r} price={priceFor(cfg, r, basis, value, isNri)} currency={ccy} />)}</div>
      {rails.length === 1 && <p className="text-[12px] text-[var(--color-faint)]">One price: no NRE payout partner is set.</p>}
      {showCalc && <Collapsible title="Show the calculation"><CalcBreakdown cfg={cfg} basis={basis} value={value} isNri={isNri} /></Collapsible>}
    </div>
  );
}

/* ---------------- 0. config (two columns) ---------------- */
function ConfigStep({ form, set, cfg, onLoad, onNext }: { form: CfgForm; set: <K extends keyof CfgForm>(k: K, v: CfgForm[K]) => void; cfg: ClientConfig; onLoad: (id: string) => void; onNext: () => void }) {
  return (
    <Card className="p-6 space-y-6 animate-fadeup">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight">Client configuration</h1>
          <p className="text-[13px] text-[var(--color-muted)] mt-0.5">Edit the config on the left; the quote on the right updates live.</p>
        </div>
        <div className="w-56">
          <Select label="Load a template" value="" onChange={(v) => v && onLoad(v)} options={[{ value: "", label: "Start from…" }, ...clients.map((c) => ({ value: c.id, label: `${c.label} — ${c.kind}` }))]} />
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* LEFT — configuration */}
        <div className="space-y-3">
          <ColTitle>Configuration</ColTitle>
          <Collapsible title="Pricing configuration" defaultOpen><PricingEditor form={form} set={set} /></Collapsible>
          <Collapsible title="Partner mapping configuration"><PartnerEditor form={form} set={set} /></Collapsible>
        </div>
        {/* RIGHT — live quote */}
        <div className="space-y-3">
          <ColTitle>Quote</ColTitle>
          <QuotePreview cfg={cfg} showCalc />
        </div>
      </div>

      <div className="flex justify-end"><Button onClick={onNext}>Use this config →</Button></div>
      <EngineeringPanel blocks={[{ label: "partner_config", data: cfg.partner_config }, { label: "pricing_config", data: cfg.pricing_config }]} />
    </Card>
  );
}
function ColTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-[13px] font-semibold text-[var(--color-ink)]">{children}</div>;
}

/* ---------------- 1. quote input ---------------- */
function QuoteInputStep(p: {
  client: string; currency: SellCurrency;
  basis: AmountBasis; setBasis: (v: AmountBasis) => void;
  fromAmt: string; setFromAmt: (v: string) => void; toAmt: string; setToAmt: (v: string) => void;
  txnType: TxnType; setTxnType: (v: TxnType) => void; isNri: boolean; setIsNri: (v: boolean) => void; onBack: () => void; onNext: () => void;
}) {
  return (
    <Card className="p-6 space-y-5 animate-fadeup">
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight">Get a quote</h1>
        <p className="text-[13px] text-[var(--color-muted)] mt-0.5">{p.client} · {p.currency} → INR (sell). Fix either the crypto in or the INR out.</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Select label="Amount basis" value={p.basis} onChange={(v) => p.setBasis(v as AmountBasis)}
          options={[{ value: "from_amount", label: `from_amount — fix crypto sold (${p.currency})` }, { value: "to_amount", label: "to_amount — fix INR converted" }]} />
        {p.basis === "from_amount"
          ? <Field label={`Sell (${p.currency})`} inputMode="decimal" value={p.fromAmt} onChange={(e) => p.setFromAmt(e.target.value.replace(/[^0-9.]/g, ""))} hint="service charge is deducted from this first" />
          : <Field label="Convert (INR)" inputMode="numeric" value={p.toAmt} onChange={(e) => p.setToAmt(e.target.value.replace(/[^0-9]/g, ""))} hint="service charge is added on top, in crypto" />}
        <Select label="Transaction type" value={p.txnType} onChange={(v) => p.setTxnType(v as TxnType)} options={[{ value: "C2C", label: "C2C — consumer to consumer" }, { value: "C2B", label: "C2B" }, { value: "B2C", label: "B2C" }, { value: "B2B", label: "B2B" }]} />
        <Select label="Recipient is NRI (is_nri)" value={p.isNri ? "yes" : "no"} onChange={(v) => p.setIsNri(v === "yes")} options={[{ value: "yes", label: "Yes — NRI, first party (no TDS)" }, { value: "no", label: "No — resident, third party (TDS on stables)" }]} hint="Also decides first vs third party at create" />
      </div>
      <div className="flex justify-between"><Button variant="ghost" onClick={p.onBack}>← Back</Button><Button onClick={p.onNext}>Fetch quote →</Button></div>
    </Card>
  );
}

/* ---------------- check builders ---------------- */
function quoteChecks(clientLabel: string) {
  return [
    { label: `Fetching quote for ${clientLabel}`, detail: "reading the partner config" },
    { label: "Resolving payout partners", detail: "payout partner (and NRE payout partner, if set)" },
    { label: "Applying pricing config", detail: "spread, price source, service charge" },
    { label: "Issuing quote", detail: "rate locked for 30 seconds" },
  ];
}
function kycChecks(business: boolean) {
  return business
    ? [{ label: "Creating party inline", detail: "no pre-existing party" }, { label: "KYB: business verification", detail: "single verification call (AIPrise)" }, { label: "AML / sanctions screen", detail: "clear. UBO at EDD" }, { label: "Limits check", detail: "within tier and corridor limits" }]
    : [{ label: "Creating user inline", detail: "no pre-existing user" }, { label: "KYC shared and validated", detail: "identity + address on file" }, { label: "AML / sanctions screen", detail: "sender and receiver: clear" }, { label: "Limits check", detail: "within tier and corridor limits" }];
}
function lifecycleChecks(routing: RoutingDecision) {
  return [
    { label: "Transaction CREATED", detail: "order placed against the locked quote" },
    { label: "PROCESSING", detail: `payout via ${routing.partner.AggregatorName}` },
    { label: "COMPLETED", detail: `₹${routing.chosen.to_amount.toLocaleString("en-IN")} settled to the beneficiary` },
  ];
}

/* ---------------- 2. loader ---------------- */
function QuoteLoadingStep({ client, onDone }: { client: string; onDone: () => void }) {
  return <Card className="p-6 animate-fadeup"><h1 className="text-[18px] font-semibold tracking-tight mb-4">Issuing quote…</h1><Checklist items={quoteChecks(client)} onDone={onDone} intervalMs={1050} /></Card>;
}

/* ---------------- 3. quote result ---------------- */
function QuoteResultStep(p: { quote: Quote; clientName: string; txnType: TxnType; isNri: boolean; currency: SellCurrency; onBack: () => void; onRequote: () => void; onNext: () => void }) {
  const expiresAt = new Date(p.quote.expires_at).getTime();
  const remaining = () => Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
  const [left, setLeft] = useState(remaining);
  const [forced, setForced] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setLeft(remaining()), 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt]);
  const expired = forced || left <= 0;
  const basisLabel = p.quote.amount_basis === "from_amount"
    ? `from_amount · ${p.quote.from_amount} ${p.currency}`
    : `to_amount · ${inr(p.quote.to_amount ?? 0)}`;
  return (
    <Card className="p-6 space-y-5 animate-fadeup">
      <div className="flex items-start justify-between">
        <div><h1 className="text-[20px] font-semibold tracking-tight">Quote</h1><p className="text-[13px] text-[var(--color-muted)] mt-0.5">{p.clientName} · {p.currency} → INR · {p.txnType}</p></div>
        <div className="flex items-center gap-2">{!expired && <button onClick={() => setForced(true)} className="text-[11px] text-[var(--color-faint)] hover:text-[var(--color-muted)] underline">simulate rate move</button>}<StatusPill tone={expired ? "bad" : "warn"}>{expired ? "rate moved · expired" : `locked · ${left}s`}</StatusPill></div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Chip label="basis" value={basisLabel} />
        <Chip label="is_nri" value={p.isNri ? "true" : "false"} />
        <Chip label="quote_id" value={p.quote.quote_id} mono />
      </div>
      <div className={`grid md:grid-cols-2 gap-4 ${expired ? "opacity-40" : ""}`}>{p.quote.prices.map((pr) => <PriceCard key={pr.partner_type} price={pr} currency={p.currency} />)}</div>
      {p.quote.prices.length === 1 && <p className="text-[12px] text-[var(--color-faint)]">One price: this config has a single payout partner (no NRE payout partner set).</p>}
      {expired ? (
        <div className="flex items-center justify-between rounded-[var(--radius)] bg-[var(--color-bad-bg)] px-4 py-3 animate-pop"><span className="text-[13px] text-[var(--color-bad)]">The 30s lock expired. Re-quote to get a fresh price.</span><Button onClick={p.onRequote}>Re-quote</Button></div>
      ) : (
        <div className="flex justify-between"><Button variant="ghost" onClick={p.onBack}>← Change inputs</Button><Button onClick={p.onNext}>Create transaction →</Button></div>
      )}
      <Collapsible title="Checks · how this quote was issued"><StaticChecks items={quoteChecks(p.clientName)} /></Collapsible>
      <EngineeringPanel blocks={[{ label: "GET /v2/wallet/s/quote — response (client-facing)", data: toQuoteResponse(p.quote) }]} />
    </Card>
  );
}

function PriceCard({ price, currency }: { price: Price; currency: string }) {
  const isD9 = price.partner_type === "D9";
  const tds = price.tax.tds;
  const tdsValue = !tds.applicable ? "none" : tds.compensated ? `${inr(tds.amount_inr ?? 0)} absorbed by Saber` : `− ${inr(tds.amount_inr ?? 0)} (1%)`;
  return (
    <div className={`rounded-[14px] border p-5 animate-pop ${isD9 ? "border-[var(--color-accent)]" : "border-[var(--color-line)]"}`}>
      <div className="flex items-center justify-between">
        <span className={`inline-flex items-center h-6 px-2.5 rounded-full text-[12px] font-medium ${isD9 ? "bg-[var(--color-accent)] text-[var(--color-accent-ink)]" : "bg-[var(--color-line)] text-[var(--color-muted)]"}`}>{isD9 ? "NRE accounts" : "NRO / savings"}</span>
        <span className="text-[12px] font-semibold text-[var(--color-faint)]">Quote {price.option}</span>
      </div>
      <div className="mt-3 text-[28px] font-semibold tracking-tight">{inr(price.to_amount)}</div>
      <div className="text-[12px] text-[var(--color-muted)]">net to beneficiary · rate {price.rate} INR/{currency}</div>
      <div className="mt-3 pt-3 border-t border-[var(--color-line)] space-y-1.5">
        <Line label={`Sends (${currency})`} value={cx(price.from_amount.amount, currency)} />
        <Line label="Service charge (flat)" value={`${cx(price.service_charge.amount, currency)} (≈ ${inr(price.service_charge.amount * price.rate)})`} />
        <Line label="Converted" value={`${cx(price.principal.amount, currency)} → ${inr(price.gross_inr)}`} />
        {price.total_fee_inr !== 0 && <Line label="Fees (% on INR)" value={`− ${inr(price.total_fee_inr)}`} />}
        <Line label="Tax (TDS)" value={tdsValue} tone={tds.compensated ? "good" : undefined} />
        <div className="pt-1.5 mt-0.5 border-t border-[var(--color-line)]"><Line label="Net to beneficiary" value={inr(price.to_amount)} /></div>
      </div>
    </div>
  );
}
function Line({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return <div className="flex items-center justify-between text-[13px]"><span className="text-[var(--color-muted)]">{label}</span><span className={tone === "bad" ? "text-[var(--color-bad)]" : tone === "good" ? "text-[var(--color-good)]" : "text-[var(--color-ink)]"}>{value}</span></div>;
}
function Chip({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-[var(--color-bg)] border border-[var(--color-line)] text-[12px]"><span className="text-[var(--color-faint)]">{label}</span><span className={mono ? "font-mono text-[var(--color-ink)]" : "text-[var(--color-ink)]"}>{value}</span></span>;
}

/* ---------------- 4. create input ---------------- */
function CreateInputStep(p: {
  quoteId: string; txnType: TxnType; isNri: boolean;
  senderBusiness: boolean; receiverBusiness: boolean; firstParty: boolean; mirror: boolean;
  purpose: string; setPurpose: (v: string) => void; sourceIncome: string; setSourceIncome: (v: string) => void;
  sFirst: string; setSFirst: (v: string) => void; sLast: string; setSLast: (v: string) => void; sDob: string; setSDob: (v: string) => void; sNat: string; setSNat: (v: string) => void;
  rFirst: string; setRFirst: (v: string) => void; rLast: string; setRLast: (v: string) => void;
  bizName: string; setBizName: (v: string) => void; bizReg: string; setBizReg: (v: string) => void; rcvBiz: string; setRcvBiz: (v: string) => void;
  accountType: AccountType; setAccountType: (v: AccountType) => void; accountNo: string; setAccountNo: (v: string) => void; ifsc: string; setIfsc: (v: string) => void;
  nreEnabled: boolean; createRequest: unknown; onBack: () => void; onCreate: () => void;
}) {
  return (
    <Card className="p-6 space-y-5 animate-fadeup">
      <div className="flex items-start justify-between">
        <div><h1 className="text-[20px] font-semibold tracking-tight">Create transaction</h1><p className="text-[13px] text-[var(--color-muted)] mt-0.5">One fat call. No user or bank account exists yet; both are created here.</p></div>
        <div className="flex flex-col items-end gap-1.5"><Chip label="quote_id" value={p.quoteId} mono /><Chip label="party_scope" value={`${p.firstParty ? "FIRST_PARTY" : "THIRD_PARTY"} · from is_nri=${p.isNri}`} /></div>
      </div>
      <SectionLabel>Transaction</SectionLabel>
      <div className="grid sm:grid-cols-2 gap-4">
        <Select label="Purpose (code)" value={p.purpose} onChange={p.setPurpose} options={[{ value: "IR001", label: "IR001 — family maintenance" }, { value: "IR005", label: "IR005 — gift" }, { value: "IR006", label: "IR006 — services" }]} />
        <Select label="Source of income" value={p.sourceIncome} onChange={p.setSourceIncome} options={[{ value: "SALARY", label: "Salary" }, { value: "SAVINGS", label: "Savings" }, { value: "BUSINESS_INCOME", label: "Business income" }]} />
      </div>
      {p.senderBusiness ? (
        <>
          <SectionLabel>Sender (business · KYB)</SectionLabel>
          <div className="grid sm:grid-cols-2 gap-4"><Field label="Legal name" value={p.bizName} onChange={(e) => p.setBizName(e.target.value)} /><Field label="Registration number" value={p.bizReg} onChange={(e) => p.setBizReg(e.target.value)} /><Field label="Incorporation country" value={p.sNat} onChange={(e) => p.setSNat(e.target.value)} /></div>
        </>
      ) : (
        <>
          <SectionLabel>Sender (creates the user · KYC)</SectionLabel>
          <div className="grid sm:grid-cols-2 gap-4"><Field label="First name" value={p.sFirst} onChange={(e) => p.setSFirst(e.target.value)} /><Field label="Last name" value={p.sLast} onChange={(e) => p.setSLast(e.target.value)} /><Field label="Date of birth" value={p.sDob} onChange={(e) => p.setSDob(e.target.value)} /><Field label="Nationality" value={p.sNat} onChange={(e) => p.setSNat(e.target.value)} /></div>
        </>
      )}
      <SectionLabel>Receiver + bank (inline · {p.receiverBusiness ? "business · " : ""}beneficiary)</SectionLabel>
      <div className="grid sm:grid-cols-2 gap-4">
        {p.receiverBusiness ? <Field label="Business name" value={p.rcvBiz} onChange={(e) => p.setRcvBiz(e.target.value)} /> : p.mirror ? null : <><Field label="Receiver first name" value={p.rFirst} onChange={(e) => p.setRFirst(e.target.value)} /><Field label="Receiver last name" value={p.rLast} onChange={(e) => p.setRLast(e.target.value)} /></>}
        <Select label="Bank account type" value={p.accountType} onChange={(v) => p.setAccountType(v as AccountType)} options={[...(p.nreEnabled ? [{ value: "NRE", label: "NRE → NRE payout partner" }] : []), { value: "NRO", label: "NRO → payout partner" }, { value: "SAVINGS", label: "Savings → payout partner" }]} hint="Decides the payout partner, price, and tax" />
        <Field label="Account number" value={p.accountNo} onChange={(e) => p.setAccountNo(e.target.value)} />
        <Field label="IFSC" value={p.ifsc} onChange={(e) => p.setIfsc(e.target.value)} />
      </div>
      {p.mirror && <p className="text-[12px] text-[var(--color-faint)]">First party (is_nri = true): receiver name, relationship (SELF), and address mirror the sender.</p>}
      {!p.firstParty && <p className="text-[12px] text-[var(--color-faint)]">Third party (is_nri = false): the receiver is a distinct party from the sender.</p>}
      <div className="flex justify-between"><Button variant="ghost" onClick={p.onBack}>← Back to quote</Button><Button onClick={p.onCreate}>Create transaction →</Button></div>
      <Collapsible title="Fields captured"><FieldsCaptured req={p.createRequest} firstParty={p.firstParty} /></Collapsible>
      <EngineeringPanel blocks={[{ label: "POST /v2/wallet/transaction — request (fat body)", data: p.createRequest }]} />
    </Card>
  );
}
function SectionLabel({ children }: { children: React.ReactNode }) { return <div className="text-[12px] font-semibold text-[var(--color-muted)] border-b border-[var(--color-line)] pb-1.5">{children}</div>; }

/* ---------------- 5. processing ---------------- */
function ProcessingStep({ routing, business, createRequest, onDone }: { routing: RoutingDecision; business: boolean; createRequest: unknown; onDone: () => void }) {
  const [phase, setPhase] = useState(0);
  return (
    <Card className="p-6 space-y-6 animate-fadeup">
      <h1 className="text-[20px] font-semibold tracking-tight">Processing</h1>
      <Phase title="1 · Routing — which partner, price, and tax" active={phase >= 0}><Checklist items={routing.steps} onDone={() => setPhase(1)} intervalMs={950} /></Phase>
      {phase >= 1 && <Phase title={`2 · ${business ? "KYB" : "KYC"} / AML`} active><Checklist items={kycChecks(business)} onDone={() => setPhase(2)} intervalMs={900} /></Phase>}
      {phase >= 2 && <Phase title="3 · Transaction lifecycle" active><Checklist items={lifecycleChecks(routing)} onDone={onDone} intervalMs={1000} /></Phase>}
      <EngineeringPanel blocks={[{ label: "POST /v2/wallet/transaction — request", data: createRequest }, { label: "routing decision", data: routing }]} />
    </Card>
  );
}
function Phase({ title, active, children }: { title: string; active: boolean; children: React.ReactNode }) {
  return <div className={`rounded-[var(--radius)] border border-[var(--color-line)] p-4 ${active ? "animate-fadeup" : "opacity-40"}`}><div className="text-[12px] font-semibold text-[var(--color-muted)] mb-3">{title}</div>{children}</div>;
}

/* ---------------- 6. done ---------------- */
function DoneStep({ routing, currency, business, createRequest, onRestart }: { routing: RoutingDecision; currency: string; business: boolean; createRequest: unknown; onRestart: () => void }) {
  const c = routing.chosen;
  const tds = c.tax.tds;
  const tdsValue = !tds.applicable ? "none" : tds.compensated ? `${inr(tds.amount_inr ?? 0)} absorbed by Saber` : `− ${inr(tds.amount_inr ?? 0)}`;
  return (
    <Card className="p-6 space-y-5 animate-fadeup">
      <div className="flex items-center gap-2.5"><StatusPill tone="good">COMPLETED</StatusPill><span className="text-[13px] text-[var(--color-muted)]">payout settled</span></div>
      <div className="rounded-[14px] border border-[var(--color-line)] p-5 space-y-1.5">
        <Line label={`Sent (${currency})`} value={cx(c.from_amount.amount, currency)} />
        <Line label="Service charge (flat)" value={cx(c.service_charge.amount, currency)} />
        <Line label="Payout partner" value={`${routing.partner.AggregatorName} (${routing.partner.type === "D9" ? "traditional" : "stables"})`} />
        <Line label="Account type" value={routing.account_type} />
        <Line label="Locked rate" value={`${c.rate} INR/${currency}`} />
        <Line label="Converted" value={`${cx(c.principal.amount, currency)} → ${inr(c.gross_inr)}`} />
        <Line label="TDS" value={tdsValue} tone={tds.compensated ? "good" : undefined} />
        <div className="pt-2 mt-1 border-t border-[var(--color-line)]"><Line label="Net to beneficiary" value={inr(c.to_amount)} /></div>
      </div>
      <Collapsible title="Checks · everything that ran"><div className="space-y-4"><CheckGroup title="Routing" items={routing.steps} /><CheckGroup title={business ? "KYB / AML" : "KYC / AML"} items={kycChecks(business)} /><CheckGroup title="Lifecycle" items={lifecycleChecks(routing)} /></div></Collapsible>
      <EngineeringPanel blocks={[{ label: "POST /v2/wallet/transaction — request (this transaction)", data: createRequest }]} />
      <div className="flex justify-end"><Button onClick={onRestart}>New transaction</Button></div>
    </Card>
  );
}

/* ---------------- calculator (two columns, shared config) ---------------- */
function CalcView({ form, set, cfg, onBack }: { form: CfgForm; set: <K extends keyof CfgForm>(k: K, v: CfgForm[K]) => void; cfg: ClientConfig; onBack: () => void }) {
  return (
    <Card className="p-6 space-y-5 animate-fadeup">
      <div className="flex items-start justify-between">
        <div><h1 className="text-[20px] font-semibold tracking-tight">Pricing calculator</h1><p className="text-[13px] text-[var(--color-muted)] mt-0.5">Same two-column layout as the configurator. Edit the config; the quote updates live. Edits carry into the flow.</p></div>
        <Button variant="ghost" onClick={onBack}>← Back to flow</Button>
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <ColTitle>Configuration</ColTitle>
          <Collapsible title="Pricing configuration" defaultOpen><PricingEditor form={form} set={set} /></Collapsible>
          <Collapsible title="Partner mapping configuration"><PartnerEditor form={form} set={set} /></Collapsible>
        </div>
        <div className="space-y-3">
          <ColTitle>Quote</ColTitle>
          <QuotePreview cfg={cfg} showCalc />
        </div>
      </div>
      <div className="flex justify-end"><Button onClick={onBack}>Use this config in the flow →</Button></div>
    </Card>
  );
}
function CalcBreakdown({ cfg, basis, value, isNri }: { cfg: ClientConfig; basis: AmountBasis; value: number; isNri: boolean }) {
  const rails: PartnerType[] = [cfg.partner_config.payout_partner.type, ...(cfg.partner_config.nre_payout_partner ? [cfg.partner_config.nre_payout_partner.type] : [])];
  return <div className="space-y-4">{rails.map((r) => <CalcCard key={r} ex={explainPrice(cfg, r, basis, value, isNri)} currency={cfg.from_currency} />)}</div>;
}
function CalcCard({ ex, currency }: { ex: PriceExplain; currency: string }) {
  const isD9 = ex.rail === "D9";
  const dedItems: string[] = [];
  if (ex.platform_inr) dedItems.push(`platform ${inr(ex.platform_inr)}`);
  if (ex.gst_inr) dedItems.push(`GST ${inr(ex.gst_inr)}`);
  if (ex.client_fee_inr) dedItems.push(`client fee ${inr(ex.client_fee_inr)}`);
  if (ex.discount_inr) dedItems.push(`less discount ${inr(ex.discount_inr)}`);
  if (ex.tds_applicable && !ex.compensated) dedItems.push(`TDS ${inr(ex.tds_inr)}`);
  const dedDetail = dedItems.length ? dedItems.join(" + ") : ex.tds_applicable && ex.compensated ? "TDS absorbed by Saber (compensate_tds)" : "no fees or TDS";
  const spreadLabel = `Apply spread (${pct(ex.spread)}${ex.lock_spread ? ` + price-lock ${pct(ex.lock_spread)}` : ""})`;
  const svcStep = ex.basis === "from_amount"
    ? { label: `Deduct service charge (${ex.service_charge} ${ex.currency}, flat)`, detail: `${ex.from_amount} − ${ex.service_charge} = ${ex.principal_crypto} ${currency} converted`, value: `${ex.principal_crypto} ${currency}` }
    : { label: `Add service charge (${ex.service_charge} ${ex.currency}, flat)`, detail: `sender sends ${ex.principal_crypto} + ${ex.service_charge} = ${ex.from_amount} ${currency}`, value: `${ex.from_amount} ${currency}` };
  return (
    <div className={`rounded-[14px] border p-5 ${isD9 ? "border-[var(--color-accent)]" : "border-[var(--color-line)]"}`}>
      <div className="text-[12px] font-semibold text-[var(--color-muted)] mb-3">Quote {ex.option} · {isD9 ? "NRE (D9, traditional)" : "RPFS (stables)"}</div>
      <ol className="space-y-2 text-[13px]">
        <CalcStep n="1" label="Source price" detail={ex.pinned ? `static OTC, pinned at ${ex.min}` : `live ${ex.source} (price stream)`} value={`${ex.source}`} />
        <CalcStep n="2" label={spreadLabel} detail={ex.pinned ? "ignored — pinned band overrides the spread" : `${ex.source} × (1 ${ex.spread < 0 ? "−" : "+"} ${Math.abs(ex.spread * 100).toFixed(2)}%${ex.lock_spread ? ` ${ex.lock_spread < 0 ? "−" : "+"} ${Math.abs(ex.lock_spread * 100).toFixed(2)}%` : ""})`} value={`${ex.post_spread}`} />
        <CalcStep n="3" label="Clamp to band → rate" detail={ex.pinned ? `pinned ${ex.min}` : `floor ${ex.min}, ceiling ${ex.max}`} value={`${ex.rate}`} highlight />
        <CalcStep n="4" label={svcStep.label} detail={svcStep.detail} value={svcStep.value} />
        <CalcStep n="5" label="Convert to INR (gross)" detail={`${ex.principal_crypto} ${currency} × ${ex.rate}`} value={inr(ex.gross_inr)} highlight />
        <CalcStep n="6" label="Deduct fees + TDS on INR" detail={dedDetail} value={ex.total_deductions_inr ? `− ${inr(ex.total_deductions_inr)}` : "− ₹0"} />
        <CalcStep n="=" label="Net to beneficiary (to_amount)" detail={`gross ${inr(ex.gross_inr)} − deductions`} value={inr(ex.to_amount)} highlight />
      </ol>
    </div>
  );
}
function CalcStep({ n, label, detail, value, highlight }: { n: string; label: string; detail: string; value: string; highlight?: boolean }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex items-center justify-center w-5 h-5 rounded-full bg-[var(--color-line)] text-[11px] text-[var(--color-muted)] shrink-0">{n}</span>
      <div className="flex-1 flex items-start justify-between gap-3"><div><div className="text-[var(--color-ink)]">{label}</div><div className="text-[12px] text-[var(--color-faint)]">{detail}</div></div><div className={`font-mono text-[13px] shrink-0 ${highlight ? "font-semibold text-[var(--color-ink)]" : "text-[var(--color-muted)]"}`}>{value}</div></div>
    </li>
  );
}

/* ---------------- shared: collapsible + checks + fields ---------------- */
function Collapsible({ title, children, defaultOpen }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="border border-[var(--color-line)] rounded-[var(--radius)] overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-4 h-11 text-[13px] font-medium text-[var(--color-ink)] hover:bg-[var(--color-bg)]"><span>{title}</span><span className="text-[var(--color-faint)]">{open ? "Hide" : "Show"}</span></button>
      {open && <div className="border-t border-[var(--color-line)] p-4 bg-[var(--color-bg)] animate-fadeup">{children}</div>}
    </div>
  );
}
function StaticChecks({ items }: { items: { label: string; detail?: string }[] }) {
  return <ol className="space-y-2.5">{items.map((it, i) => (<li key={i} className="flex items-start gap-3"><svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="mt-0.5 shrink-0"><circle cx="9" cy="9" r="9" fill="var(--color-good-bg)" /><path d="M5 9.5l2.5 2.5L13 6.5" stroke="var(--color-good)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg><div><div className="text-[14px] text-[var(--color-ink)]">{it.label}</div>{it.detail && <div className="text-[12px] text-[var(--color-muted)]">{it.detail}</div>}</div></li>))}</ol>;
}
function CheckGroup({ title, items }: { title: string; items: { label: string; detail?: string }[] }) {
  return <div><div className="text-[12px] font-semibold text-[var(--color-muted)] mb-2">{title}</div><StaticChecks items={items} /></div>;
}
function fieldPaths(obj: unknown, prefix = ""): string[] {
  if (!obj || typeof obj !== "object") return prefix ? [prefix] : [];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => { const key = prefix ? `${prefix}.${k}` : k; return v && typeof v === "object" && !Array.isArray(v) ? fieldPaths(v, key) : [key]; });
}
function FieldsCaptured({ req, firstParty }: { req: unknown; firstParty: boolean }) {
  const r = (req ?? {}) as Record<string, unknown>;
  return (
    <div className="space-y-4">
      <FieldGroup title="Transaction" fields={Object.keys(r).filter((k) => k !== "sender" && k !== "receiver")} />
      <FieldGroup title="Sender" fields={fieldPaths(r.sender)} />
      <FieldGroup title="Receiver + bank" fields={fieldPaths(r.receiver)} />
      <div className="text-[12px] text-[var(--color-muted)] rounded-[var(--radius)] bg-[var(--color-surface)] border border-[var(--color-line)] px-3 py-2">{firstParty ? "First party (is_nri = true): receiver first/last name, relationship (SELF), and address mirror the sender. The bank account is still captured." : "Third party (is_nri = false): the receiver is a distinct party, so its full identity, address, and bank account are captured alongside the sender."}</div>
    </div>
  );
}
function FieldGroup({ title, fields }: { title: string; fields: string[] }) {
  return <div><div className="text-[12px] font-semibold text-[var(--color-muted)] mb-2">{title}</div><div className="flex flex-wrap gap-1.5">{fields.map((f) => <span key={f} className="font-mono text-[11px] text-[var(--color-ink)] bg-[var(--color-surface)] border border-[var(--color-line)] rounded-full px-2 py-0.5">{f}</span>)}</div></div>;
}

/* ---------------- animated checklist ---------------- */
function Checklist({ items, onDone, intervalMs = 700 }: { items: { label: string; detail?: string }[]; onDone?: () => void; intervalMs?: number }) {
  const [done, setDone] = useState(0);
  useEffect(() => {
    if (done >= items.length) { const t = setTimeout(() => onDone?.(), 350); return () => clearTimeout(t); }
    const t = setTimeout(() => setDone((d) => d + 1), intervalMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, items.length]);
  return (
    <ol className="space-y-2.5">
      {items.map((it, i) => {
        const state = i < done ? "done" : i === done ? "active" : "todo";
        return (
          <li key={i} className={`flex items-start gap-3 ${state === "todo" ? "opacity-35" : "animate-fadeup"}`}>
            <span className="mt-0.5 shrink-0">{state === "done" ? <svg className="tick" width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="9" fill="var(--color-good-bg)" /><path d="M5 9.5l2.5 2.5L13 6.5" stroke="var(--color-good)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg> : state === "active" ? <span className="spinner" /> : <span className="block w-[18px] h-[18px] rounded-full border border-[var(--color-line)]" />}</span>
            <div><div className="text-[14px] text-[var(--color-ink)]">{it.label}</div>{it.detail && <div className="text-[12px] text-[var(--color-muted)]">{it.detail}</div>}</div>
          </li>
        );
      })}
    </ol>
  );
}
