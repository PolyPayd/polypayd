// TypeScript types mirroring the Supabase schema.
// String literal unions are used instead of TypeScript enums so values are
// plain strings at runtime and work naturally with Supabase query results.

// ---------------------------------------------------------------------------
// ENUM TYPES
// ---------------------------------------------------------------------------

export type KycStatus = "none" | "pending" | "verified" | "failed" | "blocked";

export type BatchMode = "equal_shares" | "custom_amounts";

export type BatchClosingMode = "close_when_full" | "manual_close";

export type BatchStatus =
  | "draft"
  | "awaiting_funding"
  | "open"
  | "ready_to_approve"
  | "approved"
  | "processing"
  | "completed"
  | "partially_completed"
  | "cancelled"
  | "refunded"
  | "held";

export type ClaimStatus =
  | "slot_held"
  | "claimed"
  | "expired"
  | "payout_pending"
  | "payout_completed"
  | "payout_failed"
  | "cancelled";

export type LedgerAccountType =
  | "user_wallet"
  | "batch_escrow"
  | "fees"
  | "external";

export type LedgerDirection = "credit" | "debit";

// ---------------------------------------------------------------------------
// ROW TYPES
// ---------------------------------------------------------------------------

export type User = {
  id: string;
  clerk_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  phone_number: string | null;
  kyc_status: KycStatus;
  kyc_verified_at: string | null;
  persona_inquiry_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type BankAccount = {
  id: string;
  user_id: string;
  sort_code: string;
  account_number: string;
  account_name: string | null;
  is_active: boolean;
  created_at: string;
};

export type Batch = {
  id: string;
  sender_user_id: string;
  name: string;
  description: string | null;
  mode: BatchMode;
  closing_mode: BatchClosingMode;
  status: BatchStatus;
  total_amount_pence: number;
  fee_pence: number;
  max_recipients: number;
  claim_link_id: string;
  claim_code: string;
  crezco_payment_id: string | null;
  opened_at: string | null;
  closed_at: string | null;
  approved_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  refunded_at: string | null;
  created_at: string;
};

export type BatchSlot = {
  id: string;
  batch_id: string;
  slot_index: number;
  amount_pence: number;
  reference_name: string | null;
  claimed_by_user_id: string | null;
};

export type Claim = {
  id: string;
  batch_id: string;
  slot_id: string | null;
  user_id: string;
  amount_pence: number;
  bank_account_id: string | null;
  status: ClaimStatus;
  slot_held_until: string | null;
  claimed_at: string | null;
  payout_initiated_at: string | null;
  payout_completed_at: string | null;
  crezco_payout_id: string | null;
  created_at: string;
};

export type LedgerAccount = {
  id: string;
  type: LedgerAccountType;
  owner_user_id: string | null;
  batch_id: string | null;
  created_at: string;
};

export type LedgerEntry = {
  id: string;
  account_id: string;
  direction: LedgerDirection;
  amount_pence: number;
  transaction_id: string;
  reference: string | null;
  created_at: string;
};

export type CrezcoWebhook = {
  id: string;
  event_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  processed_at: string | null;
  created_at: string;
};

export type PersonaWebhook = {
  id: string;
  event_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  processed_at: string | null;
  created_at: string;
};

export type AuditLog = {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
};

export type ClaimLink = {
  id: string;
  batch_id: string;
  is_active: boolean;
  created_at: string;
};

// ---------------------------------------------------------------------------
// INSERT TYPES
// ---------------------------------------------------------------------------

export type UserInsert = {
  id?: string;
  clerk_id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
  phone_number?: string | null;
  kyc_status?: KycStatus;
  kyc_verified_at?: string | null;
  persona_inquiry_id?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
};

export type BankAccountInsert = {
  id?: string;
  user_id: string;
  sort_code: string;
  account_number: string;
  account_name?: string | null;
  is_active?: boolean;
  created_at?: string;
};

export type BatchInsert = {
  id?: string;
  sender_user_id: string;
  name: string;
  description?: string | null;
  mode: BatchMode;
  closing_mode: BatchClosingMode;
  status?: BatchStatus;
  total_amount_pence: number;
  fee_pence: number;
  max_recipients: number;
  claim_link_id?: string;
  claim_code: string;
  crezco_payment_id?: string | null;
  opened_at?: string | null;
  closed_at?: string | null;
  approved_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  refunded_at?: string | null;
  created_at?: string;
};

export type BatchSlotInsert = {
  id?: string;
  batch_id: string;
  slot_index: number;
  amount_pence: number;
  reference_name?: string | null;
  claimed_by_user_id?: string | null;
};

export type ClaimInsert = {
  id?: string;
  batch_id: string;
  slot_id?: string | null;
  user_id: string;
  amount_pence: number;
  bank_account_id?: string | null;
  status?: ClaimStatus;
  slot_held_until?: string | null;
  claimed_at?: string | null;
  payout_initiated_at?: string | null;
  payout_completed_at?: string | null;
  crezco_payout_id?: string | null;
  created_at?: string;
};

export type LedgerAccountInsert = {
  id?: string;
  type: LedgerAccountType;
  owner_user_id?: string | null;
  batch_id?: string | null;
  created_at?: string;
};

export type LedgerEntryInsert = {
  id?: string;
  account_id: string;
  direction: LedgerDirection;
  amount_pence: number;
  transaction_id: string;
  reference?: string | null;
  created_at?: string;
};

export type CrezcoWebhookInsert = {
  id?: string;
  event_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  processed_at?: string | null;
  created_at?: string;
};

export type PersonaWebhookInsert = {
  id?: string;
  event_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  processed_at?: string | null;
  created_at?: string;
};

export type AuditLogInsert = {
  id?: string;
  user_id?: string | null;
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  metadata?: Record<string, unknown> | null;
  ip_address?: string | null;
  created_at?: string;
};

export type ClaimLinkInsert = {
  id?: string;
  batch_id: string;
  is_active?: boolean;
  created_at?: string;
};

// ---------------------------------------------------------------------------
// DATABASE TYPE (Supabase-compatible)
// ---------------------------------------------------------------------------

type TableDef<TRow, TInsert, TUpdate> = {
  Row: TRow;
  Insert: TInsert;
  Update: TUpdate;
  Relationships: never[];
};

export type Database = {
  public: {
    Tables: {
      users:            TableDef<User,           UserInsert,           Partial<User>>;
      bank_accounts:    TableDef<BankAccount,    BankAccountInsert,    Partial<BankAccount>>;
      batches:          TableDef<Batch,          BatchInsert,          Partial<Batch>>;
      batch_slots:      TableDef<BatchSlot,      BatchSlotInsert,      Partial<BatchSlot>>;
      claims:           TableDef<Claim,          ClaimInsert,          Partial<Claim>>;
      ledger_accounts:  TableDef<LedgerAccount,  LedgerAccountInsert,  Partial<LedgerAccount>>;
      ledger_entries:   TableDef<LedgerEntry,    LedgerEntryInsert,    Partial<LedgerEntry>>;
      crezco_webhooks:  TableDef<CrezcoWebhook,  CrezcoWebhookInsert,  Partial<CrezcoWebhook>>;
      persona_webhooks: TableDef<PersonaWebhook, PersonaWebhookInsert, Partial<PersonaWebhook>>;
      audit_logs:       TableDef<AuditLog,       AuditLogInsert,       Partial<AuditLog>>;
      claim_links:      TableDef<ClaimLink,      ClaimLinkInsert,      Partial<ClaimLink>>;
    };
    Views:     Record<string, never>;
    Functions: Record<string, never>;
  };
};
