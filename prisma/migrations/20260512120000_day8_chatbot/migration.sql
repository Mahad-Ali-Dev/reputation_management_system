-- Day 8: AI chatbot — RAG over uploaded docs + embeddable widget.
-- See DATA_MODEL.md §3.9 + AI_STRATEGY.md §4 (RAG pipeline).

-- ============================================================
-- pgvector extension (managed by Neon, just enable)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- ai_documents — knowledge docs ingested for RAG
-- ============================================================
CREATE TABLE ai_documents (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  establishment_id   uuid REFERENCES establishments(id) ON DELETE CASCADE,
  title              text NOT NULL,
  source_type        text NOT NULL,                          -- manual | url | pdf | gbp_listing
  source_uri         text,
  content            text NOT NULL,
  content_hash       text NOT NULL,                          -- SHA-256 for delta re-embed
  status             text NOT NULL DEFAULT 'indexing',       -- indexing | indexed | quarantined | failed
  last_indexed_at    TIMESTAMP(3),
  created_at         TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT ai_documents_source_chk CHECK (source_type IN ('manual','url','pdf','gbp_listing')),
  CONSTRAINT ai_documents_status_chk CHECK (status IN ('indexing','indexed','quarantined','failed'))
);
CREATE INDEX idx_ai_doc_org ON ai_documents(organization_id, status);

ALTER TABLE ai_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ai_documents
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));

-- ============================================================
-- ai_embeddings — chunked + embedded for vector search
-- ============================================================
CREATE TABLE ai_embeddings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id         uuid NOT NULL REFERENCES ai_documents(id) ON DELETE CASCADE,
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  establishment_id    uuid REFERENCES establishments(id) ON DELETE CASCADE,
  chunk_text          text NOT NULL,
  embedding           vector(1024),                          -- voyage-3 dim
  content_hash        text NOT NULL,
  position            integer NOT NULL,
  metadata            jsonb,                                 -- {section, page_no, source_uri}
  created_at          TIMESTAMP(3) NOT NULL DEFAULT now()
);
-- HNSW index for similarity search. m=32 (denser graph), ef_construction=200 (better quality).
-- Per DB review CR: retune for multi-tenant; iterative_scan='strict_order' set per session.
CREATE INDEX idx_ai_emb_hnsw ON ai_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 32, ef_construction = 200);
CREATE INDEX idx_ai_emb_org_est ON ai_embeddings(organization_id, establishment_id);
CREATE INDEX idx_ai_emb_doc ON ai_embeddings(document_id, position);

ALTER TABLE ai_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_embeddings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ai_embeddings
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));

-- ============================================================
-- ai_conversations — chatbot session per visitor
-- ============================================================
CREATE TABLE ai_conversations (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  establishment_id        uuid REFERENCES establishments(id) ON DELETE CASCADE,
  visitor_id              text NOT NULL,                     -- anonymous browser ID (from widget cookie)
  channel                 text NOT NULL DEFAULT 'webchat',   -- webchat | phone
  lead_email              text,
  lead_phone              text,
  handed_off_at           TIMESTAMP(3),                      -- if escalated to human
  consent_recorded_at     TIMESTAMP(3),                      -- phone receptionist (n/a for webchat)
  parent_conversation_id  uuid REFERENCES ai_conversations(id),  -- if forked due to jailbreak detection
  terminated_reason       text,                              -- normal | cost_cap | jailbreak | error
  created_at              TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT ai_conversations_channel_chk CHECK (channel IN ('webchat','phone'))
);
CREATE INDEX idx_ai_conv_org ON ai_conversations(organization_id, created_at DESC);
CREATE INDEX idx_ai_conv_visitor ON ai_conversations(visitor_id, created_at DESC);

ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ai_conversations
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));

-- ============================================================
-- widget_keys — per-tenant embeddable chatbot widget keys
-- ============================================================
CREATE TABLE widget_keys (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  establishment_id         uuid REFERENCES establishments(id) ON DELETE CASCADE,
  public_key               text UNIQUE NOT NULL,             -- embedded in <script src=...?key=PK>
  hmac_secret              text NOT NULL,                    -- per-tenant signing key (NOT encrypted at v1; see CR-4)
  origin_allowlist         text[],                            -- ['https://customer.com']
  rate_limit_window_sec    integer NOT NULL DEFAULT 300,
  rate_limit_max_msgs      integer NOT NULL DEFAULT 20,
  status                   text NOT NULL DEFAULT 'active',
  created_at               TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT widget_keys_status_chk CHECK (status IN ('active','revoked'))
);
CREATE INDEX idx_widget_org ON widget_keys(organization_id);

ALTER TABLE widget_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE widget_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON widget_keys
  USING       (organization_id = (SELECT app.current_org()))
  WITH CHECK  (organization_id = (SELECT app.current_org()));

-- ============================================================
-- Grants
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_documents TO app_tenant_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_embeddings TO app_tenant_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_conversations TO app_tenant_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON widget_keys TO app_tenant_user;
