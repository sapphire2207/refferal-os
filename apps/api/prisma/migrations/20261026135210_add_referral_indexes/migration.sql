-- CreateIndex
CREATE INDEX "referrals_pipeline_stage_work_status_assigned_to_idx" ON "referrals"("pipeline_stage", "work_status", "assigned_to");

-- CreateIndex
CREATE INDEX "referrals_version_idx" ON "referrals"("version");

-- CreateIndex
CREATE INDEX "referrals_case_outcome_idx" ON "referrals"("case_outcome");

-- CreateIndex
CREATE INDEX "referrals_billing_status_idx" ON "referrals"("billing_status");

-- CreateIndex
CREATE INDEX "referrals_site_state_legal_entity_idx" ON "referrals"("site", "state", "legal_entity");
