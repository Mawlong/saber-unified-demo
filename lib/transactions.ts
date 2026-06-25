/*
  Unified transaction demo — engine for the offramp (crypto -> fiat) sequence.

  Two SEPARATE configs per client:
    - partner_config : payout_partner (default) + nre_payout_partner (used for NRE accounts).
                       Routing is system-driven: NRE -> nre_payout_partner if set, else payout_partner.
    - pricing_config : the real fee-config (anonymised): spread, price source, band, tds,
                       compensate_tds, a flat service charge, plus a nested traditional_rail block.

  Amount basis (off-ramp / sell only):
    - from_amount : the client fixes the crypto to sell. We deduct the flat service charge
                    first, convert the remainder to INR, then compute TDS / fees on that INR.
    - to_amount   : the client fixes the INR to convert. We back-calculate the crypto principal,
                    add the flat service charge ON TOP (sender sends principal + charge), and
                    compute TDS / fees on the principal INR. The service charge is never taxed.

  Grounded in: PRD "Quote and Transaction Redesign" (Confluence 2411364431), 2026-06-16 MoM,
  wiki/30 Pricing (real fee-configs), Saber live docs. Numbers illustrative, not live.
*/

export const PLATFORM_FEE_USD = 0.3; // flat service charge per transaction, in crypto (USDT/USDC)

export type PartnerType = "RPFS" | "D9";
export type AccountType = "NRE" | "NRO" | "SAVINGS";
export type TxnType = "C2C" | "C2B" | "B2C" | "B2B";
export type PartyScope = "FIRST_PARTY" | "THIRD_PARTY";
export type SellCurrency = "USDT" | "USDC";
export type AmountBasis = "from_amount" | "to_amount";

/* ---------- partner config (system-driven routing) ---------- */
export type PartnerMapping = { AggregatorName: string; PaymentMethodName: string; AccountNumber?: string };
export type Partner = PartnerMapping & { type: PartnerType };
export type PartnerConfig = {
  payout_partner: Partner; // default for all payouts
  nre_payout_partner?: Partner; // used when the bank account is NRE
};

/* ---------- pricing config (the real fee-config) ---------- */
export type RailFee = { client_spread: number; price_stream: string; min_price: number; max_price: number };
export type PricingConfig = {
  platform_fee_usd: number; // flat service charge, e.g. 0.30 (crypto)
  platform_fee: number; // % of amount; usually 0
  tax_on_fee: number; // GST on the platform fee
  discount: number;
  client_fee: number;
  client_spread: number;
  price_lock_spread: number;
  tds: number;
  compensate_tds?: boolean; // Saber absorbs the TDS so the user is made whole
  min_price: number;
  max_price: number; // min==max -> static pinned price
  price_stream?: string; // "Xe" dynamic; absent => static
  traditional_rail?: RailFee; // D9 section
};

export type ClientConfig = {
  id: string;
  label: string;
  kind: string;
  from_currency: SellCurrency;
  partner_config: PartnerConfig;
  pricing_config: PricingConfig;
  _source: { stables: number; d9: number };
};

const RPFS = (acct?: string, agg = "Transxt", method = "bank_transfer"): Partner => ({
  type: "RPFS",
  AggregatorName: agg,
  PaymentMethodName: method,
  AccountNumber: acct,
});
const D9_PARTNER: Partner = { type: "D9", AggregatorName: "D9", PaymentMethodName: "bank_transfer", AccountNumber: "D9-IN-001" };

export const clients: ClientConfig[] = [
  {
    // Abound: USDC -> INR, static pinned 96.32, no TDS, stables only
    id: "a",
    label: "Client A",
    kind: "Static OTC price · sells USDC · stables only",
    from_currency: "USDC",
    partner_config: { payout_partner: RPFS(undefined, "Mudrex", "manual_bank_transfer") },
    pricing_config: {
      platform_fee_usd: PLATFORM_FEE_USD, platform_fee: 0, tax_on_fee: 0.18, discount: 0, client_fee: 0,
      client_spread: 0.0028, price_lock_spread: 0, tds: 0, min_price: 96.32, max_price: 96.32,
    },
    _source: { stables: 96.32, d9: 0 },
  },
  {
    // Aspora: USDT -> INR, static pinned 95.53, no TDS, stables only
    id: "b",
    label: "Client B",
    kind: "Static OTC price · sells USDT · stables only",
    from_currency: "USDT",
    partner_config: { payout_partner: RPFS("2420000018XX") },
    pricing_config: {
      platform_fee_usd: PLATFORM_FEE_USD, platform_fee: 0, tax_on_fee: 0.18, discount: 0, client_fee: 0,
      client_spread: 0.005, price_lock_spread: 0, tds: 0, min_price: 95.53, max_price: 95.53,
    },
    _source: { stables: 95.53, d9: 0 },
  },
  {
    // Circle: USDC -> INR, dynamic Xe, -0.5%, TDS 1% but Saber absorbs it (compensate_tds)
    id: "c",
    label: "Client C",
    kind: "Dynamic (Xe) · sells USDC · Saber absorbs TDS",
    from_currency: "USDC",
    partner_config: { payout_partner: RPFS("2420000018XX") },
    pricing_config: {
      platform_fee_usd: PLATFORM_FEE_USD, platform_fee: 0, tax_on_fee: 0, discount: 0, client_fee: 0,
      client_spread: -0.005, price_lock_spread: 0, tds: 0.01, compensate_tds: true,
      min_price: 70, max_price: 100, price_stream: "Xe",
    },
    _source: { stables: 88.0, d9: 0 },
  },
  {
    // Frex: USDC -> INR, dynamic Xe, -1.5% stables; traditional_rail +0.3% (D9); NRE enabled
    id: "d",
    label: "Client D",
    kind: "Dynamic (Xe) · sells USDC · NRE enabled (two payout partners)",
    from_currency: "USDC",
    partner_config: { payout_partner: RPFS("2420000018XX"), nre_payout_partner: D9_PARTNER },
    pricing_config: {
      platform_fee_usd: PLATFORM_FEE_USD, platform_fee: 0, tax_on_fee: 0, discount: 0, client_fee: 0,
      client_spread: -0.015, price_lock_spread: 0, tds: 0.01,
      min_price: 70, max_price: 100, price_stream: "Xe",
      traditional_rail: { client_spread: 0.003, price_stream: "Xe", min_price: 80, max_price: 100 },
    },
    _source: { stables: 88.0, d9: 88.5 },
  },
];

export function getClient(id: string) {
  return clients.find((c) => c.id === id)!;
}

/* ---------- pricing ---------- */
const r2 = (n: number) => Math.round(n * 100) / 100;
const r0 = (n: number) => Math.round(n);

export function railFee(cfg: ClientConfig, rail: PartnerType): { client_spread: number; min_price: number; max_price: number } {
  if (rail === "D9" && cfg.pricing_config.traditional_rail) return cfg.pricing_config.traditional_rail;
  return cfg.pricing_config;
}
// extraSpread is the price-lock cushion, applied only when the client fixes the output (to_amount).
export function railRate(cfg: ClientConfig, rail: PartnerType, extraSpread = 0) {
  const source = rail === "D9" ? cfg._source.d9 : cfg._source.stables;
  const fee = railFee(cfg, rail);
  const post = source * (1 + fee.client_spread + extraSpread);
  return r2(fee.min_price === fee.max_price ? fee.min_price : Math.max(fee.min_price, Math.min(fee.max_price, post)));
}

export type Money = { amount: number; currency: string };
export type Tax = {
  tds: { applicable: boolean; rate?: number; depends_on?: string; amount_inr?: number; compensated?: boolean };
};
// % rate inputs (mostly 0 in the demo configs); the flat service charge is NOT in here.
export type FeeBreakup = { platform_fee: number; network_fee: number; client_fee: number; discount: number; tax_on_fee: number };

export type Price = {
  option: number; // 1 or 2 — distinguishes the two quotes
  label: string; // human label
  partner_type: PartnerType;
  partner_name: string;
  applies_to: AccountType[];
  amount_basis: AmountBasis;
  // rate
  source_price: number;
  base_price: number; // clamp(post-spread)
  rate: number; // alias of base_price (the conversion rate)
  // crypto side
  from_amount: Money; // total crypto the sender sends (principal + service charge)
  service_charge: Money; // flat, in crypto, never taxed
  principal: Money; // crypto actually converted (from_amount - service_charge)
  // inr side
  gross_inr: number; // principal x rate, before fees/tds
  fee_breakup: FeeBreakup;
  fees_inr: { platform_inr: number; gst_inr: number; client_fee_inr: number };
  total_fee_inr: number; // sum of the INR fees above (excludes the flat service charge)
  tax: Tax; // tds in inr, computed on gross_inr
  to_amount: number; // net INR to the beneficiary
  you_receive: number; // alias of to_amount
};

function partnerForRail(cfg: ClientConfig, rail: PartnerType): Partner | undefined {
  if (cfg.partner_config.payout_partner.type === rail) return cfg.partner_config.payout_partner;
  if (cfg.partner_config.nre_payout_partner?.type === rail) return cfg.partner_config.nre_payout_partner;
  return undefined;
}
function railLabel(rail: PartnerType) {
  return rail === "D9" ? "Quote 2 — Traditional rail (NRE accounts)" : "Quote 1 — Stables rail (NRO / savings)";
}

/*
  Compute one price (one rail) for the given basis + value.
    basis "from_amount": value is crypto sent.   principal = value - serviceCharge
    basis "to_amount":   value is INR to convert. principal = value / rate (crypto)
  TDS / % fees are computed on the converted INR (gross_inr). The flat service charge
  is charged separately in crypto and is never part of the INR or the tax base.
*/
export function priceFor(cfg: ClientConfig, rail: PartnerType, basis: AmountBasis, value: number, isNri: boolean): Price {
  const pc = cfg.pricing_config;
  // price-lock spread only applies when the client fixes the output amount (to_amount)
  const lock = basis === "to_amount" ? pc.price_lock_spread : 0;
  const rate = railRate(cfg, rail, lock);
  const ccy = cfg.from_currency;
  const svc = pc.platform_fee_usd;

  let fromCrypto: number;
  let principalCrypto: number;
  let grossInr: number;
  if (basis === "to_amount") {
    grossInr = Math.max(0, value); // the INR the client fixed (the conversion base)
    principalCrypto = rate > 0 ? r2(grossInr / rate) : 0;
    fromCrypto = r2(principalCrypto + svc); // sender sends principal + flat charge
  } else {
    fromCrypto = Math.max(0, value); // crypto the client fixed
    principalCrypto = r2(Math.max(0, fromCrypto - svc)); // charge deducted first
    grossInr = principalCrypto * rate;
  }
  grossInr = r0(grossInr);

  // percentage fees on the converted INR (all 0 in the demo configs except GST on a 0 fee)
  const platform_inr = r0(grossInr * pc.platform_fee);
  const gst_inr = r0(platform_inr * pc.tax_on_fee);
  const client_fee_inr = r0(grossInr * pc.client_fee);
  const discount_inr = r0(grossInr * pc.discount);

  const tdsApplicable = rail === "RPFS" && pc.tds > 0 && !isNri;
  const tds_inr = tdsApplicable ? r0(grossInr * pc.tds) : 0;
  const compensated = !!pc.compensate_tds;
  const tdsDeduct = tdsApplicable && !compensated ? tds_inr : 0;

  const total_fee_inr = platform_inr + gst_inr + client_fee_inr - discount_inr;
  const to_amount = r0(Math.max(0, grossInr - total_fee_inr - tdsDeduct));
  const partner = partnerForRail(cfg, rail);

  return {
    option: rail === "D9" ? 2 : 1,
    label: railLabel(rail),
    partner_type: rail,
    partner_name: partner ? `${partner.AggregatorName} (${rail}, ${rail === "D9" ? "traditional" : "stables"})` : rail,
    applies_to: rail === "D9" ? ["NRE"] : ["NRO", "SAVINGS"],
    amount_basis: basis,
    source_price: rail === "D9" ? cfg._source.d9 : cfg._source.stables,
    base_price: rate,
    rate,
    from_amount: { amount: fromCrypto, currency: ccy },
    service_charge: { amount: svc, currency: ccy },
    principal: { amount: principalCrypto, currency: ccy },
    gross_inr: grossInr,
    fee_breakup: { platform_fee: pc.platform_fee, network_fee: 0, client_fee: pc.client_fee, discount: pc.discount, tax_on_fee: pc.tax_on_fee },
    fees_inr: { platform_inr, gst_inr, client_fee_inr },
    total_fee_inr,
    tax: tdsApplicable
      ? { tds: { applicable: true, rate: pc.tds, depends_on: "is_nri", amount_inr: tds_inr, compensated } }
      : { tds: { applicable: false } },
    to_amount,
    you_receive: to_amount,
  };
}

/* Step-by-step price calculation, for the "how it's calculated" view. */
export type PriceExplain = {
  rail: PartnerType;
  option: number;
  label: string;
  basis: AmountBasis;
  source: number;
  spread: number;
  lock_spread: number; // price-lock cushion applied to the rate (to_amount basis only)
  post_spread: number;
  pinned: boolean;
  min: number;
  max: number;
  rate: number; // base_price
  currency: string;
  service_charge: number; // flat crypto charge
  from_amount: number; // total crypto sent
  principal_crypto: number; // crypto converted
  gross_inr: number; // principal x rate
  platform_inr: number;
  gst_inr: number;
  client_fee_inr: number;
  discount_inr: number;
  tds_rate: number;
  tds_inr: number;
  tds_applicable: boolean;
  compensated: boolean;
  total_deductions_inr: number;
  to_amount: number; // net INR
};
export function explainPrice(cfg: ClientConfig, rail: PartnerType, basis: AmountBasis, value: number, isNri: boolean): PriceExplain {
  const source = rail === "D9" ? cfg._source.d9 : cfg._source.stables;
  const fee = railFee(cfg, rail);
  const lock = basis === "to_amount" ? cfg.pricing_config.price_lock_spread : 0;
  const post = r2(source * (1 + fee.client_spread + lock));
  const p = priceFor(cfg, rail, basis, value, isNri);
  const tdsDeduct = p.tax.tds.applicable && !p.tax.tds.compensated ? p.tax.tds.amount_inr ?? 0 : 0;
  return {
    rail,
    option: p.option,
    label: p.label,
    basis,
    source,
    spread: fee.client_spread,
    lock_spread: lock,
    post_spread: post,
    pinned: fee.min_price === fee.max_price,
    min: fee.min_price,
    max: fee.max_price,
    rate: p.rate,
    currency: cfg.from_currency,
    service_charge: p.service_charge.amount,
    from_amount: p.from_amount.amount,
    principal_crypto: p.principal.amount,
    gross_inr: p.gross_inr,
    platform_inr: p.fees_inr.platform_inr,
    gst_inr: p.fees_inr.gst_inr,
    client_fee_inr: p.fees_inr.client_fee_inr,
    discount_inr: r0(p.gross_inr * cfg.pricing_config.discount),
    tds_rate: cfg.pricing_config.tds,
    tds_inr: p.tax.tds.amount_inr ?? 0,
    tds_applicable: p.tax.tds.applicable,
    compensated: !!cfg.pricing_config.compensate_tds,
    total_deductions_inr: p.total_fee_inr + tdsDeduct,
    to_amount: p.to_amount,
  };
}

/* ---------- quote ---------- */
export type Quote = {
  quote_id: string;
  expires_at: string;
  ttl_seconds: number;
  transaction_type: TxnType;
  from_currency: SellCurrency;
  to_currency: "INR";
  amount_basis: AmountBasis;
  from_amount?: number; // set when basis === from_amount (crypto)
  to_amount?: number; // set when basis === to_amount (INR)
  is_nri: boolean;
  prices: Price[];
};
export type QuoteInput = { client_id: string; amount_basis: AmountBasis; amount_value: number; transaction_type: TxnType; is_nri: boolean };

export function buildQuote(input: QuoteInput): Quote {
  return buildQuoteFor(getClient(input.client_id), input);
}

export function buildQuoteFor(
  c: ClientConfig,
  input: { amount_basis: AmountBasis; amount_value: number; transaction_type: TxnType; is_nri: boolean }
): Quote {
  const pcfg = c.partner_config;
  const partners: Partner[] = [pcfg.payout_partner];
  if (pcfg.nre_payout_partner) partners.push(pcfg.nre_payout_partner);
  const prices = partners
    .map((p) => priceFor(c, p.type, input.amount_basis, input.amount_value, input.is_nri))
    .sort((a, b) => a.option - b.option);
  return {
    quote_id: "qt_" + Math.random().toString(36).slice(2, 10),
    expires_at: new Date(Date.now() + 30000).toISOString(),
    ttl_seconds: 30,
    transaction_type: input.transaction_type,
    from_currency: c.from_currency,
    to_currency: "INR",
    amount_basis: input.amount_basis,
    ...(input.amount_basis === "from_amount" ? { from_amount: input.amount_value } : { to_amount: input.amount_value }),
    is_nri: input.is_nri,
    prices,
  };
}

/* Client-facing quote response projection. Each price is clearly labelled (option + label)
   so the two quotes are distinguishable, and the basis used is echoed at the top. */
export function toQuoteResponse(q: Quote) {
  return {
    quote_id: q.quote_id,
    expires_at: q.expires_at,
    ttl_seconds: q.ttl_seconds,
    transaction_type: q.transaction_type,
    amount_basis: q.amount_basis, // "from_amount" | "to_amount" — which the client fixed
    from_currency: q.from_currency,
    to_currency: q.to_currency,
    ...(q.amount_basis === "from_amount" ? { from_amount: q.from_amount } : { to_amount: q.to_amount }),
    is_nri: q.is_nri,
    prices: q.prices.map((p) => ({
      option: p.option, // 1 or 2
      label: p.label, // "Quote 1 — Stables rail …" / "Quote 2 — Traditional rail …"
      applies_to: p.applies_to,
      base_price: p.base_price,
      rate: p.rate,
      from_amount: p.from_amount, // total crypto sent (incl. service charge)
      service_charge: p.service_charge, // flat, crypto
      principal: p.principal, // crypto converted
      gross_inr: p.gross_inr, // converted INR before fees/tds
      total_fee_inr: p.total_fee_inr,
      tax: { tds: { applicable: p.tax.tds.applicable, rate: p.tax.tds.rate ?? 0, amount_inr: p.tax.tds.amount_inr ?? 0 } },
      to_amount: p.to_amount, // net INR to beneficiary
    })),
  };
}

/* ---------- routing (system-driven: payout_partner vs nre_payout_partner) ---------- */
export type RoutingDecision = {
  account_type: AccountType;
  steps: { label: string; detail: string }[];
  chosen: Price;
  partner: Partner;
};

export function resolveRouting(c: ClientConfig, accountType: AccountType, quote: Quote): RoutingDecision {
  const useNre = accountType === "NRE" && !!c.partner_config.nre_payout_partner;
  const partner = useNre ? c.partner_config.nre_payout_partner! : c.partner_config.payout_partner;
  const chosen = quote.prices.find((p) => p.partner_type === partner.type) ?? quote.prices[0];
  const tds = chosen.tax.tds;
  const steps: RoutingDecision["steps"] = [
    { label: "Bank account type", detail: accountType },
    {
      label: useNre ? "NRE payout partner (from config)" : "Payout partner (from config)",
      detail: `${partner.AggregatorName} (${partner.type === "D9" ? "traditional" : "stables"})`,
    },
    {
      label: partner.type === "D9" ? "Settles offshore" : "Settles onshore",
      detail: tds.applicable ? "1% TDS (resident)" : tds.compensated ? "TDS absorbed by Saber" : "no TDS",
    },
    { label: "Locked price", detail: `${chosen.rate} -> you receive ₹${chosen.to_amount.toLocaleString("en-IN")}` },
  ];
  return { account_type: accountType, steps, chosen, partner };
}

/* ---------- party types ---------- */
export function partyTypes(t: TxnType) {
  return { senderBusiness: t === "B2C" || t === "B2B", receiverBusiness: t === "C2B" || t === "B2B" };
}

/* ---------- fat create-transaction request ---------- */
export type Address = {
  type: string; // PRESENT | PERMANENT (ISO / D9 address_type)
  line1: string;
  line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
};
export type SenderInput = {
  is_business: boolean;
  legal_name: string;
  registration_number: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  nationality: string;
  is_nri: boolean;
  id_type: string;
  id_number: string;
  email: string;
  mobile: string;
  address: Address;
};
export type ReceiverInput = {
  is_business: boolean;
  legal_name: string;
  first_name: string;
  last_name: string;
  relationship: string;
  address: Address;
  account_number: string;
  ifsc: string;
  account_type: AccountType;
};
export type CreateInput = {
  client_id: string;
  quote_id: string;
  transaction_type: TxnType;
  party_scope: PartyScope;
  purpose_code: string;
  source_of_income: string;
  message: string;
  sender: SenderInput;
  receiver: ReceiverInput;
};

export function buildCreateRequest(i: CreateInput) {
  const rcvName = `${i.receiver.first_name} ${i.receiver.last_name}`.trim();
  return {
    transaction_type: i.transaction_type,
    transaction_mode: "pool_sell",
    party_scope: i.party_scope, // derived from is_nri (true => first party, false => third party)
    quote_id: i.quote_id,
    client_reference: "ref_" + i.quote_id.slice(3, 9), // idempotency
    purpose_code: i.purpose_code,
    source_of_income: i.source_of_income,
    message: i.message,
    sender: i.sender.is_business
      ? {
          type: "BUSINESS",
          legal_name: i.sender.legal_name,
          registration_number: i.sender.registration_number,
          incorporation_country: i.sender.nationality,
          is_nri: i.sender.is_nri,
          address: { ...i.sender.address },
        }
      : {
          type: "INDIVIDUAL",
          first_name: i.sender.first_name,
          last_name: i.sender.last_name,
          email: i.sender.email,
          mobile_number: i.sender.mobile,
          date_of_birth: i.sender.date_of_birth,
          nationality: i.sender.nationality,
          is_nri: i.sender.is_nri,
          id: { type: i.sender.id_type, number: i.sender.id_number, issued_country: i.sender.nationality },
          address: { ...i.sender.address },
        },
    receiver: i.receiver.is_business
      ? {
          type: "BUSINESS",
          legal_name: i.receiver.legal_name,
          relationship: i.receiver.relationship,
          address: { ...i.receiver.address },
          bank_details: {
            account_holder_name: i.receiver.legal_name,
            account_number: i.receiver.account_number,
            routing_code: i.receiver.ifsc,
            account_type: i.receiver.account_type, // can be skipped if derived via bank validation
          },
        }
      : {
          type: "INDIVIDUAL",
          first_name: i.receiver.first_name,
          last_name: i.receiver.last_name,
          relationship: i.receiver.relationship,
          address: { ...i.receiver.address },
          bank_details: {
            account_holder_name: rcvName,
            account_number: i.receiver.account_number,
            routing_code: i.receiver.ifsc,
            account_type: i.receiver.account_type, // can be skipped if derived via bank validation
          },
        },
  };
}

export const SENDER_ADDRESS: Address = {
  type: "PRESENT", line1: "12 MG Road", line2: "Indiranagar", city: "Bengaluru", state: "Karnataka", postal_code: "560038", country: "IN",
};
export const RECEIVER_ADDRESS: Address = {
  type: "PRESENT", line1: "8 Park Street", line2: "Apt 4B", city: "Kolkata", state: "West Bengal", postal_code: "700016", country: "IN",
};
