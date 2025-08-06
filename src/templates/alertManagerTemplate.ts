/**
 * Handlebars AlertManager message templates
 * Using professional Handlebars.js template engine
 */

export const FULL_ALERTMANAGER_TEMPLATE = `{{statusEmoji status}} <b>[{{statusText status}}:{{length alerts}}]</b> - {{receiver}}

{{#if filteredCommonLabels}}
<b>Common Labels:</b>
{{#each filteredCommonLabels}}• {{key}}: <code>{{value}}</code>
{{/each}}

{{/if}}
{{#each alerts}}{{#if @index}}
---

{{/if}}<b>Alert {{inc @index}}:</b> {{alertName}}
<b>Status:</b> {{status}}
{{#if uniqueLabels}}
<b>Unique Labels:</b>
{{#each uniqueLabels}}• {{key}}: <code>{{value}}</code>
{{/each}}
{{/if}}
{{#if filteredAnnotations}}
<b>Annotations:</b>
{{#each filteredAnnotations}}• {{key}}: {{value}}
{{/each}}
{{/if}}<b>Started:</b> {{formatDate startsAt}}
{{#if showResolvedTime}}<b>Resolved:</b> {{formatDate endsAt}}
{{/if}}
{{#if generatorURL}}<b>Source:</b> <a href="{{generatorURL}}">View Alert</a>
{{/if}}
{{/each}}
{{#if showExternalURL}}

<b>AlertManager:</b> <a href="{{externalURL}}">View Dashboard</a>
{{/if}}`;

export const DEFAULT_ALERTMANAGER_TEMPLATE = `{{statusEmoji status}} <b>[{{statusText status}}:{{length alerts}}]</b> - {{receiver}}
{{#each alerts}}{{#if @index}}
---

{{/if}}<b>Alert {{inc @index}}:</b> {{alertName}}
<b>Status:</b> {{status}}
{{#if uniqueLabels}}
<b>Unique Labels:</b>
{{#each uniqueLabels}}• {{key}}: <code>{{value}}</code>{{/each}}
{{/if}}{{#if filteredAnnotations}}<b>Annotations:</b>
{{#each filteredAnnotations}}• {{key}}: {{value}}
{{/each}}{{/if}}<b>Started:</b> {{formatDate startsAt}}{{#if showResolvedTime}}<b>Resolved:</b> {{formatDate endsAt}}{{/if}}
{{#if generatorURL}}<b>Source:</b> <a href="{{generatorURL}}">View Alert</a>{{/if}}
{{/each}}`;

export interface AlertManagerTemplateContext {
  status: string;
  receiver: string;
  alerts: Array<{
    status: string;
    labels: Record<string, string>;
    annotations: Record<string, string>;
    startsAt: string;
    endsAt: string;
    generatorURL?: string;
    fingerprint?: string;
    alertName?: string;
    showResolvedTime?: boolean;
    uniqueLabels?: Array<{ key: string; value: string }> | undefined;
    filteredAnnotations?: Array<{ key: string; value: string }> | undefined;
  }>;
  commonLabels: Record<string, string>;
  filteredCommonLabels?: Array<{ key: string; value: string }> | undefined;
  externalURL?: string;
  showExternalURL?: boolean;
}
