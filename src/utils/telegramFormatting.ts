/**
 * Utility functions for Telegram formatting
 */

/**
 * Escapes special characters for MarkdownV2 format
 * Special characters that need escaping: _*[]()~`>#+-=|{}.!
 */
export function escapeMarkdownV2(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

/**
 * Creates a bold text in MarkdownV2 format
 */
export function bold(text: string): string {
  return `*${escapeMarkdownV2(text)}*`;
}

/**
 * Creates an italic text in MarkdownV2 format
 */
export function italic(text: string): string {
  return `_${escapeMarkdownV2(text)}_`;
}

/**
 * Creates a code block in MarkdownV2 format
 */
export function code(text: string): string {
  return `\`${text.replace(/`/g, '\\`')}\``;
}

/**
 * Creates a pre-formatted code block in MarkdownV2 format
 */
export function pre(text: string, language?: string): string {
  const escapedText = text.replace(/```/g, '\\```');
  return language
    ? `\`\`\`${language}\n${escapedText}\n\`\`\``
    : `\`\`\`\n${escapedText}\n\`\`\``;
}

/**
 * Escapes a URL for MarkdownV2 format
 */
export function escapeUrl(url: string): string {
  return url.replace(/[)\\]/g, '\\$&');
}

/**
 * Creates a link in MarkdownV2 format
 */
export function link(text: string, url: string): string {
  return `[${escapeMarkdownV2(text)}](${escapeUrl(url)})`;
}
