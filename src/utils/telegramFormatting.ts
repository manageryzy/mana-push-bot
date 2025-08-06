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

/**
 * Telegram message length constants
 */
export const TELEGRAM_MESSAGE_LIMIT = 4096;
export const SAFE_MESSAGE_LIMIT = 4000; // Leave some buffer for safety

/**
 * Split a message into parts that fit within Telegram's message limit
 */
export function splitMessage(
  text: string,
  maxLength: number = SAFE_MESSAGE_LIMIT
): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const parts: string[] = [];
  let currentPart = '';
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineWithNewline = i === 0 ? line : '\n' + line;

    // If adding this line would exceed the limit
    if (currentPart.length + lineWithNewline.length > maxLength) {
      // If we have accumulated content, save it as a part
      if (currentPart.length > 0) {
        parts.push(currentPart);
        currentPart = line;
      } else {
        // Single line is too long, need to split it
        const splitLine = splitLongLine(line, maxLength);
        parts.push(...splitLine.slice(0, -1));
        currentPart = splitLine[splitLine.length - 1];
      }
    } else {
      currentPart += lineWithNewline;
    }
  }

  // Add the last part if it has content
  if (currentPart.length > 0) {
    parts.push(currentPart);
  }

  return parts;
}

/**
 * Split a single long line into multiple parts
 */
function splitLongLine(line: string, maxLength: number): string[] {
  if (line.length <= maxLength) {
    return [line];
  }

  const parts: string[] = [];
  let remaining = line;

  while (remaining.length > maxLength) {
    // Try to find a good break point (space, comma, etc.)
    let breakPoint = maxLength;
    const searchEnd = Math.min(maxLength, remaining.length);

    for (let i = searchEnd - 1; i >= Math.max(0, searchEnd - 100); i--) {
      const char = remaining[i];
      if (char === ' ' || char === ',' || char === ';' || char === '.') {
        breakPoint = i + 1;
        break;
      }
    }

    parts.push(remaining.substring(0, breakPoint));
    remaining = remaining.substring(breakPoint);
  }

  if (remaining.length > 0) {
    parts.push(remaining);
  }

  return parts;
}

/**
 * Add continuation indicators to message parts
 */
export function addContinuationIndicators(parts: string[]): string[] {
  if (parts.length <= 1) {
    return parts;
  }

  return parts.map((part, index) => {
    const partNumber = index + 1;
    const totalParts = parts.length;

    if (index === 0) {
      return `${part}\n\n<i>📄 Continued in part ${partNumber + 1}/${totalParts}...</i>`;
    } else if (index === parts.length - 1) {
      return `<i>📄 Part ${partNumber}/${totalParts} (continued from above)</i>\n\n${part}`;
    } else {
      return `<i>📄 Part ${partNumber}/${totalParts} (continued)</i>\n\n${part}\n\n<i>📄 Continued in part ${partNumber + 1}/${totalParts}...</i>`;
    }
  });
}
