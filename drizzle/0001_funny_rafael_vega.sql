CREATE INDEX "visits_occurred_at_idx" ON "visits" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "visits_page_path_idx" ON "visits" USING btree ("page_path");--> statement-breakpoint
CREATE INDEX "visits_session_hash_idx" ON "visits" USING btree ("session_hash","occurred_at");