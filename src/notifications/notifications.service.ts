import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as nodemailer from 'nodemailer';

interface SlackMessage {
  channel?: string;
  text: string;
  blocks?: any[];
}

interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  async sendSlack(message: SlackMessage): Promise<void> {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) {
      this.logger.warn('SLACK_WEBHOOK_URL not configured, skipping Slack notification');
      return;
    }

    try {
      await axios.post(webhookUrl, {
        channel: message.channel,
        text: message.text,
        blocks: message.blocks,
      });
    } catch (err) {
      this.logger.error(`Slack notification failed: ${err.message}`);
    }
  }

  async sendEmail(message: EmailMessage): Promise<void> {
    const host = process.env.SMTP_HOST;
    if (!host) {
      this.logger.warn('SMTP_HOST not configured, skipping email notification');
      return;
    }

    try {
      const transporter = nodemailer.createTransport({
        host,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      await transporter.sendMail({
        from: process.env.FROM_EMAIL || 'DevCollab <noreply@devcollab.local>',
        to: message.to,
        subject: message.subject,
        html: message.html,
      });
    } catch (err) {
      this.logger.error(`Email notification failed: ${err.message}`);
    }
  }

  // Convenience methods for each channel
  async notifyPlanCreated(planId: string, planTitle: string, createdBy: string): Promise<void> {
    await this.sendSlack({
      channel: process.env.SLACK_CHANNEL_PLANS,
      text: `📋 New plan created: *${planTitle}* (${planId}) by *${createdBy}*`,
    });
  }

  async notifyPlanExecuted(planId: string, planTitle: string, executor: string): Promise<void> {
    await this.sendSlack({
      channel: process.env.SLACK_CHANNEL_DEV,
      text: `🚀 Plan *${planTitle}* (${planId}) is now IN_PROGRESS — locked by *${executor}*`,
    });
  }

  async notifyPlanSubmitted(planId: string, planTitle: string, executor: string): Promise<void> {
    await this.sendSlack({
      channel: process.env.SLACK_CHANNEL_REVIEW,
      text: `👀 Plan *${planTitle}* (${planId}) submitted for review by *${executor}*`,
    });
  }

  async notifyPlanApproved(planId: string, planTitle: string, executor: string): Promise<void> {
    await this.sendSlack({
      channel: process.env.SLACK_CHANNEL_REVIEW,
      text: `✅ Plan *${planTitle}* (${planId}) approved and merged to preview. QA: please test. Executor: *${executor}*`,
    });
  }

  async notifyPlanRejected(
    planId: string,
    planTitle: string,
    executor: string,
    reason: string,
  ): Promise<void> {
    await this.sendSlack({
      channel: process.env.SLACK_CHANNEL_REVIEW,
      text: `❌ Plan *${planTitle}* (${planId}) rejected. Reason: ${reason}. Executor: *${executor}* — please fix and resubmit.`,
    });
  }

  async notifyMergedToPreview(planId: string, planTitle: string): Promise<void> {
    await this.sendSlack({
      channel: process.env.SLACK_CHANNEL_QA,
      text: `🧪 Feature *${planTitle}* (${planId}) merged to preview — ready for QA testing`,
    });
  }

  async notifyBugRaised(
    bugPlanId: string,
    bugTitle: string,
    parentPlanId: string,
    executor: string,
  ): Promise<void> {
    await this.sendSlack({
      channel: process.env.SLACK_CHANNEL_BUGS,
      text: `🐛 Bug raised on *${parentPlanId}*: *${bugTitle}* (${bugPlanId}). Assigned to: *${executor}*`,
    });
  }

  async notifyQaSignedOff(planId: string, planTitle: string, qaEngineer: string): Promise<void> {
    await this.sendSlack({
      channel: process.env.SLACK_CHANNEL_RELEASES,
      text: `🎉 QA signed off on *${planTitle}* (${planId}) by *${qaEngineer}* — ready for production release`,
    });
  }

  async notifyQaRejected(
    planId: string,
    planTitle: string,
    reason: string,
    rejectionCount: number,
    pmEmail?: string,
    tlEmail?: string,
  ): Promise<void> {
    await this.sendSlack({
      channel: process.env.SLACK_CHANNEL_QA,
      text: `⚠️ QA rejected *${planTitle}* (${planId}) — rejection #${rejectionCount}. Reason: ${reason}`,
    });

    if (rejectionCount >= 2 && pmEmail) {
      await this.sendEmail({
        to: pmEmail,
        subject: `[DevCollab] QA Alert: ${planTitle} rejected ${rejectionCount} time(s)`,
        html: `<p>Plan <strong>${planTitle}</strong> (${planId}) has been rejected by QA ${rejectionCount} time(s).</p><p>Reason: ${reason}</p><p>Please review and take action.</p>`,
      });
    }

    if (rejectionCount >= 3 && tlEmail) {
      await this.sendEmail({
        to: tlEmail,
        subject: `[URGENT] [DevCollab] QA 3rd Rejection: ${planTitle}`,
        html: `<p><strong>URGENT:</strong> Plan <strong>${planTitle}</strong> (${planId}) has been rejected by QA 3 times.</p><p>Reason: ${reason}</p><p>Decision needed: reassign, rewrite plan, or close as WONTFIX.</p>`,
      });
    }
  }

  async notifyPrCreated(planIds: string[], prUrl: string): Promise<void> {
    await this.sendSlack({
      channel: process.env.SLACK_CHANNEL_RELEASES,
      text: `🔀 PR to main created for plans: ${planIds.join(', ')} — ${prUrl}`,
    });
  }

  async notifyMergedToProduction(planIds: string[]): Promise<void> {
    await this.sendSlack({
      channel: process.env.SLACK_CHANNEL_RELEASES,
      text: `🚢 Deployed to production! Plans: ${planIds.join(', ')}`,
    });
  }

  async notifyLockExpired(planId: string, planTitle: string, executor: string): Promise<void> {
    await this.sendSlack({
      channel: process.env.SLACK_CHANNEL_DEV,
      text: `⏰ Lock expired on *${planTitle}* (${planId}) — was locked by *${executor}*. Plan back to READY.`,
    });
  }

  async notifyConflictDetected(
    planId: string,
    planTitle: string,
    conflictingFiles: string[],
  ): Promise<void> {
    await this.sendSlack({
      channel: process.env.SLACK_CHANNEL_DEV,
      text: `⚡ Merge conflict detected on *${planTitle}* (${planId})! Conflicting files: ${conflictingFiles.join(', ')}. Senior Dev action required.`,
    });
  }

  async notifyRollback(planId: string, planTitle: string, executedBy: string): Promise<void> {
    await this.sendSlack({
      channel: process.env.SLACK_CHANNEL_INCIDENTS,
      text: `🔄 Preview rolled back — feature *${planTitle}* (${planId}) reverted by *${executedBy}*`,
    });
  }

  async notifyHotfixCreated(planId: string, planTitle: string, createdBy: string): Promise<void> {
    await this.sendSlack({
      channel: process.env.SLACK_CHANNEL_INCIDENTS,
      text: `🚨 HOTFIX created: *${planTitle}* (${planId}) by *${createdBy}* — immediate action required`,
    });
  }
}
