import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class PlanAiService {
  private readonly logger = new Logger(PlanAiService.name);
  private genAI: GoogleGenerativeAI;

  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
  }

  async generatePlanContent(params: {
    type: string;
    title: string;
    description?: string;
    reposAffected?: string[];
  }): Promise<{
    goal: string;
    background: string;
    implementationSteps: string;
    claudeInstructions: string;
    acceptanceCriteria: { text: string; checked: boolean }[];
    qaTestCases: { text: string; checked: boolean }[];
    estimatedHours: number;
  }> {
    const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const repoContext = params.reposAffected?.length
      ? `\nRepos involved: ${params.reposAffected.join(', ')}`
      : '';

    const prompt = `You are a senior software engineer creating a detailed implementation plan for a development task.

Plan Type: ${params.type}
Title: ${params.title}
${params.description ? `Description: ${params.description}` : ''}${repoContext}

Generate a comprehensive implementation plan in JSON format with these exact fields:
{
  "goal": "1-2 sentence clear objective of what this plan achieves",
  "background": "2-3 paragraphs of context, why this is needed, current state vs desired state, any relevant technical context",
  "implementationSteps": "Detailed numbered markdown list of implementation steps. Be specific - mention actual files, functions, patterns to use. Each step should be actionable.",
  "claudeInstructions": "Specific instructions for Claude Code AI assistant. Include: what files to look at first, coding patterns to follow, things to avoid, how to verify the implementation works. Write as direct instructions to Claude.",
  "acceptanceCriteria": ["criterion 1", "criterion 2", "criterion 3", "criterion 4", "criterion 5"],
  "qaTestCases": ["test case 1", "test case 2", "test case 3"],
  "estimatedHours": 4
}

Be specific and technical. The implementationSteps should be detailed enough that a developer can follow them without asking questions. Return ONLY valid JSON, no markdown code blocks.`;

    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();

      // Strip markdown code blocks if present
      const clean = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
      const parsed = JSON.parse(clean);

      return {
        goal: parsed.goal || '',
        background: parsed.background || '',
        implementationSteps: parsed.implementationSteps || '',
        claudeInstructions: parsed.claudeInstructions || '',
        acceptanceCriteria: (parsed.acceptanceCriteria || []).map((t: string) => ({ text: t, checked: false })),
        qaTestCases: (parsed.qaTestCases || []).map((t: string) => ({ text: t, checked: false })),
        estimatedHours: parsed.estimatedHours || 4,
      };
    } catch (err) {
      this.logger.error('AI generation failed:', err.message);
      throw new Error('Failed to generate plan content: ' + err.message);
    }
  }
}
