/*
  Unified transaction demo — engine for the offramp (crypto -> fiat) sequence.

  Two SEPARATE configs per client:
    - partner_config : payout_partner (default) + nre_payout_partner (used for NRE accounts).
                       Routing is system-driven: NRE -> nre_payout_partner if set, else payout_partner.
    - pricing_config : the real fee-config (anonymised): spread, price source, band, tds,
                       compensate_tds, plus a nested traditional_rail block for the D9 price.

  Flow: client config -> quote (one quote_id, simplified prices) -> fat create-transaction
  (user + bank created inline, full Travel Rule sender + receiver) -> routing -> KYC/KYB+AML ->
  created/processing/completed.

  Grounded in: PRD "Quote and Transaction Redesign" (Confluence 2411364431), 2026-06-16 MoM,
  wiki/30 Pricing (real fee-configs), Saber live docs. Numbers illustrative, not live.
*/

export const PLATFORM_FEE_USD = 0.3; // flat platform fee per transaction (platform-pricing PRD)

export type PartnerType = "RPFS" | "D9";
export type AccountType = "NRE" | "NRO" | "SAVINGS";
export type TxnType = "C2C" | "C2B" | "B2C" | "B2B";
export type PartyScope = "FIRST_PARTY" | "THIRD_PARTY";
export type SellCurrency = "USDT" | "USDC";

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
  platform_fee_usd: number; // flat $0.30
  platform_fee: number; // wiki fraction of amount; usually 0
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
export function railRate(cfg: ClientConfig, rail: PartnerType) {
  const source = rail === "D9" ? cfg._source.d9 : cfg._source.stables;
  const fee = railFee(cfg, rail);
  const post = source * (1 + fee.client_spread);
  return r2(fee.min_price === fee.max_price ? fee.min_price : Math.max(fee.min_price, Math.min(fee.max_price, post)));
}

/*
  final_price — the effective per-unit rate after the percentage fees and tax,
  built on base_price (the clamped post-spread railRate). Mirrors the backend:

    netPlatformFee = platform_fee - discount
    final_price    = base_price
                   * (1 - netPlatformFee*(1 + tax_on_fee) - client_fee)
                   * (1 - tds)

  These terms are all percentages, so final_price stays independent of ticket size.
  The flat fixed fee (platform_fee_usd) is deliberately NOT folded in here; it is
  applied as a separate flat line on settlement (see priceFor.you_receive).
*/
export function finalPrice(cfg: ClientConfig, rail: PartnerType, basePrice: number, isNri: boolean): number {
  const pc = cfg.pricing_config;
  const net = pc.platform_fee - pc.discount;
  const feeFactor = 1 - (net * (1 + pc.tax_on_fee) + pc.client_fee);
  const tdsApplies = rail === "RPFS" && pc.tds > 0 && !isNri && !pc.compensate_tds;
  const tdsFactor = tdsApplies ? 1 - pc.tds : 1;
  return r2(basePrice * feeFactor * tdsFactor);
}

export type Tax = {
  tds: { applicable: boolean; rate?: number; depends_on?: string; amount_inr?: number; compensated?: boolean };
};
export type Price = {
  partner_type: PartnerType;
  partner_name: string;
  applies_to: AccountType[];
  rate: number; // = base_price (post-spread, clamped)
  base_price: number; // post-spread, clamped rate
  final_price: number; // effective rate after % fees + TDS
  source_price: number;
  gross_inr: number; // amount x base_price (pre everything)
  pre_fee_to_amount: number; // amount x final_price (receivable before the service charge)
  service_charge: ServiceCharge; // the flat fixed fee, its own object
  total_fee: number; // summation of fee_breakup only (the % rate inputs); excludes service_charge
  fee_currency: string; // currency of fee_breakup / total_fee
  fee_breakup: FeeBreakup;
  tax: Tax;
  you_receive: number;
};
// The flat fixed fee, reported as its own object (sibling of fee_breakup in the response).
export type ServiceCharge = { amount: number; currency: string };
// The percentage rate inputs, folded into final_price. total_fee is their sum (0 in the demo configs).
export type FeeBreakup = {
  platform_fee: number; // fraction
  network_fee: number;
  client_fee: number; // fraction
  discount: number; // fraction
  tax_on_fee: number; // fraction (GST on platform fee)
  tds: number; // fraction
};

function partnerForRail(cfg: ClientConfig, rail: PartnerType): Partner | undefined {
  if (cfg.partner_config.payout_partner.type === rail) return cfg.partner_config.payout_partner;
  if (cfg.partner_config.nre_payout_partner?.type === rail) return cfg.partner_config.nre_payout_partner;
  return undefined;
}

export function priceFor(cfg: ClientConfig, rail: PartnerType, amount: number, isNri: boolean): Price {
  const pc = cfg.pricing_config;
  const rate = railRate(cfg, rail); // base_price
  const finalRate = finalPrice(cfg, rail, rate, isNri); // effective rate, % fees + TDS folded in
  const gross = r0(amount * rate);
  const preFee = r0(amount * finalRate); // receivable before the service charge (amount x final_price)
  const svcAmt = pc.platform_fee_usd; // flat fixed fee, e.g. 0.30
  const isRpfs = rail === "RPFS";
  const tdsApplicable = isRpfs && pc.tds > 0 && !isNri;
  const tdsRaw = tdsApplicable ? r0(gross * pc.tds) : 0;
  const compensated = !!pc.compensate_tds;
  const partner = partnerForRail(cfg, rail);
  // Off-ramp demo: the fee is charged in USDT, over and above the rate (US-9 / appendix).
  const service_charge: ServiceCharge = { amount: svcAmt, currency: "USDT" };
  // fee_breakup carries only the percentage rate inputs (folded into final_price); 0 in these configs.
  const fee_breakup: FeeBreakup = {
    platform_fee: pc.platform_fee,
    network_fee: 0,
    client_fee: pc.client_fee,
    discount: pc.discount,
    tax_on_fee: pc.tax_on_fee,
    tds: 0,
  };
  const total_fee = fee_breakup.platform_fee + fee_breakup.network_fee + fee_breakup.client_fee + fee_breakup.tax_on_fee + fee_breakup.tds - fee_breakup.discount;
  return {
    partner_type: rail,
    partner_name: partner ? `${partner.AggregatorName} (${rail}, ${rail === "D9" ? "traditional" : "stables"})` : rail,
    applies_to: rail === "D9" ? ["NRE"] : ["NRO", "SAVINGS"],
    rate,
    base_price: rate,
    final_price: finalRate,
    source_price: rail === "D9" ? cfg._source.d9 : cfg._source.stables,
    gross_inr: gross,
    pre_fee_to_amount: preFee,
    service_charge,
    total_fee,
    fee_currency: "INR",
    fee_breakup,
    tax: isRpfs
      ? { tds: { applicable: tdsApplicable, rate: pc.tds, depends_on: "is_nri", amount_inr: tdsRaw, compensated } }
      : { tds: { applicable: false } },
    you_receive: r0(Math.max(0, (amount - svcAmt) * finalRate)), // floor at 0; service charge deducted in crypto, then converted
  };
}

/* Step-by-step price calculation, for the "how it's calculated" view. */
export type PriceExplain = {
  rail: PartnerType;
  source: number;
  spread: number;
  post_spread: number;
  pinned: boolean;
  min: number;
  max: number;
  rate: number; // base_price
  base_price: number;
  final_price: number; // effective rate after % fees + TDS
  net_platform_fee: number; // platform_fee - discount (fraction)
  client_fee: number;
  tax_on_fee: number;
  amount: number;
  gross: number;
  pre_fee_to_amount: number; // amount x final_price
  service_charge_amount: number; // flat fixed fee, e.g. 0.30
  service_charge_currency: string; // USDT (off-ramp)
  service_charge_inr: number; // INR impact of the service charge (amount x final_price terms)
  tds_rate: number;
  tds_inr: number;
  tds_applicable: boolean;
  compensated: boolean;
  net: number;
};
export function explainPrice(cfg: ClientConfig, rail: PartnerType, amount: number, isNri: boolean): PriceExplain {
  const source = rail === "D9" ? cfg._source.d9 : cfg._source.stables;
  const fee = railFee(cfg, rail);
  const post = r2(source * (1 + fee.client_spread));
  const p = priceFor(cfg, rail, amount, isNri);
  return {
    rail,
    source,
    spread: fee.client_spread,
    post_spread: post,
    pinned: fee.min_price === fee.max_price,
    min: fee.min_price,
    max: fee.max_price,
    rate: p.rate,
    base_price: p.base_price,
    final_price: p.final_price,
    net_platform_fee: cfg.pricing_config.platform_fee - cfg.pricing_config.discount,
    client_fee: cfg.pricing_config.client_fee,
    tax_on_fee: cfg.pricing_config.tax_on_fee,
    amount,
    gross: p.gross_inr,
    pre_fee_to_amount: p.pre_fee_to_amount,
    service_charge_amount: p.service_charge.amount,
    service_charge_currency: p.service_charge.currency,
    service_charge_inr: r0(p.service_charge.amount * p.final_price),
    tds_rate: cfg.pricing_config.tds,
    tds_inr: p.tax.tds.amount_inr ?? 0,
    tds_applicable: p.tax.tds.applicable,
    compensated: !!cfg.pricing_config.compensate_tds,
    net: p.you_receive,
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
  from_amount: number;
  is_nri: boolean;
  prices: Price[];
};
export type QuoteInput = { client_id: string; from_amount: number; transaction_type: TxnType; is_nri: boolean };

export function buildQuote(input: QuoteInput): Quote {
  return buildQuoteFor(getClient(input.client_id), input);
}

export function buildQuoteFor(c: ClientConfig, input: { from_amount: number; transaction_type: TxnType; is_nri: boolean }): Quote {
  const pcfg = c.partner_config;
  const partners: Partner[] = [pcfg.payout_partner];
  if (pcfg.nre_payout_partner) partners.push(pcfg.nre_payout_partner);
  const prices = partners.map((p) => priceFor(c, p.type, input.from_amount, input.is_nri));
  return {
    quote_id: "qt_" + Math.random().toString(36).slice(2, 10),
    expires_at: new Date(Date.now() + 30000).toISOString(),
    ttl_seconds: 30,
    transaction_type: input.transaction_type,
    from_currency: c.from_currency,
    to_currency: "INR",
    from_amount: input.from_amount,
    is_nri: input.is_nri,
    prices,
  };
}

/* Client-facing quote response projection: hides internal partner identity and noise. */
export function toQuoteResponse(q: Quote) {
  return {
    quote_id: q.quote_id,
    expires_at: q.expires_at,
    ttl_seconds: q.ttl_seconds,
    transaction_type: q.transaction_type,
    from_currency: q.from_currency,
    to_currency: q.to_currency,
    from_amount: q.from_amount,
    is_nri: q.is_nri,
    // Matches the live quote-response contract: base_price + final_price are the rate;
    // total_fee is the sum of fee_breakup (% inputs), and the flat fee is its own
    // service_charge { amount, currency } object, sibling of fee_breakup.
    prices: q.prices.map((p) => ({
      base_price: p.base_price,
      final_price: p.final_price,
      pre_fee_to_amount: p.pre_fee_to_amount,
      to_amount: p.you_receive,
      total_fee: p.total_fee,
      fee_currency: p.fee_currency,
      fee_breakup: p.fee_breakup,
      service_charge: p.service_charge,
      tax: { tds: { applicable: p.tax.tds.applicable, rate: p.tax.tds.rate ?? 0 } },
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

export function resolveRouting(c: ClientConfig, accountType: AccountType, amount: number, isNri: boolean): RoutingDecision {
  const useNre = accountType === "NRE" && !!c.partner_config.nre_payout_partner;
  const partner = useNre ? c.partner_config.nre_payout_partner! : c.partner_config.payout_partner;
  const chosen = priceFor(c, partner.type, amount, isNri);
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
    { label: "Locked price", detail: `${chosen.rate} -> you receive ₹${chosen.you_receive.toLocaleString("en-IN")}` },
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
    party_scope: i.party_scope, // derived from the quote / flow
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
