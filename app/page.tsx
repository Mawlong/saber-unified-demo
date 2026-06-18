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
  PLATFORM_FEE_USD,
  type ClientConfig,
  type Quote,
  type Price,
  type PriceExplain,
  type RoutingDecision,
  type AccountType,
  type PartnerType,
  type SellCurrency,
  type TxnType,
  type PartyScope,
  type CreateInput,
} from "@/lib/transactions";

/*
  Unified transaction demo. ONE editable config drives everything (no assumptions):
  edit it in the flow's Config step or in the Calculator tab, and the prices, quote, and
  create-transaction all follow. Stages: Config -> Quote -> Result -> Create -> Process -> Done.
*/

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const pct = (f: number) => `${(f * 100).toFixed(2)}%`;
const num = (s: string) => { const n = parseFloat(s); return isNaN(n) ? 0 : n; };

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
      platform_fee_usd: num(f.platFee), platform_fee: 0, tax_on_fee: frac(f.taxOnFee), discount: 0, client_fee: 0,
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

  // quote inputs
  const [amount, setAmount] = useState("100");
  const [txnType, setTxnType] = useState<TxnType>("C2C");
  const [isNri, setIsNri] = useState(true);
  const [quote, setQuote] = useState<Quote | null>(null);

  // create inputs
  const [partyScope, setPartyScope] = useState<PartyScope>("FIRST_PARTY");
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
  const firstParty = partyScope === "FIRST_PARTY" && !pt.senderBusiness && !pt.receiverBusiness;

  const createInput: CreateInput = {
    client_id: "_active", quote_id: quote?.quote_id ?? "", transaction_type: txnType,
    party_scope: firstParty ? "FIRST_PARTY" : "THIRD_PARTY", purpose_code: purpose, source_of_income: sourceIncome, message: "June support",
    sender: { is_business: pt.senderBusiness, legal_name: bizName, registration_number: bizReg, first_name: sFirst, last_name: sLast, date_of_birth: sDob, nationality: sNat, is_nri: isNri, id_type: "PASSPORT", id_number: "P1234567", email: "jane@example.com", mobile: "+919876543210", address: SENDER_ADDRESS },
    receiver: { is_business: pt.receiverBusiness, legal_name: rcvBiz, first_name: firstParty ? sFirst : rFirst, last_name: firstParty ? sLast : rLast, relationship: firstParty ? "SELF" : pt.receiverBusiness ? "SUPPLIER" : "PARENT", address: firstParty ? SENDER_ADDRESS : RECEIVER_ADDRESS, account_number: accountNo, ifsc, account_type: accountType },
  };

  const routing = quote ? resolveRouting(cfg, accountType, Number(amount), isNri) : null;
  const createRequest = buildCreateRequest(createInput);

  function restart() { setStep(0); setQuote(null); setView("flow"); }
  function goStage(s: number) { setView("flow"); setStep(s); }

  return (
    <div>
      <TopBar view={view} setView={setView} step={step} goStage={goStage} />

      {view === "calc" && (
        <CalcView form={form} set={set} cfg={cfg} onBack={() => setView("flow")} />
      )}

      {view === "flow" && (
        <>
          {step === 0 && <ConfigStep form={form} set={set} cfg={cfg} onLoad={(id) => setForm(cfgToForm(getClient(id)))} onNext={() => setStep(1)} />}

          {step === 1 && (
            <QuoteInputStep client={cfg.label} currency={cfg.from_currency} amount={amount} setAmount={setAmount}
              txnType={txnType} setTxnType={setTxnType} isNri={isNri} setIsNri={setIsNri}
              onBack={() => setStep(0)} onNext={() => { setQuote(buildQuoteFor(cfg, { from_amount: Number(amount), transaction_type: txnType, is_nri: isNri })); setStep(2); }} />
          )}

          {step === 2 && <QuoteLoadingStep client={cfg.label} onDone={() => setStep(3)} />}

          {step === 3 && quote && (
            <QuoteResultStep key={quote.quote_id} quote={quote} clientName={cfg.label} txnType={txnType} isNri={isNri} currency={cfg.from_currency}
              onBack={() => setStep(1)} onRequote={() => setQuote(buildQuoteFor(cfg, { from_amount: Number(amount), transaction_type: txnType, is_nri: isNri }))} onNext={() => setStep(4)} />
          )}

          {step === 4 && quote && (
            <CreateInputStep quoteId={quote.quote_id} txnType={txnType} partyScope={partyScope} setPartyScope={setPartyScope}
              senderBusiness={pt.senderBusiness} receiverBusiness={pt.receiverBusiness} firstParty={firstParty}
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
            <DoneStep routing={routing} amount={Number(amount)} currency={cfg.from_currency} business={pt.senderBusiness || pt.receiverBusiness} createRequest={createRequest} onRestart={restart} />
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
      <div className="grid sm:grid-cols-3 gap-3">
        <Select label="Sell currency" value={f.ccy} onChange={(v) => set("ccy", v as SellCurrency)} options={[{ value: "USDC", label: "USDC" }, { value: "USDT", label: "USDT" }]} />
        <Field label="Source price (live)" value={f.srcStables} onChange={(e) => set("srcStables", e.target.value)} hint={pinned ? "ignored — min = max (static)" : "from the price stream"} />
        <Field label="Client spread %" value={f.spread} onChange={(e) => set("spread", e.target.value)} hint="negative = better rate" />
        <Field label="Min price" value={f.minP} onChange={(e) => set("minP", e.target.value)} />
        <Field label="Max price" value={f.maxP} onChange={(e) => set("maxP", e.target.value)} hint="set min = max to pin a static price" />
        <Field label="Platform fee (USD)" value={f.platFee} onChange={(e) => set("platFee", e.target.value)} />
        <Field label="Price-lock spread %" value={f.priceLock} onChange={(e) => set("priceLock", e.target.value)} />
        <Field label="TDS %" value={f.tds} onChange={(e) => set("tds", e.target.value)} />
        <Select label="compensate_tds" value={f.compensate ? "yes" : "no"} onChange={(v) => set("compensate", v === "yes")} options={[{ value: "no", label: "No" }, { value: "yes", label: "Yes — Saber absorbs TDS" }]} />
        <Field label="GST on fee %" value={f.taxOnFee} onChange={(e) => set("taxOnFee", e.target.value)} />
      </div>
      <div>
        <Select label="NRE payout partner / traditional rail" value={f.nreOn ? "on" : "off"} onChange={(v) => set("nreOn", v === "on")}
          options={[{ value: "off", label: "Not set (one price)" }, { value: "on", label: "Set — adds the D9 traditional price" }]} />
        {f.nreOn && (
          <div className="grid sm:grid-cols-4 gap-3 mt-3">
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
    <div className="grid sm:grid-cols-3 gap-3">
      <Field label="Payout partner" value={f.payoutAgg} onChange={(e) => set("payoutAgg", e.target.value)} />
      <Field label="Payment method" value={f.payoutMethod} onChange={(e) => set("payoutMethod", e.target.value)} />
      <Field label="Account number" value={f.payoutAcct} onChange={(e) => set("payoutAcct", e.target.value)} />
      {f.nreOn && <Field label="NRE payout partner" value={f.nreAgg} onChange={(e) => set("nreAgg", e.target.value)} />}
      {f.nreOn && <Field label="NRE account" value={f.nreAcct} onChange={(e) => set("nreAcct", e.target.value)} />}
    </div>
  );
}
function PricePreview({ cfg, amount, isNri }: { cfg: ClientConfig; amount: number; isNri: boolean }) {
  const rails: PartnerType[] = [cfg.partner_config.payout_partner.type, ...(cfg.partner_config.nre_payout_partner ? [cfg.partner_config.nre_payout_partner.type] : [])];
  return <div className="grid md:grid-cols-2 gap-4">{rails.map((r) => <PriceCard key={r} price={priceFor(cfg, r, amount, isNri)} currency={cfg.from_currency} />)}</div>;
}

/* ---------------- 0. config (editable) ---------------- */
function ConfigStep({ form, set, cfg, onLoad, onNext }: { form: CfgForm; set: <K extends keyof CfgForm>(k: K, v: CfgForm[K]) => void; cfg: ClientConfig; onLoad: (id: string) => void; onNext: () => void }) {
  return (
    <Card className="p-6 space-y-6 animate-fadeup">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight">Client configuration</h1>
          <p className="text-[13px] text-[var(--color-muted)] mt-0.5">Edit anything. The quote, prices, and create-transaction all follow this config.</p>
        </div>
        <div className="w-56">
          <Select label="Load a template" value="" onChange={(v) => v && onLoad(v)} options={[{ value: "", label: "Start from…" }, ...clients.map((c) => ({ value: c.id, label: `${c.label} — ${c.kind}` }))]} />
        </div>
      </div>

      <ConfigBlock title="Partner config — system-driven routing">
        <PartnerEditor form={form} set={set} />
        <p className="text-[12px] text-[var(--color-faint)] mt-2">An NRE account uses the NRE payout partner if one is set; every other account uses the payout partner.</p>
      </ConfigBlock>

      <ConfigBlock title="Pricing config — adjust and watch the prices change">
        <PricingEditor form={form} set={set} />
      </ConfigBlock>

      <ConfigBlock title="Resulting prices (100 units, resident)">
        <PricePreview cfg={cfg} amount={100} isNri={false} />
        <Collapsible title="Show the calculation"><CalcBreakdown cfg={cfg} amount={100} isNri={false} /></Collapsible>
      </ConfigBlock>

      <div className="flex justify-end"><Button onClick={onNext}>Use this config →</Button></div>
      <EngineeringPanel blocks={[{ label: "partner_config", data: cfg.partner_config }, { label: "pricing_config", data: cfg.pricing_config }]} />
    </Card>
  );
}
function ConfigBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><div className="text-[12px] font-semibold text-[var(--color-muted)] border-b border-[var(--color-line)] pb-1.5 mb-3">{title}</div>{children}</div>;
}

/* ---------------- 1. quote input ---------------- */
function QuoteInputStep(p: { client: string; currency: string; amount: string; setAmount: (v: string) => void; txnType: TxnType; setTxnType: (v: TxnType) => void; isNri: boolean; setIsNri: (v: boolean) => void; onBack: () => void; onNext: () => void }) {
  return (
    <Card className="p-6 space-y-5 animate-fadeup">
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight">Get a quote</h1>
        <p className="text-[13px] text-[var(--color-muted)] mt-0.5">{p.client} · {p.currency} → INR. Defaults are filled; change anything or just continue.</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label={`Sell (${p.currency})`} inputMode="numeric" value={p.amount} onChange={(e) => p.setAmount(e.target.value.replace(/[^0-9]/g, ""))} />
        <Select label="Transaction type" value={p.txnType} onChange={(v) => p.setTxnType(v as TxnType)} options={[{ value: "C2C", label: "C2C — consumer to consumer" }, { value: "C2B", label: "C2B" }, { value: "B2C", label: "B2C" }, { value: "B2B", label: "B2B" }]} />
        <Select label="Recipient is NRI (is_nri)" value={p.isNri ? "yes" : "no"} onChange={(v) => p.setIsNri(v === "yes")} options={[{ value: "yes", label: "Yes — not an India tax resident (no TDS)" }, { value: "no", label: "No — resident (TDS on stables)" }]} hint="Optional at quote, required for the INR leg at create" />
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
    { label: "Applying pricing config", detail: "spread, price source, platform fee" },
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
    { label: "COMPLETED", detail: `₹${routing.chosen.you_receive.toLocaleString("en-IN")} settled to the beneficiary` },
  ];
}

/* ---------------- 2. loader ---------------- */
function QuoteLoadingStep({ client, onDone }: { client: string; onDone: () => void }) {
  return <Card className="p-6 animate-fadeup"><h1 className="text-[18px] font-semibold tracking-tight mb-4">Issuing quote…</h1><Checklist items={quoteChecks(client)} onDone={onDone} intervalMs={1050} /></Card>;
}

/* ---------------- 3. quote result ---------------- */
function QuoteResultStep(p: { quote: Quote; clientName: string; txnType: TxnType; isNri: boolean; currency: string; onBack: () => void; onRequote: () => void; onNext: () => void }) {
  // derive the countdown from the quote's expiry timestamp, so it is accurate to wall-clock
  // regardless of how many intervals fire (StrictMode-safe). `forced` handles "simulate rate move".
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
  return (
    <Card className="p-6 space-y-5 animate-fadeup">
      <div className="flex items-start justify-between">
        <div><h1 className="text-[20px] font-semibold tracking-tight">Quote</h1><p className="text-[13px] text-[var(--color-muted)] mt-0.5">{p.quote.from_amount} {p.currency} → INR · {p.txnType}</p></div>
        <div className="flex items-center gap-2">{!expired && <button onClick={() => setForced(true)} className="text-[11px] text-[var(--color-faint)] hover:text-[var(--color-muted)] underline">simulate rate move</button>}<StatusPill tone={expired ? "bad" : "warn"}>{expired ? "rate moved · expired" : `locked · ${left}s`}</StatusPill></div>
      </div>
      <div className="flex flex-wrap gap-2"><Chip label="client" value={p.clientName} /><Chip label="is_nri" value={p.isNri ? "true" : "false"} /><Chip label="quote_id" value={p.quote.quote_id} mono /></div>
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
  const tdsValue = !tds.applicable ? "none" : tds.compensated ? `₹${(tds.amount_inr ?? 0).toLocaleString("en-IN")} absorbed by Saber` : `− ${inr(tds.amount_inr ?? 0)} (1%)`;
  return (
    <div className={`rounded-[14px] border p-5 animate-pop ${isD9 ? "border-[var(--color-accent)]" : "border-[var(--color-line)]"}`}>
      <div className="flex items-center justify-between"><span className={`inline-flex items-center h-6 px-2.5 rounded-full text-[12px] font-medium ${isD9 ? "bg-[var(--color-accent)] text-[var(--color-accent-ink)]" : "bg-[var(--color-line)] text-[var(--color-muted)]"}`}>{isD9 ? "NRE accounts" : "NRO / savings"}</span></div>
      <div className="mt-3 text-[28px] font-semibold tracking-tight">{inr(price.you_receive)}</div>
      <div className="text-[12px] text-[var(--color-muted)]">user receives · rate {price.rate} INR/{currency}</div>
      <div className="mt-3 pt-3 border-t border-[var(--color-line)] space-y-1.5">
        <Line label="Gross" value={inr(price.gross_inr)} />
        <Line label={`Platform fee ($${price.platform_fee.usd.toFixed(2)})`} value={`− ${inr(price.platform_fee.inr)}`} />
        <Line label="Tax (TDS)" value={tdsValue} tone={tds.applicable && !tds.compensated ? "bad" : "good"} />
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
  quoteId: string; txnType: TxnType; partyScope: PartyScope; setPartyScope: (v: PartyScope) => void;
  senderBusiness: boolean; receiverBusiness: boolean; firstParty: boolean;
  purpose: string; setPurpose: (v: string) => void; sourceIncome: string; setSourceIncome: (v: string) => void;
  sFirst: string; setSFirst: (v: string) => void; sLast: string; setSLast: (v: string) => void; sDob: string; setSDob: (v: string) => void; sNat: string; setSNat: (v: string) => void;
  rFirst: string; setRFirst: (v: string) => void; rLast: string; setRLast: (v: string) => void;
  bizName: string; setBizName: (v: string) => void; bizReg: string; setBizReg: (v: string) => void; rcvBiz: string; setRcvBiz: (v: string) => void;
  accountType: AccountType; setAccountType: (v: AccountType) => void; accountNo: string; setAccountNo: (v: string) => void; ifsc: string; setIfsc: (v: string) => void;
  nreEnabled: boolean; createRequest: unknown; onBack: () => void; onCreate: () => void;
}) {
  const c2c = !p.senderBusiness && !p.receiverBusiness;
  return (
    <Card className="p-6 space-y-5 animate-fadeup">
      <div className="flex items-start justify-between">
        <div><h1 className="text-[20px] font-semibold tracking-tight">Create transaction</h1><p className="text-[13px] text-[var(--color-muted)] mt-0.5">One fat call. No user or bank account exists yet; both are created here.</p></div>
        <div className="flex flex-col items-end gap-1.5"><Chip label="quote_id" value={p.quoteId} mono /><Chip label="party_scope" value={`${p.firstParty ? "FIRST_PARTY" : "THIRD_PARTY"} (derived)`} /></div>
      </div>
      <SectionLabel>Transaction</SectionLabel>
      <div className="grid sm:grid-cols-2 gap-4">
        {c2c && <Select label="Party scope (C2C)" value={p.partyScope} onChange={(v) => p.setPartyScope(v as PartyScope)} options={[{ value: "FIRST_PARTY", label: "First party (receiver = sender)" }, { value: "THIRD_PARTY", label: "Third party (distinct receiver)" }]} />}
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
        {p.receiverBusiness ? <Field label="Business name" value={p.rcvBiz} onChange={(e) => p.setRcvBiz(e.target.value)} /> : p.firstParty ? null : <><Field label="Receiver first name" value={p.rFirst} onChange={(e) => p.setRFirst(e.target.value)} /><Field label="Receiver last name" value={p.rLast} onChange={(e) => p.setRLast(e.target.value)} /></>}
        <Select label="Bank account type" value={p.accountType} onChange={(v) => p.setAccountType(v as AccountType)} options={[...(p.nreEnabled ? [{ value: "NRE", label: "NRE → NRE payout partner" }] : []), { value: "NRO", label: "NRO → payout partner" }, { value: "SAVINGS", label: "Savings → payout partner" }]} hint="Decides the payout partner, price, and tax" />
        <Field label="Account number" value={p.accountNo} onChange={(e) => p.setAccountNo(e.target.value)} />
        <Field label="IFSC" value={p.ifsc} onChange={(e) => p.setIfsc(e.target.value)} />
      </div>
      {p.firstParty && <p className="text-[12px] text-[var(--color-faint)]">First party: receiver name, relationship (SELF), and address mirror the sender.</p>}
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
function DoneStep({ routing, amount, currency, business, createRequest, onRestart }: { routing: RoutingDecision; amount: number; currency: string; business: boolean; createRequest: unknown; onRestart: () => void }) {
  const c = routing.chosen;
  const tds = c.tax.tds;
  const tdsValue = !tds.applicable ? "none" : tds.compensated ? `₹${(tds.amount_inr ?? 0).toLocaleString("en-IN")} absorbed by Saber` : `− ${inr(tds.amount_inr ?? 0)}`;
  return (
    <Card className="p-6 space-y-5 animate-fadeup">
      <div className="flex items-center gap-2.5"><StatusPill tone="good">COMPLETED</StatusPill><span className="text-[13px] text-[var(--color-muted)]">payout settled</span></div>
      <div className="rounded-[14px] border border-[var(--color-line)] p-5 space-y-1.5">
        <Line label="Sold" value={`${amount} ${currency}`} />
        <Line label="Payout partner" value={`${routing.partner.AggregatorName} (${routing.partner.type === "D9" ? "traditional" : "stables"})`} />
        <Line label="Account type" value={routing.account_type} />
        <Line label="Locked rate" value={`${c.rate} INR/${currency}`} />
        <Line label="Gross" value={inr(c.gross_inr)} />
        <Line label={`Platform fee ($${c.platform_fee.usd.toFixed(2)})`} value={`− ${inr(c.platform_fee.inr)}`} />
        <Line label="TDS" value={tdsValue} tone={tds.applicable && !tds.compensated ? "bad" : "good"} />
        <div className="pt-2 mt-1 border-t border-[var(--color-line)]"><Line label="Net to beneficiary" value={inr(c.you_receive)} /></div>
      </div>
      <Collapsible title="Checks · everything that ran"><div className="space-y-4"><CheckGroup title="Routing" items={routing.steps} /><CheckGroup title={business ? "KYB / AML" : "KYC / AML"} items={kycChecks(business)} /><CheckGroup title="Lifecycle" items={lifecycleChecks(routing)} /></div></Collapsible>
      <EngineeringPanel blocks={[{ label: "POST /v2/wallet/transaction — request (this transaction)", data: createRequest }]} />
      <div className="flex justify-end"><Button onClick={onRestart}>New transaction</Button></div>
    </Card>
  );
}

/* ---------------- calculator (pure inputs, shared config) ---------------- */
function CalcView({ form, set, cfg, onBack }: { form: CfgForm; set: <K extends keyof CfgForm>(k: K, v: CfgForm[K]) => void; cfg: ClientConfig; onBack: () => void }) {
  const [amount, setAmount] = useState("100");
  const [isNri, setIsNri] = useState(false);
  const rails: PartnerType[] = ["RPFS", ...(form.nreOn ? (["D9"] as PartnerType[]) : [])];
  return (
    <Card className="p-6 space-y-5 animate-fadeup">
      <div className="flex items-start justify-between">
        <div><h1 className="text-[20px] font-semibold tracking-tight">Pricing calculator</h1><p className="text-[13px] text-[var(--color-muted)] mt-0.5">Enter values and watch the price change. This is the same config the flow uses, so your edits carry over.</p></div>
        <Button variant="ghost" onClick={onBack}>← Back to flow</Button>
      </div>
      <ConfigBlock title="Pricing config"><PricingEditor form={form} set={set} /></ConfigBlock>
      <ConfigBlock title="Try it">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={`Sell (${form.ccy})`} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))} />
          <Select label="Recipient NRI" value={isNri ? "yes" : "no"} onChange={(v) => setIsNri(v === "yes")} options={[{ value: "no", label: "Resident (TDS)" }, { value: "yes", label: "NRI (no TDS)" }]} />
        </div>
      </ConfigBlock>
      <ConfigBlock title="Resulting prices"><div className="grid md:grid-cols-2 gap-4">{rails.map((r) => <PriceCard key={r} price={priceFor(cfg, r, Number(amount) || 0, isNri)} currency={form.ccy} />)}</div></ConfigBlock>
      <ConfigBlock title="How it's calculated"><CalcBreakdown cfg={cfg} amount={Number(amount) || 0} isNri={isNri} /></ConfigBlock>
      <div className="flex justify-end"><Button onClick={onBack}>Use this config in the flow →</Button></div>
    </Card>
  );
}
function CalcBreakdown({ cfg, amount, isNri }: { cfg: ClientConfig; amount: number; isNri: boolean }) {
  const rails: PartnerType[] = [cfg.partner_config.payout_partner.type, ...(cfg.partner_config.nre_payout_partner ? [cfg.partner_config.nre_payout_partner.type] : [])];
  return <div className="space-y-4">{rails.map((r) => <CalcCard key={r} ex={explainPrice(cfg, r, amount, isNri)} currency={cfg.from_currency} />)}</div>;
}
function CalcCard({ ex, currency }: { ex: PriceExplain; currency: string }) {
  const isD9 = ex.rail === "D9";
  const tdsLine = !ex.tds_applicable ? "no TDS (NRI or stables tds=0)" : ex.compensated ? `1% = ₹${ex.tds_inr.toLocaleString("en-IN")}, but absorbed by Saber (compensate_tds)` : `1% × gross = − ₹${ex.tds_inr.toLocaleString("en-IN")}`;
  return (
    <div className={`rounded-[14px] border p-5 ${isD9 ? "border-[var(--color-accent)]" : "border-[var(--color-line)]"}`}>
      <div className="text-[12px] font-semibold text-[var(--color-muted)] mb-3">{isD9 ? "NRE payout partner (D9, traditional)" : "Payout partner (RPFS, stables)"}</div>
      <ol className="space-y-2 text-[13px]">
        <CalcStep n="1" label="Source price" detail={ex.pinned ? `static OTC, pinned at ${ex.min}` : `live ${ex.source} (price stream)`} value={`${ex.source}`} />
        <CalcStep n="2" label={`Apply client spread (${pct(ex.spread)})`} detail={ex.pinned ? "ignored — pinned band overrides the spread" : `${ex.source} × (1 ${ex.spread < 0 ? "−" : "+"} ${Math.abs(ex.spread * 100).toFixed(2)}%)`} value={`${ex.post_spread}`} />
        <CalcStep n="3" label="Clamp to band" detail={ex.pinned ? `pinned ${ex.min}` : `floor ${ex.min}, ceiling ${ex.max}`} value={`rate ${ex.rate}`} highlight />
        <CalcStep n="4" label={`Gross = ${ex.amount} ${currency} × rate`} detail={`${ex.amount} × ${ex.rate}`} value={inr(ex.gross)} />
        <CalcStep n="5" label={`Platform fee ($${ex.platform_fee_usd.toFixed(2)} × rate)`} detail={`$${ex.platform_fee_usd.toFixed(2)} × ${ex.rate}`} value={`− ${inr(ex.platform_fee_inr)}`} />
        <CalcStep n="6" label="TDS" detail={tdsLine} value={ex.tds_applicable && !ex.compensated ? `− ${inr(ex.tds_inr)}` : "− ₹0"} />
        <CalcStep n="=" label="Net to user" detail="gross − platform fee − TDS charged" value={inr(ex.net)} highlight />
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
function Collapsible({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-[var(--color-line)] rounded-[var(--radius)] overflow-hidden mt-3">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-4 h-11 text-[13px] font-medium text-[var(--color-muted)] hover:bg-[var(--color-bg)]"><span>{title}</span><span className="text-[var(--color-faint)]">{open ? "Hide" : "Show"}</span></button>
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
      <div className="text-[12px] text-[var(--color-muted)] rounded-[var(--radius)] bg-[var(--color-surface)] border border-[var(--color-line)] px-3 py-2">{firstParty ? "First party: receiver first/last name, relationship (SELF), and address mirror the sender. The bank account is still captured." : "Third party: the receiver is a distinct party, so its full identity, address, and bank account are captured alongside the sender."}</div>
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
