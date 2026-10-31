/**
 * Cloudflare Workflows sinifi: D1 -> R2 yedekleme.
 *
 * Resmi desen (developers.cloudflare.com/workflows/examples/backup-d1):
 * D1 REST API export uc noktasi cagrilir, `signed_url` hazir olunca dump
 * dogrudan R2'ye akitilir. Workflows Free plana dahildir.
 *
 * Kota: 2 adim/calistirma (yeniden denemeler adim SAYILMAZ) -> gunluk 2 adim.
 */

import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { runD1Backup, type BackupEnv, type BackupResult } from "./backup-d1";

export interface BackupWorkflowEnv extends BackupEnv {
  BACKUP_WORKFLOW: Workflow;
}

export class BackupWorkflow extends WorkflowEntrypoint<BackupWorkflowEnv> {
  override async run(_event: WorkflowEvent<unknown>, step: WorkflowStep): Promise<BackupResult> {
    return runD1Backup(this.env, step);
  }
}
