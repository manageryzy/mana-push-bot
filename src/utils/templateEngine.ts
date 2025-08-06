/**
 * Template engine wrapper using Handlebars.js
 * Provides AlertManager message formatting with a professional template engine
 */

import Handlebars from 'handlebars';

export interface TemplateContext {
  [key: string]: any;
}

export class TemplateEngine {
  private handlebars: typeof Handlebars;

  constructor() {
    this.handlebars = Handlebars.create();
    this.registerHelpers();
  }

  /**
   * Render a template with the given context using Handlebars
   */
  render(template: string, context: TemplateContext): string {
    try {
      const compiledTemplate = this.handlebars.compile(template);
      return compiledTemplate(context);
    } catch (error) {
      throw new Error(
        `Template rendering failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Register custom helper functions for AlertManager templates
   */
  private registerHelpers(): void {
    // Date formatting helper
    this.handlebars.registerHelper(
      'formatDate',
      (dateStr: string, format?: string) => {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) {
          return dateStr;
        }

        if (format === 'short') {
          return date.toLocaleDateString();
        } else if (format === 'time') {
          return date.toLocaleTimeString();
        } else {
          return date.toLocaleString();
        }
      }
    );

    // HTML escaping helper
    this.handlebars.registerHelper('escapeHtml', (text: string) => {
      return new this.handlebars.SafeString(
        text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;')
      );
    });

    // Array join helper
    this.handlebars.registerHelper(
      'join',
      (array: any[], separator: string = ', ') => {
        if (!Array.isArray(array)) {
          return '';
        }
        return array.join(separator);
      }
    );

    // Array length helper
    this.handlebars.registerHelper('length', (array: any[]) => {
      if (!Array.isArray(array)) {
        return 0;
      }
      return array.length;
    });

    // Text truncation helper
    this.handlebars.registerHelper(
      'truncate',
      (text: string, maxLength: number) => {
        if (text.length <= maxLength) {
          return text;
        }
        return text.slice(0, maxLength - 3) + '...';
      }
    );

    // Math helpers
    this.handlebars.registerHelper('add', (a: number, b: number) => a + b);
    this.handlebars.registerHelper('subtract', (a: number, b: number) => a - b);
    this.handlebars.registerHelper('multiply', (a: number, b: number) => a * b);
    this.handlebars.registerHelper('divide', (a: number, b: number) =>
      b !== 0 ? a / b : 0
    );

    // Index increment helper (since Handlebars @index is 0-based)
    this.handlebars.registerHelper('inc', (value: number) => value + 1);

    // Conditional equality helper
    this.handlebars.registerHelper('eq', (a: any, b: any) => a === b);
    this.handlebars.registerHelper('ne', (a: any, b: any) => a !== b);
    this.handlebars.registerHelper('and', (a: any, b: any) => a && b);
    this.handlebars.registerHelper('or', (a: any, b: any) => a || b);
    this.handlebars.registerHelper('not', (a: any) => !a);

    // Status emoji helper
    this.handlebars.registerHelper('statusEmoji', (status: string) => {
      return status === 'resolved' ? '✅' : '🚨';
    });

    // Status text helper
    this.handlebars.registerHelper('statusText', (status: string) => {
      return status === 'resolved' ? 'RESOLVED' : 'FIRING';
    });
  }
}

// Singleton instance for global use
export const templateEngine = new TemplateEngine();
